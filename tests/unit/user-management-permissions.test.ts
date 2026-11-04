const mockDb = {
  user: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
  systemRole: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  role: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  module: { findMany: jest.fn() },
  rolePermission: { findMany: jest.fn() },
  project: { findMany: jest.fn() },
};

jest.mock('@/lib/prisma', () => ({ prisma: mockDb }));
jest.mock('@/lib/prisma-base', () => ({ prismaBase: mockDb }));
jest.mock('../../apps/aws-backend/src/lib/prisma', () => ({ prisma: mockDb }));
jest.mock('@/lib/permissions', () => ({ requirePermission: jest.fn() }));
jest.mock('@/lib/dal/auth', () => ({ verifySession: jest.fn() }));
jest.mock('@/auth', () => ({ signOut: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
  notFound: jest.fn(() => { throw new Error('NOT_FOUND'); }),
}));
jest.mock('next/headers', () => ({ cookies: jest.fn(async () => ({ get: jest.fn() })) }));
jest.mock('@/lib/backend-token', () => ({ verifyBackendToken: jest.fn() }));
jest.mock('@/lib/backend-fetch', () => ({ backendFetch: jest.fn() }));
jest.mock('@/app/users/page.module.css', () => ({}));
jest.mock('@/app/users/AddUserButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/users/ManageRolesButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/users/DeleteUserButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/users/[id]/EditUserClient', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/users/[id]/UserTabs', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/users/[id]/ProjectAccessClient', () => ({ __esModule: true, default: () => null }));

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import {
  createSystemRole,
  deleteSystemRole,
  deleteUser,
  getSystemRoles,
  updateSystemRole,
} from '@/app/actions/user';
import { updateProfile } from '@/app/actions/profile';
import UsersPage from '@/app/users/page';
import EditUserPage from '@/app/users/[id]/page';
import { backendFetch } from '@/lib/backend-fetch';
import { verifyBackendToken } from '@/lib/backend-token';
import { verifySession } from '@/lib/dal/auth';
import { createRequireAuth } from '../../apps/aws-backend/src/middleware/auth';
import profileRouter from '../../apps/aws-backend/src/routes/profile';

const asActor = (role: string, mustChangePassword = false) =>
  (verifySession as jest.Mock).mockResolvedValue({ id: 'actor-1', role, mustChangePassword });
const refusedActors: [string, () => void][] = [
  ['no session', () => (verifySession as jest.Mock).mockResolvedValue(null)],
  ['a non-admin role', () => asActor('SITE_ENGINEER')],
  ['an administrator role outside the user admin set', () => asActor('ADMINISTRATOR')],
  ['an admin who must change their own password', () => asActor('SUPER_ADMIN', true)],
];

function expectNoRoleOrUserWrites() {
  expect(mockDb.user.delete).not.toHaveBeenCalled();
  expect(mockDb.systemRole.create).not.toHaveBeenCalled();
  expect(mockDb.systemRole.update).not.toHaveBeenCalled();
  expect(mockDb.systemRole.delete).not.toHaveBeenCalled();
  expect(mockDb.role.create).not.toHaveBeenCalled();
  expect(mockDb.role.update).not.toHaveBeenCalled();
  expect(mockDb.role.delete).not.toHaveBeenCalled();
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const table of Object.values(mockDb)) {
    for (const method of Object.values(table)) (method as jest.Mock).mockReset();
  }
  mockDb.user.findMany.mockResolvedValue([]);
  mockDb.systemRole.findMany.mockResolvedValue([]);
  mockDb.role.findMany.mockResolvedValue([]);
  mockDb.module.findMany.mockResolvedValue([]);
  mockDb.rolePermission.findMany.mockResolvedValue([]);
  mockDb.project.findMany.mockResolvedValue([]);
});

describe('deleteUser action', () => {
  test.each(refusedActors)('is refused for %s', async (_label, arrange) => {
    arrange();
    const result = await deleteUser('user-1');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^Unauthorized/);
    expect(mockDb.user.findUnique).not.toHaveBeenCalled();
    expectNoRoleOrUserWrites();
  });

  test('lets a user admin delete an ordinary account', async () => {
    asActor('PROJECT_DIRECTOR');
    mockDb.user.findUnique.mockResolvedValue({ role: 'SITE_ENGINEER' });

    await expect(deleteUser('user-1')).resolves.toEqual({ success: true });
    expect(mockDb.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  test.each(['SUPER_ADMIN', 'SYSTEM_ADMIN', 'ADMIN'])('only a SUPER_ADMIN can delete a %s account', async (targetRole) => {
    asActor('PROJECT_DIRECTOR');
    mockDb.user.findUnique.mockResolvedValue({ role: targetRole });
    const refused = await deleteUser('user-1');

    expect(refused.error).toMatch(/Only a Super Admin/);
    expect(mockDb.user.delete).not.toHaveBeenCalled();

    asActor('SUPER_ADMIN');
    await expect(deleteUser('user-1')).resolves.toEqual({ success: true });
    expect(mockDb.user.delete).toHaveBeenCalledTimes(1);
  });

  test('reports a missing account without deleting anything', async () => {
    asActor('SUPER_ADMIN');
    mockDb.user.findUnique.mockResolvedValue(null);

    await expect(deleteUser('missing')).resolves.toEqual({ success: false, error: 'Target user not found.' });
    expect(mockDb.user.delete).not.toHaveBeenCalled();
  });
});

describe('role actions', () => {
  const roleActions: [string, () => Promise<{ success: boolean; error?: string }>][] = [
    ['createSystemRole', () => createSystemRole('NEW_ROLE')],
    ['updateSystemRole', () => updateSystemRole('OLD_ROLE', 'NEW_ROLE')],
    ['deleteSystemRole', () => deleteSystemRole('OLD_ROLE')],
  ];

  describe.each(roleActions)('%s', (_name, run) => {
    test.each(refusedActors)('is refused for %s', async (_label, arrange) => {
      arrange();
      const result = await run();

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/^Unauthorized/);
      expectNoRoleOrUserWrites();
    });

    test('works for a user admin on an ordinary role', async () => {
      asActor('PROJECT_DIRECTOR');
      mockDb.systemRole.findUnique.mockResolvedValue(null);
      mockDb.role.findFirst.mockResolvedValue(null);

      await expect(run()).resolves.toMatchObject({ success: true });
    });
  });

  test.each([
    ['create', () => createSystemRole('super admin')],
    ['rename from', () => updateSystemRole('SYSTEM_ADMIN', 'ANYTHING')],
    ['rename to', () => updateSystemRole('SITE_ENGINEER', 'super admin')],
    ['delete', () => deleteSystemRole('ADMIN')],
  ])('only a SUPER_ADMIN can %s an administrator role', async (_label, run) => {
    asActor('PROJECT_DIRECTOR');
    mockDb.systemRole.findUnique.mockResolvedValue(null);
    mockDb.role.findFirst.mockResolvedValue(null);
    const refused = await run();

    expect(refused.error).toMatch(/Only a Super Admin/);
    expectNoRoleOrUserWrites();

    asActor('SUPER_ADMIN');
    await expect(run()).resolves.toMatchObject({ success: true });
  });
});

describe('getSystemRoles action', () => {
  test.each(refusedActors)('returns nothing and writes nothing for %s', async (_label, arrange) => {
    arrange();
    mockDb.systemRole.findMany.mockResolvedValue([{ name: 'UNSYNCED' }]);
    mockDb.role.findFirst.mockResolvedValue(null);

    await expect(getSystemRoles()).resolves.toEqual([]);
    expect(mockDb.systemRole.findMany).not.toHaveBeenCalled();
    expect(mockDb.role.create).not.toHaveBeenCalled();
  });

  test('lists and syncs roles for a user admin', async () => {
    asActor('SYSTEM_ADMIN');
    mockDb.systemRole.findMany.mockResolvedValue([{ name: 'UNSYNCED' }]);
    mockDb.role.findFirst.mockResolvedValue(null);

    await expect(getSystemRoles()).resolves.toEqual(['UNSYNCED']);
    expect(mockDb.role.create).toHaveBeenCalledTimes(1);
  });
});

describe('Users pages', () => {
  const pages: [string, () => Promise<unknown>][] = [
    ['/users', () => UsersPage()],
    ['/users/[id]', () => EditUserPage({ params: Promise.resolve({ id: 'user-1' }) })],
  ];

  describe.each(pages)('%s', (_path, render) => {
    test.each([
      ['no session', () => (verifySession as jest.Mock).mockResolvedValue(null), '/login'],
      ['an admin who must change their own password', () => asActor('SUPER_ADMIN', true), '/change-password'],
      ['a non-admin role', () => asActor('SITE_ENGINEER'), '/'],
      ['an administrator role outside the user admin set', () => asActor('ADMINISTRATOR'), '/'],
    ] as [string, () => void, string][])('redirects %s before reading any user', async (_label, arrange, target) => {
      arrange();

      await expect(render()).rejects.toThrow(`REDIRECT:${target}`);
      expect(mockDb.user.findMany).not.toHaveBeenCalled();
      expect(mockDb.user.findUnique).not.toHaveBeenCalled();
    });

    test.each(['SUPER_ADMIN', 'SYSTEM_ADMIN', 'PROJECT_DIRECTOR'])('renders for %s', async (role) => {
      asActor(role);
      mockDb.user.findUnique.mockResolvedValue({
        id: 'user-1', name: 'Name', email: 'user@example.com', role: 'SITE_ENGINEER', projectAssignments: [],
      });

      await expect(render()).resolves.toBeTruthy();
    });
  });
});

describe('updateProfile', () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    // Test-only stand-in for the signed backend authentication middleware.
    app.use((req, _res, next) => {
      const actorId = req.headers['x-test-actor'];
      if (actorId) Object.assign(req, { user: { id: actorId, role: 'SITE_ENGINEER' } });
      next();
    });
    app.use('/api/profile', profileRouter);
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

  const post = (body: unknown, actorId?: string) => fetch(`${origin}/api/profile/updateProfile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(actorId ? { 'x-test-actor': actorId } : {}) },
    body: JSON.stringify(body),
  });

  test('updates the signed-in user even when the body names another user', async () => {
    const response = await post({ userId: 'victim-1', name: 'Name', email: 'user@example.com' }, 'actor-1');

    expect(response.status).toBe(200);
    expect(mockDb.user.update).toHaveBeenCalledTimes(1);
    expect(mockDb.user.update.mock.calls[0][0].where).toEqual({ id: 'actor-1' });
  });

  test('refuses a request with no authenticated user, whatever the body says', async () => {
    const response = await post({ userId: 'victim-1', name: 'Name', email: 'user@example.com' });

    expect(response.status).toBe(401);
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });

  test('the action does not send a user id to the backend', async () => {
    asActor('SITE_ENGINEER');
    (backendFetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ success: false }) });
    const form = new FormData();
    form.set('name', 'Name');
    form.set('email', 'user@example.com');

    await updateProfile(form);

    const [, options] = (backendFetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ name: 'Name', email: 'user@example.com' });
  });
});

describe('backend authentication of /api/user', () => {
  const store = { user: { findUnique: jest.fn() } };
  const requireAuth = createRequireAuth(store);

  async function run(role: string, path: string) {
    (verifyBackendToken as jest.Mock).mockReturnValue({ userId: 'actor-1', sessionVersion: 1 });
    store.user.findUnique.mockResolvedValue({
      id: 'actor-1', role, status: 'ACTIVE', sessionVersion: 1, mustChangePassword: false, lockedUntil: null,
    });
    const next = jest.fn();
    const res: any = { status: jest.fn(() => res), json: jest.fn(() => res) };
    await requireAuth({ headers: { authorization: 'Bearer token' }, method: 'POST', originalUrl: path, body: {} } as any, res, next);
    return { next, res };
  }

  test('getSystemRoles has no exception from the SUPER_ADMIN limit', async () => {
    const { next, res } = await run('SITE_ENGINEER', '/api/user/getSystemRoles');

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('a SUPER_ADMIN still reaches it', async () => {
    const { next } = await run('SUPER_ADMIN', '/api/user/getSystemRoles');
    expect(next).toHaveBeenCalledTimes(1);
  });
});
