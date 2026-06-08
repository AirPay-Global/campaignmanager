import { useEffect, useState, useCallback } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';
export interface ToastMessage { id:string; type:'success'|'error'; message:string; }
export function ToastContainer({ toasts, onDismiss }: { toasts:ToastMessage[]; onDismiss:(id:string)=>void }) {
  return (
    <div style={{ position:'fixed', bottom:24, right:24, zIndex:60, display:'flex', flexDirection:'column', gap:10 }}>
      {toasts.map(t=><ToastItem key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}
function ToastItem({ toast, onDismiss }: { toast:ToastMessage; onDismiss:(id:string)=>void }) {
  useEffect(() => { const t=setTimeout(()=>onDismiss(toast.id),4000); return ()=>clearTimeout(t); }, [toast.id,onDismiss]);
  const ok = toast.type==='success';
  return (
    <div className="animate-toast" style={{
      display:'flex', alignItems:'center', gap:12, padding:'12px 16px',
      background:'rgba(255,255,255,0.06)',
      backdropFilter:'blur(24px)', WebkitBackdropFilter:'blur(24px)',
      border:`1px solid ${ok?'rgba(34,197,94,0.2)':'rgba(239,68,68,0.2)'}`,
      borderLeft:`3px solid ${ok?'#22c55e':'#ef4444'}`,
      borderRadius:12,
      boxShadow:'0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
      fontSize:13, color:'rgba(255,255,255,0.85)',
      maxWidth:340, minWidth:260,
    }}>
      {ok ? <CheckCircle size={15} color="#22c55e" style={{flexShrink:0}} /> : <XCircle size={15} color="#ef4444" style={{flexShrink:0}} />}
      <span style={{flex:1}}>{toast.message}</span>
      <button onClick={()=>onDismiss(toast.id)} style={{background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.3)',padding:0,display:'flex',transition:'color 0.15s'}}
        onMouseEnter={e=>(e.currentTarget.style.color='rgba(255,255,255,0.7)')}
        onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.3)')}
      ><X size={13}/></button>
    </div>
  );
}
export function useToast() {
  const [toasts,setToasts] = useState<ToastMessage[]>([]);
  const addToast = useCallback((type:'success'|'error',message:string)=>{ const id=Math.random().toString(36).slice(2); setToasts(p=>[...p,{id,type,message}]); },[]);
  const dismissToast = useCallback((id:string)=>setToasts(p=>p.filter(t=>t.id!==id)),[]);
  return {toasts,addToast,dismissToast};
}
