jest.mock('../../apps/aws-backend/src/jobs/boqWorker', () => ({ runBoqUploadJob: jest.fn() }));
jest.mock('../../apps/aws-backend/src/lib/permissions', () => ({ hasPermission: jest.fn(), getPermissionsForRole: jest.fn() }));
jest.mock('../../apps/aws-backend/src/lib/prisma', () => ({ prisma: { projectUserAssignment: { findUnique: jest.fn() } } }));

import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import router, { jobStore } from '../../apps/aws-backend/src/routes/jobs';
import { runBoqUploadJob } from '../../apps/aws-backend/src/jobs/boqWorker';
import { hasPermission, getPermissionsForRole } from '../../apps/aws-backend/src/lib/permissions';
import { prisma } from '../../apps/aws-backend/src/lib/prisma';
import { MAX_BOQ_UPLOAD_BYTES } from '@/lib/boq/upload-input';

let server: Server;
let origin: string;
const payload = { projectId: 'project-1', fileName: 'BOQ.xlsx', fileBufferBase64: Buffer.from('xlsx fixture').toString('base64') };

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use((req, _res, next) => {
    // Test-only stand-in for signed backend authentication, never client headers in production.
    if (req.headers['x-test-actor']) Object.assign(req, {
      user: { id: req.headers['x-test-actor'], role: 'ENGINEER' },
      pbacContext: { simulatedRole: req.headers['x-test-simulation'] },
    });
    next();
  });
  app.use('/api/jobs', router);
  server = await new Promise<Server>(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/jobs`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

beforeEach(() => {
  jest.resetAllMocks();
  jobStore.clear();
  (hasPermission as jest.Mock).mockResolvedValue(true);
  (prisma.projectUserAssignment.findUnique as jest.Mock).mockResolvedValue(null);
  (runBoqUploadJob as jest.Mock).mockResolvedValue({ success: true, uploadId: 'upload-1', status: 'DRAFT_UPLOADED', report: {} });
});

function post(body: Record<string, unknown> = payload, actor = 'actor-1', simulation?: string) {
  return fetch(`${origin}/boq-upload`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(actor ? { 'x-test-actor': actor } : {}), ...(simulation ? { 'x-test-simulation': simulation } : {}) },
    body: JSON.stringify(body),
  });
}

test('requires authentication for both dispatch and status reads', async () => {
  expect((await post(payload, '')).status).toBe(401);
  expect((await fetch(`${origin}/any-job`)).status).toBe(401);
  expect(runBoqUploadJob).not.toHaveBeenCalled();
});

test('requires canEditDraft for existing projects and preserves dispatch/status response contracts', async () => {
  const response = await post();
  const dispatch = await response.json();
  expect(response.status).toBe(200);
  expect(dispatch).toEqual({ success: true, status: 'PROCESSING', jobId: expect.stringMatching(/^boq-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/) });
  expect(hasPermission).toHaveBeenCalledWith('actor-1', 'PROJECT_MANAGEMENT', 'canEditDraft', undefined);
  expect(runBoqUploadJob).toHaveBeenCalledWith(dispatch.jobId, 'project-1', payload.fileBufferBase64, 'BOQ.xlsx', expect.objectContaining({ id: 'actor-1' }));
  const status = await fetch(`${origin}/${dispatch.jobId}`, { headers: { 'x-test-actor': 'actor-1' } });
  expect(await status.json()).toEqual({ success: true, status: 'COMPLETED', result: expect.objectContaining({ uploadId: 'upload-1' }) });
});

test.each([null, '', undefined])('requires canCreate for new projects (%s)', async projectId => {
  expect((await post({ ...payload, projectId })).status).toBe(200);
  expect(hasPermission).toHaveBeenCalledWith('actor-1', 'PROJECT_MANAGEMENT', 'canCreate', undefined);
});

test('denies new-project creation when global canCreate is absent', async () => {
  (hasPermission as jest.Mock).mockResolvedValue(false);
  expect((await post({ ...payload, projectId: null })).status).toBe(403);
  expect(prisma.projectUserAssignment.findUnique).not.toHaveBeenCalled();
  expect(runBoqUploadJob).not.toHaveBeenCalled();
});

test('allows existing projects through active assignment role permission', async () => {
  (hasPermission as jest.Mock).mockResolvedValue(false);
  (prisma.projectUserAssignment.findUnique as jest.Mock).mockResolvedValue({ assignmentStatus: 'active', projectRole: 'PROJECT_ENGINEER' });
  (getPermissionsForRole as jest.Mock).mockResolvedValue({ PROJECT_MANAGEMENT: { canEditDraft: true } });
  expect((await post()).status).toBe(200);
  expect(prisma.projectUserAssignment.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_projectId: { userId: 'actor-1', projectId: 'project-1' } } }));
  expect(getPermissionsForRole).toHaveBeenCalledWith('PROJECT_ENGINEER');
});

test.each(['inactive', 'removed'])('denies %s project assignments', async assignmentStatus => {
  (hasPermission as jest.Mock).mockResolvedValue(false);
  (prisma.projectUserAssignment.findUnique as jest.Mock).mockResolvedValue({ assignmentStatus, projectRole: 'PROJECT_ENGINEER' });
  expect((await post()).status).toBe(403);
  expect(runBoqUploadJob).not.toHaveBeenCalled();
});

test('requires assigned role canEditDraft rather than view-only permission', async () => {
  (hasPermission as jest.Mock).mockResolvedValue(false);
  (prisma.projectUserAssignment.findUnique as jest.Mock).mockResolvedValue({ assignmentStatus: 'active', projectRole: 'VIEWER' });
  (getPermissionsForRole as jest.Mock).mockResolvedValue({ PROJECT_MANAGEMENT: { canView: true, canEditDraft: false } });
  expect((await post()).status).toBe(403);
  expect(runBoqUploadJob).not.toHaveBeenCalled();
});

test('honors signed simulated role without falling back to actual assignments', async () => {
  (hasPermission as jest.Mock).mockResolvedValue(false);
  expect((await post(payload, 'actor-1', 'GUEST_USER')).status).toBe(403);
  expect(hasPermission).toHaveBeenCalledWith('actor-1', 'PROJECT_MANAGEMENT', 'canEditDraft', 'GUEST_USER');
  expect(prisma.projectUserAssignment.findUnique).not.toHaveBeenCalled();
});

test('conceals another actor job result and owner metadata', async () => {
  const { jobId } = await (await post()).json();
  const denied = await fetch(`${origin}/${jobId}`, { headers: { 'x-test-actor': 'other-actor' } });
  expect(denied.status).toBe(404);
  expect(await denied.json()).toEqual({ success: false, error: 'Job not found' });
});

test.each([
  { ...payload, projectId: { id: 'project-1' } },
  { ...payload, projectId: '../other' },
  { ...payload, fileName: 'BOQ.xls' },
  { ...payload, fileName: '../BOQ.xlsx' },
  { ...payload, fileBufferBase64: '' },
  { ...payload, fileBufferBase64: '!!!!' },
  { ...payload, fileBufferBase64: 'YQ=' },
  { ...payload, fileBufferBase64: 'YR==' },
])('rejects invalid dispatch data before starting a worker: %j', async body => {
  expect((await post(body)).status).toBe(400);
  expect(runBoqUploadJob).not.toHaveBeenCalled();
});

test('enforces the decoded 8 MiB boundary even when base64 lengths are equal', async () => {
  expect((await post({ ...payload, fileBufferBase64: Buffer.alloc(MAX_BOQ_UPLOAD_BYTES + 1).toString('base64') })).status).toBe(400);
  expect(runBoqUploadJob).not.toHaveBeenCalled();
  expect((await post({ ...payload, fileBufferBase64: Buffer.alloc(MAX_BOQ_UPLOAD_BYTES).toString('base64') })).status).toBe(200);
});

test('represents worker validation failures as FAILED status without a success result', async () => {
  (runBoqUploadJob as jest.Mock).mockResolvedValue({ success: false, error: 'Missing required BOQ headers' });
  const { jobId } = await (await post()).json();
  const status = await fetch(`${origin}/${jobId}`, { headers: { 'x-test-actor': 'actor-1' } });
  expect(await status.json()).toEqual({ success: true, status: 'FAILED', error: 'Missing required BOQ headers' });
});

test('converts rejected workers to a safe FAILED status', async () => {
  (runBoqUploadJob as jest.Mock).mockRejectedValue(new Error('Private database diagnostics'));
  const { jobId } = await (await post()).json();
  const status = await fetch(`${origin}/${jobId}`, { headers: { 'x-test-actor': 'actor-1' } });
  expect(await status.json()).toEqual({ success: true, status: 'FAILED', error: 'Failed to process BOQ upload.' });
});

test('expires completed metadata while retaining active jobs', async () => {
  jobStore.set('expired', { ownerId: 'actor-1', status: 'FAILED', error: 'Old error', completedAt: Date.now() - 16 * 60 * 1000 });
  jobStore.set('active', { ownerId: 'actor-1', status: 'PROCESSING' });
  expect((await fetch(`${origin}/expired`, { headers: { 'x-test-actor': 'actor-1' } })).status).toBe(404);
  expect(jobStore.has('active')).toBe(true);
});

test('bounds completed retention and rejects excess concurrent processing', async () => {
  for (let index = 0; index < 105; index++) jobStore.set(`done-${index}`, { ownerId: 'actor-1', status: 'COMPLETED', completedAt: Date.now() });
  await fetch(`${origin}/missing`, { headers: { 'x-test-actor': 'actor-1' } });
  expect(jobStore.size).toBe(100);
  jobStore.clear();
  for (let index = 0; index < 4; index++) jobStore.set(`active-${index}`, { ownerId: 'actor-1', status: 'PROCESSING' });
  expect((await post()).status).toBe(503);
  expect(runBoqUploadJob).not.toHaveBeenCalled();
});
