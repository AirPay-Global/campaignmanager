import nodemailer from 'nodemailer';
import { logger } from '../lib/logger';

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function getFromAddress(fromOverride?: string, fromNameOverride?: string): string {
  const email = fromOverride ?? process.env.EMAIL_FROM_ADDRESS ?? 'campaigns@airpay.com.na';
  const name = fromNameOverride ?? process.env.EMAIL_FROM_NAME ?? 'AirPay';
  return `${name} <${email}>`;
}

function injectTracking(html: string, messageId: string, baseUrl: string): string {
  const pixel = `<img src="${baseUrl}/track/open/${encodeURIComponent(messageId)}" width="1" height="1" style="display:none;border:0;outline:none" alt="">`;

  let tracked = html.includes('</body>')
    ? html.replace('</body>', `${pixel}</body>`)
    : html + pixel;

  // Wrap http(s) links, skip already-wrapped tracking URLs
  tracked = tracked.replace(/href="(https?:\/\/[^"]+)"/g, (match, url: string) => {
    if (url.includes('/track/click/')) return match;
    return `href="${baseUrl}/track/click/${encodeURIComponent(messageId)}?url=${encodeURIComponent(url)}"`;
  });

  return tracked;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  messageId?: string;
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

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const transporter = createTransport();

  let htmlBody = options.html;
  if (htmlBody && options.messageId) {
    const baseUrl = process.env.APP_URL ?? '';
    if (baseUrl) htmlBody = injectTracking(htmlBody, options.messageId, baseUrl);
  }

  try {
    const info = await transporter.sendMail({
      from: getFromAddress(options.from, options.fromName),
      to: options.to,
      subject: options.subject,
      html: htmlBody,
      text: options.text,
      replyTo: options.replyTo,
    });

    logger.info('Email sent', { to: options.to, messageId: info.messageId });
    return { email: options.to, status: 'sent', messageId: info.messageId };
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
      return sendEmail({
        ...baseOptions,
        to: recipient.email,
        subject: interpolate(baseOptions.subject ?? '', vars),
        html: baseOptions.html ? interpolate(baseOptions.html, vars) : undefined,
        text: baseOptions.text ? interpolate(baseOptions.text, vars) : undefined,
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

    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const successCount = allResults.filter((r) => r.status === 'sent').length;
  const failureCount = allResults.filter((r) => r.status === 'failed').length;

  logger.info('Bulk email complete', { total: allResults.length, successCount, failureCount });
  return { successCount, failureCount, results: allResults };
}
