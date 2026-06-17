import { useQuery } from '@tanstack/react-query';
import { BarChart2, Globe, MessageCircle, Phone, Upload, MousePointer, User } from 'lucide-react';
import api from '../lib/api';

interface SourceSummary { source_type: string; count: number; }
interface AttributionEvent {
  id: string;
  source_type: string;
  source_name?: string;
  channel?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  occurred_at: string;
  contact_id: string;
}

const SOURCE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  form:             { label: 'Form',              color: '#6366f1', icon: <Globe size={13} /> },
  whatsapp_inbound: { label: 'WhatsApp Inbound',  color: '#22c55e', icon: <MessageCircle size={13} /> },
  sms_inbound:      { label: 'SMS Inbound',       color: '#60a5fa', icon: <Phone size={13} /> },
  manual:           { label: 'Manual',            color: '#f59e0b', icon: <User size={13} /> },
  import:           { label: 'CSV Import',        color: '#a78bfa', icon: <Upload size={13} /> },
  campaign:         { label: 'Campaign',          color: '#f97316', icon: <MousePointer size={13} /> },
  api:              { label: 'API',               color: '#94a3b8', icon: <Globe size={13} /> },
};

function sourceMeta(type: string) {
  return SOURCE_META[type] ?? { label: type, color: 'rgba(255,255,255,0.4)', icon: <Globe size={13} /> };
}

function SourceBar({ item, max }: { item: SourceSummary; max: number }) {
  const meta = sourceMeta(item.source_type);
  const pct  = max > 0 ? (item.count / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, width: 170, flexShrink: 0 }}>
        <span style={{ color: meta.color }}>{meta.icon}</span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{meta.label}</span>
      </div>
      <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: meta.color, borderRadius: 6, transition: 'width 0.6s ease' }} />
      </div>
      <div style={{ width: 36, textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#fff' }}>{item.count}</div>
    </div>
  );
}

export default function AttributionPage() {
  const { data: summaryData, isLoading: sumLoading } = useQuery<{ data: SourceSummary[] }>({
    queryKey: ['attribution-summary'],
    queryFn: () => api.get('/contacts/attribution/summary').then(r => r.data),
  });

  const { data: recentData, isLoading: recentLoading } = useQuery<{ data: AttributionEvent[] }>({
    queryKey: ['attribution-recent'],
    queryFn: () => api.get('/contacts', { params: { limit: 50 } }).then(async r => {
      // Fetch recent contacts' attribution inline for a "recent activity" feed
      const contacts = r.data?.data ?? [];
      const events: AttributionEvent[] = contacts
        .filter((c: { first_touch_source?: string; first_touch_at?: string }) => c.first_touch_source)
        .slice(0, 20)
        .map((c: { id: string; first_touch_source: string; first_touch_at: string; source?: string }) => ({
          id: c.id,
          source_type: c.first_touch_source,
          occurred_at: c.first_touch_at,
          contact_id: c.id,
        }));
      return { data: events };
    }),
  });

  const summary = summaryData?.data ?? [];
  const recent  = recentData?.data ?? [];
  const total   = summary.reduce((s, r) => s + r.count, 0);
  const max     = summary[0]?.count ?? 1;

  return (
    <div style={{ padding: '32px', minHeight: '100vh', background: '#06060f', position: 'relative' }}>
      <div className="aurora-bg" />
      <div style={{ position: 'relative', zIndex: 1 }}>

        <div className="animate-fade-in-up" style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>Attribution</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Where your contacts come from</p>
        </div>

        <div className="animate-fade-in-up stagger-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 1000 }}>

          {/* Source breakdown */}
          <div className="glass" style={{ borderRadius: 16, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BarChart2 size={14} color="#818cf8" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Contact Sources</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{total} contacts tracked</div>
              </div>
            </div>

            {sumLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 16, width: `${60 + i * 8}%` }} />)}
              </div>
            ) : summary.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
                No attribution data yet. Create contacts or set up forms to start tracking.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {summary.map(item => <SourceBar key={item.source_type} item={item} max={max} />)}
              </div>
            )}
          </div>

          {/* Pie-style summary cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="glass" style={{ borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Breakdown</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {summary.map(item => {
                  const meta = sourceMeta(item.source_type);
                  const pct  = total > 0 ? Math.round((item.count / total) * 100) : 0;
                  return (
                    <div key={item.source_type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{meta.label}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="glass" style={{ borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>How it works</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['Form submit', 'Tracks UTM params + form name'],
                  ['WhatsApp inbound', 'First message from a new contact'],
                  ['Manual / CSV import', 'Created in the app or via import'],
                ].map(([title, desc]) => (
                  <div key={title}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{title}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent first-touch events */}
        {!recentLoading && recent.length > 0 && (
          <div className="glass animate-fade-in-up stagger-2" style={{ marginTop: 20, borderRadius: 16, padding: 24, maxWidth: 1000 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 16 }}>Recent First-Touch Events</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recent.map(ev => {
                const meta = sourceMeta(ev.source_type);
                return (
                  <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: meta.color, flexShrink: 0 }}>{meta.icon}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', flex: 1 }}>
                      New contact via <span style={{ color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                      {ev.source_name && <span style={{ color: 'rgba(255,255,255,0.3)' }}> — {ev.source_name}</span>}
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>
                      {new Date(ev.occurred_at).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
