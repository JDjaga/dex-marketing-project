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
  Pause,
  Play,
  Plus,
  Printer,
  Workflow as WorkflowIcon,
} from 'lucide-react';
import type {
  AutomationNode,
  AutomationRun,
  AutomationTriggerType,
  AutomationWorkflow,
} from '../../shared/types.ts';
import { api } from '../lib/api.ts';

interface AutomationAndAnalyticsViewProps {
  mode: 'automation' | 'analytics';
  workspaceId: string;
}

export const AutomationAndAnalyticsView: React.FC<AutomationAndAnalyticsViewProps> = ({
  mode,
  workspaceId,
}) => {
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [selectedWfId, setSelectedWfId] = useState<string>('');
  const [dashData, setDashData] = useState<Awaited<ReturnType<typeof api.getDashboard>> | null>(null);
  const [socialPosts, setSocialPosts] = useState<Awaited<ReturnType<typeof api.getSocial>>['posts']>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // New Workflow Builder
  const [wfName, setWfName] = useState('');
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>('contact_created');
  const [actionType, setActionType] = useState<'add_tag' | 'update_lifecycle' | 'create_notification' | 'sync_crm'>('add_tag');
  const [actionValue, setActionValue] = useState('');

  const loadData = async () => {
    try {
      const [autoRes, dRes, sRes] = await Promise.all([
        api.getAutomations(),
        api.getDashboard(),
        api.getSocial(),
      ]);
      setWorkflows(autoRes.workflows);
      setRuns(autoRes.runs);
      if (!selectedWfId && autoRes.workflows[0]) {
        setSelectedWfId(autoRes.workflows[0].id);
      }
      setDashData(dRes);
      setSocialPosts(sRes.posts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (mode === 'automation') {
    const selectedWf = workflows.find((w) => w.id === selectedWfId) || workflows[0];

    const handleCreateWorkflow = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!wfName.trim()) return;
      setError('');
      const resolvedVal = actionValue.trim() || 'marketing-qualified';
      const nodes: AutomationNode[] = [
        { id: 'n1', kind: 'trigger', label: `Trigger: ${triggerType.replace('_', ' ')}`, config: { triggerType }, x: 20, y: 40 },
        { id: 'n2', kind: 'condition', label: 'Condition: Opted In', config: { field: 'consentStatus', operator: 'equals', value: 'opted_in' }, x: 260, y: 40 },
        { id: 'n3', kind: 'action', label: `Action: ${actionType.replace('_', ' ')}`, config: { actionType, tag: resolvedVal, stage: resolvedVal, title: resolvedVal, note: resolvedVal }, x: 500, y: 40 },
      ];
      const edges = [
        { id: 'e1', sourceId: 'n1', targetId: 'n2', branchLabel: 'next' as const },
        { id: 'e2', sourceId: 'n2', targetId: 'n3', branchLabel: 'true' as const },
      ];
      try {
        const res = await api.createAutomation({
          name: wfName,
          workspaceId,
          triggerType,
          nodes,
          edges,
        });
        setWfName('');
        setActionValue('');
        setSelectedWfId(res.workflow.id);
        setNotice('Executable workflow created.');
        await loadData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create workflow');
      }
    };

    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#0A2472] flex items-center gap-2">
                <WorkflowIcon className="w-5 h-5 text-[#1D63ED]" /> Marketing Automation Engine
              </h2>
              <p className="text-xs text-slate-500">Every supported Trigger, Condition, Delay, Branch, and Action node executes real backend mutations.</p>
            </div>
          </div>

          <form onSubmit={handleCreateWorkflow} className="grid grid-cols-1 md:grid-cols-6 gap-2 pt-2 border-t border-slate-100">
            <input
              type="text"
              required
              value={wfName}
              onChange={(e) => setWfName(e.target.value)}
              placeholder="New workflow name..."
              className="md:col-span-2 px-3 py-2.5 text-base sm:text-xs border border-slate-200 rounded-lg"
            />
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as AutomationTriggerType)}
              className="px-2.5 py-2.5 text-base sm:text-xs border border-slate-200 rounded-lg bg-white"
            >
              <option value="contact_created">Trigger: Contact Created</option>
              <option value="link_clicked">Trigger: Link Clicked</option>
              <option value="email_opened">Trigger: Email Opened</option>
              <option value="campaign_sent">Trigger: Campaign Sent</option>
              <option value="social_published">Trigger: Social Published</option>
            </select>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as typeof actionType)}
              className="px-2.5 py-2.5 text-base sm:text-xs border border-slate-200 rounded-lg bg-white"
            >
              <option value="add_tag">Action: Add Tag</option>
              <option value="update_lifecycle">Action: Update Lifecycle</option>
              <option value="create_notification">Action: Notify Team</option>
              <option value="sync_crm">Action: Log CRM Activity</option>
            </select>
            <input
              type="text"
              value={actionValue}
              onChange={(e) => setActionValue(e.target.value)}
              placeholder="Tag / Value (optional)"
              className="px-3 py-2.5 text-base sm:text-xs border border-slate-200 rounded-lg"
            />
            <button
              type="submit"
              className="px-3 py-2.5 bg-[#1D63ED] text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1 cursor-pointer min-h-[42px]"
            >
              <Plus className="w-3.5 h-3.5" /> Create Flow
            </button>
          </form>
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
        {notice && <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-[#0A2472]">{notice}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-bold text-[#0A2472] mb-2">Workflows ({workflows.length})</h3>
            {workflows.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                No workflows created yet. Use the form above to build your first automation.
              </div>
            ) : (
              workflows.map((wf) => (
                <button
                  key={wf.id}
                  type="button"
                  onClick={() => setSelectedWfId(wf.id)}
                  className={`w-full text-left p-3 rounded-lg border cursor-pointer min-h-[44px] ${
                    selectedWf?.id === wf.id ? 'border-[#1D63ED] bg-[#F4F7FE]' : 'border-slate-200'
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-900">{wf.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5 capitalize">
                    {wf.status} · {wf.runCount} runs · {wf.triggerType.replace('_', ' ')}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="lg:col-span-8 space-y-6">
            {selectedWf && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[#0A2472]">{selectedWf.name}</h3>
                    <p className="text-xs text-slate-500">{selectedWf.description || 'Active multi-step workflow'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await api.toggleAutomation(selectedWf.id);
                        await loadData();
                      }}
                      className="flex-1 sm:flex-none px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer min-h-[38px]"
                    >
                      <Pause className="w-3.5 h-3.5" /> {selectedWf.status === 'active' ? 'Pause' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await api.executeAutomation(selectedWf.id);
                        setNotice(`Executed workflow "${selectedWf.name}" (${res.run.steps.length} nodes processed).`);
                        await loadData();
                      }}
                      className="flex-1 sm:flex-none px-3.5 py-2 bg-[#1D63ED] text-white rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer min-h-[38px]"
                    >
                      <Play className="w-3.5 h-3.5" /> Execute Test Run
                    </button>
                  </div>
                </div>

                {/* Visual Node Canvas */}
                <div className="p-4 bg-[#F4F7FE] border border-slate-200 rounded-xl overflow-x-auto">
                  <div className="flex items-center gap-3 min-w-max">
                    {selectedWf.nodes.map((node, idx) => (
                      <React.Fragment key={node.id}>
                        <div className="w-52 bg-white border border-slate-200 rounded-xl p-3 shadow-xs">
                          <div className="text-[10px] font-bold uppercase text-[#1D63ED]">{node.kind}</div>
                          <div className="text-xs font-semibold text-slate-900 mt-1">{node.label}</div>
                          <div className="text-[11px] font-mono text-slate-500 mt-1 truncate">
                            {Object.entries(node.config).map(([k, v]) => `${k}=${v}`).join(' · ')}
                          </div>
                        </div>
                        {idx < selectedWf.nodes.length - 1 && (
                          <span className="text-slate-400 font-bold">→</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
              <h3 className="text-sm font-bold text-[#0A2472]">Execution Run History</h3>
              {runs.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  No automation runs recorded yet. Create and execute a workflow to see step logs.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {runs.map((run) => (
                    <div key={run.id} className="py-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-900">{run.workflowName}</span>
                        <span className="font-mono text-green-700 capitalize">{run.status}</span>
                      </div>
                      <div className="text-xs text-slate-500">{run.triggerEvent}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                        {run.steps.map((st, idx) => (
                          <div key={idx} className="text-[11px] bg-slate-50 px-2.5 py-1.5 rounded border border-slate-100">
                            <strong>{st.nodeLabel}:</strong> {st.detail}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#0A2472]">Unified Cross-Channel Analytics & Executive Report</h2>
          <p className="text-xs text-slate-500">
            Email & Social performance aggregated transparently. Unavailable provider metrics are never fabricated as zero.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="w-full sm:w-auto px-3.5 py-2.5 bg-[#0A2472] text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer no-print min-h-[40px]"
        >
          <Printer className="w-3.5 h-3.5" /> Print / Save PDF Report
        </button>
      </div>

      {dashData && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Email Delivery Rate</div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-[#0A2472] tabular-nums mt-1">
                {dashData.kpis.deliveryRate !== null ? `${dashData.kpis.deliveryRate}%` : 'N/A'}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Email Open Rate</div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-[#1D63ED] tabular-nums mt-1">
                {dashData.kpis.openRate !== null ? `${dashData.kpis.openRate}%` : 'N/A'}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Email Click Rate</div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-[#0A2472] tabular-nums mt-1">
                {dashData.kpis.clickRate !== null ? `${dashData.kpis.clickRate}%` : 'N/A'}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Social Engagement</div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-[#D97706] tabular-nums mt-1">{dashData.kpis.socialEngagement}</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
            <h3 className="text-base font-bold text-[#0A2472] mb-4">Email Campaign Funnel Comparison</h3>
            {dashData.campaignComparison.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                No sent campaigns yet. Launch a campaign to see delivery and conversion charts.
              </div>
            ) : (
              <div className="h-64 sm:h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashData.campaignComparison}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="sent" name="Sent" fill="#0A2472" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="delivered" name="Delivered" fill="#1D63ED" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="conversions" name="Conversions" fill="#F5B400" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
            <h3 className="text-base font-bold text-[#0A2472] mb-3">Social Post Analytics Transparency</h3>
            {socialPosts.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">
                No social posts published yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 text-sm">
                {socialPosts.map((p) => (
                  <div key={p.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900">{p.title}</div>
                      <div className="text-xs text-slate-500">{p.platforms.join(' · ')} · {p.status}</div>
                    </div>
                    <div className="text-xs font-mono text-slate-700 tabular-nums">
                      {p.metricsAvailable && p.metrics
                        ? `Reach: ${p.metrics.reach ?? 'N/A'} · Likes: ${p.metrics.likes ?? 'N/A'} · Clicks: ${p.metrics.clicks ?? 'N/A'}`
                        : 'Not available from this connected provider.'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
