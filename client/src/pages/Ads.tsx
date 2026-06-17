import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Megaphone, Plus, RefreshCw, Trash2, Edit2, X, Loader2,
  CheckCircle, AlertCircle, Clock, ChevronDown,
} from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

type Platform = 'meta' | 'google';

interface Segment { id: string; name: string; contact_count: number; }
interface AdAudience {
  id: string;
  name: string;
  description?: string;
  platform: Platform;
  platform_audience_id?: string;
  segment_id?: string;
  status: 'pending' | 'active' | 'syncing' | 'error';
  last_synced_at?: string;
  last_sync_count?: number;
  last_sync_error?: string;
  created_at: string;
  audience_segments?: { id: string; name: string; contact_count: number } | null;
}

const PLATFORM_META: Record<Platform, { label: string; color: string; logo: string }> = {
  meta:   { label: 'Meta',   color: '#1877f2', logo: 'f' },
  google: { label: 'Google', color: '#ea4335', logo: 'G' },
};

const STATUS_META: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  active:  { color: '#22c55e', icon: <CheckCircle size={13} />, label: 'Active' },
  syncing: { color: '#f59e0b', icon: <RefreshCw size={13} className="animate-spin-slow" />, label: 'Syncing…' },
  error:   { color: '#ef4444', icon: <AlertCircle size={13} />, label: 'Error' },
  pending: { color: 'rgba(255,255,255,0.3)', icon: <Clock size={13} />, label: 'Pending' },
};

// ─── Create / Edit Modal ──────────────────────────────────────────────────────
function AudienceModal({ audience, segments, onClose, onSaved }: {
  audience?: AdAudience;
  segments: Segment[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName]         = useState(audience?.name ?? '');
  const [desc, setDesc]         = useState(audience?.description ?? '');
  const [platform, setPlatform] = useState<Platform>(audience?.platform ?? 'meta');
  const [segId, setSegId]       = useState(audience?.segment_id ?? '');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      if (audience) {
        await api.patch(`/ads/audiences/${audience.id}`, { name: name.trim(), description: desc || undefined, segment_id: segId || undefined });
      } else {
        await api.post('/ads/audiences', { name: name.trim(), description: desc || undefined, platform, segment_id: segId || undefined });
      }
      onSaved();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:20 }}>
      <div style={{ background:'rgba(15,15,30,0.98)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:18, padding:'28px', width:'100%', maxWidth:480, boxShadow:'0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:700, color:'#fff' }}>{audience ? 'Edit Audience' : 'New Ad Audience'}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.3)', cursor:'pointer' }}><X size={16}/></button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <span className="chrome-label">Audience Name *</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. High-value customers" className="input-glass" />
          </div>
          <div>
            <span className="chrome-label">Description</span>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional description" className="input-glass" />
          </div>

          {!audience && (
            <div>
              <span className="chrome-label">Platform</span>
              <div style={{ display:'flex', gap:8 }}>
                {(['meta', 'google'] as Platform[]).map(p => {
                  const m = PLATFORM_META[p];
                  return (
                    <button key={p} onClick={() => setPlatform(p)} style={{
                      flex:1, padding:'10px 12px', borderRadius:10, fontSize:13, fontWeight:600,
                      cursor:'pointer', transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                      border: platform === p ? `1px solid ${m.color}55` : '1px solid rgba(255,255,255,0.08)',
                      background: platform === p ? `${m.color}18` : 'rgba(255,255,255,0.03)',
                      color: platform === p ? m.color : 'rgba(255,255,255,0.4)',
                    }}>
                      <span style={{ fontWeight:800, fontSize:14 }}>{m.logo}</span> {m.label}
                    </button>
                  );
                })}
              </div>
              {platform === 'google' && (
                <div style={{ marginTop:8, padding:'10px 12px', background:'rgba(234,67,53,0.06)', border:'1px solid rgba(234,67,53,0.2)', borderRadius:8, fontSize:12, color:'rgba(234,67,53,0.8)', lineHeight:1.5 }}>
                  Google Ads requires GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID, and GOOGLE_ADS_REFRESH_TOKEN environment variables.
                </div>
              )}
            </div>
          )}

          <div>
            <span className="chrome-label">Linked Segment (synced on push)</span>
            <div style={{ position:'relative' }}>
              <ChevronDown size={12} color="rgba(255,255,255,0.3)" style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }} />
              <select value={segId} onChange={e => setSegId(e.target.value)} className="select-glass" style={{ paddingRight:30 }}>
                <option value="">None — manual sync only</option>
                {segments.map(s => <option key={s.id} value={s.id}>{s.name} ({s.contact_count ?? 0} contacts)</option>)}
              </select>
            </div>
          </div>
        </div>

        {error && <div style={{ marginTop:12, fontSize:12, color:'#f87171' }}>{error}</div>}

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:20 }}>
          <button onClick={onClose} style={{ padding:'9px 18px', borderRadius:9, fontSize:13, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-chrome" style={{ padding:'9px 18px', borderRadius:9, fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
            {saving && <Loader2 size={13} className="animate-spin-slow" />}
            {saving ? 'Creating…' : (audience ? 'Save' : 'Create Audience')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdsPage() {
  const { toasts, addToast, dismissToast } = useToast();
  const qc = useQueryClient();
  const [modalAudience, setModalAudience] = useState<AdAudience | null | 'new'>('new' as unknown as null);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: audiencesData, isLoading } = useQuery<{ data: AdAudience[] }>({
    queryKey: ['ad-audiences'],
    queryFn: () => api.get('/ads/audiences').then(r => r.data),
    refetchInterval: 5000, // poll while syncing
  });

  const { data: segmentsData } = useQuery<{ data: Segment[] }>({
    queryKey: ['segments'],
    queryFn: () => api.get('/segments').then(r => r.data),
  });

  const audiences = audiencesData?.data ?? [];
  const segments  = segmentsData?.data ?? [];

  const syncMutation = useMutation({
    mutationFn: (id: string) => api.post(`/ads/audiences/${id}/sync`, { replace: true }),
    onSuccess: (res, _id) => {
      const { synced, total_contacts } = res.data as { synced: number; total_contacts: number };
      addToast('success', `Synced ${synced} of ${total_contacts} contacts`);
      qc.invalidateQueries({ queryKey: ['ad-audiences'] });
    },
    onError: (err: unknown, _id) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Sync failed';
      addToast('error', msg);
      qc.invalidateQueries({ queryKey: ['ad-audiences'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ads/audiences/${id}`),
    onSuccess: () => { addToast('success', 'Audience deleted'); qc.invalidateQueries({ queryKey: ['ad-audiences'] }); },
    onError: () => addToast('error', 'Delete failed'),
  });

  const handleSaved = () => {
    setModalOpen(false);
    setModalAudience(null);
    qc.invalidateQueries({ queryKey: ['ad-audiences'] });
    addToast('success', 'Audience created');
  };

  return (
    <div style={{ padding:'32px', minHeight:'100vh', background:'#06060f', position:'relative' }}>
      <div className="aurora-bg" />
      <div style={{ position:'relative', zIndex:1 }}>

        <div className="animate-fade-in-up" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28 }}>
          <div>
            <h1 style={{ fontSize:30, fontWeight:800, color:'#fff', letterSpacing:'-0.04em', margin:0 }}>Ads</h1>
            <p style={{ fontSize:13, color:'rgba(255,255,255,0.3)', marginTop:4 }}>Sync contact segments to Meta and Google ad audiences</p>
          </div>
          <button className="btn-chrome" onClick={() => { setModalAudience(null); setModalOpen(true); }}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 18px', borderRadius:10, fontSize:13 }}>
            <Plus size={14} /> New Audience
          </button>
        </div>

        {/* Env hint */}
        <div className="animate-fade-in-up stagger-1 glass" style={{ borderRadius:12, padding:'14px 18px', marginBottom:20, display:'flex', gap:14, alignItems:'flex-start' }}>
          <AlertCircle size={14} color="#f59e0b" style={{ flexShrink:0, marginTop:1 }} />
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)', lineHeight:1.6 }}>
            <strong style={{ color:'rgba(255,255,255,0.7)' }}>Required env vars:</strong> Meta — <code style={{ color:'#818cf8' }}>META_ADS_ACCESS_TOKEN</code>, <code style={{ color:'#818cf8' }}>META_AD_ACCOUNT_ID</code> &nbsp;|&nbsp;
            Google — <code style={{ color:'#818cf8' }}>GOOGLE_ADS_DEVELOPER_TOKEN</code>, <code style={{ color:'#818cf8' }}>GOOGLE_ADS_CUSTOMER_ID</code>, <code style={{ color:'#818cf8' }}>GOOGLE_ADS_REFRESH_TOKEN</code>.
            All contact data is SHA-256 hashed before upload.
          </div>
        </div>

        <div className="glass animate-fade-in-up stagger-2" style={{ overflow:'hidden', borderRadius:16 }}>
          {isLoading ? (
            <div style={{ padding:40, display:'flex', flexDirection:'column', gap:14 }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height:18, width:`${50+i*12}%` }} />)}
            </div>
          ) : audiences.length === 0 ? (
            <div style={{ padding:'56px 24px', textAlign:'center' }}>
              <div style={{ width:52, height:52, borderRadius:12, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
                <Megaphone size={22} color="rgba(255,255,255,0.2)" />
              </div>
              <p style={{ color:'rgba(255,255,255,0.3)', fontSize:14, margin:'0 0 16px' }}>No ad audiences yet</p>
              <button className="btn-chrome" onClick={() => { setModalAudience(null); setModalOpen(true); }}
                style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'9px 18px', borderRadius:10, fontSize:13 }}>
                <Plus size={13} /> Create your first audience
              </button>
            </div>
          ) : (
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Audience</th>
                  <th>Platform</th>
                  <th>Segment</th>
                  <th>Status</th>
                  <th>Last Sync</th>
                  <th>Contacts</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {audiences.map(aud => {
                  const pm = PLATFORM_META[aud.platform];
                  const sm = STATUS_META[aud.status] ?? STATUS_META['pending'];
                  const isSyncing = aud.status === 'syncing' || syncMutation.isPending;
                  return (
                    <tr key={aud.id}>
                      <td>
                        <div style={{ fontWeight:600, color:'#fff', fontSize:13 }}>{aud.name}</div>
                        {aud.description && <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:1 }}>{aud.description}</div>}
                        {aud.platform_audience_id && <div style={{ fontSize:10, color:'rgba(255,255,255,0.2)', marginTop:1, fontFamily:'monospace' }}>ID: {aud.platform_audience_id}</div>}
                      </td>
                      <td>
                        <span style={{ fontSize:12, fontWeight:700, color:pm.color, background:`${pm.color}15`, padding:'3px 10px', borderRadius:6, border:`1px solid ${pm.color}30` }}>
                          {pm.label}
                        </span>
                      </td>
                      <td style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>
                        {aud.audience_segments?.name ?? <span style={{ color:'rgba(255,255,255,0.2)' }}>—</span>}
                      </td>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:600, color:sm.color }}>
                          {sm.icon} {sm.label}
                        </div>
                        {aud.last_sync_error && (
                          <div style={{ fontSize:11, color:'#f87171', marginTop:2, maxWidth:180, wordBreak:'break-word' }} title={aud.last_sync_error}>
                            {aud.last_sync_error.length > 60 ? aud.last_sync_error.slice(0, 60) + '…' : aud.last_sync_error}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize:12, color:'rgba(255,255,255,0.3)', whiteSpace:'nowrap' }}>
                        {aud.last_synced_at ? new Date(aud.last_synced_at).toLocaleString() : '—'}
                      </td>
                      <td style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.6)' }}>
                        {aud.last_sync_count != null ? aud.last_sync_count.toLocaleString() : '—'}
                      </td>
                      <td>
                        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                          <button
                            title={aud.segment_id ? 'Sync segment to audience' : 'No segment linked'}
                            disabled={isSyncing || !aud.segment_id}
                            onClick={() => syncMutation.mutate(aud.id)}
                            style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:7, fontSize:12, fontWeight:600, cursor: (!aud.segment_id || isSyncing) ? 'not-allowed' : 'pointer', border:'1px solid rgba(99,102,241,0.3)', background:'rgba(99,102,241,0.08)', color: (!aud.segment_id || isSyncing) ? 'rgba(255,255,255,0.2)' : '#818cf8', transition:'all 0.15s' }}>
                            <RefreshCw size={11} className={isSyncing ? 'animate-spin-slow' : ''} />
                            Sync
                          </button>
                          <button title="Edit" onClick={() => { setModalAudience(aud); setModalOpen(true); }}
                            style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:7, padding:'5px 7px', cursor:'pointer', color:'rgba(255,255,255,0.4)', display:'flex', alignItems:'center' }}>
                            <Edit2 size={13} />
                          </button>
                          <button title="Delete" onClick={() => { if (confirm(`Delete "${aud.name}"?`)) deleteMutation.mutate(aud.id); }}
                            style={{ background:'rgba(239,68,68,0.05)', border:'1px solid rgba(239,68,68,0.15)', borderRadius:7, padding:'5px 7px', cursor:'pointer', color:'#f87171', display:'flex', alignItems:'center' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Info cards */}
        <div className="animate-fade-in-up stagger-3" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginTop:20 }}>
          {[
            { title: 'Custom Audiences', body: 'Upload your contacts as a custom audience to retarget them on Facebook and Instagram.' },
            { title: 'Hashed & Private', body: 'All emails and phone numbers are SHA-256 hashed on your server before leaving — Meta never sees raw PII.' },
            { title: 'Segment sync', body: 'Link an audience to a segment and click Sync to push the current contact list. Re-sync anytime.' },
          ].map(c => (
            <div key={c.title} className="glass" style={{ borderRadius:12, padding:'16px 18px' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#fff', marginBottom:5 }}>{c.title}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', lineHeight:1.5 }}>{c.body}</div>
            </div>
          ))}
        </div>
      </div>

      {modalOpen && (
        <AudienceModal
          audience={modalAudience && typeof modalAudience !== 'string' ? modalAudience : undefined}
          segments={segments}
          onClose={() => { setModalOpen(false); setModalAudience(null); }}
          onSaved={handleSaved}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
