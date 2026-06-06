import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, X, ToggleLeft, ToggleRight } from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

interface Mandate {
  id: string;
  name: string;
  channels: string[];
  trigger_type: string;
  action: string;
  priority: number;
  enabled: boolean;
  created_at: string;
}

interface MandatesResponse {
  data: Mandate[];
  total?: number;
}

const CHANNELS = ['whatsapp', 'sms', 'email'];
const TRIGGER_TYPES = [
  { value: 'keyword', label: 'Keyword' },
  { value: 'regex', label: 'Regex' },
  { value: 'contains', label: 'Contains' },
  { value: 'always', label: 'Always' },
  { value: 'no_match', label: 'No Match' },
];
const ACTIONS = [
  { value: 'auto_respond', label: 'Auto Respond' },
  { value: 'escalate', label: 'Escalate' },
  { value: 'queue_for_review', label: 'Queue for Review' },
  { value: 'webhook_call', label: 'Webhook Call' },
  { value: 'tag_contact', label: 'Tag Contact' },
];

interface FormState {
  name: string;
  channels: string[];
  trigger_type: string;
  trigger_keywords: string;
  trigger_pattern: string;
  action: string;
  response_whatsapp_body: string;
  response_sms: string;
  escalate_to: string;
  priority: number;
}

const defaultForm: FormState = {
  name: '',
  channels: [],
  trigger_type: 'keyword',
  trigger_keywords: '',
  trigger_pattern: '',
  action: 'auto_respond',
  response_whatsapp_body: '',
  response_sms: '',
  escalate_to: '',
  priority: 0,
};

export default function Mandates() {
  const qc = useQueryClient();
  const { toasts, addToast, dismissToast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const { data, isLoading } = useQuery<MandatesResponse>({
    queryKey: ['mandates'],
    queryFn: () => api.get('/mandates').then((r) => r.data),
  });

  const mandates: Mandate[] = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/mandates', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mandates'] });
      addToast('success', 'Mandate created successfully.');
      setShowModal(false);
      setForm(defaultForm);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to create mandate.';
      addToast('error', msg);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.put(`/mandates/${id}`, { enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mandates'] });
    },
    onError: () => addToast('error', 'Failed to update mandate.'),
  });

  const validate = () => {
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) errors.name = 'Name is required.';
    if (form.channels.length === 0) errors.channels = 'Select at least one channel.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const payload: Record<string, unknown> = {
      name: form.name,
      channels: form.channels,
      trigger_type: form.trigger_type,
      action: form.action,
      priority: form.priority,
    };

    if (form.trigger_type === 'keyword' && form.trigger_keywords) {
      payload.trigger_keywords = form.trigger_keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
    }
    if (['regex', 'contains'].includes(form.trigger_type) && form.trigger_pattern) {
      payload.trigger_pattern = form.trigger_pattern;
    }
    if (form.action === 'auto_respond') {
      if (form.response_whatsapp_body) payload.response_whatsapp_body = form.response_whatsapp_body;
      if (form.response_sms) payload.response_sms = form.response_sms;
    }
    if (form.action === 'escalate' && form.escalate_to) {
      payload.escalate_to = form.escalate_to;
    }

    createMutation.mutate(payload);
  };

  const toggleChannel = (ch: string) => {
    setForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(ch)
        ? prev.channels.filter((c) => c !== ch)
        : [...prev.channels, ch],
    }));
  };

  const showKeywords = form.trigger_type === 'keyword';
  const showPattern = ['regex', 'contains'].includes(form.trigger_type);
  const showAutoRespondFields = form.action === 'auto_respond';
  const showEscalateTo = form.action === 'escalate';

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Mandates</h1>
          <p className="text-slate-500 text-sm mt-1">Configure automated response rules</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setForm(defaultForm); setFormErrors({}); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Mandate
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : mandates.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-slate-500 text-sm">No mandates yet. Create your first rule.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide border-b border-slate-200">
                  <th className="text-left px-6 py-3 font-medium">Name</th>
                  <th className="text-left px-6 py-3 font-medium">Channels</th>
                  <th className="text-left px-6 py-3 font-medium">Trigger</th>
                  <th className="text-left px-6 py-3 font-medium">Action</th>
                  <th className="text-left px-6 py-3 font-medium">Priority</th>
                  <th className="text-left px-6 py-3 font-medium">Enabled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mandates.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-medium text-slate-700">{m.name}</td>
                    <td className="px-6 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(m.channels ?? []).map((ch) => (
                          <span key={ch} className="inline-flex px-2 py-0.5 rounded text-xs bg-indigo-50 text-indigo-700 font-medium capitalize">
                            {ch}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-slate-500 capitalize">{m.trigger_type?.replace(/_/g, ' ')}</td>
                    <td className="px-6 py-3 text-slate-500 capitalize">{m.action?.replace(/_/g, ' ')}</td>
                    <td className="px-6 py-3 text-slate-500">{m.priority}</td>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => toggleMutation.mutate({ id: m.id, enabled: !m.enabled })}
                        className={`flex items-center gap-1 text-xs font-medium transition-colors ${
                          m.enabled ? 'text-green-600 hover:text-green-700' : 'text-slate-400 hover:text-slate-600'
                        }`}
                        title={m.enabled ? 'Click to disable' : 'Click to enable'}
                      >
                        {m.enabled ? (
                          <ToggleRight className="w-5 h-5" />
                        ) : (
                          <ToggleLeft className="w-5 h-5" />
                        )}
                        {m.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-800">New Mandate</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Mandate name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
              </div>

              {/* Channels */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Channels <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-4">
                  {CHANNELS.map((ch) => (
                    <label key={ch} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.channels.includes(ch)}
                        onChange={() => toggleChannel(ch)}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-700 capitalize">{ch}</span>
                    </label>
                  ))}
                </div>
                {formErrors.channels && <p className="text-red-500 text-xs mt-1">{formErrors.channels}</p>}
              </div>

              {/* Trigger Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Trigger Type</label>
                <select
                  value={form.trigger_type}
                  onChange={(e) => setForm((p) => ({ ...p, trigger_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  {TRIGGER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Keywords (keyword only) */}
              {showKeywords && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Trigger Keywords (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={form.trigger_keywords}
                    onChange={(e) => setForm((p) => ({ ...p, trigger_keywords: e.target.value }))}
                    placeholder="help, support, info"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              {/* Pattern (regex / contains) */}
              {showPattern && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Trigger Pattern
                  </label>
                  <input
                    type="text"
                    value={form.trigger_pattern}
                    onChange={(e) => setForm((p) => ({ ...p, trigger_pattern: e.target.value }))}
                    placeholder={form.trigger_type === 'regex' ? '^(help|support)$' : 'billing issue'}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              {/* Action */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Action</label>
                <select
                  value={form.action}
                  onChange={(e) => setForm((p) => ({ ...p, action: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  {ACTIONS.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>

              {/* Auto-respond fields */}
              {showAutoRespondFields && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">WhatsApp Response</label>
                    <textarea
                      value={form.response_whatsapp_body}
                      onChange={(e) => setForm((p) => ({ ...p, response_whatsapp_body: e.target.value }))}
                      rows={3}
                      placeholder="WhatsApp response message…"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">SMS Response</label>
                    <textarea
                      value={form.response_sms}
                      onChange={(e) => setForm((p) => ({ ...p, response_sms: e.target.value }))}
                      rows={2}
                      placeholder="SMS response message…"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                </>
              )}

              {/* Escalate to */}
              {showEscalateTo && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Escalate To (email)</label>
                  <input
                    type="email"
                    value={form.escalate_to}
                    onChange={(e) => setForm((p) => ({ ...p, escalate_to: e.target.value }))}
                    placeholder="agent@company.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value) }))}
                  min={0}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors disabled:opacity-60"
                >
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Mandate
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
