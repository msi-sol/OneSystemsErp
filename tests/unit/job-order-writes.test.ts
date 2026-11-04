jest.mock('@/lib/backend-fetch', () => ({ backendFetch: jest.fn() }));
jest.mock('@/lib/dal/auth', () => ({ verifySession: jest.fn(async () => ({ id: 'user-1' })) }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn(async () => ({ get: () => undefined })) }));
jest.mock('../../apps/aws-backend/src/lib/permissions', () => ({ requirePermission: jest.fn(async () => undefined) }));
jest.mock('../../apps/aws-backend/src/lib/prisma', () => ({ prisma: {
  jobOrder: { findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  subcontractorBOQItem: { findFirst: jest.fn() },
  bOQMapping: { findMany: jest.fn() },
  $transaction: jest.fn(),
} }));

import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Prisma } from '@prisma/client';
import { backendFetch } from '@/lib/backend-fetch';
import { createJobOrder, deleteJobOrder, unlockJobOrder, updateJobOrder, updateJobOrderStatus } from '@/app/actions/jobOrderActions';
import subcontracting from '../../apps/aws-backend/src/routes/subcontracting';
import jobOrderActions from '../../apps/aws-backend/src/routes/jobOrderActions';
import { requirePermission } from '../../apps/aws-backend/src/lib/permissions';
import { prisma } from '../../apps/aws-backend/src/lib/prisma';
import { parseBoqReferenceIds } from '../../apps/aws-backend/src/lib/jobOrderWrites';

const db = prisma as any;
const jobOrderColumns = new Set(Prisma.dmmf.datamodel.models.find((model) => model.name === 'JobOrder')!.fields.filter((field) => field.kind !== 'object').map((field) => field.name));
const rolePermissionColumns = new Set(Prisma.dmmf.datamodel.models.find((model) => model.name === 'RolePermission')!.fields.map((field) => field.name));

// What JobOrderFormClient posts, plus the fields requireAuth adds to every body.
const formPayload = {
  projectId: 'project-1',
  subcontractorId: 'sub-1',
  jobNumber: 'JO-1',
  boqReferenceIds: ['boq-1', 'boq-2'],
  description: 'Waterproofing',
  jobOrderType: 'LABOR_ONLY',
  location: 'Ground Floor',
  contractAmount: 1000,
  paymentBasis: 'MILESTONE',
  materialResponsibility: 'COMPANY_SUPPLIED',
  startDate: '2026-12-01',
  durationDays: '30',
  completionDate: '2026-12-31',
  sessionId: 'user-1',
  simulatedRole: undefined,
};

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/subcontracting', subcontracting);
  app.use('/api/jobOrderActions', jobOrderActions);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  jest.clearAllMocks();
  (requirePermission as jest.Mock).mockResolvedValue(undefined);
  db.jobOrder.findUnique.mockResolvedValue(null);
  db.jobOrder.findMany.mockResolvedValue([]);
  db.jobOrder.create.mockImplementation(async ({ data }: any) => ({ id: 'jo-1', ...data }));
  db.jobOrder.update.mockImplementation(async ({ data }: any) => ({ id: 'jo-1', contractAmount: 1000, boqReferenceId: '[]', ...data }));
  db.subcontractorBOQItem.findFirst.mockResolvedValue(null);
  db.bOQMapping.findMany.mockResolvedValue([]);
});

const send = (method: string, path: string, body: unknown) => fetch(`${base}${path}`, {
  method, headers: { 'Content-Type': 'application/json', 'x-user-session': 'user-1' }, body: JSON.stringify(body),
});
const existingJobOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'jo-1', projectId: 'project-1', subcontractorId: 'sub-1', boqReferenceId: '["boq-1"]', contractAmount: 1000,
  subcontractAccomplishments: [], subcontractBillings: [], ...overrides,
});

describe('POST /job-orders', () => {
  test('saves the exact form payload using only real JobOrder columns', async () => {
    const res = await send('POST', '/api/subcontracting/job-orders', formPayload);
    expect(res.status).toBe(200);
    const { data } = db.jobOrder.create.mock.calls[0][0];
    expect(Object.keys(data).filter((key) => !jobOrderColumns.has(key))).toEqual([]);
    expect(data).toMatchObject({ jobOrderType: 'LABOR_ONLY', boqReferenceId: '["boq-1","boq-2"]', contractAmount: 1000 });
    expect(data.startDate).toEqual(new Date('2026-12-01'));
  });

  test('accepts an amount above the threshold and reports it without storing it', async () => {
    const res = await send('POST', '/api/subcontracting/job-orders', { ...formPayload, contractAmount: 300000 });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ isThresholdExceeded: true, boqReferenceIds: ['boq-1', 'boq-2'] });
    expect(db.jobOrder.create.mock.calls[0][0].data).not.toHaveProperty('isThresholdExceeded');
  });

  test('never lets the request set the workflow status', async () => {
    await send('POST', '/api/subcontracting/job-orders', { ...formPayload, status: 'APPROVED', approvedBy: 'user-1' });
    const { data } = db.jobOrder.create.mock.calls[0][0];
    expect(data).not.toHaveProperty('status');
    expect(data).not.toHaveProperty('approvedBy');
  });

  test.each([
    ['description', { description: '  ' }],
    ['projectId', { projectId: '' }],
    ['paymentBasis', { paymentBasis: 'BARTER' }],
    ['contractAmount', { contractAmount: -1 }],
    ['startDate', { startDate: 'soon' }],
    ['BOQ references', { boqReferenceIds: 'boq-1' }],
  ])('rejects an invalid %s with HTTP 400 before writing', async (_name, change) => {
    const res = await send('POST', '/api/subcontracting/job-orders', { ...formPayload, ...change });
    expect(res.status).toBe(400);
    expect(db.jobOrder.create).not.toHaveBeenCalled();
  });

  test('rejects BOQ items already held by a package, through BOQMapping as well', async () => {
    db.bOQMapping.findMany.mockResolvedValue([{ awardedBoqItemId: 'awarded-1' }]);
    db.subcontractorBOQItem.findFirst.mockResolvedValue({ id: 'held' });
    const res = await send('POST', '/api/subcontracting/job-orders', formPayload);
    expect(res.status).toBe(409);
    expect(db.subcontractorBOQItem.findFirst.mock.calls[0][0].where.awardedBoqItemId.in).toEqual(['boq-1', 'boq-2', 'awarded-1']);
    expect(db.jobOrder.create).not.toHaveBeenCalled();
  });

  test('rejects the same scope for the same subcontractor but ignores cancelled job orders', async () => {
    db.jobOrder.findMany.mockResolvedValue([{ boqReferenceId: '["boq-2","boq-1"]' }]);
    const res = await send('POST', '/api/subcontracting/job-orders', formPayload);
    expect(res.status).toBe(409);
    expect(db.jobOrder.findMany.mock.calls[0][0].where.status).toEqual({ not: 'CANCELLED' });
  });

  test('allows two lump sum job orders that name no BOQ items', async () => {
    db.jobOrder.findMany.mockResolvedValue([{ boqReferenceId: '["1_LOT"]' }]);
    const res = await send('POST', '/api/subcontracting/job-orders', { ...formPayload, boqReferenceIds: ['1_LOT'] });
    expect(res.status).toBe(200);
    expect(db.subcontractorBOQItem.findFirst).not.toHaveBeenCalled();
  });

  test('a permission failure is HTTP 403', async () => {
    (requirePermission as jest.Mock).mockRejectedValue(new Error('Unauthorized Action: You do not have permission'));
    expect((await send('POST', '/api/subcontracting/job-orders', formPayload)).status).toBe(403);
  });
});

describe('PUT /job-orders/:id', () => {
  // The edit form used to post the whole record, relations included.
  const editPayload = { ...formPayload, id: 'jo-1', status: 'APPROVED', createdAt: '2026-01-01', project: { id: 'project-1' }, subcontractBillings: [] };

  test('saves an edit using only real JobOrder columns', async () => {
    db.jobOrder.findUnique.mockResolvedValue(existingJobOrder());
    const res = await send('PUT', '/api/subcontracting/job-orders/jo-1', { ...editPayload, contractAmount: 300000 });
    expect(res.status).toBe(200);
    const { data, where } = db.jobOrder.update.mock.calls[0][0];
    expect(where).toEqual({ id: 'jo-1' });
    expect(Object.keys(data).filter((key) => !jobOrderColumns.has(key))).toEqual([]);
    expect(data).toMatchObject({ contractAmount: 300000, boqReferenceId: '["boq-1","boq-2"]' });
    expect(data).not.toHaveProperty('status');
    expect(data).not.toHaveProperty('jobNumber');
    expect((await res.json()).data.isThresholdExceeded).toBe(true);
  });

  test('keeps the BOQ references when the body does not mention them', async () => {
    db.jobOrder.findUnique.mockResolvedValue(existingJobOrder());
    await send('PUT', '/api/subcontracting/job-orders/jo-1', { location: 'Roof' });
    expect(db.jobOrder.update.mock.calls[0][0].data).toEqual({ location: 'Roof' });
  });

  test('checks only newly added BOQ items against packages', async () => {
    db.jobOrder.findUnique.mockResolvedValue(existingJobOrder());
    await send('PUT', '/api/subcontracting/job-orders/jo-1', { boqReferenceIds: ['boq-1', 'boq-3'] });
    expect(db.subcontractorBOQItem.findFirst.mock.calls[0][0].where.awardedBoqItemId.in).toEqual(['boq-3']);
  });

  test('does not treat a job order as a duplicate of itself', async () => {
    db.jobOrder.findUnique.mockResolvedValue(existingJobOrder());
    await send('PUT', '/api/subcontracting/job-orders/jo-1', { boqReferenceIds: ['boq-1'] });
    expect(db.jobOrder.findMany.mock.calls[0][0].where.id).toEqual({ not: 'jo-1' });
  });

  test('a locked job order is HTTP 409', async () => {
    db.jobOrder.findUnique.mockResolvedValue(existingJobOrder({ subcontractAccomplishments: [{ status: 'APPROVED' }] }));
    expect((await send('PUT', '/api/subcontracting/job-orders/jo-1', editPayload)).status).toBe(409);
    expect(db.jobOrder.update).not.toHaveBeenCalled();
  });

  test('an unknown job order is HTTP 404', async () => {
    expect((await send('PUT', '/api/subcontracting/job-orders/missing', editPayload)).status).toBe(404);
  });
});

describe('POST /packages/full conflict check', () => {
  const pkg = (ids: string[]) => ({ packageData: { projectId: 'project-1' }, boqItems: ids.map((id) => ({ id })) });

  test('finds a BOQ ID inside the stored JSON list', async () => {
    db.jobOrder.findMany.mockResolvedValue([{ jobNumber: 'JO-7', boqReferenceId: '["1_LOT","boq-1","boq-2"]' }]);
    const res = await send('POST', '/api/subcontracting/packages/full', pkg(['boq-2']));
    expect((await res.json()).error).toContain('JO-7');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test('follows BOQMapping from the awarded item to the consolidated item', async () => {
    db.bOQMapping.findMany.mockResolvedValue([{ consolidatedBoqItemId: 'consolidated-1' }]);
    db.jobOrder.findMany.mockResolvedValue([{ jobNumber: 'JO-8', boqReferenceId: '["consolidated-1"]' }]);
    const res = await send('POST', '/api/subcontracting/packages/full', pkg(['awarded-1']));
    expect((await res.json()).error).toContain('JO-8');
  });

  test('still matches an older record holding one plain ID, and skips cancelled job orders', async () => {
    db.jobOrder.findMany.mockResolvedValue([{ jobNumber: 'JO-9', boqReferenceId: 'boq-1' }]);
    const res = await send('POST', '/api/subcontracting/packages/full', pkg(['boq-1']));
    expect((await res.json()).error).toContain('JO-9');
    expect(db.jobOrder.findMany.mock.calls[0][0].where).toMatchObject({ projectId: 'project-1', status: { not: 'CANCELLED' } });
  });

  test('passes when no job order holds the items', async () => {
    db.jobOrder.findMany.mockResolvedValue([{ jobNumber: 'JO-1', boqReferenceId: '["boq-5"]' }]);
    db.$transaction.mockResolvedValue({ id: 'package-1' });
    expect((await send('POST', '/api/subcontracting/packages/full', pkg(['boq-6']))).status).toBe(200);
    expect(db.$transaction).toHaveBeenCalled();
  });
});

describe('job order reads', () => {
  test('getJobOrderById returns the parsed references the detail and edit pages read', async () => {
    db.jobOrder.findUnique.mockResolvedValue(existingJobOrder({ boqReferenceId: '["1_LOT","boq-1"]', contractAmount: 250001 }));
    const { data } = await (await send('POST', '/api/jobOrderActions/getJobOrderById', { id: 'jo-1' })).json();
    expect(data).toMatchObject({ boqReferenceIds: ['1_LOT', 'boq-1'], isThresholdExceeded: true });
  });

  test('getJobOrderById still reports a missing job order as empty', async () => {
    const { data } = await (await send('POST', '/api/jobOrderActions/getJobOrderById', { id: 'missing' })).json();
    expect(data).toBeNull();
  });

  test.each([
    [null, []],
    ['["a","b"]', ['a', 'b']],
    ['plain-id', ['plain-id']],
    ['{"a":1}', ['{"a":1}']],
  ])('parseBoqReferenceIds(%j)', (value, expected) => {
    expect(parseBoqReferenceIds(value)).toEqual(expected);
  });
});

describe('write route ownership', () => {
  test.each(['createJobOrder', 'updateJobOrder', 'updateJobOrderStatus', 'deleteJobOrder', 'unlockJobOrder'])('the unguarded /%s route is gone', async (name) => {
    expect((await send('POST', `/api/jobOrderActions/${name}`, { id: 'jo-1', data: {} })).status).toBe(404);
    expect(db.jobOrder.create).not.toHaveBeenCalled();
    expect(db.jobOrder.update).not.toHaveBeenCalled();
  });

  test('the workflow actions call the permission-checked routes', async () => {
    (backendFetch as jest.Mock).mockImplementation(async () => new Response(JSON.stringify({ success: true })));
    await updateJobOrderStatus('jo/1', 'FOR_REVIEW');
    expect(backendFetch).toHaveBeenLastCalledWith('/api/subcontracting/job-orders/jo%2F1/status', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ newStatus: 'FOR_REVIEW' }) }));
    await unlockJobOrder('jo-1');
    expect(backendFetch).toHaveBeenLastCalledWith('/api/subcontracting/job-orders/jo-1/unlock', expect.objectContaining({ method: 'PUT' }));
    await deleteJobOrder('jo-1');
    expect(backendFetch).toHaveBeenLastCalledWith('/api/subcontracting/job-orders/jo-1', expect.objectContaining({ method: 'DELETE' }));
  });

  test.each([
    ['DRAFT', 'canReturnForCorrection'],
    ['FOR_REVIEW', 'canSubmit'],
    ['FOR_FINANCIAL_REVIEW', 'canReview'],
    ['FOR_TECHNICAL_REVIEW', 'canReview'],
    ['APPROVED', 'canApprove'],
    ['ISSUED', 'canApprove'],
    ['CANCELLED', 'canCancel'],
  ])('moving to %s needs %s, which the role matrix can grant', async (status, action) => {
    expect(rolePermissionColumns.has(action)).toBe(true);
    (requirePermission as jest.Mock).mockRejectedValue(new Error('Unauthorized Action'));
    const res = await send('PUT', '/api/subcontracting/job-orders/jo-1/status', { newStatus: status });
    expect(res.status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith('user-1', 'SUBCONTRACTING', action, undefined);
  });

  test.each([
    ['PUT', '/api/subcontracting/job-orders/jo-1', 'canEditDraft'],
    ['DELETE', '/api/subcontracting/job-orders/jo-1', 'canDeleteDraft'],
    ['PUT', '/api/subcontracting/job-orders/jo-1/unlock', 'canUnlockWithAuthorization'],
  ])('%s %s needs %s, which the role matrix can grant', async (method, path, action) => {
    expect(rolePermissionColumns.has(action)).toBe(true);
    (requirePermission as jest.Mock).mockRejectedValue(new Error('Unauthorized Action'));
    expect((await send(method, path, {})).status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith('user-1', 'SUBCONTRACTING', action, undefined);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test.each(['BOGUS', 'approved', '', 'constructor', null, 7, undefined])('rejects the status value %p before checking anything else', async (newStatus) => {
    const res = await send('PUT', '/api/subcontracting/job-orders/jo-1/status', { newStatus });
    expect(res.status).toBe(400);
    expect(requirePermission).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test('the form actions post to the permission-checked route', async () => {
    (backendFetch as jest.Mock).mockImplementation(async () => new Response(JSON.stringify({ success: true })));
    await createJobOrder(formPayload);
    expect(backendFetch).toHaveBeenLastCalledWith('/api/subcontracting/job-orders', expect.objectContaining({ method: 'POST' }));
    await updateJobOrder('jo-1', formPayload);
    expect(backendFetch).toHaveBeenLastCalledWith('/api/subcontracting/job-orders/jo-1', expect.objectContaining({ method: 'PUT' }));
  });

  test('the form shows the backend message rather than the raw response', async () => {
    (backendFetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({ success: false, error: 'Job Order is locked' }), { status: 409 }));
    await expect(updateJobOrder('jo-1', formPayload)).resolves.toEqual({ success: false, error: 'Job Order is locked' });
  });
});
