import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { markWhatsAppRead } from '../adapters/whatsapp.adapter';
import { mandateEngine } from '../engines/mandate.engine';

interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: { display_phone_number: string; phone_number_id: string };
      contacts?: Array<{ profile: { name: string }; wa_id: string }>;
      messages?: Array<{
        from: string;
        id: string;
        timestamp: string;
        text?: { body: string };
        type: string;
        image?: { id: string; mime_type: string; sha256: string };
        document?: { id: string; mime_type: string; filename: string };
        audio?: { id: string; mime_type: string };
        video?: { id: string; mime_type: string };
        sticker?: { id: string; mime_type: string };
        location?: { latitude: number; longitude: number; name?: string };
      }>;
      statuses?: Array<{
        id: string;
        status: string;
        timestamp: string;
        recipient_id: string;
        errors?: Array<{ code: number; title: string }>;
      }>;
    };
    field: string;
  }>;
}

interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppWebhookEntry[];
}

export function verifyWhatsAppWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'] as string;
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    logger.info('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    logger.warn('WhatsApp webhook verification failed', { mode, token });
    res.sendStatus(403);
  }
}

export function validateMetaSignature(req: Request): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    logger.warn('WHATSAPP_APP_SECRET not set; skipping signature validation');
    return true;
  }

  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  if (!signature) {
    logger.warn('Missing x-hub-signature-256 header');
    return false;
  }

  const body = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(body).digest('hex')}`;

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function getOrgFromPhoneNumber(phoneNumberId: string): Promise<string | null> {
  // Look up org by phone number id stored in org settings
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .filter('settings->>whatsapp_phone_number_id', 'eq', phoneNumberId)
    .limit(1)
    .single();

  if (error || !data) {
    // Fall back to default org
    const defaultOrgId = process.env.DEFAULT_ORG_ID;
    if (defaultOrgId) return defaultOrgId;
    return null;
  }

  return data.id as string;
}

export async function handleWhatsAppWebhook(req: Request, res: Response): Promise<void> {
  // Always respond 200 quickly to Meta
  res.sendStatus(200);

  if (!validateMetaSignature(req)) {
    logger.warn('Invalid Meta webhook signature');
    return;
  }

  const payload = req.body as WhatsAppWebhookPayload;

  if (payload.object !== 'whatsapp_business_account') {
    return;
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;

      const { value } = change;
      const phoneNumberId = value.metadata?.phone_number_id;
      const orgId = await getOrgFromPhoneNumber(phoneNumberId);

      if (!orgId) {
        logger.warn('Could not resolve org from phone number id', { phoneNumberId });
        continue;
      }

      // Handle incoming messages
      for (const message of value.messages ?? []) {
        const senderWaId = message.from;
        const senderName = value.contacts?.find((c) => c.wa_id === senderWaId)?.profile?.name;
        const body = message.text?.body ?? '';
        const messageType = message.type;

        try {
          // Upsert contact
          const { data: contact } = await supabase
            .from('contacts')
            .upsert(
              {
                org_id: orgId,
                whatsapp_id: senderWaId,
                phone: `+${senderWaId}`,
                name: senderName,
              },
              { onConflict: 'org_id,phone', ignoreDuplicates: false },
            )
            .select('id')
            .single();

          // Store inbound message
          const { data: inbound, error: inboundError } = await supabase
            .from('inbound_messages')
            .insert({
              org_id: orgId,
              contact_id: contact?.id ?? null,
              channel: 'whatsapp',
              sender_id: senderWaId,
              body,
              external_id: message.id,
              raw_payload: message,
            })
            .select('id')
            .single();

          if (inboundError) {
            logger.error('Failed to store inbound WhatsApp message', { error: inboundError.message });
            continue;
          }

          // Mark as read
          await markWhatsAppRead(message.id, phoneNumberId);

          // Process through mandate engine (only for text messages)
          if (messageType === 'text' && body && inbound) {
            await mandateEngine.process({
              inboundMessageId: inbound.id as string,
              orgId,
              channel: 'whatsapp',
              text: body,
              senderId: senderWaId,
              contactId: contact?.id as string | undefined,
            });
          }

          logger.info('WhatsApp inbound message processed', {
            orgId,
            senderId: senderWaId,
            messageId: message.id,
            type: messageType,
          });
        } catch (err: unknown) {
          const error = err as Error;
          logger.error('Error processing WhatsApp message', {
            error: error.message,
            messageId: message.id,
          });
        }
      }

      // Handle status updates
      for (const status of value.statuses ?? []) {
        try {
          const eventTypeMap: Record<string, string> = {
            sent: 'sent',
            delivered: 'delivered',
            read: 'read',
            failed: 'failed',
          };

          const eventType = eventTypeMap[status.status];
          if (!eventType) continue;

          // Find the outbound message by external_id
          const { data: outbound } = await supabase
            .from('outbound_messages')
            .select('id')
            .eq('external_id', status.id)
            .eq('org_id', orgId)
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
              org_id: orgId,
              outbound_message_id: outbound.id,
              event_type: eventType,
              metadata: { status: status.status, errors: status.errors },
              occurred_at: new Date(Number(status.timestamp) * 1000).toISOString(),
            });
          }
        } catch (err: unknown) {
          const error = err as Error;
          logger.error('Error processing WhatsApp status update', {
            error: error.message,
            statusId: status.id,
          });
        }
      }
    }
  }
}
