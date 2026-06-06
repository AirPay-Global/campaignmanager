import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

export interface ToastMessage { id: string; type: 'success' | 'error'; message: string; }

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: string) => void }) {
  return (
    <div style={{ position:'fixed', bottom:24, right:24, zIndex:50, display:'flex', flexDirection:'column', gap:8 }}>
      {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  const isSuccess = toast.type === 'success';
  return (
    <div className="animate-toast" style={{
      display:'flex', alignItems:'center', gap:12,
      padding:'12px 16px',
      background: '#1a1a1a',
      border: `1px solid ${isSuccess ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
      borderLeft: `3px solid ${isSuccess ? '#22c55e' : '#ef4444'}`,
      borderRadius: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      fontSize: 13,
      color: '#e5e5e5',
      maxWidth: 340,
      minWidth: 260,
    }}>
      {isSuccess
        ? <CheckCircle size={16} color="#22c55e" style={{ flexShrink:0 }} />
        : <XCircle    size={16} color="#ef4444" style={{ flexShrink:0 }} />
      }
      <span style={{ flex:1 }}>{toast.message}</span>
      <button onClick={() => onDismiss(toast.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#555', padding:0, display:'flex' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#888')}
        onMouseLeave={e => (e.currentTarget.style.color = '#555')}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(p => [...p, { id, type, message }]);
  }, []);
  const dismissToast = useCallback((id: string) => {
    setToasts(p => p.filter(t => t.id !== id));
  }, []);
  return { toasts, addToast, dismissToast };
}
