import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  hasPermission,
  type JwtSessionRecord,
  type Organization,
  type OrganizationMember,
  type Permission,
  type RoleName,
  type User,
  type Workspace,
} from '../../shared/types.ts';
import { demoStore } from '../store/demoStore.ts';
import {
  hashPassword,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
  type SessionPayload,
} from '../utils/security.ts';

export interface AuthContext {
  user: User;
  organization: Organization;
  role: RoleName;
  workspaces: Workspace[];
  organizations: Array<{ organization: Organization; role: RoleName }>;
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
  jwtClaims?: SessionPayload;
}

export type SessionBroadcastListener = (event: {
  type: 'auth:revoked' | 'auth:role_updated';
  jti?: string;
  userId?: string;
  reason?: string;
  role?: RoleName;
}) => void;

const sessionListeners = new Set<SessionBroadcastListener>();

export function subscribeSessionEvents(listener: SessionBroadcastListener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function notifySessionListeners(event: Parameters<SessionBroadcastListener>[0]) {
  for (const listener of sessionListeners) {
    try {
      listener(event);
    } catch {
      // Ignore individual listener errors
    }
  }
}

export function sanitizeUser(u: {
  id: string;
  email: string;
  name: string;
  title?: string;
  avatarUrl?: string;
  timezone: string;
  createdAt: string;
}): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    title: u.title,
    avatarUrl: u.avatarUrl,
    timezone: u.timezone,
    createdAt: u.createdAt,
  };
}

export function recordAudit(params: {
  organizationId: string;
  workspaceId?: string;
  actorId: string;
  actorName: string;
  actorRole: RoleName;
  action: string;
  targetType: string;
  targetId?: string;
  detail: string;
}) {
  demoStore.state.auditLogs.unshift({
    id: `aud-${crypto.randomUUID().slice(0, 8)}`,
    ...params,
    timestamp: new Date().toISOString(),
  });
}

export function buildAuthContext(userId: string, preferredOrgId?: string): AuthContext | null {
  const user = demoStore.state.users.find((u) => u.id === userId);
  if (!user) return null;

  const memberships = demoStore.state.members.filter((m) => m.userId === user.id);
  if (memberships.length === 0) return null;

  const activeMembership =
    (preferredOrgId ? memberships.find((m) => m.organizationId === preferredOrgId) : undefined) ||
    memberships[0];

  const org = demoStore.state.organizations.find((o) => o.id === activeMembership.organizationId);
  if (!org) return null;

  const workspaces = demoStore.state.workspaces.filter((w) => w.organizationId === org.id);
  const organizations = memberships
    .map((m) => {
      const o = demoStore.state.organizations.find((orgItem) => orgItem.id === m.organizationId);
      return o ? { organization: o, role: m.role } : null;
    })
    .filter((x): x is { organization: Organization; role: RoleName } => Boolean(x));

  return {
    user: sanitizeUser(user),
    organization: org,
    role: activeMembership.role,
    workspaces,
    organizations,
  };
}

function issueJwtForContext(
  ctx: AuthContext,
  userAgent = 'Web Client'
): { token: string; claims: SessionPayload; session: JwtSessionRecord } {
  const jti = crypto.randomUUID();
  const { token, claims } = signSessionToken({
    userId: ctx.user.id,
    email: ctx.user.email,
    orgId: ctx.organization.id,
    role: ctx.role,
    jti,
  });

  const nowIso = new Date().toISOString();
  const session: JwtSessionRecord = {
    jti,
    userId: ctx.user.id,
    email: ctx.user.email,
    organizationId: ctx.organization.id,
    role: ctx.role,
    userAgent: userAgent.slice(0, 120),
    issuedAt: new Date(claims.iat * 1000).toISOString(),
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    lastVerifiedAt: nowIso,
    revoked: false,
  };

  demoStore.state.jwtSessions.unshift(session);
  return { token, claims, session };
}

export function loginWithPassword(
  email: string,
  password: string,
  userAgent?: string
): { token: string; claims: SessionPayload; session: JwtSessionRecord; context: AuthContext } | null {
  const user = demoStore.state.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return null;
  }
  const ctx = buildAuthContext(user.id);
  if (!ctx) return null;

  const { token, claims, session } = issueJwtForContext(ctx, userAgent);
  return { token, claims, session, context: ctx };
}

export function registerOrganizationAndUser(
  input: {
    name: string;
    email: string;
    password: string;
    organizationName: string;
  },
  userAgent?: string
): { token: string; claims: SessionPayload; session: JwtSessionRecord; context: AuthContext } {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = demoStore.state.users.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (existing) {
    throw new Error('An account with this email already exists.');
  }

  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  const wsId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  demoStore.state.users.push({
    id: userId,
    email: normalizedEmail,
    name: input.name.trim(),
    title: 'Organization Owner',
    passwordHash: hashPassword(input.password),
    timezone: 'UTC',
    createdAt: nowIso,
  });

  demoStore.state.organizations.push({
    id: orgId,
    name: input.organizationName.trim(),
    slug:
      input.organizationName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `org-${orgId.slice(0, 6)}`,
    industry: 'Marketing & Technology',
    requireApprovalForPublish: true,
    dataRetentionDays: 730,
    createdAt: nowIso,
  });

  demoStore.state.workspaces.push({
    id: wsId,
    organizationId: orgId,
    name: 'Primary Workspace',
    type: 'brand',
    description: 'Default workspace created on registration.',
    createdAt: nowIso,
  });

  const member: OrganizationMember = {
    id: crypto.randomUUID(),
    organizationId: orgId,
    userId,
    role: 'Owner',
    userName: input.name.trim(),
    userEmail: normalizedEmail,
    userTitle: 'Organization Owner',
    joinedAt: nowIso,
  };
  demoStore.state.members.push(member);

  demoStore.state.brandKits.push({
    id: crypto.randomUUID(),
    organizationId: orgId,
    workspaceId: wsId,
    name: `${input.organizationName.trim()} Brand Kit`,
    primaryColor: '#1D63ED',
    secondaryColor: '#0A2472',
    accentColor: '#F5B400',
    headingFont: 'Plus Jakarta Sans',
    bodyFont: 'DM Sans',
    voice: 'Clear, helpful, and authoritative',
    tone: 'Professional B2B',
    targetAudience: '',
    messagingGuidelines: '',
    approvedCtas: [],
    prohibitedPhrases: [],
    description: 'Workspace brand guidelines.',
    updatedAt: nowIso,
  });

  const ctx = buildAuthContext(userId, orgId)!;
  const { token, claims, session } = issueJwtForContext(ctx, userAgent);

  recordAudit({
    organizationId: orgId,
    workspaceId: wsId,
    actorId: userId,
    actorName: ctx.user.name,
    actorRole: 'Owner',
    action: 'auth.registered_jwt_issued',
    targetType: 'user',
    targetId: userId,
    detail: `Created organization "${ctx.organization.name}" and verified initial JWT session.`,
  });

  return { token, claims, session, context: ctx };
}

export function verifyActiveJwtSession(
  token: string,
  requestedOrgId?: string
):
  | {
      valid: true;
      claims: SessionPayload;
      session: JwtSessionRecord;
      context: AuthContext;
      ttlSeconds: number;
    }
  | { valid: false; status: number; reason: string } {
  const claims = verifySessionToken(token);
  if (!claims) {
    return { valid: false, status: 401, reason: 'Invalid or expired JWT token.' };
  }

  const session = demoStore.state.jwtSessions.find((s) => s.jti === claims.jti);
  if (!session) {
    return { valid: false, status: 401, reason: 'JWT session not found on server.' };
  }
  if (session.revoked) {
    return { valid: false, status: 401, reason: session.revokedReason || 'JWT session was revoked.' };
  }

  const targetOrgId = requestedOrgId || claims.orgId;
  const isMember = demoStore.state.members.some(
    (m) => m.userId === claims.userId && m.organizationId === targetOrgId
  );
  if (!isMember) {
    return {
      valid: false,
      status: 403,
      reason: 'Cross-tenant access denied: not a member of requested organization.',
    };
  }

  const ctx = buildAuthContext(claims.userId, targetOrgId);
  if (!ctx) {
    return { valid: false, status: 401, reason: 'User or organization context no longer exists.' };
  }

  session.lastVerifiedAt = new Date().toISOString();
  session.role = ctx.role;
  const ttlSeconds = Math.max(0, claims.exp - Math.floor(Date.now() / 1000));

  return { valid: true, claims, session, context: ctx, ttlSeconds };
}

export function revokeJwtSession(jti: string, userId?: string, reason = 'Signed out'): boolean {
  const session = demoStore.state.jwtSessions.find(
    (s) => s.jti === jti && (!userId || s.userId === userId)
  );
  if (!session) return false;
  session.revoked = true;
  session.revokedReason = reason;
  notifySessionListeners({ type: 'auth:revoked', jti: session.jti, userId: session.userId, reason });
  return true;
}

export function revokeAllUserSessions(userId: string, reason = 'Security credentials updated'): number {
  let count = 0;
  for (const s of demoStore.state.jwtSessions) {
    if (s.userId === userId && !s.revoked) {
      s.revoked = true;
      s.revokedReason = reason;
      count += 1;
      notifySessionListeners({ type: 'auth:revoked', jti: s.jti, userId, reason });
    }
  }
  return count;
}

export function notifyUserRoleChanged(userId: string, role: RoleName) {
  notifySessionListeners({ type: 'auth:role_updated', userId, role });
}

export function listUserJwtSessions(userId: string) {
  const nowMs = Date.now();
  return demoStore.state.jwtSessions
    .filter((s) => s.userId === userId && !s.revoked && new Date(s.expiresAt).getTime() > nowMs)
    .slice(0, 20);
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'JWT Bearer authentication required.' });
  }
  const token = header.slice('Bearer '.length).trim();
  const requestedOrgId = req.headers['x-organization-id'] as string | undefined;

  const verified = verifyActiveJwtSession(token, requestedOrgId);
  if (!verified.valid) {
    return res.status(verified.status).json({ error: verified.reason });
  }

  req.auth = verified.context;
  req.jwtClaims = verified.claims;
  next();
}

export function requirePermission(permission: Permission) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!hasPermission(req.auth.role, permission)) {
      return res.status(403).json({
        error: `Forbidden: role "${req.auth.role}" lacks permission "${permission}".`,
      });
    }
    next();
  };
}
