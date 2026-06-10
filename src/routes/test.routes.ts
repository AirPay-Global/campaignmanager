import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { sendWhatsAppTemplate } from '../adapters/whatsapp.adapter';
import { sendSMS } from '../adapters/sms.adapter';
import { sendEmail } from '../adapters/email.adapter';

const router = Router();
router.use(authMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// POST /api/v1/test/whatsapp
// Body: { to, template_name, template_vars, language_code? }
// Example: { "to": "+1234567890", "template_name": "appointment_confirm", "template_vars": {"1": "Ernest", "2": "Your payment is ready"} }
router.post(
  '/whatsapp',
  asyncHandler(async (req, res) => {
    const body = req.body as {
      to?: string;
      template_name?: string;
      template_vars?: Record<string, string>;
      language_code?: string;
    };

    if (!body.to) {
      res.status(400).json({ error: 'to (phone number) is required, e.g. "+2348012345678"' });
      return;
    }
    if (!body.template_name) {
      res.status(400).json({ error: 'template_name is required, e.g. "appointment_confirm"' });
      return;
    }

    const vars = body.template_vars ?? {};
    const bodyParams = Object.keys(vars)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => ({ type: 'text' as const, text: String(vars[k]) }));

    const result = await sendWhatsAppTemplate({
      to: body.to,
      templateName: body.template_name,
      languageCode: body.language_code ?? 'en_US',
      components: bodyParams.length > 0
        ? [{ type: 'body', parameters: bodyParams }]
        : undefined,
    });

    res.json({
      success: true,
      whatsapp_message_id: result.messages?.[0]?.id,
      wa_id: result.contacts?.[0]?.wa_id,
    });
  }),
);

// POST /api/v1/test/sms
// Body: { to, message }
router.post(
  '/sms',
  asyncHandler(async (req, res) => {
    const body = req.body as { to?: string; message?: string };
    if (!body.to || !body.message) {
      res.status(400).json({ error: 'to and message are required' });
      return;
    }
    const result = await sendSMS(body.to, body.message);
    res.json({ success: result.status !== 'failed', ...result });
  }),
);

// POST /api/v1/test/email
// Body: { to, subject, text?, html? }
router.post(
  '/email',
  asyncHandler(async (req, res) => {
    const body = req.body as { to?: string; subject?: string; text?: string; html?: string };
    if (!body.to || !body.subject) {
      res.status(400).json({ error: 'to and subject are required' });
      return;
    }
    const result = await sendEmail({
      to: body.to,
      subject: body.subject,
      text: body.text,
      html: body.html,
    });
    res.json({ success: result.status !== 'failed', ...result });
  }),
);

export default router;
