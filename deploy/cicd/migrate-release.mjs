// Root-installed runner, executed as the isolated ERP migrator OS account.
// Credentials remain on EC2. Only committed, scoped Prisma migrations are applied.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, statfsSync, writeFileSync } from 'node:fs';
import { readFile, writeFile, mkdir, mkdtemp, cp, rm, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { validateMigrationUrl, validateGrants, loadMigrations, validateHistory } from './migration-policy.mjs';

const state = '/var/lib/onesystemserp/migrations';
const hash = value => createHash('sha256').update(value.replaceAll('\r\n', '\n').trim()).digest('hex');
const fingerprint = source => hash(source.replace(/generator\s+\w+\s*\{[^}]*\}/g, ''));
class MigrationFailure extends Error {}
const fail = message => { throw new MigrationFailure(message); };

function checkDatasource(source) {
  const blocks = [...source.matchAll(/datasource\s+\w+\s*\{([^}]*)\}/g)];
  if (blocks.length !== 1) fail('Unexpected Prisma datasource');
  const block = blocks[0][1].replace(/\/\/[^\n]*/g, '').trim();
  const assignments = block.split(/\r?\n/).map(line => line.trim()).filter(Boolean).sort();
  const expected = [/^directUrl\s*=\s*env\("DIRECT_URL"\)$/, /^provider\s*=\s*"mysql"$/, /^url\s*=\s*env\("DATABASE_URL"\)$/];
  if (assignments.length !== 3 || assignments.some((line, index) => !expected[index].test(line))) fail('Unexpected Prisma datasource');
}

function compare(cli, schema, cwd, env) {
  const result = spawnSync(process.execPath, [cli, 'migrate', 'diff', '--from-schema-datasource', schema,
    '--to-schema-datamodel', schema, '--exit-code'], { cwd, env, encoding: 'utf8', timeout: 90_000 });
  if (![0, 2].includes(result.status)) {
    writeFileSync(join(state, 'last-prisma-diff.log'), (result.stdout || '') + '\n' + (result.stderr || ''), { mode: 0o600 });
    fail('Read-only migration compatibility comparison failed');
  }
  return { diffStatus: result.status, differenceSha256: hash(result.stdout) };
}

async function backup(url, id, db) {
  const estimates = await db.$queryRawUnsafe("SELECT COALESCE(SUM(DATA_LENGTH+INDEX_LENGTH),0) AS bytes FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()");
  const disk = statfsSync(state);
  if (disk.bavail * disk.bsize < Number(estimates[0].bytes) * 2 + 512 * 1024 * 1024) fail('Insufficient space for a private pre-migration backup');
  const dir = join(state, 'backups');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const destination = join(dir, id + '.' + Date.now() + '.sql.gz'), partial = destination + '.partial';
  const dump = spawn('/usr/bin/mysqldump', ['--no-defaults', '--single-transaction', '--quick', '--skip-lock-tables',
    '--no-tablespaces', '--set-gtid-purged=OFF', '--ssl-mode=VERIFY_IDENTITY',
    '--ssl-ca=' + url.searchParams.get('sslcert'), '--host=' + url.hostname,
    '--port=3306', '--user=onesystemserp_migrator', 'onesystemserp'], {
    env: { PATH: '/usr/bin:/bin', MYSQL_PWD: decodeURIComponent(url.password) },
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000,
  });
  // Drain diagnostics privately; neither SQL nor credentials are sent to GitHub.
  dump.stderr.resume();
  const exited = new Promise((resolveExit, reject) => {
    dump.once('error', reject);
    dump.once('close', code => code === 0 ? resolveExit() : reject(new Error('Schema-only backup failed')));
  });
  const hardStop = setTimeout(() => dump.kill('SIGKILL'), 125_000);
  try {
    await Promise.all([pipeline(dump.stdout, createGzip(), createWriteStream(partial, { flags: 'wx', mode: 0o600, flush: true })), exited]);
  } catch {
    dump.kill('SIGKILL');
    await exited.catch(() => {});
    await rm(partial, { force: true });
    fail('Pre-migration backup failed; no migration was applied');
  } finally { clearTimeout(hardStop); }
  await rename(partial, destination);
  return destination;
}

async function main() {
  process.umask(0o077);
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => {
    if (i % 2 === 0) pairs.push([value, all[i + 1]]);
    return pairs;
  }, []));
  const id = args['--id'];
  if (!/^[a-f0-9]{40}-[0-9]{1,20}-[0-9]{1,4}$/.test(id || '') ||
      !/^[a-f0-9]{64}$/.test(args['--schema-sha'] || '') || !/^[a-f0-9]{64}$/.test(args['--difference-sha'] || '')) fail('Invalid migration request');
  const release = resolve(process.cwd());
  if (!release.startsWith('/opt/onesystemserp/releases/') || release.split('/').at(-1) !== id) fail('Unexpected release path');
  const url = validateMigrationUrl(process.env.DIRECT_URL);
  validateMigrationUrl(process.env.DATABASE_URL);
  if (process.env.DATABASE_URL !== process.env.DIRECT_URL) fail('Migration environment must contain only the dedicated migrator connection');
  const require = createRequire(join(release, 'package.json'));
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
  const workspace = await mkdtemp(join(state, 'work-'));
  try {
    const identity = (await db.$queryRawUnsafe('SELECT CURRENT_USER() AS user, DATABASE() AS db, CURRENT_ROLE() AS roles, @@SESSION.sql_mode AS mode, @@GLOBAL.sql_mode AS globalMode'))[0];
    if (identity.db !== 'onesystemserp' || identity.roles !== 'NONE' || /ANSI_QUOTES|NO_BACKSLASH_ESCAPES/i.test(identity.mode + ',' + identity.globalMode)) fail('Unexpected database identity, roles, or SQL interpretation mode');
    validateGrants((await db.$queryRawUnsafe('SHOW GRANTS')).map(row => Object.values(row)[0]), identity.user);
    const tls = await db.$queryRawUnsafe("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    if (!(tls[0]?.Value || (tls[0] && Object.values(tls[0])[1]))) fail('Migration connection must use TLS');
    // Definer objects could indirectly access another schema even when the
    // login's direct grants are restricted. This migration path manages tables only.
    for (const [table, column] of [['VIEWS', 'TABLE_SCHEMA'], ['TRIGGERS', 'TRIGGER_SCHEMA'], ['ROUTINES', 'ROUTINE_SCHEMA'], ['EVENTS', 'EVENT_SCHEMA']]) {
      const rows = await db.$queryRawUnsafe(`SELECT COUNT(*) AS count FROM information_schema.${table} WHERE ${column}=DATABASE()`);
      if (Number(rows[0].count)) fail('Schema contains stored/definer objects requiring separate review');
    }
    // This snapshot follows successful database changes even if app activation
    // rolls back. Subsequent corrective releases can then deploy without undoing SQL.
    const currentSource = await readFile('/etc/onesystemserp-migrations/applied-schema.prisma', 'utf8');
    const nextSource = await readFile(join(release, 'prisma/schema.prisma'), 'utf8');
    checkDatasource(currentSource); checkDatasource(nextSource);
    if (fingerprint(currentSource) !== args['--schema-sha']) fail('Current deployed schema differs from the trusted compatibility record');
    await writeFile(join(workspace, 'current.prisma'), currentSource, { mode: 0o600 });
    await writeFile(join(workspace, 'schema.prisma'), nextSource, { mode: 0o600 });
    await cp(join(release, 'prisma/migrations'), join(workspace, 'migrations'), { recursive: true, dereference: false });
    const migrations = await loadMigrations(join(workspace, 'migrations'));
    const history = () => db.$queryRawUnsafe('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY started_at,id');
    const pending = validateHistory(migrations, await history());
    if (pending.length && args['--require-no-pending'] === 'true') fail('Installation audit expected no pending migrations');
    const cli = join(release, 'node_modules/prisma/build/index.js');
    const env = { ...process.env, DATABASE_URL: url.toString(), DIRECT_URL: url.toString() };
    const before = compare(cli, join(workspace, 'current.prisma'), workspace, env);
    if (before.differenceSha256 !== args['--difference-sha']) fail('Unexpected pre-existing database drift; no migration was applied');
    let backupPath = null;
    console.log(`Migration account verified: onesystemserp schema only; ${pending.length} pending migration(s)`);
    if (pending.length || args['--backup-check'] === 'true') {
      backupPath = await backup(url, id, db);
      console.log('Private onesystemserp backup completed');
    }
    const deployed = spawnSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', join(workspace, 'schema.prisma')], {
      cwd: workspace, env, encoding: 'utf8', timeout: 300_000,
    });
    if (deployed.status !== 0) {
      await writeFile(join(state, 'last-prisma-deploy.log'), (deployed.stdout || '') + '\n' + (deployed.stderr || ''), { mode: 0o600 });
      fail('Prisma migration failed; deployment stopped. Review the private backup and migration history before retrying.');
    }
    if (validateHistory(migrations, await history()).length) fail('Migration history is incomplete after deployment');
    const after = compare(cli, join(workspace, 'schema.prisma'), workspace, env);
    if (after.differenceSha256 !== args['--difference-sha']) fail('Post-migration schema differs from the new application or protected baseline; application deployment stopped');
    const result = { schemaSha256: fingerprint(nextSource), differenceSha256: after.differenceSha256,
      diffStatus: after.diffStatus, pending: pending.length, applied: pending.map(m => m.name), backup: backupPath };
    await mkdir(join(state, 'results'), { recursive: true, mode: 0o700 });
    await writeFile(join(state, 'results', id + '.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log('MIGRATION_RESULT ' + JSON.stringify(result));
  } finally {
    await db.$disconnect().catch(() => {});
    await rm(workspace, { recursive: true, force: true });
  }
}

main().catch(async error => {
  await writeFile(join(state, 'last-error.log'), error.stack || String(error), { mode: 0o600 }).catch(() => {});
  // Suppress third-party exception details because they may include connection data.
  console.error('MIGRATION_FAILED: ' + (error instanceof MigrationFailure || error.message?.startsWith('Migration policy:') ? error.message :
    'Scoped migration preflight or execution failed; review private host diagnostics.'));
  process.exitCode = 1;
});
