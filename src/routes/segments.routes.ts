import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { authMiddleware } from '../middleware/auth.middleware';
import { segmentService } from '../services/segment.service';

const router = Router();

// All segment routes require authentication
router.use(authMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// GET /segments
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;

    const { data, error, count } = await supabase
      .from('audience_segments')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list segments', { error: error.message });
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
      return;
    }

    res.json({ data, total: count ?? 0 });
  }),
);

// POST /segments
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const body = req.body as {
      name?: string;
      description?: string;
      filter_query?: Record<string, unknown>;
    };

    if (!body.name) {
      res.status(400).json({ error: 'Bad Request', message: 'name is required' });
      return;
    }

    const { data, error } = await supabase
      .from('audience_segments')
      .insert({
        org_id: orgId,
        name: body.name,
        description: body.description ?? null,
        filter_query: body.filter_query ?? {},
        contact_count: 0,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create segment', { error: error.message });
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
      return;
    }

    // Resolve count immediately so the UI shows accurate numbers
    segmentService.resolveSegment(orgId, data.id).catch(() => {/* non-fatal */});

    res.status(201).json(data);
  }),
);

// GET /segments/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('audience_segments')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Not Found', message: 'Segment not found' });
      return;
    }

    res.json(data);
  }),
);

// PATCH /segments/:id
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const { id } = req.params;
    const body = req.body as {
      name?: string;
      description?: string;
      filter_query?: Record<string, unknown>;
    };

    // Verify segment belongs to org
    const { data: existing, error: fetchError } = await supabase
      .from('audience_segments')
      .select('id')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (fetchError || !existing) {
      res.status(404).json({ error: 'Not Found', message: 'Segment not found' });
      return;
    }

    const allowedFields = ['name', 'description', 'filter_query'];
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) updateData[field] = (body as Record<string, unknown>)[field];
    }

    const { data, error } = await supabase
      .from('audience_segments')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update segment', { error: error.message });
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
      return;
    }

    if ('filter_query' in updateData) {
      segmentService.resolveSegment(orgId, id).catch(() => {/* non-fatal */});
    }

    res.json(data);
  }),
);

// DELETE /segments/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const { id } = req.params;

    const { error } = await supabase
      .from('audience_segments')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) {
      logger.error('Failed to delete segment', { error: error.message });
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
      return;
    }

    res.status(204).send();
  }),
);

// GET /segments/:id/contacts
router.get(
  '/:id/contacts',
  asyncHandler(async (req, res) => {
    const orgId = req.user!.org_id;
    const { id } = req.params;

    const contacts = await segmentService.resolveSegment(orgId, id);

    res.json({ data: contacts, total: contacts.length });
  }),
);

export default router;
