// Drives the job order form's server actions through the real Express stack
// (requireAuth included) against a real MySQL database. It writes rows, so it
// only runs when asked to and only against a loopback database:
//   JOB_ORDER_LIVE_DB=1 DATABASE_URL=mysql://root@127.0.0.1:<port>/<db> npx jest tests/job-order-form.live
process.env.BACKEND_INTERNAL_SECRET ||= 'job-order-live-test-secret-0123456789abcdef';

let mockActor: { userId: string; sessionVersion: number };
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
jest.mock('@/lib/dal/auth', () => ({ verifySession: async () => ({ id: mockActor.userId }) }));
jest.mock('@/lib/backend-fetch', () => {
  const { createBackendToken } = jest.requireActual('@/lib/backend-token');
  return {
    backendFetch: async (input: string, options: RequestInit = {}) => {
      const url = new URL(input, process.env.BACKEND_INTERNAL_URL);
      const method = (options.method || 'GET').toUpperCase();
      const headers = new Headers(options.headers);
      headers.set('Authorization', `Bearer ${createBackendToken({ ...mockActor, method, path: url.pathname })}`);
      return fetch(url, { ...options, method, headers });
    },
  };
});

import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Prisma, PrismaClient } from '@prisma/client';
import { createJobOrder, getJobOrderById, updateJobOrder } from '@/app/actions/jobOrderActions';
import { createFullSubcontractPackage } from '@/app/actions/subcontractingActions';
import subcontracting from '../apps/aws-backend/src/routes/subcontracting';
import jobOrderActions from '../apps/aws-backend/src/routes/jobOrderActions';
import { requireAuth } from '../apps/aws-backend/src/middleware/auth';

const databaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const enabled = process.env.JOB_ORDER_LIVE_DB === '1' && !!databaseUrl && ['127.0.0.1', 'localhost'].includes(databaseUrl.hostname);
const describeLive = enabled ? describe : describe.skip;

let seq = Date.now() % 1000000000;
const dmmf = Prisma.dmmf.datamodel;
const db = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
const delegate = (model: string) => (db as any)[model[0].toLowerCase() + model.slice(1)];

function scalarValue(field: any) {
  if (field.kind === 'enum') return dmmf.enums.find((e) => e.name === field.type)!.values[0].name;
  switch (field.type) {
    case 'String': return `${field.name}-${++seq}`;
    case 'Int': case 'BigInt': case 'Float': case 'Decimal': return 1;
    case 'Boolean': return false;
    case 'DateTime': return new Date();
    case 'Json': return {};
    default: throw new Error(`no default for ${field.type}`);
  }
}

// Fills required columns so the seeds do not need updating as models grow.
async function seed(model: string, data: Record<string, unknown> = {}): Promise<any> {
  const fields = dmmf.models.find((m) => m.name === model)!.fields;
  const row: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.kind === 'object' && field.isRequired && !field.isList && field.relationFromFields?.length) {
      const key = field.relationFromFields[0];
      if (!(key in data)) row[key] = (await seed(field.type)).id;
    }
  }
  for (const field of fields) {
    if (field.kind === 'object' || field.name in data || field.name in row) continue;
    if (field.isRequired && !field.hasDefaultValue && !field.isUpdatedAt) row[field.name] = scalarValue(field);
  }
  return delegate(model).create({ data: { ...row, ...data } });
}

describeLive('job order form against a real database', () => {
  let server: Server;
  let admin: any;
  let project: any;
  let subcontractor: any;
  let items: any[];

  const consolidatedItem = (code: string) => seed('ConsolidatedBOQItem', { projectId: project.id, itemCode: code, quantity: 10, unitCost: 1000, totalCost: 10000 });
  const form = (overrides: Record<string, unknown> = {}) => ({
    projectId: project.id,
    subcontractorId: subcontractor.id,
    jobNumber: `JO-${++seq}`,
    boqReferenceIds: [items[0].id],
    description: 'Waterproofing of the podium slab',
    jobOrderType: 'LABOR_AND_MATERIALS',
    location: 'Ground Floor, Zone 1',
    contractAmount: 15000,
    paymentBasis: 'MILESTONE',
    materialResponsibility: 'COMPANY_SUPPLIED',
    startDate: '2026-12-01',
    durationDays: '30',
    completionDate: '2026-12-31',
    ...overrides,
  });

  beforeAll(async () => {
    admin = await seed('User', { role: 'SUPER_ADMIN', status: 'ACTIVE', mustChangePassword: false, email: `jo-admin-${++seq}@example.test` });
    mockActor = { userId: admin.id, sessionVersion: admin.sessionVersion };
    project = await seed('Project');
    subcontractor = await seed('Subcontractor');
    items = await Promise.all(['C001', 'C002', 'C003', 'C004', 'C005', 'C006', 'C007', 'C008'].map(consolidatedItem));

    const app = express();
    app.use(express.json());
    app.use('/api', requireAuth);
    app.use('/api/subcontracting', subcontracting);
    app.use('/api/jobOrderActions', jobOrderActions);
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    process.env.BACKEND_INTERNAL_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.$disconnect();
  });

  // A fresh subcontractor keeps each case clear of the duplicate scope rule.
  const freshSubcontractor = async () => (await seed('Subcontractor')).id;

  test('creates a job order from the exact form payload', async () => {
    const res = await createJobOrder(form({ subcontractorId: await freshSubcontractor() }));
    expect(res.error).toBeUndefined();
    const row = await db.jobOrder.findUniqueOrThrow({ where: { id: res.data.id } });
    expect(row).toMatchObject({
      boqReferenceId: JSON.stringify([items[0].id]), jobOrderType: 'LABOR_AND_MATERIALS', contractAmount: 15000,
      paymentBasis: 'MILESTONE', status: 'DRAFT', location: 'Ground Floor, Zone 1',
    });
    expect(row.startDate).toEqual(new Date('2026-12-01'));
    expect(row.completionDate).toEqual(new Date('2026-12-31'));
  });

  test('creates above the 250,000 threshold and flags it on read', async () => {
    const res = await createJobOrder(form({ subcontractorId: await freshSubcontractor(), contractAmount: 300000 }));
    expect(res.error).toBeUndefined();
    const { data } = await getJobOrderById(res.data.id);
    expect(data).toMatchObject({ contractAmount: 300000, isThresholdExceeded: true });
  });

  test('stores more BOQ references than fit a VARCHAR(191)', async () => {
    const ids = ['1_LOT', ...items.map((item) => item.id)];
    const res = await createJobOrder(form({ subcontractorId: await freshSubcontractor(), boqReferenceIds: ids }));
    expect(res.error).toBeUndefined();
    expect(JSON.stringify(ids).length).toBeGreaterThan(191);
    expect((await getJobOrderById(res.data.id)).data.boqReferenceIds).toEqual(ids);
  });

  test('edits through the record the edit page loads, without losing references', async () => {
    const created = await createJobOrder(form({ subcontractorId: await freshSubcontractor(), boqReferenceIds: ['1_LOT', items[1].id] }));
    const { data: loaded } = await getJobOrderById(created.data.id);
    expect(loaded.boqReferenceIds).toEqual(['1_LOT', items[1].id]);

    // Worst case: the whole loaded record comes back, relations included.
    const res = await updateJobOrder(loaded.id, { ...loaded, location: 'Roof Deck', contractAmount: 260000, durationDays: '45', status: 'APPROVED' });
    expect(res.error).toBeUndefined();
    const row = await db.jobOrder.findUniqueOrThrow({ where: { id: loaded.id } });
    expect(row).toMatchObject({ location: 'Roof Deck', contractAmount: 260000, status: 'DRAFT', boqReferenceId: JSON.stringify(['1_LOT', items[1].id]) });
    expect((await getJobOrderById(loaded.id)).data.isThresholdExceeded).toBe(true);
  });

  test('clears an optional date with an empty form field', async () => {
    const created = await createJobOrder(form({ subcontractorId: await freshSubcontractor() }));
    const res = await updateJobOrder(created.data.id, { startDate: '' });
    expect(res.error).toBeUndefined();
    expect((await db.jobOrder.findUniqueOrThrow({ where: { id: created.data.id } })).startDate).toBeNull();
  });

  test('refuses to edit a job order with an approved accomplishment', async () => {
    const created = await createJobOrder(form({ subcontractorId: await freshSubcontractor() }));
    await seed('SubcontractAccomplishment', { jobOrderId: created.data.id, status: 'APPROVED' });
    const res = await updateJobOrder(created.data.id, { location: 'Roof Deck' });
    expect(res).toEqual({ success: false, error: expect.stringContaining('locked') });
  });

  test('refuses a second job order with the same scope for the same subcontractor', async () => {
    const subcontractorId = await freshSubcontractor();
    expect((await createJobOrder(form({ subcontractorId }))).error).toBeUndefined();
    const res = await createJobOrder(form({ subcontractorId }));
    expect(res).toEqual({ success: false, error: expect.stringContaining('Duplicate Error') });
  });

  test('a user without subcontracting rights cannot save through the form', async () => {
    const viewer = await seed('User', { role: 'NO_SUCH_ROLE', status: 'ACTIVE', mustChangePassword: false, email: `jo-viewer-${++seq}@example.test` });
    mockActor = { userId: viewer.id, sessionVersion: viewer.sessionVersion };
    try {
      const res = await createJobOrder(form({ subcontractorId: await freshSubcontractor() }));
      expect(res).toEqual({ success: false, error: expect.stringContaining('Unauthorized') });
    } finally {
      mockActor = { userId: admin.id, sessionVersion: admin.sessionVersion };
    }
  });

  describe('BOQ conflicts between job orders and subcontract packages', () => {
    const packagePayload = (subcontractorId: string) => ({ projectId: project.id, subcontractorId, packageName: 'Package', workCategory: 'Civil', contractType: 'SUPPLY_INSTALL', scopeOfWork: 'Scope', location: 'Site', quantity: 1, unit: 'LOT', unitCost: 1, contractAmount: 1, costType: 'DIRECT', paymentTerms: 'PROGRESS' });

    test('a package cannot take an awarded item linked to a job order item', async () => {
      const consolidated = await consolidatedItem('C100');
      const awarded = await seed('AwardedBOQItem', { projectId: project.id });
      await seed('BOQMapping', { consolidatedBoqItemId: consolidated.id, awardedBoqItemId: awarded.id });
      const created = await createJobOrder(form({ subcontractorId: await freshSubcontractor(), boqReferenceIds: ['1_LOT', consolidated.id] }));
      expect(created.error).toBeUndefined();

      const res = await createFullSubcontractPackage(packagePayload(subcontractor.id), [{ id: awarded.id }], null);
      expect(res).toEqual({ success: false, error: expect.stringContaining(created.data.jobNumber) });
    });

    test('a job order cannot take a consolidated item whose awarded item is in a package', async () => {
      const consolidated = await consolidatedItem('C101');
      const awarded = await seed('AwardedBOQItem', { projectId: project.id });
      await seed('BOQMapping', { consolidatedBoqItemId: consolidated.id, awardedBoqItemId: awarded.id });
      await seed('SubcontractorBOQItem', { subcontractorId: subcontractor.id, awardedBoqItemId: awarded.id });

      const res = await createJobOrder(form({ subcontractorId: await freshSubcontractor(), boqReferenceIds: [consolidated.id] }));
      expect(res).toEqual({ success: false, error: expect.stringContaining('Conflict Error') });
    });
  });
});

if (!enabled) test.skip('set JOB_ORDER_LIVE_DB=1 and a loopback DATABASE_URL to run the live job order tests', () => undefined);
