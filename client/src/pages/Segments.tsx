import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Trash2, Users, Filter, Loader2, Upload, ChevronDown, ArrowRight, CheckCircle2 } from 'lucide-react';
import api from '../lib/api';
import { ToastContainer, useToast } from '../components/Toast';

// ─── Audience Segment types ───────────────────────────────────────────────────

interface FilterCondition { field: string; operator: string; value: string; }
interface Segment {
  id: string; name: string; description?: string;
  filter_query: { conditions?: FilterCondition[]; logic?: 'AND' | 'OR' };
  contact_count: number; created_at: string;
}
interface SegmentsResponse { data: Segment[]; total: number; }
interface FormState { name: string; description: string; logic: 'AND' | 'OR'; conditions: FilterCondition[]; }

// ─── Imported Segment types ───────────────────────────────────────────────────

interface ImportedSegment {
  id: string; name: string; source_app: string | null;
  total_members: number; raw_schema: string[];
  field_mappings: Record<string, string>;
  custom_field_mappings: Record<string, string>;
  created_at: string;
}

// Standard field targets the user can map to
const STD_FIELD_TARGETS = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name',  label: 'Last Name' },
  { key: 'name',       label: 'Full Name' },
  { key: 'phone',      label: 'Phone Number' },
  { key: 'email',      label: 'Email' },
  { key: 'whatsapp',   label: 'WhatsApp Number' },
];

// Auto-suggest standard field mappings from raw field names
function autoSuggestMappings(schema: string[]): Record<string, string> {
  const suggestions: Record<string, string> = {};
  const lc = (s: string) => s.toLowerCase().replace(/[_\s-]/g, '');

  const stdHints: [string, string[]][] = [
    ['first_name', ['firstname', 'fname', 'givenname']],
    ['last_name',  ['lastname', 'lname', 'surname', 'familyname']],
    ['name',       ['name', 'fullname', 'displayname']],
    ['phone',      ['phonenumber', 'phone', 'mobile', 'cellphone', 'tel']],
    ['email',      ['email', 'emailaddress', 'mail']],
    ['whatsapp',   ['whatsappnumber', 'whatsapp', 'wa', 'whatsappid']],
  ];

  for (const [stdKey, hints] of stdHints) {
    for (const srcField of schema) {
      if (hints.includes(lc(srcField))) {
        suggestions[stdKey] = srcField;
        break;
      }
    }
  }
  return suggestions;
}

// Fields that are already covered by std mappings → not shown as custom options
function remainingCustomFields(schema: string[], fieldMappings: Record<string, string>): string[] {
  const used = new Set(Object.values(fieldMappings));
  return schema.filter(f => !used.has(f));
}

// ─── Import Wizard modal ──────────────────────────────────────────────────────

function ImportSegmentModal({ onClose, addToast }: { onClose: () => void; addToast: (type: 'success' | 'error', message: string) => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  // Wizard state
  const [step, setStep] = useState<'upload' | 'map' | 'custom'>('upload');
  const [rawData, setRawData] = useState<Record<string, unknown> | null>(null);
  const [membersKey, setMembersKey] = useState('members');
  const [detectedSchema, setDetectedSchema] = useState<string[]>([]);
  const [detectedArrayKeys, setDetectedArrayKeys] = useState<string[]>([]);
  const [segName, setSegName] = useState('');
  const [sourceApp, setSourceApp] = useState('');
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  // custom: array of {alias, srcField}
  const [customMappings, setCustomMappings] = useState<{ alias: string; srcField: string }[]>([]);

  const importMutation = useMutation({
    mutationFn: (payload: object) => api.post('/imported-segments', payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['imported-segments'] });
      addToast('success', 'Segment imported successfully.');
      onClose();
    },
    onError: (err: unknown) =>
      addToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Import failed.'),
  });

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string) as Record<string, unknown>;
        setRawData(json);

        // Auto-detect the segment name from common keys
        const nameGuess = (json.segment ?? json.name ?? json.segmentName ?? '') as string;
        setSegName(String(nameGuess));

        // Detect array keys (likely the members list)
        const arrayKeys = Object.entries(json)
          .filter(([, v]) => Array.isArray(v) && (v as unknown[]).length > 0)
          .map(([k]) => k);
        setDetectedArrayKeys(arrayKeys);

        const bestKey = arrayKeys.find(k => ['members', 'users', 'contacts', 'records', 'data', 'rows'].includes(k.toLowerCase())) ?? arrayKeys[0] ?? 'members';
        setMembersKey(bestKey);

        const members = json[bestKey] as Record<string, unknown>[];
        const schema = members?.length > 0
          ? Object.keys(members[0]).filter(k => {
              const v = members[0][k];
              return v === null || typeof v !== 'object' || !Array.isArray(v);
            })
          : [];
        setDetectedSchema(schema);
        setFieldMappings(autoSuggestMappings(schema));
        setCustomMappings([]);
        setStep('map');
      } catch {
        addToast('error', 'Invalid JSON file.');
      }
    };
    reader.readAsText(file);
  }, [addToast]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSubmit = () => {
    if (!segName.trim()) { addToast('error', 'Segment name is required.'); return; }
    if (!rawData) return;

    const custom_field_mappings: Record<string, string> = {};
    for (const { alias, srcField } of customMappings) {
      if (alias.trim() && srcField) custom_field_mappings[alias.trim()] = srcField;
    }

    importMutation.mutate({
      name: segName.trim(),
      source_app: sourceApp.trim() || null,
      field_mappings: fieldMappings,
      custom_field_mappings,
      members_key: membersKey,
      raw_data: rawData,
    });
  };

  const members = rawData ? (rawData[membersKey] as Record<string, unknown>[] ?? []) : [];
  const availableCustomFields = remainingCustomFields(detectedSchema, fieldMappings);

  return (
    <div className="modal-overlay">
      <div className="glass animate-slide-up" style={{ width: '100%', maxWidth: 580, maxHeight: '92vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Import Segment</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
              Step {step === 'upload' ? 1 : step === 'map' ? 2 : 3} of 3 —{' '}
              {step === 'upload' ? 'Upload JSON' : step === 'map' ? 'Map Standard Fields' : 'Add Custom Fields'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}><X size={17} /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Step 1: Upload ── */}
          {step === 'upload' && (
            <>
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                style={{ border: '2px dashed rgba(99,102,241,0.3)', borderRadius: 14, padding: '48px 24px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: 'rgba(99,102,241,0.04)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.6)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)')}
              >
                <Upload size={28} color="rgba(99,102,241,0.7)" style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>Drop your segment JSON here</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>or click to browse · Exported from any business app</div>
                <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                Supported format: JSON with an array of member records. Any structure is accepted — you will map the fields in the next step.
              </div>
            </>
          )}

          {/* ── Step 2: Map standard fields ── */}
          {step === 'map' && rawData && (
            <>
              {/* Segment meta */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <span className="chrome-label">Segment Name *</span>
                  <input value={segName} onChange={e => setSegName(e.target.value)} className="input-glass" placeholder="e.g. Stage 1 No License" />
                </div>
                <div>
                  <span className="chrome-label">Source App</span>
                  <input value={sourceApp} onChange={e => setSourceApp(e.target.value)} className="input-glass" placeholder="e.g. AirPay HealthTech" />
                </div>
              </div>

              {/* Members array key selector */}
              {detectedArrayKeys.length > 1 && (
                <div>
                  <span className="chrome-label">Members Array Key</span>
                  <div style={{ position: 'relative' }}>
                    <ChevronDown size={12} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    <select value={membersKey} onChange={e => {
                      setMembersKey(e.target.value);
                      const m = (rawData[e.target.value] as Record<string, unknown>[] ?? []);
                      const schema = m.length > 0 ? Object.keys(m[0]).filter(k => { const v = m[0][k]; return v === null || typeof v !== 'object'; }) : [];
                      setDetectedSchema(schema);
                      setFieldMappings(autoSuggestMappings(schema));
                    }} className="select-glass" style={{ paddingRight: 30 }}>
                      {detectedArrayKeys.map(k => <option key={k} value={k}>{k} ({(rawData[k] as unknown[])?.length ?? 0} records)</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.12)', fontSize: 12, color: 'rgba(34,197,94,0.8)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={13} /> {members.length} members detected · {detectedSchema.length} fields found
              </div>

              {/* Standard field mapping */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Map Standard Fields</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {STD_FIELD_TARGETS.map(({ key, label }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', width: 120, flexShrink: 0 }}>{label}</div>
                      <ArrowRight size={12} color="rgba(255,255,255,0.2)" style={{ flexShrink: 0 }} />
                      <div style={{ position: 'relative', flex: 1 }}>
                        <ChevronDown size={11} color="rgba(255,255,255,0.25)" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                        <select
                          value={fieldMappings[key] ?? ''}
                          onChange={e => setFieldMappings(m => e.target.value ? { ...m, [key]: e.target.value } : Object.fromEntries(Object.entries(m).filter(([k]) => k !== key)))}
                          className="select-glass"
                          style={{ paddingRight: 28, fontSize: 12 }}
                        >
                          <option value="">— not mapped —</option>
                          {detectedSchema.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                      {fieldMappings[key] && (
                        <div style={{ fontSize: 11, color: 'rgba(34,197,94,0.7)', flexShrink: 0 }}>
                          ✓ {String((members[0] ?? {})[fieldMappings[key]] ?? '').slice(0, 20)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Sample preview */}
              {members.length > 0 && (
                <div style={{ borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', padding: '10px 14px', fontSize: 11 }}>
                  <div style={{ color: 'rgba(255,255,255,0.3)', marginBottom: 6, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Preview — first member</div>
                  {STD_FIELD_TARGETS.filter(f => fieldMappings[f.key]).map(({ key, label }) => (
                    <div key={key} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
                      <span style={{ color: 'rgba(99,102,241,0.8)', minWidth: 100 }}>{label}</span>
                      <span style={{ color: 'rgba(255,255,255,0.55)' }}>{String((members[0] ?? {})[fieldMappings[key]] ?? '—')}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep('upload')} className="btn-glass" style={{ flex: 1, padding: '10px', borderRadius: 9, fontSize: 13, fontWeight: 600 }}>Back</button>
                <button onClick={() => setStep('custom')} className="btn-chrome" style={{ flex: 1, padding: '10px', borderRadius: 9, fontSize: 13 }}>
                  Next: Custom Fields
                </button>
              </div>
            </>
          )}

          {/* ── Step 3: Custom field mappings ── */}
          {step === 'custom' && (
            <>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                Map additional source fields to custom names that can be used as template variables (e.g. <code style={{ color: '#818cf8' }}>{'{{pharmacy_name}}'}</code>).
              </div>

              {availableCustomFields.length === 0 ? (
                <div style={{ padding: '14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                  All source fields are already mapped to standard fields.
                </div>
              ) : (
                <>
                  {customMappings.map((cm, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <ChevronDown size={11} color="rgba(255,255,255,0.25)" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                        <select
                          value={cm.srcField}
                          onChange={e => setCustomMappings(ms => ms.map((m, idx) => idx === i ? { ...m, srcField: e.target.value } : m))}
                          className="select-glass"
                          style={{ paddingRight: 28, fontSize: 12 }}
                        >
                          <option value="">— source field —</option>
                          {availableCustomFields.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                      <ArrowRight size={12} color="rgba(255,255,255,0.2)" style={{ flexShrink: 0 }} />
                      <input
                        value={cm.alias}
                        onChange={e => setCustomMappings(ms => ms.map((m, idx) => idx === i ? { ...m, alias: e.target.value } : m))}
                        placeholder="alias (e.g. pharmacy_name)"
                        className="input-glass"
                        style={{ flex: 1, fontSize: 12 }}
                      />
                      <button onClick={() => setCustomMappings(ms => ms.filter((_, idx) => idx !== i))} style={{ padding: '7px', borderRadius: 7, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171', cursor: 'pointer' }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setCustomMappings(ms => [...ms, { srcField: availableCustomFields[0] ?? '', alias: '' }])}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 12 }}
                  >
                    <Plus size={12} /> Add custom field
                  </button>
                </>
              )}

              {customMappings.length > 0 && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  These will be available as <code style={{ color: '#818cf8' }}>{'{{alias}}'}</code> in campaign template variable mapping.
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setStep('map')} className="btn-glass" style={{ flex: 1, padding: '10px', borderRadius: 9, fontSize: 13, fontWeight: 600 }}>Back</button>
                <button onClick={handleSubmit} disabled={importMutation.isPending} className="btn-chrome" style={{ flex: 1, padding: '10px', borderRadius: 9, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {importMutation.isPending && <Loader2 size={13} className="animate-spin-slow" />}
                  Import Segment
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

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
  const [activeTab, setActiveTab] = useState<'audience' | 'imported'>('audience');
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [nameError, setNameError] = useState('');

  const { data, isLoading } = useQuery<SegmentsResponse>({
    queryKey: ['segments'],
    queryFn: () => api.get('/segments').then(r => r.data),
  });
  const segments: Segment[] = data?.data ?? [];

  const { data: importedData, isLoading: importedLoading } = useQuery({
    queryKey: ['imported-segments'],
    queryFn: () => api.get('/imported-segments').then(r => r.data.data as ImportedSegment[]),
  });
  const importedSegments: ImportedSegment[] = importedData ?? [];

  const createMutation = useMutation({
    mutationFn: (p: Record<string, unknown>) => api.post('/segments', p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segments'] });
      addToast('success', 'Segment created.');
      setShowModal(false); setForm(defaultForm);
    },
    onError: (err: unknown) =>
      addToast('error', (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create segment.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/segments/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['segments'] }); addToast('success', 'Segment deleted.'); },
    onError: () => addToast('error', 'Failed to delete segment.'),
  });

  const deleteImportedMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/imported-segments/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['imported-segments'] }); addToast('success', 'Imported segment deleted.'); },
    onError: () => addToast('error', 'Failed to delete.'),
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

  const tabStyle = (active: boolean) => ({
    padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
    background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
    color: active ? '#fff' : 'rgba(255,255,255,0.35)',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ padding: '32px', minHeight: '100vh', background: '#06060f', position: 'relative' }}>
      <div className="aurora-bg" />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div className="animate-fade-in-up" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>Segments</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Manage audience segments for targeting</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {activeTab === 'imported' ? (
              <button
                className="btn-chrome"
                onClick={() => setShowImportModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, fontSize: 13 }}
              >
                <Upload size={14} /> Import Segment
              </button>
            ) : (
              <button
                className="btn-chrome"
                onClick={() => { setShowModal(true); setForm(defaultForm); setNameError(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, fontSize: 13 }}
              >
                <Plus size={15} /> New Segment
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
          <button style={tabStyle(activeTab === 'audience')} onClick={() => setActiveTab('audience')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Filter size={13} /> Audience Segments</span>
          </button>
          <button style={tabStyle(activeTab === 'imported')} onClick={() => setActiveTab('imported')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Upload size={13} /> Imported</span>
          </button>
        </div>

        {/* ── Audience Segments Tab ── */}
        {activeTab === 'audience' && (
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
                    <th>Name</th><th>Conditions</th><th>Contacts</th><th>Created</th>
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
                      <td style={{ color: 'rgba(255,255,255,0.3)' }}>{s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button onClick={() => deleteMutation.mutate(s.id)} disabled={deleteMutation.isPending} style={{ padding: '5px 8px', borderRadius: 7, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
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
        )}

        {/* ── Imported Segments Tab ── */}
        {activeTab === 'imported' && (
          <div className="animate-fade-in-up stagger-2">
            {importedLoading ? (
              <div className="glass" style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 10 }} />)}
              </div>
            ) : importedSegments.length === 0 ? (
              <div className="glass" style={{ padding: '56px 24px', textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <Upload size={22} color="rgba(255,255,255,0.2)" />
                </div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, marginBottom: 6 }}>No imported segments yet.</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Import a JSON segment export from any business application — field mapping is flexible.</div>
              </div>
            ) : (
              <div className="glass" style={{ overflow: 'hidden' }}>
                <table className="glass-table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Source App</th><th>Members</th>
                      <th>Field Mappings</th><th>Custom Fields</th><th>Imported</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importedSegments.map(s => (
                      <tr key={s.id}>
                        <td>
                          <div style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{s.name}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{s.raw_schema.length} source fields</div>
                        </td>
                        <td>
                          {s.source_app
                            ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#a5b4fc' }}>{s.source_app}</span>
                            : <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>—</span>}
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', fontSize: 12, fontWeight: 600, color: '#4ade80' }}>
                            <Users size={11} />{s.total_members}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {Object.keys(s.field_mappings).map(k => (
                              <span key={k} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>
                                {k} ← {s.field_mappings[k]}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {Object.keys(s.custom_field_mappings).length === 0
                              ? <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>—</span>
                              : Object.keys(s.custom_field_mappings).map(k => (
                                <span key={k} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                                  {'{{'}{k}{'}}'}
                                </span>
                              ))
                            }
                          </div>
                        </td>
                        <td style={{ color: 'rgba(255,255,255,0.3)' }}>{new Date(s.created_at).toLocaleDateString()}</td>
                        <td>
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={() => deleteImportedMutation.mutate(s.id)} disabled={deleteImportedMutation.isPending} style={{ padding: '5px 8px', borderRadius: 7, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Audience segment create modal */}
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
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Segment name" className="input-glass" />
                {nameError && <p style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{nameError}</p>}
              </div>
              <div>
                <Label>Description</Label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Optional description" className="input-glass" style={{ resize: 'none' }} />
              </div>
              <div>
                <Label>Filter Logic</Label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['AND', 'OR'] as const).map(l => (
                    <button key={l} type="button" onClick={() => setForm(p => ({ ...p, logic: l }))} style={{ padding: '7px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', ...(form.logic === l ? pillActive : pillInactive) }}>{l}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Filter Conditions</Label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {form.conditions.map((cond, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select value={cond.field} onChange={e => setCondition(i, { field: e.target.value })} className="select-glass" style={{ flex: '0 0 auto', width: 120 }}>
                        {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <select value={cond.operator} onChange={e => setCondition(i, { operator: e.target.value })} className="select-glass" style={{ flex: '0 0 auto', width: 140 }}>
                        {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <input type="text" value={cond.value} onChange={e => setCondition(i, { value: e.target.value })} placeholder="value" className="input-glass" style={{ flex: 1, minWidth: 0 }} />
                      <button type="button" onClick={() => removeCondition(i)} disabled={form.conditions.length === 1} style={{ padding: '8px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)', cursor: form.conditions.length === 1 ? 'not-allowed' : 'pointer', opacity: form.conditions.length === 1 ? 0.4 : 1, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addCondition} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                  <Plus size={12} /> Add Condition
                </button>
              </div>
              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn-glass" style={{ flex: 1, padding: '11px', borderRadius: 9, fontSize: 13, fontWeight: 600 }}>Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="btn-chrome" style={{ flex: 1, padding: '11px', borderRadius: 9, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {createMutation.isPending && <Loader2 size={13} className="animate-spin-slow" />} Create Segment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportModal && (
        <ImportSegmentModal
          onClose={() => setShowImportModal(false)}
          addToast={addToast}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
