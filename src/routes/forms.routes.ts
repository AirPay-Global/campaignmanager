import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

const ALLOWED_FIELD_TYPES = ['text', 'email', 'phone', 'textarea', 'select', 'checkbox'];

function validateRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// GET /forms
router.get('/', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;

  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data: data ?? [] });
}));

// POST /forms
router.post('/', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const userId = req.user!.sub;
  const body = req.body as {
    name?: string;
    description?: string;
    fields?: Array<{ id: string; type: string; label: string; required?: boolean; placeholder?: string; options?: string[] }>;
    success_message?: string;
    redirect_url?: string;
    tags_to_apply?: string[];
    workflow_id?: string;
  };

  if (!body.name?.trim()) {
    res.status(400).json({ error: 'name is required' }); return;
  }
  if (body.redirect_url && !validateRedirectUrl(body.redirect_url)) {
    res.status(400).json({ error: 'redirect_url must be a valid http/https URL' }); return;
  }
  if (body.fields) {
    for (const f of body.fields) {
      if (!ALLOWED_FIELD_TYPES.includes(f.type)) {
        res.status(400).json({ error: `Invalid field type: ${f.type}` }); return;
      }
    }
  }
  if (body.workflow_id) {
    const { data: wf } = await supabase.from('workflows').select('id').eq('id', body.workflow_id).eq('org_id', orgId).single();
    if (!wf) { res.status(400).json({ error: 'workflow_id not found in this org' }); return; }
  }

  const { data, error } = await supabase
    .from('forms')
    .insert({
      org_id: orgId,
      name: body.name.trim(),
      description: body.description ?? null,
      fields: body.fields ?? [],
      success_message: body.success_message ?? 'Thank you for your submission!',
      redirect_url: body.redirect_url ?? null,
      tags_to_apply: body.tags_to_apply ?? [],
      workflow_id: body.workflow_id ?? null,
      created_by: userId,
    })
    .select()
    .single();

  if (error || !data) { res.status(500).json({ error: error?.message }); return; }
  res.status(201).json(data);
}));

// GET /forms/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .eq('id', req.params['id']!)
    .eq('org_id', orgId)
    .single();

  if (error || !data) { res.status(404).json({ error: 'Not Found' }); return; }
  res.json(data);
}));

// PATCH /forms/:id
router.patch('/:id', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const body = req.body as Record<string, unknown>;

  if (body['redirect_url'] && !validateRedirectUrl(body['redirect_url'] as string)) {
    res.status(400).json({ error: 'redirect_url must be a valid http/https URL' }); return;
  }
  if (body['workflow_id']) {
    const { data: wf } = await supabase.from('workflows').select('id').eq('id', body['workflow_id'] as string).eq('org_id', orgId).single();
    if (!wf) { res.status(400).json({ error: 'workflow_id not found in this org' }); return; }
  }

  const allowed = ['name', 'description', 'fields', 'success_message', 'redirect_url', 'tags_to_apply', 'workflow_id', 'is_active'];
  const update: Record<string, unknown> = {};
  for (const key of allowed) { if (key in body) update[key] = body[key]; }

  const { data, error } = await supabase
    .from('forms')
    .update(update)
    .eq('id', req.params['id']!)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error || !data) { res.status(404).json({ error: error?.message ?? 'Not Found' }); return; }
  res.json(data);
}));

// DELETE /forms/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { error } = await supabase
    .from('forms')
    .delete()
    .eq('id', req.params['id']!)
    .eq('org_id', orgId);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
}));

// GET /forms/:id/submissions
router.get('/:id/submissions', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { id } = req.params;
  const page  = Number(req.query['page']  ?? '1');
  const limit = Math.min(Number(req.query['limit'] ?? '50'), 200);
  const offset = (page - 1) * limit;

  // Verify ownership
  const { data: form } = await supabase.from('forms').select('id').eq('id', id!).eq('org_id', orgId).single();
  if (!form) { res.status(404).json({ error: 'Not Found' }); return; }

  const { data, error, count } = await supabase
    .from('form_submissions')
    .select('*, contacts!contact_id(id, name, email, phone)', { count: 'exact' })
    .eq('form_id', id!)
    .order('submitted_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data: data ?? [], total: count ?? 0, page, totalPages: Math.ceil((count ?? 0) / limit) });
}));

export default router;
