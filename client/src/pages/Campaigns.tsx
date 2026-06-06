import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, Pause, BarChart2, Loader2, X } from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

interface Campaign {
  id: string;
  name: string;
  description?: string;
  type: string;
  status: string;
  channels: string[];
  schedule_at?: string;
  created_at: string;
}

interface CampaignsResponse {
  data: Campaign[];
  total?: number;
}

const CAMPAIGN_TYPES = [
  { value: 'outbound_blast', label: 'Outbound Blast' },
  { value: 'drip', label: 'Drip' },
  { value: 'trigger_based', label: 'Trigger Based' },
  { value: 'scheduled', label: 'Scheduled' },
];

const CHANNELS = ['whatsapp', 'sms', 'email'];

const statusStyles: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusStyles[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

interface FormState {
  name: string;
  description: string;
  type: string;
  channels: string[];
  schedule_at: string;
}

const defaultForm: FormState = {
  name: '',
  description: '',
  type: 'outbound_blast',
  channels: [],
  schedule_at: '',
};

export default function Campaigns() {
  const qc = useQueryClient();
  const { toasts, addToast, dismissToast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery<CampaignsResponse>({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/campaigns').then((r) => r.data),
  });

  const campaigns: Campaign[] = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: Partial<FormState>) => api.post('/campaigns', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      addToast('success', 'Campaign created successfully.');
      setShowModal(false);
      setForm(defaultForm);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to create campaign.';
      addToast('error', msg);
    },
  });

  const launchMutation = useMutation({
    mutationFn: (id: string) => api.post(`/campaigns/${id}/launch`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      addToast('success', 'Campaign launched.');
    },
    onError: () => addToast('error', 'Failed to launch campaign.'),
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => api.post(`/campaigns/${id}/pause`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      addToast('success', 'Campaign paused.');
    },
    onError: () => addToast('error', 'Failed to pause campaign.'),
  });

  const validate = () => {
    const errors: Record<string, string> = {};
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
      description: form.description,
      type: form.type,
      channels: form.channels,
    };
    if (form.schedule_at) payload.schedule_at = form.schedule_at;
    createMutation.mutate(payload as Partial<FormState>);
  };

  const toggleChannel = (ch: string) => {
    setForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(ch)
        ? prev.channels.filter((c) => c !== ch)
        : [...prev.channels, ch],
    }));
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Campaigns</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your messaging campaigns</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setForm(defaultForm); setFormErrors({}); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-16">
              <Megaphone className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm font-medium">No campaigns yet. Create your first one.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide border-b border-slate-200">
                  <th className="text-left px-6 py-3 font-medium">Name</th>
                  <th className="text-left px-6 py-3 font-medium">Type</th>
                  <th className="text-left px-6 py-3 font-medium">Status</th>
                  <th className="text-left px-6 py-3 font-medium">Channels</th>
                  <th className="text-left px-6 py-3 font-medium">Created</th>
                  <th className="text-right px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-medium text-slate-700">{c.name}</td>
                    <td className="px-6 py-3 text-slate-500 capitalize">{c.type?.replace(/_/g, ' ')}</td>
                    <td className="px-6 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(c.channels ?? []).map((ch) => (
                          <span key={ch} className="inline-flex px-2 py-0.5 rounded text-xs bg-indigo-50 text-indigo-700 font-medium capitalize">
                            {ch}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-slate-500">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {c.status === 'draft' || c.status === 'paused' ? (
                          <button
                            onClick={() => launchMutation.mutate(c.id)}
                            disabled={launchMutation.isPending}
                            title="Launch"
                            className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        ) : null}
                        {c.status === 'active' ? (
                          <button
                            onClick={() => pauseMutation.mutate(c.id)}
                            disabled={pauseMutation.isPending}
                            title="Pause"
                            className="p-1.5 rounded-lg text-yellow-600 hover:bg-yellow-50 transition-colors disabled:opacity-50"
                          >
                            <Pause className="w-4 h-4" />
                          </button>
                        ) : null}
                        <button
                          title="View Analytics"
                          className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors"
                        >
                          <BarChart2 className="w-4 h-4" />
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-800">New Campaign</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Campaign name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  placeholder="Optional description"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  {CAMPAIGN_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
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

              {/* Schedule At */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Schedule At (optional)</label>
                <input
                  type="datetime-local"
                  value={form.schedule_at}
                  onChange={(e) => setForm((p) => ({ ...p, schedule_at: e.target.value }))}
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
                  Create Campaign
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

function Megaphone({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 1 8.835-2.535m0 0A23.74 23.74 0 0 1 18.795 3c1.456 0 2.812.044 4.061.418M21 12a2.25 2.25 0 0 1-2.25 2.25H15a3.75 3.75 0 0 0-3.75 3.75v.75a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18.75V5.25A2.25 2.25 0 0 1 3.75 3h5.25a2.25 2.25 0 0 1 2.25 2.25v.75" />
    </svg>
  );
}
