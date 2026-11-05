jest.mock('@/lib/prisma', () => ({
  prisma: { $transaction: jest.fn() },
  transactionContext: { run: jest.fn((_context: unknown, callback: () => unknown) => callback()) },
}));

import { prisma } from '@/lib/prisma';
import { buildDraftBOQChecksum } from '@/lib/boq/draft-workflow';
import { runWorkPackagePlanningCommand, WorkPackagePlanningError } from '@/lib/scheduling/work-package-planning';

const actor = { id: 'actor-a', role: 'PROJECT_ENGINEER', name: 'Engineer' };
const item = {
  id: 'boq-item-a', itemCode: '1.1', category: 'General', description: 'Excavate foundation', unit: 'm3',
  quantity: 10, combinedUnitCost: 3.33, totalCost: 33.33,
};
const checksum = buildDraftBOQChecksum([item]);
const version = { id: 'boq-version-a', projectId: 'project-a', versionNumber: 1, status: 'APPROVED', checksum };

function setup(options: { locked?: boolean; workflowStatus?: string; rowVersion?: number } = {}) {
  const schedule = {
    id: 'schedule-a', projectId: 'project-a', name: 'Work Packages', workflowStatus: options.workflowStatus ?? 'AI_GENERATED_DRAFT',
    generationRulesVersion: 'BOQ_WPS_WORKSPACE_V1', rowVersion: options.rowVersion ?? 1,
    lockedBOQVersionId: version.id, lockedBOQChecksum: checksum, awardedContractAmount: '33.33', scheduledAmount: '0', differenceAmount: '33.33',
  };
  const tx = {
    bOQReviewState:{findUnique:jest.fn().mockResolvedValue(null)},
    workPackageExecutionState:{findUnique:jest.fn().mockResolvedValue(null)},
    project: { findUnique: jest.fn().mockResolvedValue({ id: 'project-a', boqLocked: options.locked ?? true, contractAmount: 33.33 }) },
    projectBOQVersion: { findFirst: jest.fn().mockResolvedValue(version) },
    awardedBOQItem: { findMany: jest.fn().mockResolvedValue([item]) },
    projectSchedule: {
      findFirst: jest.fn().mockResolvedValue(schedule),
      create: jest.fn().mockResolvedValue(schedule),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    scheduleWBS: { findFirst: jest.fn().mockResolvedValue({ id: 'wbs-a', scheduleId: schedule.id }), create: jest.fn().mockResolvedValue({ id: 'wbs-a' }) },
    scheduleActivity: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({ id: 'activity-a' }), findFirst: jest.fn().mockResolvedValue({ id: 'activity-a' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    scheduleBOQAllocation: { create: jest.fn().mockResolvedValue({ id: 'allocation-a' }), findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
    scheduleDependency: { findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  (prisma.$transaction as jest.Mock).mockImplementation((callback: unknown) => (callback as (transaction: typeof tx) => unknown)(tx));
  return { schedule, tx };
}

describe('BOQ work package planning commands', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refuses planning until an approved BOQ is locked', async () => {
    setup({ locked: false });
    await expect(runWorkPackagePlanningCommand({ projectId: 'project-a', actor, body: { action: 'start' } }))
      .rejects.toMatchObject<Partial<WorkPackagePlanningError>>({ message: 'PROJECT_BOQ_NOT_LOCKED', status: 409 });
  });

  it('starts a draft pinned to the approved BOQ checksum and creates the General WBS', async () => {
    const { tx } = setup();
    tx.projectSchedule.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const result = await runWorkPackagePlanningCommand({ projectId: 'project-a', actor, body: { action: 'start' } });
    expect(tx.projectSchedule.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      lockedBOQVersionId: version.id, lockedBOQChecksum: checksum, generationRulesVersion: 'BOQ_WPS_WORKSPACE_V1',
    }) }));
    expect(tx.scheduleWBS.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: 'General' }) }));
    expect(result).toMatchObject({ scheduleId: 'schedule-a', rowVersion: 1, created: true });
  });

  it('does not create an allocation that exceeds the approved BOQ quantity', async () => {
    const { tx } = setup();
    tx.scheduleBOQAllocation.findMany.mockResolvedValueOnce([{ id: 'allocation-existing', allocatedQuantity: '8' }]);
    await expect(runWorkPackagePlanningCommand({ projectId: 'project-a', actor, body: {
      action: 'allocate', expectedRowVersion: 1, boqItemId: item.id, activityId: 'activity-a', allocatedQuantity: '3',
    } })).rejects.toMatchObject<Partial<WorkPackagePlanningError>>({ message: 'ALLOCATION_EXCEEDS_BOQ_QUANTITY', status: 409 });
    expect(tx.scheduleBOQAllocation.create).not.toHaveBeenCalled();
    expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
  });

  it('suggests a section package and keeps stated BOQ amounts authoritative', async () => {
    const { tx } = setup();
    tx.projectSchedule.findFirst.mockResolvedValueOnce({
      id: 'schedule-a', projectId: 'project-a', workflowStatus: 'AI_GENERATED_DRAFT', generationRulesVersion: 'BOQ_WPS_WORKSPACE_V1',
      rowVersion: 1, lockedBOQVersionId: version.id, lockedBOQChecksum: checksum, awardedContractAmount: '33.33',
    });
    await runWorkPackagePlanningCommand({ projectId: 'project-a', actor, body: { action: 'suggest', expectedRowVersion: 1 } });
    expect(tx.scheduleActivity.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      plannedQuantity: 0,
    }) }));
    const activityData = tx.scheduleActivity.create.mock.calls[0][0].data;
    expect(activityData).not.toHaveProperty('plannedStartDate');
    expect(activityData).not.toHaveProperty('plannedFinishDate');
    const allocationData = tx.scheduleBOQAllocation.create.mock.calls[0][0].data;
    expect(allocationData.awardedBoqItemId).toBe(item.id);
    expect(allocationData.allocatedAmount.toString()).toBe('33.33');
  });

  it('keeps zero quantity and zero amount BOQ rows as reference-only suggestions', async () => {
    const { tx } = setup();
    const zeroItem = { ...item, quantity: 0, combinedUnitCost: 0, totalCost: 0 };
    const zeroChecksum = buildDraftBOQChecksum([zeroItem]);
    tx.awardedBOQItem.findMany.mockResolvedValueOnce([zeroItem]);
    tx.projectBOQVersion.findFirst.mockResolvedValueOnce({ ...version, checksum: zeroChecksum });
    tx.projectSchedule.findFirst.mockResolvedValueOnce({
      id: 'schedule-a', projectId: 'project-a', workflowStatus: 'AI_GENERATED_DRAFT', generationRulesVersion: 'BOQ_WPS_WORKSPACE_V1',
      rowVersion: 1, lockedBOQVersionId: version.id, lockedBOQChecksum: zeroChecksum, awardedContractAmount: '33.33',
    });
    await runWorkPackagePlanningCommand({ projectId: 'project-a', actor, body: { action: 'suggest', expectedRowVersion: 1 } });
    const allocationData = tx.scheduleBOQAllocation.create.mock.calls[0][0].data;
    expect(allocationData.allocationMode).toBe('REFERENCE_ONLY');
    expect(allocationData.allocatedQuantity.toString()).toBe('0');
    expect(allocationData.allocatedAmount.toString()).toBe('0');
  });

  it('uses a section name rather than a long pay-item description for package display', async () => {
    const { tx } = setup();
    const longItem = { ...item, description: 'Survey and set out total station control benchmark '.repeat(8) };
    const longChecksum = buildDraftBOQChecksum([longItem]);
    tx.awardedBOQItem.findMany.mockResolvedValueOnce([longItem]);
    tx.projectBOQVersion.findFirst.mockResolvedValueOnce({ ...version, checksum: longChecksum });
    tx.projectSchedule.findFirst.mockResolvedValueOnce({
      id: 'schedule-a', projectId: 'project-a', workflowStatus: 'AI_GENERATED_DRAFT', generationRulesVersion: 'BOQ_WPS_WORKSPACE_V1',
      rowVersion: 1, lockedBOQVersionId: version.id, lockedBOQChecksum: longChecksum, awardedContractAmount: '33.33',
    });
    await runWorkPackagePlanningCommand({ projectId: 'project-a', actor, body: { action: 'suggest', expectedRowVersion: 1 } });
    const activityData = tx.scheduleActivity.create.mock.calls[0][0].data;
    expect(activityData.name).toBe("General");
    expect(activityData.description).toBe("General");
    expect(tx.scheduleBOQAllocation.create.mock.calls[0][0].data.awardedBoqItemId).toBe(longItem.id);
  });

  it('rejects stale schedule row versions before any planning mutation', async () => {
    const { tx } = setup({ rowVersion: 4 });
    await expect(runWorkPackagePlanningCommand({ projectId: 'project-a', actor, body: {
      action: 'create', expectedRowVersion: 3, name: 'Footings',
    } })).rejects.toMatchObject<Partial<WorkPackagePlanningError>>({ message: 'SCHEDULE_VERSION_CONFLICT', status: 409 });
    expect(tx.scheduleActivity.create).not.toHaveBeenCalled();
  });

  it('does not let a draft command mutate an active baseline', async () => {
    const { tx } = setup({ workflowStatus: 'ACTIVE_BASELINE' });
    await expect(runWorkPackagePlanningCommand({ projectId: 'project-a', actor, body: {
      action: 'create', expectedRowVersion: 1, name: 'Footings',
    } })).rejects.toMatchObject<Partial<WorkPackagePlanningError>>({ message: 'SCHEDULE_NOT_EDITABLE_IN_CURRENT_STATUS', status: 409 });
    expect(tx.scheduleActivity.create).not.toHaveBeenCalled();
  });
});
