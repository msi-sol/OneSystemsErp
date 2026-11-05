jest.mock('@/lib/prisma', () => ({
  prisma: { $transaction: jest.fn() },
  transactionContext: { run: jest.fn((_context: unknown, callback: () => unknown) => callback()) },
}));

import { prisma } from '@/lib/prisma';
import { emptyWorkPackagePlanDetails } from '@/lib/scheduling/work-package-details-types';
import { getWorkPackageProjectLocations, mutateWorkPackageProjectLocation } from '@/lib/scheduling/work-package-project-locations';
import { emptyExecutionDocument, type WorkPackageExecutionDocument } from '@/lib/scheduling/work-package-execution-types';

const actor = { id: 'actor-1', role: 'PROJECT_ENGINEER' };
const projectId = 'project-1';

function setup(options: { locations?: Array<{ id: string; name: string; parentId: string | null; code?: string; isActive?: boolean }>; schedules?: Array<{ id: string; description: string; rowVersion: number; workflowStatus: string; generationRulesVersion: string }>; document?: WorkPackageExecutionDocument } = {}) {
  let state: { id: string; projectId: string; rowVersion: number; dataJson: string } | null = options.document ? { id: 'exec-1', projectId, rowVersion: 1, dataJson: JSON.stringify(options.document) } : null;
  const schedules = (options.schedules ?? []).map(schedule => ({ ...schedule }));
  const tx = {
    project: { findUnique: jest.fn().mockResolvedValue({ id: projectId, status: 'ACTIVE' }) },
    projectSchedule: {
      findMany: jest.fn().mockImplementation(async () => schedules),
      updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
        const schedule = schedules.find(item => item.id === where.id && item.rowVersion === where.rowVersion);
        if (!schedule) return { count: 0 };
        schedule.description = data.description;
        schedule.rowVersion += 1;
        return { count: 1 };
      }),
    },
    workPackageExecutionState: {
      findUnique: jest.fn().mockImplementation(async () => state),
      updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
        if (!state || state.rowVersion !== where.rowVersion) return { count: 0 };
        state = { ...state, rowVersion: data.rowVersion, dataJson: data.dataJson };
        return { count: 1 };
      }),
      create: jest.fn().mockImplementation(async ({ data }) => { state = { id: 'exec-1', ...data }; return state; }),
    },
  };
  (prisma.$transaction as jest.Mock).mockImplementation((callback: (value: typeof tx) => unknown) => callback(tx));
  return { tx, schedules, getState: () => state };
}

const command = (action: string, expectedRowVersion: number, fields: Record<string, unknown>) =>
  mutateWorkPackageProjectLocation({ projectId, actor, body: { action, expectedRowVersion, ...fields } });

describe('project location service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates live project locations and syncs only editable drafts, preserving frozen schedule metadata', async () => {
    const details = emptyWorkPackagePlanDetails();
    const { tx, schedules, getState } = setup({ schedules: [
      { id: 'draft', description: JSON.stringify(details), rowVersion: 3, workflowStatus: 'AI_GENERATED_DRAFT', generationRulesVersion: 'BOQ_WPS_WORKSPACE_V1' },
      { id: 'baseline', description: JSON.stringify(details), rowVersion: 8, workflowStatus: 'ACTIVE_BASELINE', generationRulesVersion: 'BOQ_WPS_WORKSPACE_V1' },
    ] });
    const result = await command('create', 0, { name: 'North Wing', code: 'NW', parentId: null });
    expect(result).toMatchObject({ success: true, rowVersion: 1 });
    expect(result.locations).toHaveLength(1);
    expect(JSON.parse(schedules[0]!.description).locations).toEqual(result.locations);
    expect(schedules[0]!.rowVersion).toBe(4);
    expect(schedules[1]!.rowVersion).toBe(8);
    expect(tx.projectSchedule.updateMany).toHaveBeenCalledTimes(1);
    expect(JSON.parse(getState()!.dataJson).audit[0].actorId).toBe(actor.id);
  });

  it('reads prior baseline locations before the project location aggregate is initialized', async () => {
    const details = emptyWorkPackagePlanDetails();
    details.locations = [{ id: 'loc-a', name: 'Plant room', parentId: null, isActive: true }];
    setup({ schedules: [{ id: 'baseline', description: JSON.stringify(details), rowVersion: 2, workflowStatus: 'ACTIVE_BASELINE', generationRulesVersion: 'BOQ_WPS_WORKSPACE_V1' }] });
    expect(await getWorkPackageProjectLocations(projectId)).toMatchObject({ rowVersion: 0, locations: details.locations });
  });

  it('rejects duplicate sibling names and parent cycles', async () => {
    const details = emptyWorkPackagePlanDetails();
    details.locations = [{ id: 'a', name: 'North', parentId: null }, { id: 'b', name: 'Level 1', parentId: 'a' }];
    const { getState } = setup({ schedules: [{ id: 'baseline', description: JSON.stringify(details), rowVersion: 0, workflowStatus: 'ACTIVE_BASELINE', generationRulesVersion: 'BOQ_WPS_WORKSPACE_V1' }] });
    await expect(command('create', 0, { name: 'North', parentId: null })).rejects.toMatchObject({ message: 'DUPLICATE_LOCATION_NAME' });
    await expect(command('update', 0, { id: 'a', name: 'North', parentId: 'b' })).rejects.toMatchObject({ message: 'LOCATION_HIERARCHY_CYCLE' });
    expect(getState()).toBeNull();
  });

  it('archives unused and allocated locations without deleting identities or rewriting frozen allocations', async () => {
    const details = emptyWorkPackagePlanDetails();
    details.locations = [{ id: 'loc-a', name: 'Plant room', parentId: null }];
    const { getState } = setup({ schedules: [{ id: 'baseline', description: JSON.stringify(details), rowVersion: 0, workflowStatus: 'ACTIVE_BASELINE', generationRulesVersion: 'BOQ_WPS_WORKSPACE_V1' }] });
    const created = await command('create', 0, { name: 'Temporary', parentId: null });
    const id = created.locationId;
    const archived = await command('archive', 1, { id });
    expect(archived.locations.find(location => location.id === id)).toMatchObject({ isActive: false });
    expect(JSON.parse(getState()!.dataJson).locations.some((location: { id: string }) => location.id === id)).toBe(true);

    const inUseDetails = emptyWorkPackagePlanDetails();
    inUseDetails.locations = [{ id: 'used', name: 'Used', parentId: null }];
    inUseDetails.allocationLocations = { allocation: 'used' };
    const inUse = setup({ schedules: [{ id: 'baseline', description: JSON.stringify(inUseDetails), rowVersion: 0, workflowStatus: 'ACTIVE_BASELINE', generationRulesVersion: 'BOQ_WPS_WORKSPACE_V1' }] });
    const archivedUsed = await command('archive', 0, { id: 'used' });
    expect(archivedUsed.locations).toContainEqual(expect.objectContaining({ id: 'used', isActive: false }));
    expect(inUse.schedules[0].description).toBe(JSON.stringify(inUseDetails));
    expect(inUse.tx.projectSchedule.updateMany).not.toHaveBeenCalled();
  });
  it('refuses active children, then allows archiving the parent once all children are archived', async () => {
    const doc = emptyExecutionDocument();
    doc.locations = [{ id: 'parent', name: 'Building', parentId: null }, { id: 'child', name: 'Floor', parentId: 'parent' }];
    setup({ document: doc });
    await expect(command('archive', 1, { id: 'parent' })).rejects.toMatchObject({ message: 'LOCATION_HAS_CHILDREN' });
    await command('archive', 1, { id: 'child' });
    expect((await command('archive', 2, { id: 'parent' })).locations.every(location => location.isActive === false)).toBe(true);
  });
  it('preserves site evidence and weekly commitments when their location is archived', async () => {
    const doc = emptyExecutionDocument();
    doc.locations = [{ id: 'used', name: 'Work front', parentId: null }];
    doc.siteLogs = [{ id: 'log', activityId: 'activity', baselineScheduleId: 'baseline', sourcePackageId: 'package', logDate: '2026-11-05', workDescription: '', weather: null, equipmentHours: null, blockedAcknowledged: false, workEntries: [{ id: 'entry', allocationId: 'allocation', sourcePackageId: 'package', boqItemId: 'boq', locationId: 'used', quantity: '4', unit: 'm3', recordedAt: 'now', recordedById: actor.id, correctionOfId: null, correctionReason: null }], laborEntries: [], createdAt: 'now', createdById: actor.id }];
    doc.weeklyPlans = [{ id: 'week', periodStart: '2026-11-02', periodEnd: '2026-11-08', status: 'COMMITTED', baselineScheduleId: 'baseline', targets: [{ id: 'target', activityId: 'activity', sourcePackageId: 'package', allocationId: 'allocation', boqItemId: 'boq', locationId: 'used', unit: 'm3', quantity: '5', blockedAcknowledged: false, reason: null, createdAt: 'now', createdById: actor.id }], closedAt: null, closedById: null, closeSnapshot: null, discardedAt: null, discardedById: null, discardReason: null }];
    const { getState } = setup({ document: doc });
    await command('archive', 1, { id: 'used' });
    const saved = JSON.parse(getState()!.dataJson) as WorkPackageExecutionDocument;
    expect(saved.locations?.[0].isActive).toBe(false);
    expect(saved.siteLogs).toEqual(doc.siteLogs);
    expect(saved.weeklyPlans).toEqual(doc.weeklyPlans);
  });
});
