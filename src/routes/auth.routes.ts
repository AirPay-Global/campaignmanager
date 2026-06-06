import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { logger } from '../lib/logger';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Separate anon client for password-based auth (service role bypasses auth)
function getAnonClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
  return createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res.status(500).json({ error: 'Auth not configured' });
  }

  try {
    const supabaseAnon = getAnonClient();
    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      logger.warn('Login failed', { email, error: error?.message });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const orgId =
      (data.user.user_metadata?.organization_id as string) ??
      process.env.DEFAULT_ORG_ID;

    if (!orgId) {
      return res.status(403).json({ error: 'User has no organisation assigned' });
    }

    const token = jwt.sign(
      {
        sub: data.user.id,
        email: data.user.email,
        org_id: orgId,
        role: (data.user.user_metadata?.role as string) ?? 'user',
      },
      jwtSecret,
      { expiresIn: '8h' },
    );

    logger.info('Login successful', { userId: data.user.id, email });

    return res.json({
      token,
      user: {
        id: data.user.id,
        email: data.user.email,
        org_id: orgId,
        role: data.user.user_metadata?.role ?? 'user',
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Login error', { error: error.message });
    return res.status(500).json({ error: 'Authentication failed' });
  }
});

// GET /api/v1/auth/me
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

// POST /api/v1/auth/logout
router.post('/logout', authMiddleware, (_req: Request, res: Response) => {
  // JWT is stateless — client just discards the token
  res.json({ message: 'Logged out successfully' });
});

export default router;
