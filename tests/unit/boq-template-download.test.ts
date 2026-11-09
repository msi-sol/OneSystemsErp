jest.mock('@/lib/backend-fetch', () => ({ backendFetch: jest.fn() }));
// A valid Auth.js session must not depend on removed legacy/demo cookies.
jest.mock('next/headers', () => ({ cookies: jest.fn(() => { throw new Error('Legacy cookie access'); }) }));
jest.mock('../../apps/aws-backend/src/lib/prisma', () => ({ prisma: {
  project: { findUnique: jest.fn() },
  user: { findFirst: jest.fn() },
  auditLog: { create: jest.fn() },
} }));

import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import ExcelJS from 'exceljs';
import { backendFetch } from '@/lib/backend-fetch';
import { generateBOQTemplate } from '@/app/actions/boqTemplateService';
import router from '../../apps/aws-backend/src/routes/boqTemplateService';
import { prisma } from '../../apps/aws-backend/src/lib/prisma';

beforeEach(() => jest.resetAllMocks());

test('downloads through the verified backend session without any legacy cookies', async () => {
  const template = { success: true, data: 'UEs=', fileName: 'BOQ_Template_Blank.xlsx' };
  (backendFetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify(template)));
  await expect(generateBOQTemplate()).resolves.toEqual(template);
  expect(backendFetch).toHaveBeenCalledWith('/api/boqTemplateService/generateBOQTemplate', expect.objectContaining({
    method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' },
  }));
});

test('preserves the selected target project without passing a client email identity', async () => {
  (backendFetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({ success: true })));
  await generateBOQTemplate('project-1');
  expect(JSON.parse((backendFetch as jest.Mock).mock.calls[0][1].body)).toEqual({ projectId: 'project-1' });
});

test.each([401, 403])('returns a useful authorization error for HTTP %s', async (status) => {
  (backendFetch as jest.Mock).mockResolvedValue(new Response('{}', { status }));
  await expect(generateBOQTemplate()).resolves.toMatchObject({ success: false, error: expect.stringMatching(/session|authorized/) });
});

describe('template generation and authenticated audit attribution', () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      // Test-only stand-in for the signed backend authentication middleware.
      if (req.headers['x-test-actor'] === 'verified') Object.assign(req, { user: { id: 'verified-actor', role: 'SUPER_ADMIN' } });
      next();
    });
    app.use('/api/boqTemplateService', router);
    server = await new Promise<Server>(resolve => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  test('does not generate or audit a download without an authenticated actor', async () => {
    const response = await fetch(`${origin}/api/boqTemplateService/generateBOQTemplate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'spoofed@example.test' }),
    });
    expect(response.status).toBe(401);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  test('generates the real protected workbook and audits the verified actor', async () => {
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({ id: 'audit-1' });
    const response = await fetch(`${origin}/api/boqTemplateService/generateBOQTemplate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-actor': 'verified' },
      body: JSON.stringify({ email: 'spoofed@example.test' }),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.fileName).toBe('BOQ_Template_Blank.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(result.data, 'base64') as never);
    expect(workbook.getWorksheet('BOQ_DATA_ENTRY')).toBeDefined();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: 'verified-actor', userRole: 'SUPER_ADMIN', actionType: 'TEMPLATE_DOWNLOADED',
    }) });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    // Builds the real protected workbook, which can take several seconds on a busy machine or CI runner.
  }, 30_000);
});
