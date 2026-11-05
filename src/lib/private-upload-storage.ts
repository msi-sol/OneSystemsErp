import { randomUUID } from 'node:crypto';
import { localDownloadSignature } from './local-upload-token';
export { validLocalIntegrationDownload } from './local-upload-token';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type UploadContext = { module: string; uploadedBy: string; projectId?: string | null };
type UploadOptions = UploadContext & { contentType?: string; adminOnly?: boolean; [option: string]: unknown };
let client: S3Client | undefined;

function localUploadPath(key: string) {
  return path.join(process.cwd(), '.runtime', 'uploads', validateUploadKey(key));
}

export function uploadBucket(): string {
  const bucket = process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME;
  if (!bucket) throw new Error('S3 upload storage is not configured. Set AWS_S3_BUCKET_NAME or S3_BUCKET_NAME.');
  return bucket;
}

export function uploadStorageClient(): S3Client {
  if (!client) {
    const credentials = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}) }
      : undefined;
    client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1', ...(credentials ? { credentials } : {}) });
  }
  return client;
}

export function privateUploadUrl(key: string): string {
  return `/api/uploads/file?key=${encodeURIComponent(key)}`;
}

export function validateUploadKey(key: string): string {
  if (!key || key.length > 1024 || key.startsWith('/') || key.includes('\\') || key.split('/').some(part => part === '..' || part === '.') || /[\x00-\x1f]/.test(key)) {
    throw new Error('Invalid upload object key.');
  }
  return key;
}

export async function putPrivateUpload(buffer: Buffer | Uint8Array | string, key: string, contentType: string, context: UploadContext & { adminOnly?: boolean }, fileName?: string) {
  if (!context.uploadedBy || context.module.length > 40 || !/^[A-Z][A-Z_]+$/.test(context.module)) throw new Error('Authenticated upload ownership and module are required.');
  validateUploadKey(key);
  const metadata = { module: context.module, uploadedby: context.uploadedBy,
    ...(context.projectId ? { projectid: context.projectId } : {}),
    ...(context.adminOnly ? { adminonly: 'true' } : {}), filename: Buffer.from(path.basename(fileName || key), 'utf8').toString('base64'), filenameencoding: 'base64' };
  if (process.env.NODE_ENV !== 'production') {
    const filePath = localUploadPath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    await fs.writeFile(filePath, buffer, { flag: 'wx', mode: 0o600 });
    try { await fs.writeFile(`${filePath}.metadata.json`, JSON.stringify({ Metadata: metadata, ContentType: contentType }), { flag: 'wx', mode: 0o600 }); }
    catch (error) { await fs.unlink(filePath); throw error; }
    return { url: privateUploadUrl(key), pathname: key };
  }
  await uploadStorageClient().send(new PutObjectCommand({
    Bucket: uploadBucket(), Key: key, Body: buffer, ContentType: contentType,
    Metadata: metadata,
  }));
  return { url: privateUploadUrl(key), pathname: key };
}

/** Production uses private S3; development uses private local files. */
export async function uploadToS3(filename: string, body: Buffer | Uint8Array | Blob | string | ReadableStream, options: UploadOptions) {
  let buffer: Buffer | Uint8Array | string;
  if (body instanceof Blob) buffer = Buffer.from(await body.arrayBuffer());
  else if (body instanceof ReadableStream) {
    const chunks: Uint8Array[] = [];
    const reader = body.getReader();
    while (true) { const next = await reader.read(); if (next.done) break; chunks.push(next.value); }
    buffer = Buffer.concat(chunks);
  } else buffer = body;
  const name = (path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_') || 'file').slice(0, 48);
  const key = `uploads/${options.module.toLowerCase()}/${randomUUID()}-${name}`;
  return putPrivateUpload(buffer, key, options.contentType || 'application/octet-stream', options, filename);
}

export function storedUploadKey(source: string): string | null {
  if (source.startsWith('s3:')) return validateUploadKey(source.slice(3));
  if (source.startsWith('/api/uploads/file?')) return validateUploadKey(new URL(source, 'https://local.invalid').searchParams.get('key') || '');
  if (/^https?:\/\//i.test(source)) {
    const url = new URL(source);
    if (url.pathname === '/api/uploads/file') return validateUploadKey(url.searchParams.get('key') || '');
    const bucket = process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME;
    if (bucket && (url.hostname === `${bucket}.s3.amazonaws.com` || url.hostname === `${bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`)) return validateUploadKey(decodeURIComponent(url.pathname.slice(1)));
  }
  return null;
}

export async function headStoredUpload(key: string) {
  if (process.env.NODE_ENV !== 'production') {
    return JSON.parse(await fs.readFile(`${localUploadPath(key)}.metadata.json`, 'utf8')) as { Metadata: Record<string, string>; ContentType: string };
  }
  return uploadStorageClient().send(new HeadObjectCommand({ Bucket: uploadBucket(), Key: validateUploadKey(key) }));
}

export async function readStoredUpload(source: string): Promise<Buffer> {
  if (/^\.runtime\/boq-workspace\/[A-Za-z0-9-]+\.xlsx$/.test(source)) return fs.readFile(path.join(process.cwd(), source));
  if (/^retained:boq-workspace\/[A-Za-z0-9-]+\.xlsx$/.test(source)) return fs.readFile(path.join(process.cwd(), 'uploads', '.boq-workspace', path.basename(source)));
  const key = storedUploadKey(source);
  if (key) {
    if (process.env.NODE_ENV !== 'production') return fs.readFile(localUploadPath(key));
    const object = await uploadStorageClient().send(new GetObjectCommand({ Bucket: uploadBucket(), Key: key }));
    if (!object.Body) throw new Error('The uploaded file is unavailable.');
    return Buffer.from(await object.Body.transformToByteArray());
  }
  // Read compatibility only: new uploads never write to these local locations.
  let legacyPath = source;
  if (/^https?:\/\//i.test(source)) {
    const legacyUrl = new URL(source);
    const appHosts = [process.env.NEXT_PUBLIC_APP_URL, process.env.NEXTAUTH_URL, process.env.AWS_BACKEND_URL, process.env.BACKEND_INTERNAL_URL].filter(Boolean).map(value => new URL(value!).hostname);
    if (legacyUrl.pathname.startsWith('/uploads/') && (['localhost', '127.0.0.1'].includes(legacyUrl.hostname) || appHosts.includes(legacyUrl.hostname))) legacyPath = legacyUrl.pathname;
  }
  const local = legacyPath.startsWith('/uploads/') ? path.join(process.cwd(), 'public', legacyPath) : legacyPath;
  if (path.isAbsolute(local)) {
    const resolved = path.resolve(local);
    const roots = [path.join(process.cwd(), 'public', 'uploads'), path.join(process.cwd(), 'uploads'), '/var/lib/onesystemserp/public-uploads', '/var/lib/onesystemserp/backend-uploads'];
    if (roots.some(root => { const relative = path.relative(path.resolve(root), resolved); return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative); })) {
      try { return await fs.readFile(resolved); }
      catch (error) {
        if (legacyPath.startsWith('/uploads/') && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          const backendPath = path.resolve(process.cwd(), 'uploads', legacyPath.slice('/uploads/'.length));
          const relative = path.relative(path.join(process.cwd(), 'uploads'), backendPath);
          if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return fs.readFile(backendPath);
        }
        throw error;
      }
    }
    throw new Error('The retained file path is outside upload storage.');
  }
  if (/^https:\/\//i.test(source)) {
    const url = new URL(source);
    const allowedHosts = (process.env.LEGACY_UPLOAD_HOSTS || '').split(',').map(value => value.trim()).filter(Boolean);
    const legacyS3 = /^((onesystems-erp-bucket|onesystemserp-storage)\.s3(\.[a-z0-9-]+)?\.amazonaws\.com)$/.test(url.hostname);
    const legacyBlob = url.hostname.endsWith('.public.blob.vercel-storage.com');
    if (url.username || url.password || url.port && url.port !== '443' || !legacyS3 && !legacyBlob && !allowedHosts.includes(url.hostname)) throw new Error('The existing storage host is not allowed.');
    const response = await fetch(source, { signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (!response.ok) throw new Error('The existing uploaded file could not be read.');
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error('Unsupported stored file location.');
}

/** Short-lived integration URLs must never replace the durable database URL. */
export async function getStoredUploadDownloadUrl(source: string): Promise<string> {
  const key = storedUploadKey(source);
  if (!key) return source;
  if (process.env.NODE_ENV !== 'production') {
    const expires = Math.floor(Date.now() / 1000) + 900;
    const signature = localDownloadSignature(key, expires);
    return `${privateUploadUrl(key)}&expires=${expires}&signature=${signature}`;
  }
  return getSignedUrl(uploadStorageClient(), new GetObjectCommand({ Bucket: uploadBucket(), Key: key }), { expiresIn: 900 });
}
