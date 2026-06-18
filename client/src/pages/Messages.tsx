import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send, History, MessageSquare, Phone, Mail, Search,
  CheckSquare, Square, ChevronDown, Loader2, AlertCircle,
  MessageCircle, FileText, Plus, Trash2, BookOpen, Eye, Tag, Info,
} from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

interface Contact {
  id: string;
  name: string;
  phone?: string;
  whatsapp_id?: string;
  email?: string;
  opt_out_channels?: string[];
  custom_fields?: Record<string, unknown>;
}
interface ContactsResponse { data: Contact[]; }
interface LibraryTemplate { id: string; name: string; channel: string; subject?: string; body: string; tags: string[]; }
interface TemplatesResponse { data: LibraryTemplate[]; }
interface OutboundMessage { id: string; channel: string; recipient_id: string; body?: string; subject?: string; template_name?: string; status: string; error_message?: string; created_at: string; }
interface OutboundResponse { data: OutboundMessage[]; total: number; totalPages: number; }

type Channel = 'whatsapp' | 'sms' | 'email';
type RecipientMode = 'single' | 'group';
type MessageType = 'text' | 'template' | 'library';
type Tab = 'compose' | 'history';

interface TemplateVar { key: string; value: string; }

const CHANNEL_META: Record<Channel, { label: string; icon: React.ReactNode; placeholder: string; field: keyof Contact }> = {
  whatsapp: { label: 'WhatsApp', icon: <MessageCircle size={14} />, placeholder: '+264811234567', field: 'whatsapp_id' },
  sms:      { label: 'SMS',      icon: <Phone size={14} />,         placeholder: '+264811234567', field: 'phone' },
  email:    { label: 'Email',    icon: <Mail size={14} />,          placeholder: 'user@example.com', field: 'email' },
};

const LANG_CODES = ['en', 'en_US', 'en_GB', 'af', 'sq', 'ar', 'az', 'bn', 'bg', 'ca', 'zh_CN', 'zh_TW', 'hr', 'cs', 'da', 'nl', 'et', 'fil', 'fi', 'fr', 'ka', 'de', 'el', 'gu', 'ha', 'he', 'hi', 'hu', 'id', 'ga', 'it', 'ja', 'kn', 'kk', 'ko', 'lo', 'lv', 'lt', 'mk', 'ms', 'ml', 'mr', 'nb', 'fa', 'pl', 'pt_BR', 'pt_PT', 'pa', 'ro', 'ru', 'sr', 'sk', 'sl', 'es', 'es_AR', 'es_ES', 'es_MX', 'sw', 'sv', 'ta', 'te', 'th', 'tr', 'uk', 'ur', 'uz', 'vi', 'zu'];

const STATUS_COLORS: Record<string, string> = {
  sent: '#22c55e', delivered: '#22c55e', pending: '#f59e0b',
  queued: '#6366f1', failed: '#ef4444', read: '#a78bfa',
};

// Vars auto-resolved from contact fields
const CONTACT_AUTO_VARS = new Set(['name', 'first_name', 'last_name', 'phone', 'email', 'whatsapp']);

function resolveBody(template: string, contact: Contact, extraVars: Record<string, string>): string {
  const nameParts = (contact.name ?? '').split(' ');
  const vars: Record<string, string> = {
    name: contact.name ?? '',
    first_name: nameParts[0] ?? '',
    last_name: nameParts.slice(1).join(' ') ?? '',
    phone: contact.phone ?? '',
    email: contact.email ?? '',
    whatsapp: contact.whatsapp_id ?? '',
    ...Object.entries(contact.custom_fields ?? {}).reduce<Record<string, string>>(
      (acc, [k, v]) => { acc[k] = String(v ?? ''); return acc; }, {}
    ),
    ...extraVars,
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

function highlightVars(text: string): React.ReactNode[] {
  const parts = text.split(/(\{\{[\w]+\}\})/g);
  return parts.map((p, i) =>
    /^\{\{[\w]+\}\}$/.test(p)
      ? <span key={i} style={{ color: '#c084fc', background: 'rgba(192,132,252,0.12)', borderRadius: 4, padding: '0 3px', fontFamily: 'monospace', fontSize: 12 }}>{p}</span>
      : <span key={i}>{p}</span>
  );
}

export default function Messages() {
  const { toasts, addToast, dismissToast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('compose');

  // Compose state
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [msgType, setMsgType] = useState<MessageType>('text');
  const [mode, setMode] = useState<RecipientMode>('single');
  const [singleRecipient, setSingleRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [langCode, setLangCode] = useState('en_US');
  const [templateVars, setTemplateVars] = useState<TemplateVar[]>([]);

  // Library mode state
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [extraVars, setExtraVars] = useState<Record<string, string>>({});

  // Contact picker state
  const [contactSearch, setContactSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // History state
  const [historyPage, setHistoryPage] = useState(1);
  const [historyChannel, setHistoryChannel] = useState<string>('');

  const { data: contactsData } = useQuery<ContactsResponse>({
    queryKey: ['contacts'],
    queryFn: () => api.get('/contacts').then(r => r.data),
  });
  const allContacts = contactsData?.data ?? [];

  const { data: templatesData } = useQuery<TemplatesResponse>({
    queryKey: ['message-templates'],
    queryFn: () => api.get('/message-templates').then(r => r.data),
  });
  const allTemplates = templatesData?.data ?? [];

  const filteredContacts = useMemo(() => {
    const q = contactSearch.toLowerCase();
    const field = CHANNEL_META[channel].field;
    return allContacts.filter(c => {
      if (Array.isArray(c.opt_out_channels) && c.opt_out_channels.includes(channel)) return false;
      if (!c[field]) return false;
      if (!q) return true;
      return c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q);
    });
  }, [allContacts, contactSearch, channel]);

  // Library template computations
  const libraryTemplates = useMemo(() =>
    allTemplates.filter(t => {
      const matchCh = !t.channel || t.channel === channel;
      const q = templateSearch.toLowerCase();
      return matchCh && (!q || t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q));
    }),
    [allTemplates, channel, templateSearch]
  );

  const selectedTemplate = useMemo(
    () => allTemplates.find(t => t.id === selectedTemplateId) ?? null,
    [allTemplates, selectedTemplateId]
  );

  const detectedVars = useMemo(() => {
    if (!selectedTemplate) return [];
    const matches = [...selectedTemplate.body.matchAll(/\{\{(\w+)\}\}/g)];
    if (selectedTemplate.subject) matches.push(...selectedTemplate.subject.matchAll(/\{\{(\w+)\}\}/g));
    return [...new Set(matches.map(m => m[1]))];
  }, [selectedTemplate]);

  const unknownVars = useMemo(
    () => detectedVars.filter(v => !CONTACT_AUTO_VARS.has(v)),
    [detectedVars]
  );

  // Preview: substituted message for first selected contact
  const previewContact = useMemo(() => {
    if (selectedIds.size === 0) return null;
    const firstId = [...selectedIds][0]!;
    return allContacts.find(c => c.id === firstId) ?? null;
  }, [selectedIds, allContacts]);

  const previewBody = useMemo(() => {
    if (!selectedTemplate) return '';
    if (!previewContact) return selectedTemplate.body;
    return resolveBody(selectedTemplate.body, previewContact, extraVars);
  }, [selectedTemplate, previewContact, extraVars]);

  const { data: historyData, isLoading: historyLoading } = useQuery<OutboundResponse>({
    queryKey: ['messages-outbound', historyPage, historyChannel],
    queryFn: () => api.get('/messages/outbound', {
      params: { page: historyPage, limit: 30, ...(historyChannel ? { channel: historyChannel } : {}) },
    }).then(r => r.data),
    enabled: tab === 'history',
  });

  const buildPayload = (extra: object) => {
    if (msgType === 'template') {
      const vars = templateVars.reduce<Record<string, string>>((acc, v) => { if (v.key) acc[v.key] = v.value; return acc; }, {});
      return { channel, template_name: templateName, language_code: langCode, template_vars: Object.keys(vars).length ? vars : undefined, ...extra };
    }
    return { channel, body, ...(subject ? { subject } : {}), ...extra };
  };

  const sendSingle = useMutation({
    mutationFn: (payload: object) => api.post('/messages/send', payload),
    onSuccess: () => {
      addToast('success', 'Message sent successfully.');
      setBody(''); setSubject(''); setSingleRecipient(''); setTemplateName(''); setTemplateVars([]);
      qc.invalidateQueries({ queryKey: ['messages-outbound'] });
    },
    onError: (err: unknown) => addToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to send.'),
  });

  const sendBulk = useMutation({
    mutationFn: (payload: object) => api.post('/messages/send-bulk', payload),
    onSuccess: (res) => {
      const { succeeded, total } = res.data as { succeeded: number; total: number };
      addToast(succeeded === total ? 'success' : 'error', `Sent ${succeeded} of ${total} messages.`);
      setBody(''); setSubject(''); setSelectedIds(new Set()); setTemplateName(''); setTemplateVars([]);
      qc.invalidateQueries({ queryKey: ['messages-outbound'] });
    },
    onError: (err: unknown) => addToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to send bulk.'),
  });

  const sendTemplateBulk = useMutation({
    mutationFn: (payload: object) => api.post('/messages/send-template-bulk', payload),
    onSuccess: (res) => {
      const { succeeded, total } = res.data as { succeeded: number; total: number };
      addToast(succeeded === total ? 'success' : 'error', `Personalised messages sent: ${succeeded} of ${total}.`);
      setSelectedTemplateId(''); setSelectedIds(new Set()); setExtraVars({});
      qc.invalidateQueries({ queryKey: ['messages-outbound'] });
    },
    onError: (err: unknown) => addToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to send.'),
  });

  const handleSend = () => {
    if (msgType === 'library') {
      if (!selectedTemplateId) { addToast('error', 'Select a template from the library.'); return; }
      if (selectedIds.size === 0) { addToast('error', 'Select at least one contact.'); return; }
      sendTemplateBulk.mutate({ template_id: selectedTemplateId, channel, contact_ids: [...selectedIds], extra_vars: extraVars });
      return;
    }

    if (msgType === 'text' && !body.trim()) { addToast('error', 'Message body is required.'); return; }
    if (msgType === 'text' && channel === 'email' && !subject.trim()) { addToast('error', 'Subject is required for email.'); return; }
    if (msgType === 'template' && !templateName.trim()) { addToast('error', 'Template name is required.'); return; }

    if (mode === 'single') {
      if (!singleRecipient.trim()) { addToast('error', 'Recipient is required.'); return; }
      sendSingle.mutate(buildPayload({ recipient_id: singleRecipient.trim() }));
    } else {
      if (selectedIds.size === 0) { addToast('error', 'Select at least one contact.'); return; }
      const field = CHANNEL_META[channel].field;
      const recipients = allContacts
        .filter(c => selectedIds.has(c.id))
        .map(c => ({ recipient_id: c[field] as string, contact_id: c.id }));
      sendBulk.mutate(buildPayload({ recipients }));
    }
  };

  const toggleContact = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    setSelectedIds(selectedIds.size === filteredContacts.length ? new Set() : new Set(filteredContacts.map(c => c.id)));
  };

  const addTemplateVar = () => setTemplateVars(v => [...v, { key: '', value: '' }]);
  const updateTemplateVar = (i: number, field: 'key' | 'value', val: string) =>
    setTemplateVars(v => v.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  const removeTemplateVar = (i: number) => setTemplateVars(v => v.filter((_, idx) => idx !== i));

  const isSending = sendSingle.isPending || sendBulk.isPending || sendTemplateBulk.isPending;

  // Right panel: always show contact picker in library mode
  const showContactPicker = msgType === 'library' || mode === 'group';

  return (
    <div style={{ padding: '32px', minHeight: '100vh', background: '#06060f', position: 'relative' }}>
      <div className="aurora-bg" />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div className="animate-fade-in-up" style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>Messages</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Compose and send personalised outbound communications</p>
        </div>

        {/* Tabs */}
        <div className="animate-fade-in-up stagger-1" style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 4, width: 'fit-content', border: '1px solid rgba(255,255,255,0.06)' }}>
          {(['compose', 'history'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'pointer', transition: 'all 0.2s',
              background: tab === t ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: tab === t ? '#fff' : 'rgba(255,255,255,0.35)',
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              {t === 'compose' ? <Send size={13} /> : <History size={13} />}
              {t === 'compose' ? 'Compose' : 'History'}
            </button>
          ))}
        </div>

        {/* ── Compose ─────────────────────────────────────────────── */}
        {tab === 'compose' && (
          <div className="animate-slide-up" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 1100 }}>

            {/* Left column */}
            <div className="glass" style={{ borderRadius: 16, padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MessageSquare size={15} color="#818cf8" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>New Message</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Fill in the details below</div>
                </div>
              </div>

              {/* Channel */}
              <div>
                <span className="chrome-label">Channel</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(Object.keys(CHANNEL_META) as Channel[]).map(ch => {
                    const meta = CHANNEL_META[ch];
                    const active = channel === ch;
                    return (
                      <button key={ch} onClick={() => { setChannel(ch); setSelectedIds(new Set()); setSelectedTemplateId(''); }} style={{
                        flex: 1, padding: '9px 10px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        cursor: 'pointer', transition: 'all 0.2s',
                        border: active ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.08)',
                        background: active ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                        color: active ? '#818cf8' : 'rgba(255,255,255,0.4)',
                      }}>
                        {meta.icon} {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message type */}
              <div>
                <span className="chrome-label">Message Type</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setMsgType('text')} style={{
                    flex: 1, padding: '9px 8px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    cursor: 'pointer', transition: 'all 0.2s',
                    border: msgType === 'text' ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    background: msgType === 'text' ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                    color: msgType === 'text' ? '#818cf8' : 'rgba(255,255,255,0.4)',
                  }}>
                    <MessageCircle size={13} /> Free Text
                  </button>
                  {channel === 'whatsapp' && (
                    <button onClick={() => setMsgType('template')} style={{
                      flex: 1, padding: '9px 8px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      cursor: 'pointer', transition: 'all 0.2s',
                      border: msgType === 'template' ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(255,255,255,0.08)',
                      background: msgType === 'template' ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.03)',
                      color: msgType === 'template' ? '#c084fc' : 'rgba(255,255,255,0.4)',
                    }}>
                      <FileText size={13} /> WA Template
                    </button>
                  )}
                  <button onClick={() => { setMsgType('library'); setMode('group'); }} style={{
                    flex: 1, padding: '9px 8px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    cursor: 'pointer', transition: 'all 0.2s',
                    border: msgType === 'library' ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    background: msgType === 'library' ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.03)',
                    color: msgType === 'library' ? '#34d399' : 'rgba(255,255,255,0.4)',
                  }}>
                    <BookOpen size={13} /> From Library
                  </button>
                </div>
              </div>

              {/* ── Library mode: template picker ───────────────────── */}
              {msgType === 'library' && (
                <>
                  <div>
                    <span className="chrome-label">Select Template</span>
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <Search size={13} color="rgba(255,255,255,0.2)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                      <input
                        type="text" value={templateSearch} onChange={e => setTemplateSearch(e.target.value)}
                        placeholder="Search templates…" className="input-glass" style={{ paddingLeft: 34, fontSize: 13 }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                      {libraryTemplates.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
                          No templates for {channel}. Create some in Templates.
                        </div>
                      ) : (
                        libraryTemplates.map(t => {
                          const active = selectedTemplateId === t.id;
                          return (
                            <button key={t.id} onClick={() => { setSelectedTemplateId(t.id); setExtraVars({}); }} style={{
                              textAlign: 'left', padding: '10px 14px', borderRadius: 10,
                              border: active ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.06)',
                              background: active ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)',
                              cursor: 'pointer', transition: 'all 0.15s',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: active ? '#34d399' : '#fff' }}>{t.name}</span>
                                {t.tags.slice(0, 2).map(tag => (
                                  <span key={tag} style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <Tag size={9} />{tag}
                                  </span>
                                ))}
                              </div>
                              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.body}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Detected placeholders */}
                  {selectedTemplate && detectedVars.length > 0 && (
                    <div style={{ padding: '12px 14px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Info size={12} color="#818cf8" />
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Placeholders detected
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {detectedVars.map(v => (
                          <span key={v} style={{
                            fontSize: 11, padding: '3px 8px', borderRadius: 5, fontFamily: 'monospace',
                            background: CONTACT_AUTO_VARS.has(v) ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                            color: CONTACT_AUTO_VARS.has(v) ? '#34d399' : '#fbbf24',
                            border: `1px solid ${CONTACT_AUTO_VARS.has(v) ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`,
                          }}>
                            {`{{${v}}}`}
                            <span style={{ opacity: 0.6, marginLeft: 4, fontFamily: 'sans-serif', fontSize: 10 }}>
                              {CONTACT_AUTO_VARS.has(v) ? '✓ auto' : '⚠ manual'}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Extra vars for unknowns */}
                  {unknownVars.length > 0 && (
                    <div>
                      <span className="chrome-label">Custom Variables</span>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 8, lineHeight: 1.5 }}>
                        These placeholders aren't contact fields — enter a value that will be the same for all recipients.
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {unknownVars.map(v => (
                          <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#fbbf24', minWidth: 90, flexShrink: 0 }}>{`{{${v}}}`}</span>
                            <input
                              type="text"
                              value={extraVars[v] ?? ''}
                              onChange={e => setExtraVars(prev => ({ ...prev, [v]: e.target.value }))}
                              placeholder={`Value for {{${v}}}`}
                              className="input-glass"
                              style={{ fontSize: 13, flex: 1 }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── WhatsApp template mode ──────────────────────────── */}
              {msgType === 'template' && (
                <>
                  <div>
                    <span className="chrome-label">Recipients</span>
                    <div style={{ display: 'flex', gap: 6, marginBottom: mode === 'single' ? 10 : 0 }}>
                      {(['single', 'group'] as RecipientMode[]).map(m => (
                        <button key={m} onClick={() => setMode(m)} style={{
                          flex: 1, padding: '8px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', transition: 'all 0.2s',
                          border: mode === m ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.06)',
                          background: mode === m ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                          color: mode === m ? '#fff' : 'rgba(255,255,255,0.3)',
                        }}>
                          {m === 'single' ? 'Single' : `Group (${selectedIds.size > 0 ? selectedIds.size + ' selected' : 'pick contacts'})`}
                        </button>
                      ))}
                    </div>
                    {mode === 'single' && (
                      <input type="text" value={singleRecipient} onChange={e => setSingleRecipient(e.target.value)}
                        placeholder={CHANNEL_META[channel].placeholder} className="input-glass" />
                    )}
                  </div>
                  <div>
                    <span className="chrome-label">Template Name</span>
                    <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)}
                      placeholder="e.g. 3p_direct_integration_test_template" className="input-glass" />
                  </div>
                  <div>
                    <span className="chrome-label">Language</span>
                    <div style={{ position: 'relative' }}>
                      <ChevronDown size={12} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                      <select value={langCode} onChange={e => setLangCode(e.target.value)} className="select-glass" style={{ paddingRight: 30 }}>
                        {LANG_CODES.map(lc => <option key={lc} value={lc}>{lc}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className="chrome-label" style={{ margin: 0 }}>Template Variables</span>
                      <button onClick={addTemplateVar} style={{
                        display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600,
                        color: '#818cf8', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                        borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                      }}>
                        <Plus size={11} /> Add Variable
                      </button>
                    </div>
                    {templateVars.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', padding: '8px 0' }}>
                        No variables — add if your template has dynamic fields like {'{{1}}'} or {'{{name}}'}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {templateVars.map((v, i) => (
                          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input type="text" value={v.key} onChange={e => updateTemplateVar(i, 'key', e.target.value)}
                              placeholder="key (e.g. 1 or name)" className="input-glass" style={{ flex: 1 }} />
                            <input type="text" value={v.value} onChange={e => updateTemplateVar(i, 'value', e.target.value)}
                              placeholder="value" className="input-glass" style={{ flex: 2 }} />
                            <button onClick={() => removeTemplateVar(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', padding: 4, display: 'flex' }}
                              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── Free text mode ──────────────────────────────────── */}
              {msgType === 'text' && (
                <>
                  <div>
                    <span className="chrome-label">Recipients</span>
                    <div style={{ display: 'flex', gap: 6, marginBottom: mode === 'single' ? 10 : 0 }}>
                      {(['single', 'group'] as RecipientMode[]).map(m => (
                        <button key={m} onClick={() => setMode(m)} style={{
                          flex: 1, padding: '8px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', transition: 'all 0.2s',
                          border: mode === m ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.06)',
                          background: mode === m ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                          color: mode === m ? '#fff' : 'rgba(255,255,255,0.3)',
                        }}>
                          {m === 'single' ? 'Single' : `Group (${selectedIds.size > 0 ? selectedIds.size + ' selected' : 'pick contacts'})`}
                        </button>
                      ))}
                    </div>
                    {mode === 'single' && (
                      <input type="text" value={singleRecipient} onChange={e => setSingleRecipient(e.target.value)}
                        placeholder={CHANNEL_META[channel].placeholder} className="input-glass" />
                    )}
                  </div>
                  {channel === 'email' && (
                    <div>
                      <span className="chrome-label">Subject</span>
                      <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject…" className="input-glass" />
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <span className="chrome-label">Message</span>
                    <textarea value={body} onChange={e => setBody(e.target.value)}
                      placeholder="Type your message here…" className="input-glass"
                      style={{ resize: 'vertical', minHeight: 120, lineHeight: 1.6 }} />
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'right', marginTop: 4 }}>{body.length} chars</div>
                  </div>
                </>
              )}

              {/* Send button */}
              <button className="btn-chrome" onClick={handleSend} disabled={isSending}
                style={{ padding: '13px', borderRadius: 10, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {isSending ? <Loader2 size={15} className="animate-spin-slow" /> : <Send size={15} />}
                {isSending ? 'Sending…'
                  : msgType === 'library' ? `Send personalised to ${selectedIds.size || '…'} contacts`
                  : mode === 'single' ? 'Send Message'
                  : `Send to ${selectedIds.size || '…'} contacts`}
              </button>
            </div>

            {/* ── Right column ─────────────────────────────────────── */}
            <div className="glass" style={{ borderRadius: 16, padding: 28, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 500 }}>

              {/* Library mode: contact picker + preview */}
              {msgType === 'library' && (
                <>
                  {/* Contact picker */}
                  <div style={{ flex: '0 0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                        Recipients
                        {selectedIds.size > 0 && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: '#34d399', background: 'rgba(16,185,129,0.12)', padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(16,185,129,0.25)' }}>
                            {selectedIds.size} selected
                          </span>
                        )}
                      </div>
                      <button onClick={toggleAll} style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {selectedIds.size === filteredContacts.length && filteredContacts.length > 0
                          ? <><CheckSquare size={13} /> Deselect all</>
                          : <><Square size={13} /> Select all</>}
                      </button>
                    </div>
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <Search size={13} color="rgba(255,255,255,0.2)" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }} />
                      <input type="text" placeholder="Search contacts…" value={contactSearch} onChange={e => setContactSearch(e.target.value)} className="input-glass" style={{ paddingLeft: 36 }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                      {filteredContacts.length === 0 ? (
                        <div style={{ padding: 20, textAlign: 'center' }}>
                          <AlertCircle size={18} color="rgba(255,255,255,0.15)" style={{ margin: '0 auto 6px' }} />
                          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, margin: 0 }}>No contacts with {CHANNEL_META[channel].label}.</p>
                        </div>
                      ) : (
                        filteredContacts.map(c => {
                          const selected = selectedIds.has(c.id);
                          const addr = c[CHANNEL_META[channel].field] as string | undefined;
                          return (
                            <button key={c.id} onClick={() => toggleContact(c.id)} style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                              borderRadius: 9, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                              border: selected ? '1px solid rgba(16,185,129,0.3)' : '1px solid transparent',
                              background: selected ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.02)',
                            }}>
                              <div style={{ color: selected ? '#34d399' : 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
                                {selected ? <CheckSquare size={15} /> : <Square size={15} />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addr}</div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Preview panel */}
                  <div style={{ flex: 1, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <Eye size={13} color="rgba(255,255,255,0.4)" />
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Preview {previewContact ? `· ${previewContact.name}` : '(select a contact)'}
                      </span>
                    </div>
                    {!selectedTemplate ? (
                      <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13, fontStyle: 'italic' }}>Select a template to preview the personalised message.</div>
                    ) : (
                      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '14px 16px' }}>
                        {selectedTemplate.subject && (
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 8, fontWeight: 600 }}>
                            Subject: <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                              {previewContact ? resolveBody(selectedTemplate.subject, previewContact, extraVars) : selectedTemplate.subject}
                            </span>
                          </div>
                        )}
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                          {previewContact
                            ? previewBody
                            : highlightVars(selectedTemplate.body)
                          }
                        </div>
                        {!previewContact && (
                          <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Info size={11} /> Select a contact above to see their personalised version.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Group mode (text / WA template) */}
              {showContactPicker && msgType !== 'library' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                      Select Contacts
                      {selectedIds.size > 0 && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: '#818cf8', background: 'rgba(99,102,241,0.15)', padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(99,102,241,0.25)' }}>
                          {selectedIds.size} selected
                        </span>
                      )}
                    </div>
                    <button onClick={toggleAll} style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      {selectedIds.size === filteredContacts.length && filteredContacts.length > 0
                        ? <><CheckSquare size={13} /> Deselect all</>
                        : <><Square size={13} /> Select all</>}
                    </button>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} color="rgba(255,255,255,0.2)" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }} />
                    <input type="text" placeholder="Search contacts…" value={contactSearch} onChange={e => setContactSearch(e.target.value)} className="input-glass" style={{ paddingLeft: 36 }} />
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360 }}>
                    {filteredContacts.length === 0 ? (
                      <div style={{ padding: 24, textAlign: 'center' }}>
                        <AlertCircle size={20} color="rgba(255,255,255,0.15)" style={{ margin: '0 auto 8px' }} />
                        <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, margin: 0 }}>No contacts with {CHANNEL_META[channel].label} available.</p>
                      </div>
                    ) : (
                      filteredContacts.map(c => {
                        const selected = selectedIds.has(c.id);
                        const addr = c[CHANNEL_META[channel].field] as string | undefined;
                        return (
                          <button key={c.id} onClick={() => toggleContact(c.id)} style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                            borderRadius: 10, border: selected ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                            background: selected ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
                            cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                          }}>
                            <div style={{ width: 18, flexShrink: 0, color: selected ? '#818cf8' : 'rgba(255,255,255,0.2)' }}>
                              {selected ? <CheckSquare size={16} /> : <Square size={16} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addr}</div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}

              {/* Single mode (text / WA template) — hint panel */}
              {!showContactPicker && (
                msgType === 'template' && templateName ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Preview</div>
                    <div style={{ padding: 16, background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.15)', borderRadius: 12 }}>
                      <div style={{ fontSize: 11, color: 'rgba(37,211,102,0.6)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>WhatsApp Template</div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
                        <span style={{ color: 'rgba(255,255,255,0.4)' }}>Name: </span>
                        <span style={{ fontFamily: 'monospace', color: '#c084fc' }}>{templateName}</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
                        <span style={{ color: 'rgba(255,255,255,0.4)' }}>Language: </span>{langCode}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', lineHeight: 1.5 }}>
                      To: {singleRecipient || <span style={{ color: 'rgba(255,255,255,0.15)' }}>enter recipient on the left</span>}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 14, opacity: 0.5 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MessageCircle size={22} color="rgba(255,255,255,0.3)" />
                    </div>
                    <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', margin: 0 }}>
                      Enter a recipient on the left to send a single message.
                    </p>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* ── History ─────────────────────────────────────────────── */}
        {tab === 'history' && (
          <div className="animate-slide-up">
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <div style={{ position: 'relative' }}>
                <ChevronDown size={12} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <select value={historyChannel} onChange={e => { setHistoryChannel(e.target.value); setHistoryPage(1); }} className="select-glass" style={{ paddingRight: 30, width: 'auto', minWidth: 150 }}>
                  <option value="">All Channels</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                </select>
              </div>
            </div>

            <div className="glass" style={{ overflow: 'hidden', borderRadius: 16 }}>
              {historyLoading ? (
                <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton" style={{ height: 18, width: `${50 + i * 7}%` }} />)}
                </div>
              ) : !historyData?.data?.length ? (
                <div style={{ padding: '56px 24px', textAlign: 'center' }}>
                  <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                    <History size={22} color="rgba(255,255,255,0.2)" />
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, margin: 0 }}>No messages sent yet.</p>
                </div>
              ) : (
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th>Recipient</th>
                      <th>Message / Template</th>
                      <th>Status</th>
                      <th>Sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyData.data.map(msg => (
                      <tr key={msg.id}>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.04)', padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
                            {msg.channel}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{msg.recipient_id}</td>
                        <td style={{ maxWidth: 300 }}>
                          {msg.template_name ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                              <FileText size={12} color="#c084fc" />
                              <span style={{ color: '#c084fc', fontFamily: 'monospace' }}>{msg.template_name}</span>
                            </span>
                          ) : (
                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                              {msg.subject ? `[${msg.subject}] ` : ''}{msg.body ?? '—'}
                            </span>
                          )}
                        </td>
                        <td>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: STATUS_COLORS[msg.status] ?? 'rgba(255,255,255,0.4)' }}>
                            <span className="status-dot" style={{ background: STATUS_COLORS[msg.status] ?? 'rgba(255,255,255,0.2)' }} />
                            {msg.status}
                          </span>
                          {msg.error_message && (
                            <div style={{ fontSize: 11, color: '#f87171', marginTop: 3, maxWidth: 200, wordBreak: 'break-word' }}>
                              {msg.error_message}
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
                          {new Date(msg.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {historyData && historyData.totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                {Array.from({ length: historyData.totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setHistoryPage(p)} style={{
                    width: 34, height: 34, borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: p === historyPage ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.07)',
                    background: p === historyPage ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                    color: p === historyPage ? '#818cf8' : 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                  }}>{p}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
