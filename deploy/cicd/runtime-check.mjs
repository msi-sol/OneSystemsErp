// Run as the ERP service account with the existing production environment.
// SELECT and schema comparison only: this program never runs a migration.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const require = createRequire(resolve(process.cwd(), 'package.json'));
const target = new URL(process.env.DATABASE_URL);
if (target.protocol !== 'mysql:' || target.hostname !== 'constructpro-db.cwgvyg2y4v4o.us-east-1.rds.amazonaws.com' || target.pathname !== '/onesystemserp') {
  throw new Error('Deployment refused: unexpected database target');
}
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ log: [] });
try {
  await db.$queryRaw`SELECT 1`;
  await db.user.findFirst({ select: { id: true } });
} catch {
  throw new Error('Production database read check failed');
} finally {
  await db.$disconnect();
}
const diff = spawnSync(process.execPath, [
  resolve('node_modules/prisma/build/index.js'), 'migrate', 'diff',
  '--from-schema-datasource', resolve('prisma/schema.prisma'),
  '--to-schema-datamodel', resolve('prisma/schema.prisma'), '--exit-code',
], { env: { ...process.env, DIRECT_URL: process.env.DATABASE_URL }, encoding: 'utf8', timeout: 120_000 });
const hash = value => createHash('sha256').update(value.replaceAll('\r\n', '\n').trim()).digest('hex');
const schemaSha256 = hash(readFileSync('prisma/schema.prisma', 'utf8'));
const differenceSha256 = hash(diff.stdout || '');
if (process.argv.includes('--capture-baseline')) {
  if (![0, 2].includes(diff.status)) throw new Error('Cannot capture a failed database comparison');
  console.log(JSON.stringify({ schemaSha256, differenceSha256, diffStatus: diff.status }));
  process.exit(0);
}
let baseline;
try { baseline = JSON.parse(readFileSync('/etc/onesystemserp/schema-compatibility.json', 'utf8')); } catch {}
const approvedExistingDifference = diff.status === 2 && baseline?.diffStatus === 2 &&
  baseline.schemaSha256 === schemaSha256 && baseline.differenceSha256 === differenceSha256;
if (diff.status !== 0 && !approvedExistingDifference) {
  // Never include command arguments or Prisma output: they may contain credentials.
  throw new Error(diff.status === 2
    ? 'Database schema differs. Apply and verify a compatible migration separately before deployment.'
    : 'Read-only database schema comparison failed');
}
console.log('Database connection, user read, and MySQL compatibility checks passed');
