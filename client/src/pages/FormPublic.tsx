import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

// Separate axios instance — no auth interceptors (safe for iframe/public use)
const publicApi = axios.create({ baseURL: '/api/v1/public' });

interface FormField {
  id: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox';
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
}

interface FormSchema {
  id: string;
  name: string;
  description?: string;
  fields: FormField[];
  success_message: string;
  redirect_url?: string;
}

export default function FormPublic() {
  const { id } = useParams<{ id: string }>();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const { data: form, isLoading, isError } = useQuery<FormSchema>({
    queryKey: ['public-form', id],
    queryFn: () => publicApi.get(`/forms/${id}`).then(r => r.data),
    retry: false,
  });

  const setValue = (fieldId: string, val: unknown) => {
    setValues(prev => ({ ...prev, [fieldId]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    setSubmitting(true);
    try {
      const res = await publicApi.post(`/forms/${id}/submit`, values);
      setSuccessMsg(res.data.message ?? 'Thank you!');
      if (res.data.redirect_url) {
        setTimeout(() => { window.location.href = res.data.redirect_url; }, 1500);
      } else {
        setSubmitted(true);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { errors?: string[]; error?: string } } };
      setErrors(e.response?.data?.errors ?? [e.response?.data?.error ?? 'Submission failed']);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1,2,3].map(i => <div key={i} style={{ height: 40, background: '#f3f4f6', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />)}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !form) {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <p style={{ color: '#6b7280', textAlign: 'center' }}>This form is not available.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={wrapStyle}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 24 }}>✓</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Success!</h2>
          <p style={{ color: '#6b7280', margin: 0 }}>{successMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <div style={cardStyle}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: '0 0 6px', letterSpacing: '-0.02em' }}>{form.name}</h1>
          {form.description && <p style={{ color: '#6b7280', fontSize: 14, margin: 0, lineHeight: 1.5 }}>{form.description}</p>}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {form.fields.map(field => (
            <div key={field.id}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                {field.label}
                {field.required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
              </label>

              {field.type === 'textarea' ? (
                <textarea
                  placeholder={field.placeholder}
                  required={field.required}
                  value={String(values[field.id] ?? '')}
                  onChange={e => setValue(field.id, e.target.value)}
                  style={inputStyle}
                  rows={4}
                />
              ) : field.type === 'select' ? (
                <select
                  required={field.required}
                  value={String(values[field.id] ?? '')}
                  onChange={e => setValue(field.id, e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Select…</option>
                  {(field.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : field.type === 'checkbox' ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    required={field.required}
                    checked={Boolean(values[field.id])}
                    onChange={e => setValue(field.id, e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: '#6366f1' }}
                  />
                  <span style={{ fontSize: 13, color: '#374151' }}>{field.placeholder || field.label}</span>
                </label>
              ) : (
                <input
                  type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                  placeholder={field.placeholder}
                  required={field.required}
                  value={String(values[field.id] ?? '')}
                  onChange={e => setValue(field.id, e.target.value)}
                  style={inputStyle}
                />
              )}
            </div>
          ))}

          {errors.length > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 14px' }}>
              {errors.map((e, i) => <p key={i} style={{ color: '#dc2626', fontSize: 13, margin: i > 0 ? '4px 0 0' : 0 }}>{e}</p>)}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '12px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700,
              background: submitting ? '#e5e7eb' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: submitting ? '#9ca3af' : '#fff', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s', boxShadow: submitting ? 'none' : '0 4px 12px rgba(99,102,241,0.3)',
            }}
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </form>

        <p style={{ fontSize: 11, color: '#d1d5db', textAlign: 'center', marginTop: 24, marginBottom: 0 }}>
          Powered by AirPay Global
        </p>
      </div>
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#f9fafb',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '40px 16px',
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: '36px 32px',
  width: '100%',
  maxWidth: 520,
  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  fontSize: 14,
  color: '#111827',
  background: '#fff',
  outline: 'none',
  transition: 'border-color 0.15s',
  boxSizing: 'border-box',
};
