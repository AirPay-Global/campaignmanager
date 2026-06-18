import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, X, Loader2, GitBranch, Trash2, Play, Pause, Users,
  Mail, MessageSquare, Tag, Clock, ChevronDown, ChevronUp, Send,
} from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionType = 'send_message' | 'add_tag' | 'remove_tag';
type TriggerType = 'manual' | 'contact_created' | 'tag_added';
type ChannelType = 'email' | 'sms' | 'whatsapp';

interface StepDraft {
  action_type: ActionType;
  action_config: {
    channel?: ChannelType;
    message_body?: string;
    subject?: string;
    template_name?: string;
    tag?: string;
  };
  delay_hours: number;
}

interface WorkflowStep extends StepDraft {
  id: string; step_order: number;
}

interface Workflow {
  id: string; name: string; description?: string;
  trigger_type: TriggerType; trigger_config: Record<string, unknown>;
  is_active: boolean; created_at: string;
  step_count?: number; active_enrollments?: number; completed_enrollments?: number;
}

interface Contact { id: string; name?: string; email?: string; phone?: string; }
interface ContactsResponse { data: Contact[]; total?: number; }
interface Enrollment {
  id: string; contact_id: string; status: string; current_step_order: number;
  next_step_at: string; enrolled_at: string;
  contacts?: { name?: string; email?: string; phone?: string };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<TriggerType, string> = {
  manual:          'Manual',
  contact_created: 'Contact Created',
  tag_added:       'Tag Added',
};

const ACTION_LABELS: Record<ActionType, string> = {
  send_message: 'Send Message',
  add_tag:      'Add Tag',
  remove_tag:   'Remove Tag',
};

const CHANNEL_COLORS: Record<ChannelType, { bg: string; text: string }> = {
  email:    { bg: 'rgba(56,189,248,0.1)',  text: '#38bdf8' },
  sms:      { bg: 'rgba(99,102,241,0.1)',  text: '#a5b4fc' },
  whatsapp: { bg: 'rgba(34,197,94,0.1)',   text: '#4ade80' },
};

const defaultStep = (): StepDraft => ({
  action_type: 'send_message',
  action_config: { channel: 'sms', message_body: '' },
  delay_hours: 0,
});

// ─── Step Card ────────────────────────────────────────────────────────────────

function StepCard({
  step, index, total,
  onChange, onDelete, onMoveUp, onMoveDown,
}: {
  step: StepDraft; index: number; total: number;
  onChange: (s: StepDraft) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const setConfig = (patch: Partial<StepDraft['action_config']>) =>
    onChange({ ...step, action_config: { ...step.action_config, ...patch } });

  const delayLabel = step.delay_hours === 0 ? 'Immediately'
    : step.delay_hours < 24 ? `After ${step.delay_hours}h`
    : `After ${step.delay_hours / 24}d`;

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', position: 'relative' }}>
      {/* Step number + connector */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(129,140,248,0.15)', border: '1px solid rgba(129,140,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#818cf8' }}>
          {index + 1}
        </div>
        {index < total - 1 && (
          <div style={{ width: 1, height: 12, background: 'rgba(129,140,248,0.2)', margin: '3px 0' }} />
        )}
      </div>

      {/* Card */}
      <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '14px 16px', marginBottom: 8 }}>
        {/* Delay row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Clock size={12} color="rgba(255,255,255,0.3)" />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{delayLabel}</span>
          <input
            type="number" min={0} step={1}
            value={step.delay_hours}
            onChange={e => onChange({ ...step, delay_hours: Math.max(0, Number(e.target.value)) })}
            style={{ width: 60, padding: '2px 6px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, color: '#fff', fontSize: 11, textAlign: 'center' }}
          />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>hours delay</span>
        </div>

        {/* Action type */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(['send_message', 'add_tag', 'remove_tag'] as ActionType[]).map(t => (
            <button key={t} type="button" onClick={() => onChange({ ...step, action_type: t, action_config: t === 'send_message' ? { channel: 'sms', message_body: '' } : { tag: '' } })}
              style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: step.action_type === t ? '1px solid rgba(129,140,248,0.4)' : '1px solid rgba(255,255,255,0.07)', background: step.action_type === t ? 'rgba(129,140,248,0.12)' : 'rgba(255,255,255,0.03)', color: step.action_type === t ? '#a5b4fc' : 'rgba(255,255,255,0.35)' }}>
              {ACTION_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Config */}
        {step.action_type === 'send_message' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['sms', 'email', 'whatsapp'] as ChannelType[]).map(ch => {
                const cc = CHANNEL_COLORS[ch];
                const active = step.action_config.channel === ch;
                return (
                  <button key={ch} type="button" onClick={() => setConfig({ channel: ch })}
                    style={{ padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em', border: active ? `1px solid ${cc.text}40` : '1px solid rgba(255,255,255,0.07)', background: active ? cc.bg : 'rgba(255,255,255,0.03)', color: active ? cc.text : 'rgba(255,255,255,0.3)' }}>
                    {ch}
                  </button>
                );
              })}
            </div>
            {step.action_config.channel === 'email' && (
              <input type="text" placeholder="Subject line" value={step.action_config.subject ?? ''}
                onChange={e => setConfig({ subject: e.target.value })}
                className="input-glass" style={{ padding: '7px 10px', fontSize: 12 }} />
            )}
            {step.action_config.channel === 'whatsapp' && (
              <input type="text" placeholder="Template name (optional)" value={step.action_config.template_name ?? ''}
                onChange={e => setConfig({ template_name: e.target.value })}
                className="input-glass" style={{ padding: '7px 10px', fontSize: 12 }} />
            )}
            <textarea placeholder="Message body. Use {{name}}, {{email}} for personalisation."
              value={step.action_config.message_body ?? ''} rows={2}
              onChange={e => setConfig({ message_body: e.target.value })}
              className="input-glass" style={{ fontSize: 12, resize: 'none' }} />
          </div>
        )}

        {(step.action_type === 'add_tag' || step.action_type === 'remove_tag') && (
          <input type="text" placeholder="Tag name (e.g. vip, follow-up-sent)"
            value={step.action_config.tag ?? ''}
            onChange={e => setConfig({ tag: e.target.value })}
            className="input-glass" style={{ padding: '7px 10px', fontSize: 12 }} />
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <button onClick={onMoveUp} disabled={index === 0} style={{ padding: '4px 6px', borderRadius: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)', cursor: index === 0 ? 'default' : 'pointer', opacity: index === 0 ? 0.3 : 1 }}>
          <ChevronUp size={12} />
        </button>
        <button onClick={onMoveDown} disabled={index === total - 1} style={{ padding: '4px 6px', borderRadius: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)', cursor: index === total - 1 ? 'default' : 'pointer', opacity: index === total - 1 ? 0.3 : 1 }}>
          <ChevronDown size={12} />
        </button>
        <button onClick={onDelete} style={{ padding: '4px 6px', borderRadius: 5, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171', cursor: 'pointer' }}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Workflow Editor Modal ────────────────────────────────────────────────────

function WorkflowModal({
  workflow,
  onClose,
  onSaved,
}: {
  workflow?: Workflow & { steps?: WorkflowStep[] };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { addToast } = useToast();
  const isEdit = !!workflow;

  const [name, setName] = useState(workflow?.name ?? '');
  const [description, setDescription] = useState(workflow?.description ?? '');
  const [triggerType, setTriggerType] = useState<TriggerType>(workflow?.trigger_type ?? 'manual');
  const [triggerTag, setTriggerTag] = useState((workflow?.trigger_config as { tag?: string })?.tag ?? '');
  const [steps, setSteps] = useState<StepDraft[]>(
    workflow?.steps?.map(s => ({
      action_type: s.action_type as ActionType,
      action_config: s.action_config,
      delay_hours: s.delay_hours,
    })) ?? [defaultStep()],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        description: description || undefined,
        trigger_type: triggerType,
        trigger_config: triggerType === 'tag_added' ? { tag: triggerTag } : {},
      };

      let wfId = workflow?.id;
      if (isEdit) {
        await api.patch(`/workflows/${wfId}`, payload);
      } else {
        const res = await api.post('/workflows', payload);
        wfId = res.data.id as string;
      }

      await api.put(`/workflows/${wfId}/steps`, { steps });
    },
    onSuccess: () => {
      addToast('success', isEdit ? 'Workflow updated.' : 'Workflow created.');
      onSaved();
    },
    onError: (err: unknown) =>
      addToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to save workflow.'),
  });

  const moveStep = (idx: number, dir: -1 | 1) => {
    const next = [...steps];
    const other = idx + dir;
    [next[idx], next[other]] = [next[other], next[idx]];
    setSteps(next);
  };

  return (
    <div className="modal-overlay">
      <div className="glass animate-slide-up" style={{ width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'sticky', top: 0, background: 'var(--color-modal-bg)', backdropFilter: 'blur(20px)', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GitBranch size={16} color="#818cf8" />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{isEdit ? 'Edit Workflow' : 'New Workflow'}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}><X size={17} /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Settings</div>
            <div>
              <span className="chrome-label">Name *</span>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Welcome Sequence" className="input-glass" />
            </div>
            <div>
              <span className="chrome-label">Description</span>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Optional description" className="input-glass" style={{ resize: 'none' }} />
            </div>
            <div>
              <span className="chrome-label">Trigger</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['manual', 'contact_created', 'tag_added'] as TriggerType[]).map(t => (
                  <button key={t} type="button" onClick={() => setTriggerType(t)}
                    style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: triggerType === t ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.07)', background: triggerType === t ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)', color: triggerType === t ? '#fff' : 'rgba(255,255,255,0.35)', transition: 'all 0.15s' }}>
                    {TRIGGER_LABELS[t]}
                  </button>
                ))}
              </div>
              {triggerType === 'tag_added' && (
                <input value={triggerTag} onChange={e => setTriggerTag(e.target.value)} placeholder="Tag name to trigger on" className="input-glass" style={{ marginTop: 8 }} />
              )}
            </div>
          </div>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              Steps <span style={{ color: 'rgba(255,255,255,0.2)', fontWeight: 400, fontSize: 10 }}>— executed in order, delay before each step</span>
            </div>

            {steps.map((step, i) => (
              <StepCard
                key={i}
                step={step}
                index={i}
                total={steps.length}
                onChange={s => setSteps(prev => prev.map((p, j) => j === i ? s : p))}
                onDelete={() => setSteps(prev => prev.filter((_, j) => j !== i))}
                onMoveUp={() => moveStep(i, -1)}
                onMoveDown={() => moveStep(i, 1)}
              />
            ))}

            <button
              type="button"
              onClick={() => setSteps(prev => [...prev, defaultStep()])}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 12, fontWeight: 600, marginTop: 4 }}
            >
              <Plus size={12} /> Add Step
            </button>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <button type="button" onClick={onClose} className="btn-glass" style={{ flex: 1, padding: '11px', borderRadius: 9, fontSize: 13, fontWeight: 600 }}>Cancel</button>
            <button
              type="button"
              disabled={!name.trim() || steps.length === 0 || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="btn-chrome"
              style={{ flex: 1, padding: '11px', borderRadius: 9, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {saveMutation.isPending && <Loader2 size={13} className="animate-spin-slow" />}
              Save Workflow
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Enroll Modal ─────────────────────────────────────────────────────────────

function EnrollModal({ workflow, onClose }: { workflow: Workflow; onClose: () => void }) {
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data } = useQuery<ContactsResponse>({
    queryKey: ['contacts'],
    queryFn: () => api.get('/contacts').then(r => r.data),
  });

  const contacts = (data?.data ?? []).filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search),
  );

  const enrollMutation = useMutation({
    mutationFn: () => api.post(`/workflows/${workflow.id}/enroll`, { contact_ids: [...selected] }),
    onSuccess: (res) => {
      addToast('success', `Enrolled ${res.data.enrolled} contact(s)${res.data.skipped ? ` (${res.data.skipped} already enrolled)` : ''}.`);
      onClose();
    },
    onError: (err: unknown) =>
      addToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Enrollment failed.'),
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <div className="modal-overlay">
      <div className="glass animate-slide-up" style={{ width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Enroll Contacts</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{workflow.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}><X size={17} /></button>
        </div>

        <div style={{ padding: '14px 22px 10px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts…" className="input-glass" />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 22px' }}>
          {contacts.slice(0, 100).map(c => (
            <div key={c.id} onClick={() => toggle(c.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, border: selected.has(c.id) ? '2px solid #818cf8' : '2px solid rgba(255,255,255,0.15)', background: selected.has(c.id) ? '#818cf8' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {selected.has(c.id) && <div style={{ width: 6, height: 6, borderRadius: 1, background: '#fff' }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{c.name ?? '(no name)'}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{c.email ?? c.phone ?? ''}</div>
              </div>
            </div>
          ))}
          {contacts.length === 0 && <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No contacts found.</p>}
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', flex: 1 }}>{selected.size} selected</span>
          <button onClick={onClose} className="btn-glass" style={{ padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>Cancel</button>
          <button onClick={() => enrollMutation.mutate()} disabled={selected.size === 0 || enrollMutation.isPending} className="btn-chrome" style={{ padding: '9px 20px', borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
            {enrollMutation.isPending && <Loader2 size={12} className="animate-spin-slow" />}
            Enroll {selected.size > 0 ? selected.size : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Enrollments Panel ────────────────────────────────────────────────────────

function EnrollmentsModal({ workflow, onClose }: { workflow: Workflow; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ data: Enrollment[] }>({
    queryKey: ['workflow-enrollments', workflow.id],
    queryFn: () => api.get(`/workflows/${workflow.id}/enrollments`).then(r => r.data),
  });

  const statusColor: Record<string, string> = {
    active: '#4ade80', completed: '#818cf8', failed: '#f87171', unenrolled: 'rgba(255,255,255,0.3)',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass animate-slide-up" style={{ width: '100%', maxWidth: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Enrollments</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{workflow.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}><X size={17} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 40 }} />)}
            </div>
          ) : !data?.data?.length ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
              No enrollments yet.
            </div>
          ) : (
            <table className="glass-table">
              <thead><tr><th>Contact</th><th>Step</th><th>Status</th><th>Next step</th></tr></thead>
              <tbody>
                {data.data.map(e => (
                  <tr key={e.id}>
                    <td style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
                      {e.contacts?.name ?? e.contacts?.email ?? e.contact_id.slice(0, 8)}
                    </td>
                    <td style={{ color: 'rgba(255,255,255,0.4)' }}>Step {e.current_step_order}</td>
                    <td>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: `${statusColor[e.status] ?? '#fff'}15`, color: statusColor[e.status] ?? '#fff', fontWeight: 600 }}>
                        {e.status}
                      </span>
                    </td>
                    <td style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
                      {e.status === 'active' ? new Date(e.next_step_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface WorkflowWithDetail extends Workflow { steps?: WorkflowStep[] }

export default function Workflows() {
  const qc = useQueryClient();
  const { toasts, addToast, dismissToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editWorkflow, setEditWorkflow] = useState<WorkflowWithDetail | null>(null);
  const [enrollTarget, setEnrollTarget] = useState<Workflow | null>(null);
  const [enrollmentsTarget, setEnrollmentsTarget] = useState<Workflow | null>(null);

  const { data, isLoading } = useQuery<{ data: Workflow[] }>({
    queryKey: ['workflows'],
    queryFn: () => api.get('/workflows').then(r => r.data),
    refetchInterval: 15_000,
  });
  const workflows = data?.data ?? [];

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch(`/workflows/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
    onError: () => addToast('error', 'Failed to toggle workflow.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/workflows/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflows'] }); addToast('success', 'Workflow deleted.'); },
    onError: () => addToast('error', 'Failed to delete workflow.'),
  });

  const openEdit = async (wf: Workflow) => {
    const res = await api.get(`/workflows/${wf.id}`);
    setEditWorkflow(res.data as WorkflowWithDetail);
  };

  const actionIconStyle = { padding: '5px 8px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)', cursor: 'pointer' };

  return (
    <div style={{ padding: '32px', minHeight: '100vh', background: '#06060f', position: 'relative' }}>
      <div className="aurora-bg" />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div className="animate-fade-in-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>Workflows</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Automated drip sequences and triggered messaging</p>
          </div>
          <button className="btn-chrome" onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, fontSize: 13 }}>
            <Plus size={15} /> New Workflow
          </button>
        </div>

        {/* List */}
        <div className="glass animate-fade-in-up stagger-2" style={{ overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 18, width: `${50+i*12}%` }} />)}
            </div>
          ) : workflows.length === 0 ? (
            <div style={{ padding: '56px 24px', textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <GitBranch size={22} color="rgba(255,255,255,0.2)" />
              </div>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, margin: 0 }}>No workflows yet. Create one to automate your messaging.</p>
            </div>
          ) : (
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Name</th><th>Trigger</th><th>Steps</th>
                  <th>Active</th><th>Completed</th><th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workflows.map(wf => (
                  <tr key={wf.id}>
                    <td style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{wf.name}</td>
                    <td>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: 'rgba(129,140,248,0.08)', color: '#818cf8', fontWeight: 600 }}>
                        {TRIGGER_LABELS[wf.trigger_type] ?? wf.trigger_type}
                      </span>
                    </td>
                    <td style={{ color: 'rgba(255,255,255,0.4)' }}>{wf.step_count ?? 0}</td>
                    <td style={{ color: '#4ade80', fontWeight: 600 }}>{wf.active_enrollments ?? 0}</td>
                    <td style={{ color: 'rgba(255,255,255,0.3)' }}>{wf.completed_enrollments ?? 0}</td>
                    <td>
                      <button
                        onClick={() => toggleMutation.mutate({ id: wf.id, is_active: !wf.is_active })}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: wf.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)', color: wf.is_active ? '#4ade80' : 'rgba(255,255,255,0.35)' }}
                      >
                        {wf.is_active ? <><Play size={10} /> Active</> : <><Pause size={10} /> Paused</>}
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                        <button onClick={() => setEnrollTarget(wf)} title="Enroll contacts" style={{ ...actionIconStyle, color: '#818cf8', background: 'rgba(129,140,248,0.06)', border: '1px solid rgba(129,140,248,0.15)' }}>
                          <Users size={12} />
                        </button>
                        <button onClick={() => setEnrollmentsTarget(wf)} title="View enrollments" style={actionIconStyle}>
                          <Send size={12} />
                        </button>
                        <button onClick={() => openEdit(wf)} title="Edit" style={actionIconStyle}>
                          <GitBranch size={12} />
                        </button>
                        <button
                          onClick={() => { if (window.confirm('Delete this workflow?')) deleteMutation.mutate(wf.id); }}
                          title="Delete"
                          style={{ padding: '5px 8px', borderRadius: 7, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', color: '#f87171', cursor: 'pointer' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Info cards */}
        <div className="animate-fade-in-up stagger-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 20 }}>
          {[
            { icon: Clock, title: 'Drip sequences', desc: 'Send timed messages over days or weeks automatically.' },
            { icon: Tag, title: 'Tag automation', desc: 'Add or remove contact tags based on workflow progress.' },
            { icon: Mail, title: 'Multi-channel', desc: 'Mix SMS, Email, and WhatsApp steps in a single workflow.' },
            { icon: MessageSquare, title: 'Personalisation', desc: 'Use {{name}}, {{email}} variables in every message.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '16px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={14} color="#818cf8" />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{title}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showCreate && (
        <WorkflowModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['workflows'] }); }}
        />
      )}

      {editWorkflow && (
        <WorkflowModal
          workflow={editWorkflow}
          onClose={() => setEditWorkflow(null)}
          onSaved={() => { setEditWorkflow(null); qc.invalidateQueries({ queryKey: ['workflows'] }); }}
        />
      )}

      {enrollTarget && <EnrollModal workflow={enrollTarget} onClose={() => setEnrollTarget(null)} />}
      {enrollmentsTarget && <EnrollmentsModal workflow={enrollmentsTarget} onClose={() => setEnrollmentsTarget(null)} />}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
