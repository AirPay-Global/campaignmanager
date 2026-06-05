import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../lib/logger';

/**
 * Generic webhook signature verification middleware.
 * Verifies HMAC-SHA256 signatures on incoming webhook requests.
 * The signature is expected in the X-Webhook-Signature header.
 */
export function webhookVerifyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.WEBHOOK_SIGNING_SECRET;

  if (!secret) {
    // No secret configured — skip verification (development mode)
    logger.warn('WEBHOOK_SIGNING_SECRET not set; skipping webhook signature verification');
    next();
    return;
  }

  const signature = req.headers['x-webhook-signature'] as string | undefined;

  if (!signature) {
    logger.warn('Missing X-Webhook-Signature header', { path: req.path });
    res.status(401).json({ error: 'Unauthorized', message: 'Missing webhook signature' });
    return;
  }

  const body = (req as Request & { rawBody?: Buffer }).rawBody
    ?? Buffer.from(JSON.stringify(req.body));

  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

  try {
    const expectedBuf = Buffer.from(expected, 'hex');
    const signatureBuf = Buffer.from(signature.replace(/^sha256=/, ''), 'hex');

    if (expectedBuf.length !== signatureBuf.length || !crypto.timingSafeEqual(expectedBuf, signatureBuf)) {
      logger.warn('Invalid webhook signature', { path: req.path });
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid webhook signature' });
      return;
    }
  } catch {
    logger.warn('Webhook signature comparison failed', { path: req.path });
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid webhook signature format' });
    return;
  }

  next();
}
