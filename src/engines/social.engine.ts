import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { publishFacebookPost, publishInstagramPost } from '../adapters/facebook.adapter';
import { publishLinkedInPost } from '../adapters/linkedin.adapter';

interface SocialPost {
  id: string;
  org_id: string;
  platform: 'facebook' | 'instagram' | 'linkedin';
  content: string;
  media_urls: string[];
  scheduled_at: string | null;
}

export async function processScheduledPosts(): Promise<void> {
  const now = new Date().toISOString();

  const { data: posts, error } = await supabase
    .from('social_posts')
    .select('id, org_id, platform, content, media_urls, scheduled_at')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(20);

  if (error) {
    logger.error('Failed to fetch scheduled social posts', { error: error.message });
    return;
  }

  if (!posts || posts.length === 0) return;

  logger.info(`Processing ${posts.length} scheduled social post(s)`);

  for (const post of posts as SocialPost[]) {
    try {
      let platformPostId: string;

      if (post.platform === 'facebook') {
        const result = await publishFacebookPost(post.content, post.media_urls);
        platformPostId = result.id;
      } else if (post.platform === 'instagram') {
        const result = await publishInstagramPost(post.content, post.media_urls);
        platformPostId = result.id;
      } else {
        const result = await publishLinkedInPost(post.content, post.media_urls);
        platformPostId = result.id;
      }

      await supabase.from('social_posts').update({
        status: 'published',
        published_at: new Date().toISOString(),
        platform_post_id: platformPostId,
        error_message: null,
      }).eq('id', post.id);

      logger.info('Social post published', { id: post.id, platform: post.platform, platformPostId });
    } catch (err: unknown) {
      const msg = (err as Error).message;
      await supabase.from('social_posts').update({
        status: 'failed',
        error_message: msg,
      }).eq('id', post.id);
      logger.error('Social post failed', { id: post.id, platform: post.platform, error: msg });
    }
  }
}
