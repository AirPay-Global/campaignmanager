import { useState } from 'react';
import api from '../lib/api';
import { Zap, Loader2 } from 'lucide-react';

export default function Setup() {
  const [orgName, setOrgName] = useState('AirPay Global');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/setup', {
        token: import.meta.env.VITE_SETUP_TOKEN ?? 'airpay-setup',
        orgName, email, password,
      });
      setDone(true);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { detail?: string; error?: string } } })?.response?.data?.detail ??
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Setup failed'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid-bg" style={{ minHeight:'100vh', background:'#0a0a0a', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ position:'fixed', top:'20%', left:'50%', transform:'translateX(-50%)', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle, rgba(255,102,0,0.05) 0%, transparent 70%)', pointerEvents:'none' }} />
      <div className="animate-fade-in-up" style={{ width:'100%', maxWidth:440 }}>
        <div style={{ background:'#111', border:'1px solid #2a2a2a', borderRadius:16, overflow:'hidden' }}>
          <div className="orange-line" />
          <div style={{ padding:'36px 36px 32px' }}>
            <div style={{ textAlign:'center', marginBottom:28 }}>
              <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:48, height:48, background:'#ff6600', borderRadius:10, marginBottom:14, boxShadow:'0 0 20px rgba(255,102,0,0.4)' }}>
                <Zap size={22} color="#fff" fill="#fff" />
              </div>
              <div style={{ fontSize:20, fontWeight:800, color:'#fff', letterSpacing:'-0.03em' }}>Initial Setup</div>
              <div style={{ fontSize:13, color:'#555', marginTop:4 }}>Create your admin account to get started</div>
            </div>

            {done ? (
              <div className="animate-fade-in" style={{ textAlign:'center' }}>
                <div style={{ width:56, height:56, borderRadius:'50%', background:'rgba(34,197,94,0.12)', border:'1px solid rgba(34,197,94,0.3)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:24, color:'#22c55e' }}>✓</div>
                <div style={{ color:'#fff', fontWeight:600, marginBottom:20 }}>Account created successfully!</div>
                <a href="/login" className="btn-orange" style={{ display:'block', padding:'12px', borderRadius:8, fontSize:14, fontWeight:700, textAlign:'center', textDecoration:'none' }}>Go to Login</a>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
                {[
                  { label:'Organisation Name', type:'text', value:orgName, setter:setOrgName, ph:'AirPay Global' },
                  { label:'Admin Email', type:'email', value:email, setter:setEmail, ph:'you@airpayglobal.com' },
                  { label:'Password', type:'password', value:password, setter:setPassword, ph:'Min. 8 characters' },
                ].map(({ label, type, value, setter, ph }) => (
                  <div key={label}>
                    <label style={{ display:'block', fontSize:12, color:'#666', marginBottom:6, letterSpacing:'0.05em', textTransform:'uppercase', fontWeight:600 }}>{label}</label>
                    <input type={type} value={value} onChange={e => setter(e.target.value)} required placeholder={ph} minLength={type==='password'?8:undefined} className="input-dark" />
                  </div>
                ))}
                {error && (
                  <div style={{ padding:'10px 14px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, fontSize:13, color:'#f87171' }}>{error}</div>
                )}
                <button type="submit" disabled={loading} className="btn-orange" style={{ width:'100%', padding:'12px', borderRadius:8, fontSize:14, fontWeight:700, cursor:loading?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginTop:4 }}>
                  {loading && <Loader2 size={16} className="animate-spin-slow" />}
                  {loading ? 'Creating account…' : 'Create Admin Account'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
