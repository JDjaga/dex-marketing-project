import crypto from 'crypto';
import { logSafe } from '../utils/security.ts';

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
const LINKEDIN_REST_BASE = 'https://api.linkedin.com/rest';
const LINKEDIN_API_VERSION = '202405';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TOKEN_TTL_SECONDS = 60 * 24 * 3600; // LinkedIn tokens ~60 days

export interface LinkedInOAuthStatePayload {
  userId: string;
  organizationId: string;
  workspaceId: string;
}

interface PendingOAuthState extends LinkedInOAuthStatePayload {
  expiresAt: number;
}

const pendingStates = new Map<string, PendingOAuthState>();

export function isLinkedInConfigured(): boolean {
  return Boolean(
    process.env.LINKEDIN_CLIENT_ID?.trim() && process.env.LINKEDIN_CLIENT_SECRET?.trim()
  );
}

export function getLinkedInRedirectUri(appBaseUrl: string): string {
  const explicit = process.env.LINKEDIN_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return `${appBaseUrl.replace(/\/$/, '')}/api/social/linkedin/callback`;
}

export function createLinkedInOAuthState(payload: LinkedInOAuthStatePayload): string {
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, { ...payload, expiresAt: Date.now() + OAUTH_STATE_TTL_MS });
  return state;
}

export function consumeLinkedInOAuthState(state: string): LinkedInOAuthStatePayload | null {
  const pending = pendingStates.get(state);
  pendingStates.delete(state);
  if (!pending || pending.expiresAt < Date.now()) return null;
  return {
    userId: pending.userId,
    organizationId: pending.organizationId,
    workspaceId: pending.workspaceId,
  };
}

export function buildLinkedInAuthorizeUrl(state: string, redirectUri: string): string {
  const clientId = process.env.LINKEDIN_CLIENT_ID!.trim();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile email w_member_social',
    state,
  });
  return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
}

export interface LinkedInTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
}

export async function exchangeLinkedInCode(code: string, redirectUri: string): Promise<LinkedInTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: process.env.LINKEDIN_CLIENT_ID!.trim(),
    client_secret: process.env.LINKEDIN_CLIENT_SECRET!.trim(),
  });
  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn token exchange failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { access_token?: string; token_type?: string; expires_in?: number };
  if (!data.access_token) throw new Error('LinkedIn token response missing access_token.');
  return {
    accessToken: data.access_token,
    tokenType: data.token_type || 'Bearer',
    expiresInSeconds: data.expires_in || DEFAULT_TOKEN_TTL_SECONDS,
  };
}

export interface LinkedInUserInfo {
  sub: string;
  name: string;
  email?: string;
  picture?: string;
}

export async function fetchLinkedInUserInfo(accessToken: string): Promise<LinkedInUserInfo> {
  const res = await fetch(LINKEDIN_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn userinfo failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { sub?: string; name?: string; email?: string; picture?: string };
  if (!data.sub) throw new Error('LinkedIn userinfo missing subject id.');
  return {
    sub: data.sub,
    name: data.name || 'LinkedIn Member',
    email: data.email,
    picture: data.picture,
  };
}

export interface LinkedInPublishResult {
  success: boolean;
  postUrn?: string;
  error?: string;
}

export async function publishLinkedInTextPost(params: {
  accessToken: string;
  authorSub: string;
  commentary: string;
}): Promise<LinkedInPublishResult> {
  const body = {
    author: `urn:li:person:${params.authorSub}`,
    commentary: params.commentary.slice(0, 3000),
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
  try {
    const res = await fetch(`${LINKEDIN_REST_BASE}/posts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': LINKEDIN_API_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `LinkedIn API error ${res.status}: ${text}` };
    }
    const postUrn = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id') || undefined;
    return { success: true, postUrn };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'LinkedIn publish failed';
    logSafe('error', 'linkedin.publish_failed', { error: message });
    return { success: false, error: message };
  }
}
