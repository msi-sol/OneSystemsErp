jest.mock('@/lib/prisma', () => ({
  prisma: { $transaction: jest.fn() },
  transactionContext: { run: jest.fn((_context, callback) => callback()) },
}));

jest.mock('@/lib/scheduling/scheduleWorkflow', () => ({
  assertScheduleEditable: jest.fn((schedule: { workflowStatus: string }) => {
    if (!['AI_GENERATED_DRAFT', 'INVALID_GENERATED_DRAFT', 'TECHNICAL_REVISIONS_REQUIRED'].includes(schedule.workflowStatus)) {
      throw new Error('SCHEDULE_NOT_EDITABLE_IN_CURRENT_STATUS');
    }
  }),
}));

import { prisma, transactionContext } from '@/lib/prisma';
import {
  editDraftScheduleActivity,
  editDraftScheduleAllocation,
  createDraftScheduleActivity,
  deleteDraftScheduleActivity,
} from '@/lib/scheduling/draft-editing';

const prismaMock = prisma as unknown as { $transaction: jest.Mock };
const schedule = {
  id: 'draft-schedule',
  projectId: 'project-a',
  workflowStatus: 'AI_GENERATED_DRAFT',
  rowVersion: 8,
  lockedBOQVersionId: 'boq-version-a',
  lockedBOQChecksum: 'approved-checksum-a',
  awardedContractAmount: '150.00',
  scheduledAmount: '3.00',
  differenceAmount: '147.00',
};

function makeAllocationFixture(options: {
  workflowStatus?: string;
  scheduleUpdateCount?: number;
  itemQuantity?: number;
  itemAmount?: string;
  splitQuantities?: string[];
} = {}) {
  const selectedSchedule = { ...schedule, workflowStatus: options.workflowStatus ?? schedule.workflowStatus };
  const splitQuantities = options.splitQuantities ?? ['1', '2'];
  const allocations = splitQuantities.map((allocatedQuantity, index) => ({
    id: `alloc-${String.fromCharCode(97 + index)}`,
    activityId: `activity-${String.fromCharCode(97 + index)}`,
    awardedBoqItemId: 'boq-item-a',
    allocatedQuantity,
    allocatedAmount: '0.00',
    activity: { id: `activity-${String.fromCharCode(97 + index)}` },
  }));
  const tx = {
    scheduleBOQAllocation: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'alloc-a',
        projectId: 'project-a',
        scheduleId: 'draft-schedule',
        activityId: 'activity-a',
        awardedBoqItemId: 'boq-item-a',
        allocatedQuantity: '1',
        allocatedAmount: '1.00',
        activity: { id: 'activity-a', scheduleId: 'draft-schedule', schedule: selectedSchedule },
        awardedBoqItem: {
          id: 'boq-item-a',
          projectId: 'project-a',
          quantity: options.itemQuantity ?? 3,
          totalCost: options.itemAmount ?? '101.01',
          combinedUnitCost: 12,
        },
      }),
      findMany: jest.fn()
        .mockResolvedValueOnce(allocations)
        .mockResolvedValueOnce(allocations.map(({ id, activityId, awardedBoqItemId, allocatedAmount }) => ({ id, activityId, awardedBoqItemId, allocatedAmount }))),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    projectSchedule: {
      updateMany: jest.fn().mockResolvedValue({ count: options.scheduleUpdateCount ?? 1 }),
    },
    project: { findUnique: jest.fn().mockResolvedValue({ boqLocked: true }) },
    projectBOQVersion: {
      findFirst: jest.fn().mockResolvedValue({ status: 'APPROVED', checksum: 'approved-checksum-a' }),
    },
    scheduleActivity: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: jest.fn().mockResolvedValue({}),count:jest.fn().mockResolvedValue(0) },
  };
  prismaMock.$transaction.mockImplementation((callback: (transaction: typeof tx) => unknown) => callback(tx));
  return { tx, allocations };
}

function makeActivityFixture() {
  const activity = {
    id: 'activity-a',
    scheduleId: 'draft-schedule',
    name: 'Excavation',
    activityCode: 'EX-1',
    description: null,
    wbsId: null,
    plannedStartDate: new Date('2026-11-04T00:00:00.000Z'),
    plannedFinishDate: new Date('2026-11-10T00:00:00.000Z'),
    actualStartDate: null,
    actualFinishDate: null,
    plannedDuration: 7,
    plannedQuantity: 100,
    unit: 'm3',
    status: 'NOT_STARTED',
    priority: 'MEDIUM',
    actualProgressPercent: 0,
    actualQuantity: 0,
    schedule,
  };
  const tx = {
    scheduleActivity: {
      findUnique: jest.fn().mockResolvedValue(activity),
      update: jest.fn().mockResolvedValue(activity),
    },
    scheduleWBS: { findFirst: jest.fn().mockResolvedValue({ id: 'wbs-a' }) },
    projectSchedule: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    scheduleProgressUpdate: { create: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}), count:jest.fn().mockResolvedValue(0) },
  };
  prismaMock.$transaction.mockImplementation((callback: (transaction: typeof tx) => unknown) => callback(tx));
  return { tx, activity };
}

function makeDeleteActivityFixture(options: { scheduleUpdateCount?: number } = {}) {
  const activity = {
    id: 'activity-a', scheduleId: 'draft-schedule', name: 'Excavation', activityCode: 'EX-1',
    description: null, wbsId: null, plannedStartDate: null, plannedFinishDate: null,
    actualStartDate: null, actualFinishDate: null, plannedDuration: 0, plannedQuantity: 0,
    unit: null, status: 'NOT_STARTED', priority: 'MEDIUM', actualProgressPercent: 0,
    actualQuantity: 0, allocatedAmount: '1.00', schedule,
    boqAllocations: [{ id: 'allocation-a', allocatedAmount: '1.00' }],
  };
  const tx = {
    scheduleActivity: {
      findUnique: jest.fn().mockResolvedValue(activity),
      delete: jest.fn().mockResolvedValue(activity),
    },
    projectSchedule: { updateMany: jest.fn().mockResolvedValue({ count: options.scheduleUpdateCount ?? 1 }) },
    auditLog: { create: jest.fn().mockResolvedValue({}), count:jest.fn().mockResolvedValue(0) },
  };
  prismaMock.$transaction.mockImplementation((callback: (transaction: typeof tx) => unknown) => callback(tx));
  return { tx, activity };
}

function makeCreateActivityFixture(options: { scheduleUpdateCount?: number; workflowStatus?: string } = {}) {
  const selectedSchedule = { ...schedule, workflowStatus: options.workflowStatus ?? schedule.workflowStatus };
  const activity = { id: 'activity-new', scheduleId: schedule.id, name: 'Concrete pour' };
  const tx = {
    projectSchedule: {
      findFirst: jest.fn().mockResolvedValue(selectedSchedule),
      updateMany: jest.fn().mockResolvedValue({ count: options.scheduleUpdateCount ?? 1 }),
    },
    scheduleWBS: { findFirst: jest.fn().mockResolvedValue({ id: 'wbs-root' }) },
    scheduleActivity: { create: jest.fn().mockResolvedValue(activity) },
    auditLog: { create: jest.fn().mockResolvedValue({}), count:jest.fn().mockResolvedValue(0) },
  };
  prismaMock.$transaction.mockImplementation((callback: (transaction: typeof tx) => unknown) => callback(tx));
  return { tx, activity };
}

const actor = { id: 'engineer-a', role: 'PROJECT_ENGINEER', name: 'Synthetic Engineer' };

describe('draft schedule editing service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects BOQ scope oversubscription before writing', async () => {
    const { tx } = makeAllocationFixture();
    await expect(editDraftScheduleAllocation({
      projectId: 'project-a', allocationId: 'alloc-a', actor,
      body: { allocatedQuantity: '2', expectedRowVersion: 8 },
    })).rejects.toMatchObject({ name: 'DraftEditingError', status: 400, message: 'ALLOCATION_EXCEEDS_BOQ_QUANTITY' });
    expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
    expect(tx.scheduleBOQAllocation.updateMany).not.toHaveBeenCalled();
  });

  it('rejects stale schedule versions before changing allocations', async () => {
    const { tx } = makeAllocationFixture({ scheduleUpdateCount: 0 });
    await expect(editDraftScheduleAllocation({
      projectId: 'project-a', allocationId: 'alloc-a', actor,
      body: { allocatedQuantity: '1', expectedRowVersion: 8 },
    })).rejects.toMatchObject({ name: 'DraftEditingError', status: 409, message: 'SCHEDULE_VERSION_CONFLICT' });
    expect(tx.scheduleBOQAllocation.updateMany).not.toHaveBeenCalled();
  });

  it('requires an explicit expected row version for activity PUT edits', async () => {
    const { tx } = makeActivityFixture();
    await expect(editDraftScheduleActivity({
      projectId: 'project-a', activityId: 'activity-a', actor,
      body: { name: 'Updated excavation' },
    })).rejects.toMatchObject({ name: 'DraftEditingError', status: 400, message: 'MISSING_EXPECTED_ROW_VERSION' });
    expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
    expect(tx.scheduleActivity.update).not.toHaveBeenCalled();
  });

  it('creates a draft activity with project-scoped WBS validation, row versioning, and audit', async () => {
    const { tx, activity } = makeCreateActivityFixture();
    const result = await createDraftScheduleActivity({
      projectId: 'project-a', actor,
      body: { name: ' Concrete pour ', expectedRowVersion: 8, wbsId: 'wbs-root', plannedDuration: 3 },
    });

    expect(result).toBe(activity);
    expect(tx.projectSchedule.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ projectId: 'project-a', rowVersion: 8 }),
      data: expect.objectContaining({ rowVersion: { increment: 1 } }),
    }));
    expect(tx.scheduleActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'Concrete pour', scheduleId: schedule.id, wbsId: 'wbs-root' }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: actor.id, actionType: 'DRAFT_SCHEDULE_ACTIVITY_CREATED' }),
    }));
  });

  it('deletes only an editable draft activity with matching row version and an audit record', async () => {
    const { tx } = makeDeleteActivityFixture();
    const result = await deleteDraftScheduleActivity({
      projectId: 'project-a', activityId: 'activity-a', actor,
      body: { expectedRowVersion: 8 },
    });

    expect(result).toEqual({ id: 'activity-a', rowVersion: 9 });
    expect(tx.projectSchedule.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ rowVersion: 8, workflowStatus: 'AI_GENERATED_DRAFT' }),
      data: expect.objectContaining({ scheduledAmount: expect.anything(), differenceAmount: expect.anything(), rowVersion: { increment: 1 } }),
    }));
    expect(tx.scheduleActivity.delete).toHaveBeenCalledWith({ where: { id: 'activity-a' } });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: actor.id, actionType: 'DRAFT_SCHEDULE_ACTIVITY_DELETED' }),
    }));
  });

  it('does not delete an activity if its schedule version changed', async () => {
    const { tx } = makeDeleteActivityFixture({ scheduleUpdateCount: 0 });
    await expect(deleteDraftScheduleActivity({
      projectId: 'project-a', activityId: 'activity-a', actor,
      body: { expectedRowVersion: 8 },
    })).rejects.toMatchObject({ name: 'DraftEditingError', status: 409, message: 'SCHEDULE_VERSION_CONFLICT' });
    expect(tx.scheduleActivity.delete).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects edits to immutable schedules', async () => {
    const { tx } = makeAllocationFixture({ workflowStatus: 'ACTIVE_BASELINE' });
    await expect(editDraftScheduleAllocation({
      projectId: 'project-a', allocationId: 'alloc-a', actor,
      body: { allocatedQuantity: '1', expectedRowVersion: 8 },
    })).rejects.toMatchObject({ name: 'DraftEditingError', status: 409, message: 'SCHEDULE_NOT_EDITABLE_IN_CURRENT_STATUS' });
    expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
  });

  it('rejects impossible calendar dates before writes', async () => {
    const { tx } = makeActivityFixture();
    await expect(editDraftScheduleActivity({
      projectId: 'project-a', activityId: 'activity-a', actor,
      body: { plannedStartDate: '2026-02-30', expectedRowVersion: 8 },
    })).rejects.toMatchObject({ name: 'DraftEditingError', status: 400, message: 'INVALID_PLANNED_START_DATE' });
    expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
    expect(tx.scheduleActivity.update).not.toHaveBeenCalled();
  });

  it('rejects non-ISO date strings instead of relying on JavaScript date parsing', async () => {
    const { tx } = makeActivityFixture();
    await expect(editDraftScheduleActivity({
      projectId: 'project-a', activityId: 'activity-a', actor,
      body: { plannedStartDate: '3', expectedRowVersion: 8 },
    })).rejects.toMatchObject({ name: 'DraftEditingError', status: 400, message: 'INVALID_PLANNED_START_DATE' });
    expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
  });

  it('rejects database-overlength activity strings as validation errors', async () => {
    const cases = [
      { body: { name: 'n'.repeat(192) }, error: 'NAME_TOO_LONG' },
      { body: { activityCode: 'c'.repeat(192) }, error: 'ACTIVITY_CODE_TOO_LONG' },
      { body: { unit: 'u'.repeat(192) }, error: 'UNIT_TOO_LONG' },
      { body: { description: 'd'.repeat(10001) }, error: 'DESCRIPTION_TOO_LONG' },
    ];

    for (const entry of cases) {
      const { tx } = makeActivityFixture();
      await expect(editDraftScheduleActivity({
        projectId: 'project-a', activityId: 'activity-a', actor,
        body: { ...entry.body, expectedRowVersion: 8 },
      })).rejects.toMatchObject({ name: 'DraftEditingError', status: 400, message: entry.error });
      expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
      expect(tx.scheduleActivity.update).not.toHaveBeenCalled();
    }
  });

  it('rejects allocation quantities beyond Decimal(65,30) scale', async () => {
    const { tx } = makeAllocationFixture();
    await expect(editDraftScheduleAllocation({
      projectId: 'project-a', allocationId: 'alloc-a', actor,
      body: { allocatedQuantity: `0.${'1'.repeat(31)}`, expectedRowVersion: 8 },
    })).rejects.toMatchObject({ name: 'DraftEditingError', status: 400, message: 'INVALID_ALLOCATED_QUANTITY' });
    expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
    expect(tx.scheduleBOQAllocation.updateMany).not.toHaveBeenCalled();
  });

  it('adds manual progress history only when the recorded value changes', async () => {
    const { tx } = makeActivityFixture();
    await editDraftScheduleActivity({
      projectId: 'project-a', activityId: 'activity-a', actor,
      body: { actualProgressPercent: 25, expectedRowVersion: 8 },
    });

    expect(tx.scheduleProgressUpdate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        activityId: 'activity-a',
        scheduleId: 'draft-schedule',
        progressPercent: 25,
        reportedById: actor.id,
      }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('does not append duplicate manual progress history for an unchanged value', async () => {
    const { tx } = makeActivityFixture();
    await editDraftScheduleActivity({
      projectId: 'project-a', activityId: 'activity-a', actor,
      body: { actualProgressPercent: 0, expectedRowVersion: 8 },
    });

    expect(tx.scheduleProgressUpdate.create).not.toHaveBeenCalled();
  });

  it('allocates authoritative BOQ amount proportionally and absorbs final cent rounding', async () => {
    const { tx } = makeAllocationFixture();
    const result = await editDraftScheduleAllocation({
      projectId: 'project-a', allocationId: 'alloc-a', actor,
      body: { allocatedQuantity: '1', expectedRowVersion: 8 },
    });

    expect(result).toMatchObject({ allocatedAmount: '33.67', scheduledAmount: '101.01', differenceAmount: '48.99', rowVersion: 9 });
    const writes = tx.scheduleBOQAllocation.updateMany.mock.calls.map(([input]) => input.data);
    expect(writes.map((write: { allocatedAmount: { toString(): string } }) => write.allocatedAmount.toString())).toEqual(['33.67', '67.34']);
    expect(writes.reduce((sum: number, write: { allocatedAmount: { toNumber(): number } }) => sum + write.allocatedAmount.toNumber(), 0)).toBeCloseTo(101.01, 8);
    expect(tx.projectSchedule.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ scheduledAmount: expect.anything(), differenceAmount: expect.anything(), rowVersion: { increment: 1 } }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(transactionContext.run).toHaveBeenCalledWith({ sourceProvenance: 'GATE9_WORKFLOW_ENGINE' }, expect.any(Function));
  });

  it('distributes cents cumulatively without a negative final split', async () => {
    const { tx } = makeAllocationFixture({ itemQuantity: 4, itemAmount: '0.02', splitQuantities: ['1', '1', '1', '1'] });
    const result = await editDraftScheduleAllocation({
      projectId: 'project-a', allocationId: 'alloc-a', actor,
      body: { allocatedQuantity: '1', expectedRowVersion: 8 },
    });

    expect(result.scheduledAmount).toBe('0.02');
    const writes = tx.scheduleBOQAllocation.updateMany.mock.calls.map(([input]) => input.data);
    expect(writes.map((write: { allocatedAmount: { toString(): string } }) => write.allocatedAmount.toString())).toEqual(['0.01', '0', '0.01', '0']);
    expect(writes.every((write: { allocatedAmount: { isNegative(): boolean } }) => !write.allocatedAmount.isNegative())).toBe(true);
  });
});


describe('native work-package deletion preserves lineage', () => {
  it.each(['progress', 'sequence'])('blocks deletion with existing %s references', async kind => {
    const {tx, activity}=makeDeleteActivityFixture();
    tx.scheduleActivity.findUnique.mockResolvedValue({...activity,schedule:{...schedule,generationRulesVersion:'BOQ_WPS_WORKSPACE_V1',description:null}});
    Object.assign(tx, {
      scheduleProgressUpdate:{count:jest.fn().mockResolvedValue(kind==='progress'?1:0)},
      scheduleDelayRecord:{count:jest.fn().mockResolvedValue(0)},
      schedulePOWMapping:{count:jest.fn().mockResolvedValue(0)},
      scheduleDependency:{count:jest.fn().mockResolvedValue(kind==='sequence'?1:0)},
    });
    await expect(deleteDraftScheduleActivity({projectId:'project-a',activityId:'activity-a',actor,body:{expectedRowVersion:8}})).rejects.toMatchObject({status:409,message:kind==='progress'?'PACKAGE_HAS_EXECUTION_HISTORY':'REMOVE_PACKAGE_PLANNING_REFERENCES_FIRST'});
    expect(tx.scheduleActivity.delete).not.toHaveBeenCalled();
    expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
  });
});
