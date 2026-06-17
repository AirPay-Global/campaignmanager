import { logger } from '../lib/logger';

// Google Ads Customer Match requires OAuth2 + Google Ads API v18.
// Set GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_REFRESH_TOKEN,
// GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET to enable.

export interface GoogleSyncResult {
  user_list_id: string;
  uploaded: number;
}

export async function syncContactsToGoogleAudience(
  _userListId: string,
  _contacts: Array<{ email?: string | null; phone?: string | null }>,
): Promise<GoogleSyncResult> {
  const configured =
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN;

  if (!configured) {
    throw new Error(
      'Google Ads is not configured. Set GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID, and GOOGLE_ADS_REFRESH_TOKEN in your environment.',
    );
  }

  // Full implementation requires googleapis npm package and Customer Match API.
  // Placeholder until credentials are supplied.
  logger.warn('Google Ads sync called but not fully implemented');
  throw new Error('Google Ads sync is not yet implemented. Contact support to enable this feature.');
}
