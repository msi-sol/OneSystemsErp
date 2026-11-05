import { createHash } from 'node:crypto';
import { Prisma, ProjectScheduleWorkflowStatus } from '@prisma/client';
import { prisma, transactionContext } from '@/lib/prisma';
import { buildDraftBOQChecksum, type DraftBOQLine } from '@/lib/boq/draft-workflow';
import { readWorkPackagePlanDetails, type WorkPackagePlanDetails } from '@/lib/scheduling/work-package-details-types';
import { deriveWorkPackageReadiness } from './work-package-readiness';
import { assertWorkPackageExecutedScope } from './work-package-execution';
import{mergeLiveConstraints}from'./work-package-constraint-sync';
import type{WorkPackageExecutionDocument}from'./work-package-execution-types';

const RULES_VERSION = 'BOQ_WPS_WORKSPACE_V1';
const DRAFT_STATUSES = new Set<ProjectScheduleWorkflowStatus>([
  ProjectScheduleWorkflowStatus.AI_GENERATED_DRAFT,
  ProjectScheduleWorkflowStatus.INVALID_GENERATED_DRAFT,
  ProjectScheduleWorkflowStatus.TECHNICAL_REVISIONS_REQUIRED,
]);

type Actor = { id: string; role: string; name?: string | null };
type CommandBody = { action: string; scheduleId: string; expectedRowVersion: number; comments?: string; reason?: string };

export class WorkPackageReviewError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'WorkPackageReviewError';
  }
}

function fail(code: string, status = 400): never { throw new WorkPackageReviewError(code, status); }
function conflict(code: string): never { return fail(code, 409); }
function decimal(value: Prisma.Decimal | number | string | null | undefined, code: string) {
  if (value === null || value === undefined) conflict(code);
  try {
    const result = new Prisma.Decimal(value.toString());
    if (!result.isFinite()) conflict(code);
    return result;
  } catch {
    return conflict(code);
  }
}
function jsonSafe(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, jsonSafe(item)]));
  }
  return value;
}
function stable(value: unknown): string { return JSON.stringify(jsonSafe(value)); }

export function createWorkPackageSnapshot<T extends object, W extends object, A extends object, D extends object>(
  scheduleInput: T,
  wbsInput: W[],
  activitiesInput: A[],
  dependenciesInput: D[],
) {
  const schedule = scheduleInput as Record<string, unknown>;
  const wbsNodes = wbsInput as Array<Record<string, unknown>>;
  const activities = activitiesInput as Array<Record<string, unknown>>;
  const dependencies = dependenciesInput as Array<Record<string, unknown>>;
  const snapshot = {
    snapshotVersion: RULES_VERSION,
    projectId: schedule.projectId,
    scheduleId: schedule.id,
    name: schedule.name,
    description: schedule.description,
    lockedBOQVersionId: schedule.lockedBOQVersionId,
    lockedBOQChecksum: schedule.lockedBOQChecksum,
    awardedContractAmount: schedule.awardedContractAmount,
    projectStartDate: schedule.projectStartDate,
    projectCompletionDate: schedule.projectCompletionDate,
    wbs: [...wbsNodes].sort((a, b) => String(a.code).localeCompare(String(b.code)) || String(a.id).localeCompare(String(b.id))).map((node) => ({
      id: node.id, parentId: node.parentId, code: node.code, name: node.name,
      description: node.description, level: node.level, orderIndex: node.orderIndex,
    })),
    activities: [...activities].sort((a, b) => String(a.id).localeCompare(String(b.id))).map((activity) => ({
      id: activity.id, wbsId: activity.wbsId, activityCode: activity.activityCode,
      name: activity.name, description: activity.description, discipline: activity.discipline,
      plannedStartDate: activity.plannedStartDate, plannedFinishDate: activity.plannedFinishDate,
      plannedDuration: activity.plannedDuration, plannedQuantity: activity.plannedQuantity,
      unit: activity.unit, plannedWeight: activity.plannedWeight,
      criticalPath: activity.criticalPath, totalFloat: activity.totalFloat, freeFloat: activity.freeFloat,
      allocatedAmount: activity.allocatedAmount,
      allocations: [...(Array.isArray(activity.boqAllocations) ? activity.boqAllocations as Array<Record<string, unknown>> : [])].sort((a, b) => String(a.id).localeCompare(String(b.id))).map((allocation) => ({
        id: allocation.id, awardedBoqItemId: allocation.awardedBoqItemId,
        allocatedQuantity: allocation.allocatedQuantity, awardedQuantity: allocation.awardedQuantity,
        awardedAmount: allocation.awardedAmount, allocatedAmount: allocation.allocatedAmount,
        allocatedPercentage: allocation.allocatedPercentage, allocationMode: allocation.allocationMode,
        allocationReason: allocation.allocationReason,
      })),
    })),
    dependencies: [...dependencies].sort((a, b) => String(a.predecessorId).localeCompare(String(b.predecessorId)) || String(a.successorId).localeCompare(String(b.successorId)) || String(a.type).localeCompare(String(b.type))).map((dependency) => ({
      predecessorId: dependency.predecessorId, successorId: dependency.successorId,
      type: dependency.type, lagDays: dependency.lagDays, remarks: dependency.remarks,
    })),
  };
  return jsonSafe(snapshot) as Prisma.InputJsonValue;
}

export function hashWorkPackageSnapshot(snapshot: unknown): string {
  return createHash('sha256').update(stable(snapshot)).digest('hex');
}

function validateBody(value: unknown): CommandBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_REQUEST_BODY');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !['action', 'scheduleId', 'expectedRowVersion', 'comments', 'reason'].includes(key))) fail('UNKNOWN_REQUEST_FIELD');
  if (!['review', 'approve', 'start-revision', 'cancel-revision'].includes(String(body.action))) fail('UNKNOWN_ACTION');
  if (typeof body.scheduleId !== 'string' || !body.scheduleId.trim() || body.scheduleId.length > 191) fail('SCHEDULE_ID_REQUIRED');
  if (typeof body.expectedRowVersion !== 'number' || !Number.isSafeInteger(body.expectedRowVersion) || body.expectedRowVersion < 0) fail('INVALID_EXPECTED_ROW_VERSION');
  if (body.comments !== undefined && (typeof body.comments !== 'string' || body.comments.length > 10000)) fail('INVALID_REVIEW_COMMENTS');
  if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 10000)) fail('INVALID_REVISION_REASON');
  return body as unknown as CommandBody;
}

function transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  // The context must wrap transaction creation so every guarded query in the
  // callback inherits the trusted workflow provenance.
  return transactionContext.run({ sourceProvenance: 'GATE9_WORKFLOW_ENGINE' }, async () => {
    try {
      return await prisma.$transaction((tx) => work(tx as unknown as Prisma.TransactionClient), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 15000,
        timeout: 30000,
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034') conflict('SCHEDULE_VERSION_CONFLICT');
      throw error;
    }
  });
}

async function loadPlan(tx: Prisma.TransactionClient, projectId: string, scheduleId: string) {
  const schedule = await tx.projectSchedule.findFirst({
    where: { id: scheduleId, projectId },
    include: {
      wbsNodes: { orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }] },
      activities: { orderBy: [{ id: 'asc' }], include: { boqAllocations: { orderBy: { id: 'asc' } } } },
      dependencies: { orderBy: [{ predecessorId: 'asc' }, { successorId: 'asc' }] },
    },
  });
  if (!schedule) fail('SCHEDULE_NOT_FOUND', 404);
  const snapshot = createWorkPackageSnapshot(schedule, schedule.wbsNodes, schedule.activities, schedule.dependencies);
  return { schedule, snapshot, hash: hashWorkPackageSnapshot(snapshot) };
}

async function bump(tx: Prisma.TransactionClient, schedule: { id: string; projectId: string; rowVersion: number; workflowStatus: ProjectScheduleWorkflowStatus }, expected: number, data: Prisma.ProjectScheduleUpdateManyMutationInput = {}) {
  if (schedule.rowVersion !== expected) conflict('SCHEDULE_VERSION_CONFLICT');
  const result = await tx.projectSchedule.updateMany({
    where: { id: schedule.id, projectId: schedule.projectId, rowVersion: expected, workflowStatus: schedule.workflowStatus },
    data: { ...data, rowVersion: { increment: 1 } },
  });
  if (result.count !== 1) conflict('SCHEDULE_VERSION_CONFLICT');
}

async function audit(tx: Prisma.TransactionClient, actor: Actor, actionType: string, id: string, oldValue: unknown, newValue: unknown) {
  await tx.auditLog.create({ data: {
    userId: actor.id, userRole: actor.role, moduleName: 'PROJECT_SCHEDULING',
    transactionId: id, actionType, oldValue: oldValue === null ? null : JSON.stringify(oldValue),
    newValue: JSON.stringify(newValue),
  } });
}

async function assertPreparation(tx:Prisma.TransactionClient, schedule:Awaited<ReturnType<typeof loadPlan>>['schedule']) {
  const items=await tx.awardedBOQItem.findMany({where:{projectId:schedule.projectId}});
  const allocations=schedule.activities.flatMap(activity=>activity.boqAllocations);
  const scopeReconciled=items.length>0&&items.every(item=>{
    const rows=allocations.filter(row=>row.awardedBoqItemId===item.id);
    return rows.every(row=>row.allocatedQuantity!==null&&row.allocatedAmount!==null)&&
      rows.reduce((sum,row)=>sum.plus(String(row.allocatedQuantity||0)),new Prisma.Decimal(0)).equals(String(item.quantity))&&
      rows.reduce((sum,row)=>sum.plus(String(row.allocatedAmount||0)),new Prisma.Decimal(0)).equals(String(item.totalCost));
  });
  let readiness;
  if(schedule.description?.includes(RULES_VERSION)){
    try{const raw=JSON.parse(schedule.description);if(raw.kind!==RULES_VERSION)conflict('WORK_PACKAGE_METADATA_INVALID');}catch{return conflict('WORK_PACKAGE_METADATA_INVALID');}
  }
  try{readiness=deriveWorkPackageReadiness({activities:schedule.activities,dependencies:schedule.dependencies,description:schedule.description,contractAmount:String(schedule.awardedContractAmount),scopeReconciled});}
  catch{return conflict('WORK_PACKAGE_METADATA_INVALID');}
  const first=readiness.checks.find(check=>!check.passed);
  if(first)conflict(`Plan is not ready: ${first.label}${first.detail?` — ${first.detail}`:''}`);
  await assertWorkPackageExecutedScope(tx,schedule.projectId,schedule);
}

function nextCode(value: number, prefix: string) { return `${prefix}-${String(value).padStart(3, '0')}`; }

async function approvePlan(tx: Prisma.TransactionClient, projectId: string, actor: Actor, body: CommandBody) {
  const { schedule, snapshot, hash } = await loadPlan(tx, projectId, body.scheduleId);
  if (!DRAFT_STATUSES.has(schedule.workflowStatus)) conflict('SCHEDULE_NOT_APPROVABLE');
  if (schedule.rowVersion !== body.expectedRowVersion) conflict('SCHEDULE_VERSION_CONFLICT');
  const technical = await tx.scheduleApproval.findFirst({
    where: { projectId, scheduleId: schedule.id, reviewRound: schedule.reviewRound, approvalStage: 'TECHNICAL', decision: 'APPROVE' },
    orderBy: [{ decidedAt: 'desc' }, { createdAt: 'desc' }],
  });
  if (!technical || technical.scheduleSnapshotHash !== hash) conflict('CURRENT_ENGINEER_REVIEW_REQUIRED');
  await assertPreparation(tx,schedule);
  if(!body.reason||body.reason.trim().length<5||body.reason.trim().length>300)fail('Enter a PM approval reason between 5 and 300 characters.');

  const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, boqLocked: true, contractAmount: true } });
  if (!project) fail('PROJECT_NOT_FOUND', 404);
  if (!project.boqLocked || !schedule.lockedBOQVersionId || !schedule.lockedBOQChecksum) conflict('APPROVED_BOQ_PIN_REQUIRED');
  const version = await tx.projectBOQVersion.findFirst({ where: { id: schedule.lockedBOQVersionId, projectId } });
  if (!version || !['APPROVED', 'LOCKED'].includes(version.status) || version.checksum !== schedule.lockedBOQChecksum) conflict('APPROVED_BOQ_PIN_MISMATCH');
  const boqItems = await tx.awardedBOQItem.findMany({ where: { projectId }, orderBy: [{ itemCode: 'asc' }, { id: 'asc' }] });
  if (!boqItems.length) conflict('APPROVED_BOQ_ITEMS_REQUIRED');
  const canonical = buildDraftBOQChecksum(boqItems as DraftBOQLine[]);
  if (canonical !== version.checksum) conflict('APPROVED_BOQ_CHECKSUM_MISMATCH');
  if (!schedule.activities.length || !schedule.wbsNodes.length) conflict('WORK_PACKAGES_REQUIRED');
  if (schedule.activities.some((activity) => !activity.plannedStartDate || !activity.plannedFinishDate || activity.plannedFinishDate < activity.plannedStartDate)) conflict('ALL_ACTIVITIES_MUST_BE_DATED');

  const weightTotal = schedule.activities.reduce((sum, activity) => {
    if (!Number.isFinite(activity.plannedWeight)) conflict('WORK_PACKAGE_WEIGHTS_MUST_SUM_TO_ONE');
    return sum.plus(String(activity.plannedWeight));
  }, new Prisma.Decimal(0));
  if (schedule.activities.some((activity) => activity.plannedWeight < 0 || activity.plannedWeight > 1) || weightTotal.minus(1).abs().gt('0.00000001')) conflict('WORK_PACKAGE_WEIGHTS_MUST_SUM_TO_ONE');

  if (typeof schedule.description === 'string' && schedule.description.includes(RULES_VERSION)) {
    let rawMetadata: unknown;
    try { rawMetadata = JSON.parse(schedule.description); }
    catch { return conflict('WORK_PACKAGE_METADATA_INVALID'); }
    if (!rawMetadata || typeof rawMetadata !== 'object' || Array.isArray(rawMetadata)
      || (rawMetadata as Record<string, unknown>).kind !== RULES_VERSION) conflict('WORK_PACKAGE_METADATA_INVALID');
    let metadata: WorkPackagePlanDetails;
    try { metadata = readWorkPackagePlanDetails(schedule.description); }
    catch { return conflict('WORK_PACKAGE_METADATA_INVALID'); }
    if (metadata.constraints.some(entry=>entry.status==='OPEN'&&(!entry.ownerId||!entry.neededBy))) conflict('OPEN_CONSTRAINT_OWNER_AND_DATE_REQUIRED');
  }

  const lineMap = new Map(boqItems.map((item) => [item.id, item]));
  const quantityByItem = new Map<string, Prisma.Decimal>();
  const amountByItem = new Map<string, Prisma.Decimal>();
  let allocationsAmount = new Prisma.Decimal(0);
  for (const activity of schedule.activities) {
    for (const allocation of activity.boqAllocations) {
      const line = lineMap.get(allocation.awardedBoqItemId);
      if (!line) conflict('ALLOCATION_OUTSIDE_LOCKED_BOQ');
      const q = decimal(allocation.allocatedQuantity, 'ALLOCATION_QUANTITY_REQUIRED');
      const amount = decimal(allocation.allocatedAmount, 'ALLOCATION_AMOUNT_REQUIRED');
      if (q.isNegative() || amount.isNegative()) conflict('NEGATIVE_ALLOCATION');
      quantityByItem.set(line.id, (quantityByItem.get(line.id) ?? new Prisma.Decimal(0)).plus(q));
      amountByItem.set(line.id, (amountByItem.get(line.id) ?? new Prisma.Decimal(0)).plus(amount));
      allocationsAmount = allocationsAmount.plus(amount);
    }
  }
  for (const line of boqItems) {
    const quantity = decimal(line.quantity, 'BOQ_QUANTITY_INVALID');
    const amount = decimal(line.totalCost, 'BOQ_AMOUNT_INVALID');
    if (quantity.isNegative()) conflict('BOQ_QUANTITY_INVALID');
    if (quantity.isZero() && amount.gt(0)) conflict('BOQ_ZERO_QUANTITY_HAS_AMOUNT');
    if (!(quantityByItem.get(line.id) ?? new Prisma.Decimal(0)).eq(quantity)) conflict('BOQ_QUANTITIES_MUST_BE_FULLY_ALLOCATED');
    if (amount.isNegative() || !(amountByItem.get(line.id) ?? new Prisma.Decimal(0)).eq(amount)) conflict('BOQ_ALLOCATION_AMOUNTS_MUST_RECONCILE');
  }
  const scheduledAmount = decimal(schedule.scheduledAmount, 'SCHEDULE_AMOUNT_INVALID');
  const awardedAmount = decimal(schedule.awardedContractAmount, 'SCHEDULE_AWARDED_AMOUNT_INVALID');
  const difference = decimal(schedule.differenceAmount, 'SCHEDULE_DIFFERENCE_INVALID');
  if (!allocationsAmount.eq(scheduledAmount) || !scheduledAmount.eq(awardedAmount) || !difference.isZero()) conflict('SCHEDULE_AMOUNT_RECONCILIATION_FAILED');

  const previous = await tx.projectSchedule.findFirst({ where: { projectId, workflowStatus: ProjectScheduleWorkflowStatus.ACTIVE_BASELINE }, orderBy: { activatedAt: 'desc' } });
  if(schedule.previousBaselineId&&previous?.id!==schedule.previousBaselineId)conflict('REVISION_BASELINE_CHANGED');
  if(previous&&!schedule.previousBaselineId)conflict('START_A_REASONED_PLAN_REVISION');
  const activationExists = await tx.baselineActivation.findFirst({ where: { scheduleId: schedule.id, isAuthoritative: true, invalidatedAt: null }, select: { id: true } });
  if (activationExists) conflict('AUTHORITATIVE_ACTIVATION_ALREADY_EXISTS');
  const highest = await tx.projectSchedule.aggregate({ where: { projectId }, _max: { revisionNumber: true } });
  const nextRevision = schedule.revisionNumber ?? ((highest._max.revisionNumber ?? 0) + 1);
  const revisionCode = schedule.revisionCode ?? nextCode(nextRevision, 'REV');
  const baselineCount = await tx.projectSchedule.count({ where: { projectId, baselineCode: { not: null } } });
  const baselineCode = nextCode(baselineCount + 1, 'BL');
  const user = await tx.user.findUnique({ where: { id: actor.id }, select: { name: true, role: true } });
  const comments = body.reason.trim();

  // Supersede only after every current-plan/BOQ check passed. The surrounding
  // serializable transaction keeps this replacement atomic with activation.
  if (previous) {
    const superseded = await tx.projectSchedule.updateMany({
      where: { id: previous.id, projectId, workflowStatus: ProjectScheduleWorkflowStatus.ACTIVE_BASELINE },
      data: { workflowStatus: ProjectScheduleWorkflowStatus.SUPERSEDED_BASELINE, status: 'REVISED', rowVersion: { increment: 1 } },
    });
    if (superseded.count !== 1) conflict('ACTIVE_BASELINE_CHANGED');
  }
  await tx.scheduleApproval.create({ data: {
    projectId, scheduleId: schedule.id, reviewRound: schedule.reviewRound, revisionCode,
    approvalStage: 'FINAL_ACTIVATION', decision: 'APPROVE', reviewerId: actor.id,
    reviewerNameSnapshot: user?.name || actor.name || 'Unknown', reviewerRoleSnapshot: user?.role || actor.role,
    comments, validationSnapshot: snapshot, snapshotVersion: RULES_VERSION,
    scheduleSnapshotHash: hash, lockedBOQChecksum: schedule.lockedBOQChecksum,
  } });
  await tx.baselineActivation.create({ data: {
    projectId, scheduleId: schedule.id, reviewRound: schedule.reviewRound, revisionCode,
    previousBaselineId: previous?.id ?? null, validationSnapshot: snapshot,
    snapshotVersion: RULES_VERSION, scheduleSnapshotHash: hash,
    lockedBOQChecksum: schedule.lockedBOQChecksum, activatedById: actor.id,
    activatedByNameSnapshot: user?.name || actor.name || 'Unknown',
    activatedByRoleSnapshot: user?.role || actor.role,
    isAuthoritative: true,
  } });
  const update = await tx.projectSchedule.updateMany({
    where: { id: schedule.id, projectId, rowVersion: body.expectedRowVersion, workflowStatus: schedule.workflowStatus },
    data: {
      workflowStatus: ProjectScheduleWorkflowStatus.ACTIVE_BASELINE, status: 'BASELINE',
      revisionNumber: nextRevision, revisionCode, baselineCode,
      previousBaselineId: previous?.id ?? schedule.previousBaselineId,
      activatedById: actor.id, activatedAt: new Date(), activationSnapshotHash: hash,
      baselineStartDate: schedule.projectStartDate, baselineFinishDate: schedule.projectCompletionDate,
      rowVersion: { increment: 1 },
    },
  });
  if (update.count !== 1) conflict('SCHEDULE_VERSION_CONFLICT');
  await audit(tx, actor, 'BOQ_WPS_BASELINE_APPROVED', schedule.id, { workflowStatus: schedule.workflowStatus, previousBaselineId: previous?.id ?? null }, { workflowStatus: ProjectScheduleWorkflowStatus.ACTIVE_BASELINE, baselineCode, revisionCode, scheduleSnapshotHash: hash });
  return { scheduleId: schedule.id, workflowStatus: ProjectScheduleWorkflowStatus.ACTIVE_BASELINE, baselineCode, revisionCode, rowVersion: body.expectedRowVersion + 1 };
}

async function startRevision(tx: Prisma.TransactionClient, projectId: string, actor: Actor, body: CommandBody) {
  const reason = body.reason?.trim();
  if (!reason||reason.length<5||reason.length>500) fail('Revision reason must contain 5 to 500 characters.');
  const source = await tx.projectSchedule.findFirst({ where: { id: body.scheduleId, projectId, workflowStatus: ProjectScheduleWorkflowStatus.ACTIVE_BASELINE }, include: {
    wbsNodes: { orderBy: [{ level: 'asc' }, { orderIndex: 'asc' }, { id: 'asc' }] },
    activities: { orderBy: [{ id: 'asc' }], include: { boqAllocations: { orderBy: { id: 'asc' } } } },
    dependencies: { orderBy: [{ predecessorId: 'asc' }, { successorId: 'asc' }] },
  } });
  if (!source) fail('ACTIVE_BASELINE_NOT_FOUND', 404);
  if (source.rowVersion !== body.expectedRowVersion) conflict('SCHEDULE_VERSION_CONFLICT');
  const existingDraft = await tx.projectSchedule.findFirst({ where: { projectId, parentScheduleId: source.id, workflowStatus: { in: [...DRAFT_STATUSES] } }, select: { id: true } });
  if (existingDraft) conflict('OPEN_REVISION_ALREADY_EXISTS');
  const max = await tx.projectSchedule.aggregate({ where: { projectId }, _max: { revisionNumber: true } });
  const revisionNumber = (max._max.revisionNumber ?? 0) + 1;
  const revisionCode = nextCode(revisionNumber, 'REV');
  const created = await tx.projectSchedule.create({ data: {
    projectId, name: `${source.name} — ${revisionCode}`, description: source.description,
    status: 'DRAFT', workflowStatus: ProjectScheduleWorkflowStatus.AI_GENERATED_DRAFT,
    calendarDays: source.calendarDays, workingDays: source.workingDays, holidays: source.holidays,
    workDaysConfig: source.workDaysConfig, lockedBOQVersionId: source.lockedBOQVersionId,
    lockedBOQChecksum: source.lockedBOQChecksum, awardedContractAmount: source.awardedContractAmount,
    scheduledAmount: source.scheduledAmount, differenceAmount: source.differenceAmount,
    generationRulesVersion: RULES_VERSION, generatedById: actor.id, generatedAt: new Date(),
    revisionNumber, revisionCode, parentScheduleId: source.id, previousBaselineId: source.id,
    reviewRound: source.reviewRound + 1, projectStartDate: source.projectStartDate,
    projectCompletionDate: source.projectCompletionDate, rowVersion: 1,
  } });
  const wbsIds = new Map<string, string>();
  for (const node of source.wbsNodes) {
    const copied = await tx.scheduleWBS.create({ data: {
      scheduleId: created.id, parentId: node.parentId ? wbsIds.get(node.parentId) ?? null : null,
      code: node.code, name: node.name, description: node.description, level: node.level, orderIndex: node.orderIndex,
    } });
    wbsIds.set(node.id, copied.id);
  }
  const activityIds = new Map<string, string>();
  const allocationIds = new Map<string, string>();
  for (const activity of source.activities) {
    const copied = await tx.scheduleActivity.create({ data: {
      scheduleId: created.id, wbsId: activity.wbsId ? wbsIds.get(activity.wbsId) ?? null : null,
      activityCode: activity.activityCode, name: activity.name, description: activity.description,
      discipline: activity.discipline, plannedStartDate: activity.plannedStartDate,
      plannedFinishDate: activity.plannedFinishDate, plannedDuration: activity.plannedDuration,
      plannedQuantity: activity.plannedQuantity, unit: activity.unit, plannedWeight: activity.plannedWeight,
      status: 'NOT_STARTED', priority: activity.priority, criticalPath: activity.criticalPath,
      totalFloat: activity.totalFloat, freeFloat: activity.freeFloat, activityType: activity.activityType,
      systemOrArea: activity.systemOrArea, allocatedAmount: activity.allocatedAmount,
    } });
    activityIds.set(activity.id, copied.id);
    for (const allocation of activity.boqAllocations) {
      const copiedAllocation = await tx.scheduleBOQAllocation.create({ data: {
        activityId: copied.id, scheduleId: created.id, projectId,
        awardedBoqItemId: allocation.awardedBoqItemId, mappedQuantity: allocation.mappedQuantity,
        mappedWeight: allocation.mappedWeight, phaseId: allocation.phaseId, boqLineId: allocation.boqLineId,
        allocationMode: allocation.allocationMode, awardedQuantity: allocation.awardedQuantity,
        allocatedQuantity: allocation.allocatedQuantity, allocatedPercentage: allocation.allocatedPercentage,
        awardedAmount: allocation.awardedAmount, allocatedAmount: allocation.allocatedAmount,
        allocationReason: allocation.allocationReason,
      } });
      allocationIds.set(allocation.id, copiedAllocation.id);
    }
  }
  for (const dependency of source.dependencies) {
    const predecessorId = activityIds.get(dependency.predecessorId);
    const successorId = activityIds.get(dependency.successorId);
    if (!predecessorId || !successorId) conflict('BASELINE_DEPENDENCY_INVALID');
    await tx.scheduleDependency.create({ data: { scheduleId: created.id, predecessorId, successorId, type: dependency.type, lagDays: dependency.lagDays, remarks: dependency.remarks } });
  }
  {
    let details: WorkPackagePlanDetails;
    try { details = readWorkPackagePlanDetails(source.description); }
    catch { return conflict('WORK_PACKAGE_METADATA_INVALID'); }
    let tagged = false;
    try {
      const parsed = source.description ? JSON.parse(source.description) as unknown : null;
      tagged = Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as Record<string, unknown>).kind === RULES_VERSION);
    } catch { if(source.generationRulesVersion===RULES_VERSION) return conflict('WORK_PACKAGE_METADATA_INVALID'); }
    if (source.generationRulesVersion===RULES_VERSION && source.description?.includes(RULES_VERSION) && !tagged) conflict('WORK_PACKAGE_METADATA_INVALID');
    const remapActivity = (activityId: string | null) => {
      if (activityId === null) return null;
      const mapped = activityIds.get(activityId);
      if (!mapped) conflict('REVISION_METADATA_ACTIVITY_REFERENCE_INVALID');
      return mapped;
    };
    const execution=await tx.workPackageExecutionState.findUnique({where:{projectId},select:{dataJson:true}});
    const live=execution?JSON.parse(execution.dataJson)as WorkPackageExecutionDocument:null;
    // Locations are live project truth; a revision uses the current names and tree.
    if(live?.locations)details.locations=live.locations;
    const validLocationIds = new Set(details.locations.map((location) => location.id));
    const remappedAllocationLocations: Record<string, string> = {};
    for (const [oldAllocationId, locationId] of Object.entries(details.allocationLocations)) {
      const newAllocationId = allocationIds.get(oldAllocationId);
      if (newAllocationId && validLocationIds.has(locationId)) remappedAllocationLocations[newAllocationId] = locationId;
    }
    const remapped: WorkPackagePlanDetails = {
      ...details,
      constraints: details.constraints.map((entry) => ({ ...entry, activityId: remapActivity(entry.activityId) })),
      resources: details.resources.map((entry) => ({ ...entry, activityId: remapActivity(entry.activityId) })),
      breakdownUploads: details.breakdownUploads?.map(entry => ({ ...entry, activityId: remapActivity(entry.activityId) || entry.activityId })),
      allocationLocations: remappedAllocationLocations,
      packageIdentities: Object.fromEntries([...activityIds].map(([oldId,newId])=>[newId,details.packageIdentities?.[oldId]||oldId])),
      resourcesReviewNeeded: Object.fromEntries([...activityIds].map(([oldId,newId])=>[newId,details.resourcesReviewNeeded?.[oldId]===true])),
      packageAssumptions:Object.fromEntries([...activityIds].flatMap(([oldId,newId])=>details.packageAssumptions?.[oldId]?[[newId,details.packageAssumptions[oldId]]]:[])),
    };
    if(live)remapped.constraints=mergeLiveConstraints(remapped,[...activityIds.values()],live.constraints);
    const savedDetails = await tx.projectSchedule.updateMany({ where: { id: created.id, projectId }, data: { description: JSON.stringify(remapped) } });
    if (savedDetails.count !== 1) conflict('REVISION_DETAILS_SAVE_FAILED');
  }
  await tx.scheduleRevisionReason.create({ data: {
    projectId, scheduleId: created.id, parentScheduleId: source.id,
    revisionType: 'TECHNICAL_CORRECTION', reason,
    createdById: actor.id, createdByNameSnapshot: actor.name || 'Unknown', createdByRoleSnapshot: actor.role,
  } });
  await audit(tx, actor, 'BOQ_WPS_REVISION_STARTED', created.id, { sourceBaselineId: source.id }, { scheduleId: created.id, revisionCode, revisionNumber, reason });
  return { scheduleId: created.id, parentScheduleId: source.id, workflowStatus: created.workflowStatus, revisionCode, rowVersion: 1 };
}

async function cancelRevision(tx: Prisma.TransactionClient, projectId: string, actor: Actor, body: CommandBody) {
  const schedule = await tx.projectSchedule.findFirst({ where: { id: body.scheduleId, projectId } });
  if (!schedule) fail('SCHEDULE_NOT_FOUND', 404);
  if (!DRAFT_STATUSES.has(schedule.workflowStatus) || !schedule.parentScheduleId || !schedule.previousBaselineId || schedule.revisionNumber === null) conflict('REVISION_DRAFT_REQUIRED');
  await bump(tx, schedule, body.expectedRowVersion, { workflowStatus: ProjectScheduleWorkflowStatus.ARCHIVED_BASELINE, status: 'ARCHIVED' });
  await audit(tx, actor, 'BOQ_WPS_REVISION_CANCELLED', schedule.id, { workflowStatus: schedule.workflowStatus }, { workflowStatus: ProjectScheduleWorkflowStatus.ARCHIVED_BASELINE, activeBaselineId: schedule.previousBaselineId });
  return { scheduleId: schedule.id, workflowStatus: ProjectScheduleWorkflowStatus.ARCHIVED_BASELINE, rowVersion: body.expectedRowVersion + 1 };
}

export async function runWorkPackageReviewCommand(args: { projectId: string; actor: Actor; body: unknown }) {
  const body = validateBody(args.body);
  return transaction(async (tx) => {
    if (body.action === 'start-revision') return startRevision(tx, args.projectId, args.actor, body);
    if (body.action === 'cancel-revision') return cancelRevision(tx, args.projectId, args.actor, body);
    if (body.action === 'approve') return approvePlan(tx, args.projectId, args.actor, body);

    const { schedule, snapshot, hash } = await loadPlan(tx, args.projectId, body.scheduleId);
    if (!DRAFT_STATUSES.has(schedule.workflowStatus) || schedule.generationRulesVersion !== RULES_VERSION) conflict('SCHEDULE_NOT_REVIEWABLE');
    if (schedule.rowVersion !== body.expectedRowVersion) conflict('SCHEDULE_VERSION_CONFLICT');
    const comments = body.comments?.trim();
    if (!comments||comments.length<5||comments.length>500) fail('Engineering review must contain 5 to 500 characters.');
    await assertPreparation(tx,schedule);
    await bump(tx, schedule, body.expectedRowVersion);
    await tx.scheduleApproval.create({ data: {
      projectId: args.projectId, scheduleId: schedule.id, reviewRound: schedule.reviewRound,
      revisionCode: schedule.revisionCode, approvalStage: 'TECHNICAL', decision: 'APPROVE',
      reviewerId: args.actor.id, reviewerNameSnapshot: args.actor.name || 'Unknown',
      reviewerRoleSnapshot: args.actor.role, comments, validationSnapshot: snapshot,
      snapshotVersion: RULES_VERSION, scheduleSnapshotHash: hash,
      lockedBOQChecksum: schedule.lockedBOQChecksum,
    } });
    await audit(tx, args.actor, 'BOQ_WPS_ENGINEER_REVIEW_RECORDED', schedule.id, null, { comments, scheduleSnapshotHash: hash, rowVersion: body.expectedRowVersion + 1 });
    return { scheduleId: schedule.id, workflowStatus: schedule.workflowStatus, reviewRound: schedule.reviewRound, scheduleSnapshotHash: hash, rowVersion: body.expectedRowVersion + 1 };
  });
}
