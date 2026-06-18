import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { runAgent } from '../services/ai-agent.service';
import type Anthropic from '@anthropic-ai/sdk';

const router = Router();
router.use(authMiddleware);

// POST /agent/chat — SSE streaming endpoint
router.post('/chat', (req: Request, res: Response): void => {
  const orgId = req.user!.org_id;
  const userId = req.user!.sub;
  const { message, history = [] } = req.body as {
    message?: string;
    history?: Anthropic.MessageParam[];
  };

  if (!message?.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  runAgent(message.trim(), history, orgId, userId, (chunk) => {
    send(chunk);
  })
    .then(() => {
      res.end();
    })
    .catch((err: Error) => {
      send({ type: 'error', message: err.message });
      res.end();
    });
});

export default router;
