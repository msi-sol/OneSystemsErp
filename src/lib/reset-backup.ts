import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, realpathSync, statfsSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

const DEFAULT_MYSQLDUMP = '/usr/bin/mysqldump';
// nginx gives up on the request at 120s. Stop before that, so a caller who sees
// a gateway error can't have a wipe start afterwards.
const DUMP_TIMEOUT_MS = 100_000;
const SPARE_DISK_BYTES = 512 * 1024 * 1024;
const COMPLETION_MARKER = '-- Dump completed';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export class ResetBackupError extends Error {
  constructor(reason: string) {
    super(`Reset stopped and no data was deleted: ${reason}`);
    this.name = 'ResetBackupError';
  }
}

type SizeQuery = { $queryRawUnsafe(query: string): Promise<unknown> };

function connectionFromEnv() {
  let url: URL;
  try {
    url = new URL(process.env.DATABASE_URL || '');
  } catch {
    // The parser's own error repeats the URL, so it must not be passed on.
    throw new ResetBackupError('DATABASE_URL is missing or invalid.');
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (url.protocol !== 'mysql:' || !database) throw new ResetBackupError('backups support MySQL databases only.');
  return { url, database };
}

function backupDirectory() {
  const configured = process.env.RESET_BACKUP_DIR;
  if (!configured) throw new ResetBackupError('RESET_BACKUP_DIR is not set, so a database backup cannot be taken.');
  const unsafe = new ResetBackupError('RESET_BACKUP_DIR must be an absolute path outside the application and upload folders.');
  if (!isAbsolute(configured)) throw unsafe;
  let directory: string;
  try {
    mkdirSync(configured, { recursive: true, mode: 0o700 });
    directory = realpathSync(configured);
  } catch {
    throw new ResetBackupError('the folder in RESET_BACKUP_DIR cannot be created or opened.');
  }
  // These dumps hold every user record: keep them out of the checkout, which a
  // commit could publish, and out of the upload folders, which are served and cleared.
  const fromApp = relative(realpathSync(process.cwd()), directory);
  const insideApp = !fromApp || (!fromApp.startsWith('..') && !isAbsolute(fromApp));
  if (insideApp || directory.split(sep).some(part => /^public$|uploads/i.test(part))) throw unsafe;
  return directory;
}

function dumpArguments({ url, database }: ReturnType<typeof connectionFromEnv>) {
  const ca = url.searchParams.get('sslcert');
  const tls = ca ? ['--ssl-mode=VERIFY_IDENTITY', `--ssl-ca=${ca}`]
    : LOOPBACK_HOSTS.has(url.hostname) ? [] : ['--ssl-mode=REQUIRED'];
  return ['--no-defaults', '--single-transaction', '--quick', '--skip-lock-tables', '--no-tablespaces',
    '--set-gtid-purged=OFF', '--hex-blob', ...tls, `--host=${url.hostname}`, `--port=${url.port || '3306'}`,
    `--user=${decodeURIComponent(url.username)}`, database];
}

/**
 * Dumps the database that the reset is about to delete from, or throws
 * ResetBackupError. Call it before any deletion and let the error stop the reset.
 */
export async function createResetBackup(db: SizeQuery): Promise<string> {
  const connection = connectionFromEnv();
  const directory = backupDirectory();

  const rows = await db.$queryRawUnsafe("SELECT DATABASE() AS db, COALESCE(SUM(DATA_LENGTH+INDEX_LENGTH),0) AS bytes FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()") as { db: string; bytes: unknown }[];
  if (rows[0]?.db !== connection.database) throw new ResetBackupError('the reset is connected to a different database than DATABASE_URL names.');
  const disk = statfsSync(directory);
  if (disk.bavail * disk.bsize < Number(rows[0].bytes) * 2 + SPARE_DISK_BYTES) throw new ResetBackupError('there is not enough free disk space for a database backup.');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = join(directory, `pre-reset-${timestamp}.sql.gz`);
  const partial = `${destination}.partial`;

  const dump = spawn(process.env.RESET_BACKUP_MYSQLDUMP || DEFAULT_MYSQLDUMP, dumpArguments(connection), {
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PATH: process.env.PATH,
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      MYSQL_PWD: decodeURIComponent(connection.url.password),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let diagnostics = '';
  dump.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-500); });
  let tail = '';
  const tracker = new Transform({
    transform(chunk, _encoding, done) {
      tail = (tail + chunk.toString('latin1')).slice(-256);
      done(null, chunk);
    },
  });

  let timedOut = false;
  const hardStop = setTimeout(() => { timedOut = true; dump.kill('SIGKILL'); }, DUMP_TIMEOUT_MS);
  const abort = new AbortController();
  const exited = new Promise<void>((resolveExit, reject) => {
    dump.once('error', reject);
    dump.once('close', code => code === 0 ? resolveExit() : reject(new Error(`mysqldump exited with ${code}`)));
  }).catch(error => { abort.abort(); throw error; });
  const written = pipeline(dump.stdout, tracker, createGzip(), createWriteStream(partial, { flags: 'wx', mode: 0o600, flush: true }), { signal: abort.signal })
    .catch(error => { dump.kill('SIGKILL'); throw error; });

  const [exit, write] = await Promise.allSettled([exited, written]);
  clearTimeout(hardStop);

  let refusal: string | null = null;
  if (exit.status === 'rejected') {
    refusal = (exit.reason as NodeJS.ErrnoException)?.code === 'ENOENT'
      ? 'mysqldump was not found on this server. Install it or set RESET_BACKUP_MYSQLDUMP.'
      : timedOut ? 'the database backup did not finish in time.' : 'the database backup failed. See the server log.';
  } else if (write.status === 'rejected') {
    refusal = 'the database backup could not be written. See the server log.';
  } else if (!tail.includes(COMPLETION_MARKER)) {
    refusal = 'the database backup was incomplete. See the server log.';
  }
  if (refusal) {
    console.error('Pre-reset database backup failed:', diagnostics.trim() || (write.status === 'rejected' ? write.reason?.code : '') || 'no diagnostics');
    await rm(partial, { force: true }).catch(() => {});
    throw new ResetBackupError(refusal);
  }

  await rename(partial, destination);
  console.log(`Pre-reset database backup created at ${destination}`);
  return destination;
}
