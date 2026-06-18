import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../lib/supabase';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-haiku-4-5';

// ─── Tool Definitions ────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_dashboard_stats',
    description: 'Get overview statistics: contact count, active campaigns, recent messages sent, open rate, click rate.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_contacts',
    description: 'List contacts for the organisation with optional search and pagination.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Optional search term for name, email or phone' },
        limit: { type: 'number', description: 'Max results (default 20, max 100)' },
      },
      required: [],
    },
  },
  {
    name: 'create_contact',
    description: 'Create a new contact record.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        metadata: { type: 'object', description: 'Any extra key/value fields' },
      },
      required: ['name'],
    },
  },
  {
    name: 'list_campaigns',
    description: 'List marketing campaigns with their status and stats.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'active', 'paused', 'completed', 'cancelled'] },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'list_segments',
    description: 'List contact segments/audiences.',
    input_schema: { type: 'object', properties: { limit: { type: 'number' } }, required: [] },
  },
  {
    name: 'list_templates',
    description: 'List message templates, optionally filtered by channel.',
    input_schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', enum: ['email', 'sms', 'whatsapp', 'push'] },
      },
      required: [],
    },
  },
  {
    name: 'create_template',
    description: 'Create a new message template.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        channel: { type: 'string', enum: ['email', 'sms', 'whatsapp', 'push'] },
        subject: { type: 'string', description: 'Email subject (email channel only)' },
        body: { type: 'string', description: 'Template body. Use {{variable}} for personalisation.' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'channel', 'body'],
    },
  },
  {
    name: 'list_social_posts',
    description: 'List scheduled or published social media posts.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'scheduled', 'published', 'failed'] },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'schedule_social_post',
    description: 'Schedule a social media post on Facebook, Instagram, or LinkedIn.',
    input_schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['facebook', 'instagram', 'linkedin'] },
        content: { type: 'string', description: 'Post text content' },
        scheduled_at: { type: 'string', description: 'ISO 8601 datetime, or omit to publish immediately' },
        media_urls: { type: 'array', items: { type: 'string' } },
      },
      required: ['platform', 'content'],
    },
  },
  {
    name: 'list_ad_audiences',
    description: 'List custom audiences created for paid ads.',
    input_schema: { type: 'object', properties: { limit: { type: 'number' } }, required: [] },
  },
];

// ─── Tool Executor ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  orgId: string,
  userId: string,
): Promise<unknown> {
  switch (name) {
    case 'get_dashboard_stats': {
      const [contacts, campaigns, messages] = await Promise.all([
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
        supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active'),
        supabase.from('messages').select('id,status').eq('org_id', orgId).order('created_at', { ascending: false }).limit(1000),
      ]);
      const msgs = messages.data ?? [];
      const sent = msgs.filter(m => m.status === 'sent' || m.status === 'delivered').length;
      const opened = msgs.filter(m => m.status === 'opened').length;
      return {
        total_contacts: contacts.count ?? 0,
        active_campaigns: campaigns.count ?? 0,
        recent_messages_sent: sent,
        open_rate: sent > 0 ? `${Math.round((opened / sent) * 100)}%` : '0%',
      };
    }

    case 'list_contacts': {
      const limit = Math.min(Number(input.limit ?? 20), 100);
      let q = supabase.from('contacts').select('id,name,email,phone,created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(limit);
      if (input.search) {
        const s = String(input.search);
        q = q.or(`name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { contacts: data ?? [], count: (data ?? []).length };
    }

    case 'create_contact': {
      const { data, error } = await supabase.from('contacts').insert({ ...input, org_id: orgId }).select().single();
      if (error) return { error: error.message };
      return { success: true, contact: data };
    }

    case 'list_campaigns': {
      const limit = Math.min(Number(input.limit ?? 20), 100);
      let q = supabase.from('campaigns').select('id,name,status,channel,created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(limit);
      if (input.status) q = q.eq('status', String(input.status));
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { campaigns: data ?? [], count: (data ?? []).length };
    }

    case 'list_segments': {
      const limit = Math.min(Number(input.limit ?? 20), 100);
      const { data, error } = await supabase.from('segments').select('id,name,description,created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(limit);
      if (error) return { error: error.message };
      return { segments: data ?? [], count: (data ?? []).length };
    }

    case 'list_templates': {
      let q = supabase.from('message_templates').select('id,name,channel,subject,tags,created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(50);
      if (input.channel) q = q.eq('channel', String(input.channel));
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { templates: data ?? [], count: (data ?? []).length };
    }

    case 'create_template': {
      const { data, error } = await supabase.from('message_templates').insert({
        org_id: orgId,
        created_by: userId,
        name: input.name,
        channel: input.channel,
        subject: input.subject ?? null,
        body: input.body,
        tags: input.tags ?? [],
      }).select().single();
      if (error) return { error: error.message };
      return { success: true, template: data };
    }

    case 'list_social_posts': {
      const limit = Math.min(Number(input.limit ?? 20), 100);
      let q = supabase.from('social_posts').select('id,platform,content,status,scheduled_at,published_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(limit);
      if (input.status) q = q.eq('status', String(input.status));
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { posts: data ?? [], count: (data ?? []).length };
    }

    case 'schedule_social_post': {
      const status = input.scheduled_at ? 'scheduled' : 'draft';
      const { data, error } = await supabase.from('social_posts').insert({
        org_id: orgId,
        created_by: userId,
        platform: input.platform,
        content: input.content,
        status,
        scheduled_at: input.scheduled_at ?? null,
        media_urls: input.media_urls ?? [],
      }).select().single();
      if (error) return { error: error.message };
      return { success: true, post: data };
    }

    case 'list_ad_audiences': {
      const limit = Math.min(Number(input.limit ?? 20), 100);
      const { data, error } = await supabase.from('ad_audiences').select('id,name,platform,size,created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(limit);
      if (error) return { error: error.message };
      return { audiences: data ?? [], count: (data ?? []).length };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Agentic Loop (streaming via callback) ───────────────────────────────────

export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; name: string }
  | { type: 'tool_result'; name: string; result: unknown }
  | { type: 'done' };

export async function runAgent(
  userMessage: string,
  history: Anthropic.MessageParam[],
  orgId: string,
  userId: string,
  onChunk: (chunk: StreamChunk) => void,
): Promise<void> {
  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  const systemPrompt = `You are an AI assistant for AirPay Campaign Manager — a multi-channel marketing platform.
You can query and manage contacts, campaigns, segments, message templates, social posts, and ad audiences on behalf of the user.
Always be concise and professional. When displaying lists, format them as readable summaries.
Today is ${new Date().toISOString().split('T')[0]}.`;

  let continueLoop = true;

  while (continueLoop) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    let accumulatedText = '';

    stream.on('text', (text) => {
      accumulatedText += text;
      onChunk({ type: 'text', text });
    });

    const finalMsg = await stream.finalMessage();

    messages.push({ role: 'assistant', content: finalMsg.content });

    if (finalMsg.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of finalMsg.content) {
        if (block.type !== 'tool_use') continue;
        onChunk({ type: 'tool_use', name: block.name });

        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          orgId,
          userId,
        );

        onChunk({ type: 'tool_result', name: block.name, result });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: 'user', content: toolResults });
    } else {
      continueLoop = false;
    }
  }

  onChunk({ type: 'done' });
}
