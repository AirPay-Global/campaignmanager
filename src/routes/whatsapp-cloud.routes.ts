import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { supabase } from '../lib/supabase';
import { syncWhatsAppTemplates, sendWhatsAppCloudTemplate } from '../services/whatsapp-cloud.service';

const router = Router();
router.use(authMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// GET /whatsapp-cloud/templates
router.get('/templates', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { status, language } = req.query as Record<string, string>;

  let query = supabase
    .from('whatsapp_cloud_templates')
    .select('*')
    .eq('org_id', orgId)
    .order('name');

  if (status) query = query.eq('status', status.toUpperCase());
  if (language) query = query.eq('language', language);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data: data ?? [] });
}));

// POST /whatsapp-cloud/templates/sync
router.post('/templates/sync', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const result = await syncWhatsAppTemplates(orgId);
  res.json(result);
}));

// POST /whatsapp-cloud/messages/send
router.post('/messages/send', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const body = req.body as {
    to?: string;
    templateName?: string;
    languageCode?: string;
    components?: unknown[];
    campaignId?: string;
    contactId?: string;
  };

  if (!body.to?.trim()) { res.status(400).json({ error: 'to (recipient phone) is required' }); return; }
  if (!body.templateName?.trim()) { res.status(400).json({ error: 'templateName is required' }); return; }
  if (!body.languageCode?.trim()) { res.status(400).json({ error: 'languageCode is required' }); return; }

  const result = await sendWhatsAppCloudTemplate({
    orgId,
    to: body.to.trim(),
    templateName: body.templateName.trim(),
    languageCode: body.languageCode.trim(),
    components: body.components,
    campaignId: body.campaignId,
    contactId: body.contactId,
  });

  if (!result.success) {
    res.status(422).json({ error: result.error, outboundMessageId: result.outboundMessageId });
    return;
  }

  res.json(result);
}));

// GET /whatsapp-cloud/messages — combined outbound + inbound log
router.get('/messages', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
  const offset = Number(req.query['offset'] ?? 0);

  const [outboundRes, inboundRes] = await Promise.all([
    supabase
      .from('outbound_messages')
      .select('id, recipient_id, template_name, template_language, status, meta_message_id, external_id, error_message, error_details, sent_at, delivered_at, read_at, failed_at, meta_response, created_at')
      .eq('org_id', orgId)
      .eq('channel', 'whatsapp')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from('inbound_messages')
      .select('id, sender_id, body, external_id, raw_payload, created_at')
      .eq('org_id', orgId)
      .eq('channel', 'whatsapp')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
  ]);

  const outbound = (outboundRes.data ?? []).map((m: Record<string, unknown>) => ({ ...m, direction: 'outbound' }));
  const inbound = (inboundRes.data ?? []).map((m: Record<string, unknown>) => ({
    id: m.id,
    recipient_id: m.sender_id,
    sender_id: m.sender_id,
    body: m.body,
    external_id: m.external_id,
    meta_message_id: m.external_id,
    status: 'received',
    direction: 'inbound',
    created_at: m.created_at,
    raw_payload: m.raw_payload,
  }));

  const combined = [...outbound, ...inbound].sort(
    (a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime(),
  );

  res.json({ data: combined.slice(0, limit) });
}));

// GET /whatsapp-cloud/config — return non-sensitive config status
router.get('/config', asyncHandler(async (_req, res) => {
  const graphVersion = process.env.META_GRAPH_VERSION ?? process.env.WHATSAPP_API_VERSION ?? 'v22.0';
  const hasToken = !!(process.env.META_ACCESS_TOKEN ?? process.env.WHATSAPP_ACCESS_TOKEN);
  const hasWaba = !!(process.env.META_WABA_ID ?? process.env.WHATSAPP_BUSINESS_ACCOUNT_ID);
  const hasPhone = !!(process.env.META_PHONE_NUMBER_ID ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? process.env.WHATSAPP_PHONE_ID);
  const hasWebhookToken = !!(process.env.META_WEBHOOK_VERIFY_TOKEN ?? process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);

  res.json({
    graphVersion,
    configured: { accessToken: hasToken, wabaId: hasWaba, phoneNumberId: hasPhone, webhookVerifyToken: hasWebhookToken },
  });
}));

export default router;
