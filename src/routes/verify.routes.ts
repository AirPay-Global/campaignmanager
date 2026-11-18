import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { verifyRateLimiter } from '../middleware/rate-limit.middleware';
import { callMetaTemplateApi, normalizePhone, parseMetaError } from '../services/whatsapp-cloud.service';

// WhatsApp phone verification (OTP) for external products.
// Server-to-server: authenticate with `Authorization: Bearer <VERIFY_API_KEY>`.
// Never call these endpoints from a browser/app — the key must stay secret.

const router = Router();
router.use(verifyRateLimiter);

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

router.use((req, res, next) => {
  const key = process.env.VERIFY_API_KEY;
  const orgId = process.env.DEFAULT_ORG_ID;
  if (!key || !orgId) {
    res.status(500).json({ error: 'Verification not configured (VERIFY_API_KEY / DEFAULT_ORG_ID)' });
    return;
  }
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ') || !safeEqual(header.slice(7), key)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});

function hashCode(orgId: string, phone: string, code: string): string {
  const secret = process.env.VERIFY_API_KEY ?? '';
  return crypto.createHmac('sha256', secret).update(`${orgId}:${phone}:${code}`).digest('hex');
}

// POST /api/v1/verify/start  { phone, accountId? }
router.post('/start', asyncHandler(async (req, res) => {
  const orgId = process.env.DEFAULT_ORG_ID!;
  const template = process.env.VERIFY_TEMPLATE_NAME;
  const language = process.env.VERIFY_TEMPLATE_LANGUAGE ?? 'en_US';
  if (!template) { res.status(500).json({ error: 'VERIFY_TEMPLATE_NAME is not configured' }); return; }

  let phone: string;
  try { phone = normalizePhone(String(req.body?.phone ?? '')); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); return; }

  const now = Date.now();
  const { data: recent } = await supabase
    .from('whatsapp_verifications')
    .select('created_at')
    .eq('org_id', orgId).eq('phone', phone)
    .gte('created_at', new Date(now - 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });

  if (recent && recent.length > 0) {
    const last = new Date(recent[0]!.created_at as string).getTime();
    if (now - last < RESEND_COOLDOWN_MS) {
      res.status(429).json({ error: 'Please wait before requesting another code', retryAfter: Math.ceil((RESEND_COOLDOWN_MS - (now - last)) / 1000) });
      return;
    }
    if (recent.length >= MAX_SENDS_PER_HOUR) {
      res.status(429).json({ error: 'Too many codes requested for this number. Try again later.' });
      return;
    }
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

  // Invalidate earlier pending codes for this number
  await supabase.from('whatsapp_verifications').update({ status: 'expired' })
    .eq('org_id', orgId).eq('phone', phone).eq('status', 'pending');

  const { data: row, error: insErr } = await supabase
    .from('whatsapp_verifications')
    .insert({ org_id: orgId, phone, code_hash: hashCode(orgId, phone, code), expires_at: new Date(now + CODE_TTL_MS).toISOString() })
    .select('id').single();
  if (insErr || !row) { res.status(500).json({ error: 'Failed to create verification' }); return; }

  try {
    // Meta AUTHENTICATION template: code in body + copy-code button.
    // Uses the low-level call so the code is never written to outbound_messages.
    await callMetaTemplateApi({
      orgId, to: phone, templateName: template, languageCode: language,
      accountId: typeof req.body?.accountId === 'string' ? req.body.accountId : undefined,
      components: [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
      ],
    });
  } catch (err) {
    await supabase.from('whatsapp_verifications').update({ status: 'failed' }).eq('id', row.id);
    const msg = parseMetaError(err);
    logger.error('Verification send failed', { error: msg });
    res.status(502).json({ error: msg });
    return;
  }

  res.json({ verification_id: row.id, expires_in: CODE_TTL_MS / 1000 });
}));

// POST /api/v1/verify/check  { phone, code }
router.post('/check', asyncHandler(async (req, res) => {
  const orgId = process.env.DEFAULT_ORG_ID!;
  let phone: string;
  try { phone = normalizePhone(String(req.body?.phone ?? '')); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); return; }
  const code = String(req.body?.code ?? '').trim();
  if (!/^\d{6}$/.test(code)) { res.status(400).json({ error: 'code must be 6 digits' }); return; }

  const { data: v } = await supabase
    .from('whatsapp_verifications').select('*')
    .eq('org_id', orgId).eq('phone', phone).eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (!v) { res.status(404).json({ verified: false, error: 'No pending verification for this number' }); return; }
  if (new Date(v.expires_at as string).getTime() < Date.now()) {
    await supabase.from('whatsapp_verifications').update({ status: 'expired' }).eq('id', v.id);
    res.status(410).json({ verified: false, error: 'Code expired' }); return;
  }

  const attempts = (v.attempts as number) + 1;
  if (!safeEqual(hashCode(orgId, phone, code), v.code_hash as string)) {
    await supabase.from('whatsapp_verifications')
      .update({ attempts, status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending' }).eq('id', v.id);
    res.status(400).json({ verified: false, error: attempts >= MAX_ATTEMPTS ? 'Too many attempts. Request a new code.' : 'Incorrect code', attemptsRemaining: Math.max(0, MAX_ATTEMPTS - attempts) });
    return;
  }

  await supabase.from('whatsapp_verifications')
    .update({ status: 'verified', attempts, verified_at: new Date().toISOString() }).eq('id', v.id);
  res.json({ verified: true, phone });
}));

export default router;
