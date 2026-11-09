jest.mock('@/lib/prisma', () => ({
  prisma: { $transaction: jest.fn() },
  transactionContext: { run: jest.fn((_context: unknown, callback: () => unknown) => callback()) },
}));

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { assertWorkPackageExecutedScope, getWorkPackageExecutionData, runWorkPackageExecutionCommand, WorkPackageExecutionError } from '@/lib/scheduling/work-package-execution';
import { emptyExecutionDocument, type WorkPackageExecutionDocument } from '@/lib/scheduling/work-package-execution-types';

const actor = { id: 'actor-1', role: 'PROJECT_ENGINEER', name: 'Engineer' };
const projectId = 'project-1';
const scheduleId = 'schedule-current';
const allocationId = 'allocation-current';
const locationId = 'location-1';
const sourcePackageId = 'stable-package-1';

function metadata(activityId = 'activity-current') {
  return JSON.stringify({
    kind: 'BOQ_WPS_WORKSPACE_V1',
    locations: [{ id: locationId, name: 'North', parentId: null }],
    constraints: [], resources: [],
    allocationLocations: { [allocationId]: locationId },
    packageIdentities: { [activityId]: sourcePackageId },
  });
}

function activeSchedule() {
  return {
    id: scheduleId, projectId, workflowStatus: 'ACTIVE_BASELINE', baselineCode: 'BL-001', revisionCode: 'REV-001',
    lockedBOQVersionId: 'boq-version-1', lockedBOQChecksum: 'checksum-1', activatedAt: new Date('2026-11-01T00:00:00Z'), createdAt: new Date('2026-11-01T00:00:00Z'),
    description: metadata(),
    baselineActivations: [{ id: 'activation-1', lockedBOQChecksum: 'checksum-1' }],
    activities: [{ id: 'activity-current', activityCode: 'WP-01', name: 'Concrete', plannedStartDate: new Date('2026-11-02T00:00:00Z'), plannedFinishDate: new Date('2026-11-10T00:00:00Z'), plannedWeight: 1,
      boqAllocations: [{ id: allocationId, awardedBoqItemId: 'boq-item-1', allocatedQuantity: '100', mappedQuantity: 100, awardedBoqItem: { id: 'boq-item-1', itemCode: '1.1', description: 'Concrete', unit: 'm3', quantity: '100', totalCost: '1000' } }],
    }],
  };
}

function setup(document: WorkPackageExecutionDocument = emptyExecutionDocument(), rowVersion = 0) {
  let stored: { id: string; projectId: string; rowVersion: number; dataJson: string } | null = rowVersion ? { id: 'execution-1', projectId, rowVersion, dataJson: JSON.stringify(document) } : null;
  const tx = {
    project: { findUnique: jest.fn().mockResolvedValue({ id: projectId, status: 'ACTIVE', boqLocked: true }) },
    projectSchedule: { findFirst: jest.fn().mockResolvedValue(activeSchedule()), findMany: jest.fn().mockResolvedValue([]) },
    projectBOQVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'boq-version-1', checksum: 'checksum-1', status: 'APPROVED' }) },
    workPackageExecutionState: {
      findUnique: jest.fn().mockImplementation(async () => stored),
      updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
        if (!stored || stored.rowVersion !== where.rowVersion) return { count: 0 };
        stored = { ...stored, rowVersion: data.rowVersion, dataJson: data.dataJson };
        return { count: 1 };
      }),
      create: jest.fn().mockImplementation(async ({ data }) => { stored = { id: 'execution-1', ...data }; return stored; }),
    },
  };
  (prisma.$transaction as jest.Mock).mockImplementation((callback: (transaction: typeof tx) => unknown) => callback(tx));
  return { tx, getStored: () => stored, setStored: (value: typeof stored) => { stored = value; } };
}

const command = (body: Record<string, unknown>) => runWorkPackageExecutionCommand({ projectId, actor, body: { expectedRowVersion: 0, ...body } });

describe('Work Package execution transactions', () => {
  // The fixtures use the week of 2026-11-02 to 2026-11-08, and weekly targets are refused once their week has ended
  // (Manila date). Pin "today" inside that week so the tests do not start failing as the calendar moves on.
  // Only Date is faked; timers stay real.
  beforeAll(() => jest.useFakeTimers({ now: new Date('2026-11-05T02:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'clearImmediate', 'queueMicrotask', 'hrtime', 'performance'] }));
  afterAll(() => jest.useRealTimers());
  beforeEach(() => jest.clearAllMocks());

  it('keeps the complete execution snapshot available beyond the default five-second transaction limit', async () => {
    setup();
    const readSnapshot = (prisma.$transaction as jest.Mock).getMockImplementation()!;
    (prisma.$transaction as jest.Mock).mockImplementation((callback, options) => {
      if (!options?.timeout || options.timeout < 10_000) throw new Error('Transaction already closed before the snapshot was read.');
      return readSnapshot(callback, options);
    });
    const result = await getWorkPackageExecutionData(projectId);
    expect(result.packages[0]).toMatchObject({ activityId: 'activity-current', sourcePackageId, name: 'Concrete' });
    expect(result.packages[0].allocations[0]).toMatchObject({ itemCode: '1.1', allocatedQuantity: '100', measuredToDate: '0', remainingQuantity: '100' });
  });

  it('allows omitted, short and blank narratives while preserving omitted streams', async () => {
    const { getStored } = setup();
    await command({ action: 'create-site-log', scheduleId, activityId: 'activity-current', logDate: '2026-11-05' });
    let saved = JSON.parse(getStored()!.dataJson) as WorkPackageExecutionDocument;
    const logId = saved.siteLogs[0].id;
    expect(saved.siteLogs[0].workDescription).toBe('');
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'update-site-log', expectedRowVersion: 1, scheduleId, logId, workDescription: 'X' } });
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'save-site-log', expectedRowVersion: 2, scheduleId, logId, equipmentHours: '2' } });
    saved = JSON.parse(getStored()!.dataJson) as WorkPackageExecutionDocument;
    expect(saved.siteLogs[0].workDescription).toBe('X');
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'save-site-log', expectedRowVersion: 3, scheduleId, logId, workDescription: '   ' } });
    saved = JSON.parse(getStored()!.dataJson) as WorkPackageExecutionDocument;
    expect(saved.siteLogs[0].workDescription).toBe('');
    expect(saved.siteLogs[0].equipmentHours).toBe('2');
    await expect(runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'save-site-log', expectedRowVersion: 4, scheduleId, logId, workDescription: 'a'.repeat(1001) } })).rejects.toMatchObject({ message: 'WORK_DESCRIPTION_TOO_LONG' });
  });

  it.each(['record-labor', 'replace-labor-entries', 'save-site-log'])('coerces supplied blank hourly rates to zero through %s', async action => {
    const { getStored } = setup();
    await command({ action: 'create-site-log', scheduleId, activityId: 'activity-current', logDate: '2026-11-05' });
    const logId = (JSON.parse(getStored()!.dataJson) as WorkPackageExecutionDocument).siteLogs[0].id;
    const labor = { trade: 'Carpenter', headcount: 2, hoursPerWorker: '8', hourlyRate: '  ', subcontractor: '' };
    const fields = action === 'record-labor' ? labor : action === 'replace-labor-entries' ? { entries: [labor] } : { laborEntries: [labor] };
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action, expectedRowVersion: 1, scheduleId, logId, ...fields } });
    const saved = JSON.parse(getStored()!.dataJson) as WorkPackageExecutionDocument;
    expect(saved.siteLogs[0].laborEntries[0]).toMatchObject({ trade: 'Carpenter', headcount: 2, hoursPerWorker: '8', hourlyRate: '0' });
  });

  it('creates weekly plans with an optimistic aggregate version', async () => {
    const { tx, getStored } = setup();
    const result = await command({ action: 'create-weekly-plan', scheduleId, periodStart: '2026-11-02', periodEnd: '2026-11-08' });
    expect(result).toMatchObject({ success: true, rowVersion: 1, action: 'create-weekly-plan' });
    expect(tx.workPackageExecutionState.create).toHaveBeenCalledTimes(1);
    expect(JSON.parse(getStored()!.dataJson).weeklyPlans[0]).toMatchObject({ status: 'DRAFT', baselineScheduleId: scheduleId });
  });

  it('upserts one weekly target per allocation even when the caller omits targetId', async () => {
    const { getStored } = setup();
    await command({ action: 'create-weekly-plan', scheduleId, periodStart: '2099-11-02', periodEnd: '2099-11-08' });
    const planId = (JSON.parse(getStored()!.dataJson) as WorkPackageExecutionDocument).weeklyPlans[0].id;
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'save-weekly-target', expectedRowVersion: 1, scheduleId, planId, allocationId, quantity: '60' } });
    const first = (JSON.parse(getStored()!.dataJson) as WorkPackageExecutionDocument).weeklyPlans[0].targets[0];
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'commit-weekly-plan', expectedRowVersion: 2, scheduleId, planId } });
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'save-weekly-target', expectedRowVersion: 3, scheduleId, planId, allocationId, quantity: '70' } });
    const targets = (JSON.parse(getStored()!.dataJson) as WorkPackageExecutionDocument).weeklyPlans[0].targets;
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ id: first.id, quantity: '70', createdAt: first.createdAt, createdById: first.createdById });
  });

  it('rejects allocation switches and duplicate allocation targets before changing the plan', async () => {
    const { getStored, tx } = setup();
    const baseline = activeSchedule();
    baseline.activities[0].boqAllocations.push({ ...baseline.activities[0].boqAllocations[0], id: 'another-allocation' });
    baseline.description = JSON.stringify({ ...JSON.parse(baseline.description), allocationLocations: { [allocationId]: locationId, 'another-allocation': 'other-location' }, locations: [{ id: locationId, name: 'North', parentId: null }, { id: 'other-location', name: 'South', parentId: null }] });
    tx.projectSchedule.findFirst.mockResolvedValue(baseline);
    await command({ action: 'create-weekly-plan', scheduleId, periodStart: '2099-11-02', periodEnd: '2099-11-08' });
    let saved = JSON.parse(getStored()!.dataJson) as WorkPackageExecutionDocument;
    const planId = saved.weeklyPlans[0].id;
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'save-weekly-target', expectedRowVersion: 1, scheduleId, planId, allocationId, quantity: '20' } });
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'commit-weekly-plan', expectedRowVersion: 2, scheduleId, planId } });
    saved = JSON.parse(getStored()!.dataJson) as WorkPackageExecutionDocument;
    const targetId = saved.weeklyPlans[0].targets[0].id;
    await expect(runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'save-weekly-target', expectedRowVersion: 3, scheduleId, planId, allocationId: 'another-allocation', targetId, quantity: '20' } })).rejects.toMatchObject({ message: 'WEEKLY_TARGET_ALLOCATION_IMMUTABLE' });
    expect(JSON.parse(getStored()!.dataJson)).toEqual(saved);
    saved.weeklyPlans[0].targets.push({ ...saved.weeklyPlans[0].targets[0], id: 'legacy-duplicate' });
    const duplicateDb = setup(saved, 3);
    await expect(runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'save-weekly-target', expectedRowVersion: 3, scheduleId, planId, allocationId, quantity: '25' } })).rejects.toMatchObject({ message: 'DUPLICATE_WEEKLY_ALLOCATION' });
    expect(duplicateDb.tx.workPackageExecutionState.updateMany).not.toHaveBeenCalled();
  });

  it('supports the draft-to-committed-to-closed lifecycle and explicit draft discard', async () => {
    const { getStored } = setup();
    const created = await command({ action: 'create-weekly-plan', scheduleId, periodStart: '2099-11-02', periodEnd: '2099-11-08' });
    let saved = JSON.parse(getStored()!.dataJson) as WorkPackageExecutionDocument;
    const planId = saved.weeklyPlans[0]!.id;
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'save-weekly-target', expectedRowVersion: 1, scheduleId, planId, allocationId, quantity: '50' } });
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'commit-weekly-plan', expectedRowVersion: 2, scheduleId, planId } });
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'close-weekly-plan', expectedRowVersion: 3, scheduleId, planId } });
    saved = JSON.parse(getStored()!.dataJson) as WorkPackageExecutionDocument;
    expect(saved.weeklyPlans[0]).toMatchObject({ status: 'CLOSED', closeSnapshot: [{ actual: '0', shortfall: '50' }] });
    expect(created).toMatchObject({ rowVersion: 1 });

    const draft = { ...saved.weeklyPlans[0]!, id: 'plan-to-discard', periodStart: '2099-12-07', periodEnd: '2099-12-13', status: 'DRAFT' as const, targets: [], closedAt: null, closedById: null, closeSnapshot: null, discardedAt: null, discardedById: null, discardReason: null };
    saved.weeklyPlans.push(draft);
    const { getStored: readSecond } = setup(saved, 4);
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'discard-weekly-plan', expectedRowVersion: 4, scheduleId, planId: 'plan-to-discard', reason: 'Plan against the current revision instead.' } });
    const discarded = JSON.parse(readSecond()!.dataJson) as WorkPackageExecutionDocument;
    expect(discarded.weeklyPlans.find(plan => plan.id === 'plan-to-discard')).toMatchObject({ status: 'DISCARDED', discardReason: 'Plan against the current revision instead.' });
  });

  it('closes an ended draft directly, freezing its targets and actuals without retroactive commitment', async () => {
    const doc = emptyExecutionDocument();
    doc.weeklyPlans = [{ id: 'draft-ended', periodStart: '2026-01-01', periodEnd: '2026-01-07', status: 'DRAFT', baselineScheduleId: 'superseded-schedule', targets: [{ id: 'target', activityId: 'old-activity', sourcePackageId, allocationId: 'old-allocation', boqItemId: 'boq-item-1', locationId, unit: 'm3', quantity: '10', blockedAcknowledged: false, reason: null, createdAt: '2026-01-01', createdById: actor.id }], closedAt: null, closedById: null, closeSnapshot: null, discardedAt: null, discardedById: null, discardReason: null }];
    const { getStored, tx } = setup(doc, 2);
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'close-weekly-plan', expectedRowVersion: 2, scheduleId, planId: 'draft-ended' } });
    const saved = JSON.parse(getStored()!.dataJson) as WorkPackageExecutionDocument;
    expect(saved.weeklyPlans[0]).toMatchObject({ status: 'CLOSED', baselineScheduleId: 'superseded-schedule', closedById: actor.id, closeSnapshot: [{ targetId: 'target', actual: '0', shortfall: '10', target: 10 }] });
    expect(saved.weeklyPlans[0].targets).toEqual(doc.weeklyPlans[0].targets);
    const writes = tx.workPackageExecutionState.updateMany.mock.calls.length;
    await expect(runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'close-weekly-plan', expectedRowVersion: 3, scheduleId, planId: 'draft-ended' } })).rejects.toMatchObject({ message: 'ONLY_OPEN_PLAN_CAN_CLOSE' });
    expect(tx.workPackageExecutionState.updateMany).toHaveBeenCalledTimes(writes);
  });

  it('rejects a weekly target that exceeds allocation remaining after measured and overlapping commitments', async () => {
    const doc = emptyExecutionDocument();
    doc.weeklyPlans = [
      { id: 'plan-current', periodStart: '2026-11-02', periodEnd: '2026-11-08', status: 'DRAFT', baselineScheduleId: scheduleId, targets: [], closedAt: null, closedById: null, closeSnapshot: null, discardedAt: null, discardedById: null, discardReason: null },
      { id: 'plan-overlap', periodStart: '2026-11-08', periodEnd: '2026-11-14', status: 'COMMITTED', baselineScheduleId: 'old-schedule', targets: [{ id: 'target-old', activityId: 'old-activity', sourcePackageId, allocationId: 'old-allocation', boqItemId: 'boq-item-1', locationId, unit: 'm3', quantity: '40', blockedAcknowledged: false, reason: null, createdAt: '2026-11-01T00:00:00Z', createdById: actor.id }], closedAt: null, closedById: null, closeSnapshot: null, discardedAt: null, discardedById: null, discardReason: null },
    ];
    doc.siteLogs = [{ id: 'log-old', activityId: 'old-activity', baselineScheduleId: 'old-schedule', sourcePackageId, logDate: '2026-11-04', workDescription: 'Work', weather: null, equipmentHours: null, blockedAcknowledged: false, workEntries: [{ id: 'entry-1', allocationId: 'old-allocation', sourcePackageId, boqItemId: 'boq-item-1', locationId, quantity: '20', unit: 'm3', recordedAt: '2026-11-04T00:00:00Z', recordedById: actor.id, correctionOfId: null, correctionReason: null }], laborEntries: [], createdAt: '2026-11-04T00:00:00Z', createdById: actor.id }];
    const { tx } = setup(doc, 4);
    await expect(runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'save-weekly-target', expectedRowVersion: 4, scheduleId, planId: 'plan-current', allocationId, quantity: '41' } })).rejects.toMatchObject<Partial<WorkPackageExecutionError>>({ message: 'QUANTITY_EXCEEDS_REMAINING', status: 409 });
    expect(tx.workPackageExecutionState.updateMany).not.toHaveBeenCalled();
  });

  it('freezes the close snapshot when later site-log corrections change live weekly actuals', async () => {
    const doc = emptyExecutionDocument();
    doc.weeklyPlans = [{ id: 'plan-1', periodStart: '2026-11-02', periodEnd: '2026-11-08', status: 'COMMITTED', baselineScheduleId: scheduleId, targets: [{ id: 'target-1', activityId: 'activity-current', sourcePackageId, allocationId, boqItemId: 'boq-item-1', locationId, unit: 'm3', quantity: '10', blockedAcknowledged: false, reason: null, createdAt: '2026-11-01T00:00:00Z', createdById: actor.id }], closedAt: null, closedById: null, closeSnapshot: null, discardedAt: null, discardedById: null, discardReason: null }];
    doc.siteLogs = [{ id: 'log-1', activityId: 'activity-current', baselineScheduleId: scheduleId, sourcePackageId, logDate: '2026-11-04', workDescription: 'Work', weather: null, equipmentHours: null, blockedAcknowledged: false, workEntries: [{ id: 'entry-1', allocationId, sourcePackageId, boqItemId: 'boq-item-1', locationId, quantity: '6', unit: 'm3', recordedAt: '2026-11-04T00:00:00Z', recordedById: actor.id, correctionOfId: null, correctionReason: null }], laborEntries: [], createdAt: '2026-11-04T00:00:00Z', createdById: actor.id }];
    const { getStored } = setup(doc, 7);
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'close-weekly-plan', expectedRowVersion: 7, scheduleId, planId: 'plan-1' } });
    let saved = JSON.parse(getStored()!.dataJson) as WorkPackageExecutionDocument;
    expect(saved.weeklyPlans[0]!.closeSnapshot).toMatchObject([{ actual: '6', shortfall: '4' }]);
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'correct-work', expectedRowVersion: 8, scheduleId, logId: 'log-1', allocationId, entryId: 'entry-1', quantity: '8', correctionReason: 'Field sheet correction' } });
    saved = JSON.parse(getStored()!.dataJson) as WorkPackageExecutionDocument;
    expect(saved.weeklyPlans[0]!.closeSnapshot).toMatchObject([{ actual: '6', shortfall: '4' }]);
    expect(saved.siteLogs[0]!.workEntries).toHaveLength(2);
  });

  it('rejects writes to a superseded baseline site log', async () => {
    const doc = emptyExecutionDocument();
    doc.siteLogs = [{ id: 'log-old', activityId: 'activity-old', baselineScheduleId: 'schedule-old', sourcePackageId, logDate: '2026-11-04', workDescription: 'Old note', weather: null, equipmentHours: null, blockedAcknowledged: false, workEntries: [], laborEntries: [], createdAt: '2026-11-04T00:00:00Z', createdById: actor.id }];
    const { tx } = setup(doc, 1);
    await expect(runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'save-site-log', expectedRowVersion: 1, scheduleId, logId: 'log-old', workDescription: 'Changed old note' } })).rejects.toMatchObject<Partial<WorkPackageExecutionError>>({ message: 'SUPERSEDED_BASELINE_SITE_LOG_IMMUTABLE', status: 409 });
    expect(tx.workPackageExecutionState.updateMany).not.toHaveBeenCalled();
  });

  it('shows operational owner and resolution updates over the frozen baseline constraint', async () => {
    const baseline = activeSchedule();
    baseline.description = JSON.stringify({ ...JSON.parse(baseline.description), constraints: [{ id: 'baseline-constraint', activityId: 'activity-current', title: 'Access', type: 'ACCESS_OR_WORK_AREA', description: 'Access permit pending', ownerId: null, neededBy: null, blocking: true, status: 'OPEN', resolution: null }] });
    const { tx } = setup();
    tx.projectSchedule.findFirst.mockResolvedValue(baseline);
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'resolve-constraint', expectedRowVersion: 0, scheduleId, constraintId: 'baseline-constraint', resolution: 'Access permit received.' } });
    const data = await getWorkPackageExecutionData(projectId);
    expect(data.constraints.find(row => row.id === 'baseline-constraint')).toMatchObject({ source: 'BASELINE', status: 'RESOLVED', resolution: 'Access permit received.' });
  });

  it('replaces supplied site-log streams while preserving omitted streams', async () => {
    const doc = emptyExecutionDocument();
    const oldWorkEntry = { id: 'entry-1', allocationId, sourcePackageId, boqItemId: 'boq-item-1', locationId, quantity: '4', unit: 'm3', recordedAt: '2026-11-04T00:00:00Z', recordedById: actor.id, correctionOfId: null, correctionReason: null };
    doc.siteLogs = [{ id: 'log-current', activityId: 'activity-current', baselineScheduleId: scheduleId, sourcePackageId, logDate: '2026-11-04', workDescription: 'Existing note', weather: 'Clear', equipmentHours: '3', blockedAcknowledged: false, workEntries: [oldWorkEntry], laborEntries: [{ id: 'labor-1', trade: 'Carpenter', headcount: 2, hoursPerWorker: '8', hourlyRate: '10', subcontractor: null, recordedAt: '2026-11-04T00:00:00Z', recordedById: actor.id }], createdAt: '2026-11-04T00:00:00Z', createdById: actor.id }];
    const { getStored } = setup(doc, 2);
    await runWorkPackageExecutionCommand({ projectId, actor, body: { action: 'save-site-log', expectedRowVersion: 2, scheduleId, logId: 'log-current', laborEntries: [] } });
    const saved = JSON.parse(getStored()!.dataJson) as WorkPackageExecutionDocument;
    expect(saved.siteLogs[0]!.laborEntries).toEqual([]);
    expect(saved.siteLogs[0]!.equipmentHours).toBe('3');
    expect(saved.siteLogs[0]!.workEntries).toEqual([oldWorkEntry]);
    expect(saved.siteLogs[0]!.workDescription).toBe('Existing note');
  });

  it('enforces revision quantity floor through durable source package identity after activity ids change', async () => {
    const doc = emptyExecutionDocument();
    doc.siteLogs = [{ id: 'log-1', activityId: 'activity-old', baselineScheduleId: 'schedule-old', sourcePackageId, logDate: '2026-11-04', workDescription: 'Work', weather: null, equipmentHours: null, blockedAcknowledged: false, workEntries: [{ id: 'entry-1', allocationId: 'allocation-old', sourcePackageId, boqItemId: 'boq-item-1', locationId, quantity: '5', unit: 'm3', recordedAt: '2026-11-04T00:00:00Z', recordedById: actor.id, correctionOfId: null, correctionReason: null }], laborEntries: [], createdAt: '2026-11-04T00:00:00Z', createdById: actor.id }];
    const { tx } = setup(doc, 1);
    const revision = { id: 'schedule-new', description: metadata('activity-new'), activities: [{ id: 'activity-new', boqAllocations: [{ id: 'allocation-new', awardedBoqItemId: 'boq-item-1', allocatedQuantity: new Prisma.Decimal('4'), mappedQuantity: 4 }] }] };
    await expect(assertWorkPackageExecutedScope(tx as never, projectId, revision)).rejects.toMatchObject<Partial<WorkPackageExecutionError>>({ message: expect.stringContaining('REVISION_SCOPE_BELOW_EXECUTED'), status: 409 });
  });
});
