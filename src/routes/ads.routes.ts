import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { authMiddleware } from '../middleware/auth.middleware';
import { logger } from '../lib/logger';
import { segmentService } from '../services/segment.service';
import {
  createMetaAudience,
  syncContactsToMetaAudience,
  deleteMetaAudience,
} from '../adapters/meta-ads.adapter';
import { syncContactsToGoogleAudience } from '../adapters/google-ads.adapter';

const router = Router();
router.use(authMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// GET /ads/audiences
router.get('/audiences', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { data, error } = await supabase
    .from('ad_audiences')
    .select('*, audience_segments!segment_id(id, name, contact_count)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data: data ?? [] });
}));

// POST /ads/audiences
router.post('/audiences', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const userId = req.user!.sub;
  const body = req.body as {
    name?: string;
    description?: string;
    platform?: 'meta' | 'google';
    segment_id?: string;
  };

  if (!body.name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }
  if (!body.platform || !['meta', 'google'].includes(body.platform)) {
    res.status(400).json({ error: 'platform must be "meta" or "google"' }); return;
  }

  // Verify segment ownership if provided
  if (body.segment_id) {
    const { data: seg } = await supabase.from('audience_segments').select('id').eq('id', body.segment_id).eq('org_id', orgId).single();
    if (!seg) { res.status(400).json({ error: 'segment_id not found in this org' }); return; }
  }

  // Create on the ad platform
  let platformAudienceId: string | null = null;
  try {
    if (body.platform === 'meta') {
      const result = await createMetaAudience(body.name.trim(), body.description);
      platformAudienceId = result.id;
    }
  } catch (err) {
    res.status(502).json({ error: 'Platform error', message: (err as Error).message }); return;
  }

  const { data, error } = await supabase
    .from('ad_audiences')
    .insert({
      org_id: orgId,
      name: body.name.trim(),
      description: body.description ?? null,
      platform: body.platform,
      platform_audience_id: platformAudienceId,
      segment_id: body.segment_id ?? null,
      status: platformAudienceId ? 'active' : 'pending',
      created_by: userId,
    })
    .select()
    .single();

  if (error || !data) { res.status(500).json({ error: error?.message }); return; }
  res.status(201).json(data);
}));

// GET /ads/audiences/:id
router.get('/audiences/:id', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { data, error } = await supabase
    .from('ad_audiences')
    .select('*, audience_segments!segment_id(id, name, contact_count)')
    .eq('id', req.params['id']!)
    .eq('org_id', orgId)
    .single();

  if (error || !data) { res.status(404).json({ error: 'Not Found' }); return; }
  res.json(data);
}));

// PATCH /ads/audiences/:id
router.patch('/audiences/:id', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const body = req.body as Record<string, unknown>;
  const allowed = ['name', 'description', 'segment_id'];
  const update: Record<string, unknown> = {};
  for (const k of allowed) { if (k in body) update[k] = body[k]; }

  const { data, error } = await supabase
    .from('ad_audiences')
    .update(update)
    .eq('id', req.params['id']!)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error || !data) { res.status(404).json({ error: error?.message ?? 'Not Found' }); return; }
  res.json(data);
}));

// DELETE /ads/audiences/:id
router.delete('/audiences/:id', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;

  const { data: audience } = await supabase
    .from('ad_audiences')
    .select('*')
    .eq('id', req.params['id']!)
    .eq('org_id', orgId)
    .single();

  if (!audience) { res.status(404).json({ error: 'Not Found' }); return; }

  // Attempt to delete from platform (non-fatal)
  if (audience.platform === 'meta' && audience.platform_audience_id) {
    try { await deleteMetaAudience(audience.platform_audience_id as string); }
    catch (err) { logger.warn('Failed to delete Meta audience', { error: (err as Error).message }); }
  }

  await supabase.from('ad_audiences').delete().eq('id', req.params['id']!).eq('org_id', orgId);
  res.status(204).send();
}));

// POST /ads/audiences/:id/sync — push segment contacts to platform audience
router.post('/audiences/:id/sync', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;

  const { data: audience, error: fetchErr } = await supabase
    .from('ad_audiences')
    .select('*')
    .eq('id', req.params['id']!)
    .eq('org_id', orgId)
    .single();

  if (fetchErr || !audience) { res.status(404).json({ error: 'Not Found' }); return; }
  if (!audience.platform_audience_id) {
    res.status(400).json({ error: 'Audience has no platform ID — it may not have been created successfully' }); return;
  }
  if (!audience.segment_id) {
    res.status(400).json({ error: 'No segment linked to this audience. Attach a segment first.' }); return;
  }

  // Mark as syncing
  await supabase.from('ad_audiences').update({ status: 'syncing' }).eq('id', audience.id);

  try {
    const contacts = await segmentService.resolveSegment(orgId, audience.segment_id as string);
    const replace = Boolean(req.body?.replace ?? true);

    let syncCount = 0;

    if (audience.platform === 'meta') {
      const result = await syncContactsToMetaAudience(
        audience.platform_audience_id as string,
        contacts,
        replace,
      );
      syncCount = result.num_received;
    } else if (audience.platform === 'google') {
      const result = await syncContactsToGoogleAudience(
        audience.platform_audience_id as string,
        contacts,
      );
      syncCount = result.uploaded;
    }

    await supabase.from('ad_audiences').update({
      status: 'active',
      last_synced_at: new Date().toISOString(),
      last_sync_count: syncCount,
      last_sync_error: null,
    }).eq('id', audience.id);

    res.json({ success: true, synced: syncCount, total_contacts: contacts.length });
  } catch (err) {
    const msg = (err as Error).message;
    await supabase.from('ad_audiences').update({
      status: 'error',
      last_sync_error: msg,
    }).eq('id', audience.id);
    res.status(502).json({ error: 'Sync failed', message: msg });
  }
}));

export default router;
