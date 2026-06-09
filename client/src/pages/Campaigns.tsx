import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Pause, BarChart2, Loader2, X, Megaphone, Mail, Send, CheckCircle2, Eye, MousePointerClick, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

interface CampaignStats {
  campaignId: string;
  total: number;
  pending: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  bounced: number;
  opened: number;
  clicked: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  failureRate: number;
}

function StatBar({ label, value, max, color, icon: Icon }: { label: string; value: number; max: number; color: string; icon: React.ElementType }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          <Icon size={12} color={color} />
          {label}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em' }}>{value.toLocaleString()}</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
        </div>
      </div>
      <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: color, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function AnalyticsModal({ campaignId, campaignName, onClose }: { campaignId: string; campaignName: string; onClose: () => void }) {
  const { data: stats, isLoading } = useQuery<CampaignStats>({
    queryKey: ['campaign-analytics', campaignId],
    queryFn: () => api.get(`/campaigns/${campaignId}/analytics`).then(r => r.data),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass animate-slide-up" style={{ width: '100%', maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Campaign Analytics</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{campaignName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}><X size={17} /></button>
        </div>

        <div style={{ padding: '24px' }}>
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: 40 }} />)}
            </div>
          ) : !stats ? (
            <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '24px 0' }}>No data available.</p>
          ) : (
            <>
              {/* Headline numbers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
                {[
                  { label: 'Audience', value: stats.total, color: 'rgba(255,255,255,0.6)' },
                  { label: 'Sent', value: stats.sent + stats.delivered + stats.read, color: '#818cf8' },
                  { label: 'Failed', value: stats.failed + stats.bounced, color: '#f87171' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: '-0.04em' }}>{value.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Rate bars */}
              <StatBar label="Delivered" value={stats.delivered + stats.read} max={stats.total} color="#4ade80" icon={CheckCircle2} />
              <StatBar label="Opened" value={stats.opened} max={stats.total} color="#818cf8" icon={Eye} />
              <StatBar label="Clicked" value={stats.clicked} max={stats.total} color="#38bdf8" icon={MousePointerClick} />
              <StatBar label="Failed / Bounced" value={stats.failed + stats.bounced} max={stats.total} color="#f87171" icon={AlertCircle} />

              {/* Rates row */}
              <div style={{ display: 'flex', gap: 10, marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                {[
                  { label: 'Delivery Rate', value: `${stats.deliveryRate}%`, color: '#4ade80' },
                  { label: 'Open Rate', value: `${stats.openRate}%`, color: '#818cf8' },
                  { label: 'Click Rate', value: `${stats.clickRate}%`, color: '#38bdf8' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color, letterSpacing: '-0.03em' }}>{value}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Pending/queued note */}
              {(stats.pending + stats.queued) > 0 && (
                <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', fontSize: 12, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Send size={12} />
                  {stats.pending + stats.queued} message{stats.pending + stats.queued !== 1 ? 's' : ''} still in queue
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface Campaign {
  id: string;
  name: string;
  description?: string;
  channel: string;
  status: string;
  segment_id?: string;
  message_body?: string;
  template_name?: string;
  subject?: string;
  scheduled_at?: string;
  created_at: string;
}
interface CampaignsResponse { data: Campaign[]; total?: number; }
interface Segment { id: string; name: string; }
interface SegmentsResponse { data: Segment[]; total?: number; }
interface FormState {
  name: string;
  description: string;
  channel: string;
  segment_id: string;
  message_body: string;
  template_name: string;
  subject: string;
  scheduled_at: string;
}

const CHANNELS = ['whatsapp', 'sms', 'email'];
const defaultForm: FormState = {
  name: '',
  description: '',
  channel: '',
  segment_id: '',
  message_body: '',
  template_name: '',
  subject: '',
  scheduled_at: '',
};

const statusMap: Record<string, { bg: string; dot: string; text: string }> = {
  draft:     { bg: 'rgba(255,255,255,0.04)', dot: 'rgba(255,255,255,0.2)', text: 'rgba(255,255,255,0.4)' },
  running:   { bg: 'rgba(34,197,94,0.1)',   dot: '#22c55e',               text: '#4ade80' },
  active:    { bg: 'rgba(34,197,94,0.1)',   dot: '#22c55e',               text: '#4ade80' },
  scheduled: { bg: 'rgba(99,102,241,0.1)',  dot: '#818cf8',               text: '#a5b4fc' },
  paused:    { bg: 'rgba(245,158,11,0.1)',  dot: '#f59e0b',               text: '#fbbf24' },
  completed: { bg: 'rgba(168,85,247,0.1)',  dot: '#a855f7',               text: '#c084fc' },
  failed:    { bg: 'rgba(239,68,68,0.1)',   dot: '#ef4444',               text: '#f87171' },
};

function StatusBadge({ status }: { status: string }) {
  const s = statusMap[status] ?? statusMap.draft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, background: s.bg, border: `1px solid ${s.dot}20`, fontSize: 12, fontWeight: 600, color: s.text }}>
      <span className="status-dot" style={{ background: s.dot }} />{status}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="chrome-label">{children}</span>;
}

export default function Campaigns() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toasts, addToast, dismissToast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [analyticsId, setAnalyticsId] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery<CampaignsResponse>({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/campaigns').then(r => r.data),
  });
  const campaigns: Campaign[] = data?.data ?? [];

  const { data: segmentsData } = useQuery<SegmentsResponse>({
    queryKey: ['segments'],
    queryFn: () => api.get('/segments').then(r => r.data),
  });
  const segments: Segment[] = segmentsData?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/campaigns', p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      addToast('success', 'Campaign created.');
      setShowModal(false);
      setForm(defaultForm);
    },
    onError: (err: unknown) =>
      addToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create campaign.'),
  });

  const launchMutation = useMutation({
    mutationFn: (id: string) => api.post(`/campaigns/${id}/launch`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      addToast('success', `Campaign launched — ${res.data.enqueued} messages enqueued.`);
    },
    onError: () => addToast('error', 'Failed to launch.'),
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => api.post(`/campaigns/${id}/pause`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      addToast('success', 'Campaign paused.');
    },
    onError: () => addToast('error', 'Failed to pause.'),
  });

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Name is required.';
    if (!form.channel) errors.channel = 'Channel is required.';
    if (!form.message_body.trim() && !form.template_name.trim()) {
      errors.message_body = 'At least one of Message Body or Template Name is required.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const payload: Record<string, unknown> = {
      name: form.name,
      channel: form.channel,
    };
    if (form.description.trim()) payload.description = form.description;
    if (form.segment_id) payload.segment_id = form.segment_id;
    if (form.message_body.trim()) payload.message_body = form.message_body;
    if (form.template_name.trim()) payload.template_name = form.template_name;
    if (form.subject.trim()) payload.subject = form.subject;
    if (form.scheduled_at) payload.scheduled_at = form.scheduled_at;
    createMutation.mutate(payload);
  };

  const selectChannel = (ch: string) =>
    setForm(p => ({ ...p, channel: p.channel === ch ? '' : ch }));

  return (
    <div style={{ padding: '32px', minHeight: '100vh', background: '#06060f', position: 'relative' }}>
      <div className="aurora-bg" />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="animate-fade-in-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>Campaigns</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Manage your messaging campaigns</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-glass"
              onClick={() => navigate('/campaigns/builder')}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}
            >
              <Mail size={14} /> Email Builder
            </button>
            <button
              className="btn-chrome"
              onClick={() => { setShowModal(true); setForm(defaultForm); setFormErrors({}); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, fontSize: 13 }}
            >
              <Plus size={15} /> New Campaign
            </button>
          </div>
        </div>

        <div className="glass animate-fade-in-up stagger-2" style={{ overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 18, width: `${50 + i * 10}%` }} />)}
            </div>
          ) : campaigns.length === 0 ? (
            <div style={{ padding: '56px 24px', textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Megaphone size={22} color="rgba(255,255,255,0.2)" />
              </div>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, margin: 0 }}>No campaigns yet.</p>
            </div>
          ) : (
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Scheduled</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id}>
                    <td style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{c.name}</td>
                    <td>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {c.channel}
                      </span>
                    </td>
                    <td><StatusBadge status={c.status} /></td>
                    <td style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        {['draft', 'scheduled', 'paused'].includes(c.status) && (
                          <button
                            onClick={() => launchMutation.mutate(c.id)}
                            disabled={launchMutation.isPending}
                            style={{ padding: '5px 12px', borderRadius: 7, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}
                          >
                            <Play size={11} /> Launch
                          </button>
                        )}
                        {c.status === 'running' && (
                          <button
                            onClick={() => pauseMutation.mutate(c.id)}
                            disabled={pauseMutation.isPending}
                            style={{ padding: '5px 12px', borderRadius: 7, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}
                          >
                            <Pause size={11} /> Pause
                          </button>
                        )}
                        <button
                          onClick={() => setAnalyticsId({ id: c.id, name: c.name })}
                          style={{ padding: '5px 8px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}
                          title="View analytics"
                        >
                          <BarChart2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="glass animate-slide-up" style={{ width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>New Campaign</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}><X size={17} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Name */}
              <div>
                <Label>Name *</Label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Campaign name"
                  className="input-glass"
                />
                {formErrors.name && <p style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{formErrors.name}</p>}
              </div>

              {/* Channel — single-select pill buttons */}
              <div>
                <Label>Channel *</Label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {CHANNELS.map(ch => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => selectChannel(ch)}
                      style={{
                        padding: '7px 16px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: 'pointer',
                        border: form.channel === ch ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.08)',
                        background: form.channel === ch ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                        color: form.channel === ch ? '#fff' : 'rgba(255,255,255,0.35)',
                        transition: 'all 0.15s',
                        boxShadow: form.channel === ch ? 'inset 0 1px 0 rgba(255,255,255,0.15)' : 'none',
                      }}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
                {formErrors.channel && <p style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{formErrors.channel}</p>}
              </div>

              {/* Description */}
              <div>
                <Label>Description</Label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder="Optional description"
                  className="input-glass"
                  style={{ resize: 'none' }}
                />
              </div>

              {/* Segment */}
              <div>
                <Label>Segment</Label>
                <select
                  value={form.segment_id}
                  onChange={e => setForm(p => ({ ...p, segment_id: e.target.value }))}
                  className="select-glass"
                >
                  <option value="">All Contacts</option>
                  {segments.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Message Body */}
              <div>
                <Label>Message Body</Label>
                <textarea
                  value={form.message_body}
                  onChange={e => setForm(p => ({ ...p, message_body: e.target.value }))}
                  rows={3}
                  placeholder="Enter message body"
                  className="input-glass"
                  style={{ resize: 'none' }}
                />
                {formErrors.message_body && <p style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{formErrors.message_body}</p>}
              </div>

              {/* WhatsApp Template Name — only when channel is whatsapp */}
              {form.channel === 'whatsapp' && (
                <div>
                  <Label>WhatsApp Template Name</Label>
                  <input
                    type="text"
                    value={form.template_name}
                    onChange={e => setForm(p => ({ ...p, template_name: e.target.value }))}
                    placeholder="e.g. order_confirmation"
                    className="input-glass"
                  />
                </div>
              )}

              {/* Subject — only when channel is email */}
              {form.channel === 'email' && (
                <div>
                  <Label>Subject</Label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                    placeholder="Email subject line"
                    className="input-glass"
                  />
                </div>
              )}

              {/* Scheduled At */}
              <div>
                <Label>Schedule At (optional)</Label>
                <input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={e => setForm(p => ({ ...p, scheduled_at: e.target.value }))}
                  className="input-glass"
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn-glass" style={{ flex: 1, padding: '11px', borderRadius: 9, fontSize: 13, fontWeight: 600 }}>
                  Cancel
                </button>
                <button type="submit" disabled={createMutation.isPending} className="btn-chrome" style={{ flex: 1, padding: '11px', borderRadius: 9, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {createMutation.isPending && <Loader2 size={13} className="animate-spin-slow" />} Create Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {analyticsId && (
        <AnalyticsModal
          campaignId={analyticsId.id}
          campaignName={analyticsId.name}
          onClose={() => setAnalyticsId(null)}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
