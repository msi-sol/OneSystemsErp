import { createHmac, timingSafeEqual } from 'node:crypto';

export function localDownloadSignature(key: string, expires: number): string {
  const secret = process.env.AUTH_SECRET || process.env.BACKEND_INTERNAL_SECRET;
  if (!secret) throw new Error('A local application secret is required for document integration downloads.');
  return createHmac('sha256', secret).update(`${key}\n${expires}`).digest('hex');
}

export function validLocalIntegrationDownload(url: URL, key: string): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  const expires = Number(url.searchParams.get('expires'));
  const now = Math.floor(Date.now() / 1000);
  const signature = url.searchParams.get('signature') || '';
  if (!key || key.length > 1024 || !Number.isSafeInteger(expires) || expires < now || expires > now + 900 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  try { return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(localDownloadSignature(key, expires), 'hex')); }
  catch { return false; }
}
