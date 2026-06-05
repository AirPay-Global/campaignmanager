import axios from 'axios';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

export interface FacebookPostOptions {
  orgId: string;
  content: string;
  mediaUrls?: string[];
  campaignId?: string;
  socialCampaignId?: string;
  scheduledAt?: string;
}

export interface TweetOptions {
  orgId: string;
  content: string;
  mediaUrls?: string[];
  campaignId?: string;
  socialCampaignId?: string;
}

export interface SocialPostResult {
  postId: string;
  url?: string;
}

class SocialService {
  async publishFacebookPost(options: FacebookPostOptions): Promise<SocialPostResult> {
    const pageId = process.env.FACEBOOK_PAGE_ID;
    const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

    if (!pageId || !accessToken) {
      throw new Error('Facebook credentials not configured: FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN required');
    }

    let postId: string;

    try {
      if (options.mediaUrls?.length) {
        // Upload photo(s) first
        const photoIds: string[] = [];

        for (const mediaUrl of options.mediaUrls) {
          const photoResponse = await axios.post<{ id: string }>(
            `https://graph.facebook.com/v18.0/${pageId}/photos`,
            { url: mediaUrl, published: false },
            { params: { access_token: accessToken } },
          );
          photoIds.push(photoResponse.data.id);
        }

        // Create post with attached media
        const response = await axios.post<{ id: string }>(
          `https://graph.facebook.com/v18.0/${pageId}/feed`,
          {
            message: options.content,
            attached_media: photoIds.map((id) => ({ media_fbid: id })),
          },
          { params: { access_token: accessToken } },
        );
        postId = response.data.id;
      } else {
        const response = await axios.post<{ id: string }>(
          `https://graph.facebook.com/v18.0/${pageId}/feed`,
          { message: options.content },
          { params: { access_token: accessToken } },
        );
        postId = response.data.id;
      }

      logger.info('Facebook post published', { postId, orgId: options.orgId });

      // Update social campaign record if provided
      if (options.socialCampaignId) {
        await supabase
          .from('social_campaigns')
          .update({
            external_post_id: postId,
            published_at: new Date().toISOString(),
            status: 'published',
          })
          .eq('id', options.socialCampaignId);
      }

      return {
        postId,
        url: `https://www.facebook.com/${postId}`,
      };
    } catch (err: unknown) {
      const error = err as { response?: { data?: unknown }; message?: string };
      logger.error('Failed to publish Facebook post', {
        orgId: options.orgId,
        error: error.response?.data ?? error.message,
      });

      if (options.socialCampaignId) {
        await supabase
          .from('social_campaigns')
          .update({
            status: 'failed',
            error_message: String(error.message ?? 'Unknown error'),
          })
          .eq('id', options.socialCampaignId);
      }

      throw err;
    }
  }

  async publishTweet(options: TweetOptions): Promise<SocialPostResult> {
    const bearerToken = process.env.TWITTER_BEARER_TOKEN;
    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;

    if (!bearerToken && !(apiKey && apiSecret && accessToken && accessTokenSecret)) {
      throw new Error('Twitter credentials not configured');
    }

    try {
      // Use Twitter API v2
      const response = await axios.post<{ data: { id: string; text: string } }>(
        'https://api.twitter.com/2/tweets',
        { text: options.content },
        {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const tweetId = response.data.data.id;

      logger.info('Tweet published', { tweetId, orgId: options.orgId });

      // Update social campaign record if provided
      if (options.socialCampaignId) {
        await supabase
          .from('social_campaigns')
          .update({
            external_post_id: tweetId,
            published_at: new Date().toISOString(),
            status: 'published',
          })
          .eq('id', options.socialCampaignId);
      }

      return {
        postId: tweetId,
        url: `https://twitter.com/i/web/status/${tweetId}`,
      };
    } catch (err: unknown) {
      const error = err as { response?: { data?: unknown }; message?: string };
      logger.error('Failed to publish tweet', {
        orgId: options.orgId,
        error: error.response?.data ?? error.message,
      });

      if (options.socialCampaignId) {
        await supabase
          .from('social_campaigns')
          .update({
            status: 'failed',
            error_message: String(error.message ?? 'Unknown error'),
          })
          .eq('id', options.socialCampaignId);
      }

      throw err;
    }
  }
}

export const socialService = new SocialService();
export default socialService;
