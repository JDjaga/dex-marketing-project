/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JwtRealtimeStatus, NavSectionId } from './shared/types.ts';
import { AppShell } from './client/components/AppShell.tsx';
import { AuthScreen } from './client/components/AuthScreen.tsx';
import {
  api,
  getActiveOrganizationId,
  getAuthToken,
  setActiveOrganizationId,
  setAuthToken,
  setOnUnauthorized,
  type AuthContext,
} from './client/lib/api.ts';
import { ApprovalsAndBrandView } from './client/views/ApprovalsAndBrandView.tsx';
import { AudienceAndComplianceView } from './client/views/AudienceAndComplianceView.tsx';
import { AutomationAndAnalyticsView } from './client/views/AutomationAndAnalyticsView.tsx';
import { CampaignsAndEmailView } from './client/views/CampaignsAndEmailView.tsx';
import { LeadsAndCrmView } from './client/views/LeadsAndCrmView.tsx';
import { OverviewView } from './client/views/OverviewView.tsx';
import { SocialAndCalendarView } from './client/views/SocialAndCalendarView.tsx';
import { TeamAndSettingsView } from './client/views/TeamAndSettingsView.tsx';

export default function App() {
  const [authContext, setAuthContext] = useState<AuthContext | null>(null);
  const [activeSection, setActiveSection] = useState<NavSectionId>('overview');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('');
  const [sessionNotice, setSessionNotice] = useState<string>('');
  const [jwtStatus, setJwtStatus] = useState<JwtRealtimeStatus>({ state: 'connecting' });
  const wsRef = useRef<WebSocket | null>(null);

  const forceSignOut = useCallback((notice?: string) => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setAuthToken(null, '');
    setAuthContext(null);
    setActiveSection('overview');
    setJwtStatus({ state: 'revoked', reason: notice });
    if (notice) setSessionNotice(notice);
  }, []);

  useEffect(() => {
    setOnUnauthorized((reason) => {
      forceSignOut(`Session ended: ${reason}`);
    });
    return () => setOnUnauthorized(null);
  }, [forceSignOut]);

  useEffect(() => {
    if (authContext && (!activeWorkspaceId || !authContext.workspaces.some((w) => w.id === activeWorkspaceId))) {
      setActiveWorkspaceId(authContext.workspaces[0]?.id || '');
    }
  }, [authContext, activeWorkspaceId]);

  const refreshAuth = useCallback(async () => {
    const res = await api.me();
    setAuthContext(res.context);
    setActiveWorkspaceId(res.context.workspaces[0]?.id || '');
  }, []);

  // Real-Time WebSocket JWT Verification Channel (/ws/auth)
  useEffect(() => {
    if (!authContext) return;
    const token = getAuthToken();
    if (!token) return;

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoffMs = 1500;

    const connect = () => {
      if (cancelled) return;
      const activeToken = getAuthToken();
      if (!activeToken) return;

      setJwtStatus((prev) => ({ ...prev, state: 'connecting' }));
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${wsProto}//${window.location.host}/ws/auth`);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffMs = 1500;
        ws.send(
          JSON.stringify({
            type: 'auth:verify',
            token: activeToken,
            organizationId: getActiveOrganizationId() || authContext.organization.id,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as {
            type: string;
            valid?: boolean;
            jti?: string;
            ttlSeconds?: number;
            expiresAt?: string;
            serverTime?: string;
            reason?: string;
          };

          if (msg.type === 'auth:verified' || msg.type === 'auth:heartbeat') {
            setJwtStatus({
              state: 'verified',
              jti: msg.jti,
              ttlSeconds: msg.ttlSeconds,
              expiresAt: msg.expiresAt,
              lastVerifiedAt: msg.serverTime || new Date().toISOString(),
            });
          } else if (msg.type === 'auth:role_updated') {
            refreshAuth().catch(() => {});
          } else if (msg.type === 'auth:revoked') {
            forceSignOut(msg.reason || 'Your JWT session was revoked in real time.');
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = (ev) => {
        if (cancelled) return;
        if (ev.code === 4001) {
          forceSignOut(ev.reason || 'JWT verification rejected by server.');
          return;
        }
        setJwtStatus((prev) => ({ ...prev, state: 'connecting' }));
        reconnectTimer = setTimeout(() => {
          backoffMs = Math.min(10000, backoffMs * 1.5);
          connect();
        }, backoffMs);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [authContext?.user.id, authContext?.organization.id, forceSignOut, refreshAuth]);

  const handleVerifyJwtNow = async () => {
    const token = getAuthToken();
    if (!token) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'auth:ping',
          token,
          organizationId: getActiveOrganizationId() || authContext?.organization.id,
        })
      );
    }
    try {
      const res = await api.verifyJwt();
      setJwtStatus({
        state: 'verified',
        jti: res.session.jti,
        ttlSeconds: res.ttlSeconds,
        expiresAt: res.session.expiresAt,
        lastVerifiedAt: res.serverTime,
      });
    } catch (err) {
      forceSignOut(err instanceof Error ? err.message : 'JWT verification failed');
    }
  };

  const handleSwitchOrganization = async (orgId: string) => {
    setActiveOrganizationId(orgId);
    await refreshAuth();
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Proceed with local cleanup even if token already expired
    }
    forceSignOut('You signed out cleanly and revoked your JWT session.');
  };

  if (!authContext) {
    return (
      <AuthScreen
        sessionNotice={sessionNotice}
        onAuthenticated={(ctx) => {
          setSessionNotice('');
          setAuthContext(ctx);
          setActiveWorkspaceId(ctx.workspaces[0]?.id || '');
        }}
      />
    );
  }

  const primaryActionMap: Partial<Record<NavSectionId, { label: string; onClick: () => void }>> = {
    overview: { label: 'New Campaign', onClick: () => setActiveSection('email') },
    campaigns: { label: 'Create Campaign', onClick: () => setActiveSection('email') },
    social: { label: 'Calendar', onClick: () => setActiveSection('calendar') },
    leads: { label: 'Audience', onClick: () => setActiveSection('audience') },
    crm: { label: 'Leads', onClick: () => setActiveSection('leads') },
  };

  return (
    <AppShell
      context={authContext}
      activeSection={activeSection}
      activeWorkspaceId={activeWorkspaceId}
      jwtStatus={jwtStatus}
      onSelectSection={setActiveSection}
      onSelectWorkspace={setActiveWorkspaceId}
      onSwitchOrganization={handleSwitchOrganization}
      onVerifyJwtNow={handleVerifyJwtNow}
      onLogout={handleLogout}
      primaryAction={primaryActionMap[activeSection]}
    >
      {activeSection === 'overview' && <OverviewView onNavigate={setActiveSection} />}

      {activeSection === 'campaigns' && (
        <CampaignsAndEmailView workspaceId={activeWorkspaceId} initialMode="list" />
      )}
      {activeSection === 'email' && (
        <CampaignsAndEmailView workspaceId={activeWorkspaceId} initialMode="wizard" />
      )}

      {activeSection === 'audience' && (
        <AudienceAndComplianceView workspaceId={activeWorkspaceId} />
      )}

      {activeSection === 'social' && (
        <SocialAndCalendarView
          workspaceId={activeWorkspaceId}
          userTimezone={authContext.user.timezone}
          initialTab="composer"
        />
      )}
      {activeSection === 'studio' && (
        <SocialAndCalendarView
          workspaceId={activeWorkspaceId}
          userTimezone={authContext.user.timezone}
          initialTab="studio"
        />
      )}
      {activeSection === 'calendar' && (
        <SocialAndCalendarView
          workspaceId={activeWorkspaceId}
          userTimezone={authContext.user.timezone}
          initialTab="calendar"
        />
      )}

      {activeSection === 'leads' && (
        <LeadsAndCrmView mode="leads" workspaceId={activeWorkspaceId} />
      )}
      {activeSection === 'crm' && (
        <LeadsAndCrmView mode="crm" workspaceId={activeWorkspaceId} />
      )}

      {activeSection === 'approvals' && (
        <ApprovalsAndBrandView mode="approvals" userRole={authContext.role} />
      )}
      {activeSection === 'brand' && (
        <ApprovalsAndBrandView mode="brand" userRole={authContext.role} />
      )}

      {activeSection === 'automation' && (
        <AutomationAndAnalyticsView mode="automation" workspaceId={activeWorkspaceId} />
      )}
      {activeSection === 'analytics' && (
        <AutomationAndAnalyticsView mode="analytics" workspaceId={activeWorkspaceId} />
      )}

      {activeSection === 'team' && (
        <TeamAndSettingsView
          mode="team"
          context={authContext}
          jwtStatus={jwtStatus}
          onVerifyJwtNow={handleVerifyJwtNow}
          onRefreshAuth={refreshAuth}
        />
      )}
      {activeSection === 'settings' && (
        <TeamAndSettingsView
          mode="settings"
          context={authContext}
          jwtStatus={jwtStatus}
          onVerifyJwtNow={handleVerifyJwtNow}
          onRefreshAuth={refreshAuth}
        />
      )}
    </AppShell>
  );
}
