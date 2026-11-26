import React, { useEffect, useState } from 'react';
import {
  Activity,
  Building2,
  KeyRound,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type {
  AuditLog,
  Invitation,
  JwtRealtimeStatus,
  JwtSessionRecord,
  OrganizationMember,
  RoleName,
} from '../../shared/types.ts';
import { hasPermission } from '../../shared/types.ts';
import { api, type AuthContext } from '../lib/api.ts';

interface TeamAndSettingsViewProps {
  mode: 'team' | 'settings';
  context: AuthContext;
  jwtStatus: JwtRealtimeStatus;
  onVerifyJwtNow: () => Promise<void> | void;
  onRefreshAuth: () => Promise<void>;
}

const ROLES: RoleName[] = ['Owner', 'Admin', 'Marketing Manager', 'Campaign Editor', 'Analyst', 'Viewer'];

export const TeamAndSettingsView: React.FC<TeamAndSettingsViewProps> = ({
  mode,
  context,
  jwtStatus,
  onVerifyJwtNow,
  onRefreshAuth,
}) => {
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [sessions, setSessions] = useState<Array<JwtSessionRecord & { isCurrent: boolean }>>([]);
  const [diagnostics, setDiagnostics] = useState<Awaited<ReturnType<typeof api.getDiagnostics>> | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<RoleName>('Campaign Editor');
  const [wsName, setWsName] = useState('');
  const [wsType, setWsType] = useState('client');
  const [newOrgName, setNewOrgName] = useState('');
  const [requireApproval, setRequireApproval] = useState(context.organization.requireApprovalForPublish);
  const [retentionDays, setRetentionDays] = useState(context.organization.dataRetentionDays);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const canManageTeam = hasPermission(context.role, 'team:manage');
  const canManageOrg = hasPermission(context.role, 'org:manage');
  const canManageWs = hasPermission(context.role, 'workspace:manage');

  const loadData = async () => {
    try {
      const [teamRes, diagRes, sessRes] = await Promise.all([
        api.getTeam(),
        api.getDiagnostics(),
        api.getSessions(),
      ]);
      setMembers(teamRes.members);
      setInvitations(teamRes.invitations);
      setAuditLogs(teamRes.auditLogs);
      setDiagnostics(diagRes);
      setSessions(sessRes.sessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    }
  };

  useEffect(() => {
    loadData();
  }, [context.organization.id]);

  if (mode === 'team') {
    return (
      <div className="space-y-5 sm:space-y-6">
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
        {notice && <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-[#0A2472] break-all">{notice}</div>}

        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-[#0A2472]">Team Members & RBAC Roles</h2>
            <p className="text-xs text-slate-500">
              Server-side permission checks govern campaigns, approvals, CRM connectors, and settings.
            </p>
          </div>

          {canManageTeam && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError('');
                try {
                  const res = await api.inviteMember(inviteEmail, inviteRole);
                  setInviteEmail('');
                  setNotice(
                    `Invitation issued for ${res.invitation.email}. Invite token: ${res.invitation.token}`
                  );
                  await loadData();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Invite failed');
                }
              }}
              className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100"
            >
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="flex-1 px-3 py-2 text-base sm:text-xs border border-slate-200 rounded-lg"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as RoleName)}
                className="px-3 py-2 text-base sm:text-xs border border-slate-200 rounded-lg bg-white"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="px-4 py-2.5 sm:py-2 bg-[#1D63ED] text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" /> Invite Member
              </button>
            </form>
          )}

          <div className="divide-y divide-slate-100">
            {members.map((m) => (
              <div key={m.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{m.userName}</div>
                  <div className="text-xs text-slate-500 truncate">{m.userEmail} · {m.userTitle || 'Member'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    disabled={!canManageTeam || m.userId === context.user.id}
                    value={m.role}
                    onChange={async (e) => {
                      await api.changeMemberRole(m.id, e.target.value as RoleName);
                      await loadData();
                    }}
                    className="flex-1 sm:flex-none px-2.5 py-2 sm:py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  {canManageTeam && m.userId !== context.user.id && (
                    <button
                      type="button"
                      onClick={async () => {
                        await api.removeMember(m.id);
                        await loadData();
                      }}
                      className="p-2 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
            <h3 className="text-sm font-bold text-[#0A2472]">Invitations</h3>
            {invitations.length === 0 ? (
              <p className="text-xs text-slate-500">No invitations issued yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {invitations.map((inv) => (
                  <div key={inv.id} className="py-2.5 flex flex-wrap justify-between gap-2">
                    <div>
                      <div><strong>{inv.email}</strong> · {inv.role}</div>
                      <div className="font-mono text-[11px] text-slate-400 mt-0.5">Token: {inv.token}</div>
                    </div>
                    <span className="capitalize text-[#1D63ED] font-medium">{inv.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
            <h3 className="text-sm font-bold text-[#0A2472]">Organization Audit Log</h3>
            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-500">No audit events recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto text-xs">
                {auditLogs.map((log) => (
                  <div key={log.id} className="py-2">
                    <div className="font-medium text-slate-900">{log.detail}</div>
                    <div className="text-slate-500">{log.actorName} ({log.actorRole}) · {log.action}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
      {notice && <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-[#0A2472]">{notice}</div>}

      {/* Real-Time JWT Security & Active Sessions */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-[#0A2472] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Real-Time JWT Session Verification
            </h3>
            <p className="text-xs text-slate-500">
              WebSocket channel <code>/ws/auth</code> verifies your HS256 JWT signature, expiry, and revocation status live.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await onVerifyJwtNow();
              await loadData();
              setNotice('JWT signature and session verified against server in real time.');
            }}
            className="px-3.5 py-2 border border-slate-200 hover:border-[#1D63ED] text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Re-verify JWT Now
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-[#F4F7FE] rounded-lg">
            <div className="text-slate-500">Verification Status</div>
            <div className="font-bold text-emerald-700 mt-0.5 capitalize">{jwtStatus.state}</div>
          </div>
          <div className="p-3 bg-[#F4F7FE] rounded-lg">
            <div className="text-slate-500">Current Token ID (jti)</div>
            <div className="font-mono text-[#0A2472] mt-0.5 truncate">{jwtStatus.jti || 'Active'}</div>
          </div>
          <div className="p-3 bg-[#F4F7FE] rounded-lg">
            <div className="text-slate-500">Last Live Server Check</div>
            <div className="font-mono text-[#0A2472] mt-0.5">
              {jwtStatus.lastVerifiedAt ? new Date(jwtStatus.lastVerifiedAt).toLocaleTimeString() : 'Live'}
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {sessions.map((s) => (
            <div key={s.jti} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono font-semibold text-slate-900 truncate">
                  {s.jti.slice(0, 12)}… {s.isCurrent ? '(Current Session)' : ''}
                </div>
                <div className="text-slate-500 truncate">
                  {s.userAgent} · Expires {new Date(s.expiresAt).toLocaleString()}
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await api.revokeSession(s.jti);
                  if (!s.isCurrent) {
                    setNotice('Session revoked immediately via real-time JWT channel.');
                    await loadData();
                  }
                }}
                className="px-3 py-1.5 border border-red-200 text-red-600 font-semibold rounded-lg hover:bg-red-50 self-start sm:self-auto cursor-pointer"
              >
                Revoke Session
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* Organization & Privacy Governance */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <h3 className="text-base font-bold text-[#0A2472] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#1D63ED]" /> Organization Governance & Privacy
          </h3>
          <label className="flex items-start gap-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              disabled={!canManageOrg}
              checked={requireApproval}
              onChange={(e) => setRequireApproval(e.target.checked)}
              className="mt-1"
            />
            <span>Require Marketing Manager approval before Campaign Editors can publish</span>
          </label>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Data Retention Period (Days)</label>
            <input
              type="number"
              disabled={!canManageOrg}
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              className="w-full sm:w-40 px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg font-mono"
            />
          </div>
          {canManageOrg && (
            <button
              type="button"
              onClick={async () => {
                await api.updateOrganization({ requireApprovalForPublish: requireApproval, dataRetentionDays: retentionDays });
                setNotice('Organization governance settings saved.');
                await onRefreshAuth();
              }}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-[#1D63ED] text-white text-xs font-semibold rounded-lg cursor-pointer"
            >
              Save Governance Policy
            </button>
          )}
        </div>

        {/* Workspaces & New Organization */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <h3 className="text-base font-bold text-[#0A2472] flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#1D63ED]" /> Workspaces & Multi-Tenant Orgs
          </h3>
          {canManageWs && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                placeholder="New workspace name..."
                className="flex-1 px-3 py-2 text-base sm:text-xs border border-slate-200 rounded-lg"
              />
              <select
                value={wsType}
                onChange={(e) => setWsType(e.target.value)}
                className="px-2.5 py-2 text-base sm:text-xs border border-slate-200 rounded-lg bg-white"
              >
                <option value="brand">Brand</option>
                <option value="client">Client</option>
                <option value="department">Department</option>
              </select>
              <button
                type="button"
                onClick={async () => {
                  if (wsName.trim().length < 2) return;
                  await api.createWorkspace({ name: wsName, type: wsType, description: 'Created in Settings' });
                  setWsName('');
                  setNotice('Workspace created.');
                  await onRefreshAuth();
                }}
                className="px-3 py-2 bg-[#0A2472] text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Add Workspace
              </button>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="Create separate tenant organization..."
              className="flex-1 px-3 py-2 text-base sm:text-xs border border-slate-200 rounded-lg"
            />
            <button
              type="button"
              onClick={async () => {
                if (newOrgName.trim().length < 2) return;
                const res = await api.createOrganization(newOrgName, 'Marketing Agency');
                setNewOrgName('');
                setNotice(`Created & switched to "${res.organization.name}".`);
                await onRefreshAuth();
              }}
              className="px-3 py-2 border border-slate-300 text-xs font-semibold rounded-lg cursor-pointer"
            >
              Create Org
            </button>
          </div>
        </div>
      </div>

      {/* Provider Configuration & Diagnostics Console */}
      {diagnostics && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-[#0A2472] flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#1D63ED]" /> Integration Status & System Diagnostics
              </h3>
              <p className="text-xs text-slate-500">Environment secrets remain server-side only; only masked previews are shown.</p>
            </div>
            <KeyRound className="w-4 h-4 text-slate-400" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 border border-slate-200 rounded-xl space-y-1">
              <div className="font-bold text-[#0A2472]">Database Engine</div>
              <div>{diagnostics.database.engine}</div>
              <div className="text-slate-500 font-mono truncate">
                DATABASE_URL: {diagnostics.secretsPreview.databaseUrl || 'Not configured'}
              </div>
            </div>
            <div className="p-4 border border-slate-200 rounded-xl space-y-1">
              <div className="font-bold text-[#0A2472]">Email Infrastructure</div>
              <div className="capitalize">Active: {diagnostics.email.activeProvider} ({diagnostics.email.simulationMode ? 'Simulated' : 'Live'})</div>
              <div className="text-slate-500 font-mono truncate">
                Resend: {diagnostics.secretsPreview.resendKey || 'Unset'}
              </div>
            </div>
            <div className="p-4 border border-slate-200 rounded-xl space-y-1">
              <div className="font-bold text-[#0A2472]">AI Providers</div>
              {diagnostics.ai.providers.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span className="truncate">{p.name}</span>
                  <span className={p.configured ? 'text-green-700 font-semibold' : 'text-slate-400'}>
                    {p.configured ? 'Ready' : 'Unset'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-bold text-[#0A2472] mb-2">
              Background Job Queue ({diagnostics.queue.total} total · {diagnostics.queue.pending} pending · {diagnostics.queue.completed} completed)
            </h4>
            {diagnostics.queue.recentJobs.length === 0 ? (
              <p className="text-xs text-slate-500">No background jobs queued yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs font-mono">
                {diagnostics.queue.recentJobs.map((j) => (
                  <div key={j.id} className="py-2 flex flex-wrap justify-between gap-2">
                    <span className="truncate">{j.id} · {j.type} (attempts: {j.attempts})</span>
                    <span className="text-[#1D63ED]">{j.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
