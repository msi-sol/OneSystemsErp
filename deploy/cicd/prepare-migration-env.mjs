// Trusted one-time installer: copies an existing credential, without changing it.
import { readFileSync, writeFileSync, chmodSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateMigrationUrl } from './migration-policy.mjs';

process.umask(0o077);
const url = validateMigrationUrl(process.env.DIRECT_URL);
const directory = '/etc/onesystemserp-migrations';
const source = url.searchParams.get('sslcert');
const destination = `${directory}/rds-ca.pem`;
const certificate = readFileSync(source);
if (!certificate.includes(Buffer.from('-----BEGIN CERTIFICATE-----'))) throw new Error('Existing RDS CA is invalid');
copyFileSync(source, destination);
chmodSync(destination, 0o644);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
if (hash(certificate) !== hash(readFileSync(destination))) throw new Error('CA certificate copy differs');
url.searchParams.set('sslcert', destination);
writeFileSync(`${directory}/migration.env`, ['DATABASE_URL', 'DIRECT_URL'].map(name => `${name}=${JSON.stringify(url.toString())}\n`).join(''), { mode: 0o640 });
chmodSync(`${directory}/migration.env`, 0o640);
console.log('Dedicated existing migrator connection prepared; no credentials changed');
