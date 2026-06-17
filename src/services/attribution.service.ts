import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

export type AttributionSourceType =
  | 'manual'
  | 'import'
  | 'form'
  | 'whatsapp_inbound'
  | 'sms_inbound'
  | 'campaign'
  | 'api';

export interface RecordTouchParams {
  contactId: string;
  orgId: string;
  sourceType: AttributionSourceType;
  sourceId?: string;
  sourceName?: string;
  channel?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}

export async function recordTouch(params: RecordTouchParams): Promise<void> {
  const now = params.occurredAt ?? new Date().toISOString();

  try {
    // Insert attribution event
    await supabase.from('contact_attribution').insert({
      org_id: params.orgId,
      contact_id: params.contactId,
      source_type: params.sourceType,
      source_id: params.sourceId ?? null,
      source_name: params.sourceName ?? null,
      channel: params.channel ?? null,
      utm_source: params.utmSource ?? null,
      utm_medium: params.utmMedium ?? null,
      utm_campaign: params.utmCampaign ?? null,
      utm_content: params.utmContent ?? null,
      metadata: params.metadata ?? {},
      occurred_at: now,
    });

    // Fetch current first/last touch state
    const { data: contact } = await supabase
      .from('contacts')
      .select('first_touch_at, first_touch_source, last_touch_at')
      .eq('id', params.contactId)
      .single();

    if (!contact) return;

    const updates: Record<string, unknown> = {
      last_touch_source: params.sourceType,
      last_touch_at: now,
    };

    // Set first touch only if not already set
    if (!contact.first_touch_at) {
      updates['first_touch_source'] = params.sourceType;
      updates['first_touch_at'] = now;
      updates['source'] = params.sourceType;
    }

    await supabase.from('contacts').update(updates).eq('id', params.contactId);
  } catch (err) {
    logger.warn('Failed to record attribution touch', {
      contactId: params.contactId,
      error: (err as Error).message,
    });
  }
}

export interface AttributionSummary {
  source_type: string;
  count: number;
}

export async function getAttributionSummary(orgId: string): Promise<AttributionSummary[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('source')
    .eq('org_id', orgId)
    .not('source', 'is', null);

  if (error || !data) return [];

  const counts: Record<string, number> = {};
  for (const row of data) {
    const s = (row.source as string) ?? 'unknown';
    counts[s] = (counts[s] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([source_type, count]) => ({ source_type, count }))
    .sort((a, b) => b.count - a.count);
}
