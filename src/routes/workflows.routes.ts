import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { authMiddleware } from '../middleware/auth.middleware';
import { enrollContacts } from '../engines/workflow.engine';

const router = Router();
router.use(authMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// GET /workflows
router.get('/', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;

  const { data: workflows, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }

  // Attach step counts and enrollment stats
  const enriched = await Promise.all((workflows ?? []).map(async (wf) => {
    const [{ count: stepCount }, { count: activeCount }, { count: completedCount }] = await Promise.all([
      supabase.from('workflow_steps').select('*', { count: 'exact', head: true }).eq('workflow_id', wf.id),
      supabase.from('workflow_enrollments').select('*', { count: 'exact', head: true }).eq('workflow_id', wf.id).eq('status', 'active'),
      supabase.from('workflow_enrollments').select('*', { count: 'exact', head: true }).eq('workflow_id', wf.id).eq('status', 'completed'),
    ]);
    return { ...wf, step_count: stepCount ?? 0, active_enrollments: activeCount ?? 0, completed_enrollments: completedCount ?? 0 };
  }));

  res.json({ data: enriched });
}));

// POST /workflows
router.post('/', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const userId = req.user!.sub;
  const body = req.body as {
    name?: string;
    description?: string;
    trigger_type?: string;
    trigger_config?: Record<string, unknown>;
    steps?: Array<{ action_type: string; action_config: Record<string, unknown>; delay_hours?: number }>;
  };

  if (!body.name) { res.status(400).json({ error: 'name is required' }); return; }

  const { data: workflow, error } = await supabase
    .from('workflows')
    .insert({
      org_id: orgId,
      name: body.name,
      description: body.description ?? null,
      trigger_type: body.trigger_type ?? 'manual',
      trigger_config: body.trigger_config ?? {},
      is_active: false,
      created_by: userId,
    })
    .select()
    .single();

  if (error || !workflow) { res.status(500).json({ error: error?.message }); return; }

  // Insert steps if provided
  if (body.steps?.length) {
    const stepsToInsert = body.steps.map((s, i) => ({
      workflow_id: workflow.id,
      org_id: orgId,
      step_order: i + 1,
      action_type: s.action_type,
      action_config: s.action_config,
      delay_hours: s.delay_hours ?? 0,
    }));
    await supabase.from('workflow_steps').insert(stepsToInsert);
  }

  res.status(201).json(workflow);
}));

// GET /workflows/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { id } = req.params;

  const [{ data: workflow }, { data: steps }] = await Promise.all([
    supabase.from('workflows').select('*').eq('id', id).eq('org_id', orgId).single(),
    supabase.from('workflow_steps').select('*').eq('workflow_id', id).order('step_order', { ascending: true }),
  ]);

  if (!workflow) { res.status(404).json({ error: 'Not Found' }); return; }
  res.json({ ...workflow, steps: steps ?? [] });
}));

// PATCH /workflows/:id
router.patch('/:id', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { id } = req.params;
  const body = req.body as Record<string, unknown>;

  const allowed = ['name', 'description', 'trigger_type', 'trigger_config', 'is_active'];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  const { data, error } = await supabase
    .from('workflows').update(update).eq('id', id).eq('org_id', orgId).select().single();

  if (error || !data) { res.status(404).json({ error: error?.message ?? 'Not Found' }); return; }
  res.json(data);
}));

// DELETE /workflows/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { error } = await supabase.from('workflows').delete().eq('id', req.params['id']!).eq('org_id', orgId);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
}));

// PUT /workflows/:id/steps — replace all steps
router.put('/:id/steps', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { id } = req.params;
  const { steps } = req.body as {
    steps: Array<{ action_type: string; action_config: Record<string, unknown>; delay_hours?: number }>;
  };

  if (!Array.isArray(steps)) { res.status(400).json({ error: 'steps array is required' }); return; }

  // Verify ownership
  const { data: wf } = await supabase.from('workflows').select('id').eq('id', id).eq('org_id', orgId).single();
  if (!wf) { res.status(404).json({ error: 'Not Found' }); return; }

  await supabase.from('workflow_steps').delete().eq('workflow_id', id);

  if (steps.length > 0) {
    const toInsert = steps.map((s, i) => ({
      workflow_id: id,
      org_id: orgId,
      step_order: i + 1,
      action_type: s.action_type,
      action_config: s.action_config ?? {},
      delay_hours: s.delay_hours ?? 0,
    }));
    await supabase.from('workflow_steps').insert(toInsert);
  }

  const { data: newSteps } = await supabase
    .from('workflow_steps').select('*').eq('workflow_id', id).order('step_order', { ascending: true });

  res.json({ steps: newSteps ?? [] });
}));

// GET /workflows/:id/enrollments
router.get('/:id/enrollments', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { id } = req.params;
  const status = req.query['status'] as string | undefined;

  let query = supabase
    .from('workflow_enrollments')
    .select('*, contacts!contact_id(id, name, email, phone)')
    .eq('workflow_id', id)
    .eq('org_id', orgId)
    .order('enrolled_at', { ascending: false })
    .limit(50);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data: data ?? [] });
}));

// POST /workflows/:id/enroll
router.post('/:id/enroll', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { id } = req.params;
  const { contact_ids } = req.body as { contact_ids: string[] };

  if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
    res.status(400).json({ error: 'contact_ids array is required' }); return;
  }

  // Verify workflow ownership
  const { data: wf } = await supabase.from('workflows').select('id').eq('id', id).eq('org_id', orgId).single();
  if (!wf) { res.status(404).json({ error: 'Not Found' }); return; }

  const result = await enrollContacts(id, contact_ids, orgId);
  res.json(result);
}));

// DELETE /workflows/:id/enrollments/:enrollmentId
router.delete('/:id/enrollments/:enrollmentId', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  await supabase
    .from('workflow_enrollments')
    .update({ status: 'unenrolled' })
    .eq('id', req.params['enrollmentId']!)
    .eq('org_id', orgId);
  res.status(204).send();
}));

export default router;
