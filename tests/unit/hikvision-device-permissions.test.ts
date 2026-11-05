// Only the database is mocked: requests pass through the real requireAuth and lib/permissions.ts.
jest.mock('../../apps/aws-backend/src/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findFirst: jest.fn() },
    userRole: { findMany: jest.fn() },
    role: { findFirst: jest.fn() },
    hikvisionDevice: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
  },
}));
jest.mock('@/lib/backend-fetch', () => ({ backendFetch: jest.fn() }));

import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { prisma } from '../../apps/aws-backend/src/lib/prisma';
import { requireAuth } from '../../apps/aws-backend/src/middleware/auth';
import hikvision from '../../apps/aws-backend/src/routes/hikvisionDeviceService';
import { createBackendToken } from '../../src/lib/backend-token';
import { backendFetch } from '@/lib/backend-fetch';
import {
  getHikvisionDevices,
  registerHikvisionDevice,
  testDeviceConnection,
} from '../../src/app/actions/hikvisionDeviceService';

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const backendFetchMock = backendFetch as jest.Mock;
const PREFIX = '/api/hikvisionDeviceService';

// Each user holds one role; the role's EQUIPMENT row decides what they may do.
const EQUIPMENT_RIGHTS: Record<string, { canView: boolean; canCreate: boolean } | null> = {
  EQUIPMENT_MANAGER: { canView: true, canCreate: true },
  PROJECT_MANAGER: { canView: true, canCreate: false },
  ACCOUNTANT: null,
  GUEST_USER: null,
  SUPER_ADMIN: null,
};
const userRole = (userId: string) => userId.replace('user-', '');

let server: Server;
let base: string;
const previousSecret = process.env.BACKEND_INTERNAL_SECRET;

beforeAll(async () => {
  process.env.BACKEND_INTERNAL_SECRET = 'test-secret-with-at-least-32-characters';
  const app = express();
  app.use(express.json());
  app.use('/api', requireAuth);
  app.use(PREFIX, hikvision);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  process.env.BACKEND_INTERNAL_SECRET = previousSecret;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  db.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
    role: userRole(where.id),
    status: 'ACTIVE',
    sessionVersion: 1,
    mustChangePassword: false,
    lockedUntil: null,
  }));
  db.user.findFirst.mockResolvedValue(null);
  db.userRole.findMany.mockResolvedValue([]);
  db.role.findFirst.mockImplementation(async ({ where }: { where: { OR: { roleName: string }[] } }) => {
    const code = where.OR[0].roleName;
    const rights = EQUIPMENT_RIGHTS[code];
    return { roleCode: code, rolePermissions: rights ? [{ moduleName: 'EQUIPMENT', ...rights }] : [] };
  });
  db.hikvisionDevice.findMany.mockResolvedValue([
    { id: 'device-1', passwordEncrypted: 'iv:cipher', rtspUrlEncrypted: null },
  ]);
  db.hikvisionDevice.findUnique.mockResolvedValue(null);
  db.hikvisionDevice.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 'device-2', ...data }));
});

afterEach(() => jest.restoreAllMocks());

async function call(
  route: string,
  userId: string | null,
  body: Record<string, unknown> = {},
  options: { headers?: Record<string, string>; simulatedRole?: string } = {},
) {
  const path = `${PREFIX}/${route}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...options.headers };
  if (userId) {
    const token = createBackendToken({ userId, sessionVersion: 1, method: 'POST', path, simulatedRole: options.simulatedRole });
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

const device = { deviceName: 'Cam 1', deviceSerialNumber: 'SN-1', integrationType: 'DEVICE_GATEWAY', port: '8000' };

describe('Hikvision device routes refuse users without the right', () => {
  test.each(['getHikvisionDevices', 'registerHikvisionDevice', 'testDeviceConnection'])(
    '%s refuses a role with no EQUIPMENT rights',
    async (route) => {
      const result = await call(route, 'user-ACCOUNTANT', { data: device, deviceId: 'device-1' });
      expect(result.status).toBe(403);
      expect(result.body.success).toBe(false);
      expect(result.body.error).toContain('EQUIPMENT');
      expect(db.hikvisionDevice.findMany).not.toHaveBeenCalled();
      expect(db.hikvisionDevice.findUnique).not.toHaveBeenCalled();
      expect(db.hikvisionDevice.create).not.toHaveBeenCalled();
    },
  );

  test.each(['getHikvisionDevices', 'registerHikvisionDevice', 'testDeviceConnection'])(
    '%s needs a signed backend credential',
    async (route) => {
      const result = await call(route, null, { userId: 'user-SUPER_ADMIN', data: device, deviceId: 'device-1' });
      expect(result.status).toBe(401);
    },
  );

  test('a role that can view may not register a device', async () => {
    const result = await call('registerHikvisionDevice', 'user-PROJECT_MANAGER', { data: device });
    expect(result.status).toBe(403);
    expect(db.hikvisionDevice.create).not.toHaveBeenCalled();
  });

  test('a guest may view but not register', async () => {
    expect((await call('getHikvisionDevices', 'user-GUEST_USER')).status).toBe(200);
    expect((await call('registerHikvisionDevice', 'user-GUEST_USER', { data: device })).status).toBe(403);
  });

  test('an admin simulating a view-only role is held to that role', async () => {
    const result = await call('registerHikvisionDevice', 'user-SUPER_ADMIN', { data: device }, { simulatedRole: 'PROJECT_MANAGER' });
    expect(result.status).toBe(403);
    expect(db.hikvisionDevice.create).not.toHaveBeenCalled();
  });

  test('a database failure during the check is not reported as a refusal', async () => {
    db.userRole.findMany.mockRejectedValue(new Error('database down'));
    const result = await call('getHikvisionDevices', 'user-PROJECT_MANAGER');
    expect(result.status).toBe(500);
  });

  test('the router refuses a request that reached it without a verified user', async () => {
    const bare = express();
    bare.use(express.json());
    bare.use(PREFIX, hikvision);
    const bareServer = bare.listen(0, '127.0.0.1');
    await new Promise((resolve) => bareServer.once('listening', resolve));
    const url = `http://127.0.0.1:${(bareServer.address() as AddressInfo).port}${PREFIX}/getHikvisionDevices`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user-SUPER_ADMIN' }),
    });
    await new Promise((resolve) => bareServer.close(resolve));
    expect(response.status).toBe(401);
  });
});

describe('Hikvision device routes take the user from the signed request', () => {
  test('a userId in the body does not lend another user\'s rights', async () => {
    const result = await call('registerHikvisionDevice', 'user-ACCOUNTANT', { userId: 'user-SUPER_ADMIN', data: device });
    expect(result.status).toBe(403);
    expect(db.hikvisionDevice.create).not.toHaveBeenCalled();
  });

  test('forged identity headers do not lend another user\'s rights', async () => {
    const result = await call('getHikvisionDevices', 'user-ACCOUNTANT', {}, {
      headers: { 'x-user-session': 'user-SUPER_ADMIN', 'x-simulated-role': 'SUPER_ADMIN' },
    });
    expect(result.status).toBe(403);
    expect(db.hikvisionDevice.findMany).not.toHaveBeenCalled();
  });

  test('installedBy records the signed user, not the body', async () => {
    const result = await call('registerHikvisionDevice', 'user-EQUIPMENT_MANAGER', { userId: 'user-SUPER_ADMIN', data: device });
    expect(result.status).toBe(200);
    expect(db.hikvisionDevice.create.mock.calls[0][0].data.installedBy).toBe('user-EQUIPMENT_MANAGER');
  });
});

describe('Hikvision device routes allow users with the right', () => {
  test('canView lists devices with secrets masked', async () => {
    const result = await call('getHikvisionDevices', 'user-PROJECT_MANAGER');
    expect(result.status).toBe(200);
    expect(result.body.data[0].passwordEncrypted).toBe('******');
  });

  test('canView may test a connection', async () => {
    db.hikvisionDevice.findUnique.mockResolvedValue({ id: 'device-1', integrationType: 'DEVICE_GATEWAY' });
    const result = await call('testDeviceConnection', 'user-PROJECT_MANAGER', { deviceId: 'device-1' });
    expect(result.status).toBe(200);
    expect(result.body.data.success).toBe(true);
  });

  test('canCreate registers a device', async () => {
    const result = await call('registerHikvisionDevice', 'user-EQUIPMENT_MANAGER', { data: device });
    expect(result.status).toBe(200);
    expect(db.hikvisionDevice.create).toHaveBeenCalledTimes(1);
    expect(result.body.data.port).toBe(8000);
  });

  test('SUPER_ADMIN holds every right through the admin rule', async () => {
    expect((await call('getHikvisionDevices', 'user-SUPER_ADMIN')).status).toBe(200);
    expect((await call('registerHikvisionDevice', 'user-SUPER_ADMIN', { data: device })).status).toBe(200);
  });
});

describe('Hikvision device server actions', () => {
  const reply = (status: number, body: unknown) => ({ ok: status < 400, status, statusText: '', json: async () => body });
  const sentBody = () => JSON.parse(backendFetchMock.mock.calls[0][1].body);

  beforeEach(() => backendFetchMock.mockResolvedValue(reply(200, { success: true, data: 'result' })));

  test('getHikvisionDevices sends no user id', async () => {
    await expect(getHikvisionDevices()).resolves.toBe('result');
    expect(backendFetchMock.mock.calls[0][0]).toBe(`${PREFIX}/getHikvisionDevices`);
    expect(sentBody()).toEqual({});
  });

  test('registerHikvisionDevice sends only the device', async () => {
    await registerHikvisionDevice(device);
    expect(backendFetchMock.mock.calls[0][0]).toBe(`${PREFIX}/registerHikvisionDevice`);
    expect(sentBody()).toEqual({ data: device });
  });

  test('testDeviceConnection sends only the device id', async () => {
    await testDeviceConnection('device-1');
    expect(backendFetchMock.mock.calls[0][0]).toBe(`${PREFIX}/testDeviceConnection`);
    expect(sentBody()).toEqual({ deviceId: 'device-1' });
  });

  test('a refusal reaches the caller as an error', async () => {
    backendFetchMock.mockResolvedValue(reply(403, { success: false, error: 'Unauthorized Action: no' }));
    await expect(registerHikvisionDevice(device)).rejects.toThrow('Unauthorized Action: no');
  });
});
