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

    // Mark as running
    await supabase
      .from('campaigns')
      .update({ status: 'running', launched_at: new Date().toISOString() })
      .eq('id', campaignId);

    logger.info('Campaign launching', { campaignId, channel: c.channel });

    // Resolve audience
    let contacts: Contact[] = [];
    if (c.segment_id) {
      contacts = await segmentService.resolveSegment(c.org_id, c.segment_id);
    } else {
      // All contacts in the org
      const { data } = await supabase
        .from('contacts')
        .select('id, phone, email, whatsapp_id, name, custom_fields, opt_out_channels')
        .eq('org_id', c.org_id);
      contacts = (data as Contact[]) ?? [];
    }

    // Filter opted-out contacts
    const eligible = contacts.filter(
      (contact) => !contact.opt_out_channels?.includes(c.channel),
    );

    logger.info('Campaign audience resolved', {
      campaignId,
      total: contacts.length,
      eligible: eligible.length,
    });

    let enqueued = 0;

    // Create campaign messages
    for (const contact of eligible) {
      const recipientId = this.getRecipientId(c.channel, contact);
      if (!recipientId) continue;

      const templateVars = this.interpolateVariables(c.template_vars, contact);
      const scheduledAt = c.scheduled_at
        ? this.calculateScheduledAt(c.scheduled_at, enqueued)
        : null;

      const { error } = await supabase.from('campaign_messages').insert({
        campaign_id: campaignId,
        contact_id: contact.id,
        org_id: c.org_id,
        channel: c.channel,
        recipient_id: recipientId,
        template_vars: templateVars,
        status: 'pending',
        scheduled_at: scheduledAt,
      });

      if (!error) {
        enqueued++;
      } else {
        logger.warn('Failed to create campaign message', {
          campaignId,
          contactId: contact.id,
          error: error.message,
        });
      }
    }

    logger.info('Campaign messages enqueued', { campaignId, enqueued });

    await auditService.log(
      c.org_id,
      userId ?? null,
      'campaign.launched',
      'campaign',
      campaignId,
      { enqueued, total: contacts.length, eligible: eligible.length },
    );

    return { enqueued };
  }

  async pause(campaignId: string, userId?: string): Promise<void> {
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('id, org_id, status')
      .eq('id', campaignId)
      .single();

    if (error || !campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    if (campaign.status !== 'running') {
      throw new Error(`Campaign is not running (status: ${campaign.status})`);
    }

    await supabase
      .from('campaigns')
      .update({ status: 'paused' })
      .eq('id', campaignId);

    await auditService.log(
      campaign.org_id as string,
      userId ?? null,
      'campaign.paused',
      'campaign',
      campaignId,
      {},
    );

    logger.info('Campaign paused', { campaignId });
  }

  getRecipientId(channel: ChannelType, contact: Contact): string | null {
    switch (channel) {
      case 'whatsapp':
        return contact.whatsapp_id ?? contact.phone ?? null;
      case 'sms':
        return contact.phone ?? null;
      case 'email':
        return contact.email ?? null;
      default:
        return null;
    }
  }

  interpolateVariables(
    templateVars: Record<string, string>,
    contact: Contact,
  ): Record<string, string> {
    const contactFields: Record<string, string> = {
      name: contact.name ?? '',
      phone: contact.phone ?? '',
      email: contact.email ?? '',
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
    // Stagger messages: send up to 60 per minute (1 per second spread)
    const base = new Date(baseScheduledAt).getTime();
    const staggerMs = Math.floor(offset / 60) * 60_000 + (offset % 60) * 1000;
    return new Date(base + staggerMs).toISOString();
  }
}

export const campaignEngine = new CampaignEngine();
export default campaignEngine;
