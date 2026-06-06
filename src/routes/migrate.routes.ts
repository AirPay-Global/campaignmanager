import { Router, Request, Response } from 'express';
import { runMigrations } from '../lib/migrate';
import { logger } from '../lib/logger';

const router = Router();

// POST /api/v1/migrate — trigger migrations manually
// Protected by SETUP_TOKEN (same as setup endpoint)
router.post('/', async (req: Request, res: Response) => {
  const setupToken = process.env.SETUP_TOKEN ?? 'airpay-setup';
  const { token } = req.body;

  if (token !== setupToken) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  try {
    await runMigrations();
    return res.json({ message: 'Migrations applied successfully' });
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Manual migration failed', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

export default router;
