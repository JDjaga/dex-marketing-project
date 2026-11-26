import React, { useEffect, useState } from 'react';
import { Check, MessageSquare, Palette, RotateCcw, X } from 'lucide-react';
import type { ApprovalItem, BrandKit, RoleName } from '../../shared/types.ts';
import { hasPermission } from '../../shared/types.ts';
import { api } from '../lib/api.ts';

interface ApprovalsAndBrandViewProps {
  mode: 'approvals' | 'brand';
  userRole: RoleName;
}

export const ApprovalsAndBrandView: React.FC<ApprovalsAndBrandViewProps> = ({ mode, userRole }) => {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const canApprove = hasPermission(userRole, 'campaign:approve');
  const canEditBrand = hasPermission(userRole, 'brand:manage');

  const loadData = async () => {
    try {
      const [appRes, bkRes] = await Promise.all([api.getApprovals(), api.getBrandKits()]);
      setApprovals(appRes.approvals);
      setBrandKits(bkRes.brandKits);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDecision = async (id: string, decision: 'approved' | 'rejected' | 'changes_requested') => {
    setError('');
    setNotice('');
    try {
      await api.decideApproval(id, decision, reviewNote[id] || undefined);
      setNotice(`Item marked as ${decision.replace('_', ' ')}.`);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decision blocked by RBAC permissions');
    }
  };

  const activeKit = brandKits[0];
  const [kitDraft, setKitDraft] = useState<BrandKit | null>(null);

  useEffect(() => {
    if (activeKit) setKitDraft(activeKit);
  }, [activeKit]);

  if (mode === 'approvals') {
    const filtered = approvals.filter((a) => filter === 'all' || a.status === filter);
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#0A2472]">Campaign & Content Approval Queue</h2>
            <p className="text-xs text-slate-500">
              Signed-in role: <strong>{userRole}</strong> · {canApprove ? 'Authorized to approve or reject' : 'Read-only reviewer view (Campaign Editors cannot self-approve)'}
            </p>
          </div>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto max-w-full">
            {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-semibold rounded capitalize cursor-pointer min-h-[34px] ${
                  filter === f ? 'bg-white text-[#0A2472] shadow-sm' : 'text-slate-600'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
        {notice && <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-[#0A2472]">{notice}</div>}

        <div className="space-y-4">
          {filtered.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
              No approval items match this filter yet.
            </div>
          ) : (
            filtered.map((item) => (
              <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500 capitalize">
                      {item.entityType.replace('_', ' ')} · Requested by {item.requestedByName}
                    </div>
                    <h3 className="text-base font-bold text-[#0A2472] mt-0.5 break-words">{item.entityTitle}</h3>
                  </div>
                  <span className="text-xs font-semibold capitalize px-2.5 py-1 bg-slate-100 rounded-md text-slate-800">
                    {item.status.replace('_', ' ')}
                  </span>
                </div>

                {item.comments.length > 0 && (
                  <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg">
                    {item.comments.map((c) => (
                      <div key={c.id} className="text-xs text-slate-700 flex items-start gap-2">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                        <div>
                          <strong>{c.authorName}:</strong> {c.body}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="text-xs text-slate-500 space-y-1">
                  <div className="font-semibold text-slate-700">Revision History</div>
                  {item.history.map((h) => (
                    <div key={h.id}>
                      • {h.action} by {h.actorName} ({new Date(h.timestamp).toLocaleString()}){h.note ? ` — "${h.note}"` : ''}
                    </div>
                  ))}
                </div>

                {item.status === 'pending' && canApprove && (
                  <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-2">
                    <input
                      type="text"
                      value={reviewNote[item.id] || ''}
                      onChange={(e) => setReviewNote({ ...reviewNote, [item.id]: e.target.value })}
                      placeholder="Reviewer comment or revision feedback..."
                      className="w-full sm:flex-1 px-3 py-2 text-base sm:text-xs border border-slate-200 rounded-lg"
                    />
                    <div className="grid grid-cols-3 sm:flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleDecision(item.id, 'changes_requested')}
                        className="px-3 py-2 text-xs font-semibold border border-amber-300 text-amber-800 rounded-lg inline-flex items-center justify-center gap-1 cursor-pointer min-h-[40px]"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> <span className="truncate">Revise</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecision(item.id, 'rejected')}
                        className="px-3 py-2 text-xs font-semibold border border-red-200 text-red-700 rounded-lg inline-flex items-center justify-center gap-1 cursor-pointer min-h-[40px]"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecision(item.id, 'approved')}
                        className="px-3.5 py-2 text-xs font-semibold bg-[#1D63ED] text-white rounded-lg inline-flex items-center justify-center gap-1 cursor-pointer min-h-[40px]"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-[#0A2472] flex items-center gap-2">
            <Palette className="w-5 h-5 text-[#1D63ED]" /> Brand Kit & AI Voice Guidelines
          </h2>
          <p className="text-xs text-slate-500">All AI email and social generations automatically inject these guidelines.</p>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
      {notice && <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-[#0A2472]">{notice}</div>}

      {!kitDraft ? (
        <div className="py-8 text-center text-sm text-slate-500">
          No Brand Kit configured for this organization yet.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Brand Name</label>
              <input
                type="text"
                disabled={!canEditBrand}
                value={kitDraft.name}
                onChange={(e) => setKitDraft({ ...kitDraft, name: e.target.value })}
                className="w-full px-3 py-2.5 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Primary</label>
                <input
                  type="color"
                  disabled={!canEditBrand}
                  value={kitDraft.primaryColor}
                  onChange={(e) => setKitDraft({ ...kitDraft, primaryColor: e.target.value })}
                  className="w-full h-10 rounded border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Navy</label>
                <input
                  type="color"
                  disabled={!canEditBrand}
                  value={kitDraft.secondaryColor}
                  onChange={(e) => setKitDraft({ ...kitDraft, secondaryColor: e.target.value })}
                  className="w-full h-10 rounded border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Accent Gold</label>
                <input
                  type="color"
                  disabled={!canEditBrand}
                  value={kitDraft.accentColor}
                  onChange={(e) => setKitDraft({ ...kitDraft, accentColor: e.target.value })}
                  className="w-full h-10 rounded border border-slate-200"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Brand Voice</label>
              <input
                type="text"
                disabled={!canEditBrand}
                value={kitDraft.voice}
                onChange={(e) => setKitDraft({ ...kitDraft, voice: e.target.value })}
                className="w-full px-3 py-2.5 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tone</label>
              <input
                type="text"
                disabled={!canEditBrand}
                value={kitDraft.tone}
                onChange={(e) => setKitDraft({ ...kitDraft, tone: e.target.value })}
                className="w-full px-3 py-2.5 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Messaging Guidelines</label>
            <textarea
              rows={3}
              disabled={!canEditBrand}
              value={kitDraft.messagingGuidelines}
              onChange={(e) => setKitDraft({ ...kitDraft, messagingGuidelines: e.target.value })}
              className="w-full px-3 py-2.5 text-base sm:text-sm border border-slate-200 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Approved CTAs (comma-separated)</label>
              <input
                type="text"
                disabled={!canEditBrand}
                value={kitDraft.approvedCtas.join(', ')}
                onChange={(e) =>
                  setKitDraft({
                    ...kitDraft,
                    approvedCtas: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="w-full px-3 py-2.5 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Prohibited Phrases (comma-separated)</label>
              <input
                type="text"
                disabled={!canEditBrand}
                value={kitDraft.prohibitedPhrases.join(', ')}
                onChange={(e) =>
                  setKitDraft({
                    ...kitDraft,
                    prohibitedPhrases: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })
                }
                className="w-full px-3 py-2.5 text-base sm:text-sm border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          {canEditBrand && (
            <button
              type="button"
              onClick={async () => {
                await api.updateBrandKit(kitDraft.id, kitDraft);
                setNotice('Brand Kit updated.');
                await loadData();
              }}
              className="w-full sm:w-auto px-4 py-2.5 bg-[#1D63ED] text-white text-xs font-semibold rounded-lg cursor-pointer min-h-[42px]"
            >
              Save Brand Guidelines
            </button>
          )}
        </div>
      )}
    </div>
  );
};
