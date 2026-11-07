jest.mock('@/lib/prisma', () => ({
  prisma: { $transaction: jest.fn() },
  transactionContext: { run: jest.fn((_context: unknown, callback: () => unknown) => callback()) },
}));

import { prisma } from '@/lib/prisma';
import { buildDraftBOQChecksum } from '@/lib/boq/draft-workflow';
import { runWorkPackagePlanningCommand, WorkPackagePlanningError } from '@/lib/scheduling/work-package-planning';
import { emptyWorkPackagePlanDetails } from '@/lib/scheduling/work-package-details-types';

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

  function withLocations(tx: ReturnType<typeof setup>['tx'], schedule: ReturnType<typeof setup>['schedule'], allocationLocations: Record<string, string> = {}) {
    const details = { ...emptyWorkPackagePlanDetails(), locations: [{ id: 'loc-site', name: 'Project Site', parentId: null, isActive: true }, { id: 'loc-old', name: 'Old yard', parentId: null, isActive: false }], allocationLocations };
    const located = { ...schedule, description: JSON.stringify(details) };
    tx.projectSchedule.findFirst.mockResolvedValue(located);
    Object.assign(tx.projectSchedule, { findMany: jest.fn().mockResolvedValue([located]) });
    return located;
  }
  const savedDetails = (tx: ReturnType<typeof setup>['tx']) => JSON.parse(tx.projectSchedule.updateMany.mock.calls.at(-1)[0].data.description);

  it('sets one location on every BOQ line of a package', async () => {
    const { tx, schedule } = setup();
    withLocations(tx, schedule, { 'alloc-1': 'loc-other' });
    tx.scheduleBOQAllocation.findMany.mockResolvedValueOnce([{ id: 'alloc-1' }, { id: 'alloc-2' }]);
    const result = await runWorkPackagePlanningCommand({ projectId: 'project-a', actor, body: { action: 'locate-package', expectedRowVersion: 1, activityId: 'activity-a', locationId: 'loc-site' } });
    expect(tx.scheduleBOQAllocation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { scheduleId: 'schedule-a', activityId: 'activity-a' } }));
    expect(savedDetails(tx).allocationLocations).toEqual({ 'alloc-1': 'loc-site', 'alloc-2': 'loc-site' });
    expect(result).toMatchObject({ rowVersion: 2, located: 2 });
  });

  it('clears a package location and refuses archived locations', async () => {
    const { tx, schedule } = setup();
    withLocations(tx, schedule, { 'alloc-1': 'loc-site' });
    await expect(runWorkPackagePlanningCommand({ projectId: 'project-a', actor, body: { action: 'locate-package', expectedRowVersion: 1, activityId: 'activity-a', locationId: 'loc-old' } }))
      .rejects.toMatchObject<Partial<WorkPackagePlanningError>>({ message: 'ACTIVE_LOCATION_REQUIRED' });
    tx.scheduleBOQAllocation.findMany.mockResolvedValueOnce([{ id: 'alloc-1' }]);
    await runWorkPackagePlanningCommand({ projectId: 'project-a', actor, body: { action: 'locate-package', expectedRowVersion: 1, activityId: 'activity-a', locationId: '' } });
    expect(savedDetails(tx).allocationLocations).toEqual({});
  });

  it('uses one named location for every unlocated line, reusing a matching project location', async () => {
    const { tx, schedule } = setup();
    withLocations(tx, schedule, { 'alloc-1': 'loc-other' });
    tx.scheduleBOQAllocation.findMany.mockResolvedValueOnce([{ id: 'alloc-1' }, { id: 'alloc-2' }, { id: 'alloc-3' }]);
    const result = await runWorkPackagePlanningCommand({ projectId: 'project-a', actor, body: { action: 'locate-all-at', expectedRowVersion: 1, name: '  project site ' } });
    expect(tx.workPackageExecutionState.findUnique).toHaveBeenCalled();
    expect(savedDetails(tx).allocationLocations).toEqual({ 'alloc-1': 'loc-other', 'alloc-2': 'loc-site', 'alloc-3': 'loc-site' });
    expect(result).toMatchObject({ rowVersion: 2, locationId: 'loc-site', located: 2 });
  });

  function withPackages(tx: ReturnType<typeof setup>['tx'], links: { predecessorId: string; successorId: string; type: string }[] = []) {
    Object.assign(tx.scheduleActivity, { findMany: jest.fn().mockResolvedValue([{ id: 'wp-1' }, { id: 'wp-2' }, { id: 'wp-3' }]), update: jest.fn().mockResolvedValue({}) });
    Object.assign(tx.scheduleDependency, { findMany: jest.fn().mockResolvedValue(links) });
    tx.scheduleDependency.create.mockResolvedValue({ id: 'dep-new' });
  }

  it('saves accepted AI dates and links together in one plan change', async () => {
    const { tx } = setup();
    withPackages(tx);
    const result = await runWorkPackagePlanningCommand({ projectId: 'project-a', actor, body: { action: 'apply-plan-dates', expectedRowVersion: 1,
      dates: [{ activityId: 'wp-1', start: '2026-12-01', finish: '2026-12-14' }, { activityId: 'wp-2', start: '2026-12-15', finish: '2026-12-15' }],
      links: [{ predecessorId: 'wp-1', successorId: 'wp-2', lagDays: 0, remarks: 'AI Check: cure first' }] } });
    expect(tx.projectSchedule.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.scheduleActivity.update).toHaveBeenCalledWith({ where: { id: 'wp-1' }, data: { plannedStartDate: new Date('2026-12-01T00:00:00.000Z'), plannedFinishDate: new Date('2026-12-14T00:00:00.000Z'), plannedDuration: 14 } });
    expect(tx.scheduleActivity.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'wp-2' }, data: expect.objectContaining({ plannedDuration: 1 }) }));
    expect(tx.scheduleDependency.create).toHaveBeenCalledWith({ data: { scheduleId: 'schedule-a', predecessorId: 'wp-1', successorId: 'wp-2', type: 'FS', lagDays: 0, remarks: 'AI Check: cure first' } });
    expect(result).toMatchObject({ rowVersion: 2, dated: 2, linked: 1 });
  });

  it('saves nothing when an accepted link would make a loop or a finish is before its start', async () => {
    const { tx } = setup();
    withPackages(tx, [{ predecessorId: 'wp-2', successorId: 'wp-3', type: 'FS' }]);
    await expect(runWorkPackagePlanningCommand({ projectId: 'project-a', actor, body: { action: 'apply-plan-dates', expectedRowVersion: 1,
      links: [{ predecessorId: 'wp-1', successorId: 'wp-2' }, { predecessorId: 'wp-3', successorId: 'wp-1' }] } }))
      .rejects.toMatchObject<Partial<WorkPackagePlanningError>>({ message: 'DEPENDENCY_CYCLE', status: 409 });
    await expect(runWorkPackagePlanningCommand({ projectId: 'project-a', actor, body: { action: 'apply-plan-dates', expectedRowVersion: 1,
      dates: [{ activityId: 'wp-1', start: '2026-12-10', finish: '2026-12-01' }] } }))
      .rejects.toMatchObject<Partial<WorkPackagePlanningError>>({ message: 'FINISH_BEFORE_START' });
    expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
    expect(tx.scheduleActivity.update).not.toHaveBeenCalled();
    expect(tx.scheduleDependency.create).not.toHaveBeenCalled();
  });

  it('does not let a draft command mutate an active baseline', async () => {
    const { tx } = setup({ workflowStatus: 'ACTIVE_BASELINE' });
    await expect(runWorkPackagePlanningCommand({ projectId: 'project-a', actor, body: {
      action: 'create', expectedRowVersion: 1, name: 'Footings',
    } })).rejects.toMatchObject<Partial<WorkPackagePlanningError>>({ message: 'SCHEDULE_NOT_EDITABLE_IN_CURRENT_STATUS', status: 409 });
    expect(tx.scheduleActivity.create).not.toHaveBeenCalled();
  });
});
