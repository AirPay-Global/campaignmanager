/**
 * Standalone Queue Worker
 *
 * This is the entry point for the Railway "queue-worker" service.
 * It processes outbound messages every 10 seconds independently of the API server.
 */
import 'dotenv/config';
import cron from 'node-cron';
import { logger } from './lib/logger';
import { processQueue } from './engines/queue.engine';

logger.info('AirPay Queue Worker starting...', {
  env: process.env.NODE_ENV ?? 'development',
  concurrency: process.env.QUEUE_CONCURRENCY ?? '5',
  retryAttempts: process.env.RETRY_ATTEMPTS ?? '3',
});

// Process queue every 10 seconds
cron.schedule('*/10 * * * * *', async () => {
  try {
    await processQueue();
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Queue processing error in worker', { error: error.message });
  }
});

logger.info('Queue worker running — processing every 10 seconds');

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Worker received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Worker received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught exception in worker', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled rejection in worker', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  process.exit(1);
});
