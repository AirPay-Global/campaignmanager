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
    <div className="grid-bg" style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    }}>
      {/* Animated background glow */}
      <div style={{
        position: 'fixed',
        top: '20%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 600,
        height: 600,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,102,0,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div className="animate-fade-in-up" style={{
        width: '100%',
        maxWidth: 420,
        position: 'relative',
      }}>
        {/* Card */}
        <div style={{
          background: '#111',
          border: '1px solid #2a2a2a',
          borderRadius: 16,
          overflow: 'hidden',
        }}>
          {/* Orange top line */}
          <div className="orange-line" />

          <div style={{ padding: '36px 36px 32px' }}>
            {/* Logo */}
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 52,
                height: 52,
                background: '#ff6600',
                borderRadius: 12,
                marginBottom: 16,
                boxShadow: '0 0 24px rgba(255,102,0,0.4)',
              }}>
                <Zap size={24} color="#fff" fill="#fff" />
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
                AirPay Global
              </div>
              <div style={{ fontSize: 12, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 4 }}>
                Campaign Manager
              </div>
            </div>

            {error && (
              <div className="animate-fade-in" style={{
                marginBottom: 20,
                padding: '10px 14px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8,
                fontSize: 13,
                color: '#f87171',
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600 }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@airpayglobal.com"
                  className="input-dark"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600 }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-dark"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-orange"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: '0.03em',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginTop: 4,
                }}
              >
                {loading && <Loader2 size={16} className="animate-spin-slow" />}
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>

        {/* Bottom label */}
        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#333' }}>
          FAST &nbsp;›&nbsp; SECURE &nbsp;›&nbsp; MULTI-CHANNEL
        </div>
      </div>
    </div>
  );
}
