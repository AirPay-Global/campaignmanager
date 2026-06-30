import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Play, Pause, BarChart2, Loader2, X, Megaphone, Mail, Send,
  CheckCircle2, Eye, MousePointerClick, AlertCircle, Copy, Bookmark, LayoutTemplate,
  FlaskConical, Trophy, MessageCircle, RefreshCw,
} from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string; name: string; description?: string; channel: string; status: string;
  segment_id?: string; message_body?: string; template_name?: string; subject?: string;
  scheduled_at?: string; created_at: string; is_template?: boolean;
  ab_test_id?: string | null; ab_variant_label?: string | null;
}
interface CampaignsResponse { data: Campaign[]; total?: number; }
interface Segment { id: string; name: string; }
interface SegmentsResponse { data: Segment[]; total?: number; }
interface CampaignStats {
  campaignId: string; total: number; pending: number; queued: number;
  sent: number; delivered: number; read: number; failed: number; bounced: number;
  opened: number; clicked: number;
  deliveryRate: number; openRate: number; clickRate: number; failureRate: number;
}
interface FormState {
  name: string; description: string; channel: string; segment_id: string;
  message_body: string; template_name: string; subject: string; scheduled_at: string;
}

const defaultForm: FormState = {
  name: '', description: '', channel: '', segment_id: '',
  message_body: '', template_name: '', subject: '', scheduled_at: '',
};
const CHANNELS = ['whatsapp', 'sms', 'email'];

// ─── Meta WhatsApp Template type ─────────────────────────────────────────────

interface MetaWaTemplate {
  id: string; name: string; language: string; category: string; status: string;
  waba_name: string | null; account_id: string | null;
  components: { type: string; text?: string; format?: string; buttons?: { type: string; text: string }[] }[];
}

// ─── Built-in Templates ───────────────────────────────────────────────────────

interface BuiltinTemplate {
  id: string; name: string; description: string; channel: string;
  message_body?: string; template_name?: string; subject?: string; icon: string;
}

const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'bt-sms-reminder',
    name: 'Appointment Reminder',
    description: 'Remind contacts of upcoming appointments.',
    channel: 'sms',
    message_body: 'Hi {{name}}, this is a reminder that your appointment is on {{date}} at {{time}}. Reply STOP to opt out.',
    icon: '📅',
  },
  {
    id: 'bt-sms-payment',
    name: 'Payment Confirmation',
    description: 'Confirm a successful payment.',
    channel: 'sms',
    message_body: 'Hi {{name}}, your payment of {{currency}}{{amount}} has been received. Thank you for your business!',
    icon: '✅',
  },
  {
    id: 'bt-sms-promo',
    name: 'Promotional Offer',
    description: 'Send a discount code or special offer.',
    channel: 'sms',
    message_body: 'Hi {{name}}, enjoy {{discount}}% off with code {{code}}. Valid until {{expiry}}. Shop now!',
    icon: '🎁',
  },
  {
    id: 'bt-sms-alert',
    name: 'Account Alert',
    description: 'Notify contacts of important account activity.',
    channel: 'sms',
    message_body: 'Alert: {{action}} detected on your account at {{time}}. If this was not you, contact us immediately.',
    icon: '🔔',
  },
  {
    id: 'bt-wa-order',
    name: 'Order Confirmation',
    description: 'WhatsApp order confirmation using an approved template.',
    channel: 'whatsapp',
    template_name: 'order_confirmation',
    message_body: 'Hi {{1}}, your order #{{2}} has been confirmed. Estimated delivery: {{3}}.',
    icon: '📦',
  },
  {
    id: 'bt-wa-delivery',
    name: 'Delivery Update',
    description: 'Notify customers about their delivery status.',
    channel: 'whatsapp',
    template_name: 'delivery_update',
    message_body: 'Hi {{1}}, your order is {{2}}. Track it here: {{3}}',
    icon: '🚚',
  },
  {
    id: 'bt-email-newsletter',
    name: 'Monthly Newsletter',
    description: 'Regular newsletter with updates and news.',
    channel: 'email',
    subject: '{{month}} Newsletter from AirPay',
    message_body: `<h2>Hello {{name}},</h2><p>Here's what's new this month at AirPay.</p><h3>Highlights</h3><ul><li>{{highlight_1}}</li><li>{{highlight_2}}</li><li>{{highlight_3}}</li></ul><p>As always, thank you for being part of our community.</p><p>Best regards,<br>The AirPay Team</p>`,
    icon: '📧',
  },
  {
    id: 'bt-email-promo',
    name: 'Promotional Email',
    description: 'Announce a sale, discount, or limited-time offer.',
    channel: 'email',
    subject: 'Exclusive offer for you, {{name}}!',
    message_body: `<h2>Hi {{name}},</h2><p>We have an exclusive offer just for you!</p><div style="background:#f3f4f6;padding:20px;border-radius:8px;text-align:center;margin:20px 0"><h3 style="font-size:32px;margin:0;color:#6366f1">{{discount}}% OFF</h3><p>Use code <strong>{{code}}</strong> at checkout</p><p style="color:#6b7280;font-size:12px">Valid until {{expiry}}</p></div><p>Don't miss out — this offer won't last long.</p>`,
    icon: '💰',
  },
  {
    id: 'bt-email-welcome',
    name: 'Welcome Email',
    description: 'Onboard new contacts with a warm welcome.',
    channel: 'email',
    subject: 'Welcome to AirPay, {{name}}!',
    message_body: `<h2>Welcome aboard, {{name}}!</h2><p>We're thrilled to have you with us. Here's how to get started:</p><ol><li><strong>Complete your profile</strong> — add your details so we can serve you better.</li><li><strong>Explore our services</strong> — discover everything AirPay has to offer.</li><li><strong>Get in touch</strong> — our team is always here to help.</li></ol><p>If you have any questions, simply reply to this email.</p><p>Welcome to the family,<br>The AirPay Team</p>`,
    icon: '👋',
  },
];

// ─── Status & UI helpers ──────────────────────────────────────────────────────

const statusMap: Record<string, { bg: string; dot: string; text: string }> = {
  draft:     { bg: 'rgba(255,255,255,0.04)', dot: 'rgba(255,255,255,0.2)', text: 'rgba(255,255,255,0.4)' },
  running:   { bg: 'rgba(34,197,94,0.1)',    dot: '#22c55e',               text: '#4ade80'               },
  active:    { bg: 'rgba(34,197,94,0.1)',    dot: '#22c55e',               text: '#4ade80'               },
  scheduled: { bg: 'rgba(99,102,241,0.1)',   dot: '#818cf8',               text: '#a5b4fc'               },
  paused:    { bg: 'rgba(245,158,11,0.1)',   dot: '#f59e0b',               text: '#fbbf24'               },
  completed: { bg: 'rgba(168,85,247,0.1)',   dot: '#a855f7',               text: '#c084fc'               },
  failed:    { bg: 'rgba(239,68,68,0.1)',    dot: '#ef4444',               text: '#f87171'               },
};

const channelColors: Record<string, { bg: string; text: string }> = {
  whatsapp: { bg: 'rgba(34,197,94,0.1)',   text: '#4ade80' },
  sms:      { bg: 'rgba(99,102,241,0.1)',  text: '#a5b4fc' },
  email:    { bg: 'rgba(56,189,248,0.1)',  text: '#38bdf8' },
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

// ─── Analytics Modal ──────────────────────────────────────────────────────────

function StatBar({ label, value, max, color, icon: Icon }: { label: string; value: number; max: number; color: string; icon: React.ElementType }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          <Icon size={12} color={color} />{label}
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
              <StatBar label="Delivered" value={stats.delivered + stats.read} max={stats.total} color="#4ade80" icon={CheckCircle2} />
              <StatBar label="Opened" value={stats.opened} max={stats.total} color="#818cf8" icon={Eye} />
              <StatBar label="Clicked" value={stats.clicked} max={stats.total} color="#38bdf8" icon={MousePointerClick} />
              <StatBar label="Failed / Bounced" value={stats.failed + stats.bounced} max={stats.total} color="#f87171" icon={AlertCircle} />
              <div style={{ display: 'flex', gap: 10, marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                {[
                  { label: 'Delivery Rate', value: `${stats.deliveryRate}%`, color: '#4ade80' },
                  { label: 'Open Rate',     value: `${stats.openRate}%`,     color: '#818cf8' },
                  { label: 'Click Rate',    value: `${stats.clickRate}%`,    color: '#38bdf8' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color, letterSpacing: '-0.03em' }}>{value}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
              {(stats.pending + stats.queued) > 0 && (
                <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', fontSize: 12, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Send size={12} />{stats.pending + stats.queued} message{stats.pending + stats.queued !== 1 ? 's' : ''} still in queue
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({
  name, description, channel, messagePreview, icon, isBuiltin,
  onUse, onDelete,
}: {
  name: string; description: string; channel: string;
  messagePreview: string; icon?: string; isBuiltin?: boolean;
  onUse: () => void; onDelete?: () => void;
}) {
  const cc = channelColors[channel] ?? { bg: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.4)' };
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10, transition: 'border-color 0.2s', cursor: 'default' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {icon && <span style={{ fontSize: 20 }}>{icon}</span>}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{description}</div>
          </div>
        </div>
        <span style={{ flexShrink: 0, fontSize: 10, padding: '2px 8px', borderRadius: 5, background: cc.bg, color: cc.text, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{channel}</span>
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '8px 10px', fontFamily: 'monospace', lineHeight: 1.5, maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {messagePreview.replace(/<[^>]+>/g, '').slice(0, 120)}{messagePreview.length > 120 ? '…' : ''}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button onClick={onUse} className="btn-chrome" style={{ flex: 1, padding: '7px', borderRadius: 8, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <Plus size={11} /> Use Template
        </button>
        {!isBuiltin && onDelete && (
          <button onClick={onDelete} style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171', cursor: 'pointer', fontSize: 12 }}>
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Meta WhatsApp Template Card ─────────────────────────────────────────────

function MetaTemplateCard({ tpl, onUse }: { tpl: MetaWaTemplate; onUse: () => void }) {
  const bodyText = tpl.components.find(c => c.type === 'BODY')?.text ?? '';
  const headerComp = tpl.components.find(c => c.type === 'HEADER');
  const buttons = tpl.components.find(c => c.type === 'BUTTONS')?.buttons ?? [];
  const categoryColors: Record<string, { bg: string; text: string }> = {
    MARKETING:      { bg: 'rgba(139,92,246,0.12)',  text: '#c084fc' },
    UTILITY:        { bg: 'rgba(56,189,248,0.1)',   text: '#38bdf8' },
    AUTHENTICATION: { bg: 'rgba(245,158,11,0.1)',   text: '#fbbf24' },
  };
  const cc = categoryColors[tpl.category] ?? { bg: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.4)' };

  return (
    <div
      style={{ background: 'rgba(37,211,102,0.03)', border: '1px solid rgba(37,211,102,0.1)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, transition: 'border-color 0.2s', cursor: 'default' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(37,211,102,0.22)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(37,211,102,0.1)')}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageCircle size={15} color="rgba(37,211,102,0.7)" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{tpl.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>
              {tpl.language}{tpl.waba_name ? ` · ${tpl.waba_name}` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ flexShrink: 0, fontSize: 10, padding: '2px 7px', borderRadius: 5, background: 'rgba(37,211,102,0.1)', color: '#25d366', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>WhatsApp</span>
          <span style={{ flexShrink: 0, fontSize: 10, padding: '2px 7px', borderRadius: 5, background: cc.bg, color: cc.text, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{tpl.category}</span>
        </div>
      </div>

      {/* Message bubble preview */}
      <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 8, overflow: 'hidden', fontSize: 11 }}>
        {headerComp && (
          <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
            {headerComp.format === 'IMAGE' ? '🖼 Image' : headerComp.format === 'VIDEO' ? '🎬 Video' : headerComp.format === 'DOCUMENT' ? '📄 Document' : headerComp.text ?? ''}
          </div>
        )}
        <div style={{ padding: '7px 10px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, maxHeight: 56, overflow: 'hidden', fontFamily: 'monospace' }}>
          {bodyText.slice(0, 130)}{bodyText.length > 130 ? '…' : ''}
        </div>
        {buttons.length > 0 && (
          <div style={{ padding: '5px 10px', borderTop: '1px solid rgba(255,255,255,0.04)', color: 'rgba(37,211,102,0.6)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {buttons.slice(0, 2).map((b, i) => <span key={i} style={{ fontSize: 10 }}>{b.text}</span>)}
            {buttons.length > 2 && <span style={{ fontSize: 10, opacity: 0.4 }}>+{buttons.length - 2} more</span>}
          </div>
        )}
      </div>

      <button onClick={onUse} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px', borderRadius: 8, background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.25)', color: '#25d366', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(37,211,102,0.18)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(37,211,102,0.1)')}
      >
        <Plus size={11} /> Use in Campaign Builder
      </button>
    </div>
  );
}

// ─── A/B Test Modal ───────────────────────────────────────────────────────────

interface ABTestStats {
  total: number; sent: number; delivered: number; read: number;
  opened: number; clicked: number; failed: number; bounced: number;
  openRate: number; clickRate: number; deliveryRate: number;
}
interface ABTestData {
  test: { id: string; name: string; split_percent: number; status: string; winner_campaign_id?: string };
  variantA: Campaign; variantB: Campaign;
  statsA: ABTestStats | null; statsB: ABTestStats | null;
}

function ABCompareBar({ label, a, b, total }: { label: string; a: number; b: number; total: number; color?: string }) {
  const pctA = total > 0 ? Math.round((a / total) * 100) : 0;
  const pctB = total > 0 ? Math.round((b / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
        <span>{label}</span>
        <div style={{ display: 'flex', gap: 16 }}>
          <span style={{ color: '#818cf8' }}>{a} <span style={{ opacity: 0.5 }}>({pctA}%)</span></span>
          <span style={{ color: '#f59e0b' }}>{b} <span style={{ opacity: 0.5 }}>({pctB}%)</span></span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, height: 6, borderRadius: 4, overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
        <div style={{ width: `${pctA}%`, background: '#818cf8', transition: 'width 0.6s ease', borderRadius: 4 }} />
        <div style={{ width: `${pctB}%`, background: '#f59e0b', transition: 'width 0.6s ease', borderRadius: 4 }} />
      </div>
    </div>
  );
}

function ABTestModal({ testId, onClose, onWinnerDeclared }: { testId: string; onClose: () => void; onWinnerDeclared: () => void }) {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const { data, isLoading } = useQuery<ABTestData>({
    queryKey: ['ab-test', testId],
    queryFn: () => api.get(`/ab-tests/${testId}`).then(r => r.data),
  });

  const declareWinnerMutation = useMutation({
    mutationFn: (winnerId: string) => api.post(`/ab-tests/${testId}/declare-winner`, { winner_campaign_id: winnerId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      qc.invalidateQueries({ queryKey: ['ab-test', testId] });
      addToast('success', 'Winner declared!');
      onWinnerDeclared();
    },
    onError: () => addToast('error', 'Failed to declare winner.'),
  });

  const totalA = data?.statsA?.total ?? 0;
  const totalB = data?.statsB?.total ?? 0;
  const maxTotal = Math.max(totalA, totalB, 1);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass animate-slide-up" style={{ width: '100%', maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FlaskConical size={16} color="#818cf8" />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>A/B Test Results</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{data?.test?.name ?? '…'}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}><X size={17} /></button>
        </div>

        {isLoading ? (
          <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 40 }} />)}
          </div>
        ) : !data ? null : (
          <div style={{ padding: '22px 24px' }}>
            {/* Legend */}
            <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
              {[
                { label: `Variant A — ${data.variantA?.name}`, color: '#818cf8', pct: data.test.split_percent },
                { label: `Variant B — ${data.variantB?.name}`, color: '#f59e0b', pct: 100 - data.test.split_percent },
              ].map(({ label, color, pct }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                  {label} <span style={{ color: 'rgba(255,255,255,0.3)' }}>({pct}%)</span>
                  {data.test.winner_campaign_id === (color === '#818cf8' ? data.variantA?.id : data.variantB?.id) && (
                    <Trophy size={12} color="#fbbf24" />
                  )}
                </div>
              ))}
            </div>

            {/* Head-to-head stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'Audience', a: totalA, b: totalB },
                { label: 'Sent', a: (data.statsA?.sent ?? 0) + (data.statsA?.delivered ?? 0) + (data.statsA?.read ?? 0), b: (data.statsB?.sent ?? 0) + (data.statsB?.delivered ?? 0) + (data.statsB?.read ?? 0) },
                { label: 'Open Rate', a: data.statsA?.openRate ?? 0, b: data.statsB?.openRate ?? 0, isRate: true },
                { label: 'Click Rate', a: data.statsA?.clickRate ?? 0, b: data.statsB?.clickRate ?? 0, isRate: true },
              ].map(({ label, a, b, isRate }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#818cf8', letterSpacing: '-0.03em' }}>{isRate ? `${a}%` : a}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>A</div>
                    </div>
                    <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b', letterSpacing: '-0.03em' }}>{isRate ? `${b}%` : b}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>B</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Comparison bars */}
            <ABCompareBar label="Opens"  a={data.statsA?.opened ?? 0} b={data.statsB?.opened ?? 0} total={maxTotal} color="#818cf8" />
            <ABCompareBar label="Clicks" a={data.statsA?.clicked ?? 0} b={data.statsB?.clicked ?? 0} total={maxTotal} color="#38bdf8" />
            <ABCompareBar label="Failed" a={(data.statsA?.failed ?? 0) + (data.statsA?.bounced ?? 0)} b={(data.statsB?.failed ?? 0) + (data.statsB?.bounced ?? 0)} total={maxTotal} color="#f87171" />

            {/* Declare winner */}
            {data.test.status !== 'completed' && (
              <div style={{ display: 'flex', gap: 10, marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                  <Trophy size={12} color="#fbbf24" /> Declare the winning variant:
                </div>
                <button onClick={() => declareWinnerMutation.mutate(data.variantA.id)} disabled={declareWinnerMutation.isPending} style={{ padding: '7px 14px', borderRadius: 8, background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.3)', color: '#a5b4fc', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  Variant A wins
                </button>
                <button onClick={() => declareWinnerMutation.mutate(data.variantB.id)} disabled={declareWinnerMutation.isPending} style={{ padding: '7px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  Variant B wins
                </button>
              </div>
            )}
            {data.test.status === 'completed' && (
              <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)', fontSize: 12, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Trophy size={12} /> Test completed — winner declared.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── A/B Setup Modal ──────────────────────────────────────────────────────────

function ABSetupModal({ campaign, onClose, onCreated }: { campaign: Campaign; onClose: () => void; onCreated: () => void }) {
  const { addToast } = useToast();
  const [splitPercent, setSplitPercent] = useState(50);
  const [variantBBody, setVariantBBody] = useState(campaign.message_body ?? '');
  const [variantBSubject, setVariantBSubject] = useState(campaign.subject ?? '');
  const [variantBName, setVariantBName] = useState(`${campaign.name} — Variant B`);

  const setupMutation = useMutation({
    mutationFn: () => api.post(`/campaigns/${campaign.id}/ab-test`, {
      split_percent: splitPercent,
      variant_b: {
        name: variantBName,
        message_body: variantBBody || undefined,
        subject: variantBSubject || undefined,
      },
    }),
    onSuccess: () => {
      addToast('success', 'A/B test created. Launch when ready.');
      onCreated();
    },
    onError: (err: unknown) =>
      addToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create A/B test.'),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass animate-slide-up" style={{ width: '100%', maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FlaskConical size={16} color="#818cf8" />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Set Up A/B Test</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}><X size={17} /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Variant A (read-only) */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Variant A (original)</div>
            <div style={{ background: 'rgba(129,140,248,0.06)', border: '1px solid rgba(129,140,248,0.15)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{campaign.name}</div>
              {campaign.subject && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Subject: {campaign.subject}</div>}
              {campaign.message_body && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4, fontFamily: 'monospace' }}>
                  {campaign.message_body.replace(/<[^>]+>/g, '').slice(0, 100)}{campaign.message_body.length > 100 ? '…' : ''}
                </div>
              )}
            </div>
          </div>

          {/* Variant B */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Variant B (new)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <span className="chrome-label">Variant B Name</span>
                <input type="text" value={variantBName} onChange={e => setVariantBName(e.target.value)} className="input-glass" />
              </div>
              {campaign.channel === 'email' && (
                <div>
                  <span className="chrome-label">Subject Line</span>
                  <input type="text" value={variantBSubject} onChange={e => setVariantBSubject(e.target.value)} placeholder="Different subject to test…" className="input-glass" />
                </div>
              )}
              <div>
                <span className="chrome-label">Message Body</span>
                <textarea value={variantBBody} onChange={e => setVariantBBody(e.target.value)} rows={3} placeholder="Different message body to test…" className="input-glass" style={{ resize: 'none' }} />
              </div>
            </div>
          </div>

          {/* Split slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="chrome-label" style={{ marginBottom: 0 }}>Audience Split</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                <span style={{ color: '#818cf8', fontWeight: 600 }}>{splitPercent}% A</span>
                {' / '}
                <span style={{ color: '#f59e0b', fontWeight: 600 }}>{100 - splitPercent}% B</span>
              </span>
            </div>
            <div style={{ position: 'relative', height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 4 }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${splitPercent}%`, background: 'linear-gradient(90deg, #818cf8, #a5b4fc)', transition: 'width 0.1s' }} />
              <div style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: `${100 - splitPercent}%`, background: 'linear-gradient(90deg, #fbbf24, #f59e0b)' }} />
            </div>
            <input type="range" min={10} max={90} step={5} value={splitPercent} onChange={e => setSplitPercent(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#818cf8', cursor: 'pointer' }} />
          </div>

          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={onClose} className="btn-glass" style={{ flex: 1, padding: '11px', borderRadius: 9, fontSize: 13, fontWeight: 600 }}>Cancel</button>
            <button onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending} className="btn-chrome" style={{ flex: 1, padding: '11px', borderRadius: 9, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {setupMutation.isPending && <Loader2 size={13} className="animate-spin-slow" />}
              <FlaskConical size={13} /> Create A/B Test
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Campaigns() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toasts, addToast, dismissToast } = useToast();

  const [activeTab, setActiveTab] = useState<'campaigns' | 'templates'>('campaigns');
  const [showModal, setShowModal] = useState(false);
  const [analyticsId, setAnalyticsId] = useState<{ id: string; name: string } | null>(null);
  const [abSetupCampaign, setAbSetupCampaign] = useState<Campaign | null>(null);
  const [abTestId, setAbTestId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery<CampaignsResponse>({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/campaigns').then(r => r.data),
  });
  const campaigns: Campaign[] = data?.data ?? [];

  const { data: tmplData } = useQuery<CampaignsResponse>({
    queryKey: ['campaign-templates'],
    queryFn: () => api.get('/campaigns/templates').then(r => r.data),
    enabled: activeTab === 'templates',
  });
  const savedTemplates: Campaign[] = tmplData?.data ?? [];

  const { data: metaTemplatesData, isLoading: metaTemplatesLoading, refetch: refetchMetaTemplates } = useQuery({
    queryKey: ['wa-cloud-templates-campaigns'],
    queryFn: () => api.get('/whatsapp-cloud/templates', { params: { status: 'APPROVED' } }).then(r => r.data.data as MetaWaTemplate[]),
    enabled: activeTab === 'templates',
    staleTime: 120_000,
  });
  const metaTemplates: MetaWaTemplate[] = metaTemplatesData ?? [];

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
      setShowModal(false); setForm(defaultForm);
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); addToast('success', 'Campaign paused.'); },
    onError: () => addToast('error', 'Failed to pause.'),
  });

  const cloneMutation = useMutation({
    mutationFn: (id: string) => api.post(`/campaigns/${id}/clone`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      addToast('success', 'Campaign cloned as draft.');
    },
    onError: () => addToast('error', 'Failed to clone campaign.'),
  });

  const saveAsTemplateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/campaigns/${id}/save-as-template`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign-templates'] });
      addToast('success', 'Saved as template.');
    },
    onError: () => addToast('error', 'Failed to save template.'),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/campaigns/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign-templates'] });
      addToast('success', 'Template deleted.');
    },
    onError: () => addToast('error', 'Failed to delete template.'),
  });

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Name is required.';
    if (!form.channel) errors.channel = 'Channel is required.';
    if (!form.message_body.trim() && !form.template_name.trim()) {
      errors.message_body = 'Message Body or Template Name is required.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const payload: Record<string, unknown> = { name: form.name, channel: form.channel };
    if (form.description.trim()) payload.description = form.description;
    if (form.segment_id) payload.segment_id = form.segment_id;
    if (form.message_body.trim()) payload.message_body = form.message_body;
    if (form.template_name.trim()) payload.template_name = form.template_name;
    if (form.subject.trim()) payload.subject = form.subject;
    if (form.scheduled_at) payload.scheduled_at = form.scheduled_at;
    createMutation.mutate(payload);
  };

  const openWithTemplate = (t: BuiltinTemplate | Campaign) => {
    const isBuiltin = 'icon' in t;
    setForm({
      name: isBuiltin ? t.name : (t as Campaign).name,
      description: '',
      channel: t.channel,
      segment_id: '',
      message_body: t.message_body ?? '',
      template_name: (isBuiltin ? (t as BuiltinTemplate).template_name : (t as Campaign).template_name) ?? '',
      subject: t.subject ?? '',
      scheduled_at: '',
    });
    setFormErrors({});
    setShowModal(true);
  };

  const selectChannel = (ch: string) => setForm(p => ({ ...p, channel: p.channel === ch ? '' : ch }));

  const tabStyle = (active: boolean) => ({
    padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
    background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
    color: active ? '#fff' : 'rgba(255,255,255,0.35)',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ padding: '32px', minHeight: '100vh', background: '#06060f', position: 'relative' }}>
      <div className="aurora-bg" />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div className="animate-fade-in-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>Campaigns</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Manage your messaging campaigns</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-glass" onClick={() => navigate('/campaigns/builder')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
              <Mail size={14} /> Email Builder
            </button>
            <button className="btn-chrome" onClick={() => { setShowModal(true); setForm(defaultForm); setFormErrors({}); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, fontSize: 13 }}>
              <Plus size={15} /> New Campaign
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
          <button style={tabStyle(activeTab === 'campaigns')} onClick={() => setActiveTab('campaigns')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Megaphone size={13} /> Campaigns</span>
          </button>
          <button style={tabStyle(activeTab === 'templates')} onClick={() => setActiveTab('templates')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><LayoutTemplate size={13} /> Templates</span>
          </button>
        </div>

        {/* ── Campaigns Tab ── */}
        {activeTab === 'campaigns' && (
          <div className="glass animate-fade-in-up stagger-2" style={{ overflow: 'hidden' }}>
            {isLoading ? (
              <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 18, width: `${50+i*10}%` }} />)}
              </div>
            ) : campaigns.length === 0 ? (
              <div style={{ padding: '56px 24px', textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <Megaphone size={22} color="rgba(255,255,255,0.2)" />
                </div>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, margin: 0 }}>No campaigns yet. Create one or start from a template.</p>
              </div>
            ) : (
              <table className="glass-table">
                <thead>
                  <tr>
                    <th>Name</th><th>Channel</th><th>Status</th><th>Scheduled</th><th>Created</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map(c => {
                    const isABVariant = !!c.ab_test_id;
                    const isVariantA = c.ab_variant_label === 'A';
                    const isVariantB = c.ab_variant_label === 'B';
                    return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{c.name}</span>
                          {isVariantA && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(129,140,248,0.15)', color: '#818cf8', fontWeight: 800, letterSpacing: '0.06em' }}>A</span>}
                          {isVariantB && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 800, letterSpacing: '0.06em' }}>B</span>}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: channelColors[c.channel]?.bg ?? 'rgba(255,255,255,0.06)', color: channelColors[c.channel]?.text ?? 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {c.channel}
                        </span>
                      </td>
                      <td><StatusBadge status={c.status} /></td>
                      <td style={{ color: 'rgba(255,255,255,0.3)' }}>{c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString() : '—'}</td>
                      <td style={{ color: 'rgba(255,255,255,0.3)' }}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                          {['draft','scheduled','paused'].includes(c.status) && (
                            <button onClick={() => launchMutation.mutate(c.id)} disabled={launchMutation.isPending} style={{ padding: '5px 12px', borderRadius: 7, background: isVariantA ? 'rgba(129,140,248,0.1)' : 'rgba(34,197,94,0.08)', border: `1px solid ${isVariantA ? 'rgba(129,140,248,0.25)' : 'rgba(34,197,94,0.2)'}`, color: isVariantA ? '#a5b4fc' : '#4ade80', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                              {isVariantA ? <><FlaskConical size={10} /> Launch A/B</> : <><Play size={11} /> Launch</>}
                            </button>
                          )}
                          {/* Hide launch for Variant B — it's launched via Variant A */}
                          {isVariantB && ['draft','scheduled','paused'].includes(c.status) && null}
                          {c.status === 'running' && (
                            <button onClick={() => pauseMutation.mutate(c.id)} disabled={pauseMutation.isPending} style={{ padding: '5px 12px', borderRadius: 7, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                              <Pause size={11} /> Pause
                            </button>
                          )}
                          {!isABVariant && (
                            <button onClick={() => setAbSetupCampaign(c)} title="Set up A/B test" style={{ padding: '5px 8px', borderRadius: 7, background: 'rgba(129,140,248,0.06)', border: '1px solid rgba(129,140,248,0.15)', color: 'rgba(129,140,248,0.7)', cursor: 'pointer' }}>
                              <FlaskConical size={12} />
                            </button>
                          )}
                          {isABVariant && (
                            <button onClick={() => setAbTestId(c.ab_test_id!)} title="View A/B test results" style={{ padding: '5px 8px', borderRadius: 7, background: 'rgba(129,140,248,0.06)', border: '1px solid rgba(129,140,248,0.15)', color: 'rgba(129,140,248,0.7)', cursor: 'pointer' }}>
                              <FlaskConical size={12} />
                            </button>
                          )}
                          {!isVariantB && (
                            <button onClick={() => cloneMutation.mutate(c.id)} disabled={cloneMutation.isPending} title="Clone" style={{ padding: '5px 8px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}>
                              <Copy size={12} />
                            </button>
                          )}
                          <button onClick={() => saveAsTemplateMutation.mutate(c.id)} disabled={saveAsTemplateMutation.isPending} title="Save as template" style={{ padding: '5px 8px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}>
                            <Bookmark size={12} />
                          </button>
                          <button onClick={() => setAnalyticsId({ id: c.id, name: c.name })} title="View analytics" style={{ padding: '5px 8px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}>
                            <BarChart2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Templates Tab ── */}
        {activeTab === 'templates' && (
          <div className="animate-fade-in-up stagger-2">
            {/* Saved templates */}
            {savedTemplates.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>Saved Templates</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                  {savedTemplates.map(t => (
                    <TemplateCard
                      key={t.id}
                      name={t.name}
                      description={t.description ?? ''}
                      channel={t.channel}
                      messagePreview={t.message_body ?? t.template_name ?? ''}
                      isBuiltin={false}
                      onUse={() => openWithTemplate(t)}
                      onDelete={() => deleteTemplateMutation.mutate(t.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Meta WhatsApp Templates */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>WhatsApp Templates from Meta</div>
                  {metaTemplates.length > 0 && (
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: 'rgba(37,211,102,0.1)', color: '#25d366', fontWeight: 600 }}>{metaTemplates.length}</span>
                  )}
                </div>
                <button
                  onClick={() => refetchMetaTemplates()}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}
                >
                  <RefreshCw size={11} className={metaTemplatesLoading ? 'animate-spin-slow' : ''} /> Refresh
                </button>
              </div>
              {metaTemplatesLoading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                  {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 160, borderRadius: 12 }} />)}
                </div>
              ) : metaTemplates.length === 0 ? (
                <div style={{ padding: '28px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12 }}>
                  <MessageCircle size={22} color="rgba(37,211,102,0.3)" style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>No approved WhatsApp templates found.</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>Go to the WhatsApp page to add an account and sync templates from Meta.</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                  {metaTemplates.map(t => (
                    <MetaTemplateCard
                      key={t.id}
                      tpl={t}
                      onUse={() => navigate('/campaigns/builder', {
                        state: {
                          channel: 'whatsapp',
                          templateId: t.id,
                          templateName: t.name,
                          templateLanguage: t.language,
                          accountId: t.account_id,
                        },
                      })}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Built-in templates */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>Built-in Templates</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {BUILTIN_TEMPLATES.map(t => (
                  <TemplateCard
                    key={t.id}
                    name={t.name}
                    description={t.description}
                    channel={t.channel}
                    messagePreview={t.message_body ?? t.template_name ?? ''}
                    icon={t.icon}
                    isBuiltin
                    onUse={() => openWithTemplate(t)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── Create Campaign Modal ── */}
      {showModal && (
        <div className="modal-overlay">
          <div className="glass animate-slide-up" style={{ width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>New Campaign</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}><X size={17} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <Label>Name *</Label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Campaign name" className="input-glass" />
                {formErrors.name && <p style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{formErrors.name}</p>}
              </div>
              <div>
                <Label>Channel *</Label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {CHANNELS.map(ch => (
                    <button key={ch} type="button" onClick={() => selectChannel(ch)} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', border: form.channel === ch ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.08)', background: form.channel === ch ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)', color: form.channel === ch ? '#fff' : 'rgba(255,255,255,0.35)', transition: 'all 0.15s', boxShadow: form.channel === ch ? 'inset 0 1px 0 rgba(255,255,255,0.15)' : 'none' }}>
                      {ch}
                    </button>
                  ))}
                </div>
                {formErrors.channel && <p style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{formErrors.channel}</p>}
              </div>
              <div>
                <Label>Description</Label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Optional description" className="input-glass" style={{ resize: 'none' }} />
              </div>
              <div>
                <Label>Segment</Label>
                <select value={form.segment_id} onChange={e => setForm(p => ({ ...p, segment_id: e.target.value }))} className="select-glass">
                  <option value="">All Contacts</option>
                  {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Message Body</Label>
                <textarea value={form.message_body} onChange={e => setForm(p => ({ ...p, message_body: e.target.value }))} rows={3} placeholder="Enter message body. Use {{name}}, {{email}}, etc. for personalisation." className="input-glass" style={{ resize: 'none' }} />
                {formErrors.message_body && <p style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{formErrors.message_body}</p>}
              </div>
              {form.channel === 'whatsapp' && (
                <div>
                  <Label>WhatsApp Template Name</Label>
                  <input type="text" value={form.template_name} onChange={e => setForm(p => ({ ...p, template_name: e.target.value }))} placeholder="e.g. order_confirmation" className="input-glass" />
                </div>
              )}
              {form.channel === 'email' && (
                <div>
                  <Label>Subject</Label>
                  <input type="text" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="Email subject line" className="input-glass" />
                </div>
              )}
              <div>
                <Label>Schedule At (optional)</Label>
                <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(p => ({ ...p, scheduled_at: e.target.value }))} className="input-glass" style={{ colorScheme: 'dark' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn-glass" style={{ flex: 1, padding: '11px', borderRadius: 9, fontSize: 13, fontWeight: 600 }}>Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="btn-chrome" style={{ flex: 1, padding: '11px', borderRadius: 9, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {createMutation.isPending && <Loader2 size={13} className="animate-spin-slow" />} Create Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {analyticsId && (
        <AnalyticsModal campaignId={analyticsId.id} campaignName={analyticsId.name} onClose={() => setAnalyticsId(null)} />
      )}

      {abSetupCampaign && (
        <ABSetupModal
          campaign={abSetupCampaign}
          onClose={() => setAbSetupCampaign(null)}
          onCreated={() => { setAbSetupCampaign(null); qc.invalidateQueries({ queryKey: ['campaigns'] }); }}
        />
      )}

      {abTestId && (
        <ABTestModal
          testId={abTestId}
          onClose={() => setAbTestId(null)}
          onWinnerDeclared={() => setAbTestId(null)}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
