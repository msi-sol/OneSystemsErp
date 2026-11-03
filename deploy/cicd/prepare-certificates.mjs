// Trusted, one-time host setup. Preserve existing TLS verification and credentials.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, chmodSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = '/etc/onesystemserp';
const environmentPath = `${directory}/production.env`;
const original = readFileSync(environmentPath, 'utf8');
let updated = original;
for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
  const value = process.env[name];
  if (!value) continue;
  const url = new URL(value);
  if (url.protocol !== 'mysql:' || url.hostname !== 'constructpro-db.cwgvyg2y4v4o.us-east-1.rds.amazonaws.com' || url.pathname !== '/onesystemserp') {
    throw new Error('Certificate preparation refused an unexpected database target');
  }
  const source = url.searchParams.get('sslcert');
  if (!source) throw new Error('Existing verified RDS CA certificate is required');
  const destination = `${directory}/${name.toLowerCase()}-ca.pem`;
  const certificate = readFileSync(source);
  if (!certificate.includes(Buffer.from('-----BEGIN CERTIFICATE-----'))) throw new Error('Invalid CA bundle');
  if (resolve(source) !== destination) copyFileSync(source, destination);
  chmodSync(destination, 0o644);
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  if (hash(certificate) !== hash(readFileSync(destination))) throw new Error('CA copy verification failed');
  url.searchParams.set('sslcert', destination);
  const replacement = `${name}=${JSON.stringify(url.toString())}`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  if (!pattern.test(updated)) throw new Error('Expected environment assignment not found');
  updated = updated.replace(pattern, () => replacement);
}
writeFileSync(environmentPath, updated, { mode: 0o640 });
chmodSync(environmentPath, 0o640);
console.log('Existing RDS CA bundles copied into shared ERP configuration; TLS verification preserved');
