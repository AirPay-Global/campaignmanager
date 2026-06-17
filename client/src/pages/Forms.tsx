import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList, Plus, Trash2, Edit2, Eye, Copy, ToggleLeft, ToggleRight,
  GripVertical, ChevronUp, ChevronDown, X, Loader2, ExternalLink,
} from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

interface FormField {
  id: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox';
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
}

interface Form {
  id: string;
  name: string;
  description?: string;
  fields: FormField[];
  success_message: string;
  redirect_url?: string;
  tags_to_apply: string[];
  workflow_id?: string;
  is_active: boolean;
  submission_count: number;
  created_at: string;
}

interface FormSub {
  id: string;
  data: Record<string, unknown>;
  ip_address?: string;
  submitted_at: string;
  contacts?: { name?: string; email?: string; phone?: string } | null;
}

interface Workflow { id: string; name: string; }

const FIELD_TYPES: FormField['type'][] = ['text', 'email', 'phone', 'textarea', 'select', 'checkbox'];
const nanoid = () => Math.random().toString(36).slice(2, 10);

function newField(): FormField {
  return { id: nanoid(), type: 'text', label: '', placeholder: '', required: false, options: [] };
}

// ─── Field Row ────────────────────────────────────────────────────────────────
function FieldRow({ field, index, total, onChange, onRemove, onMove }: {
  field: FormField; index: number; total: number;
  onChange: (f: FormField) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <GripVertical size={13} color="rgba(255,255,255,0.2)" style={{ flexShrink: 0 }} />
        <select value={field.type} onChange={e => onChange({ ...field, type: e.target.value as FormField['type'] })} className="select-glass" style={{ width: 110, fontSize: 12 }}>
          {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={field.label} onChange={e => onChange({ ...field, label: e.target.value })} placeholder="Label *" className="input-glass" style={{ flex: 1, fontSize: 12 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', cursor: 'pointer' }}>
          <input type="checkbox" checked={field.required} onChange={e => onChange({ ...field, required: e.target.checked })} style={{ accentColor: '#6366f1' }} />
          Req
        </label>
        <div style={{ display: 'flex', gap: 2 }}>
          <button onClick={() => onMove(-1)} disabled={index === 0} style={iconBtn}><ChevronUp size={12} /></button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} style={iconBtn}><ChevronDown size={12} /></button>
          <button onClick={onRemove} style={{ ...iconBtn, color: '#ef4444' }}><X size={12} /></button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={field.placeholder ?? ''} onChange={e => onChange({ ...field, placeholder: e.target.value })} placeholder="Placeholder text" className="input-glass" style={{ flex: 1, fontSize: 12 }} />
        {field.type === 'select' && (
          <input
            value={(field.options ?? []).join('\n')}
            onChange={e => onChange({ ...field, options: e.target.value.split('\n').filter(Boolean) })}
            placeholder="Options (one per line)"
            className="input-glass" style={{ flex: 1, fontSize: 12 }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Form Modal ───────────────────────────────────────────────────────────────
function FormModal({ form, workflows, onClose, onSaved }: {
  form?: Form; workflows: Workflow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName]       = useState(form?.name ?? '');
  const [desc, setDesc]       = useState(form?.description ?? '');
  const [fields, setFields]   = useState<FormField[]>(form?.fields ?? []);
  const [successMsg, setSuccessMsg] = useState(form?.success_message ?? 'Thank you for your submission!');
  const [redirectUrl, setRedirectUrl] = useState(form?.redirect_url ?? '');
  const [tags, setTags]       = useState((form?.tags_to_apply ?? []).join(', '));
  const [workflowId, setWorkflowId] = useState(form?.workflow_id ?? '');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const updateField = (i: number, f: FormField) => setFields(prev => prev.map((x, idx) => idx === i ? f : x));
  const removeField = (i: number) => setFields(prev => prev.filter((_, idx) => idx !== i));
  const moveField = (i: number, dir: -1 | 1) => {
    setFields(prev => {
      const arr = [...prev];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    const payload = {
      name: name.trim(),
      description: desc || undefined,
      fields,
      success_message: successMsg,
      redirect_url: redirectUrl || undefined,
      tags_to_apply: tags.split(',').map(t => t.trim()).filter(Boolean),
      workflow_id: workflowId || undefined,
    };
    try {
      if (form) {
        await api.patch(`/forms/${form.id}`, payload);
      } else {
        await api.post('/forms', payload);
      }
      onSaved();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={overlay}>
      <div style={{ ...modal, maxWidth: 680 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{form ? 'Edit Form' : 'New Form'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
          {/* Metadata */}
          <div>
            <span className="chrome-label">Form Name *</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Newsletter Sign-up" className="input-glass" />
          </div>
          <div>
            <span className="chrome-label">Description</span>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional description shown to visitors" className="input-glass" />
          </div>

          {/* Fields */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="chrome-label" style={{ margin: 0 }}>Fields</span>
              <button onClick={() => setFields(f => [...f, newField()])} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#818cf8', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                <Plus size={11} /> Add Field
              </button>
            </div>
            {fields.length === 0 ? (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', padding: '8px 0' }}>No fields yet — click Add Field to start</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {fields.map((f, i) => (
                  <FieldRow key={f.id} field={f} index={i} total={fields.length}
                    onChange={upd => updateField(i, upd)}
                    onRemove={() => removeField(i)}
                    onMove={dir => moveField(i, dir)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Settings */}
          <div>
            <span className="chrome-label">Success Message</span>
            <input value={successMsg} onChange={e => setSuccessMsg(e.target.value)} placeholder="Thank you for your submission!" className="input-glass" />
          </div>
          <div>
            <span className="chrome-label">Redirect URL (optional)</span>
            <input value={redirectUrl} onChange={e => setRedirectUrl(e.target.value)} placeholder="https://yoursite.com/thank-you" className="input-glass" />
          </div>
          <div>
            <span className="chrome-label">Tags to Apply on Submit</span>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="newsletter, lead, webinar (comma-separated)" className="input-glass" />
          </div>
          <div>
            <span className="chrome-label">Auto-Enroll in Workflow (optional)</span>
            <select value={workflowId} onChange={e => setWorkflowId(e.target.value)} className="select-glass">
              <option value="">None</option>
              {workflows.map(wf => <option key={wf.id} value={wf.id}>{wf.name}</option>)}
            </select>
          </div>
        </div>

        {error && <div style={{ marginTop: 12, fontSize: 12, color: '#f87171' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 9, fontSize: 13, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-chrome" style={{ padding: '9px 18px', borderRadius: 9, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving ? <Loader2 size={13} className="animate-spin-slow" /> : null}
            {saving ? 'Saving…' : 'Save Form'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Submissions Modal ────────────────────────────────────────────────────────
function SubmissionsModal({ form, onClose }: { form: Form; onClose: () => void }) {
  const { data } = useQuery<{ data: FormSub[]; total: number }>({
    queryKey: ['form-submissions', form.id],
    queryFn: () => api.get(`/forms/${form.id}/submissions`).then(r => r.data),
  });

  return (
    <div style={overlay}>
      <div style={{ ...modal, maxWidth: 760 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{form.name} — Submissions</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{data?.total ?? 0} total</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          {!data?.data?.length ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>No submissions yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.data.map(sub => (
                <div key={sub.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                      {sub.contacts?.name && <span style={{ color: '#fff', fontWeight: 600, marginRight: 8 }}>{sub.contacts.name}</span>}
                      {sub.contacts?.email && <span style={{ marginRight: 8 }}>{sub.contacts.email}</span>}
                      {sub.contacts?.phone && <span>{sub.contacts.phone}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', whiteSpace: 'nowrap' }}>{new Date(sub.submitted_at).toLocaleString()}</div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(sub.data).map(([k, v]) => (
                      <span key={k} style={{ fontSize: 11, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '3px 8px', color: 'rgba(255,255,255,0.6)' }}>
                        <span style={{ color: 'rgba(255,255,255,0.3)' }}>{k}:</span> {String(v)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FormsPage() {
  const { toasts, addToast, dismissToast } = useToast();
  const qc = useQueryClient();
  const [editForm, setEditForm]     = useState<Form | null | 'new'>('new' as unknown as null);
  const [viewSubs, setViewSubs]     = useState<Form | null>(null);
  const [modalOpen, setModalOpen]   = useState(false);

  const { data: formsData, isLoading } = useQuery<{ data: Form[] }>({
    queryKey: ['forms'],
    queryFn: () => api.get('/forms').then(r => r.data),
  });

  const { data: workflowsData } = useQuery<{ data: Workflow[] }>({
    queryKey: ['workflows'],
    queryFn: () => api.get('/workflows').then(r => r.data),
  });

  const forms = formsData?.data ?? [];
  const workflows = workflowsData?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/forms/${id}`),
    onSuccess: () => { addToast('success', 'Form deleted'); qc.invalidateQueries({ queryKey: ['forms'] }); },
    onError: () => addToast('error', 'Delete failed'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => api.patch(`/forms/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms'] }),
    onError: () => addToast('error', 'Update failed'),
  });

  const copyLink = useCallback((id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/f/${id}`);
    addToast('success', 'Link copied');
  }, [addToast]);

  const copyEmbed = useCallback((id: string) => {
    const src = `${window.location.origin}/f/${id}`;
    navigator.clipboard.writeText(`<iframe src="${src}" width="100%" height="600" frameborder="0" style="border:none;"></iframe>`);
    addToast('success', 'Embed code copied');
  }, [addToast]);

  const handleSaved = () => {
    setModalOpen(false);
    setEditForm(null);
    qc.invalidateQueries({ queryKey: ['forms'] });
    addToast('success', 'Form saved');
  };

  return (
    <div style={{ padding: '32px', minHeight: '100vh', background: '#06060f', position: 'relative' }}>
      <div className="aurora-bg" />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div className="animate-fade-in-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>Forms</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Build opt-in forms, embed on any site, auto-create contacts</p>
          </div>
          <button className="btn-chrome" onClick={() => { setEditForm(null); setModalOpen(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, fontSize: 13 }}>
            <Plus size={14} /> New Form
          </button>
        </div>

        {/* Table */}
        <div className="glass animate-fade-in-up stagger-1" style={{ overflow: 'hidden', borderRadius: 16 }}>
          {isLoading ? (
            <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 18, width: `${50 + i * 10}%` }} />)}
            </div>
          ) : forms.length === 0 ? (
            <div style={{ padding: '56px 24px', textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <ClipboardList size={22} color="rgba(255,255,255,0.2)" />
              </div>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, margin: '0 0 16px' }}>No forms yet</p>
              <button className="btn-chrome" onClick={() => { setEditForm(null); setModalOpen(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, fontSize: 13 }}>
                <Plus size={13} /> Create your first form
              </button>
            </div>
          ) : (
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Fields</th>
                  <th>Submissions</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {forms.map(form => (
                  <tr key={form.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>{form.name}</div>
                      {form.description && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{form.description}</div>}
                    </td>
                    <td style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{form.fields.length}</td>
                    <td style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{form.submission_count}</td>
                    <td>
                      <button onClick={() => toggleMutation.mutate({ id: form.id, is_active: !form.is_active })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
                        {form.is_active
                          ? <ToggleRight size={20} color="#22c55e" />
                          : <ToggleLeft size={20} color="rgba(255,255,255,0.2)" />}
                        <span style={{ fontSize: 11, color: form.is_active ? '#22c55e' : 'rgba(255,255,255,0.25)' }}>
                          {form.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button title="Open form" onClick={() => window.open(`/f/${form.id}`, '_blank')} style={actionBtn}><ExternalLink size={13} /></button>
                        <button title="Copy link" onClick={() => copyLink(form.id)} style={actionBtn}><Copy size={13} /></button>
                        <button title="Copy embed code" onClick={() => copyEmbed(form.id)} style={{ ...actionBtn, fontSize: 10, fontWeight: 700, color: '#818cf8', padding: '5px 8px' }}>&lt;/&gt;</button>
                        <button title="View submissions" onClick={() => setViewSubs(form)} style={actionBtn}><Eye size={13} /></button>
                        <button title="Edit" onClick={() => { setEditForm(form); setModalOpen(true); }} style={actionBtn}><Edit2 size={13} /></button>
                        <button title="Delete" onClick={() => { if (confirm(`Delete "${form.name}"?`)) deleteMutation.mutate(form.id); }} style={{ ...actionBtn, color: '#ef4444' }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Info cards */}
        <div className="animate-fade-in-up stagger-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 20 }}>
          {[
            { title: 'Embed on any site', body: 'Copy the embed code and paste it into any website or CMS — the form loads in an iframe.' },
            { title: 'Auto-create contacts', body: 'Submissions with an email or phone automatically create or update a contact in your database.' },
            { title: 'Trigger workflows', body: 'Link a workflow to auto-enroll the contact into a drip sequence immediately after they submit.' },
          ].map(c => (
            <div key={c.title} className="glass" style={{ borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 5 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>{c.body}</div>
            </div>
          ))}
        </div>
      </div>

      {modalOpen && (
        <FormModal
          form={editForm && editForm !== 'new' ? editForm as Form : undefined}
          workflows={workflows}
          onClose={() => { setModalOpen(false); setEditForm(null); }}
          onSaved={handleSaved}
        />
      )}

      {viewSubs && <SubmissionsModal form={viewSubs} onClose={() => setViewSubs(null)} />}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'rgba(255,255,255,0.25)', padding: '4px 5px', borderRadius: 5,
  display: 'flex', alignItems: 'center', transition: 'color 0.15s',
};

const actionBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 7, padding: '5px 7px', cursor: 'pointer', color: 'rgba(255,255,255,0.4)',
  display: 'flex', alignItems: 'center', transition: 'all 0.15s',
};

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
  backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', zIndex: 50, padding: 20,
};

const modal: React.CSSProperties = {
  background: 'rgba(15,15,30,0.98)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 18, padding: '28px 28px', width: '100%',
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
};
