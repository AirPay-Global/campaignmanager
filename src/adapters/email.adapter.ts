import { Resend } from 'resend';
import { logger } from '../lib/logger';

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface EmailResult {
  email: string;
  status: 'sent' | 'failed';
  messageId?: string;
  error?: string;
}

export interface BulkEmailResult {
  successCount: number;
  failureCount: number;
  results: EmailResult[];
}

export function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function getFromAddress(fromOverride?: string, fromNameOverride?: string): string {
  const email = fromOverride ?? process.env.RESEND_FROM_EMAIL ?? 'campaigns@airpay.com.na';
  const name = fromNameOverride ?? process.env.RESEND_FROM_NAME ?? 'AirPay';
  return `${name} <${email}>`;
}

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const client = getResendClient();

  try {
    const response = await client.emails.send({
      from: getFromAddress(options.from, options.fromName),
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      reply_to: options.replyTo,
      tags: options.tags,
    });

    if (response.error) {
      logger.error('Email send error', { to: options.to, error: response.error });
      return { email: options.to, status: 'failed', error: response.error.message };
    }

    logger.info('Email sent', { to: options.to, messageId: response.data?.id });

    return {
      email: options.to,
      status: 'sent',
      messageId: response.data?.id,
    };
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Failed to send email', { to: options.to, error: error.message });
    return { email: options.to, status: 'failed', error: error.message };
  }
}

export async function sendBulkEmail(
  recipients: Array<{ email: string; variables?: Record<string, string> }>,
  baseOptions: Omit<EmailOptions, 'to'>,
  batchSize = 50,
  delayMs = 100,
): Promise<BulkEmailResult> {
  const chunks = chunkArray(recipients, batchSize);
  const allResults: EmailResult[] = [];

  for (const chunk of chunks) {
    const promises = chunk.map(async (recipient) => {
      const vars = recipient.variables ?? {};
      const subject = interpolate(baseOptions.subject, vars);
      const html = baseOptions.html ? interpolate(baseOptions.html, vars) : undefined;
      const text = baseOptions.text ? interpolate(baseOptions.text, vars) : undefined;

      return sendEmail({
        ...baseOptions,
        to: recipient.email,
        subject,
        html,
        text,
      });
    });

    const results = await Promise.allSettled(promises);
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allResults.push(result.value);
      } else {
        logger.error('Bulk email promise rejected', { reason: result.reason });
      }
    }

    // Delay between batches
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const successCount = allResults.filter((r) => r.status === 'sent').length;
  const failureCount = allResults.filter((r) => r.status === 'failed').length;

  logger.info('Bulk email complete', { total: allResults.length, successCount, failureCount });

  return { successCount, failureCount, results: allResults };
}
