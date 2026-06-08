import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, Pause, BarChart2, Loader2, X, Megaphone } from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

interface Campaign { id:string; name:string; description?:string; type:string; status:string; channels:string[]; schedule_at?:string; created_at:string; }
interface CampaignsResponse { data:Campaign[]; total?:number; }
interface FormState { name:string; description:string; type:string; channels:string[]; schedule_at:string; }

const CAMPAIGN_TYPES = [{value:'outbound_blast',label:'Outbound Blast'},{value:'drip',label:'Drip'},{value:'trigger_based',label:'Trigger Based'},{value:'scheduled',label:'Scheduled'}];
const CHANNELS = ['whatsapp','sms','email'];
const defaultForm: FormState = {name:'',description:'',type:'outbound_blast',channels:[],schedule_at:''};

const statusMap: Record<string,{bg:string;dot:string;text:string}> = {
  draft:     {bg:'rgba(255,255,255,0.04)',dot:'rgba(255,255,255,0.2)',text:'rgba(255,255,255,0.4)'},
  running:   {bg:'rgba(34,197,94,0.1)',  dot:'#22c55e',              text:'#4ade80'},
  active:    {bg:'rgba(34,197,94,0.1)',  dot:'#22c55e',              text:'#4ade80'},
  scheduled: {bg:'rgba(99,102,241,0.1)', dot:'#818cf8',              text:'#a5b4fc'},
  paused:    {bg:'rgba(245,158,11,0.1)', dot:'#f59e0b',              text:'#fbbf24'},
  completed: {bg:'rgba(168,85,247,0.1)', dot:'#a855f7',              text:'#c084fc'},
  failed:    {bg:'rgba(239,68,68,0.1)',  dot:'#ef4444',              text:'#f87171'},
};
function StatusBadge({status}:{status:string}) {
  const s=statusMap[status]??statusMap.draft;
  return <span style={{display:'inline-flex',alignItems:'center',gap:6,padding:'3px 10px',borderRadius:20,background:s.bg,border:`1px solid ${s.dot}20`,fontSize:12,fontWeight:600,color:s.text}}><span className="status-dot" style={{background:s.dot}}/>{status}</span>;
}
function Label({children}:{children:React.ReactNode}) {
  return <span className="chrome-label">{children}</span>;
}

export default function Campaigns() {
  const qc = useQueryClient();
  const {toasts,addToast,dismissToast} = useToast();
  const [showModal,setShowModal] = useState(false);
  const [form,setForm] = useState<FormState>(defaultForm);
  const [formErrors,setFormErrors] = useState<Record<string,string>>({});

  const {data,isLoading} = useQuery<CampaignsResponse>({queryKey:['campaigns'],queryFn:()=>api.get('/campaigns').then(r=>r.data)});
  const campaigns: Campaign[] = data?.data??[];

  const createMutation = useMutation({
    mutationFn:(p:Partial<FormState>)=>api.post('/campaigns',p),
    onSuccess:()=>{qc.invalidateQueries({queryKey:['campaigns']});addToast('success','Campaign created.');setShowModal(false);setForm(defaultForm);},
    onError:(err:unknown)=>addToast('error',(err as {response?:{data?:{message?:string}}})?.response?.data?.message??'Failed to create campaign.'),
  });
  const launchMutation = useMutation({
    mutationFn:(id:string)=>api.post(`/campaigns/${id}/launch`),
    onSuccess:()=>{qc.invalidateQueries({queryKey:['campaigns']});addToast('success','Campaign launched.');},
    onError:()=>addToast('error','Failed to launch.'),
  });
  const pauseMutation = useMutation({
    mutationFn:(id:string)=>api.post(`/campaigns/${id}/pause`),
    onSuccess:()=>{qc.invalidateQueries({queryKey:['campaigns']});addToast('success','Campaign paused.');},
    onError:()=>addToast('error','Failed to pause.'),
  });

  const validate = () => {
    const errors:Record<string,string>={};
    if(!form.name.trim()) errors.name='Name is required.';
    if(form.channels.length===0) errors.channels='Select at least one channel.';
    setFormErrors(errors); return Object.keys(errors).length===0;
  };
  const handleSubmit = (e:React.FormEvent) => {
    e.preventDefault(); if(!validate()) return;
    const payload:Record<string,unknown>={name:form.name,description:form.description,type:form.type,channels:form.channels};
    if(form.schedule_at) payload.schedule_at=form.schedule_at;
    createMutation.mutate(payload as Partial<FormState>);
  };
  const toggleChannel = (ch:string) => setForm(p=>({...p,channels:p.channels.includes(ch)?p.channels.filter(c=>c!==ch):[...p.channels,ch]}));

  return (
    <div style={{padding:'32px',minHeight:'100vh',background:'#06060f',position:'relative'}}>
      <div className="aurora-bg" />
      <div style={{position:'relative',zIndex:1}}>
        <div className="animate-fade-in-up" style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:28}}>
          <div>
            <h1 style={{fontSize:30,fontWeight:800,color:'#fff',letterSpacing:'-0.04em',margin:0}}>Campaigns</h1>
            <p style={{fontSize:13,color:'rgba(255,255,255,0.3)',marginTop:4}}>Manage your messaging campaigns</p>
          </div>
          <button className="btn-chrome" onClick={()=>{setShowModal(true);setForm(defaultForm);setFormErrors({});}} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 20px',borderRadius:10,fontSize:13}}>
            <Plus size={15}/> New Campaign
          </button>
        </div>

        <div className="glass animate-fade-in-up stagger-2" style={{overflow:'hidden'}}>
          {isLoading ? (
            <div style={{padding:40,display:'flex',flexDirection:'column',gap:14}}>{[1,2,3,4].map(i=><div key={i} className="skeleton" style={{height:18,width:`${50+i*10}%`}}/>)}</div>
          ) : campaigns.length===0 ? (
            <div style={{padding:'56px 24px',textAlign:'center'}}>
              <div style={{width:52,height:52,borderRadius:12,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px'}}>
                <Megaphone size={22} color="rgba(255,255,255,0.2)"/>
              </div>
              <p style={{color:'rgba(255,255,255,0.3)',fontSize:14,margin:0}}>No campaigns yet.</p>
            </div>
          ) : (
            <table className="glass-table">
              <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Channels</th><th>Created</th><th style={{textAlign:'right'}}>Actions</th></tr></thead>
              <tbody>
                {campaigns.map(c=>(
                  <tr key={c.id}>
                    <td style={{color:'rgba(255,255,255,0.85)',fontWeight:500}}>{c.name}</td>
                    <td style={{color:'rgba(255,255,255,0.3)',fontSize:12}}>{c.type?.replace(/_/g,' ')}</td>
                    <td><StatusBadge status={c.status}/></td>
                    <td><div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{(c.channels??[]).map(ch=><span key={ch} style={{fontSize:11,padding:'2px 8px',borderRadius:5,background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.4)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>{ch}</span>)}</div></td>
                    <td style={{color:'rgba(255,255,255,0.3)'}}>{c.created_at?new Date(c.created_at).toLocaleDateString():'—'}</td>
                    <td>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:6}}>
                        {['draft','paused'].includes(c.status)&&<button onClick={()=>launchMutation.mutate(c.id)} disabled={launchMutation.isPending} style={{padding:'5px 12px',borderRadius:7,background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.2)',color:'#4ade80',cursor:'pointer',display:'flex',alignItems:'center',gap:4,fontSize:12,fontWeight:600}}><Play size={11}/> Launch</button>}
                        {c.status==='active'&&<button onClick={()=>pauseMutation.mutate(c.id)} disabled={pauseMutation.isPending} style={{padding:'5px 12px',borderRadius:7,background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)',color:'#fbbf24',cursor:'pointer',display:'flex',alignItems:'center',gap:4,fontSize:12,fontWeight:600}}><Pause size={11}/> Pause</button>}
                        <button style={{padding:'5px 8px',borderRadius:7,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',color:'rgba(255,255,255,0.3)',cursor:'pointer'}}><BarChart2 size={13}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal&&(
        <div className="modal-overlay">
          <div className="glass animate-slide-up" style={{width:'100%',maxWidth:500,maxHeight:'90vh',overflowY:'auto',overflow:'hidden'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 24px',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
              <span style={{fontSize:15,fontWeight:700,color:'#fff'}}>New Campaign</span>
              <button onClick={()=>setShowModal(false)} style={{background:'none',border:'none',color:'rgba(255,255,255,0.3)',cursor:'pointer'}}><X size={17}/></button>
            </div>
            <form onSubmit={handleSubmit} style={{padding:'20px 24px',display:'flex',flexDirection:'column',gap:14}}>
              <div><Label>Name *</Label><input type="text" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Campaign name" className="input-glass"/>{formErrors.name&&<p style={{color:'#f87171',fontSize:12,marginTop:4}}>{formErrors.name}</p>}</div>
              <div><Label>Description</Label><textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2} placeholder="Optional description" className="input-glass" style={{resize:'none'}}/></div>
              <div><Label>Campaign Type</Label><select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))} className="select-glass">{CAMPAIGN_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
              <div>
                <Label>Channels *</Label>
                <div style={{display:'flex',gap:8}}>
                  {CHANNELS.map(ch=><button key={ch} type="button" onClick={()=>toggleChannel(ch)} style={{padding:'7px 16px',borderRadius:8,fontSize:12,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',cursor:'pointer',border:form.channels.includes(ch)?'1px solid rgba(255,255,255,0.25)':'1px solid rgba(255,255,255,0.08)',background:form.channels.includes(ch)?'rgba(255,255,255,0.1)':'rgba(255,255,255,0.03)',color:form.channels.includes(ch)?'#fff':'rgba(255,255,255,0.35)',transition:'all 0.15s',boxShadow:form.channels.includes(ch)?'inset 0 1px 0 rgba(255,255,255,0.15)':'none'}}>{ch}</button>)}
                </div>
                {formErrors.channels&&<p style={{color:'#f87171',fontSize:12,marginTop:4}}>{formErrors.channels}</p>}
              </div>
              <div><Label>Schedule At (optional)</Label><input type="datetime-local" value={form.schedule_at} onChange={e=>setForm(p=>({...p,schedule_at:e.target.value}))} className="input-glass" style={{colorScheme:'dark'}}/></div>
              <div style={{display:'flex',gap:10,paddingTop:4}}>
                <button type="button" onClick={()=>setShowModal(false)} className="btn-glass" style={{flex:1,padding:'11px',borderRadius:9,fontSize:13,fontWeight:600}}>Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="btn-chrome" style={{flex:1,padding:'11px',borderRadius:9,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                  {createMutation.isPending&&<Loader2 size={13} className="animate-spin-slow"/>} Create Campaign
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
