import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import { mandateEngine } from '../engines/mandate.engine';
import { auditService } from '../services/audit.service';

const router = Router();

router.use(authMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// GET /mandates
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const channel = req.query['channel'] as string | undefined;
    const isActive = req.query['is_active'];

    let query = supabase
      .from('mandates')
      .select('*')
      .eq('org_id', orgId)
      .order('priority', { ascending: false });

    if (channel) query = query.eq('channel', channel);
    if (isActive !== undefined) query = query.eq('is_active', isActive === 'true');

    const { data, error } = await query;

    if (error) {
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
      return;
    }

    res.json({ data });
  }),
);

// GET /mandates/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('mandates')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Not Found', message: 'Mandate not found' });
      return;
    }

    res.json(data);
  }),
);

// POST /mandates
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const userId = req.user!.sub;
    const body = req.body as {
      name?: string;
      description?: string;
      channel?: string;
      trigger_keywords?: string[];
      trigger_regex?: string;
      match_all?: boolean;
      action_type?: string;
      action_config?: Record<string, unknown>;
      priority?: number;
      is_active?: boolean;
    };

    if (!body.name || !body.channel || !body.action_type) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'name, channel, and action_type are required',
      });
      return;
    }

    const { data, error } = await supabase
      .from('mandates')
      .insert({
        org_id: orgId,
        name: body.name,
        description: body.description ?? null,
        channel: body.channel,
        trigger_keywords: body.trigger_keywords ?? [],
        trigger_regex: body.trigger_regex ?? null,
        match_all: body.match_all ?? false,
        action_type: body.action_type,
        action_config: body.action_config ?? {},
        priority: body.priority ?? 0,
        is_active: body.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create mandate', { error: error.message });
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
      return;
    }

    await auditService.log(orgId, userId, 'mandate.created', 'mandate', data.id as string, {
      name: body.name,
      channel: body.channel,
      action_type: body.action_type,
    });

    res.status(201).json(data);
  }),
);

// PATCH /mandates/:id
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const userId = req.user!.sub;
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;

    const allowedFields = [
      'name', 'description', 'trigger_keywords', 'trigger_regex', 'match_all',
      'action_config', 'priority', 'is_active',
    ];
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) updateData[field] = body[field];
    }

    const { data, error } = await supabase
      .from('mandates')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        res.status(404).json({ error: 'Not Found', message: 'Mandate not found' });
      } else {
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
      }
      return;
    }

    await auditService.log(orgId, userId, 'mandate.updated', 'mandate', id, { changes: updateData });

    res.json(data);
  }),
);

// DELETE /mandates/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const userId = req.user!.sub;
    const { id } = req.params;

    const { error } = await supabase
      .from('mandates')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) {
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
      return;
    }

    await auditService.log(orgId, userId, 'mandate.deleted', 'mandate', id, {});

    res.status(204).send();
  }),
);

// POST /mandates/test — test mandate matching without sending
router.post(
  '/test',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const body = req.body as {
      text?: string;
      channel?: string;
    };

    if (!body.text || !body.channel) {
      res.status(400).json({ error: 'Bad Request', message: 'text and channel are required' });
      return;
    }

    const validChannels = ['whatsapp', 'sms', 'email', 'push'];
    if (!validChannels.includes(body.channel)) {
      res.status(400).json({
        error: 'Bad Request',
        message: `channel must be one of: ${validChannels.join(', ')}`,
      });
      return;
    }

    const matched = await mandateEngine.findMatchingMandate(
      orgId,
      body.channel as 'whatsapp' | 'sms' | 'email' | 'push',
      body.text,
    );

    res.json({
      matched: !!matched,
      mandate: matched ?? null,
    });
  }),
);

export default router;
