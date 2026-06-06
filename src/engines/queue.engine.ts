import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { sendWhatsAppTemplate, sendWhatsAppText, WhatsAppTemplateComponent } from '../adapters/whatsapp.adapter';
import { sendSMS } from '../adapters/sms.adapter';
import { sendEmail } from '../adapters/email.adapter';

type ChannelType = 'whatsapp' | 'sms' | 'email' | 'push';
type MessageStatus = 'pending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'bounced';

interface OutboundMessage {
  id: string;
  org_id: string;
  contact_id: string | null;
  campaign_id: string | null;
  campaign_message_id: string | null;
  channel: ChannelType;
  recipient_id: string;
  body: string | null;
  subject: string | null;
  template_name: string | null;
  template_vars: Record<string, unknown>;
  status: MessageStatus;
  retry_count: number;
  next_retry_at: string | null;
}

interface CampaignMessage {
  id: string;
  campaign_id: string;
  contact_id: string;
  org_id: string;
  channel: ChannelType;
  recipient_id: string;
  template_vars: Record<string, string>;
  status: MessageStatus;
  scheduled_at: string | null;
}

interface Campaign {
  id: string;
  org_id: string;
  channel: ChannelType;
  template_name: string | null;
  template_vars: Record<string, string>;
  message_body: string | null;
  subject: string | null;
  from_name: string | null;
  status: string;
}

const MAX_RETRY_ATTEMPTS = Number(process.env.RETRY_ATTEMPTS ?? '3');
const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS ?? '5000');
const CONCURRENCY = Number(process.env.QUEUE_CONCURRENCY ?? '5');

let isProcessing = false;

export async function enqueue(message: {
  orgId: string;
  channel: ChannelType;
  recipientId: string;
  body?: string;
  subject?: string;
  templateName?: string;
  templateVars?: Record<string, unknown>;
  contactId?: string;
  campaignId?: string;
  campaignMessageId?: string;
  inboundMessageId?: string;
  scheduledAt?: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('outbound_messages')
    .insert({
      org_id: message.orgId,
      channel: message.channel,
      recipient_id: message.recipientId,
      body: message.body ?? null,
      subject: message.subject ?? null,
      template_name: message.templateName ?? null,
      template_vars: message.templateVars ?? {},
      contact_id: message.contactId ?? null,
      campaign_id: message.campaignId ?? null,
      campaign_message_id: message.campaignMessageId ?? null,
      inbound_message_id: message.inboundMessageId ?? null,
      status: 'pending',
      retry_count: 0,
      next_retry_at: message.scheduledAt ?? null,
    })
    .select('id')
    .single();

  if (error) {
    logger.error('Failed to enqueue message', { error: error.message });
    throw new Error(`Failed to enqueue message: ${error.message}`);
  }

  logger.debug('Message enqueued', { messageId: data.id, channel: message.channel });
  return data.id as string;
}

export async function processQueue(): Promise<void> {
  if (isProcessing) {
    logger.debug('Queue processing already in progress, skipping');
    return;
  }

  isProcessing = true;

  try {
    // First, promote ready campaign messages to outbound_messages
    await promoteCampaignMessages();

    // Process pending outbound messages
    const now = new Date().toISOString();

    const { data: messages, error } = await supabase
      .from('outbound_messages')
      .select('*')
      .in('status', ['pending'])
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
      .order('created_at', { ascending: true })
      .limit(CONCURRENCY);

    if (error) {
      logger.error('Failed to fetch pending messages', { error: error.message });
      return;
    }

    if (!messages || messages.length === 0) {
      return;
    }

    logger.debug('Processing queue batch', { count: messages.length });

    // Mark as queued to prevent double processing
    const ids = (messages as OutboundMessage[]).map((m) => m.id);
    await supabase
      .from('outbound_messages')
      .update({ status: 'queued' })
      .in('id', ids);

    // Process concurrently
    await Promise.allSettled(
      (messages as OutboundMessage[]).map((message) => processMessage(message)),
    );
  } finally {
    isProcessing = false;
  }
}

async function promoteCampaignMessages(): Promise<void> {
  const now = new Date().toISOString();

  // Find pending campaign messages that are due
  const { data: campaignMessages, error } = await supabase
    .from('campaign_messages')
    .select(`
      *,
      campaigns!campaign_id (
        id, org_id, channel, template_name, template_vars, message_body, subject, from_name, status
      )
    `)
    .eq('status', 'pending')
    .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
    .limit(CONCURRENCY * 2);

  if (error) {
    logger.error('Failed to fetch campaign messages', { error: error.message });
    return;
  }

  for (const cm of (campaignMessages ?? []) as (CampaignMessage & { campaigns: Campaign })[]) {
    const campaign = cm.campaigns;
    if (!campaign || campaign.status !== 'running') continue;

    try {
      // Determine message content
      const body = cm.template_vars['message'] as string | undefined
        ?? (campaign.message_body
          ? interpolateBody(campaign.message_body, cm.template_vars)
          : null);

      const { error: outboundError } = await supabase.from('outbound_messages').insert({
        org_id: cm.org_id,
        contact_id: cm.contact_id,
        campaign_id: cm.campaign_id,
        campaign_message_id: cm.id,
        channel: cm.channel,
        recipient_id: cm.recipient_id,
        body,
        subject: campaign.subject,
        template_name: campaign.template_name,
        template_vars: cm.template_vars,
        status: 'pending',
      });

      if (!outboundError) {
        await supabase
          .from('campaign_messages')
          .update({ status: 'queued' })
          .eq('id', cm.id);
      } else {
        logger.error('Failed to promote campaign message', { cmId: cm.id, error: outboundError.message });
      }
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('Error promoting campaign message', { cmId: cm.id, error: error.message });
    }
  }
}

function interpolateBody(body: string, vars: Record<string, unknown>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? `{{${key}}}`));
}

export async function processMessage(message: OutboundMessage): Promise<void> {
  let externalId: string | undefined;
  let errorMessage: string | undefined;
  let success = false;

  try {
    switch (message.channel) {
      case 'whatsapp': {
        if (message.template_name) {
          // Template message
          const components = buildWhatsAppComponents(message.template_vars);
          const result = await sendWhatsAppTemplate({
            to: message.recipient_id,
            templateName: message.template_name,
            components,
          });
          externalId = result.messages?.[0]?.id;
        } else if (message.body) {
          // Text message
          const result = await sendWhatsAppText({
            to: message.recipient_id,
            text: message.body,
          });
          externalId = result.messages?.[0]?.id;
        }
        success = true;
        break;
      }

      case 'sms': {
        const body = message.body ?? '';
        const result = await sendSMS(message.recipient_id, body);
        externalId = result.messageId;
        if (result.status === 'failed') {
          throw new Error(result.error ?? 'SMS failed');
        }
        success = true;
        break;
      }

      case 'email': {
        if (!message.body && !message.template_name) {
          throw new Error('Email message has no body or template');
        }
        const result = await sendEmail({
          to: message.recipient_id,
          subject: message.subject ?? 'Message from AirPay',
          text: message.body ?? undefined,
          html: undefined,
        });
        externalId = result.messageId;
        if (result.status === 'failed') {
          throw new Error(result.error ?? 'Email failed');
        }
        success = true;
        break;
      }

      default:
        throw new Error(`Unsupported channel: ${message.channel}`);
    }
  } catch (err: unknown) {
    const error = err as Error;
    errorMessage = error.message;
    logger.error('Message processing failed', {
      messageId: message.id,
      channel: message.channel,
      error: error.message,
    });
  }

  // Update message status
  if (success) {
    await supabase
      .from('outbound_messages')
      .update({
        status: 'sent',
        external_id: externalId ?? null,
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', message.id);

    // Update linked campaign_message
    if (message.campaign_message_id) {
      await supabase
        .from('campaign_messages')
        .update({ status: 'sent', sent_at: new Date().toISOString(), external_id: externalId })
        .eq('id', message.campaign_message_id);
    }

    // Log delivery event
    await supabase.from('delivery_logs').insert({
      org_id: message.org_id,
      outbound_message_id: message.id,
      event_type: 'sent',
      metadata: { external_id: externalId },
    });
  } else {
    const newRetryCount = message.retry_count + 1;

    if (newRetryCount >= MAX_RETRY_ATTEMPTS) {
      // Permanently failed
      await supabase
        .from('outbound_messages')
        .update({
          status: 'failed',
          retry_count: newRetryCount,
          error_message: errorMessage,
          next_retry_at: null,
        })
        .eq('id', message.id);

      if (message.campaign_message_id) {
        await supabase
          .from('campaign_messages')
          .update({ status: 'failed', error_message: errorMessage })
          .eq('id', message.campaign_message_id);
      }
    } else {
      // Schedule retry with exponential backoff
      const retryDelayMs = RETRY_DELAY_MS * Math.pow(2, message.retry_count);
      const nextRetryAt = new Date(Date.now() + retryDelayMs).toISOString();

      await supabase
        .from('outbound_messages')
        .update({
          status: 'pending',
          retry_count: newRetryCount,
          error_message: errorMessage,
          next_retry_at: nextRetryAt,
        })
        .eq('id', message.id);
    }
  }
}

function buildWhatsAppComponents(
  templateVars: Record<string, unknown>,
): WhatsAppTemplateComponent[] {
  const bodyParams = Object.values(templateVars).map((v) => ({
    type: 'text' as const,
    text: String(v),
  }));

  if (bodyParams.length === 0) return [];

  return [
    {
      type: 'body' as const,
      parameters: bodyParams,
    },
  ];
}
