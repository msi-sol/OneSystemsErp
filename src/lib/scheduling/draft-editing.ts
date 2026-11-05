import { Prisma, ProjectScheduleWorkflowStatus } from '@prisma/client';
import { prisma, transactionContext } from '@/lib/prisma';
import { assertScheduleEditable } from '@/lib/scheduling/scheduleWorkflow';
import { readWorkPackagePlanDetails } from './work-package-details-types';
import { assertWorkPackageExecutedScope } from './work-package-execution';

export class DraftEditingError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'DraftEditingError';
  }
}

type Actor = { id: string; role: string; name?: string | null };

const activityFields = new Set([
  'name', 'activityCode', 'code', 'description', 'wbsId', 'plannedDuration',
  'plannedStartDate', 'plannedFinishDate', 'unit', 'plannedQuantity', 'status',
  'priority', 'actualStartDate', 'actualFinishDate', 'actualProgressPercent',
  'expectedRowVersion', 'plannedWeight',
]);
const activityStatuses = new Set(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED']);
const priorities = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

function invalid(message: string): never {
  throw new DraftEditingError(message, 400);
}

function conflict(message: string): never {
  throw new DraftEditingError(message, 409);
}

function parseDate(value: unknown, field: string): Date | null {
  const code = field.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase();
  if (value === null) return null;
  if (typeof value !== 'string' || !value.trim()) invalid(`INVALID_${code}`);
  const datePrefix = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  if (!datePrefix) invalid(`INVALID_${code}`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) invalid(`INVALID_${code}`);
  const [, y, m, d] = datePrefix;
  const normalized = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (normalized.getUTCFullYear() !== Number(y) || normalized.getUTCMonth() + 1 !== Number(m) || normalized.getUTCDate() !== Number(d)) {
    invalid(`INVALID_${code}`);
  }
  return date;
}

function validateStringLength(value: string, maxLength: number, code: string): void {
  if (Array.from(value).length > maxLength) invalid(code);
}

function validateDateOrder(start: Date | null | undefined, finish: Date | null | undefined): void {
  if (start && finish && finish.getTime() < start.getTime()) invalid('FINISH_BEFORE_START');
}

function asDecimal(value: Prisma.Decimal | number | string | null | undefined, errorCode: string): Prisma.Decimal {
  if (value === null || value === undefined) conflict(errorCode);
  try {
    const decimal = new Prisma.Decimal(value.toString());
    if (!decimal.isFinite()) conflict(errorCode);
    return decimal;
  } catch {
    return conflict(errorCode);
  }
}

function requireExpectedVersion(value: unknown, observed: number): number {
  if (value === undefined) invalid('MISSING_EXPECTED_ROW_VERSION');
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid('INVALID_EXPECTED_ROW_VERSION');
  if (value !== observed) conflict('SCHEDULE_VERSION_CONFLICT');
  return value;
}

function assertEditable(schedule: { workflowStatus: string }): void {
  try {
    assertScheduleEditable(schedule);
  } catch {
    conflict('SCHEDULE_NOT_EDITABLE_IN_CURRENT_STATUS');
  }
}

function assertNoUnknownFields(body: Record<string, unknown>, allowed: Set<string>): void {
  const unknown = Object.keys(body).find((key) => !allowed.has(key));
  if (unknown) invalid(`UNKNOWN_FIELD_${unknown}`);
}

function runGuardedTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return transactionContext.run({ sourceProvenance: 'GATE9_WORKFLOW_ENGINE' }, async () => {
    try {
      return await prisma.$transaction(async (tx) => work(tx as unknown as Prisma.TransactionClient), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 15000,
        timeout: 30000,
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'P2034') {
        conflict('SCHEDULE_VERSION_CONFLICT');
      }
      throw error;
    }
  });
}

async function bumpScheduleVersion(
  tx: Prisma.TransactionClient,
  schedule: { id: string; projectId: string; rowVersion: number; workflowStatus: string },
  expectedRowVersion: number,
  extraData: Prisma.ProjectScheduleUpdateManyMutationInput = {},
): Promise<void> {
  const result = await tx.projectSchedule.updateMany({
    where: {
      id: schedule.id,
      projectId: schedule.projectId,
      workflowStatus: schedule.workflowStatus as ProjectScheduleWorkflowStatus,
      rowVersion: expectedRowVersion,
    },
    data: { ...extraData, rowVersion: { increment: 1 } },
  });
  if (result.count !== 1) conflict('SCHEDULE_VERSION_CONFLICT');
}

function activityAuditShape(activity: Record<string, unknown>): Record<string, unknown> {
  const fields = [
    'name', 'activityCode', 'description', 'wbsId', 'plannedStartDate', 'plannedFinishDate',
    'plannedDuration', 'plannedQuantity', 'plannedWeight', 'unit', 'status', 'priority', 'actualStartDate',
    'actualFinishDate', 'actualProgressPercent',
  ];
  return Object.fromEntries(fields.map((field) => [field, activity[field] instanceof Date ? (activity[field] as Date).toISOString() : activity[field]]));
}

export async function createDraftScheduleActivity(args: {
  projectId: string;
  actor: Actor;
  body: unknown;
}) {
  if (!args.body || typeof args.body !== 'object' || Array.isArray(args.body)) invalid('INVALID_REQUEST_BODY');
  const body = args.body as Record<string, unknown>;
  assertNoUnknownFields(body, new Set([
    'name', 'activityCode', 'code', 'description', 'wbsId', 'plannedDuration',
    'plannedStartDate', 'plannedFinishDate', 'unit', 'plannedQuantity', 'expectedRowVersion',
  ]));
  if (typeof body.name !== 'string' || !body.name.trim()) invalid('INVALID_NAME');
  const name = body.name.trim();
  validateStringLength(name, 191, 'NAME_TOO_LONG');
  const expectedRowVersionInput = body.expectedRowVersion;
  if (expectedRowVersionInput === undefined) invalid('MISSING_EXPECTED_ROW_VERSION');
  if (typeof expectedRowVersionInput !== 'number' || !Number.isSafeInteger(expectedRowVersionInput) || expectedRowVersionInput < 0) {
    invalid('INVALID_EXPECTED_ROW_VERSION');
  }

  const activityCode = body.activityCode !== undefined ? body.activityCode : body.code;
  if (body.activityCode !== undefined && body.code !== undefined) invalid('DUPLICATE_ACTIVITY_CODE_FIELD');
  if (activityCode !== undefined && activityCode !== null && typeof activityCode !== 'string') invalid('INVALID_ACTIVITY_CODE');
  if (typeof activityCode === 'string') validateStringLength(activityCode.trim(), 191, 'ACTIVITY_CODE_TOO_LONG');
  if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') invalid('INVALID_DESCRIPTION');
  if (typeof body.description === 'string') validateStringLength(body.description, 10000, 'DESCRIPTION_TOO_LONG');
  if (body.plannedDuration !== undefined && (typeof body.plannedDuration !== 'number' || !Number.isSafeInteger(body.plannedDuration) || body.plannedDuration < 0)) invalid('INVALID_PLANNED_DURATION');
  if (body.plannedQuantity !== undefined && (typeof body.plannedQuantity !== 'number' || !Number.isFinite(body.plannedQuantity) || body.plannedQuantity < 0)) invalid('INVALID_PLANNED_QUANTITY');
  if (body.unit !== undefined && body.unit !== null && typeof body.unit !== 'string') invalid('INVALID_UNIT');
  if (typeof body.unit === 'string') validateStringLength(body.unit.trim(), 191, 'UNIT_TOO_LONG');
  if (body.wbsId !== undefined && body.wbsId !== null && typeof body.wbsId !== 'string') invalid('INVALID_WBS_ID');
  const plannedStartDate = body.plannedStartDate === undefined ? null : parseDate(body.plannedStartDate, 'plannedStartDate');
  const plannedFinishDate = body.plannedFinishDate === undefined ? null : parseDate(body.plannedFinishDate, 'plannedFinishDate');
  validateDateOrder(plannedStartDate, plannedFinishDate);

  return runGuardedTransaction(async (tx) => {
    const schedule = await tx.projectSchedule.findFirst({
      where: { projectId: args.projectId },
      orderBy: { createdAt: 'desc' },
    });
    if (!schedule) throw new DraftEditingError('SCHEDULE_NOT_FOUND', 404);
    assertEditable(schedule);
    const expectedRowVersion = requireExpectedVersion(expectedRowVersionInput, schedule.rowVersion);
    if (typeof body.wbsId === 'string') {
      const wbs = await tx.scheduleWBS.findFirst({ where: { id: body.wbsId, scheduleId: schedule.id }, select: { id: true } });
      if (!wbs) invalid('WBS_NOT_IN_SCHEDULE');
    }
    await bumpScheduleVersion(tx, schedule, expectedRowVersion);
    const activity = await tx.scheduleActivity.create({
      data: {
        scheduleId: schedule.id,
        name,
        activityCode: typeof activityCode === 'string' ? activityCode.trim() || null : null,
        description: typeof body.description === 'string' ? body.description : null,
        wbsId: typeof body.wbsId === 'string' ? body.wbsId : null,
        plannedDuration: typeof body.plannedDuration === 'number' ? body.plannedDuration : 0,
        plannedStartDate,
        plannedFinishDate,
        unit: typeof body.unit === 'string' ? body.unit.trim() || null : null,
        plannedQuantity: typeof body.plannedQuantity === 'number' ? body.plannedQuantity : 0,
        status: 'NOT_STARTED',
      },
      include: { wbs: true, predecessors: true, successors: true },
    });
    await tx.auditLog.create({
      data: {
        userId: args.actor.id,
        userRole: args.actor.role,
        moduleName: 'PROJECT_SCHEDULING',
        transactionId: activity.id,
        actionType: 'DRAFT_SCHEDULE_ACTIVITY_CREATED',
        oldValue: null,
        newValue: JSON.stringify({ ...activityAuditShape(activity as unknown as Record<string, unknown>), rowVersion: expectedRowVersion + 1 }),
      },
    });
    return activity;
  });
}

export async function editDraftScheduleActivity(args: {
  projectId: string;
  activityId: string;
  actor: Actor;
  body: unknown;
}) {
  if (!args.body || typeof args.body !== 'object' || Array.isArray(args.body)) invalid('INVALID_REQUEST_BODY');
  const body = args.body as Record<string, unknown>;
  assertNoUnknownFields(body, activityFields);

  return runGuardedTransaction(async (tx) => {
    const activity = await tx.scheduleActivity.findUnique({
      where: { id: args.activityId },
      include: { schedule: true },
    });
    if (!activity || activity.schedule.projectId !== args.projectId) {
      throw new DraftEditingError('ACTIVITY_NOT_FOUND', 404);
    }
    assertEditable(activity.schedule);
    const expectedRowVersion = requireExpectedVersion(body.expectedRowVersion, activity.schedule.rowVersion);

    const updateData: Prisma.ScheduleActivityUpdateInput = {};
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) invalid('INVALID_NAME');
      validateStringLength(body.name.trim(), 191, 'NAME_TOO_LONG');
      updateData.name = body.name.trim();
    }
    const codeValue = body.activityCode !== undefined ? body.activityCode : body.code;
    if (body.activityCode !== undefined && body.code !== undefined) invalid('DUPLICATE_ACTIVITY_CODE_FIELD');
    if (codeValue !== undefined) {
      if (codeValue !== null && typeof codeValue !== 'string') invalid('INVALID_ACTIVITY_CODE');
      if (typeof codeValue === 'string') validateStringLength(codeValue, 191, 'ACTIVITY_CODE_TOO_LONG');
      updateData.activityCode = typeof codeValue === 'string' ? codeValue.trim() || null : null;
    }
    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== 'string') invalid('INVALID_DESCRIPTION');
      if (typeof body.description === 'string') validateStringLength(body.description, 10000, 'DESCRIPTION_TOO_LONG');
      updateData.description = typeof body.description === 'string' ? body.description : null;
    }
    if (body.wbsId !== undefined) {
      if (body.wbsId !== null && typeof body.wbsId !== 'string') invalid('INVALID_WBS_ID');
      if (typeof body.wbsId === 'string') {
        const wbs = await tx.scheduleWBS.findFirst({ where: { id: body.wbsId, scheduleId: activity.scheduleId }, select: { id: true } });
        if (!wbs) invalid('WBS_NOT_IN_SCHEDULE');
      }
      updateData.wbs = typeof body.wbsId === 'string'
        ? { connect: { id: body.wbsId } }
        : { disconnect: true };
    }
    if (body.plannedDuration !== undefined) {
      if (typeof body.plannedDuration !== 'number' || !Number.isSafeInteger(body.plannedDuration) || body.plannedDuration < 0) invalid('INVALID_PLANNED_DURATION');
      updateData.plannedDuration = body.plannedDuration;
    }
    if (body.plannedQuantity !== undefined) {
      if (typeof body.plannedQuantity !== 'number' || !Number.isFinite(body.plannedQuantity) || body.plannedQuantity < 0) invalid('INVALID_PLANNED_QUANTITY');
      updateData.plannedQuantity = body.plannedQuantity;
    }
    if (body.plannedWeight !== undefined) {
      if (typeof body.plannedWeight !== 'number' || !Number.isFinite(body.plannedWeight) || body.plannedWeight < 0 || body.plannedWeight > 1) invalid('INVALID_COMPLETION_WEIGHT');
      updateData.plannedWeight = body.plannedWeight;
    }
    if (body.unit !== undefined) {
      if (body.unit !== null && typeof body.unit !== 'string') invalid('INVALID_UNIT');
      if (typeof body.unit === 'string') validateStringLength(body.unit.trim(), 191, 'UNIT_TOO_LONG');
      updateData.unit = typeof body.unit === 'string' ? body.unit.trim() || null : null;
    }
    if (body.status !== undefined) {
      if (typeof body.status !== 'string' || !activityStatuses.has(body.status)) invalid('INVALID_ACTIVITY_STATUS');
      updateData.status = body.status;
    }
    if (body.priority !== undefined) {
      if (typeof body.priority !== 'string' || !priorities.has(body.priority)) invalid('INVALID_ACTIVITY_PRIORITY');
      updateData.priority = body.priority;
    }
    for (const field of ['plannedStartDate', 'plannedFinishDate', 'actualStartDate', 'actualFinishDate'] as const) {
      if (body[field] !== undefined) updateData[field] = parseDate(body[field], field);
    }
    const plannedStart = Object.prototype.hasOwnProperty.call(updateData, 'plannedStartDate') ? updateData.plannedStartDate as Date | null : activity.plannedStartDate;
    const plannedFinish = Object.prototype.hasOwnProperty.call(updateData, 'plannedFinishDate') ? updateData.plannedFinishDate as Date | null : activity.plannedFinishDate;
    validateDateOrder(plannedStart, plannedFinish);
    const actualStart = Object.prototype.hasOwnProperty.call(updateData, 'actualStartDate') ? updateData.actualStartDate as Date | null : activity.actualStartDate;
    const actualFinish = Object.prototype.hasOwnProperty.call(updateData, 'actualFinishDate') ? updateData.actualFinishDate as Date | null : activity.actualFinishDate;
    validateDateOrder(actualStart, actualFinish);
    if (body.actualProgressPercent !== undefined) {
      if (typeof body.actualProgressPercent !== 'number' || !Number.isFinite(body.actualProgressPercent) || body.actualProgressPercent < 0 || body.actualProgressPercent > 100) invalid('INVALID_ACTUAL_PROGRESS_PERCENT');
      updateData.actualProgressPercent = body.actualProgressPercent;
    }
    if (Object.keys(updateData).length === 0) invalid('NO_EDITABLE_FIELDS');

    const before = activityAuditShape(activity as unknown as Record<string, unknown>);
    const schedulePatch:Prisma.ProjectScheduleUpdateManyMutationInput={};
    if(activity.schedule.generationRulesVersion==='BOQ_WPS_WORKSPACE_V1'){
      if(body.actualProgressPercent!==undefined||body.actualStartDate!==undefined||body.actualFinishDate!==undefined)conflict('USE_MEASURED_SITE_WORK_FOR_PROGRESS');
      if(body.plannedDuration!==undefined&&(Number(body.plannedDuration)<1||Number(body.plannedDuration)>3650))invalid('INVALID_PLANNED_DURATION');
      if(body.plannedWeight!==undefined&&Number(body.plannedWeight)<=0)invalid('INVALID_COMPLETION_WEIGHT');
      if(codeValue!==undefined&&(typeof codeValue!=='string'||!codeValue.trim()||codeValue.trim().length>40))invalid('INVALID_PACKAGE_CODE');
      if(body.name!==undefined&&(typeof body.name!=='string'||body.name.trim().length<3||body.name.trim().length>180))invalid('INVALID_PACKAGE_NAME');
      if(updateData.activityCode&&await tx.scheduleActivity.findFirst({where:{scheduleId:activity.scheduleId,activityCode:updateData.activityCode as string,id:{not:activity.id}}}))conflict('PACKAGE_CODE_ALREADY_EXISTS');
      if(activity.schedule.previousBaselineId&&(body.plannedStartDate!==undefined||body.plannedFinishDate!==undefined||body.plannedDuration!==undefined)){
        const details=readWorkPackagePlanDetails(activity.schedule.description);
        details.resourcesReviewNeeded={...details.resourcesReviewNeeded,[activity.id]:true};schedulePatch.description=JSON.stringify(details);
      }
    }
    await bumpScheduleVersion(tx, activity.schedule, expectedRowVersion,schedulePatch);
    const updatedActivity = await tx.scheduleActivity.update({
      where: { id: activity.id },
      data: updateData,
      include: { wbs: true, predecessors: true, successors: true },
    });

    if (typeof body.actualProgressPercent === 'number' && body.actualProgressPercent !== activity.actualProgressPercent) {
      await tx.scheduleProgressUpdate.create({
        data: {
          scheduleId: activity.scheduleId,
          activityId: activity.id,
          updateDate: new Date(),
          progressPercent: body.actualProgressPercent,
          actualQuantity: activity.actualQuantity,
          reportedById: args.actor.id,
          remarks: 'Manual progress update from WBS activity editor',
        },
      });
    }

    const after = { ...before, ...Object.fromEntries(Object.entries(updateData).filter(([key]) => key !== 'wbs')) };
    if (body.wbsId !== undefined) after.wbsId = body.wbsId;
    await tx.auditLog.create({
      data: {
        userId: args.actor.id,
        userRole: args.actor.role,
        moduleName: 'PROJECT_SCHEDULING',
        transactionId: activity.id,
        actionType: 'DRAFT_SCHEDULE_ACTIVITY_EDITED',
        oldValue: JSON.stringify(before),
        newValue: JSON.stringify(after),
      },
    });

    return updatedActivity;
  });
}

export async function deleteDraftScheduleActivity(args: {
  projectId: string;
  activityId: string;
  actor: Actor;
  body: unknown;
}) {
  if (!args.body || typeof args.body !== 'object' || Array.isArray(args.body)) invalid('INVALID_REQUEST_BODY');
  const body = args.body as Record<string, unknown>;
  assertNoUnknownFields(body, new Set(['expectedRowVersion']));

  return runGuardedTransaction(async (tx) => {
    const activity = await tx.scheduleActivity.findUnique({
      where: { id: args.activityId },
      include: { schedule: true, boqAllocations: { select: { id: true, allocatedAmount: true } } },
    });
    if (!activity || activity.schedule.projectId !== args.projectId) {
      throw new DraftEditingError('ACTIVITY_NOT_FOUND', 404);
    }
    assertEditable(activity.schedule);
    const expectedRowVersion = requireExpectedVersion(body.expectedRowVersion, activity.schedule.rowVersion);

    let allocationTotal = new Prisma.Decimal(0);
    if (activity.schedule.generationRulesVersion === 'BOQ_WPS_WORKSPACE_V1') {
      const details = readWorkPackagePlanDetails(activity.schedule.description);
      const sourcePackageId=details.packageIdentities?.[activity.id]||activity.id;
      const procurement=await tx.auditLog.count({where:{actionType:'WPS_PROCUREMENT_RECORD_LINKED',newValue:{contains:`"sourcePackageId":"${sourcePackageId}"`}}});
      if(procurement)conflict('PACKAGE_HAS_PROCUREMENT_HISTORY');
      const [progress, delays, mappings, links] = await Promise.all([
        tx.scheduleProgressUpdate.count({ where: { activityId: activity.id } }),
        tx.scheduleDelayRecord.count({ where: { activityId: activity.id } }),
        tx.schedulePOWMapping.count({ where: { activityId: activity.id } }),
        tx.scheduleDependency.count({ where: { OR: [{ predecessorId: activity.id }, { successorId: activity.id }] } }),
      ]);
      if (progress || delays || mappings || activity.actualQuantity > 0 || activity.actualProgressPercent > 0 || activity.actualStartDate) conflict('PACKAGE_HAS_EXECUTION_HISTORY');
      if (details.breakdownUploads?.some(row => row.activityId === activity.id)) conflict('PACKAGE_HAS_PRESERVED_BREAKDOWN_EVIDENCE');
      if (links || details.constraints.some(row => row.activityId === activity.id) || details.resources.some(row => row.activityId === activity.id)) conflict('REMOVE_PACKAGE_PLANNING_REFERENCES_FIRST');
    }
    for (const allocation of activity.boqAllocations) {
      allocationTotal = allocationTotal.plus(asDecimal(allocation.allocatedAmount, `ALLOCATION_AMOUNT_UNKNOWN:${allocation.id}`));
    }
    const activityAmount = asDecimal(activity.allocatedAmount, 'ACTIVITY_ALLOCATION_AMOUNT_UNKNOWN');
    if (!allocationTotal.equals(activityAmount)) conflict('ACTIVITY_ALLOCATION_TOTAL_MISMATCH');

    const scheduledAmount = asDecimal(activity.schedule.scheduledAmount, 'SCHEDULED_AMOUNT_UNKNOWN').minus(allocationTotal);
    const differenceAmount = asDecimal(activity.schedule.differenceAmount, 'SCHEDULE_DIFFERENCE_UNKNOWN').plus(allocationTotal);
    if (scheduledAmount.isNegative()) conflict('SCHEDULED_AMOUNT_WOULD_BE_NEGATIVE');

    const before = activityAuditShape(activity as unknown as Record<string, unknown>);
    await bumpScheduleVersion(tx, activity.schedule, expectedRowVersion, { scheduledAmount, differenceAmount });
    await tx.scheduleActivity.delete({ where: { id: activity.id } });
    if(activity.schedule.generationRulesVersion==='BOQ_WPS_WORKSPACE_V1'){
      const current=await tx.projectSchedule.findFirst({where:{id:activity.scheduleId,projectId:args.projectId},include:{activities:{include:{boqAllocations:true}}}});
      if(current)await assertWorkPackageExecutedScope(tx,args.projectId,current);
    }
    await tx.auditLog.create({
      data: {
        userId: args.actor.id,
        userRole: args.actor.role,
        moduleName: 'PROJECT_SCHEDULING',
        transactionId: activity.id,
        actionType: 'DRAFT_SCHEDULE_ACTIVITY_DELETED',
        oldValue: JSON.stringify({ ...before, allocatedAmount: activityAmount.toString(), allocationIds: activity.boqAllocations.map(({ id }) => id) }),
        newValue: JSON.stringify({ deleted: true, rowVersion: expectedRowVersion + 1 }),
      },
    });

    return { id: activity.id, rowVersion: expectedRowVersion + 1 };
  });
}

function parseQuantity(value: unknown): Prisma.Decimal {
  if (typeof value !== 'string' || value.length > 66) invalid('INVALID_ALLOCATED_QUANTITY');
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) invalid('INVALID_ALLOCATED_QUANTITY');
  const integerDigits = match[1].replace(/^0+/, '').length || 1;
  const fractionalDigits = match[2]?.length ?? 0;
  if (integerDigits > 35 || fractionalDigits > 30) invalid('INVALID_ALLOCATED_QUANTITY');
  const quantity = new Prisma.Decimal(normalized);
  if (!quantity.isFinite() || quantity.isNegative()) invalid('INVALID_ALLOCATED_QUANTITY');
  return quantity;
}

function moneyRound(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export async function editDraftScheduleAllocation(args: {
  projectId: string;
  allocationId: string;
  actor: Actor;
  body: unknown;
}) {
  if (!args.body || typeof args.body !== 'object' || Array.isArray(args.body)) invalid('INVALID_REQUEST_BODY');
  const body = args.body as Record<string, unknown>;
  assertNoUnknownFields(body, new Set(['allocatedQuantity', 'expectedRowVersion']));
  if (body.allocatedQuantity === undefined || body.expectedRowVersion === undefined) invalid('MISSING_REQUIRED_FIELD');
  const requestedQuantity = parseQuantity(body.allocatedQuantity);

  return runGuardedTransaction(async (tx) => {
    const allocation = await tx.scheduleBOQAllocation.findUnique({
      where: { id: args.allocationId },
      include: { activity: { include: { schedule: true } }, awardedBoqItem: true },
    });
    if (!allocation || allocation.scheduleId === null || (allocation.projectId !== null && allocation.projectId !== args.projectId) || allocation.activity.schedule.projectId !== args.projectId || allocation.activity.scheduleId !== allocation.scheduleId || allocation.awardedBoqItem.projectId !== args.projectId) {
      throw new DraftEditingError('ALLOCATION_NOT_FOUND', 404);
    }
    const schedule = allocation.activity.schedule;
    if(schedule.generationRulesVersion==='BOQ_WPS_WORKSPACE_V1')conflict('Use the Work Packages scope planner for located allocations.');
    assertEditable(schedule);
    const expectedRowVersion = requireExpectedVersion(body.expectedRowVersion, schedule.rowVersion);

    const project = await tx.project.findUnique({ where: { id: args.projectId }, select: { boqLocked: true } });
    if (!project?.boqLocked || !schedule.lockedBOQVersionId || !schedule.lockedBOQChecksum) conflict('PROJECT_BOQ_NOT_LOCKED');
    const boqVersion = await tx.projectBOQVersion.findFirst({
      where: { id: schedule.lockedBOQVersionId, projectId: args.projectId },
    });
    if (!boqVersion || !['APPROVED', 'LOCKED'].includes(boqVersion.status) || !boqVersion.checksum || boqVersion.checksum !== schedule.lockedBOQChecksum) {
      conflict('LOCKED_BOQ_VERSION_INVALID');
    }

    const itemQuantity = asDecimal(allocation.awardedBoqItem.quantity, 'BOQ_ITEM_QUANTITY_INVALID');
    const itemAmount = asDecimal(allocation.awardedBoqItem.totalCost, 'BOQ_ITEM_AMOUNT_INVALID');
    if (itemQuantity.lte(0)) conflict('BOQ_ITEM_QUANTITY_INVALID');
    if (itemAmount.isNegative()) conflict('BOQ_ITEM_AMOUNT_INVALID');
    const sameLine = await tx.scheduleBOQAllocation.findMany({
      where: { scheduleId: schedule.id, awardedBoqItemId: allocation.awardedBoqItemId },
      include: { activity: { select: { id: true } } },
      orderBy: { id: 'asc' },
    });
    if (!sameLine.length || !sameLine.some((row) => row.id === allocation.id)) conflict('ALLOCATION_NOT_IN_SCHEDULE');

    let allocatedBefore = new Prisma.Decimal(0);
    for (const row of sameLine) {
      if (row.allocatedQuantity === null) conflict(`ALLOCATION_QUANTITY_UNKNOWN:${row.id}`);
      const quantity = asDecimal(row.id === allocation.id ? requestedQuantity : row.allocatedQuantity, `ALLOCATION_QUANTITY_UNKNOWN:${row.id}`);
      allocatedBefore = allocatedBefore.plus(quantity);
    }
    if (allocatedBefore.gt(itemQuantity)) invalid('ALLOCATION_EXCEEDS_BOQ_QUANTITY');

    const shares = new Map<string, Prisma.Decimal>();
    // Round cumulative authoritative value, then assign each allocation the
    // nonnegative difference from the previous cumulative cent value. The
    // final allocation therefore reconciles exactly when the BOQ quantity is
    // fully allocated, without pushing an earlier share below zero.
    let cumulativeQuantity = new Prisma.Decimal(0);
    let previousCumulativeAmount = new Prisma.Decimal(0);
    for (const row of sameLine) {
      const quantity = asDecimal(row.id === allocation.id ? requestedQuantity : row.allocatedQuantity, `ALLOCATION_QUANTITY_UNKNOWN:${row.id}`);
      cumulativeQuantity = cumulativeQuantity.plus(quantity);
      const cumulativeAmount = moneyRound(itemAmount.mul(cumulativeQuantity).div(itemQuantity));
      const share = cumulativeAmount.minus(previousCumulativeAmount);
      if (share.isNegative()) conflict('NEGATIVE_ALLOCATION_AMOUNT');
      shares.set(row.id, share);
      previousCumulativeAmount = cumulativeAmount;
    }

    const allScheduleAllocations = await tx.scheduleBOQAllocation.findMany({
      where: { scheduleId: schedule.id },
      select: { id: true, activityId: true, awardedBoqItemId: true, allocatedAmount: true },
    });
    let scheduledAmount = new Prisma.Decimal(0);
    const activityAmounts = new Map<string, Prisma.Decimal>();
    for (const row of allScheduleAllocations) {
      const share = shares.get(row.id) ?? asDecimal(row.allocatedAmount, `ALLOCATION_AMOUNT_UNKNOWN:${row.id}`);
      scheduledAmount = scheduledAmount.plus(share);
      activityAmounts.set(row.activityId, (activityAmounts.get(row.activityId) ?? new Prisma.Decimal(0)).plus(share));
    }
    for (const row of sameLine) {
      if (!activityAmounts.has(row.activity.id)) activityAmounts.set(row.activity.id, new Prisma.Decimal(0));
    }
    const awardedAmount = asDecimal(schedule.awardedContractAmount, 'SCHEDULE_AWARDED_AMOUNT_UNKNOWN');
    const differenceAmount = awardedAmount.minus(scheduledAmount);

    await bumpScheduleVersion(tx, schedule, expectedRowVersion, {
      scheduledAmount,
      differenceAmount,
    });

    const beforeAllocations = [];
    for (const row of sameLine) {
      const newQuantity = row.id === allocation.id ? requestedQuantity : asDecimal(row.allocatedQuantity, `ALLOCATION_QUANTITY_UNKNOWN:${row.id}`);
      const newAmount = shares.get(row.id)!;
      beforeAllocations.push({ id: row.id, allocatedQuantity: row.allocatedQuantity?.toString() ?? null, allocatedAmount: row.allocatedAmount?.toString() ?? null });
      const updatedAllocation = await tx.scheduleBOQAllocation.updateMany({
        where: { id: row.id, scheduleId: schedule.id },
        data: {
          allocatedQuantity: newQuantity,
          mappedQuantity: newQuantity.toNumber(),
          allocatedPercentage: newQuantity.div(itemQuantity).mul(100),
          awardedQuantity: itemQuantity,
          awardedAmount: itemAmount,
          allocatedAmount: newAmount,
        },
      });
      if (updatedAllocation.count !== 1) conflict('ALLOCATION_VERSION_CONFLICT');
    }
    for (const [activityId, amount] of activityAmounts) {
      const result = await tx.scheduleActivity.updateMany({
        where: { id: activityId, scheduleId: schedule.id },
        data: { allocatedAmount: amount },
      });
      if (result.count !== 1) conflict('ACTIVITY_VERSION_CONFLICT');
    }

    await tx.auditLog.create({
      data: {
        userId: args.actor.id,
        userRole: args.actor.role,
        moduleName: 'PROJECT_SCHEDULING',
        transactionId: allocation.id,
        actionType: 'DRAFT_SCHEDULE_ALLOCATION_EDITED',
        oldValue: JSON.stringify({ allocations: beforeAllocations, scheduledAmount: schedule.scheduledAmount.toString(), differenceAmount: schedule.differenceAmount.toString() }),
        newValue: JSON.stringify({
          allocations: sameLine.map((row) => ({ id: row.id, allocatedQuantity: row.id === allocation.id ? requestedQuantity.toString() : row.allocatedQuantity!.toString(), allocatedAmount: shares.get(row.id)!.toString() })),
          scheduledAmount: scheduledAmount.toString(),
          differenceAmount: differenceAmount.toString(),
        }),
      },
    });

    return {
      allocationId: allocation.id,
      allocatedQuantity: requestedQuantity.toString(),
      allocatedAmount: shares.get(allocation.id)!.toString(),
      scheduledAmount: scheduledAmount.toString(),
      differenceAmount: differenceAmount.toString(),
      rowVersion: expectedRowVersion + 1,
    };
  });
}
