import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { gunzipSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { createResetBackup, ResetBackupError } from '@/lib/reset-backup';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

const COMPLETE_DUMP = 'CREATE TABLE `User` (`id` int);\n-- Dump completed on 2026-11-05 10:00:00\n';
const originalEnv = process.env;
const db = (bytes: unknown = 1024, name = 'onesystemserp') => ({
  $queryRawUnsafe: jest.fn(async () => [{ db: name, bytes }]),
});

function fakeDump({ stdout = COMPLETE_DUMP, stderr = '', code = 0, spawnError }: {
  stdout?: string; stderr?: string; code?: number; spawnError?: NodeJS.ErrnoException;
} = {}) {
  (spawn as jest.Mock).mockImplementation(() => {
    const child: any = new EventEmitter();
    child.stdout = spawnError ? new Readable({ read() {} }) : Readable.from([Buffer.from(stdout)]);
    child.stderr = Readable.from(stderr ? [Buffer.from(stderr)] : []);
    child.kill = jest.fn();
    if (spawnError) setImmediate(() => child.emit('error', spawnError));
    else child.stdout.once('end', () => setImmediate(() => child.emit('close', code)));
    return child;
  });
}

let directory: string;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  directory = mkdtempSync(join(tmpdir(), 'reset-backup-'));
  process.env = {
    ...originalEnv,
    DATABASE_URL: 'mysql://erp_app:s3cret%21@127.0.0.1:3307/onesystemserp',
    RESET_BACKUP_DIR: directory,
  };
  delete process.env.RESET_BACKUP_MYSQLDUMP;
  fakeDump();
});

afterEach(() => {
  process.env = originalEnv;
  rmSync(directory, { recursive: true, force: true });
  jest.restoreAllMocks();
});

describe('backup taken', () => {
  test('writes a complete compressed dump and returns its path', async () => {
    const path = await createResetBackup(db());

    expect(path.startsWith(directory)).toBe(true);
    expect(path).toMatch(/pre-reset-.*\.sql\.gz$/);
    expect(gunzipSync(readFileSync(path)).toString()).toBe(COMPLETE_DUMP);
    expect(readdirSync(directory)).toEqual([path.slice(directory.length + 1)]);
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o077).toBe(0);
  });

  test('passes the password only through the child environment', async () => {
    await createResetBackup(db());

    const [binary, args, options] = (spawn as jest.Mock).mock.calls[0];
    expect(binary).toBe('/usr/bin/mysqldump');
    expect(args[0]).toBe('--no-defaults');
    expect(args).toEqual(expect.arrayContaining(['--single-transaction', '--host=127.0.0.1', '--port=3307', '--user=erp_app', 'onesystemserp']));
    expect(args.join(' ')).not.toContain('s3cret');
    expect(options.env.MYSQL_PWD).toBe('s3cret!');
    expect(options.env.DATABASE_URL).toBeUndefined();
  });

  test('verifies the server certificate when the connection names a CA', async () => {
    process.env.DATABASE_URL = 'mysql://u:p@db.example.com/onesystemserp?sslcert=/etc/ca.pem';
    await createResetBackup(db());

    expect((spawn as jest.Mock).mock.calls[0][1]).toEqual(expect.arrayContaining(['--ssl-mode=VERIFY_IDENTITY', '--ssl-ca=/etc/ca.pem', '--port=3306']));
  });

  test('requires TLS for a remote database without a CA', async () => {
    process.env.DATABASE_URL = 'mysql://u:p@db.example.com/onesystemserp';
    await createResetBackup(db());

    expect((spawn as jest.Mock).mock.calls[0][1]).toContain('--ssl-mode=REQUIRED');
  });

  test('honours RESET_BACKUP_MYSQLDUMP', async () => {
    process.env.RESET_BACKUP_MYSQLDUMP = '/opt/mysql/bin/mysqldump';
    await createResetBackup(db());

    expect((spawn as jest.Mock).mock.calls[0][0]).toBe('/opt/mysql/bin/mysqldump');
  });
});

describe('backup refused', () => {
  async function expectRefusal(pattern: RegExp, target = db()) {
    const failure = await createResetBackup(target).catch(error => error);
    expect(failure).toBeInstanceOf(ResetBackupError);
    expect(failure.message).toMatch(/^Reset stopped and no data was deleted: /);
    expect(failure.message).toMatch(pattern);
    expect(failure.message).not.toContain('s3cret');
    expect(existsSync(directory) ? readdirSync(directory) : []).toEqual([]);
  }

  test('when RESET_BACKUP_DIR is not set', async () => {
    delete process.env.RESET_BACKUP_DIR;
    await expectRefusal(/RESET_BACKUP_DIR is not set/);
    expect(spawn).not.toHaveBeenCalled();
  });

  test('when RESET_BACKUP_DIR is relative', async () => {
    process.env.RESET_BACKUP_DIR = 'prisma/backups';
    await expectRefusal(/absolute path/);
    expect(spawn).not.toHaveBeenCalled();
  });

  test('when RESET_BACKUP_DIR is inside the application folder', async () => {
    const inside = mkdtempSync(join(process.cwd(), 'reset-backup-inside-'));
    process.env.RESET_BACKUP_DIR = inside;
    try {
      await expectRefusal(/outside the application/);
    } finally {
      rmSync(inside, { recursive: true, force: true });
    }
  });

  test('when RESET_BACKUP_DIR is an upload folder', async () => {
    const uploads = join(directory, 'public-uploads');
    mkdirSync(uploads);
    process.env.RESET_BACKUP_DIR = uploads;
    await expect(createResetBackup(db())).rejects.toThrow(/upload folders/);
    expect(readdirSync(uploads)).toEqual([]);
    expect(spawn).not.toHaveBeenCalled();
  });

  test('when the database is not MySQL', async () => {
    process.env.DATABASE_URL = 'postgres://u:s3cret@127.0.0.1/erp';
    await expectRefusal(/MySQL databases only/);
  });

  test('when DATABASE_URL cannot be parsed, without repeating it', async () => {
    process.env.DATABASE_URL = 'mysql//u:s3cret@nowhere';
    await expectRefusal(/missing or invalid/);
  });

  test('when Prisma is connected to a different database', async () => {
    await expectRefusal(/different database/, db(1024, 'another_schema'));
    expect(spawn).not.toHaveBeenCalled();
  });

  test('when the disk has too little room', async () => {
    await expectRefusal(/free disk space/, db(Number.MAX_SAFE_INTEGER));
    expect(spawn).not.toHaveBeenCalled();
  });

  test('when mysqldump is not installed', async () => {
    fakeDump({ spawnError: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }) });
    await expectRefusal(/mysqldump was not found/);
  });

  test('when mysqldump exits with an error, logging its diagnostics privately', async () => {
    fakeDump({ stdout: 'partial', stderr: 'mysqldump: Got error: 1045: Access denied', code: 2 });
    await expectRefusal(/backup failed/);
    expect(console.error).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Access denied'));
  });

  test('when the dump has no completion marker', async () => {
    fakeDump({ stdout: 'CREATE TABLE `User` (`id` int);\n' });
    await expectRefusal(/incomplete/);
  });
});
