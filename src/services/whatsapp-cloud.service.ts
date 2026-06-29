import axios from 'axios';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

// ─── Config ──────────────────────────────────────────────────────────────────

function getMetaConfig() {
  const graphVersion =
    process.env.META_GRAPH_VERSION ??
    process.env.WHATSAPP_API_VERSION ??
    'v22.0';
  const accessToken =
    process.env.META_ACCESS_TOKEN ??
    process.env.WHATSAPP_ACCESS_TOKEN;
  const wabaId =
    process.env.META_WABA_ID ??
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const phoneNumberId =
    process.env.META_PHONE_NUMBER_ID ??
    process.env.WHATSAPP_PHONE_NUMBER_ID ??
    process.env.WHATSAPP_PHONE_ID;

  return { graphVersion, accessToken, wabaId, phoneNumberId };
}

function requireMetaConfig() {
  const cfg = getMetaConfig();
  const missing: string[] = [];
  if (!cfg.accessToken) missing.push('META_ACCESS_TOKEN');
  if (!cfg.wabaId) missing.push('META_WABA_ID');
  if (!cfg.phoneNumberId) missing.push('META_PHONE_NUMBER_ID');
  if (missing.length) throw new Error(`Missing required Meta config: ${missing.join(', ')}`);
  return cfg as Required<typeof cfg>;
}

// ─── Phone normalisation ─────────────────────────────────────────────────────

export function normalizePhone(phone: string): string {
  // Strip everything except digits, then remove leading +
  const digits = phone.replace(/\D/g, '');
  if (!digits || digits.length < 7 || digits.length > 15) {
    throw new Error(`Invalid phone number: "${phone}". Must be 7–15 digits in international format.`);
  }
  return digits;
}

// ─── Meta error parser ───────────────────────────────────────────────────────

function parseMetaError(err: unknown): string {
  const e = err as { response?: { data?: { error?: { message?: string; code?: number; error_subcode?: number; type?: string } } }; message?: string };
  const metaErr = e.response?.data?.error;
  if (!metaErr) return e.message ?? 'Unknown error';

  const { code, error_subcode, message, type } = metaErr;
  // Map common error codes to human-readable messages
  if (code === 190) return 'Invalid or expired access token. Generate a new System User Access Token.';
  if (code === 10) return 'Missing WhatsApp permission. Check your Meta App permissions.';
  if (code === 100 && error_subcode === 2388094) return 'Wrong WABA ID. Verify META_WABA_ID in your config.';
  if (code === 100 && error_subcode === 2388053) return 'Wrong Phone Number ID. Verify META_PHONE_NUMBER_ID.';
  if (code === 131026) return 'Recipient phone number is not a valid WhatsApp account.';
  if (code === 131047) return 'Template not approved or not found for the specified language.';
  if (code === 131051) return 'Template language mismatch with what is registered on Meta.';
  if (code === 80007) return 'Meta rate limit exceeded. Slow down and retry later.';
  if (code === 131000) return 'Failed to deliver message. Check if recipient has WhatsApp.';
  return `Meta API error ${code ?? ''}${error_subcode ? `/${error_subcode}` : ''} (${type ?? 'unknown'}): ${message ?? 'Unknown'}`;
}

// ─── Template sync ───────────────────────────────────────────────────────────

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
  paging?: { cursors?: { after?: string }; next?: string };
}

export async function syncWhatsAppTemplates(orgId: string): Promise<{ synced: number; errors: string[] }> {
  const cfg = requireMetaConfig();
  const baseUrl = `https://graph.facebook.com/${cfg.graphVersion}`;

  const fields = 'id,name,status,category,language,components,quality_score';
  let synced = 0;
  const errors: string[] = [];
  let url: string | null = `${baseUrl}/${cfg.wabaId}/message_templates?fields=${fields}&limit=100`;

  while (url) {
    let resp: MetaTemplatesResponse;
    try {
      const res = await axios.get<MetaTemplatesResponse>(url, {
        headers: { Authorization: `Bearer ${cfg.accessToken}` },
      });
      resp = res.data;
    } catch (err) {
      const msg = parseMetaError(err);
      logger.error('Failed to fetch WhatsApp templates from Meta', { error: msg });
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

  logger.info('WhatsApp template sync complete', { orgId, synced, errors: errors.length });
  return { synced, errors };
}

// ─── Send template message ───────────────────────────────────────────────────

export interface SendTemplateOptions {
  orgId: string;
  to: string;
  templateName: string;
  languageCode: string;
  components?: unknown[];
  campaignId?: string;
  contactId?: string;
}

export interface SendTemplateResult {
  success: boolean;
  metaMessageId?: string;
  outboundMessageId?: string;
  error?: string;
}

export async function sendWhatsAppCloudTemplate(opts: SendTemplateOptions): Promise<SendTemplateResult> {
  const cfg = requireMetaConfig();
  const baseUrl = `https://graph.facebook.com/${cfg.graphVersion}`;

  // Normalise phone
  let recipientPhone: string;
  try {
    recipientPhone = normalizePhone(opts.to);
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  // Confirm template exists locally and status allows sending
  const { data: tpl } = await supabase
    .from('whatsapp_cloud_templates')
    .select('id, name, language, status')
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

  // Create outbound_messages record (pending)
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
      `${baseUrl}/${cfg.phoneNumberId}/messages`,
      payload,
      { headers: { Authorization: `Bearer ${cfg.accessToken}`, 'Content-Type': 'application/json' } },
    );

    const metaMessageId = res.data.messages?.[0]?.id ?? null;

    await supabase
      .from('outbound_messages')
      .update({
        status: 'sent',
        meta_message_id: metaMessageId,
        external_id: metaMessageId,
        meta_response: res.data as unknown as Record<string, unknown>,
        sent_at: new Date().toISOString(),
      })
      .eq('id', outboundId);

    logger.info('WhatsApp Cloud template sent', { to: recipientPhone, templateName: opts.templateName, metaMessageId });
    return { success: true, metaMessageId: metaMessageId ?? undefined, outboundMessageId: outboundId };

  } catch (err) {
    const errorMsg = parseMetaError(err);
    const errData = (err as { response?: { data?: unknown } }).response?.data ?? null;

    await supabase
      .from('outbound_messages')
      .update({
        status: 'failed',
        error_message: errorMsg,
        error_details: errData as Record<string, unknown> | null,
        failed_at: new Date().toISOString(),
        meta_response: errData as Record<string, unknown> | null,
      })
      .eq('id', outboundId);

    logger.error('Failed to send WhatsApp Cloud template', { to: recipientPhone, templateName: opts.templateName, error: errorMsg });
    return { success: false, error: errorMsg, outboundMessageId: outboundId };
  }
}
