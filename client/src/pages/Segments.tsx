import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Trash2, Users, Filter, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

interface FilterCondition { field: string; operator: string; value: string; }
interface Segment { id: string; name: string; description?: string; filter_query: { conditions?: FilterCondition[]; logic?: 'AND' | 'OR' }; contact_count: number; created_at: string; }
interface SegmentsResponse { data: Segment[]; total: number; }
interface FormState { name: string; description: string; logic: 'AND' | 'OR'; conditions: FilterCondition[]; }

const FIELDS = ['name', 'phone', 'email', 'tags', 'created_at'];
const OPERATORS = [{ value: 'eq', label: 'equals' }, { value: 'contains', label: 'contains' }, { value: 'in', label: 'in (comma-sep)' }, { value: 'within_days', label: 'within days' }];
const defaultCondition = (): FilterCondition => ({ field: 'name', operator: 'eq', value: '' });
const defaultForm: FormState = { name: '', description: '', logic: 'AND', conditions: [defaultCondition()] };

function Label({ children }: { children: React.ReactNode }) {
  return <span className="chrome-label">{children}</span>;
}

export default function Segments() {
  const qc = useQueryClient();
  const { toasts, addToast, dismissToast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [nameError, setNameError] = useState('');

  const { data, isLoading } = useQuery<SegmentsResponse>({
    queryKey: ['segments'],
    queryFn: () => api.get('/segments').then(r => r.data),
  });
  const segments: Segment[] = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/segments', p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segments'] });
      addToast('success', 'Segment created.');
      setShowModal(false);
      setForm(defaultForm);
    },
    onError: (err: unknown) =>
      addToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create segment.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/segments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segments'] });
      addToast('success', 'Segment deleted.');
    },
    onError: () => addToast('error', 'Failed to delete segment.'),
  });

  const setCondition = (i: number, patch: Partial<FilterCondition>) =>
    setForm(p => ({ ...p, conditions: p.conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c) }));

  const addCondition = () => setForm(p => ({ ...p, conditions: [...p.conditions, defaultCondition()] }));

  const removeCondition = (i: number) =>
    setForm(p => ({ ...p, conditions: p.conditions.filter((_, idx) => idx !== i) }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setNameError('Name is required.'); return; }
    setNameError('');
    const payload: Record<string, unknown> = {
      name: form.name,
      filter_query: { conditions: form.conditions.filter(c => c.value.trim()), logic: form.logic },
    };
    if (form.description.trim()) payload.description = form.description;
    createMutation.mutate(payload);
  };

  const pillActive = { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' };
  const pillInactive = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)' };

  return (
    <div style={{ padding: '32px', minHeight: '100vh', background: '#06060f', position: 'relative' }}>
      <div className="aurora-bg" />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="animate-fade-in-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>Segments</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Manage audience segments for targeting</p>
          </div>
          <button
            className="btn-chrome"
            onClick={() => { setShowModal(true); setForm(defaultForm); setNameError(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, fontSize: 13 }}
          >
            <Plus size={15} /> New Segment
          </button>
        </div>

        <div className="glass animate-fade-in-up stagger-2" style={{ overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 18, width: `${45 + i * 10}%` }} />)}
            </div>
          ) : segments.length === 0 ? (
            <div style={{ padding: '56px 24px', textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Filter size={22} color="rgba(255,255,255,0.2)" />
              </div>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, margin: 0 }}>No segments yet. Create your first one.</p>
            </div>
          ) : (
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Conditions</th>
                  <th>Contacts</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {segments.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{s.name}</div>
                      {s.description && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 2 }}>{s.description}</div>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {(s.filter_query?.conditions ?? []).length === 0 ? (
                          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>All contacts</span>
                        ) : (s.filter_query.conditions ?? []).slice(0, 3).map((c, i) => (
                          <span key={i} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)', color: 'rgba(192,132,252,0.8)', fontWeight: 500 }}>
                            {c.field} {c.operator} {String(c.value)}
                          </span>
                        ))}
                        {(s.filter_query?.conditions ?? []).length > 3 && (
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>+{(s.filter_query.conditions ?? []).length - 3} more</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', fontSize: 12, fontWeight: 600, color: '#c084fc' }}>
                        <Users size={11} />{s.contact_count}
                      </span>
                    </td>
                    <td style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => deleteMutation.mutate(s.id)}
                          disabled={deleteMutation.isPending}
                          style={{ padding: '5px 8px', borderRadius: 7, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="glass animate-slide-up" style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>New Segment</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}><X size={17} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div>
                <Label>Name *</Label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Segment name"
                  className="input-glass"
                />
                {nameError && <p style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{nameError}</p>}
              </div>

              <div>
                <Label>Description</Label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder="Optional description"
                  className="input-glass"
                  style={{ resize: 'none' }}
                />
              </div>

              <div>
                <Label>Filter Logic</Label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['AND', 'OR'] as const).map(l => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, logic: l }))}
                      style={{ padding: '7px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', ...(form.logic === l ? pillActive : pillInactive) }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Filter Conditions</Label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {form.conditions.map((cond, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select
                        value={cond.field}
                        onChange={e => setCondition(i, { field: e.target.value })}
                        className="select-glass"
                        style={{ flex: '0 0 auto', width: 120 }}
                      >
                        {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <select
                        value={cond.operator}
                        onChange={e => setCondition(i, { operator: e.target.value })}
                        className="select-glass"
                        style={{ flex: '0 0 auto', width: 140 }}
                      >
                        {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <input
                        type="text"
                        value={cond.value}
                        onChange={e => setCondition(i, { value: e.target.value })}
                        placeholder="value"
                        className="input-glass"
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      <button
                        type="button"
                        onClick={() => removeCondition(i)}
                        disabled={form.conditions.length === 1}
                        style={{ padding: '8px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)', cursor: form.conditions.length === 1 ? 'not-allowed' : 'pointer', opacity: form.conditions.length === 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addCondition}
                  style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
                >
                  <Plus size={12} /> Add Condition
                </button>
              </div>

              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn-glass" style={{ flex: 1, padding: '11px', borderRadius: 9, fontSize: 13, fontWeight: 600 }}>
                  Cancel
                </button>
                <button type="submit" disabled={createMutation.isPending} className="btn-chrome" style={{ flex: 1, padding: '11px', borderRadius: 9, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {createMutation.isPending && <Loader2 size={13} className="animate-spin-slow" />} Create Segment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
