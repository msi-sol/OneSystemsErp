jest.mock('@/lib/prisma', () => ({
  prisma: { $transaction: jest.fn() },
  transactionContext: { run: (_context: unknown, work: () => unknown) => work() },
}));
jest.mock('@/lib/scheduling/planning-capacity', () => ({ planningCapacity: jest.fn() }));
jest.mock('@/lib/scheduling/work-package-execution', () => ({ assertWorkPackageExecutedScope: jest.fn() }));

import { prisma } from '@/lib/prisma';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { assertWorkPackageExecutedScope } from '@/lib/scheduling/work-package-execution';
import { updateWorkPackageDetails } from '@/lib/scheduling/work-package-details';
import { WORK_PACKAGE_DETAILS_KIND } from '@/lib/scheduling/work-package-details-types';
import type { PackageBreakdownUpload } from '@/lib/scheduling/package-breakdown';

const actor = { id: 'user-a', role: 'PROJECT_ENGINEER' };
const row = {
  sourceRowNumber: 8, section: 'Concrete', sectionSourceKey: 'source:heading:2', sectionOrder: 2, sectionStartRow: 2,
  quantityDefaulted: false, unitDefaulted: false, itemCodeSynthesized: true, sourceUnitCost: 4, rateDerived: false,
  itemCode: '', description: 'Cement', unit: 'bag', quantity: 2, unitCost: 4, amount: 8,
};
const upload: PackageBreakdownUpload = {
  id: 'upload-a', activityId: 'package-a', fileName: 'dupa.xlsx', fileHash: 'a'.repeat(64), storagePath: 'storage/a.xlsx',
  sheetName: 'DUPA', mapping: { headerRow: 1, itemCode: null, description: 2, unit: 3, quantity: 4, unitCost: 5, amount: 6 },
  rows: [row], uploadedAt: '2026-11-05T00:00:00.000Z', uploadedById: 'user-a', originScheduleId: 'schedule-a',
  appliedAt: null, appliedById: null, resourceIds: [], categories: {}, reason: null,
};

function transactionHarness(resources: Array<Record<string, unknown>>) {
  const schedule = {
    id: 'schedule-a', projectId: 'project-a', description: JSON.stringify({
      kind: WORK_PACKAGE_DETAILS_KIND, locations: [], constraints: [], resources, allocationLocations: {}, breakdownUploads: [upload],
    }), rowVersion: 4, workflowStatus: 'AI_GENERATED_DRAFT', generationRulesVersion: 'BOQ_WPS_WORKSPACE_V1',
  };
  const tx = {
    project: { findUnique: jest.fn().mockResolvedValue({ id: 'project-a', status: 'ACTIVE' }) },
    projectSchedule: {
      findFirst: jest.fn().mockResolvedValueOnce(schedule).mockResolvedValueOnce({ ...schedule, activities: [] }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    scheduleActivity: { findFirst: jest.fn().mockResolvedValue({ id: 'package-a' }) },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
  };
  (planningCapacity as jest.Mock).mockResolvedValue({ canEditPlan: true });
  (assertWorkPackageExecutedScope as jest.Mock).mockResolvedValue(undefined);
  (prisma.$transaction as unknown as jest.Mock).mockImplementation((work: (client: unknown) => unknown) => work(tx));
  return { tx, schedule };
}

describe('work package breakdown apply transaction', () => {
  beforeEach(() => jest.clearAllMocks());

  it('adds reconciled components, marks the upload applied, and records the audit in one transaction', async () => {
    const { tx } = transactionHarness([]);
    const result = await updateWorkPackageDetails({
      projectId: 'project-a', actor,
      body: { action: 'apply-breakdown', scheduleId: 'schedule-a', expectedRowVersion: 4, uploadId: 'upload-a', categories: { '8': 'MATERIAL' }, reason: 'Detailed package cost', acknowledgeExisting: false },
    });

    expect(tx.projectSchedule.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'schedule-a', projectId: 'project-a', rowVersion: 4 }),
      data: expect.objectContaining({ rowVersion: { increment: 1 } }),
    }));
    expect(result).toMatchObject({ rowVersion: 5, details: { resources: [expect.objectContaining({
      activityId: 'package-a', kind: 'MATERIAL', quantity: '2', unitCost: '4.00', amount: '8.00',
      breakdownUploadId: 'upload-a', sourceRowNumber: 8, isSystemSuggested: true, reviewedAt: null,
    })] } });
    expect(result.details.breakdownUploads?.[0]).toMatchObject({
      appliedAt: expect.any(String), appliedById: 'user-a', resourceIds: [result.details.resources[0].id],
      categories: { '8': 'MATERIAL' }, reason: 'Detailed package cost',
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actionType: 'WPS_PACKAGE_BREAKDOWN_APPLIED' }) }));
    expect(assertWorkPackageExecutedScope).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate component without saving the plan or marking evidence applied', async () => {
    const currentResource = {
      id: 'resource-existing', activityId: 'package-a', kind: 'MATERIAL', description: ' cement ', unit: 'BAG', quantity: '2.0', unitCost: '4.00', amount: '8.00',
    };
    const { tx } = transactionHarness([currentResource]);
    await expect(updateWorkPackageDetails({
      projectId: 'project-a', actor,
      body: { action: 'apply-breakdown', scheduleId: 'schedule-a', expectedRowVersion: 4, uploadId: 'upload-a', categories: { '8': 'MATERIAL' }, reason: 'Detailed package cost', acknowledgeExisting: true },
    })).rejects.toThrow(/Duplicate resource component: Cement/);

    expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('requires explicit acknowledgement before adding to a package that already has costs', async () => {
    const { tx } = transactionHarness([{ id: 'existing', activityId: 'package-a', kind: 'ALLOWANCE', description: 'Other', unit: 'lot', quantity: '1', unitCost: '1', amount: '1' }]);
    await expect(updateWorkPackageDetails({
      projectId: 'project-a', actor,
      body: { action: 'apply-breakdown', scheduleId: 'schedule-a', expectedRowVersion: 4, uploadId: 'upload-a', categories: { '8': 'MATERIAL' }, reason: 'Detailed package cost', acknowledgeExisting: false },
    })).rejects.toThrow(/explicitly acknowledge adding these rows/);
    expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
  });
});
