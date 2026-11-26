import crypto from 'crypto';

// Runtime fallback secret for session signing (never hardcoded or stored in .env.example)
const EPHEMERAL_RUNTIME_SECRET = crypto.randomBytes(32).toString('hex');

function getSigningSecret(): string {
  const configured = process.env.AUTH_SECRET?.trim();
  return configured && configured.length >= 16 ? configured : EPHEMERAL_RUNTIME_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  if (!salt || !originalHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const originalBuf = Buffer.from(originalHex, 'hex');
    if (derived.length !== originalBuf.length) return false;
    return crypto.timingSafeEqual(derived, originalBuf);
  } catch {
    return false;
  }
}

export interface SessionPayload {
  sub: string;
  userId: string;
  email: string;
  orgId: string;
  role: string;
  jti: string;
  iat: number;
  exp: number;
}

export function signSessionToken(
  payload: { userId: string; email: string; orgId: string; role: string; jti?: string },
  ttlHours = 24
): { token: string; claims: SessionPayload } {
  const nowSec = Math.floor(Date.now() / 1000);
  const jti = payload.jti || crypto.randomUUID();
  const fullPayload: SessionPayload = {
    sub: payload.userId,
    userId: payload.userId,
    email: payload.email,
    orgId: payload.orgId,
    role: payload.role,
    jti,
    iat: nowSec,
    exp: nowSec + Math.floor(ttlHours * 3600),
  };

  const headerEncoded = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadEncoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signingInput = `${headerEncoded}.${payloadEncoded}`;
  const signature = crypto
    .createHmac('sha256', getSigningSecret())
    .update(signingInput)
    .digest('base64url');

  return { token: `${signingInput}.${signature}`, claims: fullPayload };
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerEncoded, payloadEncoded, sig] = parts;
  if (!headerEncoded || !payloadEncoded || !sig) return null;

  try {
    const header = JSON.parse(Buffer.from(headerEncoded, 'base64url').toString('utf8')) as {
      alg?: string;
      typ?: string;
    };
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      return null;
    }
  } catch {
    return null;
  }

  const signingInput = `${headerEncoded}.${payloadEncoded}`;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(signingInput)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8')) as SessionPayload;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!parsed.sub || !parsed.userId || !parsed.jti || !parsed.exp || parsed.exp <= nowSec) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function hashSecretValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function maskSecret(value: string | undefined): string {
  if (!value || value.trim().length === 0) return '';
  if (value.length <= 6) return '••••••';
  return `${value.slice(0, 3)}••••••${value.slice(-3)}`;
}

// SSRF protection: allow only http/https and block private, loopback, link-local, metadata hosts
export function validateSafeExternalUrl(rawUrl: string, allowLocalMock = false): { valid: boolean; reason?: string; parsed?: URL } {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: 'Only http and https URLs are permitted.' };
    }
    const host = parsed.hostname.toLowerCase();
    if (allowLocalMock && rawUrl.startsWith('/api/mcp/')) {
      return { valid: true, parsed };
    }
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254', 'metadata.google.internal'];
    if (blockedHosts.includes(host)) {
      return { valid: false, reason: 'Loopback and cloud metadata addresses are blocked.' };
    }
    // Block RFC1918 & link-local IPv4 ranges
    if (
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host)
    ) {
      return { valid: false, reason: 'Private network IP ranges are blocked.' };
    }
    return { valid: true, parsed };
  } catch {
    return { valid: false, reason: 'Malformed URL.' };
  }
}

// Safe email personalization substitution with fallbacks (never leaks raw {{var}} syntax)
export function renderPersonalizedTemplate(
  template: string,
  variables: Record<string, string | undefined>
): string {
  const defaultFallbacks: Record<string, string> = {
    first_name: 'there',
    last_name: '',
    company: 'your team',
    job_title: 'leader',
    location: 'your region',
    custom_field: '',
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)(?:\|([^}]*))?\s*\}\}/g, (_match, key: string, inlineFallback?: string) => {
    const val = variables[key]?.trim();
    if (val && val.length > 0) return val;
    if (inlineFallback !== undefined) return inlineFallback.trim();
    return defaultFallbacks[key] ?? '';
  });
}

// Sanitize HTML for preview/email bodies (strips <script> tags and inline on* event handlers)
export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, 'blocked:');
}

export function logSafe(level: 'info' | 'warn' | 'error', event: string, meta: Record<string, unknown> = {}): void {
  const redactedKeys = ['password', 'passwordhash', 'apikey', 'token', 'secret', 'authorization', 'accesstoken'];
  const cleanMeta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (redactedKeys.some((rk) => k.toLowerCase().includes(rk))) {
      cleanMeta[k] = '[REDACTED]';
    } else {
      cleanMeta[k] = v;
    }
  }
  console[level](JSON.stringify({ ts: new Date().toISOString(), level, event, ...cleanMeta }));
}
