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

// GET /message-templates
router.get('/', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { channel } = req.query as Record<string, string>;

  let query = supabase
    .from('message_templates')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (channel) query = query.eq('channel', channel);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data: data ?? [] });
}));

// POST /message-templates
router.post('/', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const userId = req.user!.sub;
  const body = req.body as {
    name?: string;
    description?: string;
    channel?: string;
    subject?: string;
    body?: string;
    tags?: string[];
  };

  if (!body.name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }
  if (!body.channel || !['whatsapp','sms','email','push'].includes(body.channel)) {
    res.status(400).json({ error: 'channel must be whatsapp, sms, email, or push' }); return;
  }
  if (!body.body?.trim()) { res.status(400).json({ error: 'body is required' }); return; }

  const { data, error } = await supabase
    .from('message_templates')
    .insert({
      org_id: orgId,
      name: body.name.trim(),
      description: body.description ?? null,
      channel: body.channel,
      subject: body.subject ?? null,
      body: body.body.trim(),
      tags: body.tags ?? [],
      created_by: userId,
    })
    .select()
    .single();

  if (error || !data) { res.status(500).json({ error: error?.message }); return; }
  res.status(201).json(data);
}));

// POST /message-templates/bulk — seed multiple at once
router.post('/bulk', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const userId = req.user!.sub;
  const { templates } = req.body as { templates?: Array<Record<string, unknown>> };
  if (!Array.isArray(templates) || templates.length === 0) {
    res.status(400).json({ error: 'templates array is required' }); return;
  }

  const rows = templates.map(t => ({ ...t, org_id: orgId, created_by: userId }));
  const { data, error } = await supabase.from('message_templates').insert(rows).select();
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(201).json({ data: data ?? [], inserted: (data ?? []).length });
}));

// GET /message-templates/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('id', req.params['id']!)
    .eq('org_id', orgId)
    .single();

  if (error || !data) { res.status(404).json({ error: 'Not Found' }); return; }
  res.json(data);
}));

// PATCH /message-templates/:id
router.patch('/:id', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const body = req.body as Record<string, unknown>;
  const allowed = ['name', 'description', 'channel', 'subject', 'body', 'tags'];
  const update: Record<string, unknown> = {};
  for (const k of allowed) { if (k in body) update[k] = body[k]; }

  const { data, error } = await supabase
    .from('message_templates')
    .update(update)
    .eq('id', req.params['id']!)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error || !data) { res.status(404).json({ error: error?.message ?? 'Not Found' }); return; }
  res.json(data);
}));

// DELETE /message-templates/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  await supabase.from('message_templates').delete().eq('id', req.params['id']!).eq('org_id', orgId);
  res.status(204).send();
}));

export default router;
