import rateLimit from 'express-rate-limit';

const ratePerMinute = Number(process.env.RATE_LIMIT_PER_MINUTE ?? '60');

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: ratePerMinute,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: 60,
  },
  skip: (req) => req.path === '/health',
});

export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Webhook rate limit exceeded.',
  },
});

export const publicFormRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // 10 submissions per IP per 10 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Too many form submissions. Please try again later.',
  },
});

