import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  RefreshCw, Send, MessageSquare, CheckCircle, XCircle, Clock,
  AlertTriangle, ChevronDown, ChevronUp, Eye, EyeOff, Loader2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

interface Component {
  type: string;
  format?: string;
  text?: string;
  buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
  example?: { body_text?: string[][]; header_text?: string[] };
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const styles: Record<string, { bg: string; color: string }> = {
    APPROVED: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
    PENDING: { bg: 'rgba(234,179,8,0.15)', color: '#eab308' },
    REJECTED: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
    PAUSED: { bg: 'rgba(156,163,175,0.15)', color: '#9ca3af' },
    DISABLED: { bg: 'rgba(156,163,175,0.15)', color: '#9ca3af' },
    sent: { bg: 'rgba(99,102,241,0.15)', color: '#818cf8' },
    delivered: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
    read: { bg: 'rgba(14,165,233,0.15)', color: '#38bdf8' },
    failed: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
    pending: { bg: 'rgba(234,179,8,0.15)', color: '#eab308' },
    received: { bg: 'rgba(99,102,241,0.15)', color: '#818cf8' },
  };
  const s = styles[status] ?? { bg: 'rgba(156,163,175,0.1)', color: '#9ca3af' };
  return (
    <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, letterSpacing: '0.04em' }}>
      {status.toUpperCase()}
    </span>
  );
}

function fmtTs(ts?: string | null) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function componentPreview(components: Component[]) {
  const header = components.find(c => c.type === 'HEADER');
  const body = components.find(c => c.type === 'BODY');
  const footer = components.find(c => c.type === 'FOOTER');
  const buttons = components.find(c => c.type === 'BUTTONS');

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--color-text-secondary)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {header && <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--color-text)' }}>{header.format === 'TEXT' ? header.text : `[${header.format} HEADER]`}</div>}
      {body && <div style={{ marginBottom: 6 }}>{body.text}</div>}
      {footer && <div style={{ color: 'var(--color-text-dim)', fontSize: 11, marginBottom: 6 }}>{footer.text}</div>}
      {buttons?.buttons?.map((b, i) => (
        <div key={i} style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6, padding: '4px 8px', marginTop: 4, fontSize: 12 }}>
          [{b.type}] {b.text}{b.url ? ` → ${b.url}` : ''}{b.phone_number ? ` → ${b.phone_number}` : ''}
        </div>
      ))}
    </div>
  );
}

// ─── Sub-pages ────────────────────────────────────────────────────────────────

function TemplatesTab() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['wa-cloud-templates'],
    queryFn: () => api.get('/whatsapp-cloud/templates').then(r => r.data.data as CloudTemplate[]),
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post('/whatsapp-cloud/templates/sync'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wa-cloud-templates'] }),
  });

  const templates = data ?? [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ color: 'var(--color-text)', fontWeight: 600, fontSize: 16 }}>WhatsApp Cloud Templates</div>
          <div style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>{templates.length} templates synced from Meta</div>
        </div>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 8, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >
          {syncMutation.isPending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
          Sync from Meta
        </button>
      </div>

      {syncMutation.isSuccess && (
        <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#22c55e', fontSize: 13 }}>
          Sync complete — {(syncMutation.data?.data as { synced?: number })?.synced ?? 0} templates updated.
          {((syncMutation.data?.data as { errors?: string[] })?.errors?.length ?? 0) > 0 && (
            <div style={{ color: '#f87171', marginTop: 4 }}>
              Errors: {(syncMutation.data?.data as { errors?: string[] })?.errors?.join('; ')}
            </div>
          )}
        </div>
      )}

      {isLoading && <div style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>Loading templates…</div>}

      {!isLoading && templates.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-dim)', fontSize: 14 }}>
          No templates yet. Click "Sync from Meta" to pull your approved WhatsApp templates.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {templates.map(t => (
          <div key={t.id} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer' }}
              onClick={() => setExpanded(expanded === t.id ? null : t.id)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: 14 }}>{t.name}</span>
                  {statusBadge(t.status)}
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
                  Meta ID: {t.meta_template_id} · Quality: {(t.quality_score as { score?: string })?.score ?? 'N/A'}
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

function SendTab() {
  const [form, setForm] = useState({ to: '', templateName: '', languageCode: '', components: '' });
  const [selectedTemplate, setSelectedTemplate] = useState<CloudTemplate | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const { data: templatesData } = useQuery({
    queryKey: ['wa-cloud-templates'],
    queryFn: () => api.get('/whatsapp-cloud/templates').then(r => r.data.data as CloudTemplate[]),
  });

  const templates = (templatesData ?? []).filter(t => t.status === 'APPROVED');

  const sendMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/whatsapp-cloud/messages/send', payload),
    onSuccess: () => {
      setResult({ success: true, message: 'Message sent successfully!' });
      setForm({ to: '', templateName: '', languageCode: '', components: '' });
      setSelectedTemplate(null);
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setResult({ success: false, message: err.response?.data?.error ?? 'Failed to send message.' });
    },
  });

  function handleTemplateSelect(name: string) {
    const tpl = templates.find(t => t.name === name) ?? null;
    setSelectedTemplate(tpl);
    setForm(f => ({ ...f, templateName: name, languageCode: tpl?.language ?? f.languageCode }));
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
    });
  }

  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', color: 'var(--color-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ color: 'var(--color-text)', fontWeight: 600, fontSize: 16 }}>Send WhatsApp Template Message</div>
        <div style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>Send an approved template message to a WhatsApp number.</div>
      </div>

      {result && (
        <div style={{ background: result.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${result.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: result.success ? '#22c55e' : '#f87171', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          {result.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
          {result.message}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>Recipient Phone Number (international format)</label>
          <input style={inputStyle} placeholder="+254712345678 or 254712345678" value={form.to} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} />
        </div>

        <div>
          <label style={labelStyle}>Template</label>
          <select style={inputStyle} value={form.templateName} onChange={e => handleTemplateSelect(e.target.value)}>
            <option value="">Select a template…</option>
            {templates.map(t => (
              <option key={`${t.name}:${t.language}`} value={t.name}>{t.name} ({t.language})</option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Language Code</label>
          <input style={inputStyle} placeholder="e.g. en_US" value={form.languageCode} onChange={e => setForm(f => ({ ...f, languageCode: e.target.value }))} />
        </div>

        {selectedTemplate && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 6 }}>Template Preview</div>
            {componentPreview(selectedTemplate.components)}
          </div>
        )}

        <div>
          <label style={labelStyle}>Components (optional JSON array)</label>
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
                    {isOut && m.template_name && (
                      <span style={{ color: 'var(--color-text-dim)', fontSize: 12 }}>{m.template_name} ({m.template_language})</span>
                    )}
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
                  {m.body && !m.meta_response && (
                    <div>
                      <div style={{ color: 'var(--color-text-dim)', fontWeight: 600, marginBottom: 4 }}>Message Body</div>
                      <div style={{ color: 'var(--color-text-secondary)', padding: '8px 0' }}>{m.body}</div>
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

function ConfigTab() {
  const [showInstructions, setShowInstructions] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['wa-cloud-config'],
    queryFn: () => api.get('/whatsapp-cloud/config').then(r => r.data as { graphVersion: string; configured: Record<string, boolean> }),
  });

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ color: 'var(--color-text)', fontWeight: 600, fontSize: 16 }}>Configuration Status</div>
        <div style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>Server-side Meta API configuration (access tokens are never exposed here).</div>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--color-text-dim)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ marginBottom: 12, color: 'var(--color-text-dim)', fontSize: 12 }}>Graph API Version: <strong style={{ color: 'var(--color-text)' }}>{data?.graphVersion}</strong></div>
          {Object.entries(data?.configured ?? {}).map(([key, ok]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--color-border-faint)', fontSize: 13 }}>
              {ok ? <CheckCircle size={15} color="#22c55e" /> : <XCircle size={15} color="#ef4444" />}
              <span style={{ color: ok ? 'var(--color-text)' : '#f87171' }}>
                {key === 'accessToken' && 'META_ACCESS_TOKEN'}
                {key === 'wabaId' && 'META_WABA_ID'}
                {key === 'phoneNumberId' && 'META_PHONE_NUMBER_ID'}
                {key === 'webhookVerifyToken' && 'META_WEBHOOK_VERIFY_TOKEN'}
              </span>
              <span style={{ marginLeft: 'auto', color: ok ? '#22c55e' : '#f87171', fontSize: 12, fontWeight: 600 }}>{ok ? 'Configured' : 'Missing'}</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setShowInstructions(!showInstructions)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--color-text-secondary)', fontSize: 13, cursor: 'pointer', marginBottom: 12, padding: 0 }}
      >
        {showInstructions ? <EyeOff size={14} /> : <Eye size={14} />}
        {showInstructions ? 'Hide' : 'Show'} setup instructions
      </button>

      {showInstructions && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
          <p style={{ fontWeight: 700, color: 'var(--color-text)', marginBottom: 10 }}>Meta WhatsApp Cloud API — Setup Guide</p>

          <p style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>1. Required environment variables</p>
          <pre style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '10px 12px', fontSize: 12, fontFamily: 'monospace', overflowX: 'auto', marginBottom: 14 }}>
{`META_GRAPH_VERSION=v22.0
META_ACCESS_TOKEN=<System User permanent access token>
META_WABA_ID=<WhatsApp Business Account ID>
META_PHONE_NUMBER_ID=<Phone Number ID>
META_WEBHOOK_VERIFY_TOKEN=<random secret string>
WHATSAPP_APP_SECRET=<App Secret for signature validation>`}
          </pre>

          <p style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>2. Generating a System User Access Token</p>
          <ol style={{ paddingLeft: 20, marginBottom: 14 }}>
            <li>Go to <strong>Meta Business Manager → Settings → Users → System Users</strong></li>
            <li>Create a System User with <strong>Admin</strong> role</li>
            <li>Click <strong>Add Assets</strong> → add your WhatsApp Business Account</li>
            <li>Click <strong>Generate New Token</strong> → select your App → grant <code>whatsapp_business_messaging</code> and <code>whatsapp_business_management</code> permissions</li>
            <li>Copy the token and set it as <code>META_ACCESS_TOKEN</code></li>
          </ol>

          <p style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>3. Webhook configuration in Meta</p>
          <ol style={{ paddingLeft: 20, marginBottom: 14 }}>
            <li>In <strong>Meta Developers → Your App → WhatsApp → Configuration</strong></li>
            <li>Set Callback URL to: <code>{window.location.origin}/webhooks/whatsapp</code></li>
            <li>Set Verify Token to your <code>META_WEBHOOK_VERIFY_TOKEN</code></li>
            <li>Subscribe to: <code>messages</code> (covers inbound messages and status updates)</li>
          </ol>

          <p style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>4. Syncing templates</p>
          <p style={{ marginBottom: 14 }}>Go to the <strong>Templates</strong> tab and click <strong>Sync from Meta</strong>. Only APPROVED templates can be sent. Templates auto-sync every 6 hours.</p>

          <p style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>5. Sending a test message</p>
          <p>Go to the <strong>Send</strong> tab, select an APPROVED template, enter a WhatsApp number in international format (e.g. <code>254712345678</code>), and click Send.</p>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = 'templates' | 'send' | 'messages' | 'config';

export default function WhatsApp() {
  const [tab, setTab] = useState<Tab>('templates');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'templates', label: 'Templates', icon: <MessageSquare size={14} /> },
    { id: 'send', label: 'Send Message', icon: <Send size={14} /> },
    { id: 'messages', label: 'Message Log', icon: <Clock size={14} /> },
    { id: 'config', label: 'Configuration', icon: <AlertTriangle size={14} /> },
  ];

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: 'var(--color-text)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em' }}>WhatsApp Cloud API</div>
        <div style={{ color: 'var(--color-text-dim)', fontSize: 14, marginTop: 4 }}>Manage templates, send messages, and view delivery logs via Meta WhatsApp Cloud API.</div>
      </div>

      {/* Tabs */}
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

      {/* Content */}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'send' && <SendTab />}
      {tab === 'messages' && <MessagesTab />}
      {tab === 'config' && <ConfigTab />}
    </div>
  );
}
