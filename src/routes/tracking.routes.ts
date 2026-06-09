import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

const router = Router();

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

async function logTrackingEvent(
  messageId: string,
  eventType: 'opened' | 'clicked',
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { data: message } = await supabase
      .from('outbound_messages')
      .select('org_id')
      .eq('id', messageId)
      .single();

    if (!message) return;

    await supabase.from('delivery_logs').insert({
      org_id: message.org_id,
      outbound_message_id: messageId,
      event_type: eventType,
      metadata,
      occurred_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn('Failed to log tracking event', { messageId, eventType, err });
  }
}

// GET /track/open/:messageId — email open pixel
router.get('/open/:messageId', (req: Request, res: Response) => {
  const { messageId } = req.params;
  logTrackingEvent(messageId, 'opened', { ua: req.headers['user-agent'] });
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.send(TRANSPARENT_GIF);
});

// GET /track/click/:messageId — click-through redirect
router.get('/click/:messageId', (req: Request, res: Response) => {
  const { messageId } = req.params;
  const url = req.query['url'] as string | undefined;

  if (!url) {
    res.status(400).send('Missing url parameter');
    return;
  }

  // Validate URL before redirecting
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      res.status(400).send('Invalid URL');
      return;
    }
  } catch {
    res.status(400).send('Invalid URL');
    return;
  }

  logTrackingEvent(messageId, 'clicked', { url, ua: req.headers['user-agent'] });
  res.redirect(302, url);
});

export default router;
