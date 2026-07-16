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

// ─── Variable substitution ───────────────────────────────────────────────────
interface ContactRow {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp_id?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

function substituteVars(
  template: string,
  contact: ContactRow,
  extraVars: Record<string, string> = {},
): string {
  const nameParts = (contact.name ?? '').split(' ');
  const vars: Record<string, string> = {
    name: contact.name ?? '',
    first_name: nameParts[0] ?? '',
    last_name: nameParts.slice(1).join(' ') ?? '',
    phone: contact.phone ?? '',
    email: contact.email ?? '',
    whatsapp: contact.whatsapp_id ?? '',
    // Spread custom_fields as top-level vars
    ...Object.entries(contact.custom_fields ?? {}).reduce<Record<string, string>>(
      (acc, [k, v]) => { acc[k] = String(v ?? ''); return acc; },
      {},
    ),
    // User-supplied extra vars win over auto-mapped ones
    ...extraVars,
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
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
      .select('*, campaign:campaigns(id, name)', { count: 'exact' })
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

// POST /messages/send-template-bulk — send a library template to many contacts with per-contact substitution
router.post(
  '/send-template-bulk',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const body = req.body as {
      template_id?: string;
      channel?: string;
      contact_ids?: string[];
      extra_vars?: Record<string, string>;
      scheduled_at?: string;
    };

    if (!body.template_id || !body.channel || !Array.isArray(body.contact_ids) || body.contact_ids.length === 0) {
      res.status(400).json({ error: 'Bad Request', message: 'template_id, channel, and contact_ids[] are required' });
      return;
    }
    const validChannels = ['whatsapp', 'sms', 'email', 'push'];
    if (!validChannels.includes(body.channel)) {
      res.status(400).json({ error: 'Bad Request', message: `channel must be one of: ${validChannels.join(', ')}` });
      return;
    }

    // Fetch template
    const { data: tmpl, error: tErr } = await supabase
      .from('message_templates')
      .select('id, name, channel, subject, body')
      .eq('id', body.template_id)
      .eq('org_id', orgId)
      .single();

    if (tErr || !tmpl) {
      res.status(404).json({ error: 'Not Found', message: 'Template not found' });
      return;
    }

    // Fetch contacts
    const { data: contacts, error: cErr } = await supabase
      .from('contacts')
      .select('id, name, phone, email, whatsapp_id, custom_fields')
      .in('id', body.contact_ids)
      .eq('org_id', orgId);

    if (cErr || !contacts) {
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch contacts' });
      return;
    }

    const extraVars = body.extra_vars ?? {};
    const results: Array<{ contact_id: string; messageId?: string; error?: string }> = [];

    for (const contact of contacts) {
      // Resolve channel address
      const recipientId =
        body.channel === 'email' ? contact.email :
        body.channel === 'whatsapp' ? contact.whatsapp_id :
        contact.phone;

      if (!recipientId) {
        results.push({ contact_id: contact.id, error: `No ${body.channel} address on file` });
        continue;
      }

      const resolvedBody = substituteVars(tmpl.body, contact as ContactRow, extraVars);
      const resolvedSubject = tmpl.subject ? substituteVars(tmpl.subject, contact as ContactRow, extraVars) : undefined;

      try {
        const messageId = await enqueue({
          orgId,
          channel: body.channel as 'whatsapp' | 'sms' | 'email' | 'push',
          recipientId,
          body: resolvedBody,
          subject: resolvedSubject,
          contactId: contact.id,
          scheduledAt: body.scheduled_at,
        });
        results.push({ contact_id: contact.id, messageId });
      } catch (err) {
        results.push({ contact_id: contact.id, error: (err as Error).message });
      }
    }

    const succeeded = results.filter(r => r.messageId).length;
    logger.info('Template bulk messages enqueued', { orgId, template_id: body.template_id, total: results.length, succeeded });
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
