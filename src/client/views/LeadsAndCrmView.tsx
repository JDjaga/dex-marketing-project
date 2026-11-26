import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Database,
  ExternalLink,
  PlugZap,
  RefreshCw,
  Search,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import type { CRMIntegration, LeadCandidate, LeadSearch } from '../../shared/types.ts';
import { api } from '../lib/api.ts';

interface LeadsAndCrmViewProps {
  mode: 'leads' | 'crm';
  workspaceId: string;
}

export const LeadsAndCrmView: React.FC<LeadsAndCrmViewProps> = ({ mode, workspaceId }) => {
  const [searches, setSearches] = useState<LeadSearch[]>([]);
  const [candidates, setCandidates] = useState<LeadCandidate[]>([]);
  const [integrations, setIntegrations] = useState<CRMIntegration[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // MCP Interactive Query Runner
  const [selectedIntId, setSelectedIntId] = useState('');
  const [mcpTool, setMcpTool] = useState('search_contacts');
  const [mcpQuery, setMcpQuery] = useState('');
  const [mcpOutput, setMcpOutput] = useState('');
  const [customMcpName, setCustomMcpName] = useState('');
  const [customMcpUrl, setCustomMcpUrl] = useState('');

  const loadAll = async () => {
    try {
      const [leadRes, intRes] = await Promise.all([api.getLeads(), api.getIntegrations()]);
      setSearches(leadRes.searches);
      setCandidates(leadRes.candidates);
      setIntegrations(intRes.integrations);
      setSelectedIntId((prev) =>
        prev && intRes.integrations.some((i) => i.id === prev) ? prev : intRes.integrations[0]?.id || ''
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  if (mode === 'leads') {
    const handleDiscover = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim()) return;
      setLoading(true);
      setError('');
      setNotice('');
      try {
        const res = await api.discoverLeads(prompt, workspaceId);
        setNotice(`Matched ${res.candidates.length} lead candidate(s) using ${res.search.providerUsed}.`);
        await loadAll();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lead discovery failed');
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-[#0A2472] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#1D63ED]" /> AI Lead Intelligence & Enrichment
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Describe your Ideal Customer Profile in natural language. Matches are evaluated strictly against your connected CRM & Audience records—never fabricated private facts.
            </p>
          </div>
          <form onSubmit={handleDiscover} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Find healthcare or SaaS contacts in India..."
              className="w-full sm:flex-1 px-3.5 py-2.5 text-base sm:text-sm border border-slate-200 rounded-lg"
            />
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="w-full sm:w-auto px-4 py-2.5 bg-[#1D63ED] disabled:opacity-60 text-white text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
            >
              <Search className="w-4 h-4" />
              {loading ? 'Discovering...' : 'Discover Leads'}
            </button>
          </form>

          {searches[0] && (
            <div className="p-3 bg-[#F4F7FE] border border-blue-100 rounded-lg text-xs text-slate-700 flex flex-wrap gap-3 sm:gap-4">
              <span><strong>Industries:</strong> {searches[0].parsedCriteria.industries.join(', ') || 'Any'}</span>
              <span><strong>Geography:</strong> {searches[0].parsedCriteria.geography.join(', ') || 'Any'}</span>
              <span><strong>Size:</strong> {searches[0].parsedCriteria.companySize}</span>
              <span><strong>Titles:</strong> {searches[0].parsedCriteria.jobTitles.join(', ') || 'Any'}</span>
            </div>
          )}
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
        {notice && <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-[#0A2472]">{notice}</div>}

        {candidates.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
            No lead candidates matched yet. Add contacts in Audience or connect an MCP CRM integration, then run an AI Lead search above.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {candidates.map((cand) => (
              <div key={cand.id} className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-[#0A2472] break-words">{cand.companyName}</h3>
                      <div className="text-xs text-slate-500">
                        {cand.industry} · {cand.companySize} · {cand.location}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold font-mono text-[#1D63ED] tabular-nums">{cand.score}/100</div>
                      <div className="text-[11px] text-slate-500">Confidence {cand.confidence}%</div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-700">{cand.summary}</p>

                  <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1 break-words">
                    <div><strong>Contact Role:</strong> {cand.contactTitle} ({cand.publicEmail || 'No mailbox listed'})</div>
                    <div><strong>Provenance:</strong> {cand.sourceProvider} · Checked {new Date(cand.lastVerifiedAt).toLocaleDateString()}</div>
                    <div className="text-[#1D63ED] inline-flex items-center gap-1 break-all">
                      <ExternalLink className="w-3 h-3 shrink-0" /> {cand.sourceUrl}
                    </div>
                  </div>

                  <div className="text-xs text-slate-600">
                    <strong>Score Explanation:</strong> {cand.scoreBreakdown.explanation}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-slate-500 capitalize">
                    {cand.enrichmentStatus.replace(/_/g, ' ')}
                  </span>
                  <button
                    type="button"
                    disabled={cand.savedToContacts}
                    onClick={async () => {
                      await api.saveLeadToAudience(cand.id);
                      setNotice(`Saved ${cand.companyName} to Audience.`);
                      await loadAll();
                    }}
                    className="px-3 py-2 bg-[#0A2472] disabled:bg-slate-200 disabled:text-slate-500 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer min-h-[38px]"
                  >
                    {cand.savedToContacts ? <CheckCircle2 className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                    {cand.savedToContacts ? 'Saved to Audience' : 'Save to Audience'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#0A2472] flex items-center gap-2">
              <Database className="w-5 h-5 text-[#1D63ED]" /> MCP-First CRM Integrations
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Connect external CRMs via Model Context Protocol (MCP) JSON-RPC 2.0 or API adapters—keeping your CRM as the source of truth without CSV imports.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              setError('');
              try {
                await api.addBuiltinMcp();
                setNotice('Connected local MCP CRM endpoint.');
                await loadAll();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to register local MCP CRM');
              }
            }}
            className="w-full sm:w-auto px-3.5 py-2.5 bg-[#0A2472] text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] shrink-0"
          >
            <PlugZap className="w-3.5 h-3.5" /> + Connect Local MCP CRM
          </button>
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
        {notice && <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-[#0A2472]">{notice}</div>}

        {integrations.length === 0 ? (
          <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center text-sm text-slate-500">
            No CRM or MCP integrations connected yet. Connect the local MCP CRM endpoint above or register a custom HTTPS MCP server below.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.map((intg) => (
              <div key={intg.id} className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-500 uppercase">{intg.protocol}</span>
                    <span className="text-xs font-semibold capitalize text-[#1D63ED]">{intg.status}</span>
                  </div>
                  <h3 className="text-base font-bold text-[#0A2472] mt-1">{intg.name}</h3>
                  <p className="text-xs text-slate-600 mt-1">{intg.healthMessage}</p>
                  {intg.discoveredTools.length > 0 && (
                    <div className="mt-2 text-[11px] text-slate-500 break-words">
                      Tools: {intg.discoveredTools.map((t) => t.name).join(', ')}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await api.testIntegration(intg.id);
                      setNotice(`Tested ${intg.name} connection.`);
                      await loadAll();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Test connection failed');
                    }
                  }}
                  className="w-full py-2.5 border border-slate-200 rounded-lg text-xs font-semibold hover:border-[#1D63ED] hover:text-[#1D63ED] inline-flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Test & Discover Tools
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live MCP Tool Call Console + Register Custom MCP Endpoint */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
          <h3 className="text-base font-bold text-[#0A2472] flex items-center gap-2">
            <PlugZap className="w-4 h-4 text-[#1D63ED]" /> Live MCP Tool Invocation Console
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              value={selectedIntId}
              onChange={(e) => setSelectedIntId(e.target.value)}
              disabled={integrations.length === 0}
              className="px-3 py-2.5 text-base sm:text-xs border border-slate-200 rounded-lg bg-white"
            >
              {integrations.length === 0 ? (
                <option value="">No integrations connected</option>
              ) : (
                integrations.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))
              )}
            </select>
            <select
              value={mcpTool}
              onChange={(e) => setMcpTool(e.target.value)}
              className="px-3 py-2.5 text-base sm:text-xs border border-slate-200 rounded-lg bg-white"
            >
              <option value="search_contacts">search_contacts</option>
              <option value="search_companies">search_companies</option>
              <option value="get_crm_metadata">get_crm_metadata</option>
            </select>
            <input
              type="text"
              value={mcpQuery}
              onChange={(e) => setMcpQuery(e.target.value)}
              placeholder="Search query..."
              className="px-3 py-2.5 text-base sm:text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <button
            type="button"
            disabled={!selectedIntId}
            onClick={async () => {
              setError('');
              try {
                const res = await api.queryMcpTool(selectedIntId, mcpTool, { query: mcpQuery });
                setMcpOutput(JSON.stringify(res, null, 2));
              } catch (err) {
                setError(err instanceof Error ? err.message : 'MCP query failed');
              }
            }}
            className="w-full sm:w-auto px-4 py-2.5 bg-[#1D63ED] disabled:opacity-60 text-white text-xs font-semibold rounded-lg cursor-pointer min-h-[40px]"
          >
            Execute MCP tools/call
          </button>
          {mcpOutput && (
            <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto max-h-60">
              {mcpOutput}
            </pre>
          )}
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
          <h3 className="text-base font-bold text-[#0A2472]">Register Custom MCP CRM Server</h3>
          <p className="text-xs text-slate-500">Connect any compatible JSON-RPC 2.0 CRM MCP endpoint (SSRF-validated HTTPS URL).</p>
          <input
            type="text"
            value={customMcpName}
            onChange={(e) => setCustomMcpName(e.target.value)}
            placeholder="Connector Name"
            className="w-full px-3 py-2.5 text-base sm:text-xs border border-slate-200 rounded-lg"
          />
          <input
            type="url"
            value={customMcpUrl}
            onChange={(e) => setCustomMcpUrl(e.target.value)}
            placeholder="https://crm-mcp.yourcompany.com/rpc"
            className="w-full px-3 py-2.5 text-base sm:text-xs border border-slate-200 rounded-lg"
          />
          <button
            type="button"
            onClick={async () => {
              setError('');
              try {
                await api.addCustomMcp(customMcpName, customMcpUrl);
                setCustomMcpName('');
                setCustomMcpUrl('');
                setNotice('Custom MCP endpoint registered.');
                await loadAll();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Invalid MCP endpoint');
              }
            }}
            className="w-full py-2.5 bg-[#0A2472] text-white text-xs font-semibold rounded-lg cursor-pointer min-h-[42px]"
          >
            Register MCP Endpoint
          </button>
        </div>
      </div>
    </div>
  );
};
