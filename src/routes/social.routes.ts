import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';
import { authMiddleware } from '../middleware/auth.middleware';
import { publishFacebookPost, publishInstagramPost } from '../adapters/facebook.adapter';
import { publishLinkedInPost } from '../adapters/linkedin.adapter';

const router = Router();
router.use(authMiddleware);

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// GET /social/posts
router.get('/posts', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { platform, status } = req.query as Record<string, string>;

  let query = supabase
    .from('social_posts')
    .select('*')
    .eq('org_id', orgId)
    .order('scheduled_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (platform) query = query.eq('platform', platform);
  if (status)   query = query.eq('status', status);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ data: data ?? [] });
}));

// POST /social/posts
router.post('/posts', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const userId = req.user!.sub;
  const body = req.body as {
    platform?: string;
    content?: string;
    media_urls?: string[];
    scheduled_at?: string | null;
    publish_now?: boolean;
  };

  if (!body.platform || !['facebook', 'instagram', 'linkedin'].includes(body.platform)) {
    res.status(400).json({ error: 'platform must be facebook, instagram, or linkedin' }); return;
  }
  if (!body.content?.trim()) {
    res.status(400).json({ error: 'content is required' }); return;
  }
  if (!body.scheduled_at && !body.publish_now) {
    res.status(400).json({ error: 'Either scheduled_at or publish_now:true is required' }); return;
  }

  const platform = body.platform as 'facebook' | 'instagram' | 'linkedin';
  const content = body.content.trim();
  const mediaUrls = body.media_urls ?? [];

  // Publish immediately
  if (body.publish_now) {
    let platformPostId: string;
    try {
      if (platform === 'facebook') {
        const r = await publishFacebookPost(content, mediaUrls);
        platformPostId = r.id;
      } else if (platform === 'instagram') {
        const r = await publishInstagramPost(content, mediaUrls);
        platformPostId = r.id;
      } else {
        const r = await publishLinkedInPost(content, mediaUrls);
        platformPostId = r.id;
      }
    } catch (err) {
      res.status(502).json({ error: 'Publish failed', message: (err as Error).message }); return;
    }

    const { data, error } = await supabase.from('social_posts').insert({
      org_id: orgId,
      platform,
      content,
      media_urls: mediaUrls,
      status: 'published',
      published_at: new Date().toISOString(),
      platform_post_id: platformPostId,
      created_by: userId,
    }).select().single();

    if (error || !data) { res.status(500).json({ error: error?.message }); return; }
    res.status(201).json(data);
    return;
  }

  // Schedule for later
  const { data, error } = await supabase.from('social_posts').insert({
    org_id: orgId,
    platform,
    content,
    media_urls: mediaUrls,
    status: 'scheduled',
    scheduled_at: body.scheduled_at!,
    created_by: userId,
  }).select().single();

  if (error || !data) { res.status(500).json({ error: error?.message }); return; }
  res.status(201).json(data);
}));

// GET /social/posts/:id
router.get('/posts/:id', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { data, error } = await supabase
    .from('social_posts')
    .select('*')
    .eq('id', req.params['id']!)
    .eq('org_id', orgId)
    .single();

  if (error || !data) { res.status(404).json({ error: 'Not Found' }); return; }
  res.json(data);
}));

// PATCH /social/posts/:id
router.patch('/posts/:id', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const body = req.body as Record<string, unknown>;
  const allowed = ['content', 'media_urls', 'scheduled_at', 'status'];
  const update: Record<string, unknown> = {};
  for (const k of allowed) { if (k in body) update[k] = body[k]; }

  // Can only edit draft/scheduled posts
  const { data: existing } = await supabase.from('social_posts').select('status').eq('id', req.params['id']!).eq('org_id', orgId).single();
  if (!existing) { res.status(404).json({ error: 'Not Found' }); return; }
  if (!['draft', 'scheduled'].includes(existing.status as string)) {
    res.status(400).json({ error: 'Only draft or scheduled posts can be edited' }); return;
  }

  const { data, error } = await supabase
    .from('social_posts')
    .update(update)
    .eq('id', req.params['id']!)
    .eq('org_id', orgId)
    .select()
    .single();

  if (error || !data) { res.status(500).json({ error: error?.message ?? 'Update failed' }); return; }
  res.json(data);
}));

// DELETE /social/posts/:id
router.delete('/posts/:id', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;
  const { error } = await supabase
    .from('social_posts')
    .delete()
    .eq('id', req.params['id']!)
    .eq('org_id', orgId);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.status(204).send();
}));

// POST /social/posts/:id/publish — manually publish a draft/scheduled post now
router.post('/posts/:id/publish', asyncHandler(async (req, res) => {
  const orgId = req.user!.org_id;

  const { data: post, error: fetchErr } = await supabase
    .from('social_posts')
    .select('*')
    .eq('id', req.params['id']!)
    .eq('org_id', orgId)
    .single();

  if (fetchErr || !post) { res.status(404).json({ error: 'Not Found' }); return; }
  if (post.status === 'published') { res.status(400).json({ error: 'Post is already published' }); return; }

  let platformPostId: string;
  const platform = post.platform as 'facebook' | 'instagram' | 'linkedin';
  const mediaUrls = (post.media_urls ?? []) as string[];

  try {
    if (platform === 'facebook') {
      const r = await publishFacebookPost(post.content as string, mediaUrls);
      platformPostId = r.id;
    } else if (platform === 'instagram') {
      const r = await publishInstagramPost(post.content as string, mediaUrls);
      platformPostId = r.id;
    } else {
      const r = await publishLinkedInPost(post.content as string, mediaUrls);
      platformPostId = r.id;
    }
  } catch (err) {
    await supabase.from('social_posts').update({ status: 'failed', error_message: (err as Error).message }).eq('id', post.id);
    res.status(502).json({ error: 'Publish failed', message: (err as Error).message }); return;
  }

  const { data, error } = await supabase
    .from('social_posts')
    .update({ status: 'published', published_at: new Date().toISOString(), platform_post_id: platformPostId, error_message: null })
    .eq('id', post.id)
    .select()
    .single();

  if (error || !data) { res.status(500).json({ error: error?.message }); return; }
  res.json(data);
}));

export default router;
