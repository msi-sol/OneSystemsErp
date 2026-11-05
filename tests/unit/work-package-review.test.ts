jest.mock('@/lib/prisma', () => ({
  prisma: { $transaction: jest.fn() },
  transactionContext: { run: jest.fn((_context: unknown, callback: () => unknown) => callback()) },
}));

import { prisma, transactionContext } from '@/lib/prisma';
import { buildDraftBOQChecksum } from '@/lib/boq/draft-workflow';
import {
  createWorkPackageSnapshot,
  hashWorkPackageSnapshot,
  runWorkPackageReviewCommand,
} from '@/lib/scheduling/work-package-review';

const prismaMock = prisma as unknown as { $transaction: jest.Mock };
const actor = { id: 'engineer-1', role: 'PROJECT_ENGINEER', name: 'Engineer' };
const testBoqItem = { id: 'boq-item-1', itemCode: 'EX-1', category: null, description: 'Excavation', unit: 'm3', quantity: 10, combinedUnitCost: 10, totalCost: 100 };
const testBoqChecksum = buildDraftBOQChecksum([testBoqItem]);

function makePlan() {
  return {
    id: 'schedule-1', projectId: 'project-1', name: 'Workspace plan', description: JSON.stringify({kind:'BOQ_WPS_WORKSPACE_V1',locations:[{id:'loc-1',name:'North',parentId:null}],constraints:[],resources:['MATERIAL','LABOR','EQUIPMENT'].map(kind=>({id:kind,activityId:'activity-1',kind,description:kind,unit:'lot',quantity:'1',unitCost:'10',amount:'10',isSystemSuggested:false})),allocationLocations:{'allocation-1':'loc-1'}}), rowVersion: 4,
    reviewRound: 1, revisionNumber: null, revisionCode: null, workflowStatus: 'AI_GENERATED_DRAFT', generationRulesVersion: 'BOQ_WPS_WORKSPACE_V1',
    calendarDays: 0, workingDays: 0, holidays: null, workDaysConfig: null,
    lockedBOQVersionId: 'boq-version-1', lockedBOQChecksum: testBoqChecksum,
    awardedContractAmount: '100.00', scheduledAmount: '100.00', differenceAmount: '0.00',
    projectStartDate: new Date('2026-11-04T00:00:00.000Z'),
    projectCompletionDate: new Date('2026-11-12T00:00:00.000Z'),
    wbsNodes: [{ id: 'phase-1', parentId: null, code: 'P1', name: 'Earthworks', description: null, level: 1, orderIndex: 0 }],
    activities: [{
      id: 'activity-1', wbsId: 'phase-1', activityCode: 'EX-1', name: 'Excavation', description: null,
      discipline: null, plannedStartDate: new Date('2026-11-04T00:00:00.000Z'),
      plannedFinishDate: new Date('2026-11-12T00:00:00.000Z'), plannedDuration: 9,
      plannedQuantity: 10, unit: 'm3', plannedWeight: 1, criticalPath: true,
      totalFloat: 0, freeFloat: 0, allocatedAmount: '100.00',
      boqAllocations: [{
        id: 'allocation-1', awardedBoqItemId: 'boq-item-1', allocatedQuantity: '10',
        awardedQuantity: '10', awardedAmount: '100.00', allocatedAmount: '100.00',
        allocatedPercentage: '100', allocationMode: 'SINGLE', allocationReason: null,
      }],
    }],
    dependencies: [],
  };
}

function setup(plan = makePlan()) {
  const tx = {
    workPackageExecutionState:{findUnique:jest.fn().mockResolvedValue(null)},
    projectSchedule: {
      findFirst: jest.fn().mockResolvedValue(plan),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      aggregate: jest.fn().mockResolvedValue({ _max: { revisionNumber: null } }),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'revision-2', workflowStatus: 'AI_GENERATED_DRAFT' }),
    },
    scheduleApproval: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn() },
    scheduleRevisionReason: { create: jest.fn().mockResolvedValue({}) },
    scheduleWBS: { create: jest.fn().mockResolvedValue({ id: 'phase-copy' }) },
    scheduleActivity: { create: jest.fn().mockResolvedValue({ id: 'activity-copy' }) },
    scheduleBOQAllocation: { create: jest.fn().mockResolvedValue({ id: 'allocation-copy' }) },
    scheduleDependency: { create: jest.fn() },
    baselineActivation: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    project: { findUnique: jest.fn().mockResolvedValue({ id: 'project-1', boqLocked: true, contractAmount: 100 }) },
    projectBOQVersion: { findFirst: jest.fn().mockResolvedValue({ status: 'APPROVED', checksum: testBoqChecksum }) },
    awardedBOQItem: { findMany: jest.fn().mockResolvedValue([testBoqItem]) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    user: { findUnique: jest.fn().mockResolvedValue({ name: 'PM', role: 'PROJECT_MANAGER' }) },
  };
  prismaMock.$transaction.mockImplementation((callback: (transaction: typeof tx) => unknown) => callback(tx));
  return { tx, plan };
}

describe('work-package review and activation', () => {
  beforeEach(() => jest.clearAllMocks());

  test('fingerprint includes allocation content and is stable to input row ordering', () => {
    const plan = makePlan();
    const first = createWorkPackageSnapshot(plan, plan.wbsNodes, plan.activities, plan.dependencies);
    const reversed = createWorkPackageSnapshot(plan, [...plan.wbsNodes].reverse(), [...plan.activities].reverse(), plan.dependencies);
    expect(hashWorkPackageSnapshot(first)).toBe(hashWorkPackageSnapshot(reversed));
    const changed = structuredClone(plan);
    changed.activities[0]!.boqAllocations[0]!.allocatedQuantity = '9';
    const changedSnapshot = createWorkPackageSnapshot(changed, changed.wbsNodes, changed.activities, changed.dependencies);
    expect(hashWorkPackageSnapshot(first)).not.toBe(hashWorkPackageSnapshot(changedSnapshot));

    const withMetadata = structuredClone(plan);
    withMetadata.description = JSON.stringify({ kind: 'BOQ_WPS_WORKSPACE_V1', locations: [{ id: 'loc-1', name: 'North', parentId: null }], constraints: [], resources: [], allocationLocations: {} });
    const metadataSnapshot = createWorkPackageSnapshot(withMetadata, withMetadata.wbsNodes, withMetadata.activities, withMetadata.dependencies);
    withMetadata.description = JSON.stringify({ kind: 'BOQ_WPS_WORKSPACE_V1', locations: [{ id: 'loc-1', name: 'South', parentId: null }], constraints: [], resources: [], allocationLocations: {} });
    const editedMetadataSnapshot = createWorkPackageSnapshot(withMetadata, withMetadata.wbsNodes, withMetadata.activities, withMetadata.dependencies);
    expect(hashWorkPackageSnapshot(metadataSnapshot)).not.toBe(hashWorkPackageSnapshot(editedMetadataSnapshot));
  });

  test('engineer review requires comments and stores the current plan fingerprint', async () => {
    const { tx } = setup();
    await expect(runWorkPackageReviewCommand({ projectId: 'project-1', actor, body: {
      action: 'review', scheduleId: 'schedule-1', expectedRowVersion: 4,
    } })).rejects.toMatchObject({ message: 'Engineering review must contain 5 to 500 characters.' });
    expect(tx.scheduleApproval.create).not.toHaveBeenCalled();

    const result = await runWorkPackageReviewCommand({ projectId: 'project-1', actor, body: {
      action: 'review', scheduleId: 'schedule-1', expectedRowVersion: 4, comments: 'Reviewed scope, dates and allocations.',
    } });
    expect(result).toMatchObject({ scheduleId: 'schedule-1', rowVersion: 5, workflowStatus: 'AI_GENERATED_DRAFT' });
    expect(tx.scheduleApproval.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      approvalStage: 'TECHNICAL', decision: 'APPROVE', reviewerId: actor.id,
      scheduleSnapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/), comments: 'Reviewed scope, dates and allocations.',
    }) }));
    expect(transactionContext.run).toHaveBeenCalledWith({ sourceProvenance: 'GATE9_WORKFLOW_ENGINE' }, expect.any(Function));
  });

  test('PM activation rejects a stale engineer review hash', async () => {
    const { tx } = setup();
    tx.scheduleApproval.findFirst.mockResolvedValue({ reviewerId: actor.id, scheduleSnapshotHash: 'stale-hash' });
    await expect(runWorkPackageReviewCommand({ projectId: 'project-1', actor: { id: 'pm-1', role: 'PROJECT_MANAGER' }, body: {
      action: 'approve', reason:'Reviewed scope and budget complete.', scheduleId: 'schedule-1', expectedRowVersion: 4,
    } })).rejects.toMatchObject({ message: 'CURRENT_ENGINEER_REVIEW_REQUIRED' });
    expect(tx.baselineActivation.create).not.toHaveBeenCalled();
  });

  test('PM activation rejects partial BOQ quantity allocation', async () => {
    const plan = makePlan();
    plan.activities[0]!.boqAllocations[0]!.allocatedQuantity = '9';
    const { tx } = setup(plan);
    const snapshot = createWorkPackageSnapshot(plan, plan.wbsNodes, plan.activities, plan.dependencies);
    tx.scheduleApproval.findFirst.mockResolvedValue({ reviewerId: actor.id, scheduleSnapshotHash: hashWorkPackageSnapshot(snapshot) });
    await expect(runWorkPackageReviewCommand({ projectId: 'project-1', actor: { id: 'pm-1', role: 'PROJECT_MANAGER' }, body: {
      action: 'approve', reason:'Reviewed scope and budget complete.', scheduleId: 'schedule-1', expectedRowVersion: 4,
    } })).rejects.toMatchObject({ message: 'Plan is not ready: BOQ quantities and stated values reconcile' });
    expect(tx.baselineActivation.create).not.toHaveBeenCalled();
  });

  test('PM activation accepts a zero-quantity zero-amount BOQ reference line', async () => {
    const plan = makePlan();
    const zeroReference = { id: 'boq-item-zero', itemCode: 'REF-1', category: null, description: 'Non-cost reference', unit: 'lot', quantity: 0, combinedUnitCost: 0, totalCost: 0 };
    const checksum = buildDraftBOQChecksum([testBoqItem, zeroReference]);
    plan.lockedBOQChecksum = checksum;
    const snapshot = createWorkPackageSnapshot(plan, plan.wbsNodes, plan.activities, plan.dependencies);
    const { tx } = setup(plan);
    tx.projectSchedule.findFirst.mockResolvedValueOnce(plan).mockResolvedValueOnce(null);
    tx.projectBOQVersion.findFirst.mockResolvedValue({ status: 'APPROVED', checksum });
    tx.awardedBOQItem.findMany.mockResolvedValue([testBoqItem, zeroReference]);
    tx.scheduleApproval.findFirst.mockResolvedValue({ reviewerId: actor.id, scheduleSnapshotHash: hashWorkPackageSnapshot(snapshot) });
    const result = await runWorkPackageReviewCommand({ projectId: 'project-1', actor: { id: 'pm-1', role: 'PROJECT_MANAGER' }, body: {
      action: 'approve', reason:'Reviewed scope and budget complete.', scheduleId: 'schedule-1', expectedRowVersion: 4,
    } });
    expect(result).toMatchObject({ workflowStatus: 'ACTIVE_BASELINE', baselineCode: 'BL-001' });
    expect(tx.baselineActivation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isAuthoritative: true }) }));
  });

  test('PM activation refuses an open constraint without accountable owner and date', async () => {
    const plan = makePlan();
    plan.description = JSON.stringify({ ...JSON.parse(plan.description), constraints: [
      { id: 'constraint-1', activityId: null, ownerId: null, neededBy: null, resolution: null, status: 'OPEN', blocking: true, description: 'Confirm access window' },
    ] });
    const snapshot = createWorkPackageSnapshot(plan, plan.wbsNodes, plan.activities, plan.dependencies);
    const { tx } = setup(plan);
    tx.scheduleApproval.findFirst.mockResolvedValue({ reviewerId: actor.id, scheduleSnapshotHash: hashWorkPackageSnapshot(snapshot) });
    await expect(runWorkPackageReviewCommand({ projectId: 'project-1', actor: { id: 'pm-1', role: 'PROJECT_MANAGER' }, body: {
      action: 'approve', reason:'Reviewed scope and budget complete.', scheduleId: 'schedule-1', expectedRowVersion: 4,
    } })).rejects.toMatchObject({ message: 'Plan is not ready: Every open constraint has an owner and needed-by date — Confirm access window' });
    expect(tx.baselineActivation.create).not.toHaveBeenCalled();
  });

  test('PM activation fails closed on malformed tagged plan details', async () => {
    const plan = makePlan();
    plan.description = JSON.stringify({ kind: 'BOQ_WPS_WORKSPACE_V1', locations: [], resources: [], constraints: [{ id: 'bad-constraint', blocking: true }], allocationLocations: {} });
    const snapshot = createWorkPackageSnapshot(plan, plan.wbsNodes, plan.activities, plan.dependencies);
    const { tx } = setup(plan);
    tx.scheduleApproval.findFirst.mockResolvedValue({ reviewerId: actor.id, scheduleSnapshotHash: hashWorkPackageSnapshot(snapshot) });
    await expect(runWorkPackageReviewCommand({ projectId: 'project-1', actor: { id: 'pm-1', role: 'PROJECT_MANAGER' }, body: {
      action: 'approve', reason:'Reviewed scope and budget complete.', scheduleId: 'schedule-1', expectedRowVersion: 4,
    } })).rejects.toMatchObject({ message: 'WORK_PACKAGE_METADATA_INVALID' });
    expect(tx.baselineActivation.create).not.toHaveBeenCalled();
  });

  test('revision clone remaps activity references and drops old allocation-location keys', async () => {
    const source = makePlan();
    source.workflowStatus = 'ACTIVE_BASELINE';
    source.rowVersion = 9;
    source.revisionNumber = 1;
    source.revisionCode = 'REV-001';
    source.calendarDays = 9;
    source.workingDays = 7;
    source.holidays = null;
    source.workDaysConfig = null;
    source.description = JSON.stringify({
      kind: 'BOQ_WPS_WORKSPACE_V1',
      locations: [{ id: 'location-1', name: 'Site North', parentId: null }],
      constraints: [{ id: 'constraint-1', activityId: 'activity-1', description: 'Confirm access', ownerId: null, neededBy: null, blocking: false, status: 'OPEN', resolution: null }],
      resources: [{ id: 'resource-1', activityId: 'activity-1', kind: 'MATERIAL', description: 'Gravel', unit: 'm3', quantity: '2', unitCost: '5', amount: '10' }],
      allocationLocations: { 'allocation-1': 'location-1', 'allocation-stale': 'location-1', 'allocation-2': 'location-deleted' },
    });
    const { tx } = setup(source);
    tx.projectSchedule.findFirst.mockResolvedValueOnce(source).mockResolvedValueOnce(null);
    tx.projectSchedule.aggregate.mockResolvedValue({ _max: { revisionNumber: 1 } });
    const result = await runWorkPackageReviewCommand({ projectId: 'project-1', actor, body: {
      action: 'start-revision', scheduleId: 'schedule-1', expectedRowVersion: 9, reason: 'Update site access plan',
    } });
    expect(result).toMatchObject({ scheduleId: 'revision-2', parentScheduleId: 'schedule-1', revisionCode: 'REV-002' });
    const detailsWrite = tx.projectSchedule.updateMany.mock.calls.find(([call]) => call.where.id === 'revision-2');
    expect(detailsWrite).toBeDefined();
    const copiedDetails = JSON.parse(detailsWrite[0].data.description);
    expect(copiedDetails).toMatchObject({
      locations: [{ id: 'location-1', name: 'Site North', parentId: null }],
      constraints: [{ id: 'constraint-1', activityId: 'activity-copy' }],
      resources: [{ id: 'resource-1', activityId: 'activity-copy' }],
      allocationLocations: { 'allocation-copy': 'location-1' },
    });
    expect(tx.scheduleApproval.create).not.toHaveBeenCalled();
    expect(tx.baselineActivation.create).not.toHaveBeenCalled();
  });

});
