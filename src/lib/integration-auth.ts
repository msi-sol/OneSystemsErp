import { createHmac, timingSafeEqual } from 'node:crypto';

// Shared checks for machine-to-machine endpoints (bank webhooks, cron jobs).
// Both fail closed: if the secret is not configured, nothing is accepted.

function safeEqual(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function configuredSecret(name: string): string | null {
  const value = process.env[name];
  return value && value.length >= 16 ? value : null;
}

/** Verifies an HMAC-SHA256 signature of the raw request body (hex or base64, optional "sha256=" prefix). */
export function verifyHmacSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  const supplied = signatureHeader.trim().replace(/^sha256=/i, '');
  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  if (/^[0-9a-f]+$/i.test(supplied) && supplied.length === digest.length * 2) {
    return safeEqual(Buffer.from(supplied, 'hex'), digest);
  }
  try {
    return safeEqual(Buffer.from(supplied, 'base64'), digest);
  } catch {
    return false;
  }
}

/** Verifies an `Authorization: Bearer <secret>` header in constant time. */
export function verifyBearerSecret(authorizationHeader: string | null, secret: string): boolean {
  if (!authorizationHeader?.startsWith('Bearer ')) return false;
  return safeEqual(Buffer.from(authorizationHeader.slice(7)), Buffer.from(secret));
}
