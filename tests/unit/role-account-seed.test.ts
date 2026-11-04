import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { ROLE_ACCOUNTS, generateTemporaryPassword, seedRoleAccounts } from '@/lib/role-account-seed';
import { validatePasswordPolicy } from '@/lib/passwordPolicy';
import { resetTransactionData } from '@/app/actions/systemResetActions';
import { verifySession } from '@/lib/dal/auth';
import { prisma } from '@/lib/prisma';
import backendRouter from '../../apps/aws-backend/src/routes/systemResetActions';

jest.mock('next/headers', () => ({ cookies: jest.fn().mockResolvedValue({ get: () => undefined }) }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/dal/auth', () => ({ verifySession: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: require('../helpers/reset-prisma-mock').createResetPrismaMock() }));
jest.mock('../../apps/aws-backend/src/lib/prisma', () => ({ prisma: require('@/lib/prisma').prisma }));

const db = prisma as any;
const root = join(__dirname, '..', '..');

function fakeTx(existingEmails: string[] = []) {
  return {
    user: {
      findFirst: jest.fn(async ({ where }: any) => existingEmails.includes(where.email) ? { id: `id:${where.email}` } : null),
      create: jest.fn(async ({ data }: any) => ({ id: `id:${data.email}` })),
      update: jest.fn(async ({ where }: any) => ({ id: where.id })),
    },
    role: { findFirst: jest.fn(async ({ where }: any) => ({ id: `role:${where.roleCode}` })) },
    userRole: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) },
  };
}

function backendResetHandler() {
  const layer = (backendRouter as any).stack.find((item: any) => item.route?.path === '/resetTransactionData');
  return layer.route.stack[0].handle;
}

function fakeResponse() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  db.__tx.user.findFirst.mockResolvedValue(null);
  db.__tx.user.create.mockImplementation(async ({ data }: any) => ({ id: `id:${data.email}` }));
  db.__tx.auditLog.create.mockResolvedValue({});
  db.user.findUnique.mockResolvedValue({ id: 'actor', role: 'SUPER_ADMIN' });
  db.user.count.mockResolvedValue(1);
  (verifySession as jest.Mock).mockResolvedValue({ id: 'actor', role: 'SUPER_ADMIN' });
});

afterEach(() => jest.restoreAllMocks());

describe('seedRoleAccounts', () => {
  test('gives each missing account its own one-time password and forces a change', async () => {
    const tx = fakeTx();

    const issued = await seedRoleAccounts(tx as any);

    expect(issued.map((credential) => credential.email)).toEqual(ROLE_ACCOUNTS.map((account) => account.email));
    expect(new Set(issued.map((credential) => credential.temporaryPassword)).size).toBe(ROLE_ACCOUNTS.length);

    const created = tx.user.create.mock.calls.map(([args]: any) => args.data);
    for (const [index, data] of created.entries()) {
      expect(data.mustChangePassword).toBe(true);
      expect(data).not.toHaveProperty('password');
      await expect(bcrypt.compare(issued[index].temporaryPassword, data.passwordHash)).resolves.toBe(true);
    }
    expect(new Set(created.map((data: any) => data.passwordHash)).size).toBe(ROLE_ACCOUNTS.length);
  }, 30000);

  test('never changes the credentials of an existing account', async () => {
    const tx = fakeTx(ROLE_ACCOUNTS.map((account) => account.email));

    const issued = await seedRoleAccounts(tx as any);

    expect(issued).toEqual([]);
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalledTimes(ROLE_ACCOUNTS.length);
    for (const [args] of tx.user.update.mock.calls as any[]) {
      expect(Object.keys(args.data).sort()).toEqual(['defaultRole', 'role']);
    }
  });

  test('links the role only when the account does not already have it', async () => {
    const tx = fakeTx(ROLE_ACCOUNTS.map((account) => account.email));
    tx.userRole.findFirst.mockImplementation((async ({ where }: any) =>
      where.roleId === 'role:SITE_ADMIN' ? null : { id: 'link' }) as any);

    await seedRoleAccounts(tx as any);

    expect(tx.userRole.create).toHaveBeenCalledTimes(1);
    expect(tx.userRole.create).toHaveBeenCalledWith({ data: { userId: 'id:admin@onesystemserp.com', roleId: 'role:SITE_ADMIN' } });
  });

  test('generates passwords the password policy accepts', () => {
    const samples = Array.from({ length: 50 }, generateTemporaryPassword);
    expect(new Set(samples).size).toBe(samples.length);
    for (const sample of samples) {
      expect(validatePasswordPolicy(sample, 'admin@onesystemserp.com')).toEqual({ valid: true });
      expect(sample.length).toBeGreaterThanOrEqual(24);
    }
  });
});

describe('master reset action', () => {
  test('returns the passwords issued by a committed reset', async () => {
    const result = await resetTransactionData('RESET TRANSACTION DATA ONLY');

    expect(result.success).toBe(true);
    expect(result.temporaryCredentials).toHaveLength(ROLE_ACCOUNTS.length);
    const remarks = db.__tx.auditLog.create.mock.calls[0][0].data.remarks;
    expect(remarks).toContain(`Temporary passwords issued: ${ROLE_ACCOUNTS.length}`);
    for (const credential of result.temporaryCredentials!) expect(remarks).not.toContain(credential.temporaryPassword);
  }, 30000);

  test('returns no passwords when the seeding transaction rolls back', async () => {
    db.__tx.auditLog.create.mockRejectedValue(new Error('audit failed'));

    const result = await resetTransactionData('RESET TRANSACTION DATA ONLY');

    expect(result.success).toBe(true);
    expect(result.temporaryCredentials).toEqual([]);
  }, 30000);

  test('rejects anyone who is not a SUPER_ADMIN before changing data', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'actor', role: 'FINANCE_OFFICER' });

    const result = await resetTransactionData('RESET TRANSACTION DATA ONLY');

    expect(result.success).toBe(false);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('backend reset route', () => {
  const body = { confirmationText: 'RESET TRANSACTION DATA ONLY', sessionId: 'actor' };
  // The route backs up the database and clears uploads, so it must never reach the real disk here.
  const fs = jest.requireActual('fs');

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    jest.spyOn(fs, 'copyFileSync').mockReturnValue(undefined);
    jest.spyOn(fs, 'unlinkSync').mockReturnValue(undefined);
    jest.spyOn(fs, 'readdirSync').mockReturnValue([]);
  });

  test('still returns the passwords when upload cleanup fails after the commit', async () => {
    (fs.existsSync as jest.Mock).mockImplementation((path: string) => path.endsWith('uploads'));
    (fs.readdirSync as jest.Mock).mockImplementation(() => { throw new Error('disk error'); });
    const res = fakeResponse();

    await backendResetHandler()({ body }, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.temporaryCredentials).toHaveLength(ROLE_ACCOUNTS.length);
  }, 30000);

  test('returns the passwords issued by a committed reset', async () => {
    const res = fakeResponse();

    await backendResetHandler()({ body }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.temporaryCredentials).toHaveLength(ROLE_ACCOUNTS.length);
  }, 30000);

  test('keeps existing accounts untouched', async () => {
    db.__tx.user.findFirst.mockImplementation(async ({ where }: any) => ({ id: `id:${where.email}` }));
    const res = fakeResponse();

    await backendResetHandler()({ body }, res);

    expect(res.body.temporaryCredentials).toEqual([]);
    expect(db.__tx.user.create).not.toHaveBeenCalled();
    for (const [args] of db.__tx.user.update.mock.calls as any[]) {
      expect(Object.keys(args.data).sort()).toEqual(['defaultRole', 'role']);
    }
  });

  test('rejects anyone who is not a SUPER_ADMIN before changing data', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'actor', role: 'FINANCE_OFFICER' });
    const res = fakeResponse();

    await backendResetHandler()({ body }, res);

    expect(res.statusCode).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('reset source files', () => {
  test.each([
    'src/app/actions/systemResetActions.ts',
    'apps/aws-backend/src/routes/systemResetActions.ts',
    'src/lib/role-account-seed.ts',
  ])('%s holds no literal password or password hash', (file) => {
    const source = readFileSync(join(root, file), 'utf8');
    expect(source).not.toMatch(/\$2[aby]\$\d\d\$/);
    expect(source).not.toMatch(/\bpassword(Hash)?\s*:\s*['"`]/);
  });
});
