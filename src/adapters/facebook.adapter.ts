import axios from 'axios';
import { logger } from '../lib/logger';

const API_VERSION = 'v21.0';
const BASE = `https://graph.facebook.com/${API_VERSION}`;

function getToken(): string {
  const t = process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? process.env.META_ADS_ACCESS_TOKEN;
  if (!t) throw new Error('FACEBOOK_PAGE_ACCESS_TOKEN is not configured');
  return t;
}

function getPageId(): string {
  const p = process.env.FACEBOOK_PAGE_ID;
  if (!p) throw new Error('FACEBOOK_PAGE_ID is not configured');
  return p;
}

function getIgAccountId(): string {
  const ig = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!ig) throw new Error('INSTAGRAM_BUSINESS_ACCOUNT_ID is not configured');
  return ig;
}

export interface FacebookPostResult {
  id: string;
  post_id?: string;
}

export async function publishFacebookPost(
  content: string,
  mediaUrls: string[] = [],
): Promise<FacebookPostResult> {
  const token = getToken();
  const pageId = getPageId();

  if (mediaUrls.length > 0) {
    // Photo post — upload each photo as an unpublished attachment first
    const photoIds: string[] = [];
    for (const url of mediaUrls) {
      const { data } = await axios.post<{ id: string }>(
        `${BASE}/${pageId}/photos`,
        { url, published: false },
        { params: { access_token: token } },
      );
      photoIds.push(data.id);
    }

    const attachedMedia = photoIds.map(id => ({ media_fbid: id }));
    const { data } = await axios.post<FacebookPostResult>(
      `${BASE}/${pageId}/feed`,
      { message: content, attached_media: attachedMedia },
      { params: { access_token: token } },
    );
    logger.info('Facebook photo post published', { postId: data.id });
    return data;
  }

  // Text-only post
  const { data } = await axios.post<FacebookPostResult>(
    `${BASE}/${pageId}/feed`,
    { message: content },
    { params: { access_token: token } },
  );
  logger.info('Facebook post published', { postId: data.id });
  return data;
}

export interface InstagramPostResult {
  id: string;
}

export async function publishInstagramPost(
  content: string,
  mediaUrls: string[] = [],
): Promise<InstagramPostResult> {
  const token = getToken();
  const igAccountId = getIgAccountId();

  if (mediaUrls.length === 0) {
    throw new Error('Instagram requires at least one image or video URL');
  }

  if (mediaUrls.length === 1) {
    // Single image post
    const { data: container } = await axios.post<{ id: string }>(
      `${BASE}/${igAccountId}/media`,
      { image_url: mediaUrls[0], caption: content },
      { params: { access_token: token } },
    );
    const { data } = await axios.post<InstagramPostResult>(
      `${BASE}/${igAccountId}/media_publish`,
      { creation_id: container.id },
      { params: { access_token: token } },
    );
    logger.info('Instagram post published', { postId: data.id });
    return data;
  }

  // Carousel post
  const itemIds: string[] = [];
  for (const url of mediaUrls) {
    const { data } = await axios.post<{ id: string }>(
      `${BASE}/${igAccountId}/media`,
      { image_url: url, is_carousel_item: true },
      { params: { access_token: token } },
    );
    itemIds.push(data.id);
  }

  const { data: carousel } = await axios.post<{ id: string }>(
    `${BASE}/${igAccountId}/media`,
    { media_type: 'CAROUSEL', caption: content, children: itemIds.join(',') },
    { params: { access_token: token } },
  );

  const { data } = await axios.post<InstagramPostResult>(
    `${BASE}/${igAccountId}/media_publish`,
    { creation_id: carousel.id },
    { params: { access_token: token } },
  );
  logger.info('Instagram carousel published', { postId: data.id, items: itemIds.length });
  return data;
}
