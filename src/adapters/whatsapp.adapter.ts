import axios from 'axios';
import { logger } from '../lib/logger';

const WHATSAPP_API_VERSION = 'v25.0';
const BASE_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

export interface WhatsAppTemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters: Array<{
    type: 'text' | 'image' | 'document' | 'video' | 'currency' | 'date_time';
    text?: string;
    image?: { link: string };
    document?: { link: string };
    video?: { link: string };
  }>;
  sub_type?: string;
  index?: number;
}

export interface SendWhatsAppTemplateOptions {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: WhatsAppTemplateComponent[];
  phoneNumberId?: string;
}

export interface SendWhatsAppTextOptions {
  to: string;
  text: string;
  previewUrl?: boolean;
  phoneNumberId?: string;
}

export interface WhatsAppMessageResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

function getPhoneNumberId(override?: string): string {
  const id = override ?? process.env.WHATSAPP_PHONE_ID ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID is not configured');
  }
  return id;
}

function getAccessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) {
    throw new Error('WHATSAPP_ACCESS_TOKEN is not configured');
  }
  return token;
}

export async function sendWhatsAppTemplate(
  options: SendWhatsAppTemplateOptions,
): Promise<WhatsAppMessageResponse> {
  const phoneNumberId = getPhoneNumberId(options.phoneNumberId);
  const accessToken = getAccessToken();

  const payload = {
    messaging_product: 'whatsapp',
    to: options.to,
    type: 'template',
    template: {
      name: options.templateName,
      language: {
        code: options.languageCode ?? 'en_US',
      },
      ...(options.components?.length ? { components: options.components } : {}),
    },
  };

  try {
    const response = await axios.post<WhatsAppMessageResponse>(
      `${BASE_URL}/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    logger.info('WhatsApp template sent', {
      to: options.to,
      templateName: options.templateName,
      messageId: response.data.messages?.[0]?.id,
    });

    return response.data;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: { message?: string; code?: number; type?: string } } }; message?: string };
    const metaError = error.response?.data?.error;
    const detail = metaError
      ? `Meta API error ${metaError.code ?? ''}: ${metaError.message ?? 'Unknown'}`
      : (error.message ?? 'Unknown error');
    logger.error('Failed to send WhatsApp template', { to: options.to, templateName: options.templateName, error: error.response?.data ?? error.message });
    throw new Error(detail);
  }
}

export async function sendWhatsAppText(
  options: SendWhatsAppTextOptions,
): Promise<WhatsAppMessageResponse> {
  const phoneNumberId = getPhoneNumberId(options.phoneNumberId);
  const accessToken = getAccessToken();

  const payload = {
    messaging_product: 'whatsapp',
    to: options.to,
    type: 'text',
    text: {
      body: options.text,
      preview_url: options.previewUrl ?? false,
    },
  };

  try {
    const response = await axios.post<WhatsAppMessageResponse>(
      `${BASE_URL}/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    logger.info('WhatsApp text sent', {
      to: options.to,
      messageId: response.data.messages?.[0]?.id,
    });

    return response.data;
  } catch (err: unknown) {
    const error = err as { response?: { data?: { error?: { message?: string; code?: number } } }; message?: string };
    const metaError = error.response?.data?.error;
    const detail = metaError
      ? `Meta API error ${metaError.code ?? ''}: ${metaError.message ?? 'Unknown'}`
      : (error.message ?? 'Unknown error');
    logger.error('Failed to send WhatsApp text', { to: options.to, error: error.response?.data ?? error.message });
    throw new Error(detail);
  }
}

export async function markWhatsAppRead(
  messageId: string,
  phoneNumberId?: string,
): Promise<void> {
  const pid = getPhoneNumberId(phoneNumberId);
  const accessToken = getAccessToken();

  try {
    await axios.post(
      `${BASE_URL}/${pid}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    logger.debug('WhatsApp message marked as read', { messageId });
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string };
    logger.warn('Failed to mark WhatsApp message as read', {
      messageId,
      error: error.response?.data ?? error.message,
    });
    // Do not throw — non-critical operation
  }
}
