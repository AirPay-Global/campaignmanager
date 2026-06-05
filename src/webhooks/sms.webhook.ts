import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { mandateEngine } from '../engines/mandate.engine';

// Africa's Talking delivery status mapping
export function mapATStatus(
  atStatus: string,
): 'sent' | 'delivered' | 'failed' | 'bounced' {
  const map: Record<string, 'sent' | 'delivered' | 'failed' | 'bounced'> = {
    Success: 'sent',
    Sent: 'sent',
    Submitted: 'sent',
    Buffered: 'sent',
    Delivered: 'delivered',
    Failed: 'failed',
    'User Not Found': 'failed',
    'Insufficient Credit': 'failed',
    'No Network Coverage': 'failed',
    Rejected: 'bounced',
    'Invalid Link Id': 'failed',
    Expired: 'failed',
  };
  return map[atStatus] ?? 'failed';
}

export async function handleSMSWebhook(req: Request, res: Response): Promise<void> {
  res.sendStatus(200);

  try {
    const body = req.body as {
      from?: string;
      to?: string;
      text?: string;
      id?: string;
      date?: string;
      linkId?: string;
    };

    const senderId = body.from;
    const recipientShortcode = body.to;
    const text = body.text ?? '';
    const externalId = body.id;

    if (!senderId) {
      logger.warn('SMS webhook received without sender', { body });
      return;
    }

    const orgId = process.env.DEFAULT_ORG_ID;
    if (!orgId) {
      logger.warn('No DEFAULT_ORG_ID configured for SMS webhook');
      return;
    }

    logger.info('Inbound SMS received', {
      from: senderId,
      to: recipientShortcode,
      text,
      id: externalId,
    });

    // Upsert contact
    const { data: contact } = await supabase
      .from('contacts')
      .upsert(
        { org_id: orgId, phone: senderId },
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
        channel: 'sms',
        sender_id: senderId,
        body: text,
        external_id: externalId,
        raw_payload: body,
        processed_at: null,
      })
      .select('id')
      .single();

    if (inboundError) {
      logger.error('Failed to store inbound SMS', { error: inboundError.message });
      return;
    }

    // Process through mandate engine
    if (inbound && text) {
      await mandateEngine.process({
        inboundMessageId: inbound.id as string,
        orgId,
        channel: 'sms',
        text,
        senderId,
        contactId: contact?.id as string | undefined,
      });
    }
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Error processing SMS webhook', { error: error.message });
  }
}

export async function handleSMSDeliveryReport(req: Request, res: Response): Promise<void> {
  res.sendStatus(200);

  try {
    const body = req.body as {
      id?: string;
      status?: string;
      phoneNumber?: string;
      networkCode?: string;
      failureReason?: string;
      retryCount?: string;
    };

    const externalId = body.id;
    const atStatus = body.status ?? '';
    const mappedStatus = mapATStatus(atStatus);

    if (!externalId) {
      logger.warn('SMS delivery report without message id', { body });
      return;
    }

    logger.info('SMS delivery report received', {
      id: externalId,
      status: atStatus,
      mappedStatus,
    });

    // Find outbound message
    const { data: outbound } = await supabase
      .from('outbound_messages')
      .select('id, org_id')
      .eq('external_id', externalId)
      .single();

    if (!outbound) {
      logger.warn('Outbound message not found for delivery report', { externalId });
      return;
    }

    await supabase
      .from('outbound_messages')
      .update({
        status: mappedStatus,
        ...(mappedStatus === 'sent' || mappedStatus === 'delivered'
          ? { sent_at: new Date().toISOString() }
          : {}),
        ...(mappedStatus === 'failed' || mappedStatus === 'bounced'
          ? { error_message: body.failureReason ?? atStatus }
          : {}),
      })
      .eq('id', outbound.id);

    await supabase.from('delivery_logs').insert({
      org_id: outbound.org_id,
      outbound_message_id: outbound.id,
      event_type: mappedStatus,
      metadata: {
        at_status: atStatus,
        network_code: body.networkCode,
        failure_reason: body.failureReason,
        retry_count: body.retryCount,
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Error processing SMS delivery report', { error: error.message });
  }
}
