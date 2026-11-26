import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Monitor,
  Pause,
  Play,
  Plus,
  Send,
  ShieldAlert,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import type {
  Campaign,
  CampaignMetrics,
  CampaignType,
  EmailTemplate,
  Segment,
} from '../../shared/types.ts';
import { api } from '../lib/api.ts';

interface CampaignsAndEmailViewProps {
  workspaceId: string;
  initialMode?: 'list' | 'wizard';
}

const CAMPAIGN_TYPES: Array<{ id: CampaignType; label: string }> = [
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'promotional', label: 'Promotional' },
  { id: 'announcement', label: 'Announcement' },
  { id: 'product_launch', label: 'Product Launch' },
  { id: 'event_invitation', label: 'Event Invitation' },
  { id: 'welcome', label: 'Welcome Email' },
  { id: 'follow_up', label: 'Follow-up' },
  { id: 'cold_outreach', label: 'Cold Outreach' },
  { id: 're_engagement', label: 'Re-engagement' },
];

export const CampaignsAndEmailView: React.FC<CampaignsAndEmailViewProps> = ({
  workspaceId,
  initialMode = 'list',
}) => {
  const [campaigns, setCampaigns] = useState<Array<Campaign & { metrics: CampaignMetrics }>>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [view, setView] = useState<'list' | 'wizard' | 'templates' | 'analytics'>(initialMode);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [analyticsData, setAnalyticsData] = useState<Awaited<ReturnType<typeof api.getCampaignAnalytics>> | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  // 6-Step Wizard State
  const [step, setStep] = useState(1);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [complianceReport, setComplianceReport] = useState<Awaited<ReturnType<typeof api.checkCampaignCompliance>> | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'product_launch' as CampaignType,
    objective: '',
    audienceType: 'all_subscribed' as 'segment' | 'crm' | 'all_subscribed' | 'manual',
    segmentId: '',
    subject: '',
    previewText: '',
    senderName: '',
    senderEmail: '',
    replyTo: '',
    htmlBody: '',
    textBody: '',
    trackOpens: true,
    trackClicks: true,
    trackDeliveries: true,
    scheduledAt: '',
  });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [campRes, segRes] = await Promise.all([api.getCampaigns(), api.getSegments()]);
      setCampaigns(campRes.campaigns);
      setTemplates(campRes.templates);
      setSegments(segRes.segments);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    setView(initialMode);
  }, [initialMode]);

  const openAnalytics = async (id: string) => {
    setError('');
    setAiAnalysis('');
    try {
      const res = await api.getCampaignAnalytics(id);
      setAnalyticsData(res);
      setSelectedCampaignId(id);
      setView('analytics');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load analytics');
    }
  };

  const handleRunAi = async (kind: 'email_subject' | 'email_body' | 'email_rewrite') => {
    setAiBusy(true);
    setError('');
    try {
      const res = await api.generateAI({
        kind,
        prompt: kind === 'email_rewrite' ? form.htmlBody : aiPrompt,
        objective: form.objective,
        tone: 'Executive B2B Clarity',
      });
      if (kind === 'email_subject') {
        const firstLine = res.text.split('\n')[0]?.replace(/^\d+\.\s*/, '').trim();
        if (firstLine) setForm((f) => ({ ...f, subject: firstLine }));
        setFeedback(`AI (${res.provider}) generated subject suggestions.`);
      } else {
        setForm((f) => ({ ...f, htmlBody: res.text }));
        setFeedback(`AI (${res.provider}) updated email body.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI generation error');
    } finally {
      setAiBusy(false);
    }
  };

  const handleSaveDraftAndCheck = async (): Promise<string | null> => {
    setError('');
    try {
      let id = createdId;
      if (!id) {
        const res = await api.createCampaign({ ...form, workspaceId });
        id = res.campaign.id;
        setCreatedId(id);
      }
      const check = await api.checkCampaignCompliance(id);
      setComplianceReport(check);
      await loadAll();
      return id;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save campaign');
      return null;
    }
  };

  const handleAction = async (id: string, action: 'send' | 'submit' | 'schedule' | 'pause') => {
    setError('');
    setFeedback('');
    try {
      if (action === 'send') {
        const res = await api.sendCampaign(id);
        setFeedback(
          res.simulated
            ? `Simulated delivery completed for ${res.sentCount} recipients (Demo Mode).`
            : `Campaign dispatched to ${res.sentCount} recipients.`
        );
      } else if (action === 'submit') {
        await api.submitCampaignApproval(id);
        setFeedback('Submitted campaign for Marketing Manager approval.');
      } else if (action === 'schedule') {
        await api.scheduleCampaign(id, form.scheduledAt || new Date(Date.now() + 3600000).toISOString());
        setFeedback('Campaign scheduled in UTC.');
      } else if (action === 'pause') {
        await api.pauseCampaign(id);
        setFeedback('Campaign paused.');
      }
      await loadAll();
      setView('list');
      setCreatedId(null);
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    }
  };

  const renderPreviewText = (raw: string) =>
    raw
      .replace(/\{\{\s*first_name[^}]*\}\}/g, 'Alex')
      .replace(/\{\{\s*company[^}]*\}\}/g, 'Your Company')
      .replace(/\{\{\s*location[^}]*\}\}/g, 'Your Region')
      .replace(/\{\{\s*industry[^}]*\}\}/g, 'Your Industry')
      .replace(/\{\{\s*custom_field\|([^}]*)\}\}/g, '$1');

  const formatRate = (rate: number | null) => (rate === null ? 'N/A' : `${(rate * 100).toFixed(1)}%`);

  return (
    <div className="space-y-6">
      {/* Top Sub-navigation */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setView('list')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
              view === 'list' ? 'bg-white text-[#0A2472] shadow-sm' : 'text-slate-600'
            }`}
          >
            All Campaigns ({campaigns.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setCreatedId(null);
              setStep(1);
              setView('wizard');
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
              view === 'wizard' ? 'bg-white text-[#0A2472] shadow-sm' : 'text-slate-600'
            }`}
          >
            Campaign Wizard
          </button>
          <button
            type="button"
            onClick={() => setView('templates')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
              view === 'templates' ? 'bg-white text-[#0A2472] shadow-sm' : 'text-slate-600'
            }`}
          >
            Templates ({templates.length})
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setCreatedId(null);
            setStep(1);
            setView('wizard');
          }}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 bg-[#1D63ED] hover:bg-[#1752C9] text-white text-xs font-semibold rounded-lg cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> New Email Campaign
        </button>
      </div>

      {error && <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
      {feedback && <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-sm text-[#0A2472]">{feedback}</div>}

      {/* CAMPAIGN LIST VIEW */}
      {view === 'list' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-[#0A2472]">Email Campaigns</h2>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white"
            >
              <option value="all">All Campaign Types</option>
              {CAMPAIGN_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">Loading campaigns...</div>
          ) : campaigns.filter((c) => filterType === 'all' || c.type === filterType).length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm text-slate-500">No email campaigns created yet.</p>
              <button
                type="button"
                onClick={() => {
                  setCreatedId(null);
                  setStep(1);
                  setView('wizard');
                }}
                className="px-4 py-2 bg-[#1D63ED] text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Build First Campaign
              </button>
            </div>
          ) : (
            <>
              {/* Mobile Card List */}
              <div className="md:hidden divide-y divide-slate-100">
                {campaigns
                  .filter((c) => filterType === 'all' || c.type === filterType)
                  .map((c) => (
                    <div key={c.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">{c.name}</div>
                          <div className="text-xs text-slate-500 truncate">{c.subject}</div>
                        </div>
                        <span className="text-xs font-semibold capitalize text-[#1D63ED] shrink-0">
                          {c.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums bg-slate-50 p-2.5 rounded-lg">
                        <div>Sent: <strong>{c.metrics.sent}</strong></div>
                        <div>Open: <strong>{formatRate(c.metrics.openRate)}</strong></div>
                        <div>Click: <strong>{formatRate(c.metrics.clickRate)}</strong></div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openAnalytics(c.id)}
                          className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md cursor-pointer"
                        >
                          Analytics
                        </button>
                        {c.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => handleAction(c.id, 'submit')}
                            className="px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 rounded-md cursor-pointer"
                          >
                            Submit Approval
                          </button>
                        )}
                        {['approved', 'scheduled', 'draft'].includes(c.status) && (
                          <button
                            type="button"
                            onClick={() => handleAction(c.id, 'send')}
                            className="px-3 py-1.5 text-xs font-semibold bg-[#1D63ED] text-white rounded-md cursor-pointer"
                          >
                            Send Now
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-slate-50">
                      <th className="py-3 px-4">Campaign</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Sent</th>
                      <th className="py-3 px-4 text-right">Open Rate</th>
                      <th className="py-3 px-4 text-right">Click Rate</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {campaigns
                      .filter((c) => filterType === 'all' || c.type === filterType)
                      .map((c) => (
                        <tr key={c.id} className="hover:bg-[#F4F7FE]/60">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{c.name}</div>
                            <div className="text-xs text-slate-500 truncate max-w-md">
                              {c.subject} · Owner: {c.ownerName}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600 capitalize">{c.type.replace('_', ' ')}</td>
                          <td className="py-3 px-4 text-xs font-semibold capitalize text-[#1D63ED]">
                            {c.status.replace('_', ' ')}
                            {c.isDemoSimulated ? ' (Sim)' : ''}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">{c.metrics.sent}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">{formatRate(c.metrics.openRate)}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">{formatRate(c.metrics.clickRate)}</td>
                          <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openAnalytics(c.id)}
                              className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-md hover:border-[#1D63ED] hover:text-[#1D63ED] cursor-pointer"
                            >
                              Analytics
                            </button>
                            {c.status === 'draft' && (
                              <button
                                type="button"
                                onClick={() => handleAction(c.id, 'submit')}
                                className="px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 rounded-md cursor-pointer"
                              >
                                Submit Approval
                              </button>
                            )}
                            {['approved', 'scheduled', 'draft'].includes(c.status) && (
                              <button
                                type="button"
                                onClick={() => handleAction(c.id, 'send')}
                                className="px-2.5 py-1 text-xs font-semibold bg-[#1D63ED] text-white rounded-md cursor-pointer"
                              >
                                Send Now
                              </button>
                            )}
                            {c.status === 'sending' && (
                              <button
                                type="button"
                                onClick={() => handleAction(c.id, 'pause')}
                                className="px-2.5 py-1 text-xs font-semibold bg-slate-800 text-white rounded-md cursor-pointer"
                              >
                                <Pause className="w-3 h-3 inline mr-1" /> Pause
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* 6-STEP CAMPAIGN WIZARD */}
      {view === 'wizard' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-[#0A2472]">6-Step Email Campaign Wizard</h2>
              <p className="text-xs text-slate-500">Step {step} of 6 · Complete workflow with compliance validation</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['1. Details', '2. Audience', '3. Content', '4. Tracking', '5. Review', '6. Execute'].map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setStep(idx + 1)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    step === idx + 1 ? 'bg-[#1D63ED] text-white dex-tab-active' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Campaign Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Q4 DeX Enterprise Outreach"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Campaign Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as CampaignType })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {CAMPAIGN_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Objective</label>
                <input
                  type="text"
                  value={form.objective}
                  onChange={(e) => setForm({ ...form, objective: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Internal Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { id: 'all_subscribed', title: 'All Subscribed Contacts', desc: 'Excludes unsubscribed & suppressed' },
                  { id: 'segment', title: 'Saved Dynamic Segment', desc: 'Target a filtered audience segment' },
                  { id: 'crm', title: 'MCP CRM-Synced Contacts', desc: 'Contacts linked to external CRM' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setForm({ ...form, audienceType: opt.id as typeof form.audienceType })}
                    className={`p-4 rounded-xl border text-left cursor-pointer ${
                      form.audienceType === opt.id ? 'border-[#1D63ED] bg-[#F4F7FE]' : 'border-slate-200'
                    }`}
                  >
                    <div className="text-sm font-semibold text-slate-900">{opt.title}</div>
                    <div className="text-xs text-slate-500 mt-1">{opt.desc}</div>
                  </button>
                ))}
              </div>

              {form.audienceType === 'segment' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Select Segment</label>
                  <select
                    value={form.segmentId}
                    onChange={(e) => setForm({ ...form, segmentId: e.target.value })}
                    className="w-full md:w-96 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="">Choose a segment...</option>
                    {segments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.cachedCount} contacts)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4">
                <div className="p-3.5 bg-[#F4F7FE] border border-blue-100 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#0A2472] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#1D63ED]" /> AI Content Assistant (Brand Kit Grounded)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      className="flex-1 min-w-[200px] px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    />
                    <button
                      type="button"
                      disabled={aiBusy}
                      onClick={() => handleRunAi('email_subject')}
                      className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:border-[#1D63ED] cursor-pointer"
                    >
                      Suggest Subject
                    </button>
                    <button
                      type="button"
                      disabled={aiBusy}
                      onClick={() => handleRunAi('email_body')}
                      className="px-2.5 py-1.5 text-xs font-semibold bg-[#1D63ED] text-white rounded-lg cursor-pointer"
                    >
                      {aiBusy ? 'Generating...' : 'Generate Body'}
                    </button>
                    <button
                      type="button"
                      disabled={aiBusy}
                      onClick={() => handleRunAi('email_rewrite')}
                      className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg cursor-pointer"
                    >
                      Rewrite
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Sender Name</label>
                    <input
                      type="text"
                      value={form.senderName}
                      onChange={(e) => setForm({ ...form, senderName: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Sender Email</label>
                    <input
                      type="email"
                      value={form.senderEmail}
                      onChange={(e) => setForm({ ...form, senderEmail: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Subject Line</label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    HTML Email Body (Supports {'{{first_name}}'}, {'{{company}}'}, {'{{location}}'}, {'{{custom_field|fallback}}'})
                  </label>
                  <textarea
                    rows={8}
                    value={form.htmlBody}
                    onChange={(e) => setForm({ ...form, htmlBody: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* Live Desktop / Mobile Preview */}
              <div className="lg:col-span-5 border border-slate-200 rounded-xl p-4 bg-slate-50">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" /> Personalized Preview
                  </span>
                  <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setPreviewMode('desktop')}
                      className={`p-1.5 rounded cursor-pointer ${previewMode === 'desktop' ? 'bg-[#1D63ED] text-white' : 'text-slate-500'}`}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode('mobile')}
                      className={`p-1.5 rounded cursor-pointer ${previewMode === 'mobile' ? 'bg-[#1D63ED] text-white' : 'text-slate-500'}`}
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div
                  className={`mx-auto bg-white border border-slate-200 rounded-lg p-4 transition-all ${
                    previewMode === 'mobile' ? 'max-w-[320px]' : 'w-full'
                  }`}
                >
                  <div className="text-xs text-slate-500 border-b border-slate-100 pb-2 mb-3">
                    <div><strong>From:</strong> {form.senderName} &lt;{form.senderEmail}&gt;</div>
                    <div><strong>Subject:</strong> {renderPreviewText(form.subject)}</div>
                  </div>
                  <div
                    className="text-sm text-slate-800 space-y-2 prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: renderPreviewText(form.htmlBody) }}
                  />
                  <div className="mt-6 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
                    Sent via DEX Marketing by Colakin · Unsubscribe link automatically appended
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 max-w-2xl">
              <h3 className="text-sm font-bold text-[#0A2472]">Tracking & Privacy Configuration</h3>
              <label className="flex items-start gap-3 p-3.5 border border-slate-200 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.trackDeliveries}
                  onChange={(e) => setForm({ ...form, trackDeliveries: e.target.checked })}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-semibold text-slate-900">Delivery & Bounce Tracking</div>
                  <div className="text-xs text-slate-500">Records delivered, bounced, and failed delivery attempts.</div>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3.5 border border-slate-200 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.trackOpens}
                  onChange={(e) => setForm({ ...form, trackOpens: e.target.checked })}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-semibold text-slate-900">Open Tracking (1x1 Pixel)</div>
                  <div className="text-xs text-slate-500">
                    Uses an embedded tracking pixel (`/t/open/:id.png`). Note: Apple Mail Privacy Protection and image blockers may inflate or hide open counts.
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3.5 border border-slate-200 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.trackClicks}
                  onChange={(e) => setForm({ ...form, trackClicks: e.target.checked })}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-semibold text-slate-900">Click Tracking (Validated Redirects)</div>
                  <div className="text-xs text-slate-500">
                    Rewrites validated `http`/`https` links via `/t/click/:id` with SSRF protection.
                  </div>
                </div>
              </label>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#0A2472]">Pre-Send Compliance & Suppression Check</h3>
                <button
                  type="button"
                  onClick={handleSaveDraftAndCheck}
                  className="px-3.5 py-2 bg-[#1D63ED] text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Save Draft & Run Compliance Validation
                </button>
              </div>
              {complianceReport ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border border-slate-200 rounded-xl space-y-2">
                    <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      {complianceReport.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 text-red-600" />
                      )}
                      {complianceReport.passed ? 'Compliance Passed' : 'Compliance Blocked'}
                    </div>
                    {complianceReport.blockers.map((b) => (
                      <div key={b} className="text-xs text-red-600">• {b}</div>
                    ))}
                    {complianceReport.warnings.map((w) => (
                      <div key={w} className="text-xs text-amber-700">• Warning: {w}</div>
                    ))}
                  </div>
                  <div className="p-4 border border-slate-200 rounded-xl text-xs space-y-1 font-mono tabular-nums">
                    <div>Eligible Recipients: <strong>{complianceReport.audienceSummary.eligibleCount}</strong></div>
                    <div>Suppressed Filtered: {complianceReport.audienceSummary.suppressedCount}</div>
                    <div>Unsubscribed Filtered: {complianceReport.audienceSummary.unsubscribedCount}</div>
                    <div>Duplicates Removed: {complianceReport.audienceSummary.duplicateCount}</div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Click "Save Draft & Run Compliance Validation" to verify consent and suppression exclusions.</p>
              )}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4 max-w-xl">
              <h3 className="text-sm font-bold text-[#0A2472]">Schedule or Execute Campaign</h3>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Optional Schedule Date/Time (Local → UTC)</label>
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    const id = createdId || (await handleSaveDraftAndCheck());
                    if (id) await handleAction(id, 'submit');
                  }}
                  className="px-4 py-2 bg-amber-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Submit for Approval
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const id = createdId || (await handleSaveDraftAndCheck());
                    if (id) await handleAction(id, 'schedule');
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-800 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Schedule Send
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const id = createdId || (await handleSaveDraftAndCheck());
                    if (id) await handleAction(id, 'send');
                  }}
                  className="px-4 py-2 bg-[#1D63ED] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" /> Execute Campaign Now
                </button>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 flex justify-between">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="px-4 py-2 text-xs font-semibold border border-slate-200 rounded-lg disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(6, s + 1))}
              className="px-4 py-2 text-xs font-semibold bg-[#0A2472] text-white rounded-lg cursor-pointer"
            >
              Next Step
            </button>
          </div>
        </div>
      )}

      {/* TEMPLATES VIEW */}
      {view === 'templates' && (
        templates.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
            <p className="text-sm text-slate-500">No saved email templates yet.</p>
            <button
              type="button"
              onClick={() => {
                setCreatedId(null);
                setStep(1);
                setView('wizard');
              }}
              className="px-4 py-2 bg-[#1D63ED] text-white text-xs font-semibold rounded-lg cursor-pointer"
            >
              Create Campaign in Wizard
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((tpl) => (
              <div key={tpl.id} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="text-xs text-slate-500 capitalize">{tpl.category.replace('_', ' ')}</div>
                  <h3 className="text-base font-bold text-[#0A2472] mt-1">{tpl.name}</h3>
                  <div className="text-xs text-slate-600 mt-2">Subject: {tpl.subject}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setForm((f) => ({
                      ...f,
                      name: `${tpl.name} Copy`,
                      type: tpl.category,
                      subject: tpl.subject,
                      previewText: tpl.previewText,
                      htmlBody: tpl.htmlBody,
                      textBody: tpl.textBody,
                    }));
                    setView('wizard');
                    setStep(3);
                  }}
                  className="mt-4 px-3 py-2 bg-[#F4F7FE] text-[#1D63ED] text-xs font-semibold rounded-lg hover:bg-[#EAF1FF] cursor-pointer"
                >
                  <Play className="w-3 h-3 inline mr-1" /> Use Template in Wizard
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* DEDICATED CAMPAIGN ANALYTICS VIEW */}
      {view === 'analytics' && analyticsData && selectedCampaignId && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setView('list')}
                className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-[#0A2472]">{analyticsData.campaign.name}</h2>
                <p className="text-xs text-slate-500">
                  {analyticsData.campaign.type.replace('_', ' ')} · {analyticsData.campaign.isDemoSimulated ? 'Simulated Metrics' : 'Live Provider Metrics'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                const res = await api.analyzeCampaignAI(selectedCampaignId);
                setAiAnalysis(res.text);
              }}
              className="px-3.5 py-2 bg-[#1D63ED] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Explain Performance with AI
            </button>
          </div>

          {aiAnalysis && (
            <div className="bg-[#F4F7FE] border border-blue-200 rounded-xl p-4 text-sm text-[#0A2472] whitespace-pre-line">
              {aiAnalysis}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {[
              { label: 'Sent', val: analyticsData.metrics.sent },
              { label: 'Delivered', val: analyticsData.metrics.delivered },
              { label: 'Delivery Rate', val: formatRate(analyticsData.metrics.deliveryRate) },
              { label: 'Open Rate', val: formatRate(analyticsData.metrics.openRate) },
              { label: 'Click Rate', val: formatRate(analyticsData.metrics.clickRate) },
              { label: 'CTOR', val: formatRate(analyticsData.metrics.clickToOpenRate) },
            ].map((m) => (
              <div key={m.label} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">{m.label}</div>
                <div className="text-xl font-bold text-[#0A2472] font-mono tabular-nums mt-1">{m.val}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-bold text-[#0A2472] mb-3">Link Click Performance</h3>
              {analyticsData.links.length === 0 ? (
                <p className="text-xs text-slate-500">No link clicks recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {analyticsData.links.map((l) => (
                    <div key={l.url} className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                      <span className="truncate max-w-xs text-slate-700">{l.url}</span>
                      <span className="font-mono font-semibold text-[#1D63ED]">{l.clicks} clicks</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-bold text-[#0A2472] mb-3">Device Breakdown</h3>
              {analyticsData.devices.length === 0 ? (
                <p className="text-xs text-slate-500">No device open telemetry yet.</p>
              ) : (
                <div className="space-y-2">
                  {analyticsData.devices.map((d) => (
                    <div key={d.device} className="flex items-center justify-between text-xs border-b border-slate-100 pb-2 capitalize">
                      <span>{d.device}</span>
                      <span className="font-mono font-semibold">{d.count} opens</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
