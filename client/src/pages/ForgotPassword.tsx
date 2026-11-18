import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { Loader2 } from 'lucide-react';

function errMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email) { setError('Email is required'); return; }
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err: unknown) {
      setError(errMsg(err, 'Could not send reset link'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:'100vh', background:'#06060f', display:'flex', alignItems:'center', justifyContent:'center', padding:16, position:'relative', overflow:'hidden' }}>
      <div className="aurora-bg" />
      <div className="animate-fade-in-up" style={{ width:'100%', maxWidth:420, position:'relative', zIndex:1 }}>
        <div className="glass" style={{ borderRadius:20, padding:'32px 32px 28px' }}>
          <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.03em', color:'#fff', marginBottom:6, textAlign:'center' }}>Reset your password</h1>

          <p style={{ fontSize:13, color:'rgba(255,255,255,0.4)', textAlign:'center', marginBottom:24 }}>
            Enter your email and we'll send you a link to reset your password.
          </p>
          {error && (
            <div className="animate-fade-in" style={{ marginBottom:16, padding:'10px 14px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, fontSize:13, color:'rgba(248,113,113,0.9)' }}>{error}</div>
          )}
          {sent ? (
            <div style={{ padding:'12px 14px', background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:10, fontSize:13, color:'rgba(134,239,172,0.9)' }}>
              If an account exists for that email, a reset link has been sent. Check your inbox.
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <span className="chrome-label">Email</span>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@airpayglobal.com" className="input-glass" />
              </div>
              <button type="submit" disabled={loading} className="btn-chrome" style={{ width:'100%', padding:13, borderRadius:10, fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                {loading && <Loader2 size={15} className="animate-spin-slow" />}
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}
          <p style={{ textAlign:'center', marginTop:20, fontSize:12 }}>
            <Link to="/login" style={{ color:'rgba(255,255,255,0.45)', textDecoration:'none' }}>Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
