import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Upload, Loader2, X, Users, Activity } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

interface Contact { id:string; name:string; phone?:string; whatsapp_id?:string; email?:string; tags?:string[]; opted_out?:boolean; created_at:string; source?:string; first_touch_source?:string; first_touch_at?:string; }
interface ContactsResponse { data:Contact[]; total?:number; }
interface FormState { name:string; phone:string; whatsapp_id:string; email:string; tags:string; }
const defaultForm:FormState={name:'',phone:'',whatsapp_id:'',email:'',tags:''};

interface AttrEvent { id:string; source_type:string; source_name?:string; channel?:string; utm_source?:string; utm_campaign?:string; occurred_at:string; }

const SOURCE_COLORS: Record<string,string> = { form:'#6366f1', whatsapp_inbound:'#22c55e', sms_inbound:'#60a5fa', manual:'#f59e0b', import:'#a78bfa', campaign:'#f97316', api:'#94a3b8' };
const SOURCE_LABELS: Record<string,string> = { form:'Form', whatsapp_inbound:'WhatsApp', sms_inbound:'SMS Inbound', manual:'Manual', import:'CSV Import', campaign:'Campaign', api:'API' };

function AttributionModal({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ data: AttrEvent[] }>({
    queryKey: ['attribution', contact.id],
    queryFn: () => api.get(`/contacts/${contact.id}/attribution`).then(r => r.data),
  });
  const events = data?.data ?? [];
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:20 }}>
      <div style={{ background:'var(--color-modal-bg)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:18, padding:'28px', width:'100%', maxWidth:520, boxShadow:'0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:'#fff' }}>{contact.name}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:2 }}>Attribution Timeline</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.3)', cursor:'pointer' }}><X size={16}/></button>
        </div>
        {isLoading ? (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>{[1,2,3].map(i=><div key={i} className="skeleton" style={{height:14, width:`${60+i*10}%`}}/>)}</div>
        ) : events.length === 0 ? (
          <div style={{ padding:'24px 0', textAlign:'center', color:'rgba(255,255,255,0.25)', fontSize:13 }}>No attribution events recorded yet</div>
        ) : (
          <div style={{ position:'relative', paddingLeft:20 }}>
            <div style={{ position:'absolute', left:6, top:4, bottom:4, width:2, background:'rgba(255,255,255,0.06)', borderRadius:2 }} />
            {events.map((ev, i) => {
              const color = SOURCE_COLORS[ev.source_type] ?? 'rgba(255,255,255,0.3)';
              return (
                <div key={ev.id} style={{ position:'relative', paddingBottom: i < events.length-1 ? 16 : 0 }}>
                  <div style={{ position:'absolute', left:-17, top:2, width:10, height:10, borderRadius:'50%', background:color, border:'2px solid var(--color-modal-bg)', flexShrink:0 }} />
                  <div style={{ fontSize:12, fontWeight:600, color }}>
                    {SOURCE_LABELS[ev.source_type] ?? ev.source_type}
                    {i === 0 && <span style={{ fontSize:10, marginLeft:6, background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.3)', padding:'1px 6px', borderRadius:4 }}>First touch</span>}
                    {i === events.length-1 && events.length > 1 && <span style={{ fontSize:10, marginLeft:6, background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.3)', padding:'1px 6px', borderRadius:4 }}>Last touch</span>}
                  </div>
                  {ev.source_name && <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:1 }}>{ev.source_name}</div>}
                  {ev.utm_campaign && <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:1 }}>utm_campaign: {ev.utm_campaign}</div>}
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.2)', marginTop:2 }}>{new Date(ev.occurred_at).toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Contacts() {
  const qc=useQueryClient(); const {toasts,addToast,dismissToast}=useToast();
  const [showModal,setShowModal]=useState(false); const [form,setForm]=useState<FormState>(defaultForm);
  const [formErrors,setFormErrors]=useState<Partial<FormState>>({}); const [search,setSearch]=useState('');
  const [attrContact, setAttrContact]=useState<Contact|null>(null);
  const {data,isLoading}=useQuery<ContactsResponse>({queryKey:['contacts'],queryFn:()=>api.get('/contacts').then(r=>r.data)});
  const contacts:Contact[]=data?.data??[];
  const filtered=useMemo(()=>{const q=search.toLowerCase();if(!q)return contacts;return contacts.filter(c=>c.name?.toLowerCase().includes(q)||c.phone?.includes(q)||c.email?.toLowerCase().includes(q));},[contacts,search]);
  const createMutation=useMutation({
    mutationFn:(p:Record<string,unknown>)=>api.post('/contacts',p),
    onSuccess:()=>{qc.invalidateQueries({queryKey:['contacts']});addToast('success','Contact added.');setShowModal(false);setForm(defaultForm);},
    onError:(err:unknown)=>addToast('error',(err as {response?:{data?:{message?:string}}})?.response?.data?.message??'Failed to add contact.'),
  });
  const optOutMutation=useMutation({
    mutationFn:({id,opted_out}:{id:string;opted_out:boolean})=>api.put(`/contacts/${id}`,{opted_out}),
    onSuccess:()=>qc.invalidateQueries({queryKey:['contacts']}),
    onError:()=>addToast('error','Failed to update.'),
  });
  const validate=()=>{const errors:Partial<FormState>={};if(!form.name.trim())errors.name='Name is required.';setFormErrors(errors);return Object.keys(errors).length===0;};
  const handleSubmit=(e:React.FormEvent)=>{e.preventDefault();if(!validate())return;const payload:Record<string,unknown>={name:form.name};if(form.phone)payload.phone=form.phone;if(form.whatsapp_id)payload.whatsapp_id=form.whatsapp_id;if(form.email)payload.email=form.email;if(form.tags)payload.tags=form.tags.split(',').map(t=>t.trim()).filter(Boolean);createMutation.mutate(payload);};
  function normalizeHeader(h: string): string { return h.trim().toLowerCase().replace(/\s+/g,'_'); }
  function detectCol(headers: string[], candidates: string[]): string|undefined { return headers.find(h => candidates.includes(normalizeHeader(h))); }

  function rowsToContacts(headers: string[], rows: Record<string,unknown>[]) {
    const emailCol = detectCol(headers, ['email','email_address']);
    const nameCol  = detectCol(headers, ['name','names','full_name','full_name_','contact_name']);
    const phoneCol = detectCol(headers, ['phone','phone_number','phone_number_','mobile','cell']);
    const waCol    = detectCol(headers, ['whatsapp_id','whatsapp','whatsapp_number']);
    const membershipCol = detectCol(headers, ['membership','membership_','member_type']);
    const topicCol = detectCol(headers, ['topic','topic_','subject']);

    return rows.map(row => {
      const name  = nameCol  ? String(row[nameCol]  ?? '').trim() : '';
      const email = emailCol ? String(row[emailCol] ?? '').trim() : '';
      const phone = phoneCol ? String(row[phoneCol] ?? '').trim() : '';
      const wa    = waCol    ? String(row[waCol]    ?? '').trim() : '';
      if (!name && !email && !phone && !wa) return null;
      const contact: Record<string,unknown> = {};
      if (name)  contact.name  = name;
      if (email) contact.email = email;
      if (phone) contact.phone = phone;
      if (wa)    contact.whatsapp_id = wa;
      const tags: string[] = [];
      if (membershipCol && row[membershipCol]) tags.push(String(row[membershipCol]).trim());
      if (tags.length) contact.tags = tags;
      const custom: Record<string,unknown> = {};
      if (topicCol && row[topicCol]) custom['topic'] = String(row[topicCol]).trim();
      if (Object.keys(custom).length) contact.custom_fields = custom;
      return contact;
    }).filter(Boolean);
  }

  async function bulkImport(contacts: Record<string,unknown>[]) {
    if (contacts.length === 0) { addToast('error','No valid contacts found.'); return; }
    try {
      const res = await api.post('/contacts/import', { contacts });
      const { imported, failed } = res.data as { imported: number; failed: number };
      qc.invalidateQueries({ queryKey: ['contacts'] });
      addToast(failed === 0 ? 'success' : 'error', `Imported ${imported}${failed > 0 ? `, ${failed} failed` : ''} contact(s).`);
    } catch { addToast('error', 'Import failed.'); }
  }

  const handleFileImport=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0]; if(!file)return;
    const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const reader=new FileReader();
    if (isXlsx) {
      reader.onload=async(ev)=>{
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type:'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string,unknown>>(ws, { defval:'' });
        if (!rawRows.length) { addToast('error','No data found in spreadsheet.'); return; }
        const headers = Object.keys(rawRows[0]);
        const contacts = rowsToContacts(headers, rawRows) as Record<string,unknown>[];
        await bulkImport(contacts);
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload=async(ev)=>{
        const text=ev.target?.result as string;
        const lines=text.split('\n').filter(Boolean);
        if(lines.length<2){addToast('error','CSV needs header + data rows.');return;}
        const headers=lines[0].split(',').map(h=>h.trim());
        const rows=lines.slice(1).map(row=>{const values=row.split(',').map(v=>v.trim().replace(/^"|"$/g,''));const obj:Record<string,unknown>={};headers.forEach((h,i)=>{if(values[i])obj[h]=values[i];});return obj;});
        const contacts = rowsToContacts(headers, rows) as Record<string,unknown>[];
        await bulkImport(contacts);
      };
      reader.readAsText(file);
    }
    e.target.value='';
  };

  return (
    <div style={{padding:'32px',minHeight:'100vh',background:'#06060f',position:'relative'}}>
      <div className="aurora-bg"/>
      <div style={{position:'relative',zIndex:1}}>
        <div className="animate-fade-in-up" style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:28}}>
          <div>
            <h1 style={{fontSize:30,fontWeight:800,color:'#fff',letterSpacing:'-0.04em',margin:0}}>Contacts</h1>
            <p style={{fontSize:13,color:'rgba(255,255,255,0.3)',marginTop:4}}>Manage your messaging contacts</p>
          </div>
          <div style={{display:'flex',gap:8}}>
            <label className="btn-glass" style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer'}}>
              <Upload size={13}/> Import <input type="file" accept=".csv,.xlsx,.xls" style={{display:'none'}} onChange={handleFileImport}/>
            </label>
            <button className="btn-chrome" onClick={()=>{setShowModal(true);setForm(defaultForm);setFormErrors({});}} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 20px',borderRadius:10,fontSize:13}}>
              <Plus size={15}/> Add Contact
            </button>
          </div>
        </div>

        <div className="animate-fade-in-up stagger-2" style={{marginBottom:16,position:'relative',maxWidth:340}}>
          <Search size={13} color="rgba(255,255,255,0.2)" style={{position:'absolute',left:13,top:'50%',transform:'translateY(-50%)'}}/>
          <input type="text" placeholder="Search name, phone or email…" value={search} onChange={e=>setSearch(e.target.value)} className="input-glass" style={{paddingLeft:36}}/>
        </div>

        <div className="glass animate-fade-in-up stagger-3" style={{overflow:'hidden'}}>
          {isLoading?(<div style={{padding:40,display:'flex',flexDirection:'column',gap:14}}>{[1,2,3,4].map(i=><div key={i} className="skeleton" style={{height:18,width:`${50+i*8}%`}}/>)}</div>)
          :filtered.length===0?(<div style={{padding:'56px 24px',textAlign:'center'}}><div style={{width:52,height:52,borderRadius:12,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}><Users size={22} color="rgba(255,255,255,0.2)"/></div><p style={{color:'rgba(255,255,255,0.3)',fontSize:14,margin:0}}>{search?'No contacts match your search.':'No contacts yet. Add your first one.'}</p></div>)
          :(
            <table className="glass-table">
              <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Tags</th><th>Source</th><th>Status</th><th></th></tr></thead>
              <tbody>{filtered.map(c=>(
                <tr key={c.id}>
                  <td style={{color:'rgba(255,255,255,0.85)',fontWeight:500}}>{c.name}</td>
                  <td style={{color:'rgba(255,255,255,0.3)'}}>{c.phone??c.whatsapp_id??'—'}</td>
                  <td style={{color:'rgba(255,255,255,0.3)'}}>{c.email??'—'}</td>
                  <td><div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{(c.tags??[]).map(tag=><span key={tag} style={{fontSize:11,padding:'2px 7px',borderRadius:4,background:'rgba(255,255,255,0.05)',color:'rgba(255,255,255,0.35)',fontWeight:500}}>{tag}</span>)}</div></td>
                  <td>{c.first_touch_source ? <span style={{fontSize:11,padding:'2px 8px',borderRadius:4,background:`${SOURCE_COLORS[c.first_touch_source]??'rgba(255,255,255,0.1)'}18`,color:SOURCE_COLORS[c.first_touch_source]??'rgba(255,255,255,0.3)',fontWeight:600}}>{SOURCE_LABELS[c.first_touch_source]??c.first_touch_source}</span> : <span style={{color:'rgba(255,255,255,0.15)',fontSize:12}}>—</span>}</td>
                  <td><button onClick={()=>optOutMutation.mutate({id:c.id,opted_out:!c.opted_out})} style={{padding:'3px 12px',borderRadius:20,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:c.opted_out?'rgba(239,68,68,0.08)':'rgba(34,197,94,0.08)',color:c.opted_out?'#f87171':'#4ade80',transition:'all 0.15s'}}>{c.opted_out?'Opted out':'Opted in'}</button></td>
                  <td><button title="View attribution" onClick={()=>setAttrContact(c)} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:7,padding:'5px 7px',cursor:'pointer',color:'rgba(255,255,255,0.35)',display:'flex',alignItems:'center'}}><Activity size={13}/></button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>

      {showModal&&(
        <div className="modal-overlay">
          <div className="glass animate-slide-up" style={{width:'100%',maxWidth:460,maxHeight:'90vh',overflowY:'auto',overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 24px',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
              <span style={{fontSize:15,fontWeight:700,color:'#fff'}}>Add Contact</span>
              <button onClick={()=>setShowModal(false)} style={{background:'none',border:'none',color:'rgba(255,255,255,0.3)',cursor:'pointer'}}><X size={17}/></button>
            </div>
            <form onSubmit={handleSubmit} style={{padding:'20px 24px',display:'flex',flexDirection:'column',gap:14}}>
              {[{label:'Name *',type:'text',key:'name',ph:'Full name'},{label:'Phone Number',type:'tel',key:'phone',ph:'+264...'},{label:'WhatsApp Number',type:'tel',key:'whatsapp_id',ph:'+264...'},{label:'Email',type:'email',key:'email',ph:'contact@example.com'},{label:'Tags (comma-separated)',type:'text',key:'tags',ph:'vip, customer, lead'}].map(({label,type,key,ph})=>(
                <div key={key}><span className="chrome-label">{label}</span><input type={type} value={form[key as keyof FormState]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} placeholder={ph} className="input-glass"/>{formErrors[key as keyof FormState]&&<p style={{color:'#f87171',fontSize:12,marginTop:4}}>{formErrors[key as keyof FormState]}</p>}</div>
              ))}
              <div style={{display:'flex',gap:10,paddingTop:4}}>
                <button type="button" onClick={()=>setShowModal(false)} className="btn-glass" style={{flex:1,padding:'11px',borderRadius:9,fontSize:13,fontWeight:600}}>Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="btn-chrome" style={{flex:1,padding:'11px',borderRadius:9,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                  {createMutation.isPending&&<Loader2 size={13} className="animate-spin-slow"/>} Add Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {attrContact && <AttributionModal contact={attrContact} onClose={() => setAttrContact(null)} />}
      <ToastContainer toasts={toasts} onDismiss={dismissToast}/>
    </div>
  );
}
