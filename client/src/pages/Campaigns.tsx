import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, Pause, BarChart2, Loader2, X, Megaphone } from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

interface Campaign { id: string; name: string; description?: string; type: string; status: string; channels: string[]; schedule_at?: string; created_at: string; }
interface CampaignsResponse { data: Campaign[]; total?: number; }
interface FormState { name: string; description: string; type: string; channels: string[]; schedule_at: string; }

const CAMPAIGN_TYPES = [
  { value: 'outbound_blast', label: 'Outbound Blast' },
  { value: 'drip', label: 'Drip' },
  { value: 'trigger_based', label: 'Trigger Based' },
  { value: 'scheduled', label: 'Scheduled' },
];
const CHANNELS = ['whatsapp', 'sms', 'email'];
const defaultForm: FormState = { name:'', description:'', type:'outbound_blast', channels:[], schedule_at:'' };

const statusMap: Record<string, { bg:string; dot:string; text:string }> = {
  draft:     { bg:'rgba(68,68,68,0.3)',    dot:'#666',    text:'#888'    },
  running:   { bg:'rgba(34,197,94,0.1)',   dot:'#22c55e', text:'#4ade80' },
  active:    { bg:'rgba(34,197,94,0.1)',   dot:'#22c55e', text:'#4ade80' },
  scheduled: { bg:'rgba(59,130,246,0.1)',  dot:'#3b82f6', text:'#60a5fa' },
  paused:    { bg:'rgba(245,158,11,0.1)',  dot:'#f59e0b', text:'#fbbf24' },
  completed: { bg:'rgba(139,92,246,0.1)',  dot:'#8b5cf6', text:'#a78bfa' },
  failed:    { bg:'rgba(239,68,68,0.1)',   dot:'#ef4444', text:'#f87171' },
};

function StatusBadge({ status }: { status: string }) {
  const s = statusMap[status] ?? statusMap.draft;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'3px 10px', borderRadius:20, background:s.bg, fontSize:12, fontWeight:600, color:s.text }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:s.dot, flexShrink:0 }} />
      {status}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display:'block', fontSize:11, color:'#666', marginBottom:6, letterSpacing:'0.07em', textTransform:'uppercase' as const, fontWeight:600 }}>{children}</label>;
}

export default function Campaigns() {
  const qc = useQueryClient();
  const { toasts, addToast, dismissToast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery<CampaignsResponse>({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/campaigns').then(r => r.data),
  });
  const campaigns: Campaign[] = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (p: Partial<FormState>) => api.post('/campaigns', p),
    onSuccess: () => { qc.invalidateQueries({ queryKey:['campaigns'] }); addToast('success','Campaign created.'); setShowModal(false); setForm(defaultForm); },
    onError: (err: unknown) => addToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create campaign.'),
  });
  const launchMutation = useMutation({
    mutationFn: (id: string) => api.post(`/campaigns/${id}/launch`),
    onSuccess: () => { qc.invalidateQueries({ queryKey:['campaigns'] }); addToast('success','Campaign launched.'); },
    onError: () => addToast('error','Failed to launch.'),
  });
  const pauseMutation = useMutation({
    mutationFn: (id: string) => api.post(`/campaigns/${id}/pause`),
    onSuccess: () => { qc.invalidateQueries({ queryKey:['campaigns'] }); addToast('success','Campaign paused.'); },
    onError: () => addToast('error','Failed to pause.'),
  });

  const validate = () => {
    const errors: Record<string,string> = {};
    if (!form.name.trim()) errors.name = 'Name is required.';
    if (form.channels.length === 0) errors.channels = 'Select at least one channel.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const payload: Record<string,unknown> = { name:form.name, description:form.description, type:form.type, channels:form.channels };
    if (form.schedule_at) payload.schedule_at = form.schedule_at;
    createMutation.mutate(payload as Partial<FormState>);
  };

  const toggleChannel = (ch: string) => setForm(p => ({ ...p, channels: p.channels.includes(ch) ? p.channels.filter(c=>c!==ch) : [...p.channels, ch] }));

  return (
    <div style={{ padding:'32px', minHeight:'100vh', background:'#0a0a0a' }}>
      <div className="animate-fade-in-up" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28 }}>
        <div>
          <h1 style={{ fontSize:28, fontWeight:800, color:'#fff', letterSpacing:'-0.03em', margin:0 }}>Campaigns</h1>
          <p style={{ fontSize:13, color:'#555', marginTop:4 }}>Manage your messaging campaigns</p>
        </div>
        <button className="btn-orange" onClick={() => { setShowModal(true); setForm(defaultForm); setFormErrors({}); }}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 18px', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>
          <Plus size={15} /> New Campaign
        </button>
      </div>

      <div className="card animate-fade-in-up stagger-2" style={{ overflow:'hidden' }}>
        {isLoading ? (
          <div style={{ padding:40, display:'flex', flexDirection:'column', gap:14 }}>
            {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height:18, borderRadius:4, width:`${50+i*10}%` }} />)}
          </div>
        ) : campaigns.length === 0 ? (
          <div style={{ padding:'56px 24px', textAlign:'center' }}>
            <div style={{ width:56, height:56, borderRadius:12, background:'rgba(255,102,0,0.08)', border:'1px solid rgba(255,102,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <Megaphone size={24} color="#ff6600" />
            </div>
            <p style={{ color:'#555', fontSize:14, margin:0 }}>No campaigns yet.</p>
            <p style={{ color:'#333', fontSize:13, marginTop:4 }}>Create your first campaign to start messaging.</p>
          </div>
        ) : (
          <table className="dark-table">
            <thead><tr>
              <th>Name</th><th>Type</th><th>Status</th><th>Channels</th><th>Created</th><th style={{ textAlign:'right' }}>Actions</th>
            </tr></thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id}>
                  <td style={{ color:'#e5e5e5', fontWeight:500 }}>{c.name}</td>
                  <td style={{ color:'#666', fontSize:12 }}>{c.type?.replace(/_/g,' ')}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td>
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                      {(c.channels??[]).map(ch => (
                        <span key={ch} style={{ fontSize:11, padding:'2px 7px', borderRadius:4, background:'rgba(255,102,0,0.08)', color:'#ff8833', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>{ch}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ color:'#555' }}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }}>
                      {['draft','paused'].includes(c.status) && (
                        <button onClick={() => launchMutation.mutate(c.id)} disabled={launchMutation.isPending}
                          style={{ padding:'5px 10px', borderRadius:6, background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)', color:'#4ade80', cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontSize:12 }}>
                          <Play size={12} /> Launch
                        </button>
                      )}
                      {c.status === 'active' && (
                        <button onClick={() => pauseMutation.mutate(c.id)} disabled={pauseMutation.isPending}
                          style={{ padding:'5px 10px', borderRadius:6, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.2)', color:'#fbbf24', cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontSize:12 }}>
                          <Pause size={12} /> Pause
                        </button>
                      )}
                      <button style={{ padding:'5px', borderRadius:6, background:'transparent', border:'1px solid #1e1e1e', color:'#555', cursor:'pointer' }}>
                        <BarChart2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="animate-slide-up" style={{ background:'#111', border:'1px solid #2a2a2a', borderRadius:16, width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto', overflow:'hidden' }}>
            <div className="orange-line" />
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 24px', borderBottom:'1px solid #1e1e1e' }}>
              <span style={{ fontSize:15, fontWeight:700, color:'#fff' }}>New Campaign</span>
              <button onClick={() => setShowModal(false)} style={{ background:'none', border:'none', color:'#555', cursor:'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <Label>Name *</Label>
                <input type="text" value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} placeholder="Campaign name" className="input-dark" />
                {formErrors.name && <p style={{ color:'#f87171', fontSize:12, marginTop:4 }}>{formErrors.name}</p>}
              </div>
              <div>
                <Label>Description</Label>
                <textarea value={form.description} onChange={e => setForm(p=>({...p,description:e.target.value}))} rows={2} placeholder="Optional description" className="input-dark" style={{ resize:'none' }} />
              </div>
              <div>
                <Label>Campaign Type</Label>
                <select value={form.type} onChange={e => setForm(p=>({...p,type:e.target.value}))} className="select-dark">
                  {CAMPAIGN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <Label>Channels *</Label>
                <div style={{ display:'flex', gap:8 }}>
                  {CHANNELS.map(ch => (
                    <button key={ch} type="button" onClick={() => toggleChannel(ch)} style={{
                      padding:'6px 14px', borderRadius:6, fontSize:12, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', cursor:'pointer',
                      border: form.channels.includes(ch) ? '1px solid #ff6600' : '1px solid #2a2a2a',
                      background: form.channels.includes(ch) ? 'rgba(255,102,0,0.12)' : 'transparent',
                      color: form.channels.includes(ch) ? '#ff8833' : '#555',
                      transition:'all 0.15s',
                    }}>{ch}</button>
                  ))}
                </div>
                {formErrors.channels && <p style={{ color:'#f87171', fontSize:12, marginTop:4 }}>{formErrors.channels}</p>}
              </div>
              <div>
                <Label>Schedule At (optional)</Label>
                <input type="datetime-local" value={form.schedule_at} onChange={e => setForm(p=>({...p,schedule_at:e.target.value}))} className="input-dark" style={{ colorScheme:'dark' }} />
              </div>
              <div style={{ display:'flex', gap:10, paddingTop:4 }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost" style={{ flex:1, padding:'10px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="btn-orange" style={{ flex:1, padding:'10px', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  {createMutation.isPending && <Loader2 size={14} className="animate-spin-slow" />}
                  Create Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
