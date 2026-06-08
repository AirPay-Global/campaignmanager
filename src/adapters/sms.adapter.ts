import AfricasTalking from 'africastalking';
import { logger } from '../lib/logger';

let atInstance: ReturnType<typeof AfricasTalking> | null = null;

function getATInstance(): ReturnType<typeof AfricasTalking> {
  const apiKey = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;

  if (!apiKey || !username) {
    throw new Error("Missing Africa's Talking credentials: AT_API_KEY and AT_USERNAME are required");
  }

  // Re-create instance if credentials changed
  atInstance = AfricasTalking({ apiKey, username });
  return atInstance;
}

export interface SMSRecipient {
  phone: string;
  message?: string; // override per-recipient if needed
}

export interface SMSResult {
  phone: string;
  status: 'sent' | 'failed';
  messageId?: string;
  cost?: string;
  error?: string;
}

export interface BulkSMSResult {
  successCount: number;
  failureCount: number;
  results: SMSResult[];
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function sendSMS(
  phone: string,
  message: string,
  senderId?: string,
): Promise<SMSResult> {
  const at = getATInstance();
  const sms = at.SMS;
  const from = senderId ?? process.env.AT_SENDER_ID ?? 'AFRICASTKNG';

  try {
    const response = await sms.send({
      to: phone,
      message,
      from,
    });

    const recipient = response.SMSMessageData?.Recipients?.[0];
    const status = recipient?.status === 'Success' ? 'sent' : 'failed';

    logger.info('SMS sent', {
      phone,
      messageId: recipient?.messageId,
      status: recipient?.status,
      cost: recipient?.cost,
    });

    return {
      phone,
      status,
      messageId: recipient?.messageId,
      cost: recipient?.cost,
      error: status === 'failed' ? recipient?.status : undefined,
    };
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown; status?: number }; message?: string };
    const detail = error.response?.data
      ? `AT error ${error.response.status ?? ''}: ${JSON.stringify(error.response.data)}`
      : (error.message ?? 'Unknown error');
    logger.error('Failed to send SMS', { phone, error: detail });
    return { phone, status: 'failed', error: detail };
  }
}

export async function sendBulkSMS(
  recipients: SMSRecipient[],
  defaultMessage: string,
  senderId?: string,
  batchSize = 100,
): Promise<BulkSMSResult> {
  const at = getATInstance();
  const sms = at.SMS;
  const from = senderId ?? process.env.AT_SENDER_ID ?? 'AFRICASTKNG';

  const chunks = chunkArray(recipients, batchSize);
  const allResults: SMSResult[] = [];

  for (const chunk of chunks) {
    // Group recipients by message to minimize API calls
    const messageGroups = new Map<string, string[]>();
    for (const recipient of chunk) {
      const msg = recipient.message ?? defaultMessage;
      const group = messageGroups.get(msg) ?? [];
      group.push(recipient.phone);
      messageGroups.set(msg, group);
    }

    for (const [message, phones] of messageGroups) {
      try {
        const response = await sms.send({
          to: phones,
          message,
          from,
        });

        const apiRecipients = response.SMSMessageData?.Recipients ?? [];
        for (const r of apiRecipients) {
          allResults.push({
            phone: r.number,
            status: r.status === 'Success' ? 'sent' : 'failed',
            messageId: r.messageId,
            cost: r.cost,
            error: r.status !== 'Success' ? r.status : undefined,
          });
        }
      } catch (err: unknown) {
        const error = err as Error;
        logger.error('Bulk SMS batch failed', { phoneCount: phones.length, error: error.message });
        for (const phone of phones) {
          allResults.push({ phone, status: 'failed', error: error.message });
        }
      }
    }

    // Small delay between batches to avoid rate limiting
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  const successCount = allResults.filter((r) => r.status === 'sent').length;
  const failureCount = allResults.filter((r) => r.status === 'failed').length;

  logger.info('Bulk SMS complete', { total: allResults.length, successCount, failureCount });

  return { successCount, failureCount, results: allResults };
}
