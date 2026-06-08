import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Upload, Loader2, X, Users } from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

interface Contact { id:string; name:string; phone_number?:string; whatsapp_number?:string; email?:string; tags?:string[]; opted_out?:boolean; created_at:string; }
interface ContactsResponse { data:Contact[]; total?:number; }
interface FormState { name:string; phone_number:string; whatsapp_number:string; email:string; tags:string; }
const defaultForm:FormState={name:'',phone_number:'',whatsapp_number:'',email:'',tags:''};

export default function Contacts() {
  const qc=useQueryClient(); const {toasts,addToast,dismissToast}=useToast();
  const [showModal,setShowModal]=useState(false); const [form,setForm]=useState<FormState>(defaultForm);
  const [formErrors,setFormErrors]=useState<Partial<FormState>>({}); const [search,setSearch]=useState('');
  const {data,isLoading}=useQuery<ContactsResponse>({queryKey:['contacts'],queryFn:()=>api.get('/contacts').then(r=>r.data)});
  const contacts:Contact[]=data?.data??[];
  const filtered=useMemo(()=>{const q=search.toLowerCase();if(!q)return contacts;return contacts.filter(c=>c.name?.toLowerCase().includes(q)||c.phone_number?.includes(q)||c.email?.toLowerCase().includes(q));},[contacts,search]);
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
  const handleSubmit=(e:React.FormEvent)=>{e.preventDefault();if(!validate())return;const payload:Record<string,unknown>={name:form.name};if(form.phone_number)payload.phone_number=form.phone_number;if(form.whatsapp_number)payload.whatsapp_number=form.whatsapp_number;if(form.email)payload.email=form.email;if(form.tags)payload.tags=form.tags.split(',').map(t=>t.trim()).filter(Boolean);createMutation.mutate(payload);};
  const handleCSV=(e:React.ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=async(ev)=>{const text=ev.target?.result as string;const lines=text.split('\n').filter(Boolean);if(lines.length<2){addToast('error','CSV needs header + data rows.');return;}const headers=lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/\s+/g,'_'));const rows=lines.slice(1).map(row=>{const values=row.split(',').map(v=>v.trim().replace(/^"|"$/g,''));const obj:Record<string,unknown>={};headers.forEach((h,i)=>{if(values[i])obj[h]=values[i];});if(obj.tags&&typeof obj.tags==='string')obj.tags=obj.tags.split(';').map(t=>t.trim()).filter(Boolean);return obj;}).filter(c=>c.name);if(rows.length===0){addToast('error','No valid contacts found.');return;}let success=0,failed=0;for(const row of rows){try{await api.post('/contacts',row);success++;}catch{failed++;}}qc.invalidateQueries({queryKey:['contacts']});addToast(failed===0?'success':'error',`Imported ${success}${failed>0?`, ${failed} failed`:''} contact(s).`);};reader.readAsText(file);e.target.value='';};

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
              <Upload size={13}/> Import CSV <input type="file" accept=".csv" style={{display:'none'}} onChange={handleCSV}/>
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
              <thead><tr><th>Name</th><th>Phone</th><th>WhatsApp</th><th>Email</th><th>Tags</th><th>Status</th></tr></thead>
              <tbody>{filtered.map(c=>(
                <tr key={c.id}>
                  <td style={{color:'rgba(255,255,255,0.85)',fontWeight:500}}>{c.name}</td>
                  <td style={{color:'rgba(255,255,255,0.3)'}}>{c.phone_number??'—'}</td>
                  <td style={{color:'rgba(255,255,255,0.3)'}}>{c.whatsapp_number??'—'}</td>
                  <td style={{color:'rgba(255,255,255,0.3)'}}>{c.email??'—'}</td>
                  <td><div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{(c.tags??[]).map(tag=><span key={tag} style={{fontSize:11,padding:'2px 7px',borderRadius:4,background:'rgba(255,255,255,0.05)',color:'rgba(255,255,255,0.35)',fontWeight:500}}>{tag}</span>)}</div></td>
                  <td><button onClick={()=>optOutMutation.mutate({id:c.id,opted_out:!c.opted_out})} style={{padding:'3px 12px',borderRadius:20,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:c.opted_out?'rgba(239,68,68,0.08)':'rgba(34,197,94,0.08)',color:c.opted_out?'#f87171':'#4ade80',transition:'all 0.15s'}}>{c.opted_out?'Opted out':'Opted in'}</button></td>
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
              {[{label:'Name *',type:'text',key:'name',ph:'Full name'},{label:'Phone Number',type:'tel',key:'phone_number',ph:'+264...'},{label:'WhatsApp Number',type:'tel',key:'whatsapp_number',ph:'+264...'},{label:'Email',type:'email',key:'email',ph:'contact@example.com'},{label:'Tags (comma-separated)',type:'text',key:'tags',ph:'vip, customer, lead'}].map(({label,type,key,ph})=>(
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
      <ToastContainer toasts={toasts} onDismiss={dismissToast}/>
    </div>
  );
}
