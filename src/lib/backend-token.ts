import { createHmac, timingSafeEqual } from 'node:crypto';

export interface BackendTokenPayload {
  userId: string;
  sessionVersion: number;
  method: string;
  path: string;
  activeProjectId?: string;
  simulatedRole?: string;
}

export interface BackendTokenClaims extends BackendTokenPayload {
  iat: number;
  exp: number;
}

const TOKEN_LIFETIME_SECONDS = 60;

function secret() {
  const value = process.env.BACKEND_INTERNAL_SECRET;
  if (!value || value.length < 32) throw new Error('BACKEND_INTERNAL_SECRET must contain at least 32 characters');
  return value;
}

function validPayload(value: BackendTokenPayload) {
  return typeof value.userId === 'string' && value.userId.length > 0 && value.userId.length <= 191 &&
    Number.isSafeInteger(value.sessionVersion) && value.sessionVersion >= 0 &&
    typeof value.method === 'string' && /^[A-Z]+$/.test(value.method) &&
    typeof value.path === 'string' && value.path.startsWith('/') &&
    !/[?#\r\n]/.test(value.path) && value.path.length <= 4096 &&
    [value.activeProjectId, value.simulatedRole].every(field =>
      field === undefined || (typeof field === 'string' && field.length <= 191));
}

// Also imported by the standalone Node backend; keep this module free of Next APIs.
export function createBackendToken(payload: BackendTokenPayload): string {
  const normalized = { ...payload, method: payload.method.toUpperCase() };
  if (!validPayload(normalized)) throw new Error('Invalid backend token payload');
  const iat = Math.floor(Date.now() / 1000);
  const claims: BackendTokenClaims = { ...normalized, iat, exp: iat + TOKEN_LIFETIME_SECONDS };
  const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyBackendToken(token: string, method: string, path: string): BackendTokenClaims | null {
  const key = secret();
  if (typeof token !== 'string' || token.length > 8192) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  const [encoded, signature] = parts;
  const expected = createHmac('sha256', key).update(encoded).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== expected.length || supplied.toString('base64url') !== signature ||
      !timingSafeEqual(supplied, expected)) return null;
  try {
    const claims: BackendTokenClaims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!claims || !validPayload(claims) || !Number.isSafeInteger(claims.iat) ||
        !Number.isSafeInteger(claims.exp) || claims.iat > now + 5 || claims.exp <= now ||
        claims.exp <= claims.iat || claims.exp - claims.iat > TOKEN_LIFETIME_SECONDS ||
        claims.exp > now + TOKEN_LIFETIME_SECONDS ||
        claims.method !== method.toUpperCase() || claims.path !== path) return null;
    return claims;
  } catch {
    return null;
  }
}
