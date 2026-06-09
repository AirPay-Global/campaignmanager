import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Megaphone, MessageSquare, TrendingUp, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../lib/api';

interface Campaign { id: string; name: string; status: string; channel?: string; created_at: string; }
interface CampaignsResponse { data: Campaign[]; total?: number; }
interface ContactsResponse { data: { id: string }[]; total?: number; }
interface DashboardStats {
  activeCampaigns: number;
  sentToday: number;
  totalMessages30d: number;
  delivered: number;
  failed: number;
  deliveryRate: number;
}

function useCountUp(target: number, duration = 1400) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

const statColors = [
  { from: 'rgba(99,102,241,0.2)',  to: 'rgba(99,102,241,0.04)',  border: 'rgba(99,102,241,0.3)',  icon: 'rgba(99,102,241,0.9)'  },
  { from: 'rgba(168,85,247,0.2)',  to: 'rgba(168,85,247,0.04)',  border: 'rgba(168,85,247,0.3)',  icon: 'rgba(168,85,247,0.9)'  },
  { from: 'rgba(34,197,94,0.15)',  to: 'rgba(34,197,94,0.03)',   border: 'rgba(34,197,94,0.25)',  icon: 'rgba(34,197,94,0.9)'   },
  { from: 'rgba(20,184,166,0.15)', to: 'rgba(20,184,166,0.03)',  border: 'rgba(20,184,166,0.25)', icon: 'rgba(20,184,166,0.9)'  },
  { from: 'rgba(56,189,248,0.15)', to: 'rgba(56,189,248,0.03)',  border: 'rgba(56,189,248,0.25)', icon: 'rgba(56,189,248,0.9)'  },
  { from: 'rgba(239,68,68,0.12)',  to: 'rgba(239,68,68,0.02)',   border: 'rgba(239,68,68,0.2)',   icon: 'rgba(239,68,68,0.85)'  },
];

function StatCard({ title, value, icon: Icon, colorIdx, delay = 0 }: { title: string; value: number | string; icon: React.ElementType; colorIdx: number; delay?: number }) {
  const numVal = typeof value === 'number' ? value : 0;
  const counted = useCountUp(numVal);
  const display = typeof value === 'string' ? value : counted;
  const c = statColors[colorIdx];
  return (
    <div className="glass animate-fade-in-up" style={{ padding: 24, animationDelay: `${delay}ms`, background: `linear-gradient(135deg, ${c.from} 0%, ${c.to} 100%)`, borderColor: c.border }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)' }}>
          <Icon size={17} color={c.icon} />
        </div>
      </div>
      <div className="animate-count-up" style={{ fontSize: 38, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 6 }}>
        {display}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500 }}>{title}</div>
    </div>
  );
}

const statusMap: Record<string, { bg: string; dot: string; text: string }> = {
  draft:     { bg: 'rgba(255,255,255,0.04)', dot: 'rgba(255,255,255,0.2)', text: 'rgba(255,255,255,0.4)' },
  running:   { bg: 'rgba(34,197,94,0.1)',    dot: '#22c55e',               text: '#4ade80'               },
  active:    { bg: 'rgba(34,197,94,0.1)',    dot: '#22c55e',               text: '#4ade80'               },
  scheduled: { bg: 'rgba(99,102,241,0.1)',   dot: '#818cf8',               text: '#a5b4fc'               },
  paused:    { bg: 'rgba(245,158,11,0.1)',   dot: '#f59e0b',               text: '#fbbf24'               },
  completed: { bg: 'rgba(168,85,247,0.1)',   dot: '#a855f7',               text: '#c084fc'               },
  failed:    { bg: 'rgba(239,68,68,0.1)',    dot: '#ef4444',               text: '#f87171'               },
};

function StatusBadge({ status }: { status: string }) {
  const s = statusMap[status] ?? statusMap.draft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, background: s.bg, border: `1px solid ${s.dot}20`, fontSize: 12, fontWeight: 600, color: s.text }}>
      <span className="status-dot" style={{ background: s.dot }} />{status}
    </span>
  );
}

export default function Dashboard() {
  const { data: statsData } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/campaigns/stats').then(r => r.data),
    refetchInterval: 30_000,
  });
  const { data: campsData, isLoading: campsLoading } = useQuery<CampaignsResponse>({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/campaigns').then(r => r.data),
  });
  const { data: contsData } = useQuery<ContactsResponse>({
    queryKey: ['contacts'],
    queryFn: () => api.get('/contacts').then(r => r.data),
  });

  const campaigns = campsData?.data ?? [];
  const totalContacts = contsData?.total ?? (contsData?.data?.length ?? 0);
  const stats = statsData;

  return (
    <div style={{ padding: '32px', minHeight: '100vh', background: '#06060f', position: 'relative' }}>
      <div className="aurora-bg" />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="animate-fade-in-up" style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px,1fr))', gap: 16, marginBottom: 28 }}>
          <StatCard title="Total Contacts"    value={totalContacts}                    icon={Users}         colorIdx={0} delay={0}   />
          <StatCard title="Active Campaigns"  value={stats?.activeCampaigns ?? 0}      icon={Megaphone}     colorIdx={1} delay={60}  />
          <StatCard title="Sent Today"        value={stats?.sentToday ?? 0}            icon={MessageSquare} colorIdx={2} delay={120} />
          <StatCard title="Delivery Rate"     value={`${stats?.deliveryRate ?? 0}%`}   icon={TrendingUp}    colorIdx={3} delay={180} />
          <StatCard title="Delivered (30d)"   value={stats?.delivered ?? 0}            icon={CheckCircle2}  colorIdx={4} delay={240} />
          <StatCard title="Failed (30d)"      value={stats?.failed ?? 0}               icon={AlertCircle}   colorIdx={5} delay={300} />
        </div>

        <div className="glass animate-fade-in-up stagger-4" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Recent Campaigns</span>
            <a href="/campaigns" style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', textDecoration: 'none', letterSpacing: '0.04em' }}>View all →</a>
          </div>
          {campsLoading ? (
            <div style={{ padding: 36, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 18, width: `${55 + i * 10}%` }} />)}
            </div>
          ) : campaigns.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <Megaphone size={28} color="rgba(255,255,255,0.1)" style={{ margin: '0 auto 12px' }} />
              <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>No campaigns yet. <a href="/campaigns" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>Create one →</a></p>
            </div>
          ) : (
            <table className="glass-table">
              <thead><tr><th>Name</th><th>Channel</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {campaigns.slice(0, 8).map(c => (
                  <tr key={c.id}>
                    <td style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{c.name}</td>
                    <td><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.channel ?? '—'}</span></td>
                    <td><StatusBadge status={c.status} /></td>
                    <td style={{ color: 'rgba(255,255,255,0.3)' }}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
