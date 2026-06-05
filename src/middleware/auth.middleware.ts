import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../lib/logger';

export interface JwtPayload {
  sub: string;
  org_id: string;
  email?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
    });
    return;
  }

  const token = authHeader.substring(7);
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    logger.error('JWT_SECRET is not configured');
    res.status(500).json({ error: 'Internal Server Error', message: 'Auth not configured' });
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret) as JwtPayload;

    if (!payload.org_id) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token missing org_id claim',
      });
      return;
    }

    req.user = payload;
    next();
  } catch (err: unknown) {
    const error = err as Error;
    logger.debug('JWT verification failed', { error: error.message });

    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Unauthorized', message: 'Token expired' });
    } else if (error.name === 'JsonWebTokenError') {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
    } else {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication failed' });
    }
  }
}
