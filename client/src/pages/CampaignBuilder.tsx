import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, UnderlineIcon, Heading1, Heading2, List, ListOrdered,
  Link2, Image as ImageIcon, AlignLeft, AlignCenter, AlignRight,
  Eye, EyeOff, Send, Calendar, ChevronDown, ArrowLeft, Loader2, Palette,
  MessageCircle, Mail, RefreshCw,
} from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';
import { useBusinessAccount } from '../contexts/BusinessAccountContext';

interface Segment { id: string; name: string; }
interface SegmentsResponse { data: Segment[]; }
interface ImportedSegment { id: string; name: string; source_app: string | null; total_members: number; custom_field_mappings: Record<string, string>; }
interface ImportedSegmentsResponse { data: ImportedSegment[]; }

// Audience selection — either a standard segment, imported segment, or all contacts
type AudienceType = 'all' | 'segment' | 'imported';
interface AudienceSelection { type: AudienceType; id: string; }

interface WaAccount { id: string; name: string; waba_id: string; phone_number_id: string; is_active: boolean; }
interface CloudTemplate {
  id: string; name: string; language: string; category: string; status: string;
  components: TemplateComponent[]; waba_id: string | null; account_id: string | null;
  waba_name: string | null;
}
interface TemplateComponent {
  type: string;
  text?: string;
  format?: string;
  parameters?: unknown[];
  buttons?: { type: string; text: string }[];
}

const COLORS = ['#ffffff', '#e2e8f0', '#94a3b8', '#6366f1', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#ec4899'];

const CONTACT_FIELDS = [
  { value: '{{name}}', label: 'Full Name' },
  { value: '{{first_name}}', label: 'First Name' },
  { value: '{{phone}}', label: 'Phone Number' },
  { value: '{{email}}', label: 'Email' },
];

function ToolbarBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)',
        color: active ? '#818cf8' : 'rgba(255,255,255,0.6)',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />;
}

// Extract positional placeholders {{1}}, {{2}} from template component text
function extractPlaceholders(components: TemplateComponent[]): number[] {
  const nums = new Set<number>();
  for (const comp of components) {
    const text = comp.text ?? '';
    const matches = text.matchAll(/\{\{(\d+)\}\}/g);
    for (const m of matches) nums.add(Number(m[1]));
  }
  return [...nums].sort((a, b) => a - b);
}

function getBodyText(components: TemplateComponent[]): string {
  return components.find(c => c.type === 'BODY')?.text ?? '';
}

// ─── WhatsApp builder panel ────────────────────────────────────────────────────

function WhatsAppBuilder({
  accounts, audience, setAudience, segments, importedSegments, scheduledAt, setScheduledAt,
  onSend, isPending, initialAccountId, initialTemplateId,
}: {
  accounts: WaAccount[];
  audience: AudienceSelection; setAudience: (v: AudienceSelection) => void;
  segments: Segment[];
  importedSegments: ImportedSegment[];
  scheduledAt: string; setScheduledAt: (v: string) => void;
  onSend: (payload: object) => void;
  isPending: boolean;
  initialAccountId?: string;
  initialTemplateId?: string;
}) {
  const { selectedId: globalAccountId } = useBusinessAccount();
  const [accountId, setAccountId] = useState(initialAccountId ?? globalAccountId ?? accounts[0]?.id ?? '');
  const [templateId, setTemplateId] = useState(initialTemplateId ?? '');
  const [varMap, setVarMap] = useState<Record<string, string>>({});

  // Fetch custom field aliases from selected imported segment
  const selectedImportedSeg = audience.type === 'imported'
    ? importedSegments.find(s => s.id === audience.id)
    : null;
  const customFields = selectedImportedSeg
    ? Object.keys(selectedImportedSeg.custom_field_mappings).map(alias => ({ value: `{{${alias}}}`, label: alias }))
    : [];
  const allContactFields = [...CONTACT_FIELDS, ...customFields];

  const { data: templatesData, isFetching: loadingTemplates, refetch } = useQuery({
    queryKey: ['wa-cloud-templates-builder', accountId],
    queryFn: () => api.get('/whatsapp-cloud/templates', { params: { status: 'APPROVED' } }).then(r => r.data.data as CloudTemplate[]),
    enabled: true,
  });

  const selectedAccount = accounts.find(a => a.id === accountId);
  const allTemplates = templatesData ?? [];
  const filteredTemplates = accountId
    ? allTemplates.filter(t => t.account_id === accountId)
    : allTemplates;

  const selectedTemplate = filteredTemplates.find(t => t.id === templateId) ?? null;
  const placeholders = selectedTemplate ? extractPlaceholders(selectedTemplate.components) : [];
  const bodyText = selectedTemplate ? getBodyText(selectedTemplate.components) : '';
  const previewText = selectedTemplate ? bodyText.replace(/\{\{(\d+)\}\}/g, (_, n: string) => {
    const val = varMap[n];
    if (!val) return `{{${n}}}`;
    const field = allContactFields.find(f => f.value === val);
    return field ? `[${field.label}]` : val;
  }) : '';
  const headerComp = selectedTemplate?.components.find(c => c.type === 'HEADER');
  const footerComp = selectedTemplate?.components.find(c => c.type === 'FOOTER');
  const buttons = selectedTemplate?.components.find(c => c.type === 'BUTTONS')?.buttons ?? [];

  const handleTemplateChange = (id: string) => {
    setTemplateId(id);
    setVarMap({});
  };

  const handleSend = () => {
    if (!selectedTemplate) return;
    const template_vars: Record<string, string> = { ...varMap };
    const audienceField = audience.type === 'segment'
      ? { segment_id: audience.id }
      : audience.type === 'imported'
        ? { imported_segment_id: audience.id }
        : {};
    onSend({
      channel: 'whatsapp',
      template_name: selectedTemplate.name,
      template_vars,
      metadata: {
        wa_language: selectedTemplate.language,
        wa_account_id: accountId || null,
      },
      ...audienceField,
    });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20 }}>
      {/* Left settings */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="glass animate-fade-in-up stagger-1" style={{ borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>WhatsApp Settings</div>

          {/* Account */}
          <div>
            <span className="chrome-label">Send from Account</span>
            <div style={{ position: 'relative' }}>
              <ChevronDown size={12} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <select value={accountId} onChange={e => { setAccountId(e.target.value); setTemplateId(''); setVarMap({}); }} className="select-glass" style={{ paddingRight: 30 }}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>

          {/* Template */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="chrome-label" style={{ marginBottom: 0 }}>Template</span>
              <button onClick={() => refetch()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                <RefreshCw size={10} className={loadingTemplates ? 'animate-spin-slow' : ''} /> Refresh
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <ChevronDown size={12} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <select value={templateId} onChange={e => handleTemplateChange(e.target.value)} className="select-glass" style={{ paddingRight: 30 }}>
                <option value="">Select approved template…</option>
                {filteredTemplates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.language})</option>)}
              </select>
            </div>
            {filteredTemplates.length === 0 && !loadingTemplates && (
              <div style={{ fontSize: 11, color: 'rgba(255,165,0,0.7)', marginTop: 6 }}>
                No approved templates for this account. Sync in the WhatsApp page.
              </div>
            )}
          </div>

          {/* Variable mapping */}
          {placeholders.length > 0 && (
            <div>
              <span className="chrome-label">Map Template Variables</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {placeholders.map(n => (
                  <div key={n}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>{'{{' + n + '}}'}</div>
                    <div style={{ position: 'relative' }}>
                      <ChevronDown size={12} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                      <select
                        value={varMap[String(n)] ?? ''}
                        onChange={e => setVarMap(v => ({ ...v, [String(n)]: e.target.value }))}
                        className="select-glass"
                        style={{ paddingRight: 30 }}
                      >
                        <option value="">— select field —</option>
                        {CONTACT_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        {customFields.length > 0 && <option disabled>─── Segment Fields ───</option>}
                        {customFields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        <option value="__custom__" disabled>─── or type literal below ───</option>
                      </select>
                    </div>
                    {/* Allow literal override */}
                    {varMap[String(n)] === undefined || !allContactFields.some(f => f.value === varMap[String(n)]) ? (
                      <input
                        value={varMap[String(n)] ?? ''}
                        onChange={e => setVarMap(v => ({ ...v, [String(n)]: e.target.value }))}
                        placeholder="or type a literal value…"
                        className="input-glass"
                        style={{ marginTop: 4, fontSize: 12 }}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audience */}
          <div>
            <span className="chrome-label">Audience</span>
            <div style={{ position: 'relative' }}>
              <ChevronDown size={12} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <select
                value={audience.type === 'all' ? '' : `${audience.type}:${audience.id}`}
                onChange={e => {
                  const v = e.target.value;
                  if (!v) setAudience({ type: 'all', id: '' });
                  else {
                    const [type, id] = v.split(':');
                    setAudience({ type: type as AudienceType, id });
                  }
                }}
                className="select-glass"
                style={{ paddingRight: 30 }}
              >
                <option value="">All Contacts</option>
                {segments.length > 0 && <option disabled>─── Audience Segments ───</option>}
                {segments.map(s => <option key={s.id} value={`segment:${s.id}`}>{s.name}</option>)}
                {importedSegments.length > 0 && <option disabled>─── Imported Segments ───</option>}
                {importedSegments.map(s => <option key={s.id} value={`imported:${s.id}`}>{s.name}{s.source_app ? ` (${s.source_app})` : ''} · {s.total_members} members</option>)}
              </select>
            </div>
            {selectedImportedSeg && customFields.length > 0 && (
              <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)', fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                Custom fields available: {customFields.map(f => <span key={f.value} style={{ color: '#818cf8', marginRight: 4 }}>{f.value}</span>)}
              </div>
            )}
          </div>
        </div>

        {/* Schedule */}
        <div className="glass animate-fade-in-up stagger-2" style={{ borderRadius: 16, padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Calendar size={14} color="#818cf8" />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Schedule</span>
          </div>
          <span className="chrome-label">Send Date & Time</span>
          <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="input-glass" style={{ colorScheme: 'dark' }} />
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>Leave blank to send immediately</div>
        </div>

        {/* Send button */}
        <button
          className="btn-chrome"
          onClick={handleSend}
          disabled={isPending || !selectedTemplate}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '12px 20px', borderRadius: 9, fontSize: 13 }}
        >
          {isPending ? <Loader2 size={14} className="animate-spin-slow" /> : <Send size={14} />}
          {scheduledAt ? 'Schedule Campaign' : 'Send Now'}
        </button>
      </div>

      {/* Right: template preview */}
      <div className="glass animate-fade-in-up" style={{ borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageCircle size={13} /> Template Preview
        </div>
        <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          {!selectedTemplate ? (
            <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14, textAlign: 'center', marginTop: 60 }}>
              Select a template to preview
            </div>
          ) : (
            <div style={{ maxWidth: 360, margin: '0 auto' }}>
              {/* WhatsApp message bubble */}
              <div style={{ background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.15)', borderRadius: 12, overflow: 'hidden' }}>
                {headerComp && (
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                    {headerComp.format === 'IMAGE' ? '🖼 Image Header' :
                     headerComp.format === 'VIDEO' ? '🎬 Video Header' :
                     headerComp.format === 'DOCUMENT' ? '📄 Document Header' :
                     headerComp.text ?? ''}
                  </div>
                )}
                <div style={{ padding: '12px 16px', fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {previewText || bodyText}
                </div>
                {footerComp?.text && (
                  <div style={{ padding: '8px 16px', fontSize: 11, color: 'rgba(255,255,255,0.35)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {footerComp.text}
                  </div>
                )}
                {buttons.length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {buttons.map((btn, i) => (
                      <div key={i} style={{ padding: '10px 16px', fontSize: 13, color: '#25d366', textAlign: 'center', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : undefined }}>
                        {btn.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Meta info */}
              <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
                  {selectedTemplate.language}
                </span>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
                  {selectedTemplate.category}
                </span>
                {selectedAccount && (
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(37,211,102,0.1)', color: 'rgba(37,211,102,0.7)' }}>
                    {selectedAccount.name}
                  </span>
                )}
              </div>

              {placeholders.length > 0 && (
                <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#818cf8', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Variable Mapping</div>
                  {placeholders.map(n => {
                    const val = varMap[String(n)];
                    const field = allContactFields.find(f => f.value === val);
                    return (
                      <div key={n} style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 3 }}>
                        <span style={{ color: '#818cf8' }}>{'{{' + n + '}}'}</span>
                        {' → '}
                        {field ? field.label : (val ? `"${val}"` : <span style={{ color: 'rgba(255,100,100,0.7)' }}>not mapped</span>)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface BuilderLocationState {
  channel?: 'email' | 'whatsapp';
  templateId?: string;
  accountId?: string;
}

export default function CampaignBuilder() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state ?? {}) as BuilderLocationState;
  const { toasts, addToast, dismissToast } = useToast();

  // Channel state — pre-select from navigation state when coming from Templates tab
  const [channel, setChannel] = useState<'email' | 'whatsapp'>(locationState.channel ?? 'email');

  // Shared form state
  const [name, setName] = useState('');
  const [audience, setAudience] = useState<AudienceSelection>({ type: 'all', id: '' });
  const [scheduledAt, setScheduledAt] = useState('');

  // Email-only state
  const [subject, setSubject] = useState('');
  const [fromName, setFromName] = useState('AirPay Global');
  const [showPreview, setShowPreview] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);

  const { data: segmentsData } = useQuery<SegmentsResponse>({
    queryKey: ['segments'],
    queryFn: () => api.get('/segments').then(r => r.data),
  });
  const segments = segmentsData?.data ?? [];

  const { data: importedSegmentsData } = useQuery<ImportedSegmentsResponse>({
    queryKey: ['imported-segments'],
    queryFn: () => api.get('/imported-segments').then(r => r.data),
  });
  const importedSegments = importedSegmentsData?.data ?? [];

  const { data: waAccountsData } = useQuery({
    queryKey: ['wa-cloud-accounts'],
    queryFn: () => api.get('/whatsapp-cloud/accounts').then(r => (r.data.data as WaAccount[]).filter(a => a.is_active)),
  });
  const waAccounts = waAccountsData ?? [];

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false, HTMLAttributes: { style: 'color:#818cf8;text-decoration:underline;' } }),
      Image.configure({ HTMLAttributes: { style: 'max-width:100%;border-radius:8px;' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Start writing your email here…' }),
    ],
    editorProps: {
      attributes: {
        style: 'min-height:320px;outline:none;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.85);',
      },
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: object) => api.post('/campaigns', payload),
    onSuccess: (res) => {
      const id = res.data.id as string;
      const channelLabel = channel === 'whatsapp' ? 'WhatsApp messages' : 'emails';
      if (!scheduledAt) {
        api.post(`/campaigns/${id}/launch`)
          .then(r => {
            addToast('success', `Campaign sent — ${(r.data as { enqueued: number }).enqueued} ${channelLabel} enqueued.`);
            setTimeout(() => navigate('/campaigns'), 1500);
          })
          .catch(() => {
            addToast('success', 'Campaign created. Go to Campaigns to launch it.');
            setTimeout(() => navigate('/campaigns'), 1500);
          });
      } else {
        addToast('success', 'Campaign scheduled successfully.');
        setTimeout(() => navigate('/campaigns'), 1500);
      }
    },
    onError: (err: unknown) =>
      addToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create campaign.'),
  });

  const handleEmailSend = () => {
    if (!name.trim()) { addToast('error', 'Campaign name is required.'); return; }
    if (!subject.trim()) { addToast('error', 'Subject line is required.'); return; }
    const html = editor?.getHTML() ?? '';
    if (!html || html === '<p></p>') { addToast('error', 'Email body cannot be empty.'); return; }

    const audienceField = audience.type === 'segment' ? { segment_id: audience.id } : {};
    createMutation.mutate({
      name,
      channel: 'email',
      subject,
      from_name: fromName,
      message_body: wrapInEmailTemplate(subject, fromName, html),
      ...audienceField,
      ...(scheduledAt ? { scheduled_at: new Date(scheduledAt).toISOString() } : {}),
    });
  };

  const handleWhatsAppSend = (waPayload: object) => {
    if (!name.trim()) { addToast('error', 'Campaign name is required.'); return; }
    createMutation.mutate({
      name,
      ...waPayload,
      ...(scheduledAt ? { scheduled_at: new Date(scheduledAt).toISOString() } : {}),
    });
  };

  const insertLink = useCallback(() => {
    if (!linkUrl) return;
    editor?.chain().focus().setLink({ href: linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}` }).run();
    setLinkUrl('');
    setShowLinkModal(false);
  }, [editor, linkUrl]);

  const insertImage = useCallback(() => {
    if (!imageUrl) return;
    editor?.chain().focus().setImage({ src: imageUrl }).run();
    setImageUrl('');
    setShowImageModal(false);
  }, [editor, imageUrl]);

  const previewHtml = showPreview ? wrapInEmailTemplate(subject, fromName, editor?.getHTML() ?? '') : '';

  return (
    <div style={{ minHeight: '100vh', background: '#06060f', position: 'relative' }}>
      <div className="aurora-bg" />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '28px 32px' }}>

        {/* Header */}
        <div className="animate-fade-in-up" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => navigate('/campaigns')} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9, padding: '7px 12px', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <ArrowLeft size={14} /> Back
            </button>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>Campaign Builder</h1>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>Create and send campaigns across channels</p>
            </div>
          </div>
          {channel === 'email' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowPreview(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, background: showPreview ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${showPreview ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)'}`, color: showPreview ? '#818cf8' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                {showPreview ? 'Hide Preview' : 'Preview'}
              </button>
              <button className="btn-chrome" onClick={handleEmailSend} disabled={createMutation.isPending} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 9, fontSize: 13 }}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin-slow" /> : <Send size={14} />}
                {scheduledAt ? 'Schedule' : 'Send Now'}
              </button>
            </div>
          )}
        </div>

        {/* Campaign name (shared) */}
        <div className="glass animate-fade-in-up" style={{ borderRadius: 16, padding: '16px 22px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <span className="chrome-label">Campaign Name</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. June Newsletter" className="input-glass" />
          </div>

          {/* Channel selector */}
          <div style={{ flexShrink: 0 }}>
            <span className="chrome-label">Channel</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setChannel('email')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s', background: channel === 'email' ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${channel === 'email' ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`, color: channel === 'email' ? '#818cf8' : 'rgba(255,255,255,0.4)' }}
              >
                <Mail size={13} /> Email
              </button>
              <button
                onClick={() => setChannel('whatsapp')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s', background: channel === 'whatsapp' ? 'rgba(37,211,102,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${channel === 'whatsapp' ? 'rgba(37,211,102,0.35)' : 'rgba(255,255,255,0.08)'}`, color: channel === 'whatsapp' ? '#25d366' : 'rgba(255,255,255,0.4)' }}
              >
                <MessageCircle size={13} /> WhatsApp
              </button>
            </div>
          </div>
        </div>

        {/* Channel-specific builder */}
        {channel === 'whatsapp' ? (
          waAccounts.length === 0 ? (
            <div className="glass" style={{ borderRadius: 16, padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
              <MessageCircle size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No WhatsApp accounts configured</div>
              <div style={{ fontSize: 13 }}>Go to the WhatsApp page and add an account under Configuration, then sync templates.</div>
            </div>
          ) : (
            <WhatsAppBuilder
              accounts={waAccounts}
              audience={audience} setAudience={setAudience}
              segments={segments}
              importedSegments={importedSegments}
              scheduledAt={scheduledAt} setScheduledAt={setScheduledAt}
              onSend={handleWhatsAppSend}
              isPending={createMutation.isPending}
              initialAccountId={locationState.accountId}
              initialTemplateId={locationState.templateId}
            />
          )
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: showPreview ? '1fr 1fr' : '360px 1fr', gap: 20 }}>
            {/* Left: email settings panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="glass animate-fade-in-up stagger-1" style={{ borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>Email Settings</div>
                <div>
                  <span className="chrome-label">Subject Line</span>
                  <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Compelling subject line…" className="input-glass" />
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>{subject.length}/90 chars · Keep under 50 for best results</div>
                </div>
                <div>
                  <span className="chrome-label">From Name</span>
                  <input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="AirPay Global" className="input-glass" />
                </div>
                <div>
                  <span className="chrome-label">Audience</span>
                  <div style={{ position: 'relative' }}>
                    <ChevronDown size={12} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    <select
                      value={audience.type === 'all' ? '' : `${audience.type}:${audience.id}`}
                      onChange={e => {
                        const v = e.target.value;
                        if (!v) setAudience({ type: 'all', id: '' });
                        else { const [type, id] = v.split(':'); setAudience({ type: type as AudienceType, id }); }
                      }}
                      className="select-glass"
                      style={{ paddingRight: 30 }}
                    >
                      <option value="">All Contacts</option>
                      {segments.length > 0 && <option disabled>─── Audience Segments ───</option>}
                      {segments.map(s => <option key={s.id} value={`segment:${s.id}`}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="glass animate-fade-in-up stagger-2" style={{ borderRadius: 16, padding: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <Calendar size={14} color="#818cf8" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Schedule</span>
                </div>
                <span className="chrome-label">Send Date & Time</span>
                <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="input-glass" style={{ colorScheme: 'dark' }} />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>
                  Leave blank to send immediately when you click Send Now
                </div>
              </div>

              <div className="glass animate-fade-in-up stagger-3" style={{ borderRadius: 16, padding: 22, background: 'rgba(99,102,241,0.06)', borderColor: 'rgba(99,102,241,0.15)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#818cf8', marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Tips</div>
                {['Keep subject lines under 50 characters', 'Add a clear call-to-action button', 'Include an unsubscribe link in footer', 'Optimise images — keep under 1MB', 'Test your email before sending'].map(tip => (
                  <div key={tip} style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 6, paddingLeft: 12, borderLeft: '2px solid rgba(99,102,241,0.3)', lineHeight: 1.4 }}>{tip}</div>
                ))}
              </div>
            </div>

            {/* Right: editor or preview */}
            {showPreview ? (
              <div className="glass animate-fade-in-up" style={{ borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Eye size={13} /> Email Preview
                </div>
                <div style={{ flex: 1, background: '#f3f4f6', overflowY: 'auto' }}>
                  <iframe srcDoc={previewHtml} style={{ width: '100%', height: '600px', border: 'none' }} title="Email Preview" />
                </div>
              </div>
            ) : (
              <div className="glass animate-fade-in-up" style={{ borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* Toolbar */}
                <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', background: 'rgba(255,255,255,0.02)' }}>
                  <ToolbarBtn active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold"><Bold size={13} /></ToolbarBtn>
                  <ToolbarBtn active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic"><Italic size={13} /></ToolbarBtn>
                  <ToolbarBtn active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()} title="Underline"><UnderlineIcon size={13} /></ToolbarBtn>
                  <ToolbarDivider />
                  <ToolbarBtn active={editor?.isActive('heading', { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1"><Heading1 size={13} /></ToolbarBtn>
                  <ToolbarBtn active={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2"><Heading2 size={13} /></ToolbarBtn>
                  <ToolbarDivider />
                  <ToolbarBtn active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet List"><List size={13} /></ToolbarBtn>
                  <ToolbarBtn active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered List"><ListOrdered size={13} /></ToolbarBtn>
                  <ToolbarDivider />
                  <ToolbarBtn active={editor?.isActive({ textAlign: 'left' })} onClick={() => editor?.chain().focus().setTextAlign('left').run()} title="Align Left"><AlignLeft size={13} /></ToolbarBtn>
                  <ToolbarBtn active={editor?.isActive({ textAlign: 'center' })} onClick={() => editor?.chain().focus().setTextAlign('center').run()} title="Align Center"><AlignCenter size={13} /></ToolbarBtn>
                  <ToolbarBtn active={editor?.isActive({ textAlign: 'right' })} onClick={() => editor?.chain().focus().setTextAlign('right').run()} title="Align Right"><AlignRight size={13} /></ToolbarBtn>
                  <ToolbarDivider />
                  <ToolbarBtn active={editor?.isActive('link')} onClick={() => setShowLinkModal(true)} title="Insert Link"><Link2 size={13} /></ToolbarBtn>
                  <ToolbarBtn onClick={() => setShowImageModal(true)} title="Insert Image"><ImageIcon size={13} /></ToolbarBtn>
                  <ToolbarDivider />
                  <div style={{ position: 'relative' }}>
                    <ToolbarBtn onClick={() => setShowColorPicker(p => !p)} title="Text Colour"><Palette size={13} /></ToolbarBtn>
                    {showColorPicker && (
                      <div style={{ position: 'absolute', top: 36, left: 0, zIndex: 10, background: 'var(--color-modal-bg)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 10, display: 'flex', gap: 6, flexWrap: 'wrap', width: 148, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                        {COLORS.map(c => (
                          <button key={c} type="button" onClick={() => { editor?.chain().focus().setColor(c).run(); setShowColorPicker(false); }} style={{ width: 22, height: 22, borderRadius: 5, background: c, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }} />
                        ))}
                        <button type="button" onClick={() => { editor?.chain().focus().unsetColor().run(); setShowColorPicker(false); }} style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '2px 6px', cursor: 'pointer', width: '100%' }}>Reset</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Editor area */}
                <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto', minHeight: 400 }}>
                  <style>{`
                    .tiptap p { margin: 0 0 12px; }
                    .tiptap h1 { font-size: 28px; font-weight: 800; color: #fff; margin: 0 0 12px; letter-spacing: -0.03em; }
                    .tiptap h2 { font-size: 20px; font-weight: 700; color: #fff; margin: 0 0 10px; letter-spacing: -0.02em; }
                    .tiptap ul, .tiptap ol { padding-left: 20px; margin: 0 0 12px; color: rgba(255,255,255,0.8); }
                    .tiptap li { margin-bottom: 4px; }
                    .tiptap a { color: #818cf8; text-decoration: underline; }
                    .tiptap img { max-width: 100%; border-radius: 8px; margin: 8px 0; }
                    .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); float: left; color: rgba(255,255,255,0.18); pointer-events: none; height: 0; }
                    .tiptap:focus-visible { outline: none; }
                  `}</style>
                  <EditorContent editor={editor} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Link modal */}
      {showLinkModal && (
        <div className="modal-overlay">
          <div className="glass animate-slide-up" style={{ width: 360, borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 16 }}>Insert Link</div>
            <span className="chrome-label">URL</span>
            <input autoFocus value={linkUrl} onChange={e => setLinkUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && insertLink()} placeholder="https://example.com" className="input-glass" style={{ marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowLinkModal(false)} className="btn-glass" style={{ flex: 1, padding: '10px', borderRadius: 9, fontSize: 13, fontWeight: 600 }}>Cancel</button>
              <button onClick={insertLink} className="btn-chrome" style={{ flex: 1, padding: '10px', borderRadius: 9, fontSize: 13 }}>Insert</button>
            </div>
          </div>
        </div>
      )}

      {/* Image modal */}
      {showImageModal && (
        <div className="modal-overlay">
          <div className="glass animate-slide-up" style={{ width: 400, borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 16 }}>Insert Image</div>
            <span className="chrome-label">Image URL</span>
            <input autoFocus value={imageUrl} onChange={e => setImageUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && insertImage()} placeholder="https://example.com/image.jpg" className="input-glass" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginBottom: 14 }}>Paste a direct image URL. For uploads, host your image on Imgur or Cloudinary first.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowImageModal(false)} className="btn-glass" style={{ flex: 1, padding: '10px', borderRadius: 9, fontSize: 13, fontWeight: 600 }}>Cancel</button>
              <button onClick={insertImage} className="btn-chrome" style={{ flex: 1, padding: '10px', borderRadius: 9, fontSize: 13 }}>Insert</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function wrapInEmailTemplate(subject: string, fromName: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${subject}</title>
<style>
  body { margin:0; padding:0; background:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
  .wrapper { max-width:600px; margin:32px auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
  .header { background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%); padding:28px 36px; }
  .header-title { color:#ffffff; font-size:20px; font-weight:700; margin:0; letter-spacing:-0.02em; }
  .header-sub { color:rgba(255,255,255,0.5); font-size:12px; margin:4px 0 0; letter-spacing:0.06em; text-transform:uppercase; }
  .body { padding:36px; color:#1f2937; font-size:15px; line-height:1.7; }
  .body h1 { font-size:28px; font-weight:800; color:#111827; margin:0 0 16px; letter-spacing:-0.03em; }
  .body h2 { font-size:20px; font-weight:700; color:#111827; margin:0 0 12px; }
  .body p { margin:0 0 16px; }
  .body a { color:#4f46e5; }
  .body img { max-width:100%; border-radius:8px; }
  .body ul, .body ol { padding-left:20px; margin:0 0 16px; }
  .footer { background:#f9fafb; padding:20px 36px; border-top:1px solid #e5e7eb; text-align:center; }
  .footer p { margin:0; font-size:12px; color:#9ca3af; line-height:1.6; }
  .footer a { color:#6366f1; text-decoration:none; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <p class="header-title">${fromName}</p>
    <p class="header-sub">Campaign Communication</p>
  </div>
  <div class="body">${body}</div>
  <div class="footer">
    <p>You received this email from <strong>${fromName}</strong>.<br/>
    <a href="#">Unsubscribe</a> · <a href="#">Privacy Policy</a></p>
  </div>
</div>
</body>
</html>`;
}
