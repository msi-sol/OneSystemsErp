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
import { createJobOrder, deleteJobOrder, getJobOrderById, unlockJobOrder, updateJobOrder, updateJobOrderStatus } from '@/app/actions/jobOrderActions';
import { createFullSubcontractPackage } from '@/app/actions/subcontractingActions';
import { getProjectProfitability } from '@/app/actions/profitabilityActions';
import profitabilityActions from '../apps/aws-backend/src/routes/profitabilityActions';
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
    app.use('/api/profitabilityActions', profitabilityActions);
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

  describe('workflow status, unlock and delete', () => {
    const newJobOrder = async (overrides: Record<string, unknown> = {}) => {
      const res = await createJobOrder(form({ subcontractorId: await freshSubcontractor(), ...overrides }));
      expect(res.error).toBeUndefined();
      return res.data;
    };
    const statusOf = async (id: string) => (await db.jobOrder.findUniqueOrThrow({ where: { id } })).status;
    const ledgerFor = (jobOrderId: string) => db.commitmentLedger.findMany({ where: { jobOrderId }, orderBy: { approvedAmount: 'asc' } });
    const committedCost = async (id: string) => (await db.consolidatedBOQItem.findUniqueOrThrow({ where: { id } })).committedCost;
    const activeCommitment = async (jobOrderId: string) => (await ledgerFor(jobOrderId)).filter((row: any) => row.status === 'ACTIVE').reduce((sum: number, row: any) => sum + row.remainingCommitment, 0);

    // A real matrix role, so the checks prove the actions roles can actually be granted.
    async function asRoleWith(grants: Record<string, boolean>, run: () => Promise<void>) {
      const code = `JO_ROLE_${++seq}`;
      const role = await seed('Role', { roleCode: code, roleName: code, isActive: true });
      const permissionModule = await seed('Module', { moduleName: `SUBCONTRACTING_${seq}` });
      await seed('RolePermission', { roleId: role.id, moduleId: permissionModule.id, moduleName: 'SUBCONTRACTING', ...grants });
      const user = await seed('User', { role: code, status: 'ACTIVE', mustChangePassword: false, email: `jo-role-${++seq}@example.test` });
      mockActor = { userId: user.id, sessionVersion: user.sessionVersion };
      try {
        await run();
      } finally {
        mockActor = { userId: admin.id, sessionVersion: admin.sessionVersion };
      }
    }

    test('walks every workflow button from draft to approved', async () => {
      const jo = await newJobOrder();
      for (const step of ['FOR_REVIEW', 'FOR_FINANCIAL_REVIEW', 'APPROVED']) {
        const res = await updateJobOrderStatus(jo.id, step);
        expect(res.error).toBeUndefined();
        expect(res.data.status).toBe(step);
        expect(await statusOf(jo.id)).toBe(step);
      }
    });

    test.each(['BOGUS', 'approved', '', 'constructor', null, 7])('rejects the status value %p', async (value) => {
      const jo = await newJobOrder();
      const res = await updateJobOrderStatus(jo.id, value);
      expect(res).toEqual({ success: false, error: expect.stringContaining('not a valid') });
      expect(await statusOf(jo.id)).toBe('DRAFT');
    });

    test('the old unguarded routes are gone', async () => {
      const jo = await newJobOrder();
      for (const path of ['updateJobOrderStatus', 'deleteJobOrder', 'unlockJobOrder']) {
        const res = await fetch(`${process.env.BACKEND_INTERNAL_URL}/api/jobOrderActions/${path}`, { method: 'POST' });
        expect([401, 404]).toContain(res.status);
      }
      expect(await statusOf(jo.id)).toBe('DRAFT');
    });

    test('each step needs its own right, and a role can hold exactly that right', async () => {
      const jo = await newJobOrder();
      await asRoleWith({ canSubmit: true }, async () => {
        expect((await updateJobOrderStatus(jo.id, 'APPROVED')).error).toContain('Unauthorized');
        expect((await updateJobOrderStatus(jo.id, 'FOR_FINANCIAL_REVIEW')).error).toContain('Unauthorized');
        expect((await updateJobOrderStatus(jo.id, 'FOR_REVIEW')).error).toBeUndefined();
      });
      await asRoleWith({ canReview: true }, async () => {
        expect((await updateJobOrderStatus(jo.id, 'FOR_FINANCIAL_REVIEW')).error).toBeUndefined();
      });
      await asRoleWith({ canApprove: true }, async () => {
        expect((await deleteJobOrder(jo.id)).error).toContain('Unauthorized');
        expect((await updateJobOrderStatus(jo.id, 'APPROVED')).error).toBeUndefined();
        expect((await unlockJobOrder(jo.id)).error).toContain('Unauthorized');
      });
      await asRoleWith({ canUnlockWithAuthorization: true }, async () => {
        expect((await unlockJobOrder(jo.id)).error).toBeUndefined();
      });
      await asRoleWith({ canEditDraft: true }, async () => {
        expect((await updateJobOrder(jo.id, { location: 'Roof Deck' })).error).toBeUndefined();
      });
      await asRoleWith({ canDeleteDraft: true }, async () => {
        expect((await deleteJobOrder(jo.id)).error).toBeUndefined();
      });
      expect(await db.jobOrder.findUnique({ where: { id: jo.id } })).toBeNull();
    });

    test('a user with no subcontracting rights cannot move, unlock or delete', async () => {
      const jo = await newJobOrder();
      await asRoleWith({ canView: true }, async () => {
        for (const res of [await updateJobOrderStatus(jo.id, 'FOR_REVIEW'), await unlockJobOrder(jo.id), await deleteJobOrder(jo.id)]) {
          expect(res).toEqual({ success: false, error: expect.stringContaining('Unauthorized') });
        }
      });
      expect(await statusOf(jo.id)).toBe('DRAFT');
    });

    test('approval records one project-level row for the full amount, however many BOQ items', async () => {
      const first = await consolidatedItem('C200');
      const second = await consolidatedItem('C201');
      const jo = await newJobOrder({ boqReferenceIds: ['1_LOT', first.id, second.id], contractAmount: 1000 });

      expect((await updateJobOrderStatus(jo.id, 'APPROVED')).error).toBeUndefined();
      const rows = await ledgerFor(jo.id);
      expect(rows.map((row: any) => [row.consolidatedBoqItemId, row.approvedAmount, row.remainingCommitment, row.status])).toEqual([[null, 1000, 1000, 'ACTIVE']]);
      expect(rows[0].commitmentType).toBe('SUBCONTRACT');
      expect(await committedCost(first.id)).toBe(0);
      expect(await committedCost(second.id)).toBe(0);
    });

    test('a job order with no BOQ items commits at project level', async () => {
      const jo = await newJobOrder({ boqReferenceIds: ['1_LOT'], contractAmount: 5000 });
      expect((await updateJobOrderStatus(jo.id, 'APPROVED')).error).toBeUndefined();
      expect((await ledgerFor(jo.id)).map((row: any) => [row.consolidatedBoqItemId, row.approvedAmount])).toEqual([[null, 5000]]);
    });

    test('an older job order with only the single BOQ field commits against that item until unlocked', async () => {
      const item = await consolidatedItem('C208');
      const jo = await newJobOrder({ boqReferenceIds: [], consolidatedBoqItemId: item.id, contractAmount: 2500 });
      expect((await updateJobOrderStatus(jo.id, 'APPROVED')).error).toBeUndefined();
      expect((await ledgerFor(jo.id)).map((row: any) => [row.consolidatedBoqItemId, row.approvedAmount])).toEqual([[item.id, 2500]]);
      expect(await committedCost(item.id)).toBe(2500);

      expect((await unlockJobOrder(jo.id)).error).toBeUndefined();
      expect(await committedCost(item.id)).toBe(0);
    });

    test('the project profitability figure follows approval and unlock', async () => {
      const ownProject = await seed('Project');
      const committedOnProject = async () => (await getProjectProfitability(ownProject.id)).data.committedCost;
      const jo = await newJobOrder({ projectId: ownProject.id, boqReferenceIds: ['1_LOT'], contractAmount: 7000 });
      expect(await committedOnProject()).toBe(0);

      await updateJobOrderStatus(jo.id, 'APPROVED');
      expect(await committedOnProject()).toBe(7000);

      await unlockJobOrder(jo.id);
      expect(await committedOnProject()).toBe(0);
    });

    test('an approved job order is locked until unlocked', async () => {
      const jo = await newJobOrder();
      await updateJobOrderStatus(jo.id, 'APPROVED');

      expect((await updateJobOrder(jo.id, { contractAmount: 1 })).error).toContain('Unlock');
      expect((await deleteJobOrder(jo.id)).error).toContain('Unlock');
      expect((await updateJobOrderStatus(jo.id, 'DRAFT')).error).toContain('Unlock');
      expect((await updateJobOrderStatus(jo.id, 'APPROVED')).error).toContain('Unlock');
      expect(await statusOf(jo.id)).toBe('APPROVED');
      expect((await db.jobOrder.findUniqueOrThrow({ where: { id: jo.id } })).contractAmount).toBe(15000);
    });

    test('unlock releases commitments, so approving again does not double count', async () => {
      const jo = await newJobOrder({ contractAmount: 4000 });

      await updateJobOrderStatus(jo.id, 'APPROVED');
      expect(await activeCommitment(jo.id)).toBe(4000);

      const unlocked = await unlockJobOrder(jo.id);
      expect(unlocked.error).toBeUndefined();
      expect(unlocked.data.status).toBe('FOR_FINANCIAL_REVIEW');
      expect(await activeCommitment(jo.id)).toBe(0);
      expect((await ledgerFor(jo.id)).map((row: any) => [row.status, row.remainingCommitment])).toEqual([['RELEASED', 0]]);

      expect((await updateJobOrder(jo.id, { contractAmount: 6000 })).error).toBeUndefined();
      await updateJobOrderStatus(jo.id, 'APPROVED');
      expect(await activeCommitment(jo.id)).toBe(6000);
      expect(await ledgerFor(jo.id)).toHaveLength(2);
    });

    test('two approvals at once commit only once', async () => {
      const jo = await newJobOrder({ contractAmount: 4000 });
      const results = await Promise.all([updateJobOrderStatus(jo.id, 'APPROVED'), updateJobOrderStatus(jo.id, 'APPROVED')]);
      expect(results.filter((res) => res.success)).toHaveLength(1);
      expect(await activeCommitment(jo.id)).toBe(4000);
      expect(await ledgerFor(jo.id)).toHaveLength(1);
    });

    test('a failed commitment leaves the job order unapproved', async () => {
      const name = `BLOCKED-${++seq}`;
      const blocked = await seed('Subcontractor', { name });
      const jo = await newJobOrder({ subcontractorId: blocked.id });
      await db.$executeRawUnsafe(`ALTER TABLE CommitmentLedger ADD CONSTRAINT block_ledger CHECK (subcontractorName <> '${name}')`);
      try {
        expect((await updateJobOrderStatus(jo.id, 'APPROVED')).success).toBe(false);
      } finally {
        await db.$executeRawUnsafe('ALTER TABLE CommitmentLedger DROP CHECK block_ledger');
      }
      expect(await statusOf(jo.id)).toBe('DRAFT');
      expect(await ledgerFor(jo.id)).toHaveLength(0);
    });

    test('unlock refuses a job order that is not approved', async () => {
      const jo = await newJobOrder();
      expect((await unlockJobOrder(jo.id)).error).toContain('Only an approved');
      expect(await statusOf(jo.id)).toBe('DRAFT');
    });

    test('a cancelled job order stays cancelled and only an approved one can be issued', async () => {
      const jo = await newJobOrder();
      expect((await updateJobOrderStatus(jo.id, 'ISSUED')).error).toContain('Only an approved');
      expect((await updateJobOrderStatus(jo.id, 'CANCELLED')).error).toBeUndefined();
      expect((await updateJobOrderStatus(jo.id, 'APPROVED')).error).toContain('cancelled');
    });

    test('issuing keeps the commitment and the lock', async () => {
      const jo = await newJobOrder({ contractAmount: 4000 });
      await updateJobOrderStatus(jo.id, 'APPROVED');
      expect((await updateJobOrderStatus(jo.id, 'ISSUED')).error).toBeUndefined();
      expect(await activeCommitment(jo.id)).toBe(4000);
      expect((await updateJobOrder(jo.id, { location: 'Roof Deck' })).error).toContain('Unlock');
    });

    describe('with processed work', () => {
      const billing = (jobOrderId: string, data: Record<string, unknown>) => seed('SubcontractBilling', { jobOrderId, projectId: project.id, subcontractorId: subcontractor.id, ...data });

      test.each<[string, (id: string) => Promise<any>]>([
        ['an approved accomplishment', (id) => seed('SubcontractAccomplishment', { jobOrderId: id, status: 'APPROVED' })],
        ['a billing approved for payment', (id) => billing(id, { status: 'APPROVED_FOR_PAYMENT' })],
        ['a paid billing', (id) => billing(id, { status: 'PAID' })],
        ['a billing marked paid', (id) => billing(id, { paymentStatus: 'PAID' })],
        ['a recorded payment', async (id) => seed('PaymentRecord', { billingId: (await billing(id, {})).id })],
      ])('refuses to delete a job order with %s', async (_label, addWork) => {
        const jo = await newJobOrder();
        await addWork(jo.id);
        expect(await deleteJobOrder(jo.id)).toEqual({ success: false, error: expect.stringContaining('cannot be deleted') });
        expect(await statusOf(jo.id)).toBe('DRAFT');
      });

      test('deletes a job order whose work is still unapproved', async () => {
        const jo = await newJobOrder();
        await seed('SubcontractAccomplishment', { jobOrderId: jo.id, status: 'DRAFT' });
        expect((await deleteJobOrder(jo.id)).error).toBeUndefined();
        expect(await db.jobOrder.findUnique({ where: { id: jo.id } })).toBeNull();
      });

      test('refuses to unlock once accomplishments are approved, keeping the commitment', async () => {
        const jo = await newJobOrder({ contractAmount: 4000 });
        await updateJobOrderStatus(jo.id, 'APPROVED');
        await seed('SubcontractAccomplishment', { jobOrderId: jo.id, status: 'APPROVED' });

        expect((await unlockJobOrder(jo.id)).error).toContain('cannot be unlocked');
        expect(await statusOf(jo.id)).toBe('APPROVED');
        expect(await activeCommitment(jo.id)).toBe(4000);
      });
    });

    test('deleting after unlock keeps the released ledger rows for the record', async () => {
      const jo = await newJobOrder({ contractAmount: 4000 });
      await updateJobOrderStatus(jo.id, 'APPROVED');
      const [row] = await ledgerFor(jo.id);
      await unlockJobOrder(jo.id);

      expect((await deleteJobOrder(jo.id)).error).toBeUndefined();
      expect(await db.commitmentLedger.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ jobOrderId: null, status: 'RELEASED' });
    });

    test('deleting a missing job order reports not found', async () => {
      expect(await deleteJobOrder('no-such-job-order')).toEqual({ success: false, error: expect.stringContaining('not found') });
      expect(await updateJobOrderStatus('no-such-job-order', 'FOR_REVIEW')).toEqual({ success: false, error: expect.stringContaining('not found') });
      expect(await unlockJobOrder('no-such-job-order')).toEqual({ success: false, error: expect.stringContaining('not found') });
    });
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
