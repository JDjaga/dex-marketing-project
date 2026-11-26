import 'dotenv/config';
import crypto from 'crypto';
import http from 'http';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import { isDatabaseConfigured } from './src/db/index.ts';
import { aiFacade } from './src/server/providers/aiProvider.ts';
import { emailProvider } from './src/server/providers/emailProvider.ts';
import { handleMockMcpRpc, mcpCrmClient, type MCPJsonRpcRequest } from './src/server/providers/mcpCrmClient.ts';
import {
  buildAuthContext,
  listUserJwtSessions,
  loginWithPassword,
  notifyUserRoleChanged,
  recordAudit,
  registerOrganizationAndUser,
  requireAuth,
  requirePermission,
  revokeAllUserSessions,
  revokeJwtSession,
  subscribeSessionEvents,
  verifyActiveJwtSession,
  type AuthedRequest,
} from './src/server/services/authService.ts';
import {
  calculateCampaignMetrics,
  decideApproval,
  evaluateSegmentContacts,
  executeCampaignSend,
  executeWorkflow,
  processUnsubscribe,
  publishSocialPost,
  resolveCampaignAudience,
  runLeadDiscovery,
  submitForApproval,
  triggerAutomations,
  validateCampaignCompliance,
} from './src/server/services/marketingService.ts';
import { demoStore } from './src/server/store/demoStore.ts';
import { hashPassword, logSafe, maskSecret, validateSafeExternalUrl } from './src/server/utils/security.ts';
import {
  CreateCampaignSchema,
  CreateContactSchema,
  LoginSchema,
  RegisterSchema,
  type AutomationWorkflow,
  type Campaign,
  type RoleName,
  type Segment,
  type SocialPlatform,
  type SocialPost,
} from './src/shared/types.ts';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Attach request correlation ID
  app.use((req, res, next) => {
    const reqId = crypto.randomUUID().slice(0, 8);
    res.setHeader('X-Request-Id', reqId);
    next();
  });

  function getAppBaseUrl(req: express.Request): string {
    const envUrl = process.env.APP_URL?.trim();
    if (envUrl && envUrl !== 'MY_APP_URL') return envUrl.replace(/\/$/, '');
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
    return `${proto}://${host}`;
  }

  // ============================================================================
  // Public Health, Email Tracking & Unsubscribe Routes
  // ============================================================================

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      databaseMode: isDatabaseConfigured() ? 'neon_postgresql' : 'demo_parity_store',
      aiStatus: aiFacade.getStatus(),
      emailStatus: emailProvider.getStatus(),
      timestamp: new Date().toISOString(),
    });
  });

  // 1x1 transparent PNG tracking pixel (records email open event)
  app.get('/t/open/:sendId.png', (req, res) => {
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    logSafe('info', 'email.tracking_pixel', { sendId: req.params.sendId });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send(pixel);
  });

  // Click tracking redirect with strict SSRF / scheme validation
  app.get('/t/click/:sendId', (req, res) => {
    const rawUrl = String(req.query.url || '');
    const check = validateSafeExternalUrl(rawUrl);
    if (!check.valid || !check.parsed) {
      return res.status(400).send('Invalid or blocked redirect URL.');
    }
    logSafe('info', 'email.click_tracked', { sendId: req.params.sendId, host: check.parsed.hostname });
    return res.redirect(302, check.parsed.toString());
  });

  // Public safe Unsubscribe endpoint
  app.get('/unsubscribe/:contactId', (req, res) => {
    const orgId = String(req.query.org || '');
    const campId = req.query.camp ? String(req.query.camp) : undefined;
    const contact = processUnsubscribe({
      organizationId: orgId,
      contactId: req.params.contactId,
      campaignId: campId,
    });
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!doctype html><html><body style="font-family:sans-serif;max-width:520px;margin:60px auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
      <h2 style="color:#0A2472;margin-top:0;">Subscription Preferences Updated</h2>
      <p>${contact ? `${contact.email} has been unsubscribed and added to the organization suppression list.` : 'Your unsubscribe request has been recorded.'}</p>
      <p style="font-size:13px;color:#64748b;">DEX Marketing by Colakin · Compliance &amp; Consent Center</p>
    </body></html>`);
  });

  // Built-in Simulated MCP CRM JSON-RPC 2.0 Server
  app.post('/api/mcp/mock-crm', requireAuth, (req: AuthedRequest, res) => {
    const rpc = req.body as MCPJsonRpcRequest;
    const result = handleMockMcpRpc(req.auth!.organization.id, rpc);
    res.json(result);
  });

  // ============================================================================
  // Authentication & Session Routes
  // ============================================================================

  app.get('/api/auth/status', (_req, res) => {
    res.json({
      initialized: demoStore.state.users.length > 0,
      databaseMode: isDatabaseConfigured() ? 'neon_postgresql' : 'in_memory_store',
      realTimeJwt: true,
      wsPath: '/ws/auth',
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid credentials' });

    const userAgent = String(req.headers['user-agent'] || 'Web Client');
    const authResult = loginWithPassword(parsed.data.email, parsed.data.password, userAgent);
    if (!authResult) return res.status(401).json({ error: 'Invalid email or password.' });

    res.json({
      token: authResult.token,
      context: authResult.context,
      session: authResult.session,
      ttlSeconds: Math.max(0, authResult.claims.exp - Math.floor(Date.now() / 1000)),
    });
  });

  app.post('/api/auth/register', (req, res) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration data' });
    try {
      const userAgent = String(req.headers['user-agent'] || 'Web Client');
      const authResult = registerOrganizationAndUser(parsed.data, userAgent);
      res.status(201).json({
        token: authResult.token,
        context: authResult.context,
        session: authResult.session,
        ttlSeconds: Math.max(0, authResult.claims.exp - Math.floor(Date.now() / 1000)),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Registration failed' });
    }
  });

  app.post('/api/auth/accept-invite', (req, res) => {
    const token = String(req.body?.token || '').trim();
    const name = String(req.body?.name || '').trim();
    const password = String(req.body?.password || '');
    if (!token || name.length < 2 || password.length < 8) {
      return res.status(400).json({ error: 'Valid invitation token, name, and password (8+ chars) are required.' });
    }

    const inv = demoStore.state.invitations.find((i) => i.token === token && i.status === 'pending');
    if (!inv) return res.status(404).json({ error: 'Invitation not found or already accepted.' });

    let user = demoStore.state.users.find((u) => u.email.toLowerCase() === inv.email.toLowerCase());
    const nowIso = new Date().toISOString();
    if (!user) {
      user = {
        id: crypto.randomUUID(),
        email: inv.email.toLowerCase(),
        name,
        title: inv.role,
        passwordHash: hashPassword(password),
        timezone: 'UTC',
        createdAt: nowIso,
      };
      demoStore.state.users.push(user);
    }

    const alreadyMember = demoStore.state.members.some(
      (m) => m.userId === user!.id && m.organizationId === inv.organizationId
    );
    if (!alreadyMember) {
      demoStore.state.members.push({
        id: crypto.randomUUID(),
        organizationId: inv.organizationId,
        userId: user.id,
        role: inv.role,
        userName: user.name,
        userEmail: user.email,
        userTitle: inv.role,
        joinedAt: nowIso,
      });
    }
    inv.status = 'accepted';

    const userAgent = String(req.headers['user-agent'] || 'Web Client');
    const authResult = loginWithPassword(user.email, password, userAgent);
    if (!authResult) {
      return res.status(400).json({ error: 'Account already existed with a different password. Please sign in directly.' });
    }
    res.status(201).json({
      token: authResult.token,
      context: authResult.context,
      session: authResult.session,
      ttlSeconds: Math.max(0, authResult.claims.exp - Math.floor(Date.now() / 1000)),
    });
  });

  app.post('/api/auth/verify', (req, res) => {
    const authHeader = req.headers.authorization;
    const rawToken =
      (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '') ||
      String(req.body?.token || '').trim();
    if (!rawToken) {
      return res.status(401).json({ valid: false, error: 'JWT token required for verification.' });
    }
    const requestedOrgId = (req.headers['x-organization-id'] as string | undefined) || req.body?.organizationId;
    const verified = verifyActiveJwtSession(rawToken, requestedOrgId);
    if (!verified.valid) {
      return res.status(verified.status).json({ valid: false, error: verified.reason });
    }
    res.json({
      valid: true,
      claims: verified.claims,
      session: verified.session,
      ttlSeconds: verified.ttlSeconds,
      serverTime: new Date().toISOString(),
    });
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res) => {
    if (req.jwtClaims?.jti) {
      revokeJwtSession(req.jwtClaims.jti, req.auth!.user.id, 'User signed out');
    }
    res.json({ signedOut: true });
  });

  app.get('/api/auth/sessions', requireAuth, (req: AuthedRequest, res) => {
    const sessions = listUserJwtSessions(req.auth!.user.id).map((s) => ({
      ...s,
      isCurrent: s.jti === req.jwtClaims?.jti,
    }));
    res.json({ sessions });
  });

  app.delete('/api/auth/sessions/:jti', requireAuth, (req: AuthedRequest, res) => {
    const ok = revokeJwtSession(String(req.params.jti), req.auth!.user.id, 'Session revoked by user');
    if (!ok) return res.status(404).json({ error: 'Active session not found.' });
    res.json({ revoked: true, jti: req.params.jti });
  });

  app.post('/api/auth/forgot-password', (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const user = demoStore.state.users.find((u) => u.email.toLowerCase() === email);
    if (user) {
      const token = crypto.randomBytes(16).toString('hex');
      demoStore.state.resetTokens.push({
        token,
        userId: user.id,
        expiresAt: Date.now() + 3600 * 1000,
        used: false,
      });
      return res.json({
        message: 'Password reset instructions generated.',
        resetToken: token,
      });
    }
    res.json({ message: 'If that email exists, reset instructions have been issued.' });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const token = String(req.body?.token || '');
    const newPassword = String(req.body?.password || '');
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const record = demoStore.state.resetTokens.find((t) => t.token === token && !t.used && t.expiresAt > Date.now());
    if (!record) return res.status(400).json({ error: 'Invalid or expired reset token.' });
    const user = demoStore.state.users.find((u) => u.id === record.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    user.passwordHash = hashPassword(newPassword);
    record.used = true;
    revokeAllUserSessions(user.id, 'Password was reset');
    res.json({ message: 'Password updated successfully. All prior JWT sessions have been revoked.' });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({
      context: req.auth,
      jti: req.jwtClaims?.jti,
      exp: req.jwtClaims?.exp,
      ttlSeconds: req.jwtClaims ? Math.max(0, req.jwtClaims.exp - Math.floor(Date.now() / 1000)) : 0,
    });
  });

  // ============================================================================
  // Organizations, Workspaces, Team & Settings
  // ============================================================================

  app.post('/api/organizations', requireAuth, (req: AuthedRequest, res) => {
    const name = String(req.body?.name || '').trim();
    const industry = String(req.body?.industry || 'Technology').trim();
    if (name.length < 2) return res.status(400).json({ error: 'Organization name must be at least 2 characters.' });

    const orgId = crypto.randomUUID();
    const wsId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const org = {
      id: orgId,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || orgId.slice(0, 8),
      industry,
      requireApprovalForPublish: true,
      dataRetentionDays: 730,
      createdAt: nowIso,
    };
    demoStore.state.organizations.push(org);
    demoStore.state.workspaces.push({
      id: wsId,
      organizationId: orgId,
      name: 'Default Workspace',
      type: 'brand',
      description: 'Primary workspace',
      createdAt: nowIso,
    });
    demoStore.state.members.push({
      id: crypto.randomUUID(),
      organizationId: orgId,
      userId: req.auth!.user.id,
      role: 'Owner',
      userName: req.auth!.user.name,
      userEmail: req.auth!.user.email,
      userTitle: req.auth!.user.title,
      joinedAt: nowIso,
    });

    const context = buildAuthContext(req.auth!.user.id, orgId);
    res.status(201).json({ organization: org, context });
  });

  app.patch('/api/organizations/current', requireAuth, requirePermission('org:manage'), (req: AuthedRequest, res) => {
    const org = demoStore.state.organizations.find((o) => o.id === req.auth!.organization.id)!;
    if (typeof req.body?.name === 'string' && req.body.name.trim()) org.name = req.body.name.trim();
    if (typeof req.body?.industry === 'string') org.industry = req.body.industry.trim();
    if (typeof req.body?.requireApprovalForPublish === 'boolean') {
      org.requireApprovalForPublish = req.body.requireApprovalForPublish;
    }
    if (typeof req.body?.dataRetentionDays === 'number') {
      org.dataRetentionDays = Math.max(30, Math.min(3650, req.body.dataRetentionDays));
    }
    recordAudit({
      organizationId: org.id,
      actorId: req.auth!.user.id,
      actorName: req.auth!.user.name,
      actorRole: req.auth!.role,
      action: 'organization.updated',
      targetType: 'organization',
      targetId: org.id,
      detail: 'Updated organization governance and privacy settings.',
    });
    res.json({ organization: org });
  });

  app.post('/api/workspaces', requireAuth, requirePermission('workspace:manage'), (req: AuthedRequest, res) => {
    const name = String(req.body?.name || '').trim();
    const type = (req.body?.type || 'brand') as 'brand' | 'client' | 'department' | 'project';
    const description = String(req.body?.description || '').trim();
    if (name.length < 2) return res.status(400).json({ error: 'Workspace name required.' });

    const ws = {
      id: crypto.randomUUID(),
      organizationId: req.auth!.organization.id,
      name,
      type,
      description,
      createdAt: new Date().toISOString(),
    };
    demoStore.state.workspaces.push(ws);
    res.status(201).json({ workspace: ws });
  });

  app.get('/api/team', requireAuth, (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    res.json({
      members: demoStore.state.members.filter((m) => m.organizationId === orgId),
      invitations: demoStore.state.invitations.filter((i) => i.organizationId === orgId),
      auditLogs: demoStore.state.auditLogs.filter((a) => a.organizationId === orgId).slice(0, 60),
    });
  });

  app.post('/api/team/invitations', requireAuth, requirePermission('team:manage'), (req: AuthedRequest, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = (req.body?.role || 'Campaign Editor') as RoleName;
    if (!email.includes('@')) return res.status(400).json({ error: 'Valid email is required.' });

    const inv = {
      id: `inv-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: req.auth!.organization.id,
      email,
      role,
      token: crypto.randomBytes(12).toString('hex'),
      status: 'pending' as const,
      invitedByName: req.auth!.user.name,
      createdAt: new Date().toISOString(),
    };
    demoStore.state.invitations.unshift(inv);
    recordAudit({
      organizationId: req.auth!.organization.id,
      actorId: req.auth!.user.id,
      actorName: req.auth!.user.name,
      actorRole: req.auth!.role,
      action: 'team.invited',
      targetType: 'invitation',
      targetId: inv.id,
      detail: `Invited ${email} as ${role}.`,
    });
    res.status(201).json({ invitation: inv });
  });

  app.patch('/api/team/members/:memberId/role', requireAuth, requirePermission('team:manage'), (req: AuthedRequest, res) => {
    const member = demoStore.state.members.find(
      (m) => m.id === req.params.memberId && m.organizationId === req.auth!.organization.id
    );
    if (!member) return res.status(404).json({ error: 'Member not found.' });
    member.role = req.body.role as RoleName;
    notifyUserRoleChanged(member.userId, member.role);
    recordAudit({
      organizationId: req.auth!.organization.id,
      actorId: req.auth!.user.id,
      actorName: req.auth!.user.name,
      actorRole: req.auth!.role,
      action: 'team.role_changed',
      targetType: 'member',
      targetId: member.id,
      detail: `Changed ${member.userName} role to ${member.role}.`,
    });
    res.json({ member });
  });

  app.delete('/api/team/members/:memberId', requireAuth, requirePermission('team:manage'), (req: AuthedRequest, res) => {
    const idx = demoStore.state.members.findIndex(
      (m) => m.id === req.params.memberId && m.organizationId === req.auth!.organization.id
    );
    if (idx === -1) return res.status(404).json({ error: 'Member not found.' });
    if (demoStore.state.members[idx].userId === req.auth!.user.id) {
      return res.status(400).json({ error: 'You cannot remove yourself.' });
    }
    const [removed] = demoStore.state.members.splice(idx, 1);
    revokeAllUserSessions(removed.userId, 'Organization membership removed');
    res.json({ removed });
  });

  // ============================================================================
  // Dashboard & Unified Analytics
  // ============================================================================

  app.get('/api/dashboard', requireAuth, (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    const contacts = demoStore.state.contacts.filter((c) => c.organizationId === orgId);
    const campaigns = demoStore.state.campaigns.filter((c) => c.organizationId === orgId);
    const events = demoStore.state.campaignEvents.filter((e) => e.organizationId === orgId);
    const posts = demoStore.state.socialPosts.filter((p) => p.organizationId === orgId);
    const leads = demoStore.state.leadCandidates.filter((l) => l.organizationId === orgId);
    const approvals = demoStore.state.approvals.filter((a) => a.organizationId === orgId && a.status === 'pending');

    const sent = events.filter((e) => e.type === 'sent').length;
    const delivered = events.filter((e) => e.type === 'delivered').length;
    const uniqueOpens = new Set(events.filter((e) => e.type === 'open').map((e) => `${e.campaignId}:${e.contactId}`)).size;
    const uniqueClicks = new Set(events.filter((e) => e.type === 'click').map((e) => `${e.campaignId}:${e.contactId}`)).size;
    const bounced = events.filter((e) => e.type === 'bounce').length;
    const unsubscribes = events.filter((e) => e.type === 'unsubscribe').length;
    const conversions = events.filter((e) => e.type === 'conversion').length;

    const safeRate = (n: number, d: number) => (d > 0 ? Number(((n / d) * 100).toFixed(1)) : 0);
    const socialEngagement = posts.reduce(
      (sum, p) => sum + (p.metrics?.likes || 0) + (p.metrics?.comments || 0) + (p.metrics?.shares || 0),
      0
    );

    const kpis = {
      totalAudience: contacts.length,
      activeCampaigns: campaigns.filter((c) => ['sending', 'scheduled', 'approved', 'pending_approval'].includes(c.status)).length,
      emailsSent: sent,
      deliveryRate: safeRate(delivered, sent),
      openRate: safeRate(uniqueOpens, delivered),
      clickRate: safeRate(uniqueClicks, delivered),
      bounceRate: safeRate(bounced, sent),
      unsubscribeRate: safeRate(unsubscribes, delivered),
      leadsGenerated: leads.length + contacts.filter((c) => c.source === 'Lead Discovery').length,
      socialEngagement,
      scheduledPosts: posts.filter((p) => p.status === 'scheduled').length,
      conversionRate: safeRate(conversions, delivered),
      pendingApprovals: approvals.length,
    };

    const campaignComparison = campaigns.map((c) => {
      const m = calculateCampaignMetrics(orgId, c.id);
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        sent: m.sent,
        delivered: m.delivered,
        openRate: m.openRate !== null ? Number((m.openRate * 100).toFixed(1)) : null,
        clickRate: m.clickRate !== null ? Number((m.clickRate * 100).toFixed(1)) : null,
        conversions: m.conversions,
      };
    });

    res.json({
      kpis,
      campaignComparison,
      recentActivity: demoStore.state.auditLogs.filter((a) => a.organizationId === orgId).slice(0, 10),
      upcomingScheduled: [
        ...campaigns
          .filter((c) => c.scheduledAt)
          .map((c) => ({ id: c.id, kind: 'Email', title: c.name, scheduledAt: c.scheduledAt!, status: c.status })),
        ...posts
          .filter((p) => p.scheduledAt)
          .map((p) => ({ id: p.id, kind: 'Social', title: p.title, scheduledAt: p.scheduledAt!, status: p.status })),
      ].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
      notifications: demoStore.state.notifications.filter((n) => n.organizationId === orgId).slice(0, 10),
      isDemoMode: !isDatabaseConfigured() || emailProvider.getStatus().simulationMode,
    });
  });

  // ============================================================================
  // Audience, Contacts, Segments & Compliance
  // ============================================================================

  app.get('/api/contacts', requireAuth, requirePermission('audience:read'), (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    const q = String(req.query.q || '').trim().toLowerCase();
    const list = demoStore.state.contacts
      .filter((c) => c.organizationId === orgId)
      .filter((c) => {
        if (!q) return true;
        return `${c.firstName} ${c.lastName} ${c.email} ${c.company || ''} ${c.location || ''}`.toLowerCase().includes(q);
      });
    res.json({ contacts: list });
  });

  app.post('/api/contacts', requireAuth, requirePermission('audience:write'), async (req: AuthedRequest, res) => {
    const parsed = CreateContactSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid contact payload' });

    const orgId = req.auth!.organization.id;
    const dup = demoStore.state.contacts.find(
      (c) => c.organizationId === orgId && c.email.toLowerCase() === parsed.data.email.toLowerCase()
    );
    if (dup) return res.status(409).json({ error: 'A contact with this email already exists in this organization.' });

    const workspaceId = String(req.body?.workspaceId || req.auth!.workspaces[0]?.id || '');
    const nowIso = new Date().toISOString();
    const contact = {
      id: crypto.randomUUID(),
      organizationId: orgId,
      workspaceId,
      ...parsed.data,
      customAttributes: {},
      engagementScore: 60,
      crmOwnedFields: [],
      crmEditable: true,
      subscriptionStatus: parsed.data.consentStatus === 'opted_out' ? ('unsubscribed' as const) : ('subscribed' as const),
      notes: [],
      createdAt: nowIso,
    };
    demoStore.state.contacts.unshift(contact);
    demoStore.state.consentRecords.unshift({
      id: `con-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: orgId,
      contactId: contact.id,
      email: contact.email,
      status: contact.consentStatus === 'opted_out' ? 'opted_out' : 'opted_in',
      source: contact.source,
      lawfulBasis: 'Recorded at contact creation',
      recordedAt: nowIso,
    });

    await triggerAutomations(orgId, 'contact_created', {
      contactId: contact.id,
      detail: `New contact created: ${contact.email}`,
    });

    res.status(201).json({ contact });
  });

  app.patch('/api/contacts/:id', requireAuth, requirePermission('audience:write'), (req: AuthedRequest, res) => {
    const contact = demoStore.state.contacts.find(
      (c) => c.id === req.params.id && c.organizationId === req.auth!.organization.id
    );
    if (!contact) return res.status(404).json({ error: 'Contact not found.' });

    // Enforce CRM source-of-truth field protection
    if (!contact.crmEditable && contact.crmOwnedFields.length > 0) {
      for (const field of contact.crmOwnedFields) {
        if (req.body[field] !== undefined && req.body[field] !== (contact as unknown as Record<string, unknown>)[field]) {
          return res.status(403).json({
            error: `Field "${field}" is owned by external CRM (${contact.crmProvider}) and read-only here.`,
          });
        }
      }
    }

    const allowedLocalFields = ['firstName', 'lastName', 'phone', 'location', 'state', 'country', 'tags', 'lifecycleStage'] as const;
    for (const f of allowedLocalFields) {
      if (req.body[f] !== undefined) {
        (contact as unknown as Record<string, unknown>)[f] = req.body[f];
      }
    }
    if (typeof req.body?.newNote === 'string' && req.body.newNote.trim()) {
      contact.notes.unshift({
        id: `note-${crypto.randomUUID().slice(0, 6)}`,
        author: req.auth!.user.name,
        text: req.body.newNote.trim(),
        createdAt: new Date().toISOString(),
      });
    }

    res.json({ contact });
  });

  app.delete('/api/contacts/:id', requireAuth, requirePermission('compliance:manage'), (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    const idx = demoStore.state.contacts.findIndex((c) => c.id === req.params.id && c.organizationId === orgId);
    if (idx === -1) return res.status(404).json({ error: 'Contact not found.' });
    const [deleted] = demoStore.state.contacts.splice(idx, 1);
    recordAudit({
      organizationId: orgId,
      actorId: req.auth!.user.id,
      actorName: req.auth!.user.name,
      actorRole: req.auth!.role,
      action: 'compliance.contact_deleted',
      targetType: 'contact',
      targetId: deleted.id,
      detail: `Executed GDPR/privacy deletion for ${deleted.email}.`,
    });
    res.json({ deleted: true });
  });

  app.get('/api/segments', requireAuth, requirePermission('audience:read'), (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    const segments = demoStore.state.segments
      .filter((s) => s.organizationId === orgId)
      .map((s) => ({
        ...s,
        cachedCount: evaluateSegmentContacts(orgId, s).length,
      }));
    res.json({ segments });
  });

  app.post('/api/segments', requireAuth, requirePermission('audience:write'), (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    const name = String(req.body?.name || '').trim();
    if (name.length < 2) return res.status(400).json({ error: 'Segment name required.' });

    const segment: Segment = {
      id: crypto.randomUUID(),
      organizationId: orgId,
      workspaceId: String(req.body?.workspaceId || req.auth!.workspaces[0]?.id || ''),
      name,
      description: String(req.body?.description || ''),
      logic: req.body?.logic === 'OR' ? 'OR' : 'AND',
      isDynamic: req.body?.isDynamic !== false,
      conditions: Array.isArray(req.body?.conditions) ? req.body.conditions : [],
      cachedCount: 0,
      lastRefreshedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    segment.cachedCount = evaluateSegmentContacts(orgId, segment).length;
    demoStore.state.segments.unshift(segment);
    res.status(201).json({ segment });
  });

  app.post('/api/segments/preview', requireAuth, requirePermission('audience:read'), (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    const matches = evaluateSegmentContacts(orgId, {
      logic: req.body?.logic === 'OR' ? 'OR' : 'AND',
      conditions: Array.isArray(req.body?.conditions) ? req.body.conditions : [],
    });
    res.json({ count: matches.length, contacts: matches.slice(0, 25) });
  });

  app.get('/api/compliance', requireAuth, requirePermission('audience:read'), (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    res.json({
      suppressionRecords: demoStore.state.suppressionRecords.filter((s) => s.organizationId === orgId),
      consentRecords: demoStore.state.consentRecords.filter((c) => c.organizationId === orgId),
    });
  });

  app.post('/api/compliance/suppress', requireAuth, requirePermission('compliance:manage'), (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    const email = String(req.body?.email || '').trim().toLowerCase();
    const category = req.body?.category || 'manual';
    const reason = String(req.body?.reason || 'Manually suppressed by compliance operator');
    if (!email.includes('@')) return res.status(400).json({ error: 'Valid email required.' });

    const contact = demoStore.state.contacts.find((c) => c.organizationId === orgId && c.email.toLowerCase() === email);
    if (contact) {
      contact.subscriptionStatus = 'suppressed';
    }
    const existing = demoStore.state.suppressionRecords.find(
      (s) => s.organizationId === orgId && s.email.toLowerCase() === email
    );
    if (existing) return res.json({ record: existing });

    const record = {
      id: `sup-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: orgId,
      contactId: contact?.id,
      email,
      category,
      reason,
      suppressedAt: new Date().toISOString(),
    };
    demoStore.state.suppressionRecords.unshift(record);
    res.status(201).json({ record });
  });

  // ============================================================================
  // Email Campaigns, Templates, Wizard & Per-Campaign Analytics
  // ============================================================================

  app.get('/api/campaigns', requireAuth, (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    const campaigns = demoStore.state.campaigns
      .filter((c) => c.organizationId === orgId)
      .map((c) => ({
        ...c,
        metrics: calculateCampaignMetrics(orgId, c.id),
      }));
    const templates = demoStore.state.emailTemplates.filter((t) => t.organizationId === orgId);
    res.json({ campaigns, templates });
  });

  app.post('/api/campaigns', requireAuth, requirePermission('campaign:create'), (req: AuthedRequest, res) => {
    const parsed = CreateCampaignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid campaign payload' });

    const orgId = req.auth!.organization.id;
    const nowIso = new Date().toISOString();
    const campaign: Campaign = {
      id: crypto.randomUUID(),
      organizationId: orgId,
      ...parsed.data,
      ownerId: req.auth!.user.id,
      ownerName: req.auth!.user.name,
      status: 'draft',
      isDemoSimulated: emailProvider.getStatus().simulationMode,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    demoStore.state.campaigns.unshift(campaign);
    recordAudit({
      organizationId: orgId,
      workspaceId: campaign.workspaceId,
      actorId: req.auth!.user.id,
      actorName: req.auth!.user.name,
      actorRole: req.auth!.role,
      action: 'campaign.created',
      targetType: 'campaign',
      targetId: campaign.id,
      detail: `Created campaign "${campaign.name}".`,
    });
    res.status(201).json({ campaign });
  });

  app.post('/api/campaigns/:id/compliance-check', requireAuth, (req: AuthedRequest, res) => {
    const camp = demoStore.state.campaigns.find(
      (c) => c.id === req.params.id && c.organizationId === req.auth!.organization.id
    );
    if (!camp) return res.status(404).json({ error: 'Campaign not found.' });
    res.json(validateCampaignCompliance(req.auth!.organization.id, camp));
  });

  app.post('/api/campaigns/:id/submit-approval', requireAuth, requirePermission('campaign:edit'), (req: AuthedRequest, res) => {
    const camp = demoStore.state.campaigns.find(
      (c) => c.id === req.params.id && c.organizationId === req.auth!.organization.id
    );
    if (!camp) return res.status(404).json({ error: 'Campaign not found.' });

    const approval = submitForApproval({
      organizationId: req.auth!.organization.id,
      workspaceId: camp.workspaceId,
      entityType: 'email_campaign',
      entityId: camp.id,
      entityTitle: camp.name,
      actorId: req.auth!.user.id,
      actorName: req.auth!.user.name,
      actorRole: req.auth!.role,
    });
    res.json({ approval, campaign: camp });
  });

  app.post('/api/campaigns/:id/schedule', requireAuth, requirePermission('campaign:send'), (req: AuthedRequest, res) => {
    const camp = demoStore.state.campaigns.find(
      (c) => c.id === req.params.id && c.organizationId === req.auth!.organization.id
    );
    if (!camp) return res.status(404).json({ error: 'Campaign not found.' });
    camp.scheduledAt = String(req.body?.scheduledAt || new Date(Date.now() + 3600 * 1000).toISOString());
    camp.status = 'scheduled';
    camp.updatedAt = new Date().toISOString();
    res.json({ campaign: camp });
  });

  app.post('/api/campaigns/:id/send', requireAuth, requirePermission('campaign:send'), async (req: AuthedRequest, res) => {
    try {
      const result = await executeCampaignSend({
        organizationId: req.auth!.organization.id,
        campaignId: String(req.params.id),
        actorId: req.auth!.user.id,
        actorName: req.auth!.user.name,
        actorRole: req.auth!.role,
        appBaseUrl: getAppBaseUrl(req),
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Send failed' });
    }
  });

  app.post('/api/campaigns/:id/pause', requireAuth, requirePermission('campaign:send'), (req: AuthedRequest, res) => {
    const camp = demoStore.state.campaigns.find(
      (c) => c.id === req.params.id && c.organizationId === req.auth!.organization.id
    );
    if (!camp) return res.status(404).json({ error: 'Campaign not found.' });
    camp.status = 'paused';
    camp.updatedAt = new Date().toISOString();
    res.json({ campaign: camp });
  });

  app.get('/api/campaigns/:id/analytics', requireAuth, (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    const camp = demoStore.state.campaigns.find((c) => c.id === req.params.id && c.organizationId === orgId);
    if (!camp) return res.status(404).json({ error: 'Campaign not found.' });

    const resolution = resolveCampaignAudience(orgId, camp);
    const metrics = calculateCampaignMetrics(orgId, camp.id, resolution.eligible.length);
    const events = demoStore.state.campaignEvents.filter((e) => e.organizationId === orgId && e.campaignId === camp.id);

    const linkMap = new Map<string, number>();
    for (const e of events) {
      if (e.type === 'click' && e.linkUrl) {
        linkMap.set(e.linkUrl, (linkMap.get(e.linkUrl) || 0) + 1);
      }
    }

    const deviceMap = new Map<string, number>();
    for (const e of events) {
      if (e.type === 'open' && e.device) {
        deviceMap.set(e.device, (deviceMap.get(e.device) || 0) + 1);
      }
    }

    res.json({
      campaign: camp,
      metrics,
      links: Array.from(linkMap.entries()).map(([url, clicks]) => ({ url, clicks })),
      devices: Array.from(deviceMap.entries()).map(([device, count]) => ({ device, count })),
      recentEvents: events.slice(0, 30),
    });
  });

  // ============================================================================
  // Social Media, Media Library, Calendar, Approvals & Brand Kits
  // ============================================================================

  app.get('/api/social', requireAuth, (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    res.json({
      accounts: demoStore.state.socialAccounts.filter((a) => a.organizationId === orgId),
      posts: demoStore.state.socialPosts.filter((p) => p.organizationId === orgId),
      assets: demoStore.state.contentAssets.filter((a) => a.organizationId === orgId),
    });
  });

  app.post('/api/social/accounts', requireAuth, requirePermission('integrations:manage'), (req: AuthedRequest, res) => {
    const platform = (req.body?.platform || 'linkedin') as SocialPlatform;
    const displayName = String(req.body?.displayName || '').trim();
    const handle = String(req.body?.handle || '').trim();
    if (!displayName || !handle) {
      return res.status(400).json({ error: 'Display name and handle are required.' });
    }
    const account = {
      id: `soc-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: req.auth!.organization.id,
      workspaceId: String(req.body?.workspaceId || req.auth!.workspaces[0]?.id || ''),
      platform,
      displayName,
      handle,
      accountType: String(req.body?.accountType || 'Company Page'),
      status: 'demo_simulated' as const,
      scopes: ['publish', 'read_analytics'],
      capabilities: {
        publishText: platform !== 'youtube',
        publishImage: true,
        publishVideo: true,
        scheduleNative: true,
        fetchAnalytics: platform !== 'x',
        limitationNote:
          platform === 'x'
            ? 'X analytics requires elevated paid API tier.'
            : 'Simulated channel active until live OAuth tokens are connected.',
      },
      connectedAt: new Date().toISOString(),
    };
    demoStore.state.socialAccounts.push(account);
    res.status(201).json({ account });
  });

  app.post('/api/social/accounts/:id/toggle', requireAuth, requirePermission('integrations:manage'), (req: AuthedRequest, res) => {
    const acc = demoStore.state.socialAccounts.find(
      (a) => a.id === req.params.id && a.organizationId === req.auth!.organization.id
    );
    if (!acc) return res.status(404).json({ error: 'Social account not found.' });
    acc.status = acc.status === 'disconnected' ? 'demo_simulated' : 'disconnected';
    acc.connectedAt = new Date().toISOString();
    res.json({ account: acc });
  });

  app.post('/api/social/posts', requireAuth, requirePermission('social:create'), (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    const title = String(req.body?.title || '').trim();
    if (title.length < 2) return res.status(400).json({ error: 'Post title is required.' });

    const nowIso = new Date().toISOString();
    const post: SocialPost = {
      id: crypto.randomUUID(),
      organizationId: orgId,
      workspaceId: String(req.body?.workspaceId || req.auth!.workspaces[0]?.id || ''),
      title,
      baseIdea: String(req.body?.baseIdea || ''),
      platforms: (req.body?.platforms || ['linkedin']) as SocialPlatform[],
      variations: req.body?.variations || {
        linkedin: { content: title, hashtags: [], cta: '' },
        instagram: { content: '', hashtags: [], cta: '' },
        facebook: { content: '', hashtags: [], cta: '' },
        x: { content: '', hashtags: [], cta: '' },
        youtube: { content: '', hashtags: [], cta: '' },
      },
      mediaAssetIds: Array.isArray(req.body?.mediaAssetIds) ? req.body.mediaAssetIds : [],
      linkUrl: req.body?.linkUrl || undefined,
      status: 'draft',
      authorId: req.auth!.user.id,
      authorName: req.auth!.user.name,
      scheduledAt: req.body?.scheduledAt || undefined,
      isDemoSimulated: true,
      metricsAvailable: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    demoStore.state.socialPosts.unshift(post);
    res.status(201).json({ post });
  });

  app.post('/api/social/posts/:id/submit-approval', requireAuth, requirePermission('social:create'), (req: AuthedRequest, res) => {
    const post = demoStore.state.socialPosts.find(
      (p) => p.id === req.params.id && p.organizationId === req.auth!.organization.id
    );
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    const approval = submitForApproval({
      organizationId: req.auth!.organization.id,
      workspaceId: post.workspaceId,
      entityType: 'social_post',
      entityId: post.id,
      entityTitle: post.title,
      actorId: req.auth!.user.id,
      actorName: req.auth!.user.name,
      actorRole: req.auth!.role,
    });
    res.json({ approval, post });
  });

  app.post('/api/social/posts/:id/publish', requireAuth, requirePermission('social:create'), (req: AuthedRequest, res) => {
    try {
      const post = publishSocialPost({
        organizationId: req.auth!.organization.id,
        postId: String(req.params.id),
        actorId: req.auth!.user.id,
        actorName: req.auth!.user.name,
        actorRole: req.auth!.role,
      });
      res.json({ post });
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : 'Publishing blocked' });
    }
  });

  app.patch('/api/social/posts/:id/schedule', requireAuth, requirePermission('social:create'), (req: AuthedRequest, res) => {
    const post = demoStore.state.socialPosts.find(
      (p) => p.id === req.params.id && p.organizationId === req.auth!.organization.id
    );
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    post.scheduledAt = String(req.body?.scheduledAt || new Date().toISOString());
    if (post.status === 'approved') post.status = 'scheduled';
    post.updatedAt = new Date().toISOString();
    res.json({ post });
  });

  app.post('/api/assets', requireAuth, requirePermission('social:create'), (req: AuthedRequest, res) => {
    const name = String(req.body?.name || '').trim();
    const url = String(req.body?.url || '').trim();
    if (!name || !url) return res.status(400).json({ error: 'Asset name and URL/data required.' });

    const asset = {
      id: `asset-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: req.auth!.organization.id,
      workspaceId: String(req.body?.workspaceId || req.auth!.workspaces[0]?.id || ''),
      name,
      folder: String(req.body?.folder || 'Uploads'),
      type: (req.body?.type || 'image') as 'image' | 'video' | 'document',
      mimeType: String(req.body?.mimeType || 'image/png'),
      sizeBytes: Number(req.body?.sizeBytes || 12400),
      url,
      tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
      storageProvider: 'local' as const,
      createdAt: new Date().toISOString(),
    };
    demoStore.state.contentAssets.unshift(asset);
    res.status(201).json({ asset });
  });

  app.get('/api/approvals', requireAuth, (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    res.json({ approvals: demoStore.state.approvals.filter((a) => a.organizationId === orgId) });
  });

  app.post('/api/approvals/:id/decide', requireAuth, requirePermission('campaign:approve'), (req: AuthedRequest, res) => {
    const decisionSchema = z.object({
      decision: z.enum(['approved', 'rejected', 'changes_requested']),
      note: z.string().max(500).optional(),
    });
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid approval decision.' });

    try {
      const approval = decideApproval({
        organizationId: req.auth!.organization.id,
        approvalId: String(req.params.id),
        decision: parsed.data.decision,
        note: parsed.data.note,
        actorId: req.auth!.user.id,
        actorName: req.auth!.user.name,
        actorRole: req.auth!.role,
      });
      res.json({ approval });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Approval error' });
    }
  });

  app.get('/api/brand-kits', requireAuth, (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    res.json({ brandKits: demoStore.state.brandKits.filter((b) => b.organizationId === orgId) });
  });

  app.put('/api/brand-kits/:id', requireAuth, requirePermission('brand:manage'), (req: AuthedRequest, res) => {
    const kit = demoStore.state.brandKits.find(
      (b) => b.id === req.params.id && b.organizationId === req.auth!.organization.id
    );
    if (!kit) return res.status(404).json({ error: 'Brand kit not found.' });
    Object.assign(kit, {
      name: req.body.name ?? kit.name,
      primaryColor: req.body.primaryColor ?? kit.primaryColor,
      secondaryColor: req.body.secondaryColor ?? kit.secondaryColor,
      accentColor: req.body.accentColor ?? kit.accentColor,
      voice: req.body.voice ?? kit.voice,
      tone: req.body.tone ?? kit.tone,
      targetAudience: req.body.targetAudience ?? kit.targetAudience,
      messagingGuidelines: req.body.messagingGuidelines ?? kit.messagingGuidelines,
      approvedCtas: req.body.approvedCtas ?? kit.approvedCtas,
      prohibitedPhrases: req.body.prohibitedPhrases ?? kit.prohibitedPhrases,
      description: req.body.description ?? kit.description,
      updatedAt: new Date().toISOString(),
    });
    res.json({ brandKit: kit });
  });

  // ============================================================================
  // AI Marketing Assistant & Lead Intelligence
  // ============================================================================

  app.post('/api/ai/generate', requireAuth, requirePermission('ai:use'), async (req: AuthedRequest, res) => {
    const schema = z.object({
      kind: z.enum(['email_body', 'email_subject', 'email_rewrite', 'social_variations', 'campaign_ideas']),
      prompt: z.string().min(3).max(2000),
      tone: z.string().optional(),
      objective: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Prompt must be at least 3 characters.' });

    const brandKit = demoStore.state.brandKits.find((b) => b.organizationId === req.auth!.organization.id) || null;
    const result = await aiFacade.generateMarketingCopy({ ...parsed.data, brandKit });
    res.json(result);
  });

  app.post('/api/ai/analyze-campaign/:id', requireAuth, requirePermission('ai:use'), async (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    const camp = demoStore.state.campaigns.find((c) => c.id === req.params.id && c.organizationId === orgId);
    if (!camp) return res.status(404).json({ error: 'Campaign not found.' });

    const metrics = calculateCampaignMetrics(orgId, camp.id);
    const analysis = await aiFacade.explainCampaignPerformance({ campaignName: camp.name, metrics });
    res.json(analysis);
  });

  app.get('/api/leads', requireAuth, requirePermission('audience:read'), (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    res.json({
      searches: demoStore.state.leadSearches.filter((s) => s.organizationId === orgId),
      candidates: demoStore.state.leadCandidates.filter((c) => c.organizationId === orgId),
    });
  });

  app.post('/api/leads/discover', requireAuth, requirePermission('ai:use'), async (req: AuthedRequest, res) => {
    const prompt = String(req.body?.prompt || '').trim();
    if (prompt.length < 5) return res.status(400).json({ error: 'Please describe your target audience in at least 5 characters.' });

    const result = await runLeadDiscovery({
      organizationId: req.auth!.organization.id,
      workspaceId: String(req.body?.workspaceId || req.auth!.workspaces[0]?.id || ''),
      prompt,
    });
    res.status(201).json(result);
  });

  app.post('/api/leads/:id/save-to-audience', requireAuth, requirePermission('audience:write'), (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    const candidate = demoStore.state.leadCandidates.find((c) => c.id === req.params.id && c.organizationId === orgId);
    if (!candidate) return res.status(404).json({ error: 'Lead candidate not found.' });

    if (candidate.savedToContacts) return res.status(409).json({ error: 'Already saved to Audience.' });
    const email = candidate.publicEmail || `contact@${candidate.companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.example`;
    const names = (candidate.contactName || 'Growth Team').split(' ');
    const contact = {
      id: crypto.randomUUID(),
      organizationId: orgId,
      workspaceId: candidate.workspaceId,
      firstName: names[0] || 'Growth',
      lastName: names.slice(1).join(' ') || 'Contact',
      email,
      company: candidate.companyName,
      jobTitle: candidate.contactTitle || 'Decision Maker',
      industry: candidate.industry,
      location: candidate.location,
      tags: ['lead-intelligence', candidate.industry.toLowerCase()],
      customAttributes: { sourceUrl: candidate.sourceUrl, confidence: String(candidate.confidence) },
      source: 'Lead Discovery',
      lifecycleStage: 'lead' as const,
      consentStatus: 'legitimate_interest' as const,
      subscriptionStatus: 'subscribed' as const,
      engagementScore: candidate.score,
      crmOwnedFields: [],
      crmEditable: true,
      notes: [
        {
          id: `note-${crypto.randomUUID().slice(0, 6)}`,
          author: req.auth!.user.name,
          text: `Imported from Lead Intelligence (${candidate.sourceProvider}, ${candidate.confidence}% confidence).`,
          createdAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
    };
    demoStore.state.contacts.unshift(contact);
    candidate.savedToContacts = true;
    res.status(201).json({ contact, candidate });
  });

  // ============================================================================
  // MCP CRM Integrations & Connectors
  // ============================================================================

  app.get('/api/integrations', requireAuth, (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    res.json({
      integrations: demoStore.state.integrations.filter((i) => i.organizationId === orgId),
    });
  });

  app.post('/api/integrations/:id/test', requireAuth, requirePermission('integrations:manage'), async (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    const integration = demoStore.state.integrations.find((i) => i.id === req.params.id && i.organizationId === orgId);
    if (!integration) return res.status(404).json({ error: 'Integration not found.' });

    if (integration.provider === 'mcp_mock_crm' || integration.endpointUrl) {
      const initRes = await mcpCrmClient.callRemoteOrMockMcp(orgId, integration.endpointUrl, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      });
      if (initRes.error) {
        integration.status = 'error';
        integration.healthMessage = initRes.error.message;
        return res.status(502).json({ error: initRes.error.message, integration });
      }
      const toolsRes = await mcpCrmClient.callRemoteOrMockMcp(orgId, integration.endpointUrl, {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      });
      const tools = ((toolsRes.result as { tools?: Array<{ name: string; description: string }> })?.tools || []).map((t) => ({
        name: t.name,
        description: t.description,
        authorized: true,
      }));
      integration.discoveredTools = tools;
      integration.lastSyncAt = new Date().toISOString();
      integration.status = integration.provider === 'mcp_mock_crm' ? 'simulated' : 'connected';
      integration.healthMessage = `Healthy (${tools.length} MCP tools discovered)`;
      integration.syncLogs.unshift({
        id: `sl-${crypto.randomUUID().slice(0, 6)}`,
        action: 'Test connection & tools/list',
        status: 'success',
        recordsProcessed: tools.length,
        message: `Verified MCP handshake and discovered ${tools.length} tools.`,
        timestamp: integration.lastSyncAt,
      });
      return res.json({ integration });
    }

    res.json({
      integration,
      note: 'Configure external OAuth credentials or an MCP Server URL to enable live tests.',
    });
  });

  app.post('/api/integrations/mcp-builtin', requireAuth, requirePermission('integrations:manage'), (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    const existing = demoStore.state.integrations.find(
      (i) => i.organizationId === orgId && i.provider === 'mcp_mock_crm'
    );
    if (existing) return res.json({ integration: existing });

    const integration = {
      id: `int-mcp-${crypto.randomUUID().slice(0, 6)}`,
      organizationId: orgId,
      provider: 'mcp_mock_crm' as const,
      name: String(req.body?.name || 'Local MCP CRM Sandbox'),
      protocol: 'mcp_json_rpc' as const,
      endpointUrl: '/api/mcp/mock-crm',
      status: 'simulated' as const,
      healthMessage: 'Ready — click Test & Discover Tools to inspect MCP capabilities.',
      scopes: ['crm.contacts.read', 'crm.contacts.write', 'crm.activities.write'],
      discoveredTools: [],
      syncLogs: [],
    };
    demoStore.state.integrations.push(integration);
    res.status(201).json({ integration });
  });

  app.post('/api/integrations/mcp-custom', requireAuth, requirePermission('integrations:manage'), async (req: AuthedRequest, res) => {
    const name = String(req.body?.name || '').trim();
    const endpointUrl = String(req.body?.endpointUrl || '').trim();
    const check = validateSafeExternalUrl(endpointUrl);
    if (!name || !check.valid) {
      return res.status(400).json({ error: check.reason || 'Valid MCP Server name and https URL required.' });
    }

    const integration = {
      id: `int-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: req.auth!.organization.id,
      provider: 'custom_mcp' as const,
      name,
      protocol: 'mcp_json_rpc' as const,
      endpointUrl,
      status: 'disconnected' as const,
      healthMessage: 'Registered — click Test Connection to run MCP handshake.',
      scopes: ['mcp.tools.read'],
      discoveredTools: [],
      syncLogs: [],
    };
    demoStore.state.integrations.push(integration);
    res.status(201).json({ integration });
  });

  app.post('/api/integrations/:id/mcp-query', requireAuth, async (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    const integration = demoStore.state.integrations.find((i) => i.id === req.params.id && i.organizationId === orgId);
    if (!integration) return res.status(404).json({ error: 'Integration not found.' });

    const toolName = String(req.body?.toolName || 'search_contacts');
    const args = (req.body?.arguments || {}) as Record<string, unknown>;
    const rpcRes = await mcpCrmClient.callRemoteOrMockMcp(orgId, integration.endpointUrl, {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    });
    res.json(rpcRes);
  });

  // ============================================================================
  // Automation Workflows & Background Jobs
  // ============================================================================

  app.get('/api/automations', requireAuth, (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    res.json({
      workflows: demoStore.state.automationWorkflows.filter((w) => w.organizationId === orgId),
      runs: demoStore.state.automationRuns.filter((r) => r.organizationId === orgId).slice(0, 30),
    });
  });

  app.post('/api/automations', requireAuth, requirePermission('automation:manage'), (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    const name = String(req.body?.name || '').trim();
    if (name.length < 2) return res.status(400).json({ error: 'Workflow name required.' });

    const wf: AutomationWorkflow = {
      id: `wf-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: orgId,
      workspaceId: String(req.body?.workspaceId || req.auth!.workspaces[0]?.id || ''),
      name,
      description: String(req.body?.description || ''),
      status: 'active',
      triggerType: req.body?.triggerType || 'contact_created',
      nodes: Array.isArray(req.body?.nodes) ? req.body.nodes : [],
      edges: Array.isArray(req.body?.edges) ? req.body.edges : [],
      runCount: 0,
      createdAt: new Date().toISOString(),
    };
    demoStore.state.automationWorkflows.unshift(wf);
    res.status(201).json({ workflow: wf });
  });

  app.post('/api/automations/:id/toggle', requireAuth, requirePermission('automation:manage'), (req: AuthedRequest, res) => {
    const wf = demoStore.state.automationWorkflows.find(
      (w) => w.id === req.params.id && w.organizationId === req.auth!.organization.id
    );
    if (!wf) return res.status(404).json({ error: 'Workflow not found.' });
    wf.status = wf.status === 'active' ? 'paused' : 'active';
    res.json({ workflow: wf });
  });

  app.post('/api/automations/:id/execute', requireAuth, requirePermission('automation:manage'), async (req: AuthedRequest, res) => {
    const wf = demoStore.state.automationWorkflows.find(
      (w) => w.id === req.params.id && w.organizationId === req.auth!.organization.id
    );
    if (!wf) return res.status(404).json({ error: 'Workflow not found.' });

    const run = await executeWorkflow(wf, req.auth!.organization.id, {
      contactId: req.body?.contactId,
      detail: 'Manual test execution triggered from Automation Studio',
    });
    res.json({ run, workflow: wf });
  });

  // ============================================================================
  // Observability, Diagnostics & Provider Status (Never Exposes Secrets)
  // ============================================================================

  app.get('/api/diagnostics', requireAuth, (req: AuthedRequest, res) => {
    const orgId = req.auth!.organization.id;
    const jobs = demoStore.state.backgroundJobs.filter((j) => j.organizationId === orgId);
    const crmIntegrations = demoStore.state.integrations.filter((i) => i.organizationId === orgId);
    const social = demoStore.state.socialAccounts.filter((s) => s.organizationId === orgId);

    res.json({
      database: {
        engine: isDatabaseConfigured() ? 'Neon PostgreSQL' : 'Demo Parity Store (DATABASE_URL not set)',
        connected: true,
        neonConfigured: isDatabaseConfigured(),
      },
      ai: aiFacade.getStatus(),
      email: emailProvider.getStatus(),
      storage: {
        activeProvider: process.env.STORAGE_PROVIDER || 'local',
        cloudinaryConfigured: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY),
      },
      secretsPreview: {
        databaseUrl: maskSecret(process.env.DATABASE_URL),
        resendKey: maskSecret(process.env.RESEND_API_KEY),
        hubspotToken: maskSecret(process.env.HUBSPOT_ACCESS_TOKEN),
      },
      queue: {
        total: jobs.length,
        pending: jobs.filter((j) => j.status === 'pending').length,
        completed: jobs.filter((j) => j.status === 'completed').length,
        failed: jobs.filter((j) => j.status === 'failed').length,
        recentJobs: jobs.slice(0, 15),
      },
      crmCount: crmIntegrations.filter((i) => i.status !== 'disconnected').length,
      socialConnectedCount: social.filter((s) => s.status !== 'disconnected').length,
    });
  });

  return app;
}

interface TrackedJwtSocket {
  ws: WebSocket;
  token: string;
  orgId?: string;
  jti?: string;
  userId?: string;
}

export function attachAuthWebSocket(server: http.Server): () => void {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<TrackedJwtSocket>();

  const sendSafe = (ws: WebSocket, payload: Record<string, unknown>) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  server.on('upgrade', (request, socket, head) => {
    const urlPath = (request.url || '').split('?')[0];
    if (urlPath !== '/ws/auth') {
      return; // Do not touch other upgrade paths (e.g., Vite)
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    const tracked: TrackedJwtSocket = { ws, token: '' };
    clients.add(tracked);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          token?: string;
          organizationId?: string;
        };
        if (msg.type === 'auth:verify' || msg.type === 'auth:ping') {
          if (msg.token) tracked.token = msg.token;
          if (msg.organizationId) tracked.orgId = msg.organizationId;

          const verified = verifyActiveJwtSession(tracked.token, tracked.orgId);
          if (!verified.valid) {
            sendSafe(ws, {
              type: 'auth:revoked',
              valid: false,
              reason: verified.reason,
              serverTime: new Date().toISOString(),
            });
            ws.close(4001, verified.reason);
            return;
          }

          tracked.jti = verified.claims.jti;
          tracked.userId = verified.claims.userId;
          tracked.orgId = verified.context.organization.id;

          sendSafe(ws, {
            type: msg.type === 'auth:ping' ? 'auth:heartbeat' : 'auth:verified',
            valid: true,
            jti: verified.claims.jti,
            userId: verified.claims.userId,
            email: verified.claims.email,
            orgId: verified.context.organization.id,
            role: verified.context.role,
            issuedAt: verified.session.issuedAt,
            expiresAt: verified.session.expiresAt,
            ttlSeconds: verified.ttlSeconds,
            serverTime: new Date().toISOString(),
          });
        }
      } catch {
        sendSafe(ws, { type: 'auth:error', message: 'Invalid verification payload.' });
      }
    });

    ws.on('close', () => {
      clients.delete(tracked);
    });
  });

  // Real-time push when a session is revoked or role updated
  const unsubscribe = subscribeSessionEvents((evt) => {
    for (const client of clients) {
      if (evt.type === 'auth:revoked') {
        const matchJti = evt.jti && client.jti === evt.jti;
        const matchUser = !evt.jti && evt.userId && client.userId === evt.userId;
        if (matchJti || matchUser) {
          sendSafe(client.ws, {
            type: 'auth:revoked',
            valid: false,
            jti: client.jti,
            reason: evt.reason || 'Session revoked',
            serverTime: new Date().toISOString(),
          });
          client.ws.close(4001, evt.reason || 'Session revoked');
        }
      } else if (evt.type === 'auth:role_updated' && evt.userId && client.userId === evt.userId) {
        sendSafe(client.ws, {
          type: 'auth:role_updated',
          role: evt.role,
          serverTime: new Date().toISOString(),
        });
      }
    }
  });

  // Periodic live JWT re-verification sweep (15s)
  const interval = setInterval(() => {
    for (const client of clients) {
      if (!client.token) continue;
      const verified = verifyActiveJwtSession(client.token, client.orgId);
      if (!verified.valid) {
        sendSafe(client.ws, {
          type: 'auth:revoked',
          valid: false,
          jti: client.jti,
          reason: verified.reason,
          serverTime: new Date().toISOString(),
        });
        client.ws.close(4001, verified.reason);
      } else {
        sendSafe(client.ws, {
          type: 'auth:heartbeat',
          valid: true,
          jti: verified.claims.jti,
          role: verified.context.role,
          ttlSeconds: verified.ttlSeconds,
          expiresAt: verified.session.expiresAt,
          serverTime: new Date().toISOString(),
        });
      }
    }
  }, 15000);

  return () => {
    clearInterval(interval);
    unsubscribe();
    wss.close();
  };
}

// Start HTTP + WebSocket + Vite server when executed directly
const isDirectRun = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isDirectRun) {
  (async () => {
    const app = createApp();
    const httpServer = http.createServer(app);
    attachAuthWebSocket(httpServer);

    const port = Number(process.env.PORT || 3000);

    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      app.use(express.static('dist'));
      app.get('*', (_req, res) => {
        res.sendFile('dist/index.html', { root: process.cwd() });
      });
    }

    httpServer.listen(port, '0.0.0.0', () => {
      logSafe('info', 'server.started', {
        port,
        mode: process.env.NODE_ENV || 'development',
        database: isDatabaseConfigured() ? 'neon' : 'in_memory_store',
        wsAuth: '/ws/auth',
      });
    });
  })();
}
