import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Megaphone, MessageSquare, TrendingUp, Activity } from 'lucide-react';
import api from '../lib/api';

interface Campaign { id: string; name: string; status: string; channel?: string; created_at: string; }
interface CampaignsResponse { data: Campaign[]; total?: number; }
interface ContactsResponse { data: { id: string }[]; total?: number; }
interface MessagesResponse { data: { id: string; status: string; created_at: string }[]; total?: number; }

function useCountUp(target: number, duration = 1200) {
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

function StatCard({ title, value, icon: Icon, color, delay = 0 }: {
  title: string; value: number | string; icon: React.ElementType; color: string; delay?: number;
}) {
  const numVal = typeof value === 'number' ? value : 0;
  const displayNum = useCountUp(numVal);
  const display = typeof value === 'string' ? value : displayNum;

  return (
    <div className="card animate-fade-in-up" style={{
      padding: 24, animationDelay: `${delay}ms`, opacity: 0,
      position: 'relative', overflow: 'hidden',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#3d3d3d'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 20px rgba(255,102,0,0.08)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#2a2a2a'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
    >
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:color, opacity:0.6 }} />
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:11, color:'#555', letterSpacing:'0.08em', textTransform:'uppercase', fontWeight:600, marginBottom:8 }}>{title}</div>
          <div className="animate-count-up" style={{ fontSize:36, fontWeight:800, color:'#fff', letterSpacing:'-0.03em', lineHeight:1 }}>
            {display}
          </div>
        </div>
        <div style={{ width:40, height:40, borderRadius:10, background:`${color}18`, border:`1px solid ${color}30`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon size={18} color={color} />
        </div>
      </div>
    </div>
  );
}

const statusColors: Record<string, { bg: string; dot: string; text: string }> = {
  draft:     { bg: 'rgba(68,68,68,0.3)',   dot: '#666',    text: '#888' },
  running:   { bg: 'rgba(34,197,94,0.1)',  dot: '#22c55e', text: '#4ade80' },
  active:    { bg: 'rgba(34,197,94,0.1)',  dot: '#22c55e', text: '#4ade80' },
  scheduled: { bg: 'rgba(59,130,246,0.1)', dot: '#3b82f6', text: '#60a5fa' },
  paused:    { bg: 'rgba(245,158,11,0.1)', dot: '#f59e0b', text: '#fbbf24' },
  completed: { bg: 'rgba(139,92,246,0.1)', dot: '#8b5cf6', text: '#a78bfa' },
  failed:    { bg: 'rgba(239,68,68,0.1)',  dot: '#ef4444', text: '#f87171' },
};

function StatusBadge({ status }: { status: string }) {
  const s = statusColors[status] ?? statusColors.draft;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'3px 10px', borderRadius:20, background:s.bg, fontSize:12, fontWeight:600, color:s.text }}>
      <span className="status-dot" style={{ background: s.dot, width:5, height:5, borderRadius:'50%' }} />
      {status}
    </span>
  );
}

export default function Dashboard() {
  const today = new Date().toISOString().split('T')[0];

  const { data: msgsData, isLoading: msgsLoading } = useQuery<MessagesResponse>({
    queryKey: ['messages-outbound'],
    queryFn: () => api.get('/messages/outbound?limit=1000').then(r => r.data),
  });
  const { data: campsData, isLoading: campsLoading } = useQuery<CampaignsResponse>({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/campaigns').then(r => r.data),
  });
  const { data: contsData } = useQuery<ContactsResponse>({
    queryKey: ['contacts'],
    queryFn: () => api.get('/contacts').then(r => r.data),
  });

  const messages = msgsData?.data ?? [];
  const campaigns = campsData?.data ?? [];
  const totalContacts = contsData?.total ?? (contsData?.data?.length ?? 0);
  const activeCampaigns = campaigns.filter(c => ['running','active'].includes(c.status)).length;
  const sentToday = messages.filter(m => m.created_at?.split('T')[0] === today).length;
  const delivered = messages.filter(m => m.status === 'delivered').length;
  const deliveryRate = messages.length > 0 ? Math.round((delivered / messages.length) * 100) : 0;

  return (
    <div style={{ padding: '32px 32px', minHeight: '100vh', background: '#0a0a0a' }}>
      {/* Header */}
      <div className="animate-fade-in-up" style={{ marginBottom: 32 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
          <Activity size={16} color="#ff6600" />
          <span style={{ fontSize:11, color:'#ff6600', letterSpacing:'0.1em', textTransform:'uppercase', fontWeight:600 }}>Live Overview</span>
        </div>
        <h1 style={{ fontSize:28, fontWeight:800, color:'#fff', letterSpacing:'-0.03em', margin:0 }}>Dashboard</h1>
        <p style={{ fontSize:13, color:'#555', marginTop:4 }}>
          {new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
        </p>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:16, marginBottom:32 }}>
        <StatCard title="Total Contacts"      value={totalContacts}    icon={Users}         color="#3b82f6" delay={0}   />
        <StatCard title="Active Campaigns"    value={activeCampaigns}  icon={Megaphone}     color="#ff6600" delay={50}  />
        <StatCard title="Messages Sent Today" value={sentToday}        icon={MessageSquare} color="#22c55e" delay={100} />
        <StatCard title="Delivery Rate"       value={`${deliveryRate}%`} icon={TrendingUp}  color="#8b5cf6" delay={150} />
      </div>

      {/* Recent Campaigns Table */}
      <div className="card animate-fade-in-up stagger-3" style={{ overflow:'hidden' }}>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #1e1e1e', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:14, fontWeight:700, color:'#fff' }}>Recent Campaigns</span>
          <a href="/campaigns" style={{ fontSize:12, color:'#ff6600', textDecoration:'none', letterSpacing:'0.05em' }}>View all →</a>
        </div>

        {campsLoading ? (
          <div style={{ padding:40, display:'flex', flexDirection:'column', gap:12 }}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height:20, borderRadius:4, width:`${60+i*10}%` }} />)}
          </div>
        ) : campaigns.length === 0 ? (
          <div style={{ padding:'48px 24px', textAlign:'center' }}>
            <Megaphone size={32} color="#333" style={{ margin:'0 auto 12px' }} />
            <p style={{ color:'#444', fontSize:14 }}>No campaigns yet. <a href="/campaigns" style={{ color:'#ff6600', textDecoration:'none' }}>Create your first →</a></p>
          </div>
        ) : (
          <table className="dark-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.slice(0, 8).map(c => (
                <tr key={c.id}>
                  <td style={{ color:'#e5e5e5', fontWeight:500 }}>{c.name}</td>
                  <td><span style={{ fontSize:11, padding:'2px 8px', borderRadius:4, background:'rgba(255,102,0,0.08)', color:'#ff8833', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>{c.channel ?? '—'}</span></td>
                  <td><StatusBadge status={c.status} /></td>
                  <td style={{ color:'#555' }}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {msgsLoading && <div style={{ display:'none' }} aria-live="polite">Loading…</div>}
    </div>
  );
}
