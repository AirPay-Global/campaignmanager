import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Plus, Send, Clock, CheckCircle2, XCircle, Trash2, Edit2, Eye, Calendar, Image } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SocialPost {
  id: string;
  platform: 'facebook' | 'instagram' | 'linkedin';
  content: string;
  media_urls: string[];
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  scheduled_at: string | null;
  published_at: string | null;
  platform_post_id: string | null;
  error_message: string | null;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLATFORM_META = {
  facebook:  { label: 'Facebook',  color: '#1877F2', bg: 'rgba(24,119,242,0.15)',  letter: 'f' },
  instagram: { label: 'Instagram', color: '#E1306C', bg: 'rgba(225,48,108,0.15)', letter: 'in' },
  linkedin:  { label: 'LinkedIn',  color: '#0A66C2', bg: 'rgba(10,102,194,0.15)', letter: 'li' },
} as const;

function PlatformIcon({ platform, size = 18 }: { platform: keyof typeof PLATFORM_META; size?: number }) {
  const m = PLATFORM_META[platform];
  return (
    <div style={{
      width: size + 6, height: size + 6, borderRadius: 6,
      background: m.bg, border: `1px solid ${m.color}50`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: m.color, fontWeight: 800, fontSize: size * 0.55, letterSpacing: '-0.02em',
      flexShrink: 0,
    }}>
      {m.letter}
    </div>
  );
}

const STATUS_META = {
  draft:     { label: 'Draft',     color: 'rgba(255,255,255,0.4)',  Icon: Edit2        },
  scheduled: { label: 'Scheduled', color: '#FBBF24',                Icon: Clock        },
  published: { label: 'Published', color: '#34D399',                Icon: CheckCircle2 },
  failed:    { label: 'Failed',    color: '#F87171',                Icon: XCircle      },
} as const;

function formatScheduled(dt: string): string {
  const d = new Date(dt);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function toLocalDatetimeInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localDatetimeToISO(local: string): string {
  return new Date(local).toISOString();
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast { id: number; type: 'success' | 'error'; msg: string }

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let next = 0;
  const add = (type: Toast['type'], msg: string) => {
    const id = ++next;
    setToasts(t => [...t, { id, type, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  };
  return { toasts, add };
}

// ─── Post Modal ───────────────────────────────────────────────────────────────

interface PostModalProps {
  initial?: Partial<SocialPost>;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
  saving: boolean;
}

function PostModal({ initial, onClose, onSave, saving }: PostModalProps) {
  const [platform, setPlatform] = useState<'facebook' | 'instagram' | 'linkedin'>(
    (initial?.platform ?? 'facebook') as 'facebook' | 'instagram' | 'linkedin',
  );
  const [content, setContent] = useState(initial?.content ?? '');
  const [mediaUrls, setMediaUrls] = useState<string[]>(initial?.media_urls ?? []);
  const [mediaInput, setMediaInput] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>(
    initial?.scheduled_at ? 'later' : 'now',
  );
  const [scheduledAt, setScheduledAt] = useState(toLocalDatetimeInput(initial?.scheduled_at ?? undefined));

  const charLimit = platform === 'linkedin' ? 3000 : platform === 'facebook' ? 63206 : 2200;
  const remaining = charLimit - content.length;

  const addMedia = () => {
    const url = mediaInput.trim();
    if (url) { setMediaUrls(u => [...u, url]); setMediaInput(''); }
  };

  const handleSave = () => {
    const payload: Record<string, unknown> = { platform, content, media_urls: mediaUrls };
    if (scheduleMode === 'now') {
      payload.publish_now = true;
    } else {
      payload.scheduled_at = localDatetimeToISO(scheduledAt);
    }
    onSave(payload);
  };

  const glass: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '10px 14px',
    color: '#fff',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'var(--color-modal-bg)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto', padding:24 }}>
        <h3 style={{ color:'#fff', margin:'0 0 20px', fontSize:16, fontWeight:600 }}>
          {initial?.id ? 'Edit Post' : 'New Social Post'}
        </h3>

        {/* Platform */}
        <div style={{ marginBottom:16 }}>
          <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Platform</div>
          <div style={{ display:'flex', gap:8 }}>
            {(['facebook','instagram','linkedin'] as const).map(p => {
              const m = PLATFORM_META[p];
              return (
                <button key={p} onClick={() => setPlatform(p)} style={{
                  flex:1, padding:'10px 8px', borderRadius:10, fontSize:12, fontWeight:600, cursor:'pointer',
                  border: platform === p ? `1px solid ${m.color}` : '1px solid rgba(255,255,255,0.08)',
                  background: platform === p ? m.bg : 'transparent',
                  color: platform === p ? m.color : 'rgba(255,255,255,0.4)',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:6, transition:'all 0.2s',
                }}>
                  <PlatformIcon platform={p} size={12} /> {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div style={{ marginBottom:16 }}>
          <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Post Content</div>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            maxLength={charLimit}
            rows={6}
            style={{ ...glass, resize:'vertical', fontFamily:'inherit', lineHeight:1.6 }}
            placeholder={`Write your ${PLATFORM_META[platform].label} post here...`}
          />
          <div style={{ color: remaining < 50 ? '#F87171' : 'rgba(255,255,255,0.3)', fontSize:11, textAlign:'right', marginTop:4 }}>
            {remaining.toLocaleString()} characters remaining
          </div>
        </div>

        {/* Media URLs */}
        <div style={{ marginBottom:16 }}>
          <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>
            Media URLs <span style={{ color:'rgba(255,255,255,0.25)', textTransform:'none', letterSpacing:'normal' }}>(optional, publicly accessible image URLs)</span>
          </div>
          {mediaUrls.map((url, i) => (
            <div key={i} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:6 }}>
              <div style={{ flex:1, ...glass, padding:'8px 12px', display:'flex', alignItems:'center', gap:8, overflow:'hidden' }}>
                <Image size={12} color="rgba(255,255,255,0.3)" style={{ flexShrink:0 }} />
                <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:12 }}>{url}</span>
              </div>
              <button onClick={() => setMediaUrls(u => u.filter((_,j) => j !== i))}
                style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,100,100,0.7)', padding:4 }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div style={{ display:'flex', gap:8 }}>
            <input
              value={mediaInput}
              onChange={e => setMediaInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addMedia(); }}}
              placeholder="https://example.com/image.jpg"
              style={{ ...glass, flex:1 }}
            />
            <button onClick={addMedia} style={{
              background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10,
              color:'rgba(255,255,255,0.6)', cursor:'pointer', padding:'0 14px', fontSize:12,
            }}>Add</button>
          </div>
          {platform === 'instagram' && mediaUrls.length === 0 && (
            <div style={{ color:'#FBBF24', fontSize:11, marginTop:6 }}>Instagram requires at least one image URL.</div>
          )}
        </div>

        {/* Schedule */}
        <div style={{ marginBottom:24 }}>
          <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Timing</div>
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            {(['now','later'] as const).map(m => (
              <button key={m} onClick={() => setScheduleMode(m)} style={{
                flex:1, padding:'9px 8px', borderRadius:10, fontSize:12, fontWeight:600, cursor:'pointer',
                border: scheduleMode === m ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                background: scheduleMode === m ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: scheduleMode === m ? '#fff' : 'rgba(255,255,255,0.4)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              }}>
                {m === 'now' ? <><Send size={13} /> Publish Now</> : <><Calendar size={13} /> Schedule</>}
              </button>
            ))}
          </div>
          {scheduleMode === 'later' && (
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              style={{ ...glass }}
            />
          )}
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{
            flex:1, padding:'10px', borderRadius:10, border:'1px solid rgba(255,255,255,0.1)',
            background:'transparent', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:13,
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !content.trim() || (scheduleMode === 'later' && !scheduledAt)} style={{
            flex:2, padding:'10px', borderRadius:10, border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
            background: saving ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
            color: saving ? 'rgba(255,255,255,0.3)' : '#fff',
          }}>
            {saving ? 'Saving…' : scheduleMode === 'now' ? 'Publish Now' : 'Schedule Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

function PreviewModal({ post, onClose }: { post: SocialPost; onClose: () => void }) {
  const pm = PLATFORM_META[post.platform];
  const sm = STATUS_META[post.status];
  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'var(--color-modal-bg)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, width:'100%', maxWidth:480, padding:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <PlatformIcon platform={post.platform} size={16} />
            <div>
              <div style={{ color:'#fff', fontWeight:600, fontSize:14 }}>{pm.label}</div>
              <div style={{ color:sm.color, fontSize:11, display:'flex', alignItems:'center', gap:4 }}>
                <sm.Icon size={10} /> {sm.label}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)', fontSize:18 }}>✕</button>
        </div>

        <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:10, padding:16, marginBottom:16 }}>
          <p style={{ color:'rgba(255,255,255,0.85)', fontSize:14, lineHeight:1.7, margin:0, whiteSpace:'pre-wrap' }}>{post.content}</p>
        </div>

        {post.media_urls?.length > 0 && (
          <div style={{ marginBottom:16 }}>
            {post.media_urls.map((url, i) => (
              <img key={i} src={url} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                style={{ width:'100%', borderRadius:8, marginBottom:8, objectFit:'cover', maxHeight:220 }} />
            ))}
          </div>
        )}

        {post.scheduled_at && post.status === 'scheduled' && (
          <div style={{ color:'#FBBF24', fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
            <Clock size={12} /> Scheduled for {formatScheduled(post.scheduled_at)}
          </div>
        )}
        {post.published_at && (
          <div style={{ color:'#34D399', fontSize:12, display:'flex', alignItems:'center', gap:6 }}>
            <CheckCircle2 size={12} /> Published {formatScheduled(post.published_at)}
            {post.platform_post_id && <span style={{ color:'rgba(255,255,255,0.3)' }}>· ID: {post.platform_post_id}</span>}
          </div>
        )}
        {post.error_message && (
          <div style={{ color:'#F87171', fontSize:12, marginTop:8, background:'rgba(248,113,113,0.08)', borderRadius:8, padding:'8px 12px' }}>
            {post.error_message}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Social() {
  const qc = useQueryClient();
  const { toasts, add: addToast } = useToasts();
  const [showModal, setShowModal] = useState(false);
  const [editPost, setEditPost] = useState<SocialPost | null>(null);
  const [previewPost, setPreviewPost] = useState<SocialPost | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  const { data: postsData, isLoading } = useQuery({
    queryKey: ['social-posts', filterPlatform, filterStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterPlatform) params.set('platform', filterPlatform);
      if (filterStatus)   params.set('status', filterStatus);
      return api.get(`/social/posts?${params.toString()}`).then(r => r.data as { data: SocialPost[] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/social/posts', payload),
    onSuccess: () => {
      addToast('success', 'Post saved!');
      setShowModal(false);
      qc.invalidateQueries({ queryKey: ['social-posts'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message
        ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Failed to save post';
      addToast('error', msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.patch(`/social/posts/${id}`, payload),
    onSuccess: () => {
      addToast('success', 'Post updated!');
      setEditPost(null);
      qc.invalidateQueries({ queryKey: ['social-posts'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Update failed';
      addToast('error', msg);
    },
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => api.post(`/social/posts/${id}/publish`),
    onSuccess: () => {
      addToast('success', 'Published!');
      qc.invalidateQueries({ queryKey: ['social-posts'] });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Publish failed';
      addToast('error', msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/social/posts/${id}`),
    onSuccess: () => { addToast('success', 'Deleted'); qc.invalidateQueries({ queryKey: ['social-posts'] }); },
    onError: () => addToast('error', 'Delete failed'),
  });

  const posts = postsData?.data ?? [];

  // Group by status for summary counts
  const counts = posts.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1; return acc;
  }, {});

  const glass: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    color: '#fff',
    fontSize: 12,
    padding: '8px 14px',
    cursor: 'pointer',
    outline: 'none',
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
      {/* Toasts */}
      <div style={{ position:'fixed', top:24, right:24, zIndex:2000, display:'flex', flexDirection:'column', gap:8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.type === 'success' ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
            border: `1px solid ${t.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
            borderRadius: 10, padding: '10px 16px', color: '#fff', fontSize: 13,
          }}>{t.msg}</div>
        ))}
      </div>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:32 }}>
        <div>
          <h1 style={{ color:'#fff', fontSize:24, fontWeight:700, margin:0 }}>Social Scheduling</h1>
          <p style={{ color:'rgba(255,255,255,0.4)', margin:'6px 0 0', fontSize:13 }}>
            Schedule and publish posts to Facebook, Instagram, and LinkedIn
          </p>
        </div>
        <button onClick={() => { setEditPost(null); setShowModal(true); }} style={{
          display:'flex', alignItems:'center', gap:8,
          background:'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
          border:'1px solid rgba(255,255,255,0.15)', borderRadius:10, padding:'10px 18px',
          color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer',
        }}>
          <Plus size={15} /> New Post
        </button>
      </div>

      {/* Summary Chips */}
      <div style={{ display:'flex', gap:12, marginBottom:24, flexWrap:'wrap' }}>
        {(Object.entries(STATUS_META) as [string, typeof STATUS_META[keyof typeof STATUS_META]][]).map(([key, m]) => (
          <div key={key} style={{
            background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)',
            borderRadius:10, padding:'10px 16px', display:'flex', alignItems:'center', gap:8,
          }}>
            <m.Icon size={13} color={m.color} />
            <span style={{ color:m.color, fontWeight:600, fontSize:13 }}>{counts[key] ?? 0}</span>
            <span style={{ color:'rgba(255,255,255,0.4)', fontSize:12 }}>{m.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)} style={glass}>
          <option value="">All Platforms</option>
          <option value="facebook">Facebook</option>
          <option value="instagram">Instagram</option>
          <option value="linkedin">LinkedIn</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={glass}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Published</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Env vars hint */}
      <div style={{ background:'rgba(251,191,36,0.07)', border:'1px solid rgba(251,191,36,0.2)', borderRadius:12, padding:'12px 16px', marginBottom:24, fontSize:12, color:'rgba(255,255,255,0.6)' }}>
        <strong style={{ color:'#FBBF24' }}>Setup required:</strong>
        {' '}Facebook/Instagram: <code style={{ color:'#FBBF24' }}>FACEBOOK_PAGE_ACCESS_TOKEN</code> + <code style={{ color:'#FBBF24' }}>FACEBOOK_PAGE_ID</code>
        {' '}(+ <code style={{ color:'#FBBF24' }}>INSTAGRAM_BUSINESS_ACCOUNT_ID</code> for IG).
        {' '}LinkedIn: <code style={{ color:'#FBBF24' }}>LINKEDIN_ACCESS_TOKEN</code> + <code style={{ color:'#FBBF24' }}>LINKEDIN_AUTHOR_URN</code>.
      </div>

      {/* Posts List */}
      {isLoading ? (
        <div style={{ color:'rgba(255,255,255,0.3)', textAlign:'center', padding:40 }}>Loading…</div>
      ) : posts.length === 0 ? (
        <div style={{ textAlign:'center', padding:60 }}>
          <div style={{ color:'rgba(255,255,255,0.15)', fontSize:48, marginBottom:12 }}>📅</div>
          <div style={{ color:'rgba(255,255,255,0.4)', fontSize:14 }}>No posts yet. Create one to get started.</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {posts.map(post => {
            const sm = STATUS_META[post.status];
            return (
              <div key={post.id} style={{
                background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)',
                borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'flex-start', gap:16,
              }}>
                {/* Platform icon */}
                <PlatformIcon platform={post.platform} size={18} />

                {/* Content */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ color:'rgba(255,255,255,0.85)', fontSize:13, lineHeight:1.5,
                    overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as const }}>
                    {post.content}
                  </div>
                  <div style={{ display:'flex', gap:12, alignItems:'center', marginTop:8, flexWrap:'wrap' }}>
                    {/* Status */}
                    <span style={{ display:'flex', alignItems:'center', gap:4, color:sm.color, fontSize:11 }}>
                      <sm.Icon size={11} /> {sm.label}
                    </span>
                    {/* Time */}
                    {post.scheduled_at && post.status === 'scheduled' && (
                      <span style={{ color:'rgba(255,255,255,0.3)', fontSize:11, display:'flex', alignItems:'center', gap:4 }}>
                        <Clock size={10} /> {formatScheduled(post.scheduled_at)}
                      </span>
                    )}
                    {post.published_at && (
                      <span style={{ color:'rgba(255,255,255,0.3)', fontSize:11 }}>
                        Published {formatScheduled(post.published_at)}
                      </span>
                    )}
                    {/* Media badge */}
                    {post.media_urls?.length > 0 && (
                      <span style={{ color:'rgba(255,255,255,0.3)', fontSize:11, display:'flex', alignItems:'center', gap:4 }}>
                        <Image size={10} /> {post.media_urls.length} image{post.media_urls.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {post.error_message && (
                      <span style={{ color:'#F87171', fontSize:11 }} title={post.error_message}>
                        ⚠ {post.error_message.slice(0, 60)}{post.error_message.length > 60 ? '…' : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button title="Preview" onClick={() => setPreviewPost(post)} style={{ background:'none', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:7, cursor:'pointer', color:'rgba(255,255,255,0.4)' }}>
                    <Eye size={14} />
                  </button>
                  {(post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed') && (
                    <>
                      <button title="Edit" onClick={() => setEditPost(post)} style={{ background:'none', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:7, cursor:'pointer', color:'rgba(255,255,255,0.4)' }}>
                        <Edit2 size={14} />
                      </button>
                      <button title="Publish Now" onClick={() => publishMutation.mutate(post.id)} style={{ background:'none', border:'1px solid rgba(52,211,153,0.3)', borderRadius:8, padding:7, cursor:'pointer', color:'#34D399' }}>
                        <Send size={14} />
                      </button>
                    </>
                  )}
                  <button title="Delete" onClick={() => { if (confirm('Delete this post?')) deleteMutation.mutate(post.id); }} style={{ background:'none', border:'1px solid rgba(248,113,113,0.2)', borderRadius:8, padding:7, cursor:'pointer', color:'rgba(248,113,113,0.6)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <PostModal
          onClose={() => setShowModal(false)}
          onSave={payload => createMutation.mutate(payload)}
          saving={createMutation.isPending}
        />
      )}

      {/* Edit Modal */}
      {editPost && (
        <PostModal
          initial={editPost}
          onClose={() => setEditPost(null)}
          onSave={payload => updateMutation.mutate({ id: editPost.id, payload })}
          saving={updateMutation.isPending}
        />
      )}

      {/* Preview Modal */}
      {previewPost && <PreviewModal post={previewPost} onClose={() => setPreviewPost(null)} />}
    </div>
  );
}
