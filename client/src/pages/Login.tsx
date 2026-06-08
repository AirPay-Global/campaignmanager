import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Loader2, Zap } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email) { setError('Email is required'); return; }
    if (!password) { setError('Password is required'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const token = res.data?.token ?? res.data?.access_token ?? res.data?.data?.token;
      if (!token) throw new Error('No token in response');
      localStorage.setItem('token', token);
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message ??
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (err as Error)?.message ?? 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:'100vh', background:'#06060f', display:'flex', alignItems:'center', justifyContent:'center', padding:16, position:'relative', overflow:'hidden' }}>
      <div className="aurora-bg" />

      {/* Extra glow blobs */}
      <div style={{ position:'fixed', top:'15%', left:'30%', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)', pointerEvents:'none', zIndex:0 }} />
      <div style={{ position:'fixed', bottom:'10%', right:'25%', width:350, height:350, borderRadius:'50%', background:'radial-gradient(circle, rgba(168,85,247,0.06) 0%, transparent 70%)', pointerEvents:'none', zIndex:0 }} />

      <div className="animate-fade-in-up" style={{ width:'100%', maxWidth:420, position:'relative', zIndex:1 }}>
        {/* Floating logo icon */}
        <div className="animate-float" style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:56, height:56,
            background:'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.06) 100%)',
            border:'1px solid rgba(255,255,255,0.18)',
            borderRadius:16,
            boxShadow:'inset 0 1px 0 rgba(255,255,255,0.3), 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)',
          }}>
            <Zap size={26} color="#fff" fill="rgba(255,255,255,0.9)" />
          </div>
        </div>

        {/* Glass card */}
        <div className="glass" style={{ borderRadius:20 }}>
          {/* Inner chrome top highlight */}
          <div style={{
            padding:'32px 32px 28px',
          }}>
            <div style={{ textAlign:'center', marginBottom:28 }}>
              <h1 style={{ fontSize:24, fontWeight:800, letterSpacing:'-0.04em', color:'#fff', marginBottom:6 }}>
                AirPay Global
              </h1>
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.3)', letterSpacing:'0.12em', textTransform:'uppercase' }}>
                Campaign Manager
              </p>
            </div>

            {error && (
              <div className="animate-fade-in" style={{
                marginBottom:20, padding:'10px 14px',
                background:'rgba(239,68,68,0.08)',
                border:'1px solid rgba(239,68,68,0.2)',
                borderRadius:10, fontSize:13,
                color:'rgba(248,113,113,0.9)',
              }}>{error}</div>
            )}

            <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {[
                { label:'Email', type:'email', value:email, setter:setEmail, ph:'you@airpayglobal.com' },
                { label:'Password', type:'password', value:password, setter:setPassword, ph:'••••••••' },
              ].map(({ label, type, value, setter, ph }) => (
                <div key={label}>
                  <span className="chrome-label">{label}</span>
                  <input type={type} value={value} onChange={e=>setter(e.target.value)} placeholder={ph} className="input-glass" />
                </div>
              ))}

              <button type="submit" disabled={loading} className="btn-chrome" style={{
                width:'100%', padding:'13px', borderRadius:10,
                fontSize:14, marginTop:6,
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              }}>
                {loading && <Loader2 size={15} className="animate-spin-slow" />}
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>

        <p style={{ textAlign:'center', marginTop:20, fontSize:11, color:'rgba(255,255,255,0.15)', letterSpacing:'0.1em' }}>
          SECURE · ENCRYPTED · MULTI-CHANNEL
        </p>
      </div>
    </div>
  );
}
