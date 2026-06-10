import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import { deliveryService } from '../services/delivery.service';
import { enqueue } from '../engines/queue.engine';

const router = Router();

router.use(authMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// GET /messages/inbound
router.get(
  '/inbound',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const page = Number(req.query['page'] ?? '1');
    const limit = Math.min(Number(req.query['limit'] ?? '50'), 200);
    const channel = req.query['channel'] as string | undefined;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('inbound_messages')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (channel) query = query.eq('channel', channel);

    const { data, error, count } = await query;

    if (error) {
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

// GET /messages/outbound
router.get(
  '/outbound',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const page = Number(req.query['page'] ?? '1');
    const limit = Math.min(Number(req.query['limit'] ?? '50'), 200);
    const channel = req.query['channel'] as string | undefined;
    const status = req.query['status'] as string | undefined;
    const campaignId = req.query['campaign_id'] as string | undefined;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('outbound_messages')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (channel) query = query.eq('channel', channel);
    if (status) query = query.eq('status', status);
    if (campaignId) query = query.eq('campaign_id', campaignId);

    const { data, error, count } = await query;

    if (error) {
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

// GET /messages/outbound/:id
router.get(
  '/outbound/:id',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const { id } = req.params;

    // Verify ownership
    const { data: message } = await supabase
      .from('outbound_messages')
      .select('id')
      .eq('id', id!)
      .eq('org_id', orgId)
      .single();

    if (!message) {
      res.status(404).json({ error: 'Not Found', message: 'Message not found' });
      return;
    }

    const status = await deliveryService.getMessageDeliveryStatus(id!);
    if (!status) {
      res.status(404).json({ error: 'Not Found', message: 'Message not found' });
      return;
    }

    res.json(status);
  }),
);

// POST /messages/send-bulk — send to multiple recipients
router.post(
  '/send-bulk',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const body = req.body as {
      channel?: string;
      recipients?: Array<{ recipient_id: string; contact_id?: string }>;
      body?: string;
      subject?: string;
      template_name?: string;
      template_vars?: Record<string, unknown>;
      language_code?: string;
      scheduled_at?: string;
    };

    if (!body.channel || !Array.isArray(body.recipients) || body.recipients.length === 0) {
      res.status(400).json({ error: 'Bad Request', message: 'channel and recipients[] are required' });
      return;
    }
    if (!body.body && !body.template_name) {
      res.status(400).json({ error: 'Bad Request', message: 'Either body or template_name is required' });
      return;
    }
    const validChannels = ['whatsapp', 'sms', 'email', 'push'];
    if (!validChannels.includes(body.channel)) {
      res.status(400).json({ error: 'Bad Request', message: `channel must be one of: ${validChannels.join(', ')}` });
      return;
    }

    const results: Array<{ recipient_id: string; messageId?: string; error?: string }> = [];
    for (const r of body.recipients) {
      try {
        const messageId = await enqueue({
          orgId,
          channel: body.channel as 'whatsapp' | 'sms' | 'email' | 'push',
          recipientId: r.recipient_id,
          body: body.body,
          subject: body.subject,
          templateName: body.template_name,
          templateVars: body.template_vars,
          languageCode: body.language_code,
          contactId: r.contact_id,
          scheduledAt: body.scheduled_at,
        });
        results.push({ recipient_id: r.recipient_id, messageId });
      } catch (err) {
        results.push({ recipient_id: r.recipient_id, error: (err as Error).message });
      }
    }

    const succeeded = results.filter(r => r.messageId).length;
    logger.info('Bulk messages enqueued', { orgId, total: results.length, succeeded, channel: body.channel });
    res.status(202).json({ success: true, total: results.length, succeeded, results });
  }),
);

// POST /messages/send — one-off message send
router.post(
  '/send',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const body = req.body as {
      channel?: string;
      recipient_id?: string;
      body?: string;
      subject?: string;
      template_name?: string;
      template_vars?: Record<string, unknown>;
      language_code?: string;
      contact_id?: string;
      scheduled_at?: string;
    };

    if (!body.channel || !body.recipient_id) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'channel and recipient_id are required',
      });
      return;
    }

    if (!body.body && !body.template_name) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Either body or template_name is required',
      });
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

    const messageId = await enqueue({
      orgId,
      channel: body.channel as 'whatsapp' | 'sms' | 'email' | 'push',
      recipientId: body.recipient_id,
      body: body.body,
      subject: body.subject,
      templateName: body.template_name,
      templateVars: body.template_vars,
      languageCode: body.language_code,
      contactId: body.contact_id,
      scheduledAt: body.scheduled_at,
    });

    logger.info('One-off message enqueued', { orgId, messageId, channel: body.channel });

    res.status(202).json({ success: true, messageId });
  }),
);

export default router;
