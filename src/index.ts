import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cron from 'node-cron';
import path from 'path';
import { logger } from './lib/logger';
import { runMigrations } from './lib/migrate';
import { apiRateLimiter } from './middleware/rate-limit.middleware';
import { processQueue } from './engines/queue.engine';
import { processEnrollments } from './engines/workflow.engine';
import { processScheduledPosts } from './engines/social.engine';

// Routes
import authRoutes from './routes/auth.routes';
import setupRoutes from './routes/setup.routes';
import migrateRoutes from './routes/migrate.routes';
import campaignRoutes from './routes/campaigns.routes';
import mandateRoutes from './routes/mandates.routes';
import contactRoutes from './routes/contacts.routes';
import messageRoutes from './routes/messages.routes';
import webhookRoutes from './routes/webhooks.routes';
import segmentRoutes from './routes/segments.routes';
import trackingRoutes from './routes/tracking.routes';
import abTestRoutes from './routes/ab-tests.routes';
import workflowRoutes from './routes/workflows.routes';
import formRoutes from './routes/forms.routes';
import publicRoutes from './routes/public.routes';
import adsRoutes from './routes/ads.routes';
import socialRoutes from './routes/social.routes';
import messageTemplateRoutes from './routes/message-templates.routes';
import agentRoutes from './routes/agent.routes';
import testRoutes from './routes/test.routes';

const app = express();

// Required for Railway/proxied deployments — fixes rate limiter X-Forwarded-For error
app.set('trust proxy', 1);

// ─── Security Middleware ─────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Signature'],
  }),
);

// ─── Raw Body Capture (for webhook signature verification) ──────────────────
app.use(
  express.json({
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
    limit: '10mb',
  }),
);

app.use(express.urlencoded({ extended: true }));

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Webhook Routes (no auth, no API rate limit) ─────────────────────────────
app.use('/webhooks', webhookRoutes);

// ─── Tracking Routes (no auth — called by email clients) ─────────────────────
app.use('/track', trackingRoutes);

// ─── Public Routes (no auth — must be before apiRateLimiter) ─────────────────
app.use('/api/v1/public', publicRoutes);

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/v1', apiRateLimiter);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/setup', setupRoutes);
app.use('/api/v1/migrate', migrateRoutes);
app.use('/api/v1/campaigns', campaignRoutes);
app.use('/api/v1/mandates', mandateRoutes);
app.use('/api/v1/contacts', contactRoutes);
app.use('/api/v1/segments', segmentRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/ab-tests', abTestRoutes);
app.use('/api/v1', abTestRoutes); // also handles /campaigns/:id/ab-test sub-route
app.use('/api/v1/workflows', workflowRoutes);
app.use('/api/v1/forms', formRoutes);
app.use('/api/v1/ads', adsRoutes);
app.use('/api/v1/social', socialRoutes);
app.use('/api/v1/message-templates', messageTemplateRoutes);
app.use('/api/v1/agent', agentRoutes);
app.use('/api/v1/test', testRoutes);

// ─── Serve React Client ──────────────────────────────────────────────────────
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));

// SPA catch-all — must come AFTER all /api and /webhooks routes
app.get('*', (req: Request, res: Response) => {
  // Don't intercept API or webhook paths that weren't matched above
  if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks') || req.path.startsWith('/track')) {
    return res.status(404).json({ error: 'Not Found', message: 'Endpoint not found' });
  }
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(500).json({ error: 'UI not built', message: 'client/dist/index.html not found' });
  });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
  });
});

// ─── Start Queue Worker (embedded cron) ─────────────────────────────────────
if (process.env.RUN_QUEUE_WORKER !== 'false') {
  cron.schedule('*/10 * * * * *', async () => {
    try {
      await processQueue();
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('Queue processing error', { error: error.message });
    }
  });
  logger.info('Queue worker started (every 10 seconds)');

  cron.schedule('*/30 * * * * *', async () => {
    try {
      await processEnrollments();
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('Workflow enrollment processing error', { error: error.message });
    }
  });
  logger.info('Workflow engine started (every 30 seconds)');

  cron.schedule('* * * * *', async () => {
    try {
      await processScheduledPosts();
    } catch (err: unknown) {
      const error = err as Error;
      logger.error('Social post scheduler error', { error: error.message });
    }
  });
  logger.info('Social scheduler started (every 1 minute)');
}

// ─── Start Server ────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? '3000');

// Run migrations then start server
runMigrations()
  .catch(err => {
    if (err.message.includes('DATABASE_URL')) {
      logger.warn('DATABASE_URL not set — skipping server-side migrations. Set DATABASE_URL (Supabase direct connection string) or apply supabase/migrations/ via `supabase db push`.');
    } else {
      logger.error('Startup migration error', { error: err.message });
    }
  })
  .finally(() => {
    app.listen(PORT, () => {
      logger.info(`AirPay Campaign Manager listening on port ${PORT}`, {
        env: process.env.NODE_ENV ?? 'development',
        port: PORT,
      });
    });
  });

export default app;
