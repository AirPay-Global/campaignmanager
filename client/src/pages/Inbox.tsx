import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Inbox, ChevronDown, MessageCircle, Phone, Mail } from 'lucide-react';
import api from '../lib/api';

interface InboundMessage {
  id: string;
  channel: string;
  sender_id: string;
  body?: string;
  created_at: string;
  contact_id?: string;
  metadata?: Record<string, unknown>;
}

interface InboundResponse {
  data: InboundMessage[];
  total: number;
  totalPages: number;
}

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: '#22c55e',
  sms: '#60a5fa',
  email: '#c084fc',
};

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle size={11} />,
  sms: <Phone size={11} />,
  email: <Mail size={11} />,
};

export default function InboxPage() {
  const [channel, setChannel] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<InboundResponse>({
    queryKey: ['messages-inbound', page, channel],
    queryFn: () =>
      api
        .get('/messages/inbound', {
          params: { page, limit: 30, ...(channel ? { channel } : {}) },
        })
        .then(r => r.data),
  });

  const channelColor = (ch: string) => CHANNEL_COLORS[ch.toLowerCase()] ?? 'rgba(255,255,255,0.4)';
  const channelIcon  = (ch: string) => CHANNEL_ICONS[ch.toLowerCase()] ?? <MessageCircle size={11} />;

  return (
    <div style={{ padding: '32px', minHeight: '100vh', background: '#06060f', position: 'relative' }}>
      <div className="aurora-bg" />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div className="animate-fade-in-up" style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.04em', margin: 0 }}>Inbox</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Inbound messages from your contacts</p>
        </div>

        {/* Channel filter */}
        <div className="animate-fade-in-up stagger-1" style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <ChevronDown size={12} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <select
              value={channel}
              onChange={e => { setChannel(e.target.value); setPage(1); }}
              className="select-glass"
              style={{ paddingRight: 30, width: 'auto', minWidth: 160 }}
            >
              <option value="">All Channels</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="glass animate-fade-in-up stagger-2" style={{ overflow: 'hidden', borderRadius: 16 }}>
          {isLoading ? (
            <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="skeleton" style={{ height: 18, width: `${45 + i * 8}%` }} />
              ))}
            </div>
          ) : !data?.data?.length ? (
            <div style={{ padding: '56px 24px', textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Inbox size={22} color="rgba(255,255,255,0.2)" />
              </div>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, margin: 0 }}>No inbound messages yet.</p>
            </div>
          ) : (
            <table className="glass-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>From</th>
                  <th>Message</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map(msg => {
                  const color = channelColor(msg.channel);
                  return (
                    <tr key={msg.id}>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                          color, background: `${color}14`, padding: '3px 9px',
                          borderRadius: 6, border: `1px solid ${color}30`,
                        }}>
                          {channelIcon(msg.channel)}
                          {msg.channel}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                        {msg.sender_id}
                      </td>
                      <td style={{ maxWidth: 340 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>
                          {msg.body ?? <span style={{ color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>no content</span>}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
                        {new Date(msg.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            {Array.from({ length: data.totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                style={{
                  width: 34, height: 34, borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: p === page ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.07)',
                  background: p === page ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                  color: p === page ? '#818cf8' : 'rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
