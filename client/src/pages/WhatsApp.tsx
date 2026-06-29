import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  RefreshCw, Send, MessageSquare, CheckCircle, XCircle, Clock,
  AlertTriangle, ChevronDown, ChevronUp, Eye, EyeOff, Loader2,
  Plus, Trash2, Edit2, Building2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WaAccount {
  id: string;
  name: string;
  waba_id: string;
  phone_number_id: string;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
}

interface CloudTemplate {
  id: string;
  meta_template_id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  quality_score: Record<string, unknown>;
  components: Component[];
  last_synced_at: string;
  waba_id: string | null;
  waba_name: string | null;
  account_id: string | null;
}

interface Component {
  type: string;
  format?: string;
  text?: string;
  buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
}

interface WaMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  recipient_id?: string;
  sender_id?: string;
  template_name?: string;
  template_language?: string;
  status: string;
  meta_message_id?: string;
  external_id?: string;
  error_message?: string;
  error_details?: unknown;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  failed_at?: string;
  created_at: string;
  meta_response?: unknown;
  body?: string;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)',
  color: 'var(--color-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 6, fontSize: 13,
  fontWeight: 500, color: 'var(--color-text-secondary)',
};

function statusBadge(status: string) {
  const s: Record<string, { bg: string; color: string }> = {
    APPROVED: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
    PENDING:  { bg: 'rgba(234,179,8,0.15)',  color: '#eab308' },
    REJECTED: { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
    PAUSED:   { bg: 'rgba(156,163,175,0.15)',color: '#9ca3af' },
    DISABLED: { bg: 'rgba(156,163,175,0.15)',color: '#9ca3af' },
    sent:      { bg: 'rgba(99,102,241,0.15)', color: '#818cf8' },
    delivered: { bg: 'rgba(34,197,94,0.15)',  color: '#22c55e' },
    read:      { bg: 'rgba(14,165,233,0.15)', color: '#38bdf8' },
    failed:    { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
    pending:   { bg: 'rgba(234,179,8,0.15)',  color: '#eab308' },
    received:  { bg: 'rgba(99,102,241,0.15)', color: '#818cf8' },
  };
  const style = s[status] ?? { bg: 'rgba(156,163,175,0.1)', color: '#9ca3af' };
  return (
    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: style.bg, color: style.color, letterSpacing: '0.04em' }}>
      {status.toUpperCase()}
    </span>
  );
}

function fmtTs(ts?: string | null) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function componentPreview(components: Component[]) {
  const header  = components.find(c => c.type === 'HEADER');
  const body    = components.find(c => c.type === 'BODY');
  const footer  = components.find(c => c.type === 'FOOTER');
  const buttons = components.find(c => c.type === 'BUTTONS');
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {header && <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--color-text)' }}>{header.format === 'TEXT' ? header.text : `[${header.format} HEADER]`}</div>}
      {body   && <div style={{ marginBottom: 6 }}>{body.text}</div>}
      {footer && <div style={{ color: 'var(--color-text-dim)', fontSize: 11, marginBottom: 6 }}>{footer.text}</div>}
      {buttons?.buttons?.map((b, i) => (
        <div key={i} style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6, padding: '4px 8px', marginTop: 4, fontSize: 12 }}>
          [{b.type}] {b.text}{b.url ? ` → ${b.url}` : ''}{b.phone_number ? ` → ${b.phone_number}` : ''}
        </div>
      ))}
    </div>
  );
}

// ─── Business selector dropdown ───────────────────────────────────────────────

function BusinessFilter({ accounts, selected, onChange }: {
  accounts: WaAccount[];
  selected: string;
  onChange: (v: string) => void;
}) {
  if (accounts.length === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Building2 size={14} color="var(--color-text-dim)" />
      <select
        value={selected}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, width: 'auto', padding: '6px 10px', fontSize: 12 }}
      >
        <option value="">All businesses</option>
        {accounts.map(a => (
          <option key={a.id} value={a.waba_id}>{a.name}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Templates tab ────────────────────────────────────────────────────────────

function TemplatesTab({ accounts }: { accounts: WaAccount[] }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [wabaFilter, setWabaFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['wa-cloud-templates', wabaFilter],
    queryFn: () => {
      const params = wabaFilter ? `?waba_id=${encodeURIComponent(wabaFilter)}` : '';
      return api.get(`/whatsapp-cloud/templates${params}`).then(r => r.data.data as CloudTemplate[]);
    },
  });

  const syncAll = useMutation({
    mutationFn: () => api.post('/whatsapp-cloud/templates/sync'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-cloud-templates'] }),
  });

  const syncOne = useMutation({
    mutationFn: (accountId: string) => api.post(`/whatsapp-cloud/accounts/${accountId}/sync`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-cloud-templates'] });
      qc.invalidateQueries({ queryKey: ['wa-cloud-accounts'] });
    },
  });

  const templates = data ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: 'var(--color-text)', fontWeight: 600, fontSize: 16 }}>WhatsApp Cloud Templates</div>
            <div style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>{templates.length} templates{wabaFilter ? ' for selected business' : ''}</div>
          </div>
          <BusinessFilter accounts={accounts} selected={wabaFilter} onChange={setWabaFilter} />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Per-account sync buttons */}
          {accounts.filter(a => a.is_active).map(a => (
            <button
              key={a.id}
              onClick={() => syncOne.mutate(a.id)}
              disabled={syncOne.isPending}
              title={`Sync templates for ${a.name}`}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              <RefreshCw size={12} /> {a.name}
            </button>
          ))}
          <button
            onClick={() => syncAll.mutate()}
            disabled={syncAll.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {syncAll.isPending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
            Sync all
          </button>
        </div>
      </div>

      {(syncAll.isSuccess || syncOne.isSuccess) && (
        <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#22c55e', fontSize: 13 }}>
          Sync complete — {(((syncAll.data ?? syncOne.data) as { data?: { synced?: number } })?.data?.synced ?? 0)} templates updated.
        </div>
      )}

      {isLoading && <div style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>Loading templates…</div>}
      {!isLoading && templates.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-dim)', fontSize: 14 }}>
          No templates found. {accounts.length === 0 ? 'Add a WhatsApp Business Account in Configuration first.' : 'Click Sync to pull templates from Meta.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {templates.map(t => (
          <div key={t.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }} onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: 14 }}>{t.name}</span>
                  {statusBadge(t.status)}
                  {t.waba_name && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', fontSize: 11, color: '#818cf8' }}>
                      <Building2 size={10} />{t.waba_name}
                    </span>
                  )}
                </div>
                <div style={{ color: 'var(--color-text-dim)', fontSize: 12, marginTop: 3 }}>
                  {t.language} · {t.category} · synced {fmtTs(t.last_synced_at)}
                </div>
              </div>
              <div style={{ color: 'var(--color-text-dim)' }}>
                {expanded === t.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>
            {expanded === t.id && (
              <div style={{ borderTop: '1px solid var(--color-border)', padding: '12px 16px' }}>
                <div style={{ marginBottom: 8, color: 'var(--color-text-dim)', fontSize: 12 }}>
                  Meta ID: {t.meta_template_id}
                  {t.waba_id && ` · WABA: ${t.waba_id}`}
                  {` · Quality: ${(t.quality_score as { score?: string })?.score ?? 'N/A'}`}
                </div>
                {componentPreview(t.components)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Send tab ──────────────────────────────────────────────────────────────────

function SendTab({ accounts }: { accounts: WaAccount[] }) {
  const [form, setForm] = useState({ to: '', templateName: '', languageCode: '', components: '', accountId: '' });
  const [selectedTemplate, setSelectedTemplate] = useState<CloudTemplate | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const { data: templatesData } = useQuery({
    queryKey: ['wa-cloud-templates', ''],
    queryFn: () => api.get('/whatsapp-cloud/templates').then(r => r.data.data as CloudTemplate[]),
  });

  const templates = (templatesData ?? []).filter(t => t.status === 'APPROVED');

  const sendMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/whatsapp-cloud/messages/send', payload),
    onSuccess: () => {
      setResult({ success: true, message: 'Message sent successfully!' });
      setForm({ to: '', templateName: '', languageCode: '', components: '', accountId: '' });
      setSelectedTemplate(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setResult({ success: false, message: err.response?.data?.error ?? 'Failed to send message.' });
    },
  });

  function handleTemplateSelect(name: string) {
    const tpl = templates.find(t => t.name === name) ?? null;
    setSelectedTemplate(tpl);
    setForm(f => ({
      ...f,
      templateName: name,
      languageCode: tpl?.language ?? f.languageCode,
      accountId: tpl?.account_id ?? f.accountId,
    }));
  }

  function handleSend() {
    let components: unknown[] | undefined;
    if (form.components.trim()) {
      try { components = JSON.parse(form.components); }
      catch { setResult({ success: false, message: 'Components must be valid JSON.' }); return; }
    }
    setResult(null);
    sendMutation.mutate({
      to: form.to,
      templateName: form.templateName,
      languageCode: form.languageCode,
      components,
      accountId: form.accountId || undefined,
    });
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ color: 'var(--color-text)', fontWeight: 600, fontSize: 16 }}>Send WhatsApp Template Message</div>
        <div style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>Send an approved template via a configured WhatsApp Business Account.</div>
      </div>

      {result && (
        <div style={{ background: result.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${result.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: result.success ? '#22c55e' : '#f87171', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          {result.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
          {result.message}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>Recipient Phone (international format)</label>
          <input style={inputStyle} placeholder="+254712345678 or 254712345678" value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} />
        </div>

        <div>
          <label style={labelStyle}>Template</label>
          <select style={inputStyle} value={form.templateName} onChange={e => handleTemplateSelect(e.target.value)}>
            <option value="">Select a template…</option>
            {templates.map(t => (
              <option key={`${t.name}:${t.language}`} value={t.name}>{t.name} ({t.language}){t.waba_name ? ` — ${t.waba_name}` : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Language Code</label>
          <input style={inputStyle} placeholder="e.g. en_US" value={form.languageCode} onChange={e => setForm(f => ({ ...f, languageCode: e.target.value }))} />
        </div>

        {accounts.length > 0 && (
          <div>
            <label style={labelStyle}>Send from account</label>
            <select style={inputStyle} value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))}>
              <option value="">Auto (from template)</option>
              {accounts.filter(a => a.is_active).map(a => (
                <option key={a.id} value={a.id}>{a.name} — {a.waba_id}</option>
              ))}
            </select>
          </div>
        )}

        {selectedTemplate && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 6 }}>Template Preview</div>
            {componentPreview(selectedTemplate.components)}
          </div>
        )}

        <div>
          <label style={labelStyle}>Components (optional JSON array for variable substitution)</label>
          <textarea
            style={{ ...inputStyle, height: 100, resize: 'vertical', fontFamily: 'monospace' }}
            placeholder={'[\n  {"type":"body","parameters":[{"type":"text","text":"value"}]}\n]'}
            value={form.components}
            onChange={e => setForm(f => ({ ...f, components: e.target.value }))}
          />
        </div>

        <button
          onClick={handleSend}
          disabled={sendMutation.isPending || !form.to || !form.templateName || !form.languageCode}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 20px', borderRadius: 8, background: sendMutation.isPending ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.8)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: sendMutation.isPending ? 'default' : 'pointer', width: '100%' }}
        >
          {sendMutation.isPending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
          {sendMutation.isPending ? 'Sending…' : 'Send Message'}
        </button>
      </div>
    </div>
  );
}

// ─── Message log tab ──────────────────────────────────────────────────────────

function MessagesTab() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['wa-cloud-messages'],
    queryFn: () => api.get('/whatsapp-cloud/messages?limit=100').then(r => r.data.data as WaMessage[]),
  });
  const messages = data ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ color: 'var(--color-text)', fontWeight: 600, fontSize: 16 }}>Message Log</div>
          <div style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>{messages.length} WhatsApp messages</div>
        </div>
        <button onClick={() => refetch()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 13, cursor: 'pointer' }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {isLoading && <div style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>Loading…</div>}
      {!isLoading && messages.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-dim)', fontSize: 14 }}>No messages yet.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {messages.map(m => {
          const isOut = m.direction === 'outbound';
          return (
            <div key={m.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}>
                <div style={{ flexShrink: 0 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 999, background: isOut ? 'rgba(99,102,241,0.15)' : 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isOut ? <Send size={12} color="#818cf8" /> : <MessageSquare size={12} color="#22c55e" />}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--color-text)', fontWeight: 500, fontSize: 13 }}>
                      {isOut ? `→ ${m.recipient_id}` : `← ${m.sender_id ?? m.recipient_id}`}
                    </span>
                    {statusBadge(m.status)}
                    {isOut && m.template_name && <span style={{ color: 'var(--color-text-dim)', fontSize: 12 }}>{m.template_name} ({m.template_language})</span>}
                  </div>
                  <div style={{ color: 'var(--color-text-dim)', fontSize: 11, marginTop: 2 }}>
                    {fmtTs(m.created_at)}
                    {m.delivered_at && ` · Delivered ${fmtTs(m.delivered_at)}`}
                    {m.read_at && ` · Read ${fmtTs(m.read_at)}`}
                    {m.failed_at && ` · Failed ${fmtTs(m.failed_at)}`}
                  </div>
                  {m.error_message && <div style={{ color: '#f87171', fontSize: 12, marginTop: 2 }}>{m.error_message}</div>}
                </div>
                <div style={{ color: 'var(--color-text-dim)', flexShrink: 0 }}>
                  {expandedId === m.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </div>
              {expandedId === m.id && (
                <div style={{ borderTop: '1px solid var(--color-border)', padding: '12px 16px', fontSize: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', color: 'var(--color-text-secondary)', marginBottom: 10 }}>
                    <span><strong>Meta Message ID:</strong> {m.meta_message_id ?? m.external_id ?? '—'}</span>
                    <span><strong>Direction:</strong> {m.direction}</span>
                    <span><strong>Sent:</strong> {fmtTs(m.sent_at)}</span>
                    <span><strong>Delivered:</strong> {fmtTs(m.delivered_at)}</span>
                    <span><strong>Read:</strong> {fmtTs(m.read_at)}</span>
                    <span><strong>Failed:</strong> {fmtTs(m.failed_at)}</span>
                  </div>
                  {m.error_details && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: '#f87171', fontWeight: 600, marginBottom: 4 }}>Error Details</div>
                      <pre style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: 8, color: '#fca5a5', overflow: 'auto', maxHeight: 120, fontSize: 11 }}>{JSON.stringify(m.error_details, null, 2)}</pre>
                    </div>
                  )}
                  {m.meta_response && (
                    <div>
                      <div style={{ color: 'var(--color-text-dim)', fontWeight: 600, marginBottom: 4 }}>Meta Response</div>
                      <pre style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', borderRadius: 6, padding: 8, color: 'var(--color-text-secondary)', overflow: 'auto', maxHeight: 160, fontSize: 11 }}>{JSON.stringify(m.meta_response, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Config tab ───────────────────────────────────────────────────────────────

function AccountForm({ initial, onSave, onCancel }: {
  initial?: Partial<WaAccount & { access_token: string }>;
  onSave: (data: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    waba_id: initial?.waba_id ?? '',
    phone_number_id: initial?.phone_number_id ?? '',
    access_token: '',
  });
  const [showToken, setShowToken] = useState(false);

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Business Name</label>
          <input style={inputStyle} placeholder="AirPay HealthTech" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>WABA ID</label>
          <input style={inputStyle} placeholder="670397032292331" value={form.waba_id} onChange={e => setForm(f => ({ ...f, waba_id: e.target.value }))} disabled={!!initial?.waba_id} />
        </div>
        <div>
          <label style={labelStyle}>Phone Number ID</label>
          <input style={inputStyle} placeholder="1219141937940884" value={form.phone_number_id} onChange={e => setForm(f => ({ ...f, phone_number_id: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>System User Access Token</label>
          <div style={{ position: 'relative' }}>
            <input
              style={{ ...inputStyle, paddingRight: 36 }}
              type={showToken ? 'text' : 'password'}
              placeholder={initial ? 'Leave blank to keep existing token' : 'EAAxxxx…'}
              value={form.access_token}
              onChange={e => setForm(f => ({ ...f, access_token: e.target.value }))}
            />
            <button onClick={() => setShowToken(s => !s)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-dim)', padding: 2 }}>
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '7px 14px', borderRadius: 8, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        <button
          onClick={() => onSave(form)}
          disabled={!form.name || !form.waba_id || !form.phone_number_id || (!initial && !form.access_token)}
          style={{ padding: '7px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.8)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          {initial ? 'Save changes' : 'Add account'}
        </button>
      </div>
    </div>
  );
}

function ConfigTab() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const { data: configData } = useQuery({
    queryKey: ['wa-cloud-config'],
    queryFn: () => api.get('/whatsapp-cloud/config').then(r => r.data as { graphVersion: string; envConfigured: Record<string, boolean>; accountCount: number; activeAccountCount: number }),
  });

  const { data: accountsData } = useQuery({
    queryKey: ['wa-cloud-accounts'],
    queryFn: () => api.get('/whatsapp-cloud/accounts').then(r => r.data.data as WaAccount[]),
  });

  const accounts = accountsData ?? [];

  const createMutation = useMutation({
    mutationFn: (d: Record<string, string>) => api.post('/whatsapp-cloud/accounts', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wa-cloud-accounts'] }); setShowAdd(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api.patch(`/whatsapp-cloud/accounts/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wa-cloud-accounts'] }); setEditId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/whatsapp-cloud/accounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-cloud-accounts'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => api.patch(`/whatsapp-cloud/accounts/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-cloud-accounts'] }),
  });

  return (
    <div style={{ maxWidth: 700 }}>
      {/* Accounts list */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ color: 'var(--color-text)', fontWeight: 600, fontSize: 16 }}>WhatsApp Business Accounts</div>
            <div style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>{accounts.length} account{accounts.length !== 1 ? 's' : ''} configured</div>
          </div>
          <button
            onClick={() => { setShowAdd(true); setEditId(null); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            <Plus size={13} /> Add account
          </button>
        </div>

        {showAdd && (
          <AccountForm
            onSave={d => createMutation.mutate(d)}
            onCancel={() => setShowAdd(false)}
          />
        )}
        {createMutation.isError && (
          <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>
            {(createMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create account'}
          </div>
        )}

        {accounts.length === 0 && !showAdd && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-dim)', fontSize: 13, border: '1px dashed var(--color-border)', borderRadius: 10 }}>
            No accounts yet. Add one to start syncing templates.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {accounts.map(a => (
            <div key={a.id}>
              {editId === a.id ? (
                <AccountForm
                  initial={a}
                  onSave={d => {
                    const payload: Record<string, unknown> = { name: d.name, phone_number_id: d.phone_number_id };
                    if (d.access_token) payload.access_token = d.access_token;
                    updateMutation.mutate({ id: a.id, data: payload });
                  }}
                  onCancel={() => setEditId(null)}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: a.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(156,163,175,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Building2 size={15} color={a.is_active ? '#22c55e' : '#9ca3af'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: 14 }}>{a.name}</div>
                    <div style={{ color: 'var(--color-text-dim)', fontSize: 12 }}>
                      WABA: {a.waba_id} · Phone ID: {a.phone_number_id}
                      {a.last_synced_at && ` · Last synced: ${fmtTs(a.last_synced_at)}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => toggleMutation.mutate({ id: a.id, is_active: !a.is_active })}
                      title={a.is_active ? 'Disable' : 'Enable'}
                      style={{ padding: '5px 10px', borderRadius: 6, background: a.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(156,163,175,0.1)', border: 'none', color: a.is_active ? '#22c55e' : '#9ca3af', fontSize: 12, cursor: 'pointer' }}
                    >
                      {a.is_active ? 'Active' : 'Disabled'}
                    </button>
                    <button onClick={() => setEditId(a.id)} style={{ padding: '5px 8px', borderRadius: 6, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete account "${a.name}"?`)) deleteMutation.mutate(a.id); }}
                      style={{ padding: '5px 8px', borderRadius: 6, background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', cursor: 'pointer' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Env config status */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ color: 'var(--color-text)', fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Environment Variable Status</div>
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ marginBottom: 8, color: 'var(--color-text-dim)', fontSize: 12 }}>Graph API Version: <strong style={{ color: 'var(--color-text)' }}>{configData?.graphVersion}</strong></div>
          {Object.entries(configData?.envConfigured ?? {}).map(([key, ok]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 13 }}>
              {ok ? <CheckCircle size={13} color="#22c55e" /> : <XCircle size={13} color="#9ca3af" />}
              <span style={{ color: ok ? 'var(--color-text-secondary)' : 'var(--color-text-dim)' }}>
                {key === 'accessToken' && 'META_ACCESS_TOKEN (legacy env fallback)'}
                {key === 'wabaId' && 'META_WABA_ID (legacy env fallback)'}
                {key === 'phoneNumberId' && 'META_PHONE_NUMBER_ID (legacy env fallback)'}
                {key === 'webhookVerifyToken' && 'META_WEBHOOK_VERIFY_TOKEN'}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: ok ? '#22c55e' : '#9ca3af' }}>{ok ? 'Set' : 'Not set'}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={() => setShowInstructions(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', fontSize: 13, cursor: 'pointer', marginBottom: 12, padding: 0 }}>
        {showInstructions ? <EyeOff size={14} /> : <Eye size={14} />}
        {showInstructions ? 'Hide' : 'Show'} setup instructions
      </button>

      {showInstructions && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
          <p style={{ fontWeight: 700, color: 'var(--color-text)', marginBottom: 10 }}>Setup Guide</p>
          <p style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>Adding a WhatsApp Business Account</p>
          <ol style={{ paddingLeft: 20, marginBottom: 14 }}>
            <li>Get your WABA ID from <strong>Meta Business Manager → WhatsApp → Overview</strong></li>
            <li>Get your Phone Number ID from <strong>Meta Business Manager → WhatsApp → Phone numbers</strong></li>
            <li>Generate a System User Access Token with <code>whatsapp_business_messaging</code> + <code>whatsapp_business_management</code> permissions</li>
            <li>Click <strong>Add account</strong> above and fill in the details</li>
            <li>Go to the <strong>Templates</strong> tab and click <strong>Sync all</strong></li>
          </ol>
          <p style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>Webhook configuration</p>
          <p style={{ marginBottom: 4 }}>In <strong>Meta Developers → Your App → WhatsApp → Configuration</strong>:</p>
          <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
            <li>Callback URL: <code>{window.location.origin}/webhooks/whatsapp</code></li>
            <li>Verify Token: value of <code>META_WEBHOOK_VERIFY_TOKEN</code></li>
            <li>Subscribe to: <code>messages</code></li>
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'templates' | 'send' | 'messages' | 'config';

export default function WhatsApp() {
  const [tab, setTab] = useState<Tab>('templates');

  const { data: accountsData } = useQuery({
    queryKey: ['wa-cloud-accounts'],
    queryFn: () => api.get('/whatsapp-cloud/accounts').then(r => r.data.data as WaAccount[]),
  });
  const accounts = accountsData ?? [];

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'templates', label: 'Templates',      icon: <MessageSquare size={14} /> },
    { id: 'send',      label: 'Send Message',   icon: <Send size={14} /> },
    { id: 'messages',  label: 'Message Log',    icon: <Clock size={14} /> },
    { id: 'config',    label: 'Configuration',  icon: <AlertTriangle size={14} /> },
  ];

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: 'var(--color-text)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em' }}>WhatsApp Cloud API</div>
        <div style={{ color: 'var(--color-text-dim)', fontSize: 14, marginTop: 4 }}>Manage templates, send messages, and view delivery logs via Meta WhatsApp Cloud API.</div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 10, border: '1px solid var(--color-border)', width: 'fit-content' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer', background: tab === t.id ? 'rgba(99,102,241,0.2)' : 'transparent', color: tab === t.id ? '#818cf8' : 'var(--color-text-dim)', transition: 'all 0.15s' }}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'templates' && <TemplatesTab accounts={accounts} />}
      {tab === 'send'      && <SendTab accounts={accounts} />}
      {tab === 'messages'  && <MessagesTab />}
      {tab === 'config'    && <ConfigTab />}
    </div>
  );
}
