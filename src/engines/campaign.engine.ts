import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { segmentService } from '../services/segment.service';
import { auditService } from '../services/audit.service';

type ChannelType = 'whatsapp' | 'sms' | 'email' | 'push';

interface Campaign {
  id: string;
  org_id: string;
  name: string;
  channel: ChannelType;
  status: string;
  segment_id: string | null;
  template_name: string | null;
  template_vars: Record<string, string>;
  message_body: string | null;
  subject: string | null;
  from_name: string | null;
  scheduled_at: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  ab_test_id: string | null;
  ab_variant_label: string | null;
}

interface Contact {
  id: string;
  phone?: string;
  email?: string;
  whatsapp_id?: string;
  name?: string;
  custom_fields?: Record<string, unknown>;
  opt_out_channels?: string[];
}

class CampaignEngine {
  async launch(campaignId: string, userId?: string): Promise<{ enqueued: number }> {
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    const c = campaign as Campaign;

    if (!['draft', 'scheduled', 'paused'].includes(c.status)) {
      throw new Error(`Campaign cannot be launched from status: ${c.status}`);
    }

    // If this is variant A of an A/B test, launch the full test instead
    if (c.ab_test_id && c.ab_variant_label === 'A') {
      const result = await this.launchABTest(c.ab_test_id, userId);
      return { enqueued: result.enqueuedA + result.enqueuedB };
    }

    await supabase
      .from('campaigns')
      .update({ status: 'running', launched_at: new Date().toISOString() })
      .eq('id', campaignId);

    logger.info('Campaign launching', { campaignId, channel: c.channel });

    const contacts = await this.resolveAudience(c.org_id, c.segment_id, c.channel);
    const enqueued = await this.createMessagesForContacts(c, contacts);

    logger.info('Campaign messages enqueued', { campaignId, enqueued });

    await auditService.log(c.org_id, userId ?? null, 'campaign.launched', 'campaign', campaignId, {
      enqueued,
    });

    return { enqueued };
  }

  async launchABTest(
    abTestId: string,
    userId?: string,
  ): Promise<{ enqueuedA: number; enqueuedB: number }> {
    const { data: test, error: testError } = await supabase
      .from('ab_tests')
      .select('*')
      .eq('id', abTestId)
      .single();

    if (testError || !test) throw new Error(`A/B test not found: ${abTestId}`);

    const { data: variants, error: varError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('ab_test_id', abTestId);

    if (varError || !variants || variants.length < 2) {
      throw new Error('A/B test must have exactly two variants');
    }

    const variantA = (variants as Campaign[]).find((v) => v.ab_variant_label === 'A');
    const variantB = (variants as Campaign[]).find((v) => v.ab_variant_label === 'B');

    if (!variantA || !variantB) throw new Error('Could not find both A/B variants');

    if (!['draft', 'scheduled', 'paused'].includes(variantA.status)) {
      throw new Error(`Variant A cannot be launched from status: ${variantA.status}`);
    }

    // Resolve full audience from variant A's config (segment + channel opt-outs)
    const allContacts = await this.resolveAudience(variantA.org_id, variantA.segment_id, variantA.channel);

    // Shuffle for random split, then divide by split_percent
    const shuffled = this.shuffle(allContacts);
    const splitIdx = Math.max(1, Math.floor(shuffled.length * (test.split_percent as number) / 100));
    const contactsA = shuffled.slice(0, splitIdx);
    const contactsB = shuffled.slice(splitIdx);

    const now = new Date().toISOString();
    await supabase.from('campaigns').update({ status: 'running', launched_at: now }).eq('id', variantA.id);
    await supabase.from('campaigns').update({ status: 'running', launched_at: now }).eq('id', variantB.id);
    await supabase.from('ab_tests').update({ status: 'running' }).eq('id', abTestId);

    const [enqueuedA, enqueuedB] = await Promise.all([
      this.createMessagesForContacts(variantA, contactsA),
      this.createMessagesForContacts(variantB, contactsB),
    ]);

    logger.info('A/B test launched', { abTestId, enqueuedA, enqueuedB });

    await auditService.log(variantA.org_id, userId ?? null, 'campaign.launched', 'campaign', abTestId, {
      ab_test: true, enqueuedA, enqueuedB,
    });

    return { enqueuedA, enqueuedB };
  }

  async pause(campaignId: string, userId?: string): Promise<void> {
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('id, org_id, status')
      .eq('id', campaignId)
      .single();

    if (error || !campaign) throw new Error(`Campaign not found: ${campaignId}`);

    if (campaign.status !== 'running') {
      throw new Error(`Campaign is not running (status: ${campaign.status})`);
    }

    await supabase.from('campaigns').update({ status: 'paused' }).eq('id', campaignId);

    await auditService.log(campaign.org_id as string, userId ?? null, 'campaign.paused', 'campaign', campaignId, {});
    logger.info('Campaign paused', { campaignId });
  }

  // ─── Shared helpers ──────────────────────────────────────────────────────

  async resolveAudience(orgId: string, segmentId: string | null, channel: ChannelType): Promise<Contact[]> {
    let contacts: Contact[];

    if (segmentId) {
      contacts = await segmentService.resolveSegment(orgId, segmentId);
    } else {
      const { data } = await supabase
        .from('contacts')
        .select('id, phone, email, whatsapp_id, name, custom_fields, opt_out_channels')
        .eq('org_id', orgId);
      contacts = (data as Contact[]) ?? [];
    }

    return contacts.filter((c) => !c.opt_out_channels?.includes(channel));
  }

  async createMessagesForContacts(campaign: Campaign, contacts: Contact[]): Promise<number> {
    let enqueued = 0;

    for (const contact of contacts) {
      const recipientId = this.getRecipientId(campaign.channel, contact);
      if (!recipientId) continue;

      // Merge WA-specific metadata as reserved keys so the queue engine can route correctly
      const rawVars = { ...campaign.template_vars };
      if (campaign.channel === 'whatsapp' && campaign.metadata) {
        const meta = campaign.metadata as Record<string, unknown>;
        if (meta.wa_language) rawVars['__lang'] = meta.wa_language as string;
        if (meta.wa_account_id) rawVars['__account_id'] = meta.wa_account_id as string;
      }
      const templateVars = this.interpolateVariables(rawVars, contact);
      const scheduledAt = campaign.scheduled_at
        ? this.calculateScheduledAt(campaign.scheduled_at, enqueued)
        : null;

      const { error } = await supabase.from('campaign_messages').insert({
        campaign_id: campaign.id,
        contact_id: contact.id,
        org_id: campaign.org_id,
        channel: campaign.channel,
        recipient_id: recipientId,
        template_vars: templateVars,
        status: 'pending',
        scheduled_at: scheduledAt,
      });

      if (!error) {
        enqueued++;
      } else {
        logger.warn('Failed to create campaign message', {
          campaignId: campaign.id,
          contactId: contact.id,
          error: error.message,
        });
      }
    }

    return enqueued;
  }

  getRecipientId(channel: ChannelType, contact: Contact): string | null {
    switch (channel) {
      case 'whatsapp': return contact.whatsapp_id ?? contact.phone ?? null;
      case 'sms':      return contact.phone ?? null;
      case 'email':    return contact.email ?? null;
      default:         return null;
    }
  }

  interpolateVariables(templateVars: Record<string, string>, contact: Contact): Record<string, string> {
    const contactFields: Record<string, string> = {
      name:       contact.name ?? '',
      phone:      contact.phone ?? '',
      email:      contact.email ?? '',
      first_name: (contact.name ?? '').split(' ')[0] ?? '',
      ...Object.fromEntries(
        Object.entries(contact.custom_fields ?? {}).map(([k, v]) => [k, String(v)]),
      ),
    };

    const interpolated: Record<string, string> = {};
    for (const [key, value] of Object.entries(templateVars)) {
      interpolated[key] = value.replace(/\{\{(\w+)\}\}/g, (_, field: string) =>
        contactFields[field] ?? `{{${field}}}`,
      );
    }
    return interpolated;
  }

  calculateScheduledAt(baseScheduledAt: string, offset: number): string {
    const base = new Date(baseScheduledAt).getTime();
    const staggerMs = Math.floor(offset / 60) * 60_000 + (offset % 60) * 1000;
    return new Date(base + staggerMs).toISOString();
  }

  private shuffle<T>(arr: T[]): T[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

export const campaignEngine = new CampaignEngine();
export default campaignEngine;
