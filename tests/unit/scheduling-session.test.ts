jest.mock('@/lib/dal/auth', () => ({ verifySession: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: jest.fn() } } }));
jest.mock('next/headers', () => ({ cookies: jest.fn(async () => ({})) }));
jest.mock('@/lib/permissions', () => ({ hasPermission: jest.fn() }));

import { verifySession } from '@/lib/dal/auth';
import { prisma } from '@/lib/prisma';
import { getSessionActor } from '@/lib/scheduling/authUtils';

const session = verifySession as jest.Mock;
const user = prisma.user.findUnique as jest.Mock;

beforeEach(() => jest.resetAllMocks());

test('rejects an unauthenticated scheduling request', async () => {
  session.mockResolvedValue(null);
  await expect(getSessionActor()).rejects.toThrow('UNAUTHORIZED:');
  expect(user).not.toHaveBeenCalled();
});

test('rejects the current database password-change flag despite a stale client token', async () => {
  session.mockResolvedValue({ id: 'actor', role: 'DIRECTOR', mustChangePassword: true });
  await expect(getSessionActor()).rejects.toThrow('UNAUTHORIZED:');
  expect(user).not.toHaveBeenCalled();
});

test('rejects a password-change requirement set between session and actor reads', async () => {
  session.mockResolvedValue({ id: 'actor', role: 'DIRECTOR', mustChangePassword: false });
  user.mockResolvedValue({ id: 'actor', mustChangePassword: true });
  await expect(getSessionActor()).rejects.toThrow('UNAUTHORIZED:');
});

test('preserves the authorized actor and role', async () => {
  session.mockResolvedValue({ id: 'actor', role: 'DIRECTOR', mustChangePassword: false });
  user.mockResolvedValue({ id: 'actor', role: 'DIRECTOR', name: 'Authorized user', email: 'actor@example.test', mustChangePassword: false });
  await expect(getSessionActor()).resolves.toEqual({ id: 'actor', role: 'DIRECTOR', name: 'Authorized user', email: 'actor@example.test' });
});
