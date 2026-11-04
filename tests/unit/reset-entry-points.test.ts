import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createResetBackup, ResetBackupError } from '@/lib/reset-backup';
import { resetTransactionData } from '@/app/actions/systemResetActions';
import { verifySession } from '@/lib/dal/auth';
import backendRouter from '../../apps/aws-backend/src/routes/systemResetActions';
import { main as runResetScript } from '../../scripts/reset-transactions';

jest.mock('next/headers', () => ({ cookies: jest.fn().mockResolvedValue({ get: () => undefined }) }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/dal/auth', () => ({ verifySession: jest.fn() }));
jest.mock('@/lib/reset-backup', () => ({
  ...jest.requireActual('@/lib/reset-backup'),
  createResetBackup: jest.fn(),
}));

// Any model and operation resolves, so each test can focus on what ran and in what order.
jest.mock('@/lib/prisma', () => {
  const operations = new Map<string, jest.Mock>();
  const model = (name: string) => new Proxy({}, {
    get: (_target, operation: string) => {
      const key = `${name}.${operation}`;
      if (!operations.has(key)) operations.set(key, jest.fn(async () => ({ id: 'actor', role: 'SUPER_ADMIN' })));
      return operations.get(key);
    },
  });
  const client: any = new Proxy({}, {
    get: (_target, name: string) => {
      if (name === '__operations') return operations;
      if (name === '$transaction') {
        if (!operations.has(name)) {
          operations.set(name, jest.fn(async (work: any) => typeof work === 'function' ? work(client) : Promise.all(work)));
        }
        return operations.get(name);
      }
      if (name === '$disconnect') return async () => undefined;
      return model(name);
    },
  });
  return { prisma: client };
});
jest.mock('../../apps/aws-backend/src/lib/prisma', () => ({ prisma: require('@/lib/prisma').prisma }));
jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => require('@/lib/prisma').prisma) }));

const { prisma } = require('@/lib/prisma');
const operations: Map<string, jest.Mock> = prisma.__operations;
const transaction = () => prisma.$transaction as jest.Mock;
const backup = createResetBackup as jest.Mock;
const refusal = new ResetBackupError('RESET_BACKUP_DIR is not set, so a database backup cannot be taken.');
const auditRemarks = () => operations.get('auditLog.create')?.mock.calls.at(-1)?.[0].data.remarks;

let workspace: string;
let uploadedFile: string;

async function callBackendRoute() {
  const layer = (backendRouter as any).stack.find((item: any) => item.route?.path === '/resetTransactionData');
  const res: any = { statusCode: 200, status(code: number) { res.statusCode = code; return res; }, json(body: unknown) { res.body = body; return res; } };
  await layer.route.stack[0].handle({ body: { confirmationText: 'RESET TRANSACTION DATA ONLY', sessionId: 'actor' } }, res);
  return res;
}

beforeEach(() => {
  operations.forEach(mock => mock.mockClear());
  backup.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  (verifySession as jest.Mock).mockResolvedValue({ id: 'actor', role: 'SUPER_ADMIN' });
  // The backend route clears <cwd>/public/uploads, so point it at a throwaway folder.
  workspace = mkdtempSync(join(tmpdir(), 'reset-entry-'));
  mkdirSync(join(workspace, 'public', 'uploads'), { recursive: true });
  uploadedFile = join(workspace, 'public', 'uploads', 'proof.pdf');
  writeFileSync(uploadedFile, 'uploaded');
  jest.spyOn(process, 'cwd').mockReturnValue(workspace);
});

afterEach(() => {
  jest.restoreAllMocks();
  rmSync(workspace, { recursive: true, force: true });
});

describe('Next server action used by the Settings page', () => {
  test('stops before deleting when the backup is refused', async () => {
    backup.mockRejectedValue(refusal);

    await expect(resetTransactionData('RESET TRANSACTION DATA ONLY')).resolves.toEqual({ success: false, error: refusal.message });
    expect(transaction()).not.toHaveBeenCalled();
    expect(operations.get('aIValidationLog.deleteMany')).toBeUndefined();
  });

  test('backs up, then deletes, and records the backup in the audit log', async () => {
    backup.mockResolvedValue('/backups/pre-reset-a.sql.gz');

    await expect(resetTransactionData('RESET TRANSACTION DATA ONLY')).resolves.toEqual({ success: true });
    expect(backup.mock.invocationCallOrder[0]).toBeLessThan(transaction().mock.invocationCallOrder[0]);
    expect(auditRemarks()).toContain('Backup: pre-reset-a.sql.gz');
  });

  test('does not back up for a user who may not reset', async () => {
    (verifySession as jest.Mock).mockResolvedValue(null);

    await expect(resetTransactionData('RESET TRANSACTION DATA ONLY')).resolves.toMatchObject({ success: false });
    expect(backup).not.toHaveBeenCalled();
  });
});

describe('POST /resetTransactionData', () => {
  test('stops with 503 before deleting data or files when the backup is refused', async () => {
    backup.mockRejectedValue(refusal);

    const res = await callBackendRoute();

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ success: false, error: refusal.message });
    expect(transaction()).not.toHaveBeenCalled();
    expect(existsSync(uploadedFile)).toBe(true);
  });

  test('backs up, then deletes, and records the backup in the audit log', async () => {
    backup.mockResolvedValue('/backups/pre-reset-b.sql.gz');

    const res = await callBackendRoute();

    expect(res.body).toEqual({ success: true });
    expect(backup.mock.invocationCallOrder[0]).toBeLessThan(transaction().mock.invocationCallOrder[0]);
    expect(auditRemarks()).toContain('Backup: pre-reset-b.sql.gz');
    expect(existsSync(uploadedFile)).toBe(false);
  });
});

describe('scripts/reset-transactions.ts', () => {
  test('exits non-zero before deleting when the backup is refused', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    backup.mockRejectedValue(refusal);

    await runResetScript();

    expect(exit).toHaveBeenCalledWith(1);
    expect(transaction()).not.toHaveBeenCalled();
  });

  test('backs up, then deletes, and records the backup in the audit log', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    backup.mockResolvedValue('/backups/pre-reset-c.sql.gz');

    await runResetScript();

    expect(exit).not.toHaveBeenCalled();
    expect(backup.mock.invocationCallOrder[0]).toBeLessThan(transaction().mock.invocationCallOrder[0]);
    expect(auditRemarks()).toContain('Backup: pre-reset-c.sql.gz');
  });
});

test('no reset path still looks for the old SQLite file', () => {
  const root = join(__dirname, '..', '..');
  for (const file of ['apps/aws-backend/src/routes/systemResetActions.ts', 'scripts/reset-transactions.ts', 'src/app/actions/systemResetActions.ts']) {
    expect(readFileSync(join(root, file), 'utf8')).not.toMatch(/dev\.db|copyFileSync/);
  }
});
