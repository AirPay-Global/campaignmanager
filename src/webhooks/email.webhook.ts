import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { mandateEngine } from '../engines/mandate.engine';

// Resend inbound email webhook payload shape
interface ResendInboundEmail {
  type: string;
  created_at: string;
  data: {
    from: string;
    to: string[];
    subject: string;
    html?: string;
    text?: string;
    headers?: Record<string, string>;
    attachments?: Array<{ filename: string; content: string; contentType: string }>;
  };
}

// Resend delivery event webhook payload shape
interface ResendDeliveryEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
  };
}

type ResendWebhookPayload = ResendInboundEmail | ResendDeliveryEvent;

export function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase() : from.toLowerCase().trim();
}

export function extractName(from: string): string | null {
  const match = from.match(/^(.+?)\s*</);
  if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  return null;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function verifyResendWebhookSignature(req: Request): boolean {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('RESEND_INBOUND_WEBHOOK_SECRET not set; skipping signature validation');
    return true;
  }

  const signature = req.headers['svix-signature'] as string | undefined;
  const msgId = req.headers['svix-id'] as string | undefined;
  const msgTimestamp = req.headers['svix-timestamp'] as string | undefined;

  if (!signature || !msgId || !msgTimestamp) {
    logger.warn('Missing Resend webhook signature headers');
    return false;
  }

  const signedContent = `${msgId}.${msgTimestamp}.${JSON.stringify(req.body)}`;
  const secretBytes = Buffer.from(secret.replace('whsec_', ''), 'base64');
  const computed = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');
  const signatures = signature.split(' ').map((s) => s.replace(/^v1,/, ''));

  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sig));
    } catch {
      return false;
    }
  });
}

export async function handleEmailWebhook(req: Request, res: Response): Promise<void> {
  res.sendStatus(200);

  if (!verifyResendWebhookSignature(req)) {
    logger.warn('Invalid Resend webhook signature');
    return;
  }

  const payload = req.body as ResendWebhookPayload;

  try {
    if (payload.type === 'email.received') {
      // Inbound email
      const inboundPayload = payload as ResendInboundEmail;
      const from = inboundPayload.data.from;
      const senderEmail = extractEmail(from);
      const senderName = extractName(from);
      const subject = inboundPayload.data.subject;
      const html = inboundPayload.data.html ?? '';
      const text = inboundPayload.data.text ?? stripHtml(html);

      const orgId = process.env.DEFAULT_ORG_ID;
      if (!orgId) {
        logger.warn('No DEFAULT_ORG_ID configured for email webhook');
        return;
      }

      logger.info('Inbound email received', { from: senderEmail, subject });

      // Upsert contact by email
      const { data: contact } = await supabase
        .from('contacts')
        .upsert(
          { org_id: orgId, email: senderEmail, name: senderName },
          { onConflict: 'org_id,email', ignoreDuplicates: false },
        )
        .select('id')
        .single();

      // Store inbound message
      const { data: inbound, error: inboundError } = await supabase
        .from('inbound_messages')
        .insert({
          org_id: orgId,
          contact_id: contact?.id ?? null,
          channel: 'email',
          sender_id: senderEmail,
          body: text,
          raw_payload: { ...inboundPayload.data, type: payload.type },
        })
        .select('id')
        .single();

      if (inboundError) {
        logger.error('Failed to store inbound email', { error: inboundError.message });
        return;
      }

      // Process through mandate engine
      if (inbound && (subject || text)) {
        await mandateEngine.process({
          inboundMessageId: inbound.id as string,
          orgId,
          channel: 'email',
          text: `${subject} ${text}`,
          senderId: senderEmail,
          contactId: contact?.id as string | undefined,
        });
      }
    } else {
      // Delivery event (email.sent, email.delivered, email.opened, email.clicked, email.bounced, email.complained)
      const deliveryPayload = payload as ResendDeliveryEvent;
      const emailId = deliveryPayload.data.email_id;

      const eventTypeMap: Record<string, string> = {
        'email.sent': 'sent',
        'email.delivered': 'delivered',
        'email.opened': 'opened',
        'email.clicked': 'clicked',
        'email.bounced': 'bounced',
        'email.complained': 'unsubscribed',
      };

      const eventType = eventTypeMap[payload.type];
      if (!eventType) return;

      // Find outbound message by external_id (Resend email id)
      const { data: outbound } = await supabase
        .from('outbound_messages')
        .select('id, org_id')
        .eq('external_id', emailId)
        .single();

      if (outbound) {
        await supabase
          .from('outbound_messages')
          .update({
            status: eventType,
            ...(eventType === 'sent' ? { sent_at: new Date().toISOString() } : {}),
          })
          .eq('id', outbound.id);

        await supabase.from('delivery_logs').insert({
          org_id: outbound.org_id,
          outbound_message_id: outbound.id,
          event_type: eventType,
          metadata: { resend_event_type: payload.type },
          occurred_at: new Date(payload.created_at).toISOString(),
        });

        logger.info('Email delivery event processed', { emailId, eventType });
      } else {
        logger.debug('Outbound message not found for email delivery event', { emailId });
      }
    }
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Error processing email webhook', { error: error.message });
  }
}
