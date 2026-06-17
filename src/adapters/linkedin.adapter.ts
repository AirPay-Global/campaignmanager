import axios from 'axios';
import { logger } from '../lib/logger';

const BASE = 'https://api.linkedin.com/v2';

function getToken(): string {
  const t = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!t) throw new Error('LINKEDIN_ACCESS_TOKEN is not configured');
  return t;
}

function getAuthorUrn(): string {
  // Can be a person URN or organization URN
  // e.g. urn:li:person:ABC123 or urn:li:organization:123456
  const urn = process.env.LINKEDIN_AUTHOR_URN;
  if (!urn) throw new Error('LINKEDIN_AUTHOR_URN is not configured (e.g. urn:li:organization:123456)');
  return urn;
}

export interface LinkedInPostResult {
  id: string;
}

export async function publishLinkedInPost(
  content: string,
  mediaUrls: string[] = [],
): Promise<LinkedInPostResult> {
  const token = getToken();
  const author = getAuthorUrn();

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Restli-Protocol-Version': '2.0.0',
  };

  let shareContent: Record<string, unknown>;

  if (mediaUrls.length > 0) {
    // Register and upload images first
    const assets: string[] = [];
    for (const url of mediaUrls) {
      // Register upload
      const { data: reg } = await axios.post(
        `${BASE}/assets?action=registerUpload`,
        {
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            owner: author,
            serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
          },
        },
        { headers },
      );
      const uploadUrl = reg.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl as string;
      const assetUrn = reg.value.asset as string;

      // Fetch remote image and re-upload to LinkedIn
      const imageResp = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer' });
      await axios.put(uploadUrl, imageResp.data, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
      });
      assets.push(assetUrn);
    }

    shareContent = {
      shareCommentary: { text: content },
      shareMediaCategory: 'IMAGE',
      media: assets.map(asset => ({ status: 'READY', media: asset })),
    };
  } else {
    shareContent = {
      shareCommentary: { text: content },
      shareMediaCategory: 'NONE',
    };
  }

  const { data, headers: respHeaders } = await axios.post(
    `${BASE}/ugcPosts`,
    {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': shareContent },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    },
    { headers },
  );

  const postId = (respHeaders['x-restli-id'] as string | undefined) ?? (data as { id?: string })?.id ?? 'unknown';
  logger.info('LinkedIn post published', { postId });
  return { id: postId };
}
