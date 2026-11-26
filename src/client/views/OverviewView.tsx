import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CalendarClock,
  Database,
  MailPlus,
  Search,
  Send,
  Share2,
  Sparkles,
  Users,
} from 'lucide-react';
import type { NavSectionId } from '../../shared/types.ts';
import { api } from '../lib/api.ts';

interface OverviewViewProps {
  onNavigate: (section: NavSectionId) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ onNavigate }) => {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getDashboard>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api
      .getDashboard()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700">
        {error || 'Dashboard metrics unavailable.'}
      </div>
    );
  }

  const k = data.kpis;
  const kpiCards = [
    { label: 'Total Audience', value: k.totalAudience.toLocaleString(), sub: 'Tenant-scoped contacts' },
    { label: 'Active Campaigns', value: k.activeCampaigns.toLocaleString(), sub: 'Scheduled & in-flight' },
    { label: 'Emails Sent', value: k.emailsSent.toLocaleString(), sub: 'Dispatched messages' },
    { label: 'Delivery Rate', value: `${k.deliveryRate}%`, sub: 'Delivered / Sent' },
    { label: 'Open Rate', value: `${k.openRate}%`, sub: 'Unique opens / Delivered' },
    { label: 'Click Rate', value: `${k.clickRate}%`, sub: 'Unique clicks / Delivered' },
    { label: 'Bounce Rate', value: `${k.bounceRate}%`, sub: 'Bounced / Sent' },
    { label: 'Unsubscribe Rate', value: `${k.unsubscribeRate}%`, sub: 'Unsubscribes / Delivered' },
    { label: 'Leads Discovered', value: k.leadsGenerated.toLocaleString(), sub: 'CRM & intelligence' },
    { label: 'Social Engagement', value: k.socialEngagement.toLocaleString(), sub: 'Likes · Comments · Shares' },
    { label: 'Scheduled Posts', value: k.scheduledPosts.toLocaleString(), sub: 'In publishing queue' },
    { label: 'Conversion Rate', value: `${k.conversionRate}%`, sub: 'Attributed events' },
  ];

  const quickActions: Array<{ label: string; section: NavSectionId; icon: React.ComponentType<{ className?: string }> }> = [
    { label: 'Create Email Campaign', section: 'email', icon: MailPlus },
    { label: 'Create Social Post', section: 'social', icon: Share2 },
    { label: 'Discover Leads', section: 'leads', icon: Search },
    { label: 'Create Segment', section: 'audience', icon: Users },
    { label: 'AI Content Studio', section: 'studio', icon: Sparkles },
    { label: 'Connect CRM (MCP)', section: 'crm', icon: Database },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header Hero Strip */}
      <div className="colakin-dot-canvas border border-slate-200 rounded-2xl p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0A2472] tracking-tight">
            Marketing Operations Overview
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Live metrics calculated directly from your organization’s records.{' '}
            {k.pendingApprovals > 0 ? `${k.pendingApprovals} item(s) awaiting approval.` : 'No pending approvals.'}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          {quickActions.map((qa) => {
            const Icon = qa.icon;
            return (
              <button
                key={qa.label}
                type="button"
                onClick={() => onNavigate(qa.section)}
                className="inline-flex items-center justify-center sm:justify-start gap-1.5 px-3 py-2.5 sm:py-2 rounded-lg bg-white border border-slate-200 hover:border-[#1D63ED] hover:text-[#1D63ED] text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{qa.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 12 KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
        {kpiCards.map((item) => (
          <div key={item.label} className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4">
            <div className="text-xs font-medium text-slate-500 truncate">{item.label}</div>
            <div className="mt-1 text-xl sm:text-2xl font-bold text-[#0A2472] tabular-nums font-mono">
              {item.value}
            </div>
            <div className="mt-1 text-[11px] text-slate-400 truncate">{item.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts + Upcoming Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-bold text-[#0A2472]">Campaign Performance Comparison</h2>
              <p className="text-xs text-slate-500">Sent vs. Delivered volume across your campaigns</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="text-xs font-semibold text-[#1D63ED] hover:underline cursor-pointer"
            >
              Full Analytics →
            </button>
          </div>
          {data.campaignComparison.length === 0 ? (
            <div className="h-56 sm:h-60 flex flex-col items-center justify-center text-center px-4 gap-3">
              <p className="text-sm text-slate-500">
                No campaigns created yet. Launch your first email campaign to track delivery metrics.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('email')}
                className="px-3.5 py-2 bg-[#1D63ED] text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Create First Campaign
              </button>
            </div>
          ) : (
            <div className="h-56 sm:h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.campaignComparison} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip />
                  <Bar dataKey="sent" name="Sent" fill="#1D63ED" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="delivered" name="Delivered" fill="#F5B400" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-[#0A2472]">Upcoming Schedule</h2>
              <CalendarClock className="w-4 h-4 text-[#1D63ED]" />
            </div>
            {data.upcomingScheduled.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">No scheduled campaigns or social posts.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.upcomingScheduled.slice(0, 5).map((item) => (
                  <div key={item.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{item.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {item.kind} · {new Date(item.scheduledAt).toLocaleString()}
                      </div>
                    </div>
                    <span className="text-xs font-medium text-[#1D63ED] shrink-0 capitalize">
                      {item.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            className="mt-4 w-full py-2.5 sm:py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:border-[#1D63ED] hover:text-[#1D63ED] transition-colors cursor-pointer"
          >
            Open Content Calendar
          </button>
        </div>
      </div>

      {/* Activity Feed & Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
          <h2 className="text-base font-bold text-[#0A2472] mb-4">Recent Organization Activity</h2>
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No activity logged yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentActivity.slice(0, 6).map((act) => (
                <div key={act.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-slate-900">{act.detail}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {act.actorName} ({act.actorRole}) · {act.action}
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0 tabular-nums">
                    {new Date(act.timestamp).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[#0A2472]">Operational Notifications</h2>
            <Send className="w-4 h-4 text-slate-400" />
          </div>
          {data.notifications.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No notifications yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.notifications.map((n) => (
                <div key={n.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{n.title}</span>
                    <span className="text-[11px] text-slate-400 capitalize">{n.category}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
