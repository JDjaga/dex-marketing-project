import React, { useEffect, useState } from 'react';
import {
  Database,
  Filter,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  ConsentRecord,
  Contact,
  Segment,
  SegmentCondition,
  SuppressionRecord,
} from '../../shared/types.ts';
import { api } from '../lib/api.ts';

interface AudienceAndComplianceViewProps {
  workspaceId: string;
}

export const AudienceAndComplianceView: React.FC<AudienceAndComplianceViewProps> = ({ workspaceId }) => {
  const [tab, setTab] = useState<'contacts' | 'segments' | 'compliance'>('contacts');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [suppression, setSuppression] = useState<SuppressionRecord[]>([]);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [search, setSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // New Contact State
  const [newContact, setNewContact] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    jobTitle: '',
    industry: '',
    location: '',
    country: '',
  });

  // Segment Builder State
  const [segName, setSegName] = useState('');
  const [segLogic, setSegLogic] = useState<'AND' | 'OR'>('AND');
  const [conditions, setConditions] = useState<SegmentCondition[]>([
    { id: 'c-new-1', field: 'subscriptionStatus', operator: 'equals', value: 'subscribed' },
  ]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  // Manual Suppression
  const [supEmail, setSupEmail] = useState('');
  const [supReason, setSupReason] = useState('');

  // Contact Note
  const [newNote, setNewNote] = useState('');

  const loadData = async (q = '') => {
    try {
      const [cRes, sRes, compRes] = await Promise.all([
        api.getContacts(q),
        api.getSegments(),
        api.getCompliance(),
      ]);
      setContacts(cRes.contacts);
      setSegments(sRes.segments);
      setSuppression(compRes.suppressionRecords);
      setConsents(compRes.consentRecords);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audience data');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.createContact({ ...newContact, workspaceId });
      setShowAddContact(false);
      setNewContact({
        firstName: '',
        lastName: '',
        email: '',
        company: '',
        jobTitle: '',
        industry: '',
        location: '',
        country: '',
      });
      setNotice('Contact added and consent recorded.');
      await loadData(search);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create contact');
    }
  };

  const handlePreviewSegment = async () => {
    try {
      const res = await api.previewSegment(segLogic, conditions);
      setPreviewCount(res.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Segment preview failed');
    }
  };

  const handleSaveSegment = async () => {
    setError('');
    try {
      await api.createSegment({
        name: segName || 'Custom Dynamic Segment',
        workspaceId,
        logic: segLogic,
        isDynamic: true,
        conditions,
      });
      setSegName('');
      setPreviewCount(null);
      setNotice('Dynamic segment saved.');
      await loadData(search);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save segment');
    }
  };

  const handleAddNote = async () => {
    if (!selectedContact || !newNote.trim()) return;
    try {
      const res = await api.updateContact(selectedContact.id, { newNote });
      setSelectedContact(res.contact);
      setNewNote('');
      await loadData(search);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add note');
    }
  };

  const handleDeleteContact = async (id: string) => {
    try {
      await api.deleteContact(id);
      setSelectedContact(null);
      setNotice('Contact deleted under privacy retention workflow.');
      await loadData(search);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setTab('contacts')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
              tab === 'contacts' ? 'bg-white text-[#0A2472] shadow-sm' : 'text-slate-600'
            }`}
          >
            Contacts ({contacts.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('segments')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
              tab === 'segments' ? 'bg-white text-[#0A2472] shadow-sm' : 'text-slate-600'
            }`}
          >
            Segments ({segments.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('compliance')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
              tab === 'compliance' ? 'bg-white text-[#0A2472] shadow-sm' : 'text-slate-600'
            }`}
          >
            Compliance ({suppression.length})
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowAddContact(true)}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 bg-[#1D63ED] text-white text-xs font-semibold rounded-lg cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Add Contact
        </button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
      {notice && <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-[#0A2472]">{notice}</div>}

      {/* CONTACTS TAB */}
      {tab === 'contacts' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
          <div className={`${selectedContact ? 'lg:col-span-7' : 'lg:col-span-12'} bg-white border border-slate-200 rounded-xl overflow-hidden`}>
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 w-full sm:max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 sm:top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    loadData(e.target.value);
                  }}
                  placeholder="Search contacts, companies, or locations..."
                  className="w-full pl-9 pr-3 py-2 sm:py-1.5 text-base sm:text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <span className="text-xs text-slate-500">External CRMs remain source of truth for synced fields</span>
            </div>

            {contacts.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-slate-500">No contacts in your audience yet.</p>
                <button
                  type="button"
                  onClick={() => setShowAddContact(true)}
                  className="px-4 py-2 bg-[#1D63ED] text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Add First Contact
                </button>
              </div>
            ) : (
              <>
                {/* Mobile Card List */}
                <div className="md:hidden divide-y divide-slate-100">
                  {contacts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedContact(c)}
                      className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-[#F4F7FE] cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{c.firstName} {c.lastName}</div>
                        <div className="text-xs text-slate-500 truncate">{c.email}</div>
                        <div className="text-xs text-slate-400 truncate mt-0.5">
                          {c.company || 'Individual'} · {c.subscriptionStatus}
                        </div>
                      </div>
                      <span className="text-sm font-mono font-bold text-[#0A2472] shrink-0">
                        {c.engagementScore}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-slate-50">
                        <th className="py-2.5 px-4">Contact</th>
                        <th className="py-2.5 px-4">Company & Role</th>
                        <th className="py-2.5 px-4">Source</th>
                        <th className="py-2.5 px-4">Consent</th>
                        <th className="py-2.5 px-4 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {contacts.map((c) => (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedContact(c)}
                          className={`hover:bg-[#F4F7FE] cursor-pointer ${selectedContact?.id === c.id ? 'bg-[#EAF1FF]/70' : ''}`}
                        >
                          <td className="py-2.5 px-4">
                            <div className="font-semibold text-slate-900">{c.firstName} {c.lastName}</div>
                            <div className="text-xs text-slate-500">{c.email}</div>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="text-slate-800">{c.company || '—'}</div>
                            <div className="text-xs text-slate-500">{c.jobTitle || c.location}</div>
                          </td>
                          <td className="py-2.5 px-4 text-xs">
                            {c.externalCrmId ? (
                              <span className="text-[#1D63ED] font-medium">CRM: {c.externalCrmId}</span>
                            ) : (
                              <span className="text-slate-600">{c.source}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-xs capitalize">
                            {c.subscriptionStatus} · {c.consentStatus.replace('_', ' ')}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-[#0A2472]">
                            {c.engagementScore}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {selectedContact && (
            <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center p-0 sm:p-4 lg:static lg:bg-transparent lg:block lg:col-span-5 lg:p-0">
              <div className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl p-5 space-y-4 w-full max-h-[85vh] overflow-y-auto lg:max-h-none">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-[#0A2472]">
                    {selectedContact.firstName} {selectedContact.lastName}
                  </h3>
                  <p className="text-xs text-slate-500">{selectedContact.email} · {selectedContact.lifecycleStage.toUpperCase()}</p>
                </div>
                <button type="button" onClick={() => setSelectedContact(null)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedContact.externalCrmId && (
                <div className="p-3 bg-[#F4F7FE] border border-blue-200 rounded-lg text-xs space-y-1">
                  <div className="font-semibold text-[#0A2472] flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-[#1D63ED]" /> Connected CRM Record ({selectedContact.crmProvider})
                  </div>
                  <div>External ID: <span className="font-mono">{selectedContact.externalCrmId}</span></div>
                  <div className="flex items-center gap-1 text-slate-600">
                    <Lock className="w-3 h-3" /> CRM-Owned Fields: {selectedContact.crmOwnedFields.join(', ') || 'None'}
                  </div>
                </div>
              )}

              <div className="text-xs space-y-1.5 text-slate-700">
                <div><strong>Company:</strong> {selectedContact.company || '—'}</div>
                <div><strong>Job Title:</strong> {selectedContact.jobTitle || '—'}</div>
                <div><strong>Location:</strong> {selectedContact.location || '—'}</div>
                <div><strong>Tags:</strong> {selectedContact.tags.join(', ') || 'None'}</div>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="text-xs font-semibold text-slate-700">Notes & Activity</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add contact note..."
                    className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={handleAddNote}
                    className="px-3 py-1.5 bg-[#1D63ED] text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Save
                  </button>
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {selectedContact.notes.map((n) => (
                    <div key={n.id} className="p-2 bg-slate-50 rounded text-xs">
                      <div className="text-slate-800">{n.text}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{n.author} · {new Date(n.createdAt).toLocaleDateString()}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <a
                  href={`/unsubscribe/${selectedContact.id}?org=${selectedContact.organizationId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#1D63ED] hover:underline"
                >
                  Open Public Unsubscribe Link ↗
                </a>
                <button
                  type="button"
                  onClick={() => handleDeleteContact(selectedContact.id)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> GDPR Delete
                </button>
              </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SEGMENTS TAB */}
      {tab === 'segments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="text-base font-bold text-[#0A2472] flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#1D63ED]" /> Visual Segment Builder
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={segName}
                onChange={(e) => setSegName(e.target.value)}
                placeholder="Segment name..."
                className="sm:col-span-2 px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
              <select
                value={segLogic}
                onChange={(e) => setSegLogic(e.target.value as 'AND' | 'OR')}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value="AND">Match ALL (AND)</option>
                <option value="OR">Match ANY (OR)</option>
              </select>
            </div>

            <div className="space-y-3">
              {conditions.map((cond, idx) => (
                <div key={cond.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2.5 sm:p-0 bg-slate-50 sm:bg-transparent rounded-lg">
                  <select
                    value={cond.field}
                    onChange={(e) => {
                      const next = [...conditions];
                      next[idx] = { ...cond, field: e.target.value as SegmentCondition['field'] };
                      setConditions(next);
                    }}
                    className="sm:col-span-4 px-2.5 py-2 sm:py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="subscriptionStatus">Subscription</option>
                    <option value="consentStatus">Consent Status</option>
                    <option value="industry">Industry</option>
                    <option value="location">Location</option>
                    <option value="country">Country</option>
                    <option value="lifecycleStage">Lifecycle Stage</option>
                    <option value="engagementScore">Engagement Score</option>
                    <option value="tags">Tags</option>
                  </select>
                  <select
                    value={cond.operator}
                    onChange={(e) => {
                      const next = [...conditions];
                      next[idx] = { ...cond, operator: e.target.value as SegmentCondition['operator'] };
                      setConditions(next);
                    }}
                    className="sm:col-span-3 px-2.5 py-2 sm:py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="equals">equals</option>
                    <option value="contains">contains</option>
                    <option value="not_equals">not equals</option>
                    <option value="gte">&gt;=</option>
                    <option value="lte">&lt;=</option>
                  </select>
                  <div className="sm:col-span-5 flex items-center gap-2">
                    <input
                      type="text"
                      value={cond.value}
                      onChange={(e) => {
                        const next = [...conditions];
                        next[idx] = { ...cond, value: e.target.value };
                        setConditions(next);
                      }}
                      placeholder="Value..."
                      className="flex-1 px-2.5 py-2 sm:py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setConditions(conditions.filter((c) => c.id !== cond.id))}
                      className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() =>
                  setConditions([
                    ...conditions,
                    { id: `c-${Date.now()}`, field: 'industry', operator: 'contains', value: 'FinTech' },
                  ])
                }
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg cursor-pointer"
              >
                + Add Condition
              </button>
              <button
                type="button"
                onClick={handlePreviewSegment}
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 rounded-lg cursor-pointer"
              >
                Preview Match {previewCount !== null ? `(${previewCount})` : ''}
              </button>
              <button
                type="button"
                onClick={handleSaveSegment}
                className="px-3.5 py-1.5 text-xs font-semibold bg-[#1D63ED] text-white rounded-lg cursor-pointer"
              >
                Save Dynamic Segment
              </button>
            </div>
          </div>

          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-bold text-[#0A2472]">Saved Segments</h3>
            <div className="divide-y divide-slate-100">
              {segments.map((s) => (
                <div key={s.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{s.name}</div>
                    <div className="text-xs text-slate-500">
                      {s.logic} logic · {s.conditions.length} rule(s) · Dynamic
                    </div>
                  </div>
                  <div className="text-sm font-mono font-bold text-[#1D63ED] tabular-nums">
                    {s.cachedCount} contacts
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* COMPLIANCE & UNSUBSCRIBE CENTER */}
      {tab === 'compliance' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0A2472] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#1D63ED]" /> Suppression Registry
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="email"
                value={supEmail}
                onChange={(e) => setSupEmail(e.target.value)}
                placeholder="email@domain.com"
                className="flex-1 min-w-[180px] px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
              />
              <input
                type="text"
                value={supReason}
                onChange={(e) => setSupReason(e.target.value)}
                className="flex-1 min-w-[180px] px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!supEmail.includes('@')) return;
                  await api.suppressEmail({ email: supEmail, category: 'manual', reason: supReason });
                  setSupEmail('');
                  await loadData(search);
                }}
                className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Suppress Email
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {suppression.map((s) => (
                <div key={s.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">{s.email}</div>
                    <div className="text-slate-500">{s.reason}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-medium text-red-600 capitalize">{s.category.replace('_', ' ')}</div>
                    <div className="text-slate-400 font-mono">{new Date(s.suppressedAt).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-base font-bold text-[#0A2472] flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#1D63ED]" /> Consent Audit Ledger
            </h3>
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {consents.map((c) => (
                <div key={c.id} className="py-2.5 text-xs">
                  <div className="flex justify-between font-semibold text-slate-900">
                    <span>{c.email}</span>
                    <span className="capitalize text-[#1D63ED]">{c.status.replace('_', ' ')}</span>
                  </div>
                  <div className="text-slate-500 mt-0.5">{c.lawfulBasis} · {c.source}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ADD CONTACT MODAL */}
      {showAddContact && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <form onSubmit={handleCreateContact} className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0A2472]">Add Contact</h3>
              <button type="button" onClick={() => setShowAddContact(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="First name"
                value={newContact.firstName}
                onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
              <input
                required
                placeholder="Last name"
                value={newContact.lastName}
                onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <input
              required
              type="email"
              placeholder="Work email"
              value={newContact.email}
              onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="Company"
                value={newContact.company}
                onChange={(e) => setNewContact({ ...newContact, company: e.target.value })}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
              <input
                placeholder="Job title"
                value={newContact.jobTitle}
                onChange={(e) => setNewContact({ ...newContact, jobTitle: e.target.value })}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <button type="submit" className="w-full py-2.5 bg-[#1D63ED] text-white text-sm font-semibold rounded-lg cursor-pointer">
              Save Contact & Record Consent
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
