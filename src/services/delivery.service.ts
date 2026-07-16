import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

export interface CampaignStats {
  campaignId: string;
  total: number;
  pending: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  bounced: number;
  opened: number;
  clicked: number;
  replies: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  failureRate: number;
}

export interface MessageDeliveryStatus {
  messageId: string;
  channel: string;
  recipientId: string;
  status: string;
  externalId: string | null;
  sentAt: string | null;
  retryCount: number;
  errorMessage: string | null;
  events: Array<{
    eventType: string;
    occurredAt: string;
    metadata: Record<string, unknown>;
  }>;
}

type DeliveryEventType = 'sent' | 'delivered' | 'read' | 'failed' | 'bounced' | 'clicked' | 'opened' | 'unsubscribed';

class DeliveryService {
  async getCampaignStats(campaignId: string): Promise<CampaignStats> {
    const { data: messages, error } = await supabase
      .from('campaign_messages')
      .select('status')
      .eq('campaign_id', campaignId);

    if (error) {
      logger.error('Failed to get campaign stats', { campaignId, error: error.message });
      throw new Error(`Failed to get campaign stats: ${error.message}`);
    }

    const allMessages = (messages ?? []) as Array<{ status: string }>;
    const total = allMessages.length;

    const counts = allMessages.reduce(
      (acc, msg) => {
        const status = msg.status as keyof typeof acc;
        if (status in acc) acc[status]++;
        return acc;
      },
      { pending: 0, queued: 0, sent: 0, delivered: 0, read: 0, failed: 0, bounced: 0 },
    );

    // Count unique opens and clicks from delivery_logs via outbound_messages
    const { data: outboundIds } = await supabase
      .from('outbound_messages')
      .select('id')
      .eq('campaign_id', campaignId);

    const msgIds = (outboundIds ?? []).map((m: { id: string }) => m.id);

    let opened = 0;
    let clicked = 0;

    if (msgIds.length > 0) {
      const { data: openRows } = await supabase
        .from('delivery_logs')
        .select('outbound_message_id')
        .in('outbound_message_id', msgIds)
        .eq('event_type', 'opened');

      const { data: clickRows } = await supabase
        .from('delivery_logs')
        .select('outbound_message_id')
        .in('outbound_message_id', msgIds)
        .eq('event_type', 'clicked');

      // Count unique per message (an email client may fire the pixel multiple times)
      opened = new Set((openRows ?? []).map((r: { outbound_message_id: string }) => r.outbound_message_id)).size;
      clicked = new Set((clickRows ?? []).map((r: { outbound_message_id: string }) => r.outbound_message_id)).size;
    }

    // Count inbound replies attributed to this campaign
    const { count: replyCount } = await supabase
      .from('inbound_messages')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);
    const replies = replyCount ?? 0;

    const deliveryRate = total > 0 ? (counts.delivered + counts.read) / total : 0;
    const openRate = total > 0 ? opened / total : 0;
    const clickRate = total > 0 ? clicked / total : 0;
    const replyRate = total > 0 ? replies / total : 0;
    const failureRate = total > 0 ? (counts.failed + counts.bounced) / total : 0;

    return {
      campaignId,
      total,
      ...counts,
      opened,
      clicked,
      replies,
      deliveryRate: Math.round(deliveryRate * 10000) / 100,
      openRate: Math.round(openRate * 10000) / 100,
      clickRate: Math.round(clickRate * 10000) / 100,
      replyRate: Math.round(replyRate * 10000) / 100,
      failureRate: Math.round(failureRate * 10000) / 100,
    };
  }

  async getMessageDeliveryStatus(messageId: string): Promise<MessageDeliveryStatus | null> {
    const { data: message, error } = await supabase
      .from('outbound_messages')
      .select(`
        id,
        channel,
        recipient_id,
        status,
        external_id,
        sent_at,
        retry_count,
        error_message
      `)
      .eq('id', messageId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get message delivery status: ${error.message}`);
    }

    const { data: events, error: eventsError } = await supabase
      .from('delivery_logs')
      .select('event_type, occurred_at, metadata')
      .eq('outbound_message_id', messageId)
      .order('occurred_at', { ascending: true });

    if (eventsError) {
      logger.warn('Failed to get delivery events', { messageId, error: eventsError.message });
    }

    return {
      messageId: message.id as string,
      channel: message.channel as string,
      recipientId: message.recipient_id as string,
      status: message.status as string,
      externalId: message.external_id as string | null,
      sentAt: message.sent_at as string | null,
      retryCount: message.retry_count as number,
      errorMessage: message.error_message as string | null,
      events: ((events ?? []) as Array<{ event_type: string; occurred_at: string; metadata: Record<string, unknown> }>).map((e) => ({
        eventType: e.event_type,
        occurredAt: e.occurred_at,
        metadata: e.metadata ?? {},
      })),
    };
  }

  async logDeliveryEvent(
    outboundMessageId: string,
    eventType: DeliveryEventType,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    // Get org_id from the outbound message
    const { data: message, error: msgError } = await supabase
      .from('outbound_messages')
      .select('org_id')
      .eq('id', outboundMessageId)
      .single();

    if (msgError || !message) {
      logger.warn('Could not find outbound message for delivery event', {
        outboundMessageId,
        eventType,
      });
      return;
    }

    const { error } = await supabase.from('delivery_logs').insert({
      org_id: message.org_id,
      outbound_message_id: outboundMessageId,
      event_type: eventType,
      metadata,
      occurred_at: new Date().toISOString(),
    });

    if (error) {
      logger.error('Failed to log delivery event', {
        outboundMessageId,
        eventType,
        error: error.message,
      });
    }
  }
}

export const deliveryService = new DeliveryService();
export default deliveryService;
