import axios from 'axios';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WaAccount {
  id: string;
  org_id: string;
  name: string;
  waba_id: string;
  phone_number_id: string;
  access_token: string;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Env-based fallback config ────────────────────────────────────────────────

function getEnvConfig() {
  return {
    graphVersion: process.env.META_GRAPH_VERSION ?? process.env.WHATSAPP_API_VERSION ?? 'v22.0',
    accessToken: process.env.META_ACCESS_TOKEN ?? process.env.WHATSAPP_ACCESS_TOKEN,
    wabaId: process.env.META_WABA_ID ?? process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    phoneNumberId: process.env.META_PHONE_NUMBER_ID ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? process.env.WHATSAPP_PHONE_ID,
  };
}

// ─── Phone normalisation ─────────────────────────────────────────────────────

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits || digits.length < 7 || digits.length > 15) {
    throw new Error(`Invalid phone number: "${phone}". Must be 7–15 digits in international format.`);
  }
  return digits;
}

// ─── Meta error parser ───────────────────────────────────────────────────────

export function parseMetaError(err: unknown): string {
  const e = err as { response?: { data?: { error?: { message?: string; code?: number; error_subcode?: number; type?: string } } }; message?: string };
  const metaErr = e.response?.data?.error;
  if (!metaErr) return e.message ?? 'Unknown error';
  const { code, error_subcode, message, type } = metaErr;
  if (code === 190) return 'Invalid or expired access token. Generate a new System User Access Token.';
  if (code === 10) return 'Missing WhatsApp permission. Check your Meta App permissions.';
  if (code === 100 && error_subcode === 2388094) return 'Wrong WABA ID. Verify the WABA ID for this account.';
  if (code === 100 && error_subcode === 2388053) return 'Wrong Phone Number ID. Verify the Phone Number ID for this account.';
  if (code === 131026) return 'Recipient phone number is not a valid WhatsApp account.';
  if (code === 131047) return 'Template not approved or not found for the specified language.';
  if (code === 131051) return 'Template language mismatch with what is registered on Meta.';
  if (code === 80007) return 'Meta rate limit exceeded. Slow down and retry later.';
  if (code === 131000) return 'Failed to deliver message. Check if recipient has WhatsApp.';
  return `Meta API error ${code ?? ''}${error_subcode ? `/${error_subcode}` : ''} (${type ?? 'unknown'}): ${message ?? 'Unknown'}`;
}

// ─── Account helpers ──────────────────────────────────────────────────────────

export async function getAccount(orgId: string, accountId: string): Promise<WaAccount | null> {
  const { data } = await supabase
    .from('whatsapp_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('org_id', orgId)
    .single();
  return (data as WaAccount | null);
}

export async function listAccounts(orgId: string): Promise<Omit<WaAccount, 'access_token'>[]> {
  const { data } = await supabase
    .from('whatsapp_accounts')
    .select('id, org_id, name, waba_id, phone_number_id, is_active, last_synced_at, created_at, updated_at')
    .eq('org_id', orgId)
    .order('name');
  return (data ?? []) as Omit<WaAccount, 'access_token'>[];
}

// ─── Template sync ────────────────────────────────────────────────────────────

interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: unknown[];
  quality_score?: { score?: string; date?: number };
}

interface MetaTemplatesResponse {
  data: MetaTemplate[];
  paging?: { next?: string };
}

interface SyncCredentials {
  accessToken: string;
  wabaId: string;
  graphVersion: string;
  accountId?: string;
  accountName?: string;
}

async function syncWithCredentials(orgId: string, creds: SyncCredentials): Promise<{ synced: number; errors: string[] }> {
  const baseUrl = `https://graph.facebook.com/${creds.graphVersion}`;
  const fields = 'id,name,status,category,language,components,quality_score';
  let synced = 0;
  const errors: string[] = [];
  let url: string | null = `${baseUrl}/${creds.wabaId}/message_templates?fields=${fields}&limit=100`;

  while (url) {
    let resp: MetaTemplatesResponse;
    try {
      const res = await axios.get<MetaTemplatesResponse>(url, {
        headers: { Authorization: `Bearer ${creds.accessToken}` },
      });
      resp = res.data;
    } catch (err) {
      const msg = parseMetaError(err);
      logger.error('Failed to fetch WhatsApp templates from Meta', { wabaId: creds.wabaId, error: msg });
      errors.push(msg);
      break;
    }

    for (const tpl of resp.data ?? []) {
      try {
        await supabase
          .from('whatsapp_cloud_templates')
          .upsert(
            {
              org_id: orgId,
              meta_template_id: tpl.id,
              name: tpl.name,
              language: tpl.language,
              category: tpl.category ?? '',
              status: tpl.status ?? '',
              quality_score: tpl.quality_score ?? {},
              components: tpl.components ?? [],
              raw_meta_response: tpl as unknown as Record<string, unknown>,
              waba_id: creds.wabaId,
              waba_name: creds.accountName ?? null,
              account_id: creds.accountId ?? null,
              last_synced_at: new Date().toISOString(),
            },
            { onConflict: 'org_id,meta_template_id,language' },
          );
        synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Template ${tpl.name}/${tpl.language}: ${msg}`);
      }
    }

    url = resp.paging?.next ?? null;
  }

  return { synced, errors };
}

// Sync a specific DB account
export async function syncAccount(orgId: string, accountId: string): Promise<{ synced: number; errors: string[] }> {
  const account = await getAccount(orgId, accountId);
  if (!account) return { synced: 0, errors: ['Account not found'] };

  const graphVersion = process.env.META_GRAPH_VERSION ?? 'v22.0';
  const result = await syncWithCredentials(orgId, {
    accessToken: account.access_token,
    wabaId: account.waba_id,
    graphVersion,
    accountId: account.id,
    accountName: account.name,
  });

  await supabase
    .from('whatsapp_accounts')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', account.id);

  logger.info('WhatsApp account sync complete', { orgId, accountName: account.name, ...result });
  return result;
}

// Sync all active DB accounts; if none exist fall back to env vars
export async function syncWhatsAppTemplates(orgId: string): Promise<{ synced: number; errors: string[] }> {
  const accounts = await listAccounts(orgId);
  const active = accounts.filter(a => a.is_active);

  if (active.length > 0) {
    let totalSynced = 0;
    const allErrors: string[] = [];
    for (const acct of active) {
      const full = await getAccount(orgId, acct.id);
      if (!full) continue;
      const graphVersion = process.env.META_GRAPH_VERSION ?? 'v22.0';
      const res = await syncWithCredentials(orgId, {
        accessToken: full.access_token,
        wabaId: full.waba_id,
        graphVersion,
        accountId: full.id,
        accountName: full.name,
      });
      await supabase.from('whatsapp_accounts').update({ last_synced_at: new Date().toISOString() }).eq('id', full.id);
      totalSynced += res.synced;
      allErrors.push(...res.errors);
    }
    logger.info('WhatsApp all-accounts sync complete', { orgId, synced: totalSynced });
    return { synced: totalSynced, errors: allErrors };
  }

  // Fallback: env-var config
  const env = getEnvConfig();
  if (!env.accessToken || !env.wabaId) {
    return { synced: 0, errors: ['No WhatsApp accounts configured. Add an account or set META_ACCESS_TOKEN and META_WABA_ID.'] };
  }
  return syncWithCredentials(orgId, {
    accessToken: env.accessToken,
    wabaId: env.wabaId,
    graphVersion: env.graphVersion,
  });
}

// ─── Send template message ────────────────────────────────────────────────────

export interface SendTemplateOptions {
  orgId: string;
  to: string;
  templateName: string;
  languageCode: string;
  components?: unknown[];
  campaignId?: string;
  contactId?: string;
  accountId?: string;
}

export interface SendTemplateResult {
  success: boolean;
  metaMessageId?: string;
  outboundMessageId?: string;
  error?: string;
}

// Low-level Meta API call — does NOT create or update any DB records.
// Used by the queue engine when an outbound_messages record already exists.
export async function callMetaTemplateApi(opts: {
  orgId: string;
  to: string;
  templateName: string;
  languageCode: string;
  components?: unknown[];
  accountId?: string;
}): Promise<{ metaMessageId: string }> {
  const phone = normalizePhone(opts.to);
  const graphVersion = process.env.META_GRAPH_VERSION ?? 'v22.0';

  let accessToken: string;
  let phoneNumberId: string;

  if (opts.accountId) {
    const account = await getAccount(opts.orgId, opts.accountId);
    if (!account) throw new Error('WhatsApp account not found.');
    accessToken = account.access_token;
    phoneNumberId = account.phone_number_id;
  } else {
    const env = getEnvConfig();
    if (!env.accessToken || !env.phoneNumberId) {
      throw new Error('No WhatsApp account configured. Add an account in the Configuration tab.');
    }
    accessToken = env.accessToken;
    phoneNumberId = env.phoneNumberId;
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: opts.templateName,
      language: { code: opts.languageCode },
      ...(opts.components?.length ? { components: opts.components } : {}),
    },
  };

  const res = await axios.post<{ messages: { id: string }[] }>(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    payload,
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
  );

  const metaMessageId = res.data.messages?.[0]?.id ?? '';
  logger.info('WhatsApp Cloud template sent via queue', { to: phone, templateName: opts.templateName, metaMessageId });
  return { metaMessageId };
}

export async function sendWhatsAppCloudTemplate(opts: SendTemplateOptions): Promise<SendTemplateResult> {
  let recipientPhone: string;
  try {
    recipientPhone = normalizePhone(opts.to);
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  // Confirm template exists locally and status allows sending
  const { data: tpl } = await supabase
    .from('whatsapp_cloud_templates')
    .select('id, name, language, status, account_id, waba_id')
    .eq('org_id', opts.orgId)
    .eq('name', opts.templateName)
    .eq('language', opts.languageCode)
    .single();

  if (!tpl) {
    return { success: false, error: `Template "${opts.templateName}" (${opts.languageCode}) not found locally. Sync templates first.` };
  }
  if ((tpl.status as string).toUpperCase() !== 'APPROVED') {
    return { success: false, error: `Template "${opts.templateName}" has status "${tpl.status}" — only APPROVED templates can be sent.` };
  }

  // Resolve credentials: prefer explicit accountId → template's account → env vars
  const resolvedAccountId: string | null = opts.accountId ?? (tpl.account_id as string | null) ?? null;
  let accessToken: string;
  let phoneNumberId: string;
  const graphVersion = process.env.META_GRAPH_VERSION ?? 'v22.0';

  if (resolvedAccountId) {
    const account = await getAccount(opts.orgId, resolvedAccountId);
    if (!account) return { success: false, error: 'WhatsApp account not found.' };
    accessToken = account.access_token;
    phoneNumberId = account.phone_number_id;
  } else {
    const env = getEnvConfig();
    if (!env.accessToken || !env.phoneNumberId) {
      return { success: false, error: 'No WhatsApp account configured. Add an account in the Configuration tab.' };
    }
    accessToken = env.accessToken;
    phoneNumberId = env.phoneNumberId;
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: 'template',
    template: {
      name: opts.templateName,
      language: { code: opts.languageCode },
      ...(opts.components?.length ? { components: opts.components } : {}),
    },
  };

  const { data: outbound, error: insertErr } = await supabase
    .from('outbound_messages')
    .insert({
      org_id: opts.orgId,
      channel: 'whatsapp',
      recipient_id: recipientPhone,
      template_name: opts.templateName,
      template_language: opts.languageCode,
      status: 'pending',
      campaign_id: opts.campaignId ?? null,
      contact_id: opts.contactId ?? null,
      request_payload: payload,
    })
    .select('id')
    .single();

  if (insertErr || !outbound) {
    logger.error('Failed to create outbound message record', { error: insertErr?.message });
    return { success: false, error: 'Failed to create message record.' };
  }

  const outboundId = outbound.id as string;

  try {
    const res = await axios.post<{ messaging_product: string; contacts: { input: string; wa_id: string }[]; messages: { id: string }[] }>(
      `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
      payload,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } },
    );

    const metaMessageId = res.data.messages?.[0]?.id ?? null;
    await supabase.from('outbound_messages').update({
      status: 'sent',
      meta_message_id: metaMessageId,
      external_id: metaMessageId,
      meta_response: res.data as unknown as Record<string, unknown>,
      sent_at: new Date().toISOString(),
    }).eq('id', outboundId);

    logger.info('WhatsApp Cloud template sent', { to: recipientPhone, templateName: opts.templateName, metaMessageId });
    return { success: true, metaMessageId: metaMessageId ?? undefined, outboundMessageId: outboundId };

  } catch (err) {
    const errorMsg = parseMetaError(err);
    const errData = (err as { response?: { data?: unknown } }).response?.data ?? null;
    await supabase.from('outbound_messages').update({
      status: 'failed',
      error_message: errorMsg,
      error_details: errData as Record<string, unknown> | null,
      failed_at: new Date().toISOString(),
      meta_response: errData as Record<string, unknown> | null,
    }).eq('id', outboundId);

    logger.error('Failed to send WhatsApp Cloud template', { to: recipientPhone, templateName: opts.templateName, error: errorMsg });
    return { success: false, error: errorMsg, outboundMessageId: outboundId };
  }
}
