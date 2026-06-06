import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Upload, Loader2, X, Users } from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

interface Contact { id: string; name: string; phone_number?: string; whatsapp_number?: string; email?: string; tags?: string[]; opted_out?: boolean; created_at: string; }
interface ContactsResponse { data: Contact[]; total?: number; }
interface FormState { name: string; phone_number: string; whatsapp_number: string; email: string; tags: string; }
const defaultForm: FormState = { name:'', phone_number:'', whatsapp_number:'', email:'', tags:'' };

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display:'block', fontSize:11, color:'#666', marginBottom:6, letterSpacing:'0.07em', textTransform:'uppercase' as const, fontWeight:600 }}>{children}</label>;
}

export default function Contacts() {
  const qc = useQueryClient();
  const { toasts, addToast, dismissToast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [formErrors, setFormErrors] = useState<Partial<FormState>>({});
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<ContactsResponse>({
    queryKey: ['contacts'],
    queryFn: () => api.get('/contacts').then(r => r.data),
  });
  const contacts: Contact[] = data?.data ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return contacts;
    return contacts.filter(c => c.name?.toLowerCase().includes(q) || c.phone_number?.includes(q) || c.email?.toLowerCase().includes(q));
  }, [contacts, search]);

  const createMutation = useMutation({
    mutationFn: (p: Record<string,unknown>) => api.post('/contacts', p),
    onSuccess: () => { qc.invalidateQueries({ queryKey:['contacts'] }); addToast('success','Contact added.'); setShowModal(false); setForm(defaultForm); },
    onError: (err: unknown) => addToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to add contact.'),
  });
  const optOutMutation = useMutation({
    mutationFn: ({ id, opted_out }: { id:string; opted_out:boolean }) => api.put(`/contacts/${id}`, { opted_out }),
    onSuccess: () => qc.invalidateQueries({ queryKey:['contacts'] }),
    onError: () => addToast('error','Failed to update opt-out status.'),
  });

  const validate = () => {
    const errors: Partial<FormState> = {};
    if (!form.name.trim()) errors.name = 'Name is required.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const payload: Record<string,unknown> = { name: form.name };
    if (form.phone_number) payload.phone_number = form.phone_number;
    if (form.whatsapp_number) payload.whatsapp_number = form.whatsapp_number;
    if (form.email) payload.email = form.email;
    if (form.tags) payload.tags = form.tags.split(',').map(t=>t.trim()).filter(Boolean);
    createMutation.mutate(payload);
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(Boolean);
      if (lines.length < 2) { addToast('error','CSV must have header + data rows.'); return; }
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g,'_'));
      const rows = lines.slice(1).map(row => {
        const values = row.split(',').map(v => v.trim().replace(/^"|"$/g,''));
        const obj: Record<string,unknown> = {};
        headers.forEach((h,i) => { if (values[i]) obj[h] = values[i]; });
        if (obj.tags && typeof obj.tags === 'string') obj.tags = obj.tags.split(';').map(t=>t.trim()).filter(Boolean);
        return obj;
      }).filter(c => c.name);
      if (rows.length === 0) { addToast('error','No valid contacts found.'); return; }
      let success = 0, failed = 0;
      for (const row of rows) { try { await api.post('/contacts', row); success++; } catch { failed++; } }
      qc.invalidateQueries({ queryKey:['contacts'] });
      addToast(failed===0?'success':'error', `Imported ${success}${failed>0?`, ${failed} failed`:''} contact(s).`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div style={{ padding:'32px', minHeight:'100vh', background:'#0a0a0a' }}>
      <div className="animate-fade-in-up" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28 }}>
        <div>
          <h1 style={{ fontSize:28, fontWeight:800, color:'#fff', letterSpacing:'-0.03em', margin:0 }}>Contacts</h1>
          <p style={{ fontSize:13, color:'#555', marginTop:4 }}>Manage your messaging contacts</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <label className="btn-ghost" style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>
            <Upload size={14} /> Import CSV
            <input type="file" accept=".csv" style={{ display:'none' }} onChange={handleCSVImport} />
          </label>
          <button className="btn-orange" onClick={() => { setShowModal(true); setForm(defaultForm); setFormErrors({}); }}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 18px', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>
            <Plus size={15} /> Add Contact
          </button>
        </div>
      </div>

      <div className="animate-fade-in-up stagger-2" style={{ marginBottom:16, position:'relative', maxWidth:360 }}>
        <Search size={14} color="#555" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)' }} />
        <input type="text" placeholder="Search name, phone or email…" value={search} onChange={e=>setSearch(e.target.value)}
          className="input-dark" style={{ paddingLeft:36 }} />
      </div>

      <div className="card animate-fade-in-up stagger-3" style={{ overflow:'hidden' }}>
        {isLoading ? (
          <div style={{ padding:40, display:'flex', flexDirection:'column', gap:14 }}>
            {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height:18, borderRadius:4, width:`${50+i*8}%` }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:'56px 24px', textAlign:'center' }}>
            <div style={{ width:56, height:56, borderRadius:12, background:'rgba(59,130,246,0.08)', border:'1px solid rgba(59,130,246,0.15)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <Users size={24} color="#3b82f6" />
            </div>
            <p style={{ color:'#555', fontSize:14, margin:0 }}>{search ? 'No contacts match your search.' : 'No contacts yet. Add your first one.'}</p>
          </div>
        ) : (
          <table className="dark-table">
            <thead><tr>
              <th>Name</th><th>Phone</th><th>WhatsApp</th><th>Email</th><th>Tags</th><th>Status</th>
            </tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td style={{ color:'#e5e5e5', fontWeight:500 }}>{c.name}</td>
                  <td style={{ color:'#666' }}>{c.phone_number ?? '—'}</td>
                  <td style={{ color:'#666' }}>{c.whatsapp_number ?? '—'}</td>
                  <td style={{ color:'#666' }}>{c.email ?? '—'}</td>
                  <td>
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                      {(c.tags??[]).map(tag => (
                        <span key={tag} style={{ fontSize:11, padding:'2px 7px', borderRadius:4, background:'rgba(255,255,255,0.05)', color:'#777', fontWeight:500 }}>{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <button onClick={() => optOutMutation.mutate({ id:c.id, opted_out:!c.opted_out })} style={{
                      padding:'3px 10px', borderRadius:20, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                      background: c.opted_out ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                      color: c.opted_out ? '#f87171' : '#4ade80',
                      transition:'all 0.15s',
                    }}>
                      {c.opted_out ? 'Opted out' : 'Opted in'}
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
          <div className="animate-slide-up" style={{ background:'#111', border:'1px solid #2a2a2a', borderRadius:16, width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto', overflow:'hidden' }}>
            <div className="orange-line" />
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 24px', borderBottom:'1px solid #1e1e1e' }}>
              <span style={{ fontSize:15, fontWeight:700, color:'#fff' }}>Add Contact</span>
              <button onClick={() => setShowModal(false)} style={{ background:'none', border:'none', color:'#555', cursor:'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 }}>
              {[
                { label:'Name *', type:'text', key:'name', ph:'Full name' },
                { label:'Phone Number', type:'tel', key:'phone_number', ph:'+264...' },
                { label:'WhatsApp Number', type:'tel', key:'whatsapp_number', ph:'+264...' },
                { label:'Email', type:'email', key:'email', ph:'contact@example.com' },
                { label:'Tags (comma-separated)', type:'text', key:'tags', ph:'vip, customer, lead' },
              ].map(({ label, type, key, ph }) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <input type={type} value={form[key as keyof FormState]} onChange={e => setForm(p=>({...p,[key]:e.target.value}))} placeholder={ph} className="input-dark" />
                  {formErrors[key as keyof FormState] && <p style={{ color:'#f87171', fontSize:12, marginTop:4 }}>{formErrors[key as keyof FormState]}</p>}
                </div>
              ))}
              <div style={{ display:'flex', gap:10, paddingTop:4 }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost" style={{ flex:1, padding:'10px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' }}>Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="btn-orange" style={{ flex:1, padding:'10px', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  {createMutation.isPending && <Loader2 size={14} className="animate-spin-slow" />}
                  Add Contact
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
