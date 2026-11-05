jest.mock('../../apps/aws-backend/src/lib/permissions', () => ({ requirePermission: jest.fn(async () => undefined) }));
jest.mock('../../apps/aws-backend/src/lib/prisma', () => {
  const models = new Map<string, Record<string, jest.Mock>>();
  const model = (name: string) => {
    if (!models.has(name)) {
      const methods: Record<string, jest.Mock> = {};
      models.set(name, new Proxy(methods, { get: (target, method: string) => (target[method] ??= jest.fn(async () => null)) }));
    }
    return models.get(name);
  };
  const prisma: unknown = new Proxy({}, {
    get: (_target, name: string) => {
      if (name === '$transaction') return async (run: (tx: unknown) => unknown) => run(prisma);
      return model(name);
    },
  });
  return { prisma };
});

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Prisma } from '@prisma/client';
import { requirePermission } from '../../apps/aws-backend/src/lib/permissions';
import { prisma } from '../../apps/aws-backend/src/lib/prisma';
import equipment from '../../apps/aws-backend/src/routes/equipment';
import finance from '../../apps/aws-backend/src/routes/finance';
import knowledge from '../../apps/aws-backend/src/routes/knowledge';
import payroll from '../../apps/aws-backend/src/routes/payroll';
import progress from '../../apps/aws-backend/src/routes/progress';
import scheduling from '../../apps/aws-backend/src/routes/scheduling';
import subcontracting from '../../apps/aws-backend/src/routes/subcontracting';

const db = prisma as any;
const requirePermissionMock = requirePermission as jest.Mock;

const rolePermissionActions = new Set(
  Prisma.dmmf.datamodel.models.find((model) => model.name === 'RolePermission')!.fields
    .filter((field) => field.type === 'Boolean')
    .map((field) => field.name),
);

const BACKEND_SOURCE = path.join(__dirname, '../../apps/aws-backend/src');
const NEXT_SOURCE = path.join(__dirname, '../../src');
// permissions.ts lists names for the admin and guest shortcuts, which are not checks.
const PERMISSIONS_LIBS = [BACKEND_SOURCE, NEXT_SOURCE].map((root) => path.join(root, 'lib/permissions.ts'));

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(full) && !PERMISSIONS_LIBS.includes(full) ? [full] : [];
  });
}

// Finds quoted names, wherever a route keeps them, and reads such as perms.MODULE?.canX.
function actionNames(source: string): string[] {
  return [...source.matchAll(/['"`](can[A-Z]\w*)['"`]|\.(can[A-Z]\w*)\b/g)].map((match) => match[1] ?? match[2]);
}

describe('permission actions used by the code', () => {
  test('the scan finds quoted names, guard props and property reads', () => {
    expect(actionNames(`check(id, 'SUBCONTRACTING', 'canEdit'); const a = x ? "canDelete" : 'canView'; perms.EQUIPMENT?.canUpdate; perms.canLock; <PermissionGuard action="canPay">`))
      .toEqual(['canEdit', 'canDelete', 'canView', 'canUpdate', 'canLock', 'canPay']);
  });

  test.each([
    ['backend', BACKEND_SOURCE],
    ['Next app', NEXT_SOURCE],
  ])('every action in the %s is a RolePermission column', (_name, root) => {
    const used = sourceFiles(root).flatMap((file) => actionNames(fs.readFileSync(file, 'utf8')).map((action) => ({ file: path.relative(root, file), action })));
    expect(used.length).toBeGreaterThan(50);
    expect(used.filter(({ action }) => !rolePermissionActions.has(action))).toEqual([]);
  });

  test('the Next app does not build action names at run time, where the scan cannot read them', () => {
    const built = sourceFiles(NEXT_SOURCE).filter((file) => fs.readFileSync(file, 'utf8').includes('`can$' + '{'));
    expect(built).toEqual([]);
  });

  test('the columns are the ones the role matrix offers', () => {
    const matrix = fs.readFileSync(path.join(__dirname, '../../src/app/admin/permissions/PermissionMatrixClient.tsx'), 'utf8');
    const offered = new Set([...matrix.matchAll(/key: '(can[A-Z]\w*)'/g)].map((match) => match[1]));
    expect(offered).toEqual(rolePermissionActions);
  });
});

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/equipment', equipment);
  app.use('/api/finance', finance);
  app.use('/api/knowledge', knowledge);
  app.use('/api/payroll', payroll);
  app.use('/api/progress', progress);
  app.use('/api/scheduling', scheduling);
  app.use('/api/subcontracting', subcontracting);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  jest.clearAllMocks();
  requirePermissionMock.mockImplementation(async () => undefined);
  for (const [model, method] of [
    ['subcontractPackage', 'findUnique'], ['subcontractor', 'findUnique'], ['projectAccomplishmentFile', 'findUnique'],
    ['equipmentDeployment', 'findUnique'], ['equipmentMaintenance', 'findUnique'], ['knowledgeRecord', 'findUnique'],
    ['payrollPeriod', 'findUnique'], ['projectSchedule', 'findMany'],
  ]) db[model][method].mockReset().mockResolvedValue(null);
  db.subcontractBilling.updateMany.mockReset().mockResolvedValue({ count: 1 });
});

async function call(method: string, route: string, body?: unknown) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-user-session': 'user-1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

const checkedActions = () => requirePermissionMock.mock.calls.map(([, module, action]) => `${module}.${action}`);

describe('the right each route checks', () => {
  test.each([
    ['PUT', '/api/progress/accomplishments/a-1/approve', undefined, 'SUBCONTRACTING.canApprove'],
    ['PUT', '/api/progress/billings/b-1/submit', undefined, 'SUBCONTRACTING.canSubmit'],
    ['PUT', '/api/progress/billings/b-1/endorse', undefined, 'SUBCONTRACTING.canReview'],
    ['PUT', '/api/progress/billings/b-1/approve-request', undefined, 'SUBCONTRACTING.canApprove'],
    ['PUT', '/api/progress/billings/b-1/endorse-payment', undefined, 'PAYMENT_ISSUANCE.canReview'],
    ['PUT', '/api/progress/billings/b-1/reject-payment', undefined, 'PAYMENT_ISSUANCE.canReject'],
    ['PUT', '/api/progress/accomplishment-files/f-1', {}, 'SUBCONTRACTING.canEditDraft'],
    ['DELETE', '/api/progress/accomplishment-files/f-1', undefined, 'SUBCONTRACTING.canDeleteDraft'],
    ['POST', '/api/progress/accomplishment-files/f-1/versions', { isLocked: false }, 'SUBCONTRACTING.canRevise'],
    ['POST', '/api/progress/accomplishment-files/f-1/versions', { isLocked: true }, 'SUBCONTRACTING.canLock'],
    ['PUT', '/api/subcontracting/subcontractors/s-1', {}, 'SUBCONTRACTING.canEditDraft'],
    ['DELETE', '/api/subcontracting/subcontractors/s-1', undefined, 'SUBCONTRACTING.canDeleteDraft'],
    ['PUT', '/api/subcontracting/packages/p-1', {}, 'SUBCONTRACTING.canEditDraft'],
    ['PUT', '/api/subcontracting/packages/full/p-1', { packageData: {} }, 'SUBCONTRACTING.canEditDraft'],
    ['DELETE', '/api/subcontracting/packages/p-1', undefined, 'SUBCONTRACTING.canDeleteDraft'],
    ['PUT', '/api/subcontracting/packages/p-1/status', { status: 'DRAFT' }, 'SUBCONTRACTING.canReturnForCorrection'],
    ['PUT', '/api/subcontracting/packages/p-1/status', { status: 'FOR_REVIEW' }, 'SUBCONTRACTING.canSubmit'],
    ['PUT', '/api/subcontracting/packages/p-1/status', { status: 'FOR_FINAL_APPROVAL' }, 'SUBCONTRACTING.canReview'],
    ['PUT', '/api/subcontracting/packages/p-1/status', { status: 'APPROVED' }, 'SUBCONTRACTING.canApprove'],
    ['PUT', '/api/subcontracting/packages/p-1/status', { status: 'CLOSED' }, 'SUBCONTRACTING.canApprove'],
    ['PUT', '/api/subcontracting/packages/p-1/status', { status: 'CANCELLED' }, 'SUBCONTRACTING.canCancel'],
    ['PUT', '/api/equipment/deployment/d-1/status', { newStatus: 'APPROVED' }, 'EQUIPMENT.canApprove'],
    ['PUT', '/api/equipment/deployment/d-1/status', { newStatus: 'DISPATCHED' }, 'EQUIPMENT.canEditDraft'],
    ['PUT', '/api/equipment/deployment/d-1/status', { newStatus: 'RETURNED' }, 'EQUIPMENT.canEditDraft'],
    ['DELETE', '/api/equipment/utilization/u-1', undefined, 'EQUIPMENT.canDeleteDraft'],
    ['PUT', '/api/equipment/maintenance/m-1/status', { newStatus: 'IN_PROGRESS' }, 'EQUIPMENT.canEditDraft'],
    ['PUT', '/api/equipment/maintenance/m-1/status', { newStatus: 'COMPLETED' }, 'EQUIPMENT.canEditDraft'],
    ['DELETE', '/api/equipment/maintenance/m-1', undefined, 'EQUIPMENT.canDeleteDraft'],
    ['PUT', '/api/equipment/ai/validations/v-1/status', { newStatus: 'RESOLVED' }, 'EQUIPMENT.canReview'],
    ['PUT', '/api/finance/payment/ap-1/clear-accrued', undefined, 'PAYMENT_ISSUANCE.canMarkAsPaid'],
    ['DELETE', '/api/knowledge/records/k-1', undefined, 'SYSTEM_SETTINGS.canDeleteDraft'],
    ['POST', '/api/payroll/engine/compute', { payrollPeriodId: 'pp-1' }, 'PAYROLL.canEditDraft'],
    ['DELETE', '/api/payroll/period/pp-1', undefined, 'PAYROLL.canDeleteDraft'],
    ['POST', '/api/payroll/dtr/save-manual', { data: {}, payrollPeriodId: 'pp-1' }, 'PAYROLL.canEditDraft'],
    ['POST', '/api/payroll/dtr/save-bulk', { entries: [], payrollPeriodId: 'pp-1' }, 'PAYROLL.canEditDraft'],
    ['DELETE', '/api/scheduling/project-1', undefined, 'PROJECT_MANAGEMENT.canDeleteDraft'],
  ])('%s %s %j needs %s', async (method, route, body, expected) => {
    await call(method, route, body);
    expect(checkedActions()).toEqual([expected]);
  });

  test('a refused right stops the route before any write', async () => {
    requirePermissionMock.mockRejectedValue(new Error('Unauthorized Action'));
    const { status } = await call('PUT', '/api/progress/billings/b-1/submit');
    expect(status).toBe(500);
    expect(db.subcontractBilling.updateMany).not.toHaveBeenCalled();
  });
});

describe('a draft right stays limited to drafts', () => {
  test.each([
    ['submit', 'DRAFT', 'SUBMITTED'],
    ['endorse', 'SUBMITTED', 'FOR_VALIDATION'],
    ['approve-request', 'FOR_VALIDATION', 'APPROVED_FOR_PAYMENT'],
  ])('billing %s moves only from %s', async (step, from, to) => {
    db.subcontractBilling.updateMany.mockResolvedValue({ count: 0 });
    const { status, body } = await call('PUT', `/api/progress/billings/b-1/${step}`);
    expect(db.subcontractBilling.updateMany).toHaveBeenCalledWith({ where: { id: 'b-1', status: from }, data: { status: to } });
    expect(status).toBe(500);
    expect(body.error).toContain(`Only a billing in ${from}`);
    expect(db.subcontractPackage.update).not.toHaveBeenCalled();
  });

  test.each([
    ['APPROVED', 'DISPATCHED'],
    ['DISPATCHED', 'REQUESTED'],
    ['RETURNED', 'APPROVED'],
  ])('a deployment cannot move to %s from %s', async (newStatus, current) => {
    db.equipmentDeployment.findUnique.mockResolvedValue({ status: current });
    const { status } = await call('PUT', '/api/equipment/deployment/d-1/status', { newStatus });
    expect(status).toBe(409);
    expect(db.equipmentDeployment.update).not.toHaveBeenCalled();
    expect(db.equipment.update).not.toHaveBeenCalled();
  });

  test('a deployment moves from the step before', async () => {
    db.equipmentDeployment.findUnique.mockResolvedValue({ status: 'APPROVED', equipmentId: 'e-1' });
    const { status } = await call('PUT', '/api/equipment/deployment/d-1/status', { newStatus: 'DISPATCHED' });
    expect(status).toBe(200);
    expect(db.equipmentDeployment.update).toHaveBeenCalled();
  });

  test.each([
    ['deployment', 'd-1'],
    ['maintenance', 'm-1'],
  ])('an unknown %s status is refused before any check', async (kind, id) => {
    const { status } = await call('PUT', `/api/equipment/${kind}/${id}/status`, { newStatus: 'constructor' });
    expect(status).toBe(400);
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  test('maintenance cannot complete before it has started', async () => {
    db.equipmentMaintenance.findUnique.mockResolvedValue({ status: 'SCHEDULED', equipmentId: 'e-1' });
    const { status } = await call('PUT', '/api/equipment/maintenance/m-1/status', { newStatus: 'COMPLETED' });
    expect(status).toBe(409);
    expect(db.equipmentMaintenance.update).not.toHaveBeenCalled();
  });

  test('deleting completed maintenance also needs the void right', async () => {
    db.equipmentMaintenance.findUnique.mockResolvedValue({ status: 'COMPLETED', equipmentId: 'e-1' });
    requirePermissionMock.mockImplementation(async (_user, _module, action) => {
      if (action === 'canVoidRecord') throw new Error('Unauthorized Action');
    });
    const { status } = await call('DELETE', '/api/equipment/maintenance/m-1');
    expect(status).toBe(500);
    expect(checkedActions()).toEqual(['EQUIPMENT.canDeleteDraft', 'EQUIPMENT.canVoidRecord']);
    expect(db.equipmentMaintenance.delete).not.toHaveBeenCalled();
  });

  test('deleting unfinished maintenance needs only the draft right', async () => {
    db.equipmentMaintenance.findUnique.mockResolvedValue({ status: 'SCHEDULED', equipmentId: 'e-1' });
    const { status } = await call('DELETE', '/api/equipment/maintenance/m-1');
    expect(status).toBe(200);
    expect(db.equipmentMaintenance.delete).toHaveBeenCalled();
  });

  test.each([
    ['/api/subcontracting/packages/p-1', { remarks: 'x' }],
    ['/api/subcontracting/packages/full/p-1', { packageData: { remarks: 'x' } }],
  ])('a locked package cannot be edited through %s', async (route, body) => {
    db.subcontractPackage.findUnique.mockResolvedValue({ isLocked: true });
    const { status } = await call('PUT', route, body);
    expect(status).toBe(409);
    expect(db.subcontractPackage.update).not.toHaveBeenCalled();
  });

  test('editing a package cannot change its status or lock', async () => {
    db.subcontractPackage.findUnique.mockResolvedValue({ isLocked: false });
    await call('PUT', '/api/subcontracting/packages/p-1', { remarks: 'x', status: 'APPROVED', isLocked: false });
    expect(db.subcontractPackage.update).toHaveBeenLastCalledWith({ where: { id: 'p-1' }, data: { remarks: 'x' } });

    await call('PUT', '/api/subcontracting/packages/full/p-1', { packageData: { remarks: 'y', status: 'APPROVED', isLocked: false } });
    expect(db.subcontractPackage.update).toHaveBeenLastCalledWith({ where: { id: 'p-1' }, data: { remarks: 'y' } });
  });

  test.each([
    [{ status: 'FOR_REVIEW', isLocked: false }],
    [{ status: 'APPROVED', isLocked: true }],
    [{ status: 'DRAFT', isLocked: true }],
  ])('package %j cannot be deleted', async (pkg) => {
    db.subcontractPackage.findUnique.mockResolvedValue(pkg);
    const { status } = await call('DELETE', '/api/subcontracting/packages/p-1');
    expect(status).toBe(409);
    expect(db.subcontractPackage.delete).not.toHaveBeenCalled();
    expect(db.programOfWorks.deleteMany).not.toHaveBeenCalled();
  });

  test('an unlocked draft package can be deleted', async () => {
    db.subcontractPackage.findUnique.mockResolvedValue({ status: 'DRAFT', isLocked: false });
    const { status } = await call('DELETE', '/api/subcontracting/packages/p-1');
    expect(status).toBe(200);
    expect(db.subcontractPackage.delete).toHaveBeenCalledWith({ where: { id: 'p-1' } });
  });

  test('a locked package only moves on through an approver', async () => {
    db.subcontractPackage.findUnique.mockResolvedValue({ status: 'APPROVED', isLocked: true });
    expect((await call('PUT', '/api/subcontracting/packages/p-1/status', { status: 'DRAFT' })).status).toBe(409);
    expect((await call('PUT', '/api/subcontracting/packages/p-1/status', { status: 'CANCELLED' })).status).toBe(409);
    expect(db.subcontractPackage.update).not.toHaveBeenCalled();

    expect((await call('PUT', '/api/subcontracting/packages/p-1/status', { status: 'FOR_BILLING' })).status).toBe(200);
    expect(db.subcontractPackage.update).toHaveBeenCalledTimes(1);
  });

  test('an unknown package status is refused before any check', async () => {
    const { status } = await call('PUT', '/api/subcontracting/packages/p-1/status', { status: 'constructor' });
    expect(status).toBe(400);
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  test('editing a subcontractor cannot change its accreditation', async () => {
    await call('PUT', '/api/subcontracting/subcontractors/s-1', { remarks: 'x', accreditation: 'ACCREDITED' });
    expect(db.subcontractor.update).toHaveBeenCalledWith({ where: { id: 's-1' }, data: { remarks: 'x' } });
  });

  test('a subcontractor with work cannot be deleted', async () => {
    db.subcontractor.findUnique.mockResolvedValue({ _count: { packages: 0, jobOrders: 1, subcontractBillings: 0, backCharges: 0, subcontractorBOQItems: 0 } });
    const { status } = await call('DELETE', '/api/subcontracting/subcontractors/s-1');
    expect(status).toBe(409);
    expect(db.subcontractor.delete).not.toHaveBeenCalled();
  });

  test('a subcontractor with no work can be deleted', async () => {
    db.subcontractor.findUnique.mockResolvedValue({ _count: { packages: 0, jobOrders: 0, subcontractBillings: 0, backCharges: 0, subcontractorBOQItems: 0 } });
    const { status } = await call('DELETE', '/api/subcontracting/subcontractors/s-1');
    expect(status).toBe(200);
    expect(db.subcontractor.delete).toHaveBeenCalledWith({ where: { id: 's-1' } });
  });

  test('editing an accomplishment file cannot change its status or lock', async () => {
    await call('PUT', '/api/progress/accomplishment-files/f-1', { remarks: 'x', status: 'ACTIVE', isLockedOriginal: false });
    expect(db.projectAccomplishmentFile.update).toHaveBeenCalledWith({ where: { id: 'f-1' }, data: { remarks: 'x' } });
  });

  test('an accomplishment file locked for billing cannot be deleted', async () => {
    db.projectAccomplishmentFile.findUnique.mockResolvedValue({ status: 'BILLING' });
    const { status } = await call('DELETE', '/api/progress/accomplishment-files/f-1');
    expect(status).toBe(409);
    expect(db.projectAccomplishmentFile.delete).not.toHaveBeenCalled();
  });

  test.each(['Approved', 'For Review', 'Active'])('a knowledge record in %s cannot be deleted', async (recordStatus) => {
    db.knowledgeRecord.findUnique.mockResolvedValue({ status: recordStatus });
    const { status } = await call('DELETE', '/api/knowledge/records/k-1');
    expect(status).toBe(409);
    expect(db.knowledgeRecord.delete).not.toHaveBeenCalled();
  });

  test('a draft knowledge record can be deleted', async () => {
    db.knowledgeRecord.findUnique.mockResolvedValue({ status: 'Draft' });
    const { status } = await call('DELETE', '/api/knowledge/records/k-1');
    expect(status).toBe(200);
    expect(db.knowledgeRecord.delete).toHaveBeenCalledWith({ where: { id: 'k-1' } });
  });

  test.each([
    ['/api/payroll/engine/compute', { payrollPeriodId: 'pp-1' }],
    ['/api/payroll/dtr/save-manual', { data: { workerId: 'w-1', date: '2026-11-01', regularHours: 8, overtimeHours: 0 }, payrollPeriodId: 'pp-1' }],
    ['/api/payroll/dtr/save-bulk', { workerId: 'w-1', entries: [{ date: '2026-11-01', regularHours: 8, overtimeHours: 0 }], payrollPeriodId: 'pp-1' }],
  ])('%s refuses a locked payroll period before writing', async (route, body) => {
    db.payrollPeriod.findUnique.mockResolvedValue({ isLocked: true });
    const { status, body: result } = await call('POST', route, body);
    expect(status).toBe(500);
    expect(result.error).toContain('locked');
    expect(db.dailyTimeRecord.create).not.toHaveBeenCalled();
    expect(db.dailyTimeRecord.update).not.toHaveBeenCalled();
    expect(db.payroll.create).not.toHaveBeenCalled();
    expect(db.payroll.upsert).not.toHaveBeenCalled();
  });

  test.each(['READY_FOR_REVIEW', 'TECHNICALLY_APPROVED', 'ACTIVE_BASELINE', 'SUPERSEDED_BASELINE'])('a schedule in %s cannot be deleted', async (workflowStatus) => {
    db.projectSchedule.findMany.mockResolvedValue([{ id: 'sch-1', workflowStatus }]);
    const { status } = await call('DELETE', '/api/scheduling/project-1');
    expect(status).toBe(409);
    expect(db.projectSchedule.delete).not.toHaveBeenCalled();
  });

  test('a schedule still being drafted can be deleted', async () => {
    db.projectSchedule.findMany.mockResolvedValue([{ id: 'sch-1', workflowStatus: 'AI_GENERATED_DRAFT' }]);
    const { status } = await call('DELETE', '/api/scheduling/project-1');
    expect(status).toBe(200);
    expect(db.projectSchedule.delete).toHaveBeenCalledWith({ where: { id: 'sch-1' } });
  });
});

describe('the real permission check', () => {
  const { hasPermission } = jest.requireActual('../../apps/aws-backend/src/lib/permissions');

  beforeEach(() => {
    db.user.findUnique.mockResolvedValue({ role: 'PROJECT_MANAGER' });
    db.userRole.findMany.mockResolvedValue([]);
    db.role.findFirst.mockResolvedValue({ rolePermissions: [{ moduleName: 'SUBCONTRACTING', canEditDraft: true, canDeleteDraft: false }] });
  });

  test('a matrix right passes for a non-admin role', async () => {
    await expect(hasPermission('user-1', 'SUBCONTRACTING', 'canEditDraft')).resolves.toBe(true);
    await expect(hasPermission('user-1', 'SUBCONTRACTING', 'canDeleteDraft')).resolves.toBe(false);
  });

  test('a name that is not a column can never pass for a non-admin role', async () => {
    await expect(hasPermission('user-1', 'SUBCONTRACTING', 'canEdit')).resolves.toBe(false);
  });
});
