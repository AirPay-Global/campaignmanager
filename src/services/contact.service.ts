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

export interface CreateContactInput {
  phone?: string;
  email?: string;
  name?: string;
  whatsapp_id?: string;
  tags?: string[];
  custom_fields?: Record<string, unknown>;
}

export interface UpdateContactInput {
  phone?: string;
  email?: string;
  name?: string;
  whatsapp_id?: string;
  tags?: string[];
  custom_fields?: Record<string, unknown>;
}

export interface PaginatedContacts {
  data: Contact[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

class ContactService {
  async getContacts(
    orgId: string,
    page = 1,
    limit = 50,
    search?: string,
  ): Promise<PaginatedContacts> {
    const offset = (page - 1) * limit;

    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`,
      );
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('Failed to get contacts', { orgId, error: error.message });
      throw new Error(`Failed to get contacts: ${error.message}`);
    }

    const total = count ?? 0;

    return {
      data: (data ?? []) as Contact[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getContact(orgId: string, contactId: string): Promise<Contact | null> {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .eq('org_id', orgId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get contact: ${error.message}`);
    }

    return data as Contact;
  }

  async createContact(orgId: string, input: CreateContactInput): Promise<Contact> {
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        org_id: orgId,
        phone: input.phone ?? null,
        email: input.email ?? null,
        name: input.name ?? null,
        whatsapp_id: input.whatsapp_id ?? null,
        tags: input.tags ?? [],
        custom_fields: input.custom_fields ?? {},
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create contact', { orgId, error: error.message });
      throw new Error(`Failed to create contact: ${error.message}`);
    }

    logger.info('Contact created', { orgId, contactId: data.id });
    return data as Contact;
  }

  async updateContact(
    orgId: string,
    contactId: string,
    input: UpdateContactInput,
  ): Promise<Contact> {
    const updateData: Partial<Contact> = {};
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.email !== undefined) updateData.email = input.email;
    if (input.name !== undefined) updateData.name = input.name;
    if (input.whatsapp_id !== undefined) updateData.whatsapp_id = input.whatsapp_id;
    if (input.tags !== undefined) updateData.tags = input.tags;
    if (input.custom_fields !== undefined) updateData.custom_fields = input.custom_fields;

    const { data, error } = await supabase
      .from('contacts')
      .update(updateData)
      .eq('id', contactId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update contact', { orgId, contactId, error: error.message });
      throw new Error(`Failed to update contact: ${error.message}`);
    }

    return data as Contact;
  }

  async optOut(
    orgId: string,
    contactId: string,
    channels: ChannelType[],
  ): Promise<Contact> {
    const { data: existing, error: fetchError } = await supabase
      .from('contacts')
      .select('opt_out_channels')
      .eq('id', contactId)
      .eq('org_id', orgId)
      .single();

    if (fetchError || !existing) {
      throw new Error('Contact not found');
    }

    const current = (existing.opt_out_channels as ChannelType[]) ?? [];
    const merged = [...new Set([...current, ...channels])];

    const { data, error } = await supabase
      .from('contacts')
      .update({ opt_out_channels: merged })
      .eq('id', contactId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to opt out contact: ${error.message}`);
    }

    logger.info('Contact opted out', { orgId, contactId, channels });
    return data as Contact;
  }

  async importContacts(
    orgId: string,
    contacts: CreateContactInput[],
  ): Promise<{ imported: number; failed: number; errors: string[]; importedIds: string[] }> {
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];
    const importedIds: string[] = [];

    // Deduplicate by phone (last entry wins) before batching so that
    // within-batch duplicates don't trigger a PG "cannot affect row a second time" error.
    const seen = new Map<string, CreateContactInput>();
    for (const c of contacts) {
      const key = c.phone ?? c.email ?? c.whatsapp_id ?? JSON.stringify(c);
      seen.set(key, c);
    }
    const deduped = Array.from(seen.values());

    // Process in batches of 100
    const batchSize = 100;
    for (let i = 0; i < deduped.length; i += batchSize) {
      const batch = deduped.slice(i, i + batchSize);
      const rows = batch.map((c) => ({
        org_id: orgId,
        phone: c.phone ?? null,
        email: c.email ?? null,
        name: c.name ?? null,
        whatsapp_id: c.whatsapp_id ?? null,
        tags: c.tags ?? [],
        custom_fields: c.custom_fields ?? {},
      }));

      const { data, error } = await supabase
        .from('contacts')
        .upsert(rows, { onConflict: 'org_id,phone', ignoreDuplicates: false })
        .select('id');

      if (error) {
        logger.error('Batch import failed', { orgId, error: error.message });
        failed += batch.length;
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      } else {
        imported += (data?.length ?? 0);
        importedIds.push(...(data ?? []).map((r: { id: string }) => r.id));
      }
    }

    const duplicatesRemoved = contacts.length - deduped.length;
    logger.info('Contact import complete', { orgId, imported, failed, duplicatesRemoved });
    return { imported, failed, errors, importedIds };
  }
}

export const contactService = new ContactService();
export default contactService;
