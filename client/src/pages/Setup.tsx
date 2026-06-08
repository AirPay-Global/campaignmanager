import { useState } from 'react';
import api from '../lib/api';
import { Zap, Loader2 } from 'lucide-react';

export default function Setup() {
  const [orgName,setOrgName]=useState('AirPay Global');
  const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
  const [error,setError]=useState(''); const [done,setDone]=useState(false); const [loading,setLoading]=useState(false);

  async function handleSubmit(e:React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await api.post('/setup',{token:import.meta.env.VITE_SETUP_TOKEN??'airpay-setup',orgName,email,password});
      setDone(true);
    } catch(err:unknown) {
      setError((err as {response?:{data?:{detail?:string;error?:string}}})?.response?.data?.detail??
               (err as {response?:{data?:{error?:string}}})?.response?.data?.error??'Setup failed');
    } finally { setLoading(false); }
  }

  return (
    <div style={{minHeight:'100vh',background:'#06060f',display:'flex',alignItems:'center',justifyContent:'center',padding:16,position:'relative',overflow:'hidden'}}>
      <div className="aurora-bg"/>
      <div className="animate-fade-in-up" style={{width:'100%',maxWidth:440,position:'relative',zIndex:1}}>
        <div className="animate-float" style={{textAlign:'center',marginBottom:24}}>
          <div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:52,height:52,background:'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.06) 100%)',border:'1px solid rgba(255,255,255,0.18)',borderRadius:14,boxShadow:'inset 0 1px 0 rgba(255,255,255,0.3), 0 8px 32px rgba(0,0,0,0.4)'}}>
            <Zap size={24} color="#fff" fill="rgba(255,255,255,0.9)"/>
          </div>
        </div>
        <div className="glass" style={{borderRadius:20}}>
          <div style={{padding:'32px 32px 28px'}}>
            <div style={{textAlign:'center',marginBottom:26}}>
              <h1 style={{fontSize:22,fontWeight:800,letterSpacing:'-0.04em',color:'#fff',marginBottom:5}}>Initial Setup</h1>
              <p style={{fontSize:12,color:'rgba(255,255,255,0.3)',letterSpacing:'0.08em',textTransform:'uppercase'}}>Create your admin account</p>
            </div>
            {done?(
              <div className="animate-fade-in" style={{textAlign:'center'}}>
                <div style={{width:52,height:52,borderRadius:'50%',background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.25)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px',fontSize:22,color:'#4ade80'}}>✓</div>
                <p style={{color:'#fff',fontWeight:600,marginBottom:18}}>Account created successfully!</p>
                <a href="/login" className="btn-chrome" style={{display:'block',padding:'12px',borderRadius:10,fontSize:14,textAlign:'center',textDecoration:'none'}}>Go to Login</a>
              </div>
            ):(
              <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:14}}>
                {[{label:'Organisation Name',type:'text',value:orgName,setter:setOrgName,ph:'AirPay Global'},{label:'Admin Email',type:'email',value:email,setter:setEmail,ph:'you@airpayglobal.com'},{label:'Password',type:'password',value:password,setter:setPassword,ph:'Min. 8 characters'}].map(({label,type,value,setter,ph})=>(
                  <div key={label}><span className="chrome-label">{label}</span><input type={type} value={value} onChange={e=>setter(e.target.value)} required placeholder={ph} minLength={type==='password'?8:undefined} className="input-glass"/></div>
                ))}
                {error&&<div style={{padding:'10px 14px',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:10,fontSize:13,color:'rgba(248,113,113,0.9)'}}>{error}</div>}
                <button type="submit" disabled={loading} className="btn-chrome" style={{width:'100%',padding:'13px',borderRadius:10,fontSize:14,marginTop:4,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                  {loading&&<Loader2 size={15} className="animate-spin-slow"/>}
                  {loading?'Creating account…':'Create Admin Account'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
