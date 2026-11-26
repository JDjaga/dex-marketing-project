import http, { type Server } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { attachAuthWebSocket, createApp } from '../server.ts';
import {
  calculateCampaignMetrics,
  evaluateSegmentContacts,
  resolveCampaignAudience,
  validateCampaignCompliance,
} from '../src/server/services/marketingService.ts';
import { registerOrganizationAndUser } from '../src/server/services/authService.ts';
import { demoStore } from '../src/server/store/demoStore.ts';
import {
  renderPersonalizedTemplate,
  signSessionToken,
  validateSafeExternalUrl,
  verifySessionToken,
} from '../src/server/utils/security.ts';
import { hasPermission } from '../src/shared/types.ts';

let server: Server;
let detachWs: (() => void) | null = null;
let baseUrl = '';
let wsBaseUrl = '';

beforeAll(async () => {
  const app = createApp();
  server = http.createServer(app);
  detachWs = attachAuthWebSocket(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
        wsBaseUrl = `ws://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  if (detachWs) detachWs();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  demoStore.resetForTests();
});

async function apiJson<T>(path: string, options: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const body = (await res.json()) as T;
  return { status: res.status, body };
}

describe('Unit Tests — Clean Store, HS256 JWT, Security, Segments & Analytics', () => {
  it('starts completely clean with zero pre-seeded sample data', async () => {
    expect(demoStore.state.users).toHaveLength(0);
    expect(demoStore.state.organizations).toHaveLength(0);
    expect(demoStore.state.contacts).toHaveLength(0);
    expect(demoStore.state.campaigns).toHaveLength(0);
    expect(demoStore.state.socialPosts).toHaveLength(0);
    expect(demoStore.state.integrations).toHaveLength(0);

    const statusRes = await apiJson<{ initialized: boolean; realTimeJwt: boolean }>('/api/auth/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.initialized).toBe(false);
    expect(statusRes.body.realTimeJwt).toBe(true);
  });

  it('signs standard 3-part HS256 JWTs and rejects tampered tokens', () => {
    const { token, claims } = signSessionToken({
      userId: 'usr-1',
      email: 'owner@acme.test',
      orgId: 'org-1',
      role: 'Owner',
    });
    const parts = token.split('.');
    expect(parts).toHaveLength(3);

    const verified = verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe('usr-1');
    expect(verified?.jti).toBe(claims.jti);

    // Tamper payload
    const forgedPayload = Buffer.from(JSON.stringify({ ...claims, role: 'Admin' })).toString('base64url');
    const tampered = `${parts[0]}.${forgedPayload}.${parts[2]}`;
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it('renders personalization variables safely with fallbacks without leaking raw braces', () => {
    const rendered = renderPersonalizedTemplate('Hi {{first_name}}, welcome to {{company}} ({{custom_field|Pro}})', {
      first_name: 'Ananya',
      company: '',
    });
    expect(rendered).toBe('Hi Ananya, welcome to your team (Pro)');
    expect(rendered).not.toContain('{{');
  });

  it('blocks SSRF loopback, private RFC1918, and cloud metadata URLs', () => {
    expect(validateSafeExternalUrl('http://127.0.0.1:8080/admin').valid).toBe(false);
    expect(validateSafeExternalUrl('http://169.254.169.254/latest/meta-data').valid).toBe(false);
    expect(validateSafeExternalUrl('http://192.168.1.10/internal').valid).toBe(false);
    expect(validateSafeExternalUrl('javascript:alert(1)').valid).toBe(false);
    expect(validateSafeExternalUrl('https://colakin.com/dex').valid).toBe(true);
  });

  it('evaluates AND/OR dynamic segments accurately on organization contacts', () => {
    const reg = registerOrganizationAndUser({
      name: 'Owner',
      email: 'owner@segtest.io',
      password: 'Password123!',
      organizationName: 'SegTest Corp',
    });
    const orgId = reg.context.organization.id;
    const wsId = reg.context.workspaces[0].id;

    demoStore.state.contacts.push(
      {
        id: 'c-1',
        organizationId: orgId,
        workspaceId: wsId,
        firstName: 'Asha',
        lastName: 'Rao',
        email: 'asha@india.test',
        country: 'India',
        tags: ['vip'],
        customAttributes: {},
        source: 'Manual',
        lifecycleStage: 'lead',
        consentStatus: 'opted_in',
        subscriptionStatus: 'subscribed',
        engagementScore: 80,
        crmOwnedFields: [],
        crmEditable: true,
        notes: [],
        createdAt: new Date().toISOString(),
      },
      {
        id: 'c-2',
        organizationId: orgId,
        workspaceId: wsId,
        firstName: 'Sam',
        lastName: 'Lee',
        email: 'sam@us.test',
        country: 'USA',
        tags: [],
        customAttributes: {},
        source: 'Manual',
        lifecycleStage: 'lead',
        consentStatus: 'opted_out',
        subscriptionStatus: 'unsubscribed',
        engagementScore: 40,
        crmOwnedFields: [],
        crmEditable: true,
        notes: [],
        createdAt: new Date().toISOString(),
      }
    );

    const matches = evaluateSegmentContacts(orgId, {
      logic: 'AND',
      conditions: [
        { id: '1', field: 'country', operator: 'equals', value: 'India' },
        { id: '2', field: 'subscriptionStatus', operator: 'equals', value: 'subscribed' },
      ],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].email).toBe('asha@india.test');
  });

  it('calculates zero-safe campaign metrics when denominators are zero', () => {
    const emptyMetrics = calculateCampaignMetrics('org-none', 'non-existent-campaign-id');
    expect(emptyMetrics.deliveryRate).toBeNull();
    expect(emptyMetrics.openRate).toBeNull();
    expect(emptyMetrics.clickRate).toBeNull();
    expect(emptyMetrics.bounceRate).toBeNull();
  });

  it('enforces RBAC permissions matrix accurately', () => {
    expect(hasPermission('Analyst', 'analytics:read')).toBe(true);
    expect(hasPermission('Analyst', 'campaign:create')).toBe(false);
    expect(hasPermission('Campaign Editor', 'campaign:approve')).toBe(false);
    expect(hasPermission('Marketing Manager', 'campaign:approve')).toBe(true);
    expect(hasPermission('Viewer', 'org:manage')).toBe(false);
  });
});

describe('Integration, Real-Time JWT WebSocket Verification & Tenant Isolation', () => {
  it('verifies JWT over WebSocket /ws/auth and pushes real-time auth:revoked on session termination', async () => {
    const reg = await apiJson<{
      token: string;
      session: { jti: string };
      context: { organization: { id: string } };
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Realtime Owner',
        email: 'realtime@acme.io',
        password: 'Password123!',
        organizationName: 'Acme Realtime',
      }),
    });
    expect(reg.status).toBe(201);
    const token = reg.body.token;
    const jti = reg.body.session.jti;

    // REST verify succeeds
    const verifyRes = await apiJson<{ valid: boolean; claims: { jti: string } }>('/api/auth/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.valid).toBe(true);
    expect(verifyRes.body.claims.jti).toBe(jti);

    // Connect WebSocket and verify real-time handshake + revocation push
    const ws = new WebSocket(`${wsBaseUrl}/ws/auth`);
    const messages: Array<{ type: string; valid?: boolean; jti?: string; reason?: string }> = [];

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'auth:verify', token }));
      });
      ws.on('message', (raw) => {
        const parsed = JSON.parse(raw.toString()) as { type: string; valid?: boolean; jti?: string; reason?: string };
        messages.push(parsed);
        if (parsed.type === 'auth:verified') {
          resolve();
        }
      });
      ws.on('error', reject);
    });

    expect(messages[0].type).toBe('auth:verified');
    expect(messages[0].valid).toBe(true);
    expect(messages[0].jti).toBe(jti);

    // Revoke session while WebSocket is open and confirm real-time auth:revoked push
    const revokedPromise = new Promise<{ type: string; valid?: boolean }>((resolve) => {
      ws.on('message', (raw) => {
        const parsed = JSON.parse(raw.toString()) as { type: string; valid?: boolean };
        if (parsed.type === 'auth:revoked') {
          resolve(parsed);
        }
      });
    });

    const revokeHttp = await apiJson<{ revoked: boolean }>(`/api/auth/sessions/${jti}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(revokeHttp.status).toBe(200);
    expect(revokeHttp.body.revoked).toBe(true);

    const revokedEvent = await revokedPromise;
    expect(revokedEvent.type).toBe('auth:revoked');
    expect(revokedEvent.valid).toBe(false);
    ws.close();

    // Subsequent REST calls using the revoked JWT are immediately rejected with 401
    const afterRevoke = await apiJson<{ error: string }>('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(afterRevoke.status).toBe(401);
  });

  it('blocks cross-tenant access between two independently registered organizations', async () => {
    const regA = await apiJson<{ token: string; context: { organization: { id: string } } }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Org A Owner',
        email: 'a@tenantA.io',
        password: 'Password123!',
        organizationName: 'Tenant Alpha',
      }),
    });
    const regB = await apiJson<{ token: string; context: { organization: { id: string } } }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Org B Owner',
        email: 'b@tenantB.io',
        password: 'Password123!',
        organizationName: 'Tenant Beta',
      }),
    });
    expect(regA.status).toBe(201);
    expect(regB.status).toBe(201);

    // Org B creates a private contact
    await apiJson('/api/contacts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${regB.body.token}` },
      body: JSON.stringify({
        firstName: 'Private',
        lastName: 'Contact',
        email: 'secret@tenantB.io',
        consentStatus: 'opted_in',
      }),
    });

    // Org A attempts to spoof X-Organization-Id header to Org B
    const spoofRes = await apiJson<{ error: string }>('/api/contacts', {
      headers: {
        Authorization: `Bearer ${regA.body.token}`,
        'X-Organization-Id': regB.body.context.organization.id,
      },
    });
    expect(spoofRes.status).toBe(403);
    expect(spoofRes.body.error).toContain('Cross-tenant access denied');

    // Org A's own contact list never contains Org B's secret contact
    const orgARes = await apiJson<{ contacts: Array<{ email: string }> }>('/api/contacts', {
      headers: { Authorization: `Bearer ${regA.body.token}` },
    });
    expect(orgARes.status).toBe(200);
    expect(orgARes.body.contacts.some((c) => c.email === 'secret@tenantB.io')).toBe(false);
  });

  it('enforces backend RBAC for invited Analyst and Campaign Editor roles', async () => {
    const owner = await apiJson<{ token: string; context: { workspaces: Array<{ id: string }> } }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Owner',
        email: 'owner@rbac.io',
        password: 'Password123!',
        organizationName: 'RBAC Org',
      }),
    });
    const wsId = owner.body.context.workspaces[0].id;

    // Invite Analyst and Editor
    const analystInv = await apiJson<{ invitation: { token: string } }>('/api/team/invitations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.body.token}` },
      body: JSON.stringify({ email: 'analyst@rbac.io', role: 'Analyst' }),
    });
    const editorInv = await apiJson<{ invitation: { token: string } }>('/api/team/invitations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.body.token}` },
      body: JSON.stringify({ email: 'editor@rbac.io', role: 'Campaign Editor' }),
    });

    const analystAuth = await apiJson<{ token: string }>('/api/auth/accept-invite', {
      method: 'POST',
      body: JSON.stringify({ token: analystInv.body.invitation.token, name: 'Analyst User', password: 'Password123!' }),
    });
    const editorAuth = await apiJson<{ token: string }>('/api/auth/accept-invite', {
      method: 'POST',
      body: JSON.stringify({ token: editorInv.body.invitation.token, name: 'Editor User', password: 'Password123!' }),
    });

    const analystCreate = await apiJson<{ error: string }>('/api/campaigns', {
      method: 'POST',
      headers: { Authorization: `Bearer ${analystAuth.body.token}` },
      body: JSON.stringify({
        name: 'Blocked Analyst Campaign',
        type: 'newsletter',
        workspaceId: wsId,
        subject: 'Test',
        senderName: 'Test',
        senderEmail: 'test@rbac.io',
        replyTo: 'test@rbac.io',
        htmlBody: '<p>Hello world</p>',
      }),
    });
    expect(analystCreate.status).toBe(403);

    // Editor creates social post but cannot self-publish without approval when org requires approval
    const postRes = await apiJson<{ post: { id: string } }>('/api/social/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${editorAuth.body.token}` },
      body: JSON.stringify({
        title: 'Unapproved Post',
        baseIdea: 'Launch update',
        platforms: ['linkedin'],
        workspaceId: wsId,
      }),
    });
    expect(postRes.status).toBe(201);

    const editorPublishUnapproved = await apiJson<{ error: string }>(
      `/api/social/posts/${postRes.body.post.id}/publish`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${editorAuth.body.token}` },
      }
    );
    expect(editorPublishUnapproved.status).toBe(403);
  });
});

describe('End-to-End Flows — Email, Unsubscribe & MCP CRM', () => {
  it('completes full email lifecycle: create contact -> create campaign -> submit -> approve -> send -> analytics', async () => {
    const owner = await apiJson<{
      token: string;
      context: { organization: { id: string }; workspaces: Array<{ id: string }> };
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Owner',
        email: 'owner@e2e.io',
        password: 'Password123!',
        organizationName: 'E2E Org',
      }),
    });
    const wsId = owner.body.context.workspaces[0].id;

    // Add Editor & Marketing Manager
    const editorInv = await apiJson<{ invitation: { token: string } }>('/api/team/invitations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.body.token}` },
      body: JSON.stringify({ email: 'editor@e2e.io', role: 'Campaign Editor' }),
    });
    const mgrInv = await apiJson<{ invitation: { token: string } }>('/api/team/invitations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.body.token}` },
      body: JSON.stringify({ email: 'manager@e2e.io', role: 'Marketing Manager' }),
    });

    const editorAuth = await apiJson<{ token: string }>('/api/auth/accept-invite', {
      method: 'POST',
      body: JSON.stringify({ token: editorInv.body.invitation.token, name: 'Editor', password: 'Password123!' }),
    });
    const managerAuth = await apiJson<{ token: string }>('/api/auth/accept-invite', {
      method: 'POST',
      body: JSON.stringify({ token: mgrInv.body.invitation.token, name: 'Manager', password: 'Password123!' }),
    });

    // Add eligible subscribed contact
    const contactRes = await apiJson<{ contact: { id: string } }>('/api/contacts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner.body.token}` },
      body: JSON.stringify({
        firstName: 'Ananya',
        lastName: 'Sharma',
        email: 'ananya@e2e.io',
        company: 'FinScale',
        consentStatus: 'opted_in',
      }),
    });
    expect(contactRes.status).toBe(201);

    // 1. Create Campaign as Editor
    const created = await apiJson<{ campaign: { id: string } }>('/api/campaigns', {
      method: 'POST',
      headers: { Authorization: `Bearer ${editorAuth.body.token}` },
      body: JSON.stringify({
        name: 'E2E Verified Campaign',
        type: 'product_launch',
        workspaceId: wsId,
        audienceType: 'all_subscribed',
        subject: 'Hello {{first_name}}',
        senderName: 'DeX Team',
        senderEmail: 'dex@e2e.io',
        replyTo: 'dex@e2e.io',
        htmlBody: '<p>Welcome {{first_name}} at {{company}}</p>',
      }),
    });
    expect(created.status).toBe(201);
    const campId = created.body.campaign.id;

    // 2. Submit for Approval
    const submitRes = await apiJson<{ approval: { id: string } }>(`/api/campaigns/${campId}/submit-approval`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${editorAuth.body.token}` },
    });
    expect(submitRes.status).toBe(200);

    // 3. Approve as Marketing Manager
    const approveRes = await apiJson<{ approval: { status: string } }>(
      `/api/approvals/${submitRes.body.approval.id}/decide`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${managerAuth.body.token}` },
        body: JSON.stringify({ decision: 'approved', note: 'Approved for E2E launch' }),
      }
    );
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.approval.status).toBe('approved');

    // 4. Execute Send
    const sendRes = await apiJson<{ sentCount: number; simulated: boolean }>(`/api/campaigns/${campId}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerAuth.body.token}` },
    });
    expect(sendRes.status).toBe(200);
    expect(sendRes.body.sentCount).toBe(1);

    // 5. Verify Analytics
    const analytics = await apiJson<{ metrics: { sent: number; delivered: number } }>(
      `/api/campaigns/${campId}/analytics`,
      { headers: { Authorization: `Bearer ${managerAuth.body.token}` } }
    );
    expect(analytics.status).toBe(200);
    expect(analytics.body.metrics.sent).toBe(1);
  });

  it('excludes unsubscribed contacts via Unsubscribe Center and queries MCP CRM tools live', async () => {
    const ownerAuth = await apiJson<{
      token: string;
      context: { organization: { id: string }; workspaces: Array<{ id: string }> };
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Owner',
        email: 'owner@unsub.io',
        password: 'Password123!',
        organizationName: 'Unsub Org',
      }),
    });
    const orgId = ownerAuth.body.context.organization.id;
    const wsId = ownerAuth.body.context.workspaces[0].id;

    const contactRes = await apiJson<{ contact: { id: string } }>('/api/contacts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerAuth.body.token}` },
      body: JSON.stringify({
        firstName: 'Ananya',
        lastName: 'Sharma',
        email: 'ananya@finscale.in',
        company: 'FinScale',
        consentStatus: 'opted_in',
      }),
    });
    const targetContactId = contactRes.body.contact.id;

    const campRes = await apiJson<{ campaign: { id: string } }>('/api/campaigns', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerAuth.body.token}` },
      body: JSON.stringify({
        name: 'Compliance Check Campaign',
        type: 'newsletter',
        workspaceId: wsId,
        audienceType: 'all_subscribed',
        subject: 'Update',
        senderName: 'Team',
        senderEmail: 'team@unsub.io',
        replyTo: 'team@unsub.io',
        htmlBody: '<p>Hello</p>',
      }),
    });

    const unsubRes = await fetch(`${baseUrl}/unsubscribe/${targetContactId}?org=${orgId}`);
    expect(unsubRes.status).toBe(200);

    const camp = demoStore.state.campaigns.find((c) => c.id === campRes.body.campaign.id)!;
    const compliance = validateCampaignCompliance(orgId, camp);
    expect(compliance.audienceSummary.unsubscribedCount).toBeGreaterThanOrEqual(1);
    const eligibleEmails = resolveCampaignAudience(orgId, camp).eligible.map((c) => c.email);
    expect(eligibleEmails).not.toContain('ananya@finscale.in');

    // Connect Local MCP CRM Sandbox & query live without CSV import
    const mcpCreated = await apiJson<{ integration: { id: string } }>('/api/integrations/mcp-builtin', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerAuth.body.token}` },
      body: JSON.stringify({ name: 'Local MCP CRM Sandbox' }),
    });
    expect(mcpCreated.status).toBe(201);

    const mcpRes = await apiJson<{ result: { records: Array<{ email: string }> } }>(
      `/api/integrations/${mcpCreated.body.integration.id}/mcp-query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerAuth.body.token}` },
        body: JSON.stringify({ toolName: 'search_contacts', arguments: { query: 'FinScale' } }),
      }
    );
    expect(mcpRes.status).toBe(200);
    expect(mcpRes.body.result.records.some((r) => r.email === 'ananya@finscale.in')).toBe(true);
  });
});
