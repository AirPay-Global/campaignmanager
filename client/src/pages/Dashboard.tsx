import { useQuery } from '@tanstack/react-query';
import { Users, Megaphone, MessageSquare, TrendingUp, Loader2, AlertCircle } from 'lucide-react';
import api from '../lib/api';

interface Campaign {
  id: string;
  name: string;
  status: string;
}

interface Contact {
  id: string;
}

interface OutboundMessage {
  id: string;
  status: string;
  created_at: string;
}

interface MessagesResponse {
  data: OutboundMessage[];
  total?: number;
}

interface ContactsResponse {
  data: Contact[];
  total?: number;
}

interface CampaignsResponse {
  data: Campaign[];
  total?: number;
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  loading,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  loading?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin text-slate-400 inline" />
            ) : (
              value
            )}
          </p>
        </div>
        <div className={`p-3 rounded-xl ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const today = new Date().toISOString().split('T')[0];

  const { data: messagesData, isLoading: messagesLoading, isError: messagesError } = useQuery<MessagesResponse>({
    queryKey: ['messages-outbound'],
    queryFn: () =>
      api.get('/messages/outbound?limit=1000').then((r) => r.data),
  });

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery<CampaignsResponse>({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/campaigns').then((r) => r.data),
  });

  const { data: contactsData, isLoading: contactsLoading } = useQuery<ContactsResponse>({
    queryKey: ['contacts'],
    queryFn: () => api.get('/contacts').then((r) => r.data),
  });

  const messages: OutboundMessage[] = messagesData?.data ?? [];
  const campaigns: Campaign[] = campaignsData?.data ?? [];
  const contacts: Contact[] = contactsData?.data ?? [];

  const activeCampaigns = campaigns.filter((c) => c.status === 'active').length;

  const sentToday = messages.filter((m) => {
    const msgDate = m.created_at?.split('T')[0];
    return msgDate === today;
  }).length;

  const delivered = messages.filter((m) => m.status === 'delivered').length;
  const deliveryRate =
    messages.length > 0 ? Math.round((delivered / messages.length) * 100) : 0;

  const totalContacts =
    contactsData?.total ?? contacts.length;

  const isLoading = messagesLoading || campaignsLoading || contactsLoading;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Overview of your campaign activity</p>
      </div>

      {messagesError && (
        <div className="mb-6 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Some stats may be unavailable. Check your connection.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
        <StatCard
          title="Total Contacts"
          value={totalContacts}
          icon={Users}
          color="bg-blue-500"
          loading={contactsLoading}
        />
        <StatCard
          title="Active Campaigns"
          value={activeCampaigns}
          icon={Megaphone}
          color="bg-indigo-500"
          loading={campaignsLoading}
        />
        <StatCard
          title="Messages Sent Today"
          value={sentToday}
          icon={MessageSquare}
          color="bg-emerald-500"
          loading={messagesLoading}
        />
        <StatCard
          title="Delivery Rate"
          value={`${deliveryRate}%`}
          icon={TrendingUp}
          color="bg-violet-500"
          loading={messagesLoading}
        />
      </div>

      {/* Recent campaigns table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">Recent Campaigns</h2>
        </div>
        <div className="overflow-x-auto">
          {campaignsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              No campaigns yet. Create your first one.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                  <th className="text-left px-6 py-3 font-medium">Name</th>
                  <th className="text-left px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.slice(0, 5).map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-medium text-slate-700">{c.name}</td>
                    <td className="px-6 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isLoading && campaigns.length === 0 && contacts.length === 0 && (
        <p className="sr-only">Loading dashboard data…</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    active: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}
