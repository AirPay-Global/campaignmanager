import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, X, Shield } from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

interface Mandate { id: string; name: string; channels: string[]; trigger_type: string; action: string; priority: number; enabled: boolean; created_at: string; }
interface MandatesResponse { data: Mandate[]; total?: number; }
interface FormState { name: string; channels: string[]; trigger_type: string; trigger_keywords: string; trigger_pattern: string; action: string; response_whatsapp_body: string; response_sms: string; escalate_to: string; priority: number; }

const CHANNELS = ['whatsapp', 'sms', 'email'];
const TRIGGER_TYPES = [
  { value:'keyword', label:'Keyword' },
  { value:'regex', label:'Regex' },
  { value:'contains', label:'Contains' },
  { value:'always', label:'Always' },
  { value:'no_match', label:'No Match' },
];
const ACTIONS = [
  { value:'auto_respond', label:'Auto Respond' },
  { value:'escalate', label:'Escalate' },
  { value:'queue_for_review', label:'Queue for Review' },
  { value:'webhook_call', label:'Webhook Call' },
  { value:'tag_contact', label:'Tag Contact' },
];
const defaultForm: FormState = { name:'', channels:[], trigger_type:'keyword', trigger_keywords:'', trigger_pattern:'', action:'auto_respond', response_whatsapp_body:'', response_sms:'', escalate_to:'', priority:0 };

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display:'block', fontSize:11, color:'#666', marginBottom:6, letterSpacing:'0.07em', textTransform:'uppercase' as const, fontWeight:600 }}>{children}</label>;
}

export default function Mandates() {
  const qc = useQueryClient();
  const { toasts, addToast, dismissToast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormState,string>>>({});

  const { data, isLoading } = useQuery<MandatesResponse>({
    queryKey: ['mandates'],
    queryFn: () => api.get('/mandates').then(r => r.data),
  });
  const mandates: Mandate[] = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (p: Record<string,unknown>) => api.post('/mandates', p),
    onSuccess: () => { qc.invalidateQueries({ queryKey:['mandates'] }); addToast('success','Mandate created.'); setShowModal(false); setForm(defaultForm); },
    onError: (err: unknown) => addToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create mandate.'),
  });
  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id:string; enabled:boolean }) => api.put(`/mandates/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey:['mandates'] }),
    onError: () => addToast('error','Failed to update mandate.'),
  });

  const validate = () => {
    const errors: Partial<Record<keyof FormState,string>> = {};
    if (!form.name.trim()) errors.name = 'Name is required.';
    if (form.channels.length === 0) errors.channels = 'Select at least one channel.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const payload: Record<string,unknown> = { name:form.name, channels:form.channels, trigger_type:form.trigger_type, action:form.action, priority:form.priority };
    if (form.trigger_type === 'keyword' && form.trigger_keywords) payload.trigger_keywords = form.trigger_keywords.split(',').map(k=>k.trim()).filter(Boolean);
    if (['regex','contains'].includes(form.trigger_type) && form.trigger_pattern) payload.trigger_pattern = form.trigger_pattern;
    if (form.action === 'auto_respond') {
      if (form.response_whatsapp_body) payload.response_whatsapp_body = form.response_whatsapp_body;
      if (form.response_sms) payload.response_sms = form.response_sms;
    }
    if (form.action === 'escalate' && form.escalate_to) payload.escalate_to = form.escalate_to;
    createMutation.mutate(payload);
  };

  const toggleChannel = (ch: string) => setForm(p => ({ ...p, channels: p.channels.includes(ch) ? p.channels.filter(c=>c!==ch) : [...p.channels, ch] }));

  return (
    <div style={{ padding:'32px', minHeight:'100vh', background:'#0a0a0a' }}>
      <div className="animate-fade-in-up" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28 }}>
        <div>
          <h1 style={{ fontSize:28, fontWeight:800, color:'#fff', letterSpacing:'-0.03em', margin:0 }}>Mandates</h1>
          <p style={{ fontSize:13, color:'#555', marginTop:4 }}>Configure automated response rules</p>
        </div>
        <button className="btn-orange" onClick={() => { setShowModal(true); setForm(defaultForm); setFormErrors({}); }}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 18px', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>
          <Plus size={15} /> New Mandate
        </button>
      </div>

      <div className="card animate-fade-in-up stagger-2" style={{ overflow:'hidden' }}>
        {isLoading ? (
          <div style={{ padding:40, display:'flex', flexDirection:'column', gap:14 }}>
            {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height:18, borderRadius:4, width:`${50+i*12}%` }} />)}
          </div>
        ) : mandates.length === 0 ? (
          <div style={{ padding:'56px 24px', textAlign:'center' }}>
            <div style={{ width:56, height:56, borderRadius:12, background:'rgba(139,92,246,0.08)', border:'1px solid rgba(139,92,246,0.15)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <Shield size={24} color="#8b5cf6" />
            </div>
            <p style={{ color:'#555', fontSize:14, margin:0 }}>No mandates yet. Create your first rule.</p>
          </div>
        ) : (
          <table className="dark-table">
            <thead><tr>
              <th>Name</th><th>Channels</th><th>Trigger</th><th>Action</th><th>Priority</th><th>Status</th>
            </tr></thead>
            <tbody>
              {mandates.map(m => (
                <tr key={m.id}>
                  <td style={{ color:'#e5e5e5', fontWeight:500 }}>{m.name}</td>
                  <td>
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                      {(m.channels??[]).map(ch => (
                        <span key={ch} style={{ fontSize:11, padding:'2px 7px', borderRadius:4, background:'rgba(255,102,0,0.08)', color:'#ff8833', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>{ch}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ color:'#666', fontSize:12, textTransform:'capitalize' }}>{m.trigger_type?.replace(/_/g,' ')}</td>
                  <td style={{ color:'#666', fontSize:12, textTransform:'capitalize' }}>{m.action?.replace(/_/g,' ')}</td>
                  <td style={{ color:'#555' }}>{m.priority}</td>
                  <td>
                    <button onClick={() => toggleMutation.mutate({ id:m.id, enabled:!m.enabled })} style={{
                      padding:'3px 12px', borderRadius:20, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                      background: m.enabled ? 'rgba(34,197,94,0.1)' : 'rgba(68,68,68,0.3)',
                      color: m.enabled ? '#4ade80' : '#666',
                      transition:'all 0.15s',
                    }}>
                      {m.enabled ? 'Enabled' : 'Disabled'}
                    </button>
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
              <span style={{ fontSize:15, fontWeight:700, color:'#fff' }}>New Mandate</span>
              <button onClick={() => setShowModal(false)} style={{ background:'none', border:'none', color:'#555', cursor:'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <Label>Name *</Label>
                <input type="text" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Mandate name" className="input-dark" />
                {formErrors.name && <p style={{ color:'#f87171', fontSize:12, marginTop:4 }}>{formErrors.name}</p>}
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
                <Label>Trigger Type</Label>
                <select value={form.trigger_type} onChange={e=>setForm(p=>({...p,trigger_type:e.target.value}))} className="select-dark">
                  {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {form.trigger_type === 'keyword' && (
                <div>
                  <Label>Trigger Keywords (comma-separated)</Label>
                  <input type="text" value={form.trigger_keywords} onChange={e=>setForm(p=>({...p,trigger_keywords:e.target.value}))} placeholder="help, support, info" className="input-dark" />
                </div>
              )}
              {['regex','contains'].includes(form.trigger_type) && (
                <div>
                  <Label>Trigger Pattern</Label>
                  <input type="text" value={form.trigger_pattern} onChange={e=>setForm(p=>({...p,trigger_pattern:e.target.value}))} placeholder={form.trigger_type==='regex' ? '^(help|support)$' : 'billing issue'} className="input-dark" />
                </div>
              )}
              <div>
                <Label>Action</Label>
                <select value={form.action} onChange={e=>setForm(p=>({...p,action:e.target.value}))} className="select-dark">
                  {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              {form.action === 'auto_respond' && (
                <>
                  <div>
                    <Label>WhatsApp Response</Label>
                    <textarea value={form.response_whatsapp_body} onChange={e=>setForm(p=>({...p,response_whatsapp_body:e.target.value}))} rows={2} placeholder="WhatsApp response message…" className="input-dark" style={{ resize:'none' }} />
                  </div>
                  <div>
                    <Label>SMS Response</Label>
                    <textarea value={form.response_sms} onChange={e=>setForm(p=>({...p,response_sms:e.target.value}))} rows={2} placeholder="SMS response message…" className="input-dark" style={{ resize:'none' }} />
                  </div>
                </>
              )}
              {form.action === 'escalate' && (
                <div>
                  <Label>Escalate To (email)</Label>
                  <input type="email" value={form.escalate_to} onChange={e=>setForm(p=>({...p,escalate_to:e.target.value}))} placeholder="agent@company.com" className="input-dark" />
                </div>
              )}
              <div>
                <Label>Priority</Label>
                <input type="number" value={form.priority} onChange={e=>setForm(p=>({...p,priority:Number(e.target.value)}))} min={0} className="input-dark" />
              </div>
              <div style={{ display:'flex', gap:10, paddingTop:4 }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost" style={{ flex:1, padding:'10px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="btn-orange" style={{ flex:1, padding:'10px', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  {createMutation.isPending && <Loader2 size={14} className="animate-spin-slow" />}
                  Create Mandate
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
