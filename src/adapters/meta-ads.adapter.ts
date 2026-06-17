import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../lib/logger';

const API_VERSION = 'v21.0';
const BASE = `https://graph.facebook.com/${API_VERSION}`;

function getToken(): string {
  const t = process.env.META_ADS_ACCESS_TOKEN ?? process.env.FACEBOOK_ACCESS_TOKEN;
  if (!t) throw new Error('META_ADS_ACCESS_TOKEN is not configured');
  return t;
}

function getAdAccount(): string {
  const a = process.env.META_AD_ACCOUNT_ID ?? process.env.FACEBOOK_AD_ACCOUNT_ID;
  if (!a) throw new Error('META_AD_ACCOUNT_ID is not configured');
  return a.startsWith('act_') ? a : `act_${a}`;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export interface MetaAudienceCreateResult {
  id: string;
  name: string;
}

export async function createMetaAudience(
  name: string,
  description?: string,
): Promise<MetaAudienceCreateResult> {
  const token = getToken();
  const account = getAdAccount();

  const { data } = await axios.post<{ id: string; name: string }>(
    `${BASE}/${account}/customaudiences`,
    {
      name,
      description: description ?? '',
      subtype: 'CUSTOM',
      customer_file_source: 'USER_PROVIDED_ONLY',
    },
    { params: { access_token: token } },
  );

  logger.info('Meta custom audience created', { audienceId: data.id, name });
  return data;
}

export interface SyncContact {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
}

export interface MetaSyncResult {
  audience_id: string;
  num_received: number;
  num_invalid_entries: number;
  invalid_entry_samples?: Record<string, string>;
}

export async function syncContactsToMetaAudience(
  audienceId: string,
  contacts: SyncContact[],
  replace = false,
): Promise<MetaSyncResult> {
  const token = getToken();

  if (replace) {
    // Clear existing members first
    try {
      await axios.delete(`${BASE}/${audienceId}/users`, {
        params: { access_token: token },
        data: { payload: { schema: ['EMAIL'], data: [] } },
      });
    } catch {
      // Non-fatal — audience may already be empty
    }
  }

  // Build hashed payload — Meta requires SHA-256 hashed PII
  const rows: string[][] = [];
  for (const c of contacts) {
    const row: string[] = [];
    if (c.email?.trim()) row.push(sha256(c.email));
    else row.push('');
    if (c.phone?.trim()) {
      // Normalise: strip non-digits, ensure leading +
      const normalized = c.phone.replace(/[^\d+]/g, '');
      row.push(sha256(normalized));
    } else {
      row.push('');
    }
    // Only include rows with at least one identifier
    if (row[0] || row[1]) rows.push(row);
  }

  if (rows.length === 0) {
    return { audience_id: audienceId, num_received: 0, num_invalid_entries: 0 };
  }

  const { data } = await axios.post<MetaSyncResult>(
    `${BASE}/${audienceId}/users`,
    {
      payload: {
        schema: ['EMAIL', 'PHONE'],
        data: rows,
      },
    },
    { params: { access_token: token } },
  );

  logger.info('Meta audience synced', { audienceId, uploaded: rows.length, received: data.num_received });
  return { ...data, audience_id: audienceId };
}

export async function deleteMetaAudience(audienceId: string): Promise<void> {
  const token = getToken();
  await axios.delete(`${BASE}/${audienceId}`, { params: { access_token: token } });
  logger.info('Meta custom audience deleted', { audienceId });
}
