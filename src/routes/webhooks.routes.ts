import { Router } from 'express';
import {
  verifyWhatsAppWebhook,
  handleWhatsAppWebhook,
} from '../webhooks/whatsapp.webhook';
import {
  handleSMSWebhook,
  handleSMSDeliveryReport,
} from '../webhooks/sms.webhook';
import { handleEmailWebhook } from '../webhooks/email.webhook';
import { webhookRateLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// Apply rate limiting to all webhook routes
router.use(webhookRateLimiter);

// ─── WhatsApp ───────────────────────────────────────────────────────────────
// GET for webhook verification challenge
router.get('/whatsapp', verifyWhatsAppWebhook);
// POST for incoming messages and status updates
router.post('/whatsapp', handleWhatsAppWebhook);

// ─── SMS (Africa's Talking) ─────────────────────────────────────────────────
// POST for inbound SMS
router.post('/sms/inbound', handleSMSWebhook);
// POST for delivery reports
router.post('/sms/delivery', handleSMSDeliveryReport);

// ─── Email (Resend) ─────────────────────────────────────────────────────────
// POST for inbound emails and delivery events
router.post('/email', handleEmailWebhook);

export default router;
