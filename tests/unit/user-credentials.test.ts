const mockTx = {
  user: { create: jest.fn(), update: jest.fn() },
  auditLog: { create: jest.fn() },
  passwordRecoveryToken: { updateMany: jest.fn() },
};
const mockDb = {
  user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  systemRole: { findUnique: jest.fn(), create: jest.fn() },
  role: { findFirst: jest.fn(), create: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock('@/lib/prisma', () => ({ prisma: mockDb }));
jest.mock('@/lib/prisma-base', () => ({ prismaBase: mockDb }));
jest.mock('../../apps/aws-backend/src/lib/prisma', () => ({ prisma: mockDb }));
jest.mock('@/lib/permissions', () => ({ requirePermission: jest.fn() }));
jest.mock('@/lib/dal/auth', () => ({ verifySession: jest.fn() }));
jest.mock('@/auth', () => ({ signOut: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import express from 'express';
import { createUser, resetUserPassword, updateUser } from '@/app/actions/user';
import { verifySession } from '@/lib/dal/auth';
import { canManageAccountRole, generateTemporaryPassword, validateNewPassword } from '@/lib/user-credentials';
import profileRouter from '../../apps/aws-backend/src/routes/profile';
import userRouter from '../../apps/aws-backend/src/routes/user';

const repoFile = (...parts: string[]) => readFileSync(join(__dirname, '..', '..', ...parts), 'utf8');
const randomPassword = () => randomBytes(16).toString('hex');
const asActor = (role: string, mustChangePassword = false) =>
  (verifySession as jest.Mock).mockResolvedValue({ id: 'actor-1', role, mustChangePassword });
const newUser = { name: 'New Person', email: 'new.person@example.com', role: 'SITE_ENGINEER' };

function expectNoWrites() {
  expect(mockDb.$transaction).not.toHaveBeenCalled();
  expect(mockDb.user.update).not.toHaveBeenCalled();
  expect(mockDb.user.create).not.toHaveBeenCalled();
  expect(mockDb.systemRole.create).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.resetAllMocks();
  mockDb.$transaction.mockImplementation((work: (tx: typeof mockTx) => unknown) => work(mockTx));
  mockDb.systemRole.findUnique.mockResolvedValue({ name: 'EXISTS' });
  mockDb.role.findFirst.mockResolvedValue({ id: 'role-1' });
  mockDb.user.findUnique.mockResolvedValue(null);
  mockTx.user.create.mockResolvedValue({ id: 'created-1' });
});

describe('createUser action', () => {
  test('stores only a bcrypt hash of a one-time password and forces a change', async () => {
    asActor('SUPER_ADMIN');
    const result = await createUser(newUser);

    expect(result.success).toBe(true);
    const { data } = mockTx.user.create.mock.calls[0][0];
    expect(data).toMatchObject({ ...newUser, mustChangePassword: true });
    expect(data).not.toHaveProperty('password');
    expect(data.passwordHash).not.toEqual(result.temporaryPassword);
    await expect(bcrypt.compare(result.temporaryPassword!, data.passwordHash)).resolves.toBe(true);
  });

  test('audits the creation without recording the credential', async () => {
    asActor('SYSTEM_ADMIN');
    const result = await createUser(newUser);

    expect(mockTx.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = mockTx.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ userId: 'actor-1', userRole: 'SYSTEM_ADMIN', actionType: 'USER_CREATED', transactionId: 'created-1' });
    const stored = mockTx.user.create.mock.calls[0][0].data;
    expect(JSON.stringify(audit)).not.toContain(result.temporaryPassword);
    expect(JSON.stringify(audit)).not.toContain(stored.passwordHash);
  });

  test('issues a different password that passes the policy for every user', async () => {
    asActor('SUPER_ADMIN');
    const first = await createUser(newUser);
    const second = await createUser({ ...newUser, email: 'other@example.com' });

    expect(first.temporaryPassword).not.toEqual(second.temporaryPassword);
    expect(validateNewPassword(first.temporaryPassword!, newUser.email)).toEqual({ valid: true });
  });

  test('does not return the password when the transaction fails, or echo the database error', async () => {
    asActor('SUPER_ADMIN');
    mockDb.$transaction.mockRejectedValue(new Error('echoed passwordHash value'));
    const result = await createUser(newUser);

    expect(result).toEqual({ success: false, error: 'An unexpected database error occurred.' });
  });

  test('reports a concurrent duplicate email as a conflict', async () => {
    asActor('SUPER_ADMIN');
    mockDb.$transaction.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(createUser(newUser)).resolves.toEqual({ success: false, error: 'A user with this email already exists.' });
  });

  test.each([
    ['no session', () => (verifySession as jest.Mock).mockResolvedValue(null)],
    ['a non-admin role', () => asActor('SITE_ENGINEER')],
    ['an admin who must change their own password', () => asActor('SUPER_ADMIN', true)],
  ])('is refused for %s', async (_label, arrange) => {
    arrange();
    const result = await createUser(newUser);
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/^Unauthorized/) });
    expect(result).not.toHaveProperty('temporaryPassword');
    expectNoWrites();
  });

  test.each(['SUPER_ADMIN', 'super admin', 'SYSTEM_ADMIN', 'ADMIN'])('refuses a project director creating a %s account', async (role) => {
    asActor('PROJECT_DIRECTOR');
    const result = await createUser({ ...newUser, role });
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/^Unauthorized/) });
    expectNoWrites();
  });
});

describe('updateUser action', () => {
  const target = { id: 'user-1', email: 'user@example.com', role: 'SITE_ENGINEER' };
  const changes = { name: 'Renamed', email: target.email, role: 'SITE_ENGINEER' };

  test('never writes a password supplied alongside the profile fields', async () => {
    asActor('SUPER_ADMIN');
    mockDb.user.findUnique.mockImplementation(async ({ where }: any) => (where.id === target.id || where.email === target.email) ? target : null);
    const result = await updateUser(target.id, { ...changes, password: randomPassword() } as any);

    expect(result).toEqual({ success: true });
    const { data } = mockDb.user.update.mock.calls[0][0];
    expect(data).toEqual({ name: 'Renamed', email: target.email, role: 'SITE_ENGINEER' });
  });

  test('is refused for a non-admin, including promoting themselves', async () => {
    asActor('SITE_ENGINEER');
    const result = await updateUser('actor-1', { ...changes, role: 'SUPER_ADMIN' });
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/^Unauthorized/) });
    expectNoWrites();
  });

  test('refuses a project director changing an administrator', async () => {
    asActor('PROJECT_DIRECTOR');
    mockDb.user.findUnique.mockResolvedValue({ ...target, role: 'SUPER_ADMIN' });
    const result = await updateUser(target.id, changes);
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/^Unauthorized/) });
    expectNoWrites();
  });

  test('refuses a project director promoting someone to administrator', async () => {
    asActor('PROJECT_DIRECTOR');
    mockDb.user.findUnique.mockResolvedValue(target);
    const result = await updateUser(target.id, { ...changes, role: 'SYSTEM_ADMIN' });
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/^Unauthorized/) });
    expectNoWrites();
  });
});

describe('resetUserPassword action', () => {
  const target = { id: 'user-1', email: 'user@example.com', role: 'SITE_ENGINEER' };

  test('hashes, clears the legacy column, forces a change and revokes access in one transaction', async () => {
    asActor('PROJECT_DIRECTOR');
    mockDb.user.findUnique.mockResolvedValue(target);
    const password = randomPassword();

    await expect(resetUserPassword(target.id, password)).resolves.toEqual({ success: true });

    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
    const { where, data } = mockTx.user.update.mock.calls[0][0];
    expect(where).toEqual({ id: target.id });
    expect(data).toMatchObject({ password: null, mustChangePassword: true, sessionVersion: { increment: 1 } });
    await expect(bcrypt.compare(password, data.passwordHash)).resolves.toBe(true);
    expect(mockTx.passwordRecoveryToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: target.id, consumedAt: null, revokedAt: null },
    }));
  });

  test('audits the reset and session revocation without recording the credential', async () => {
    asActor('SUPER_ADMIN');
    mockDb.user.findUnique.mockResolvedValue(target);
    const password = randomPassword();
    await resetUserPassword(target.id, password);

    const audits = mockTx.auditLog.create.mock.calls.map(([args]) => args.data);
    expect(audits.map((audit) => audit.actionType)).toEqual(['PASSWORD_RESET_COMPLETED', 'USER_SESSIONS_REVOKED']);
    expect(audits[0]).toMatchObject({ userId: 'actor-1', userRole: 'SUPER_ADMIN', transactionId: target.id });
    const { passwordHash } = mockTx.user.update.mock.calls[0][0].data;
    expect(JSON.stringify(audits)).not.toContain(password);
    expect(JSON.stringify(audits)).not.toContain(passwordHash);
  });

  test.each([
    ['too short', () => randomBytes(4).toString('hex')],
    ['past the bcrypt limit', () => randomBytes(40).toString('hex')],
    ['equal to the email', () => 'long.address.user@example.com'],
  ])('rejects a password that is %s', async (_label, makePassword) => {
    asActor('SUPER_ADMIN');
    mockDb.user.findUnique.mockResolvedValue({ ...target, email: 'long.address.user@example.com' });
    const result = await resetUserPassword(target.id, makePassword());
    expect(result.success).toBe(false);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  test.each(['SUPER_ADMIN', 'SYSTEM_ADMIN', 'ADMIN'])('refuses a project director resetting a %s', async (role) => {
    asActor('PROJECT_DIRECTOR');
    mockDb.user.findUnique.mockResolvedValue({ ...target, role });
    const result = await resetUserPassword(target.id, randomPassword());
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/^Unauthorized/) });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  test('refuses a system admin resetting a super admin', async () => {
    asActor('SYSTEM_ADMIN');
    mockDb.user.findUnique.mockResolvedValue({ ...target, role: 'SUPER_ADMIN' });
    const result = await resetUserPassword(target.id, randomPassword());
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/^Unauthorized/) });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  test.each([
    ['a non-admin role', () => asActor('SITE_ENGINEER')],
    ['an admin who must change their own password', () => asActor('SUPER_ADMIN', true)],
  ])('is refused for %s', async (_label, arrange) => {
    arrange();
    const result = await resetUserPassword(target.id, randomPassword());
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/^Unauthorized/) });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});

describe('credential helpers', () => {
  test('a super admin can manage every role and nobody else can manage administrators', () => {
    expect(canManageAccountRole('SUPER_ADMIN', 'SUPER_ADMIN')).toBe(true);
    expect(canManageAccountRole('SYSTEM_ADMIN', 'SITE_ENGINEER')).toBe(true);
    expect(canManageAccountRole('SYSTEM_ADMIN', 'SYSTEM_ADMIN')).toBe(false);
    expect(canManageAccountRole('SITE_ENGINEER', 'SITE_ENGINEER')).toBe(false);
  });

  test('temporary passwords have 144 bits of randomness', () => {
    expect(Buffer.from(generateTemporaryPassword(), 'base64url')).toHaveLength(18);
  });
});

describe('backend routes', () => {
  let server: Server;
  let origin: string;
  const post = (path: string, body: unknown) => fetch(`${origin}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    // Test-only stand-in for the signed backend authentication middleware.
    app.use((req, _res, next) => { Object.assign(req, { user: { id: 'actor-1', role: 'SUPER_ADMIN' } }); next(); });
    app.use('/api/user', userRouter);
    app.use('/api/profile', profileRouter);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

  test('createUser stores a hash of the returned one-time password and forces a change', async () => {
    const response = await post('/api/user/createUser', newUser);
    const body = await response.json();

    expect(response.status).toBe(200);
    const { data } = mockTx.user.create.mock.calls[0][0];
    expect(data).toMatchObject({ ...newUser, mustChangePassword: true });
    expect(data).not.toHaveProperty('password');
    await expect(bcrypt.compare(body.temporaryPassword, data.passwordHash)).resolves.toBe(true);
    expect(mockTx.auditLog.create.mock.calls[0][0].data).toMatchObject({ userId: 'actor-1', actionType: 'USER_CREATED' });
  });

  test('updateUser rejects a password before changing anything', async () => {
    const response = await post('/api/user/updateUser', { id: 'user-1', data: { ...newUser, password: randomPassword() } });
    expect(response.status).toBe(400);
    expectNoWrites();
  });

  test('updateUser without a password changes only the profile fields', async () => {
    const response = await post('/api/user/updateUser', { id: 'user-1', data: newUser });
    expect(response.status).toBe(200);
    expect(mockDb.user.update.mock.calls[0][0].data).toEqual(newUser);
  });

  test('resetUserPassword hashes, forces a change and audits', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'user@example.com', role: 'SITE_ENGINEER' });
    const password = randomPassword();
    const response = await post('/api/user/resetUserPassword', { targetUserId: 'user-1', newPasswordRaw: password });

    expect(response.status).toBe(200);
    const { data } = mockTx.user.update.mock.calls[0][0];
    expect(data).toMatchObject({ password: null, mustChangePassword: true, sessionVersion: { increment: 1 } });
    await expect(bcrypt.compare(password, data.passwordHash)).resolves.toBe(true);
    expect(mockTx.auditLog.create).toHaveBeenCalledTimes(2);
  });

  test('resetUserPassword applies the password policy', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'user@example.com', role: 'SITE_ENGINEER' });
    const response = await post('/api/user/resetUserPassword', { targetUserId: 'user-1', newPasswordRaw: randomBytes(4).toString('hex') });
    expect(response.status).toBe(400);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  test('updateProfile refuses a password and leaves the account unchanged', async () => {
    const password = randomPassword();
    const response = await post('/api/profile/updateProfile', {
      userId: 'user-1', name: 'Name', email: 'user@example.com', password, confirmPassword: password,
    });
    expect(response.status).toBe(400);
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });

  test('updateProfile without a password changes only name and email', async () => {
    const response = await post('/api/profile/updateProfile', { userId: 'user-1', name: 'Name', email: 'user@example.com' });
    expect(response.status).toBe(200);
    expect(mockDb.user.update.mock.calls[0][0].data).toEqual({ name: 'Name', email: 'user@example.com' });
  });
});

describe('sources', () => {
  // Writing null to clear the column stays allowed until the column is dropped.
  const LEGACY_WRITE = /\bpassword\s*:\s*(?!null\b)['"`\w]|\.password\s*=[^=]/;

  test.each([
    ['src', 'app', 'actions', 'user.ts'],
    ['src', 'lib', 'user-credentials.ts'],
    ['apps', 'aws-backend', 'src', 'routes', 'user.ts'],
    ['apps', 'aws-backend', 'src', 'routes', 'profile.ts'],
  ])('%s/%s/%s writes nothing to the legacy password column', (...parts) => {
    expect(repoFile(...parts)).not.toMatch(LEGACY_WRITE);
  });

  test('the edit form sends passwords only through the audited reset', () => {
    const form = repoFile('src', 'app', 'users', '[id]', 'EditUserClient.tsx');
    expect(form).toContain('resetUserPassword(user.id, newPassword)');
    expect(form).not.toMatch(/name="password"/);
    expect(form).toMatch(/updateUser\(user\.id, \{ \.\.\.formData, role: finalRole \}\)/);
    expect(form).not.toMatch(/useState\(\{[^}]*password/s);
  });

  test('the profile form has no password input', () => {
    expect(repoFile('src', 'app', 'profile', 'ProfileForm.tsx')).not.toMatch(/name="(password|confirmPassword)"/);
  });
});
