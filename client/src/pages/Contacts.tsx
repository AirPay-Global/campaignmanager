import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Upload, Loader2, X, ToggleLeft, ToggleRight } from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

interface Contact {
  id: string;
  name: string;
  phone_number?: string;
  whatsapp_number?: string;
  email?: string;
  tags?: string[];
  opted_out?: boolean;
  created_at: string;
}

interface ContactsResponse {
  data: Contact[];
  total?: number;
}

interface FormState {
  name: string;
  phone_number: string;
  whatsapp_number: string;
  email: string;
  tags: string;
}

const defaultForm: FormState = {
  name: '',
  phone_number: '',
  whatsapp_number: '',
  email: '',
  tags: '',
};

export default function Contacts() {
  const qc = useQueryClient();
  const { toasts, addToast, dismissToast } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [formErrors, setFormErrors] = useState<Partial<FormState>>({});
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<ContactsResponse>({
    queryKey: ['contacts'],
    queryFn: () => api.get('/contacts').then((r) => r.data),
  });

  const contacts: Contact[] = data?.data ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.phone_number?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/contacts', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      addToast('success', 'Contact added successfully.');
      setShowModal(false);
      setForm(defaultForm);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to add contact.';
      addToast('error', msg);
    },
  });

  const optOutMutation = useMutation({
    mutationFn: ({ id, opted_out }: { id: string; opted_out: boolean }) =>
      api.put(`/contacts/${id}`, { opted_out }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: () => addToast('error', 'Failed to update opt-out status.'),
  });

  const validate = () => {
    const errors: Partial<FormState> = {};
    if (!form.name.trim()) errors.name = 'Name is required.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const payload: Record<string, unknown> = { name: form.name };
    if (form.phone_number) payload.phone_number = form.phone_number;
    if (form.whatsapp_number) payload.whatsapp_number = form.whatsapp_number;
    if (form.email) payload.email = form.email;
    if (form.tags) payload.tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
    createMutation.mutate(payload);
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(Boolean);
      if (lines.length < 2) {
        addToast('error', 'CSV file must have a header row and at least one data row.');
        return;
      }
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
      const rows = lines.slice(1);
      const contacts: Record<string, unknown>[] = rows.map((row) => {
        const values = row.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
        const obj: Record<string, unknown> = {};
        headers.forEach((h, i) => {
          if (values[i]) obj[h] = values[i];
        });
        if (obj.tags && typeof obj.tags === 'string') {
          obj.tags = obj.tags.split(';').map((t) => t.trim()).filter(Boolean);
        }
        return obj;
      }).filter((c) => c.name);

      if (contacts.length === 0) {
        addToast('error', 'No valid contacts found in CSV.');
        return;
      }

      let success = 0;
      let failed = 0;
      for (const contact of contacts) {
        try {
          await api.post('/contacts', contact);
          success++;
        } catch {
          failed++;
        }
      }
      qc.invalidateQueries({ queryKey: ['contacts'] });
      addToast(
        failed === 0 ? 'success' : 'error',
        `Imported ${success} contact(s)${failed > 0 ? `, ${failed} failed.` : '.'}`
      );
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Contacts</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your messaging contacts</p>
        </div>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 border border-slate-300 hover:border-slate-400 text-slate-700 text-sm font-medium px-4 py-2.5 rounded-lg cursor-pointer transition-colors">
            <Upload className="w-4 h-4" />
            Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
          </label>
          <button
            onClick={() => { setShowModal(true); setForm(defaultForm); setFormErrors({}); }}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Contact
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, phone or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-slate-500 text-sm">
                {search ? 'No contacts match your search.' : 'No contacts yet. Add your first one.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide border-b border-slate-200">
                  <th className="text-left px-6 py-3 font-medium">Name</th>
                  <th className="text-left px-6 py-3 font-medium">Phone</th>
                  <th className="text-left px-6 py-3 font-medium">WhatsApp</th>
                  <th className="text-left px-6 py-3 font-medium">Email</th>
                  <th className="text-left px-6 py-3 font-medium">Tags</th>
                  <th className="text-left px-6 py-3 font-medium">Opt-out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-medium text-slate-700">{c.name}</td>
                    <td className="px-6 py-3 text-slate-500">{c.phone_number ?? '—'}</td>
                    <td className="px-6 py-3 text-slate-500">{c.whatsapp_number ?? '—'}</td>
                    <td className="px-6 py-3 text-slate-500">{c.email ?? '—'}</td>
                    <td className="px-6 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(c.tags ?? []).map((tag) => (
                          <span key={tag} className="inline-flex px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => optOutMutation.mutate({ id: c.id, opted_out: !c.opted_out })}
                        className={`flex items-center gap-1 text-xs font-medium transition-colors ${
                          c.opted_out ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'
                        }`}
                        title={c.opted_out ? 'Click to opt in' : 'Click to opt out'}
                      >
                        {c.opted_out ? (
                          <ToggleLeft className="w-5 h-5" />
                        ) : (
                          <ToggleRight className="w-5 h-5" />
                        )}
                        {c.opted_out ? 'Opted out' : 'Opted in'}
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
              <h2 className="text-base font-semibold text-slate-800">Add Contact</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Full name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={form.phone_number}
                  onChange={(e) => setForm((p) => ({ ...p, phone_number: e.target.value }))}
                  placeholder="+1234567890"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">WhatsApp Number</label>
                <input
                  type="tel"
                  value={form.whatsapp_number}
                  onChange={(e) => setForm((p) => ({ ...p, whatsapp_number: e.target.value }))}
                  placeholder="+1234567890"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="contact@example.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
                  placeholder="vip, customer, lead"
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
                  Add Contact
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
