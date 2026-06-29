import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { supabase } from '../lib/supabase';
import {
  syncWhatsAppTemplates,
  syncAccount,
  sendWhatsAppCloudTemplate,
  listAccounts,
  getAccount,
} from '../services/whatsapp-cloud.service';

const router = Router();
router.use(authMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

// GET /whatsapp-cloud/accounts — list (access_token never returned)
router.get('/accounts', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const accounts = await listAccounts(orgId);
  res.json({ data: accounts });
}));

// POST /whatsapp-cloud/accounts — create
router.post('/accounts', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const body = req.body as {
    name?: string;
    waba_id?: string;
    phone_number_id?: string;
    access_token?: string;
  };

  if (!body.name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }
  if (!body.waba_id?.trim()) { res.status(400).json({ error: 'waba_id is required' }); return; }
  if (!body.phone_number_id?.trim()) { res.status(400).json({ error: 'phone_number_id is required' }); return; }
  if (!body.access_token?.trim()) { res.status(400).json({ error: 'access_token is required' }); return; }

  const { data, error } = await supabase
    .from('whatsapp_accounts')
    .insert({
      org_id: orgId,
      name: body.name.trim(),
      waba_id: body.waba_id.trim(),
      phone_number_id: body.phone_number_id.trim(),
      access_token: body.access_token.trim(),
    })
    .select('id, org_id, name, waba_id, phone_number_id, is_active, last_synced_at, created_at, updated_at')
    .single();

  if (error) {
    const msg = error.message.includes('unique') ? 'An account with this WABA ID already exists.' : error.message;
    res.status(400).json({ error: msg }); return;
  }
  res.status(201).json(data);
}));

// PATCH /whatsapp-cloud/accounts/:id
router.patch('/accounts/:id', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const body = req.body as Record<string, unknown>;
  const allowed = ['name', 'phone_number_id', 'access_token', 'is_active'];
  const update: Record<string, unknown> = {};
  for (const k of allowed) { if (k in body) update[k] = body[k]; }

  const { data, error } = await supabase
    .from('whatsapp_accounts')
    .update(update)
    .eq('id', req.params['id']!)
    .eq('org_id', orgId)
    .select('id, org_id, name, waba_id, phone_number_id, is_active, last_synced_at, created_at, updated_at')
    .single();

  if (error || !data) { res.status(404).json({ error: error?.message ?? 'Not found' }); return; }
  res.json(data);
}));

// DELETE /whatsapp-cloud/accounts/:id
router.delete('/accounts/:id', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  await supabase.from('whatsapp_accounts').delete().eq('id', req.params['id']!).eq('org_id', orgId);
  res.status(204).send();
}));

// POST /whatsapp-cloud/accounts/:id/sync — sync a single account
router.post('/accounts/:id/sync', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const result = await syncAccount(orgId, req.params['id']!);
  res.json(result);
}));

// ─── Templates ────────────────────────────────────────────────────────────────

// GET /whatsapp-cloud/templates
router.get('/templates', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { status, language, waba_id } = req.query as Record<string, string>;

  let query = supabase
    .from('whatsapp_cloud_templates')
    .select('*')
    .eq('org_id', orgId)
    .order('name');

  if (status) query = query.eq('status', status.toUpperCase());
  if (language) query = query.eq('language', language);
  if (waba_id) query = query.eq('waba_id', waba_id);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data: data ?? [] });
}));

// POST /whatsapp-cloud/templates/sync — sync all accounts
router.post('/templates/sync', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const result = await syncWhatsAppTemplates(orgId);
  res.json(result);
}));

// ─── Messages ─────────────────────────────────────────────────────────────────

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
    accountId?: string;
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
    accountId: body.accountId,
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

  type MsgRow = Record<string, unknown> & { created_at: string; direction: string };

  const outbound: MsgRow[] = (outboundRes.data ?? []).map((m: Record<string, unknown>) => ({ ...m, direction: 'outbound' } as MsgRow));
  const inbound: MsgRow[] = (inboundRes.data ?? []).map((m: Record<string, unknown>) => ({
    id: m['id'],
    recipient_id: m['sender_id'],
    sender_id: m['sender_id'],
    body: m['body'],
    external_id: m['external_id'],
    meta_message_id: m['external_id'],
    status: 'received',
    direction: 'inbound',
    created_at: m['created_at'] as string,
    raw_payload: m['raw_payload'],
  } as MsgRow));

  const combined = [...outbound, ...inbound].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  res.json({ data: combined.slice(0, limit) });
}));

// ─── Config ───────────────────────────────────────────────────────────────────

// GET /whatsapp-cloud/config — non-sensitive status
router.get('/config', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const graphVersion = process.env.META_GRAPH_VERSION ?? process.env.WHATSAPP_API_VERSION ?? 'v22.0';
  const hasEnvToken = !!(process.env.META_ACCESS_TOKEN ?? process.env.WHATSAPP_ACCESS_TOKEN);
  const hasEnvWaba = !!(process.env.META_WABA_ID ?? process.env.WHATSAPP_BUSINESS_ACCOUNT_ID);
  const hasEnvPhone = !!(process.env.META_PHONE_NUMBER_ID ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? process.env.WHATSAPP_PHONE_ID);
  const hasWebhookToken = !!(process.env.META_WEBHOOK_VERIFY_TOKEN ?? process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);

  const accounts = await listAccounts(orgId);

  res.json({
    graphVersion,
    envConfigured: { accessToken: hasEnvToken, wabaId: hasEnvWaba, phoneNumberId: hasEnvPhone, webhookVerifyToken: hasWebhookToken },
    accountCount: accounts.length,
    activeAccountCount: accounts.filter(a => a.is_active).length,
  });
}));

export { getAccount };
export default router;
