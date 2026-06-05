import axios from 'axios';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { sendWhatsAppText } from '../adapters/whatsapp.adapter';
import { sendSMS } from '../adapters/sms.adapter';
import { sendEmail } from '../adapters/email.adapter';

type ChannelType = 'whatsapp' | 'sms' | 'email' | 'push';

interface Mandate {
  id: string;
  org_id: string;
  name: string;
  channel: ChannelType;
  trigger_keywords: string[];
  trigger_regex: string | null;
  match_all: boolean;
  action_type: 'auto_reply' | 'webhook' | 'escalate' | 'tag_contact' | 'opt_out';
  action_config: Record<string, unknown>;
  priority: number;
  is_active: boolean;
}

interface ProcessOptions {
  inboundMessageId: string;
  orgId: string;
  channel: ChannelType;
  text: string;
  senderId: string;
  contactId?: string;
}

interface ContactRecord {
  id: string;
  phone?: string;
  email?: string;
  name?: string;
  whatsapp_id?: string;
}

class MandateEngine {
  async process(options: ProcessOptions): Promise<void> {
    const { inboundMessageId, orgId, channel, text, senderId, contactId } = options;

    try {
      const mandate = await this.findMatchingMandate(orgId, channel, text);

      if (!mandate) {
        logger.debug('No matching mandate found', { orgId, channel, text: text.substring(0, 50) });
        return;
      }

      logger.info('Mandate matched', {
        mandateId: mandate.id,
        mandateName: mandate.name,
        channel,
        senderId,
      });

      // Update inbound message with matched mandate
      await supabase
        .from('inbound_messages')
        .update({ mandate_id: mandate.id, processed_at: new Date().toISOString() })
        .eq('id', inboundMessageId);

      await this.executeAction(mandate, {
        inboundMessageId,
        orgId,
        channel,
        text,
        senderId,
        contactId,
      });
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('Mandate engine error', { error: error.message, inboundMessageId });
    }
  }

  async findMatchingMandate(
    orgId: string,
    channel: ChannelType,
    text: string,
  ): Promise<Mandate | null> {
    const { data: mandates, error } = await supabase
      .from('mandates')
      .select('*')
      .eq('org_id', orgId)
      .eq('channel', channel)
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) {
      logger.error('Failed to fetch mandates', { error: error.message });
      return null;
    }

    const normalizedText = text.toLowerCase().trim();

    for (const mandate of mandates as Mandate[]) {
      // Try regex match first if configured
      if (mandate.trigger_regex) {
        try {
          const regex = new RegExp(mandate.trigger_regex, 'i');
          if (regex.test(text)) {
            return mandate;
          }
        } catch (err) {
          logger.warn('Invalid mandate regex', { mandateId: mandate.id, regex: mandate.trigger_regex });
        }
      }

      // Keyword matching
      if (mandate.trigger_keywords.length > 0) {
        const words = normalizedText.split(/\s+/);
        const lowerKeywords = mandate.trigger_keywords.map((k) => k.toLowerCase());

        if (mandate.match_all) {
          // All keywords must be present
          const allMatch = lowerKeywords.every((kw) =>
            words.some((w) => w === kw) || normalizedText.includes(kw),
          );
          if (allMatch) return mandate;
        } else {
          // Any keyword matches
          const anyMatch = lowerKeywords.some((kw) =>
            words.some((w) => w === kw) || normalizedText.includes(kw),
          );
          if (anyMatch) return mandate;
        }
      }
    }

    return null;
  }

  private async executeAction(mandate: Mandate, options: ProcessOptions): Promise<void> {
    const { action_type, action_config } = mandate;
    const { orgId, channel, senderId, contactId, inboundMessageId } = options;

    switch (action_type) {
      case 'auto_reply': {
        const message = action_config['message'] as string | undefined;
        const subject = action_config['subject'] as string | undefined;
        if (message) {
          await this.sendAutoResponse(channel, senderId, message, subject, orgId, inboundMessageId);
        }
        break;
      }

      case 'webhook': {
        const webhookUrl = action_config['url'] as string | undefined;
        if (webhookUrl) {
          await this.callWebhook(webhookUrl, {
            mandateId: mandate.id,
            orgId,
            channel,
            senderId,
            inboundMessageId,
            contact: contactId ? await this.lookupContact(contactId) : null,
          });
        }
        break;
      }

      case 'escalate': {
        const escalateTo = action_config['escalate_to'] as string | undefined;
        const escalateMessage = action_config['message'] as string | undefined;
        const notifyEmail = action_config['notify_email'] as string | undefined;

        if (notifyEmail) {
          await this.sendEscalationAlert(notifyEmail, {
            orgId,
            channel,
            senderId,
            inboundMessageId,
            mandateName: mandate.name,
            originalText: options.text,
          });
        }

        // Also send auto-reply if configured
        if (escalateMessage) {
          await this.sendAutoResponse(channel, senderId, escalateMessage, undefined, orgId, inboundMessageId);
        }

        if (escalateTo) {
          logger.info('Escalation triggered', { escalateTo, channel, senderId });
        }
        break;
      }

      case 'tag_contact': {
        if (contactId) {
          const tags = action_config['tags'] as string[] | undefined;
          if (tags?.length) {
            await supabase.rpc('array_append_unique', {
              row_id: contactId,
              table_name: 'contacts',
              column_name: 'tags',
              new_values: tags,
            }).catch(async () => {
              // Fallback: fetch and merge tags
              const { data: contact } = await supabase
                .from('contacts')
                .select('tags')
                .eq('id', contactId)
                .single();
              const existing = (contact?.tags as string[]) ?? [];
              const merged = [...new Set([...existing, ...tags])];
              await supabase.from('contacts').update({ tags: merged }).eq('id', contactId);
            });
          }
        }
        break;
      }

      case 'opt_out': {
        if (contactId) {
          const optOutChannels = action_config['channels'] as ChannelType[] | undefined;
          const channelsToOptOut = optOutChannels?.length ? optOutChannels : [channel];

          const { data: contact } = await supabase
            .from('contacts')
            .select('opt_out_channels')
            .eq('id', contactId)
            .single();

          const existing = (contact?.opt_out_channels as ChannelType[]) ?? [];
          const merged = [...new Set([...existing, ...channelsToOptOut])];

          await supabase.from('contacts').update({ opt_out_channels: merged }).eq('id', contactId);

          logger.info('Contact opted out', { contactId, channels: channelsToOptOut });

          // Confirm opt-out
          const confirmMessage = action_config['confirm_message'] as string | undefined;
          if (confirmMessage) {
            await this.sendAutoResponse(channel, senderId, confirmMessage, undefined, orgId, inboundMessageId);
          }
        }
        break;
      }

      default:
        logger.warn('Unknown mandate action type', { actionType: action_type });
    }
  }

  private async sendAutoResponse(
    channel: ChannelType,
    senderId: string,
    message: string,
    subject?: string,
    orgId?: string,
    inboundMessageId?: string,
  ): Promise<void> {
    try {
      let externalId: string | undefined;
      let status: 'sent' | 'failed' = 'sent';
      let errorMessage: string | undefined;

      if (channel === 'whatsapp') {
        const result = await sendWhatsAppText({ to: senderId, text: message });
        externalId = result.messages?.[0]?.id;
      } else if (channel === 'sms') {
        const result = await sendSMS(senderId, message);
        externalId = result.messageId;
        if (result.status === 'failed') {
          status = 'failed';
          errorMessage = result.error;
        }
      } else if (channel === 'email') {
        const result = await sendEmail({
          to: senderId,
          subject: subject ?? 'Response from AirPay',
          text: message,
        });
        externalId = result.messageId;
        if (result.status === 'failed') {
          status = 'failed';
          errorMessage = result.error;
        }
      }

      // Store outbound message
      if (orgId) {
        await supabase.from('outbound_messages').insert({
          org_id: orgId,
          channel,
          recipient_id: senderId,
          body: message,
          subject,
          status,
          external_id: externalId,
          error_message: errorMessage,
          inbound_message_id: inboundMessageId ?? null,
          sent_at: status === 'sent' ? new Date().toISOString() : null,
        });
      }

      logger.info('Auto-response sent', { channel, senderId, status });
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('Failed to send auto-response', { channel, senderId, error: error.message });
    }
  }

  private async sendEscalationAlert(
    notifyEmail: string,
    context: {
      orgId: string;
      channel: ChannelType;
      senderId: string;
      inboundMessageId: string;
      mandateName: string;
      originalText: string;
    },
  ): Promise<void> {
    try {
      const { sendEmail: sendEmailFn } = await import('../adapters/email.adapter');
      await sendEmailFn({
        to: notifyEmail,
        subject: `[Escalation] ${context.mandateName} - ${context.channel.toUpperCase()}`,
        html: `
          <h2>Escalation Alert</h2>
          <p><strong>Mandate:</strong> ${context.mandateName}</p>
          <p><strong>Channel:</strong> ${context.channel}</p>
          <p><strong>Sender:</strong> ${context.senderId}</p>
          <p><strong>Message:</strong> ${context.originalText}</p>
          <p><strong>Inbound Message ID:</strong> ${context.inboundMessageId}</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        `,
        text: `Escalation Alert\nMandate: ${context.mandateName}\nChannel: ${context.channel}\nSender: ${context.senderId}\nMessage: ${context.originalText}`,
      });
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('Failed to send escalation alert', { error: error.message, notifyEmail });
    }
  }

  private async callWebhook(
    url: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await axios.post(url, payload, {
        timeout: 10_000,
        headers: { 'Content-Type': 'application/json' },
      });
      logger.info('Mandate webhook called', { url });
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('Mandate webhook call failed', { url, error: error.message });
    }
  }

  private async lookupContact(contactId: string): Promise<ContactRecord | null> {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, phone, email, name, whatsapp_id')
      .eq('id', contactId)
      .single();

    if (error) return null;
    return data as ContactRecord;
  }
}

export const mandateEngine = new MandateEngine();
export default mandateEngine;
