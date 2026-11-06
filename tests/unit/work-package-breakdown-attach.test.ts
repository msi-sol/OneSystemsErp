jest.mock('@/lib/prisma', () => ({
  prisma: { $transaction: jest.fn() },
  transactionContext: { run: (_context: unknown, work: () => unknown) => work() },
}));
jest.mock('@/lib/scheduling/planning-capacity', () => ({ planningCapacity: jest.fn() }));
jest.mock('@/lib/scheduling/work-package-execution', () => ({ assertWorkPackageExecutedScope: jest.fn() }));
jest.mock('@/lib/boq/workspace-parser', () => ({ parseWorkspaceWorkbook: jest.fn() }));
jest.mock('@/lib/boq/workspace-service', () => ({
  storeWorkspaceOriginal: jest.fn(),
  removeWorkspaceOriginal: jest.fn(),
}));

import { prisma } from '@/lib/prisma';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { assertWorkPackageExecutedScope } from '@/lib/scheduling/work-package-execution';
import { parseWorkspaceWorkbook } from '@/lib/boq/workspace-parser';
import { removeWorkspaceOriginal, storeWorkspaceOriginal } from '@/lib/boq/workspace-service';
import { attachWorkPackageBreakdown, WorkPackageDetailsError } from '@/lib/scheduling/work-package-details';
import { WORK_PACKAGE_DETAILS_KIND } from '@/lib/scheduling/work-package-details-types';
import type { WorkspaceMapping } from '@/lib/boq/workspace-types';

const fileHash = 'b'.repeat(64);
const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x42]);
const mapping: WorkspaceMapping = { headerRow: 2, itemCode: 1, description: 2, unit: 3, quantity: 4, unitCost: 5, amount: 6 };
const rows = [
  { sourceRowNumber: 3, section: 'Earthworks', sectionSourceKey: 'source:heading:1', sectionOrder: 2, sectionStartRow: 1,
    quantityDefaulted: false, unitDefaulted: false, itemCodeSynthesized: false, sourceUnitCost: 2, rateDerived: false,
    itemCode: 'E-1', description: 'Excavate trench', unit: 'm3', quantity: 3, unitCost: 2, amount: 6 },
  { sourceRowNumber: 4, section: 'Earthworks', sectionSourceKey: 'source:heading:1', sectionOrder: 2, sectionStartRow: 1,
    quantityDefaulted: false, unitDefaulted: false, itemCodeSynthesized: true, sourceUnitCost: null, rateDerived: true,
    itemCode: '', description: 'Haul spoil', unit: 'trip', quantity: 2, unitCost: 4, amount: 8 },
];
const actor = { id: 'engineer-a', role: 'PROJECT_ENGINEER' };

function validUpload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'saved-upload', activityId: 'package-a', fileName: 'dupa.xlsx', fileHash, storagePath: 'storage/saved-upload.xlsx',
    sheetName: 'DUPA', mapping, rows, uploadedAt: '2026-11-05T01:02:03.000Z', uploadedById: actor.id,
    originScheduleId: 'schedule-a', appliedAt: null, appliedById: null, resourceIds: [], categories: {}, reason: null,
    ...overrides,
  };
}

function transactionHarness(args: { rowVersion?: number; activity?: { id: string } | null; uploads?: unknown[]; auditFailure?: boolean } = {}) {
  const schedule = {
    id: 'schedule-a', projectId: 'project-a', description: JSON.stringify({
      kind: WORK_PACKAGE_DETAILS_KIND, legacyNote: 'keep existing note', locations: [], constraints: [], resources: [],
      allocationLocations: {}, breakdownUploads: args.uploads ?? [],
    }),
    rowVersion: args.rowVersion ?? 8, workflowStatus: 'AI_GENERATED_DRAFT', generationRulesVersion: 'BOQ_WPS_WORKSPACE_V1',
  };
  const tx = {
    project: { findUnique: jest.fn().mockResolvedValue({ id: 'project-a', status: 'ACTIVE' }) },
    projectSchedule: {
      findFirst: jest.fn().mockResolvedValueOnce(schedule).mockResolvedValueOnce({ ...schedule, activities: [] }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    scheduleActivity: { findFirst: jest.fn().mockResolvedValue(args.activity === undefined ? { id: 'package-a' } : args.activity) },
    auditLog: { create: args.auditFailure ? jest.fn().mockRejectedValue(new Error('audit storage unavailable')) : jest.fn().mockResolvedValue({ id: 'audit-a' }) },
  };
  (planningCapacity as jest.Mock).mockResolvedValue({ canEditPlan: true });
  (assertWorkPackageExecutedScope as jest.Mock).mockResolvedValue(undefined);
  (parseWorkspaceWorkbook as jest.Mock).mockResolvedValue({
    analysis: { fileHash, errors: [], mapping, selectedSheet: 'DUPA' },
    items: rows,
  });
  (storeWorkspaceOriginal as jest.Mock).mockResolvedValue('storage/saved-upload.xlsx');
  (prisma.$transaction as unknown as jest.Mock).mockImplementation((work: (client: unknown) => unknown) => work(tx));
  return { tx, schedule };
}

function attach(expectedRowVersion = 8) {
  return attachWorkPackageBreakdown({
    projectId: 'project-a', scheduleId: 'schedule-a', activityId: 'package-a', expectedRowVersion, actor,
    buffer, fileName: 'dupa.xlsx', fileHash, selectedSheet: 'DUPA', mapping,
  });
}

describe('attach package breakdown evidence', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an activity outside the plan before storing any workbook bytes', async () => {
    const { tx } = transactionHarness({ activity: null });
    await expect(attach()).rejects.toMatchObject({ status: 404 });
    expect(storeWorkspaceOriginal).not.toHaveBeenCalled();
    expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a stale schedule version before storing any workbook bytes', async () => {
    const { tx } = transactionHarness({ rowVersion: 9 });
    await expect(attach(8)).rejects.toThrow(WorkPackageDetailsError);
    expect(storeWorkspaceOriginal).not.toHaveBeenCalled();
    expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
  });

  it('preserves the original bytes and every parsed row without changing BOQ costs', async () => {
    const { tx } = transactionHarness();
    const result = await attach();
    const saveData = tx.projectSchedule.updateMany.mock.calls[0][0].data;
    const savedDetails = JSON.parse(saveData.description);

    expect(storeWorkspaceOriginal).toHaveBeenCalledWith(savedDetails.breakdownUploads[0].id, 'project-a', fileHash, buffer, 'dupa.xlsx');
    expect((storeWorkspaceOriginal as jest.Mock).mock.calls[0][3]).toBe(buffer);
    expect(result).toMatchObject({ rowVersion: 9, scheduleId: 'schedule-a' });
    expect(savedDetails).toMatchObject({ legacyNote: 'keep existing note', resources: [] });
    expect(savedDetails.breakdownUploads).toHaveLength(1);
    expect(savedDetails.breakdownUploads[0]).toMatchObject({
      activityId: 'package-a', fileHash, fileName: 'dupa.xlsx', sheetName: 'DUPA', storagePath: 'storage/saved-upload.xlsx',
      originScheduleId: 'schedule-a', uploadedById: actor.id, appliedAt: null, rows,
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actionType: 'WPS_PACKAGE_BREAKDOWN_PRESERVED' }) }));
    expect(removeWorkspaceOriginal).not.toHaveBeenCalled();
  });

  it('rejects the same package worksheet and hash without creating another stored copy', async () => {
    const { tx } = transactionHarness({ uploads: [validUpload()] });
    await expect(attach()).rejects.toThrow(/already preserved for this package/);
    expect(storeWorkspaceOriginal).not.toHaveBeenCalled();
    expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
  });

  it('removes the stored original when a later audit write fails', async () => {
    const { tx } = transactionHarness({ auditFailure: true });
    await expect(attach()).rejects.toThrow('audit storage unavailable');
    expect(storeWorkspaceOriginal).toHaveBeenCalledTimes(1);
    expect(removeWorkspaceOriginal).toHaveBeenCalledWith('storage/saved-upload.xlsx');
    expect(tx.projectSchedule.updateMany).toHaveBeenCalledTimes(1);
  });

  it('removes the stored original when the schedule CAS loses after storage', async () => {
    const { tx } = transactionHarness();
    tx.projectSchedule.updateMany.mockResolvedValue({ count: 0 });
    await expect(attach()).rejects.toThrow(/SCHEDULE_VERSION_CONFLICT/);
    expect(storeWorkspaceOriginal).toHaveBeenCalledTimes(1);
    expect(removeWorkspaceOriginal).toHaveBeenCalledWith('storage/saved-upload.xlsx');
  });
});
