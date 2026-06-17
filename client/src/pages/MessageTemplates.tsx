import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Plus, Trash2, Edit2, Copy, Send, MessageSquare, Mail, Smartphone,
  Search, Tag, Sparkles, X, Check,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MessageTemplate {
  id: string;
  name: string;
  description: string | null;
  channel: 'whatsapp' | 'sms' | 'email' | 'push';
  subject: string | null;
  body: string;
  tags: string[];
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CPA_SEED_TEMPLATES = [
  {
    name: 'CPA Event — Warm Personal (WhatsApp)',
    description: 'Follow-up to CPA Cardiac Pharmacology & ECG session attendees',
    channel: 'whatsapp',
    body: `Hi {{name}}, 👋

It was great connecting with you at the CPA Continuous Education Session on *Cardiac Pharmacology & Advanced ECG* last Tuesday!

As the session sponsor, *AirPay Health-Tech* is on a mission to modernise how pharmacy professionals work — from patient management to digital health records.

We'd love for you to be one of the first pharmacists on our platform 🎉

👉 Register here: www.healthtech.airpayglobal.com

It takes less than 2 minutes — and it's free to get started.

Any questions? Reply to this message and we'll help you out.

— The AirPay Health-Tech Team`,
    tags: ['cpa', 'event-followup', 'healthtech'],
  },
  {
    name: 'CPA Event — Short & Direct (WhatsApp Broadcast)',
    description: 'Short broadcast version for CPA event attendees',
    channel: 'whatsapp',
    body: `Hi {{name}},

Thank you for joining the *CPA ECG & Cardiac Pharmacology session* — we hope it was valuable! 🫀

We're AirPay Health-Tech, proud sponsors of the event. We've built a platform specifically for pharmacy professionals like you.

✅ Register free today: www.healthtech.airpayglobal.com

Questions? Reply here or call us anytime.`,
    tags: ['cpa', 'event-followup', 'broadcast'],
  },
  {
    name: 'CPA Event — Professional Follow-Up (Email)',
    description: 'Email version for CPA event attendees',
    channel: 'email',
    subject: 'You attended our session — here\'s what\'s next for you 💊',
    body: `Dear {{name}},

Thank you for participating in the Community Pharmacists Association Zimbabwe Continuous Education Session on "Cardiac Pharmacology Meets Advanced ECG", held on 21 April 2026.

As the proud sponsors of this session, AirPay Health-Tech is committed to empowering pharmacy professionals across Zimbabwe with modern digital tools — built for the way you work.

Here's what you get when you register:
• Digital patient & prescription management
• Health-tech tools tailored for pharmacists
• Seamless, paperless workflows

Create your free account: www.healthtech.airpayglobal.com

Registration takes under 2 minutes.

We look forward to supporting your practice.

Warm regards,
The AirPay Health-Tech Team
AirPay Global | 145 Fife Avenue, Harare CBD`,
    tags: ['cpa', 'event-followup', 'email'],
  },
];

const CHANNEL_META = {
  whatsapp: { label: 'WhatsApp', color: '#25D366', bg: 'rgba(37,211,102,0.12)', Icon: MessageSquare },
  sms:      { label: 'SMS',      color: '#60A5FA', bg: 'rgba(96,165,250,0.12)', Icon: Smartphone },
  email:    { label: 'Email',    color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', Icon: Mail },
  push:     { label: 'Push',     color: '#FB923C', bg: 'rgba(251,146,60,0.12)', Icon: Send },
} as const;

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast { id: number; type: 'success' | 'error'; msg: string }
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let n = 0;
  const add = (type: Toast['type'], msg: string) => {
    const id = ++n;
    setToasts(t => [...t, { id, type, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  };
  return { toasts, add };
}

// ─── Template Modal ───────────────────────────────────────────────────────────

interface ModalProps {
  initial?: Partial<MessageTemplate>;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => void;
  saving: boolean;
}

function TemplateModal({ initial, onClose, onSave, saving }: ModalProps) {
  const [name, setName]         = useState(initial?.name ?? '');
  const [desc, setDesc]         = useState(initial?.description ?? '');
  const [channel, setChannel]   = useState<'whatsapp'|'sms'|'email'|'push'>(initial?.channel ?? 'whatsapp');
  const [subject, setSubject]   = useState(initial?.subject ?? '');
  const [body, setBody]         = useState(initial?.body ?? '');
  const [tagsStr, setTagsStr]   = useState((initial?.tags ?? []).join(', '));

  const glass: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, color: '#fff', fontSize: 13,
    padding: '10px 14px', width: '100%', boxSizing: 'border-box', outline: 'none',
  };

  const handleSave = () => {
    const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
    onSave({ name, description: desc || null, channel, subject: subject || null, body, tags });
  };

  const cm = CHANNEL_META[channel];

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#0e0e1a', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, width:'100%', maxWidth:600, maxHeight:'92vh', overflowY:'auto', padding:28 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
          <h3 style={{ color:'#fff', margin:0, fontSize:16, fontWeight:700 }}>
            {initial?.id ? 'Edit Template' : 'New Message Template'}
          </h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)' }}><X size={18} /></button>
        </div>

        {/* Name */}
        <div style={{ marginBottom:14 }}>
          <label style={{ color:'rgba(255,255,255,0.45)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Template Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. CPA Event Follow-Up" style={glass} />
        </div>

        {/* Description */}
        <div style={{ marginBottom:14 }}>
          <label style={{ color:'rgba(255,255,255,0.45)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Description</label>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What is this template for?" style={glass} />
        </div>

        {/* Channel */}
        <div style={{ marginBottom:14 }}>
          <label style={{ color:'rgba(255,255,255,0.45)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Channel *</label>
          <div style={{ display:'flex', gap:8 }}>
            {(Object.keys(CHANNEL_META) as Array<keyof typeof CHANNEL_META>).map(ch => {
              const m = CHANNEL_META[ch];
              return (
                <button key={ch} onClick={() => setChannel(ch)} style={{
                  flex:1, padding:'9px 6px', borderRadius:10, fontSize:11, fontWeight:600, cursor:'pointer',
                  border: channel === ch ? `1px solid ${m.color}` : '1px solid rgba(255,255,255,0.08)',
                  background: channel === ch ? m.bg : 'transparent',
                  color: channel === ch ? m.color : 'rgba(255,255,255,0.35)',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:5,
                }}>
                  <m.Icon size={12} /> {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Subject (email only) */}
        {channel === 'email' && (
          <div style={{ marginBottom:14 }}>
            <label style={{ color:'rgba(255,255,255,0.45)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Email Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject line…" style={glass} />
          </div>
        )}

        {/* Body */}
        <div style={{ marginBottom:14 }}>
          <label style={{ color:'rgba(255,255,255,0.45)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>
            Message Body *
            <span style={{ color:'rgba(255,255,255,0.25)', textTransform:'none', letterSpacing:'normal', marginLeft:8 }}>
              Use {'{{name}}'} for first name, {'{{org}}'} for organisation
            </span>
          </label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={10}
            style={{ ...glass, resize:'vertical', fontFamily:'inherit', lineHeight:1.6 }}
            placeholder="Write your message here…" />
          <div style={{ color:'rgba(255,255,255,0.25)', fontSize:11, textAlign:'right', marginTop:4 }}>
            {body.length} chars
          </div>
        </div>

        {/* Tags */}
        <div style={{ marginBottom:24 }}>
          <label style={{ color:'rgba(255,255,255,0.45)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Tags (comma-separated)</label>
          <input value={tagsStr} onChange={e => setTagsStr(e.target.value)} placeholder="cpa, event-followup, campaign-abc" style={glass} />
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:'10px', borderRadius:10, border:'1px solid rgba(255,255,255,0.1)', background:'transparent', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:13 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim() || !body.trim()} style={{
            flex:2, padding:'10px', borderRadius:10, border:'none', cursor: saving ? 'default' : 'pointer', fontSize:13, fontWeight:600,
            background: saving ? 'rgba(255,255,255,0.04)' : `linear-gradient(135deg, ${cm.color}30, ${cm.color}10)`,
            color: saving ? 'rgba(255,255,255,0.3)' : '#fff',
            borderTop: `1px solid ${cm.color}40`,
          }}>
            {saving ? 'Saving…' : initial?.id ? 'Save Changes' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Preview Drawer ───────────────────────────────────────────────────────────

function PreviewDrawer({ template, onClose, onEdit }: { template: MessageTemplate; onClose: () => void; onEdit: () => void }) {
  const [copied, setCopied] = useState(false);
  const cm = CHANNEL_META[template.channel];

  const copyBody = () => {
    navigator.clipboard.writeText(template.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.6)', display:'flex', justifyContent:'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: '100%', maxWidth:520, background:'#0e0e1a', borderLeft:'1px solid rgba(255,255,255,0.08)', height:'100%', overflowY:'auto', padding:28, display:'flex', flexDirection:'column', gap:16 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <div style={{ background:cm.bg, border:`1px solid ${cm.color}30`, borderRadius:7, padding:6 }}>
                <cm.Icon size={14} color={cm.color} />
              </div>
              <span style={{ color:cm.color, fontSize:11, fontWeight:600 }}>{cm.label}</span>
            </div>
            <h3 style={{ color:'#fff', margin:0, fontSize:15, fontWeight:700 }}>{template.name}</h3>
            {template.description && <p style={{ color:'rgba(255,255,255,0.4)', fontSize:12, margin:'4px 0 0' }}>{template.description}</p>}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)' }}><X size={18} /></button>
        </div>

        {template.subject && (
          <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'10px 14px' }}>
            <div style={{ color:'rgba(255,255,255,0.4)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Subject</div>
            <div style={{ color:'#fff', fontSize:13 }}>{template.subject}</div>
          </div>
        )}

        <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'14px 16px', flex:1 }}>
          <pre style={{ color:'rgba(255,255,255,0.85)', fontSize:13, lineHeight:1.7, margin:0, whiteSpace:'pre-wrap', fontFamily:'inherit' }}>
            {template.body}
          </pre>
        </div>

        {template.tags.length > 0 && (
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {template.tags.map(tag => (
              <span key={tag} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:6, padding:'3px 10px', fontSize:11, color:'rgba(255,255,255,0.5)' }}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={copyBody} style={{
            flex:1, padding:'10px', borderRadius:10, fontSize:13, cursor:'pointer', fontWeight:500,
            border:'1px solid rgba(255,255,255,0.1)', background: copied ? 'rgba(52,211,153,0.1)' : 'transparent',
            color: copied ? '#34D399' : 'rgba(255,255,255,0.5)',
            display:'flex', alignItems:'center', justifyContent:'center', gap:6,
          }}>
            {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Body</>}
          </button>
          <button onClick={onEdit} style={{
            flex:1, padding:'10px', borderRadius:10, fontSize:13, cursor:'pointer', fontWeight:500,
            border:`1px solid ${cm.color}40`, background: cm.bg, color: cm.color,
            display:'flex', alignItems:'center', justifyContent:'center', gap:6,
          }}>
            <Edit2 size={14} /> Edit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MessageTemplates() {
  const qc = useQueryClient();
  const { toasts, add: addToast } = useToasts();
  const [showModal, setShowModal]       = useState(false);
  const [editTpl, setEditTpl]           = useState<MessageTemplate | null>(null);
  const [previewTpl, setPreviewTpl]     = useState<MessageTemplate | null>(null);
  const [filterChannel, setFilterChannel] = useState('');
  const [search, setSearch]             = useState('');
  const [seeding, setSeeding]           = useState(false);
  const [seeded, setSeeded]             = useState(false);

  const { data: tplData, isLoading } = useQuery({
    queryKey: ['message-templates', filterChannel],
    queryFn: () => {
      const params = filterChannel ? `?channel=${filterChannel}` : '';
      return api.get(`/message-templates${params}`).then(r => r.data as { data: MessageTemplate[] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/message-templates', payload),
    onSuccess: () => { addToast('success', 'Template created'); setShowModal(false); qc.invalidateQueries({ queryKey: ['message-templates'] }); },
    onError: () => addToast('error', 'Failed to create template'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.patch(`/message-templates/${id}`, payload),
    onSuccess: () => { addToast('success', 'Template updated'); setEditTpl(null); setPreviewTpl(null); qc.invalidateQueries({ queryKey: ['message-templates'] }); },
    onError: () => addToast('error', 'Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/message-templates/${id}`),
    onSuccess: () => { addToast('success', 'Deleted'); setPreviewTpl(null); qc.invalidateQueries({ queryKey: ['message-templates'] }); },
    onError: () => addToast('error', 'Delete failed'),
  });

  const seedCpaTemplates = async () => {
    setSeeding(true);
    try {
      await api.post('/message-templates/bulk', { templates: CPA_SEED_TEMPLATES });
      addToast('success', '3 CPA event templates loaded!');
      setSeeded(true);
      qc.invalidateQueries({ queryKey: ['message-templates'] });
    } catch {
      addToast('error', 'Failed to load templates');
    } finally {
      setSeeding(false);
    }
  };

  const templates = (tplData?.data ?? []).filter(t => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q) || t.tags.some(tag => tag.toLowerCase().includes(q));
  });

  const glass: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, color: '#fff', fontSize: 12, padding: '8px 14px', cursor: 'pointer', outline: 'none',
  };

  return (
    <div style={{ padding:'32px 40px', maxWidth:1100 }}>
      {/* Toasts */}
      <div style={{ position:'fixed', top:24, right:24, zIndex:2000, display:'flex', flexDirection:'column', gap:8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.type === 'success' ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
            border: `1px solid ${t.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`,
            borderRadius:10, padding:'10px 16px', color:'#fff', fontSize:13,
          }}>{t.msg}</div>
        ))}
      </div>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28 }}>
        <div>
          <h1 style={{ color:'#fff', fontSize:24, fontWeight:700, margin:0 }}>Message Templates</h1>
          <p style={{ color:'rgba(255,255,255,0.4)', margin:'6px 0 0', fontSize:13 }}>
            Reusable message templates for WhatsApp, SMS, and Email campaigns
          </p>
        </div>
        <button onClick={() => { setEditTpl(null); setShowModal(true); }} style={{
          display:'flex', alignItems:'center', gap:8,
          background:'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
          border:'1px solid rgba(255,255,255,0.15)', borderRadius:10, padding:'10px 18px',
          color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer',
        }}>
          <Plus size={15} /> New Template
        </button>
      </div>

      {/* CPA Seed Banner */}
      {!seeded && (tplData?.data ?? []).length === 0 && !isLoading && (
        <div style={{ background:'linear-gradient(135deg, rgba(37,211,102,0.08), rgba(37,211,102,0.04))', border:'1px solid rgba(37,211,102,0.2)', borderRadius:14, padding:'18px 22px', marginBottom:24, display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ background:'rgba(37,211,102,0.15)', border:'1px solid rgba(37,211,102,0.3)', borderRadius:10, padding:10 }}>
              <Sparkles size={20} color="#25D366" />
            </div>
            <div>
              <div style={{ color:'#fff', fontWeight:600, fontSize:14 }}>Load CPA Event Templates</div>
              <div style={{ color:'rgba(255,255,255,0.5)', fontSize:12, marginTop:3 }}>
                3 ready-to-send templates for the CPA Cardiac Pharmacology &amp; ECG session attendees
              </div>
            </div>
          </div>
          <button onClick={seedCpaTemplates} disabled={seeding} style={{
            background:'rgba(37,211,102,0.15)', border:'1px solid rgba(37,211,102,0.35)',
            borderRadius:10, padding:'9px 20px', color:'#25D366', fontSize:13, fontWeight:600,
            cursor: seeding ? 'default' : 'pointer', whiteSpace:'nowrap', flexShrink:0,
          }}>
            {seeding ? 'Loading…' : 'Load 3 Templates'}
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:200 }}>
          <Search size={13} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'rgba(255,255,255,0.3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…"
            style={{ ...glass, paddingLeft:34, width:'100%', boxSizing:'border-box' }} />
        </div>
        <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)} style={glass}>
          <option value="">All Channels</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
          <option value="push">Push</option>
        </select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div style={{ color:'rgba(255,255,255,0.3)', textAlign:'center', padding:40 }}>Loading…</div>
      ) : templates.length === 0 ? (
        <div style={{ textAlign:'center', padding:60 }}>
          <div style={{ color:'rgba(255,255,255,0.12)', fontSize:48, marginBottom:12 }}>📋</div>
          <div style={{ color:'rgba(255,255,255,0.4)', fontSize:14 }}>
            {search ? 'No templates match your search.' : 'No templates yet. Create one or load the CPA starter set.'}
          </div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:14 }}>
          {templates.map(tpl => {
            const cm = CHANNEL_META[tpl.channel];
            return (
              <div key={tpl.id} onClick={() => setPreviewTpl(tpl)} style={{
                background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)',
                borderRadius:14, padding:'18px 20px', cursor:'pointer',
                transition:'border-color 0.2s, background 0.2s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
              >
                {/* Top row */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ background:cm.bg, border:`1px solid ${cm.color}30`, borderRadius:7, padding:6 }}>
                      <cm.Icon size={13} color={cm.color} />
                    </div>
                    <span style={{ color:cm.color, fontSize:11, fontWeight:600 }}>{cm.label}</span>
                  </div>
                  <div style={{ display:'flex', gap:4 }} onClick={e => e.stopPropagation()}>
                    <button title="Edit" onClick={() => { setEditTpl(tpl); setShowModal(true); }} style={{ background:'none', border:'1px solid rgba(255,255,255,0.08)', borderRadius:7, padding:6, cursor:'pointer', color:'rgba(255,255,255,0.4)' }}>
                      <Edit2 size={12} />
                    </button>
                    <button title="Delete" onClick={() => { if (confirm('Delete this template?')) deleteMutation.mutate(tpl.id); }} style={{ background:'none', border:'1px solid rgba(248,113,113,0.15)', borderRadius:7, padding:6, cursor:'pointer', color:'rgba(248,113,113,0.5)' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Name */}
                <div style={{ color:'#fff', fontWeight:600, fontSize:13, marginBottom:4, lineHeight:1.4 }}>{tpl.name}</div>
                {tpl.description && (
                  <div style={{ color:'rgba(255,255,255,0.4)', fontSize:11, marginBottom:10 }}>{tpl.description}</div>
                )}

                {/* Body preview */}
                <div style={{ color:'rgba(255,255,255,0.55)', fontSize:12, lineHeight:1.6,
                  overflow:'hidden', display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical' as const, marginBottom:12 }}>
                  {tpl.body}
                </div>

                {/* Tags */}
                {tpl.tags.length > 0 && (
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                    {tpl.tags.map(tag => (
                      <span key={tag} style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:5, padding:'2px 8px', fontSize:10, color:'rgba(255,255,255,0.4)', display:'flex', alignItems:'center', gap:3 }}>
                        <Tag size={9} /> {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <TemplateModal
          initial={editTpl ?? undefined}
          onClose={() => { setShowModal(false); setEditTpl(null); }}
          onSave={payload => {
            if (editTpl) updateMutation.mutate({ id: editTpl.id, payload });
            else createMutation.mutate(payload);
          }}
          saving={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {/* Preview Drawer */}
      {previewTpl && (
        <PreviewDrawer
          template={previewTpl}
          onClose={() => setPreviewTpl(null)}
          onEdit={() => { setEditTpl(previewTpl); setPreviewTpl(null); setShowModal(true); }}
        />
      )}
    </div>
  );
}
