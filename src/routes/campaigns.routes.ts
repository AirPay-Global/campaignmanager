import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import { campaignEngine } from '../engines/campaign.engine';
import { deliveryService } from '../services/delivery.service';
import { auditService } from '../services/audit.service';

const router = Router();

// All campaign routes require authentication
router.use(authMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// GET /campaigns
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const page = Number(req.query['page'] ?? '1');
    const limit = Math.min(Number(req.query['limit'] ?? '20'), 100);
    const status = req.query['status'] as string | undefined;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('campaigns')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('Failed to list campaigns', { error: error.message });
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
      return;
    }

    res.json({
      data,
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  }),
);

// GET /campaigns/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Not Found', message: 'Campaign not found' });
      return;
    }

    res.json(data);
  }),
);

// POST /campaigns
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const userId = req.user!.sub;
    const body = req.body as {
      name?: string;
      description?: string;
      channel?: string;
      segment_id?: string;
      template_name?: string;
      template_vars?: Record<string, string>;
      message_body?: string;
      subject?: string;
      from_name?: string;
      scheduled_at?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.name || !body.channel) {
      res.status(400).json({ error: 'Bad Request', message: 'name and channel are required' });
      return;
    }

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        org_id: orgId,
        name: body.name,
        description: body.description ?? null,
        channel: body.channel,
        status: body.scheduled_at ? 'scheduled' : 'draft',
        segment_id: body.segment_id ?? null,
        template_name: body.template_name ?? null,
        template_vars: body.template_vars ?? {},
        message_body: body.message_body ?? null,
        subject: body.subject ?? null,
        from_name: body.from_name ?? null,
        scheduled_at: body.scheduled_at ?? null,
        metadata: body.metadata ?? {},
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create campaign', { error: error.message });
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
      return;
    }

    await auditService.log(orgId, userId, 'campaign.created', 'campaign', data.id as string, {
      name: body.name,
      channel: body.channel,
    });

    res.status(201).json(data);
  }),
);

// PATCH /campaigns/:id
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const userId = req.user!.sub;
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;

    // Verify campaign belongs to org
    const { data: existing, error: fetchError } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (fetchError || !existing) {
      res.status(404).json({ error: 'Not Found', message: 'Campaign not found' });
      return;
    }

    if (['running', 'completed'].includes(existing.status as string)) {
      res.status(409).json({
        error: 'Conflict',
        message: `Cannot edit a campaign with status: ${existing.status}`,
      });
      return;
    }

    // Remove immutable fields
    const allowedFields = [
      'name', 'description', 'segment_id', 'template_name', 'template_vars',
      'message_body', 'subject', 'from_name', 'scheduled_at', 'metadata',
    ];
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    if (updateData['scheduled_at'] && existing.status === 'draft') {
      updateData['status'] = 'scheduled';
    }

    const { data, error } = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
      return;
    }

    await auditService.log(orgId, userId, 'campaign.updated', 'campaign', id, { changes: updateData });

    res.json(data);
  }),
);

// DELETE /campaigns/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const { id } = req.params;

    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) {
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
      return;
    }

    res.status(204).send();
  }),
);

// POST /campaigns/:id/launch
router.post(
  '/:id/launch',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const userId = req.user!.sub;
    const { id } = req.params;

    // Verify ownership
    const { data: campaign, error: fetchError } = await supabase
      .from('campaigns')
      .select('id, org_id')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (fetchError || !campaign) {
      res.status(404).json({ error: 'Not Found', message: 'Campaign not found' });
      return;
    }

    const result = await campaignEngine.launch(id, userId);

    res.json({ success: true, enqueued: result.enqueued });
  }),
);

// POST /campaigns/:id/pause
router.post(
  '/:id/pause',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const userId = req.user!.sub;
    const { id } = req.params;

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (!campaign) {
      res.status(404).json({ error: 'Not Found', message: 'Campaign not found' });
      return;
    }

    await campaignEngine.pause(id, userId);

    res.json({ success: true });
  }),
);

// GET /campaigns/stats — dashboard summary
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;

    const [campaignsRes, msgsRes] = await Promise.all([
      supabase.from('campaigns').select('id, status', { count: 'exact' }).eq('org_id', orgId),
      supabase.from('outbound_messages').select('status, created_at').eq('org_id', orgId).gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const campaigns = (campaignsRes.data ?? []) as Array<{ id: string; status: string }>;
    const msgs = (msgsRes.data ?? []) as Array<{ status: string; created_at: string }>;
    const todayStr = new Date().toISOString().split('T')[0];

    const activeCampaigns = campaigns.filter(c => ['running', 'active'].includes(c.status)).length;
    const sentToday = msgs.filter(m => m.created_at?.startsWith(todayStr)).length;
    const delivered = msgs.filter(m => ['delivered', 'read'].includes(m.status)).length;
    const failed = msgs.filter(m => m.status === 'failed').length;
    const deliveryRate = msgs.length > 0 ? Math.round((delivered / msgs.length) * 100) : 0;

    res.json({ activeCampaigns, sentToday, totalMessages30d: msgs.length, delivered, failed, deliveryRate });
  }),
);

// GET /campaigns/:id/analytics
router.get(
  '/:id/analytics',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const { id } = req.params;

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (!campaign) {
      res.status(404).json({ error: 'Not Found', message: 'Campaign not found' });
      return;
    }

    const stats = await deliveryService.getCampaignStats(id);

    res.json(stats);
  }),
);

export default router;
