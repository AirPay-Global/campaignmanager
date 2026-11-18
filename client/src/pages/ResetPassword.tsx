import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Loader2 } from 'lucide-react';

function errMsg(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

// Supabase recovery links carry the token in the URL hash: #access_token=...&type=recovery
function readToken(): string {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return params.get('access_token') ?? '';
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const token = useMemo(readToken, []);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(token ? '' : 'Reset link is invalid or has expired');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { access_token: token, password });
      window.history.replaceState(null, '', window.location.pathname);
      navigate('/login');
    } catch (err: unknown) {
      setError(errMsg(err, 'Could not reset password'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:'100vh', background:'#06060f', display:'flex', alignItems:'center', justifyContent:'center', padding:16, position:'relative', overflow:'hidden' }}>
      <div className="aurora-bg" />
      <div className="animate-fade-in-up" style={{ width:'100%', maxWidth:420, position:'relative', zIndex:1 }}>
        <div className="glass" style={{ borderRadius:20, padding:'32px 32px 28px' }}>
          <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.03em', color:'#fff', marginBottom:6, textAlign:'center' }}>Choose a new password</h1>

          {error && (
            <div className="animate-fade-in" style={{ marginTop:16, marginBottom:16, padding:'10px 14px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, fontSize:13, color:'rgba(248,113,113,0.9)' }}>{error}</div>
          )}
          {token && (
            <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14, marginTop:20 }}>
              <div>
                <span className="chrome-label">New password</span>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="input-glass" autoComplete="new-password" />
              </div>
              <div>
                <span className="chrome-label">Confirm password</span>
                <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} className="input-glass" autoComplete="new-password" />
              </div>
              <button type="submit" disabled={loading} className="btn-chrome" style={{ width:'100%', padding:13, borderRadius:10, fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                {loading && <Loader2 size={15} className="animate-spin-slow" />}
                {loading ? 'Updating…' : 'Update password'}
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
