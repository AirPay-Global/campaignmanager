import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

type ChannelType = 'whatsapp' | 'sms' | 'email' | 'push';

export interface Contact {
  id: string;
  org_id: string;
  phone?: string;
  email?: string;
  name?: string;
  whatsapp_id?: string;
  tags: string[];
  custom_fields: Record<string, unknown>;
  opt_out_channels: ChannelType[];
  created_at: string;
  updated_at: string;
}

export interface Segment {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  filter_query: FilterQuery;
  contact_count: number;
  created_at: string;
  updated_at: string;
}

export interface FilterCondition {
  field: string;
  operator: 'eq' | 'neq' | 'contains' | 'within_days' | 'in' | 'gt' | 'lt';
  value: unknown;
}

export interface FilterQuery {
  conditions?: FilterCondition[];
  logic?: 'AND' | 'OR';
}

class SegmentService {
  async getSegments(orgId: string): Promise<Segment[]> {
    const { data, error } = await supabase
      .from('audience_segments')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to get segments', { orgId, error: error.message });
      throw new Error(`Failed to get segments: ${error.message}`);
    }

    return (data ?? []) as Segment[];
  }

  async resolveSegment(orgId: string, segmentId: string): Promise<Contact[]> {
    const { data: segment, error: segmentError } = await supabase
      .from('audience_segments')
      .select('*')
      .eq('id', segmentId)
      .eq('org_id', orgId)
      .single();

    if (segmentError || !segment) {
      throw new Error(`Segment not found: ${segmentId}`);
    }

    const filterQuery = (segment.filter_query as FilterQuery) ?? {};

    // Fetch all org contacts and filter in memory for complex queries
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('*')
      .eq('org_id', orgId);

    if (contactsError) {
      throw new Error(`Failed to fetch contacts for segment: ${contactsError.message}`);
    }

    const allContacts = (contacts ?? []) as Contact[];

    const conditions = filterQuery.conditions ?? [];
    const logic = filterQuery.logic ?? 'AND';

    if (conditions.length === 0) {
      return allContacts;
    }

    const filtered = allContacts.filter((contact) =>
      this.evaluateContact(contact, filterQuery),
    );

    // Update segment contact count
    await supabase
      .from('audience_segments')
      .update({ contact_count: filtered.length })
      .eq('id', segmentId);

    logger.info('Segment resolved', {
      segmentId,
      total: allContacts.length,
      matched: filtered.length,
      logic,
    });

    return filtered;
  }

  evaluateContact(contact: Contact, filterQuery: FilterQuery): boolean {
    const conditions = filterQuery.conditions ?? [];
    const logic = filterQuery.logic ?? 'AND';

    if (conditions.length === 0) return true;

    const results = conditions.map((condition) => this.evaluateCondition(contact, condition));

    return logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
  }

  private evaluateCondition(contact: Contact, condition: FilterCondition): boolean {
    const { field, operator, value } = condition;

    // Get field value from contact
    const contactValue = this.getFieldValue(contact, field);

    switch (operator) {
      case 'eq':
        return this.equals(contactValue, value);

      case 'neq':
        return !this.equals(contactValue, value);

      case 'contains': {
        if (Array.isArray(contactValue)) {
          return contactValue.includes(value);
        }
        if (typeof contactValue === 'string') {
          return contactValue.toLowerCase().includes(String(value).toLowerCase());
        }
        return false;
      }

      case 'within_days': {
        if (!contactValue) return false;
        const days = Number(value);
        const fieldDate = new Date(String(contactValue));
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        return fieldDate >= cutoff;
      }

      case 'in': {
        const values = Array.isArray(value) ? value : [value];
        return values.some((v) => this.equals(contactValue, v));
      }

      case 'gt':
        return Number(contactValue) > Number(value);

      case 'lt':
        return Number(contactValue) < Number(value);

      default:
        logger.warn('Unknown segment filter operator', { operator });
        return false;
    }
  }

  private getFieldValue(contact: Contact, field: string): unknown {
    // Direct contact fields
    const directFields: Record<string, unknown> = {
      phone: contact.phone,
      email: contact.email,
      name: contact.name,
      whatsapp_id: contact.whatsapp_id,
      tags: contact.tags,
      opt_out_channels: contact.opt_out_channels,
      created_at: contact.created_at,
      updated_at: contact.updated_at,
    };

    if (field in directFields) {
      return directFields[field];
    }

    // Check custom_fields
    if (contact.custom_fields && field in contact.custom_fields) {
      return contact.custom_fields[field];
    }

    return undefined;
  }

  private equals(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || a === undefined) return b === null || b === undefined;
    return String(a).toLowerCase() === String(b).toLowerCase();
  }
}

export const segmentService = new SegmentService();
export default segmentService;
