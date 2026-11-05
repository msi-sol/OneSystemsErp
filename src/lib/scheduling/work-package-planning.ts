import { Prisma, ProjectScheduleWorkflowStatus } from '@prisma/client';
import { prisma, transactionContext } from '@/lib/prisma';
import { buildDraftBOQChecksum } from '@/lib/boq/draft-workflow';
import { readWorkPackagePlanDetails } from './work-package-details-types';
import { estimatePhPublicWorksBudget } from './work-package-budget';
import { packageDurationDays, procurementLeadDays, laborCrew } from './work-package-suggestions';
import { randomUUID } from 'node:crypto';
import { assertWorkPackageExecutedScope } from './work-package-execution';
import {parseBOQReviewDocument,getBOQSectionIdentityByItemId}from'@/lib/boq/review-state';

const EDITABLE = new Set<string>([
  ProjectScheduleWorkflowStatus.AI_GENERATED_DRAFT,
  ProjectScheduleWorkflowStatus.INVALID_GENERATED_DRAFT,
  ProjectScheduleWorkflowStatus.TECHNICAL_REVISIONS_REQUIRED,
]);
const WORKSPACE_RULES_VERSION = 'BOQ_WPS_WORKSPACE_V1';

export class WorkPackagePlanningError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'WorkPackagePlanningError';
  }
}

type Actor = { id: string; role: string; name?: string | null };
type Decimalish = Prisma.Decimal | string | number | null | undefined;

function fail(code: string, status = 400): never {
  throw new WorkPackagePlanningError(code, status);
}
function conflict(code: string): never { return fail(code, 409); }
function decimal(value: Decimalish, code: string): Prisma.Decimal {
  if (value === null || value === undefined) conflict(code);
  try {
    const parsed = new Prisma.Decimal(value.toString());
    if (!parsed.isFinite()) conflict(code);
    return parsed;
  } catch {
    return conflict(code);
  }
}
function money(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
function text(value: unknown, code: string, max = 191): string {
  if (typeof value !== 'string' || !value.trim()) fail(code);
  const result = value.trim();
  if (Array.from(result).length > max) fail(`${code}_TOO_LONG`);
  return result;
}
function quantity(value: unknown): Prisma.Decimal {
  if (typeof value !== 'string' && typeof value !== 'number') fail('INVALID_ALLOCATED_QUANTITY');
  const raw = String(value).trim();
  if (raw.length > 66 || !/^\d+(?:\.\d+)?$/.test(raw)) fail('INVALID_ALLOCATED_QUANTITY');
  const result = new Prisma.Decimal(raw);
  if (!result.isFinite() || result.isNegative() || result.decimalPlaces() > 30) fail('INVALID_ALLOCATED_QUANTITY');
  return result;
}
function parseDate(value: unknown, code: string): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(code);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail(code);
  return date;
}
function expectedVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail('INVALID_EXPECTED_ROW_VERSION');
  return value;
}
function assertOnly(body: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(body).some((key) => !allowed.includes(key))) fail('UNKNOWN_REQUEST_FIELD');
}
function transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
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

async function approvedBoq(tx: Prisma.TransactionClient, projectId: string) {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, boqLocked: true, contractAmount: true } });
  if (!project) fail('PROJECT_NOT_FOUND', 404);
  if (!project.boqLocked) conflict('PROJECT_BOQ_NOT_LOCKED');
  const version = await tx.projectBOQVersion.findFirst({ where: { projectId }, orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }] });
  if (!version || !['APPROVED', 'LOCKED'].includes(version.status) || !version.checksum) conflict('APPROVED_BOQ_VERSION_REQUIRED');
  const items = await tx.awardedBOQItem.findMany({ where: { projectId }, orderBy: [{ itemCode: 'asc' }, { id: 'asc' }] });
  if (!items.length) conflict('APPROVED_BOQ_ITEMS_REQUIRED');
  const canonical = buildDraftBOQChecksum(items);
  if (canonical !== version.checksum) conflict('APPROVED_BOQ_CHECKSUM_MISMATCH');
  const contractAmount = decimal(project.contractAmount, 'PROJECT_CONTRACT_AMOUNT_INVALID');
  if (contractAmount.isNegative()) conflict('PROJECT_CONTRACT_AMOUNT_INVALID');
  const review=await tx.bOQReviewState.findUnique({where:{versionId:version.id},select:{dataJson:true}});
  const reviewDocument=review?parseBOQReviewDocument(review.dataJson,projectId,version.id):null;
  const sectionIdentity=reviewDocument?getBOQSectionIdentityByItemId(reviewDocument):{};
  return { project, version, items, canonical, contractAmount,sectionIdentity };
}

async function selectSchedule(tx: Prisma.TransactionClient, projectId: string, requestedId?: unknown) {
  let schedule;
  if (requestedId !== undefined) {
    if (typeof requestedId !== 'string' || !requestedId) fail('INVALID_SCHEDULE_ID');
    schedule = await tx.projectSchedule.findFirst({ where: { id: requestedId, projectId } });
  } else {
    schedule = await tx.projectSchedule.findFirst({ where: { projectId, workflowStatus: { in: [...EDITABLE] as ProjectScheduleWorkflowStatus[] } }, orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }] });
  }
  if (!schedule) fail('SCHEDULE_NOT_FOUND', 404);
  if (!EDITABLE.has(schedule.workflowStatus)) conflict('SCHEDULE_NOT_EDITABLE_IN_CURRENT_STATUS');
  if (schedule.generationRulesVersion !== WORKSPACE_RULES_VERSION) conflict('SCHEDULE_NOT_IN_BOQ_WORKSPACE');
  return schedule;
}

async function checkVersion(schedule: { rowVersion: number }, value: unknown) {
  const expected = expectedVersion(value);
  if (expected !== schedule.rowVersion) conflict('SCHEDULE_VERSION_CONFLICT');
  return expected;
}

async function bump(tx: Prisma.TransactionClient, schedule: { id: string; projectId: string; rowVersion: number; workflowStatus: string }, expected: number, data: Prisma.ProjectScheduleUpdateManyMutationInput = {}) {
  const result = await tx.projectSchedule.updateMany({
    where: { id: schedule.id, projectId: schedule.projectId, rowVersion: expected, workflowStatus: schedule.workflowStatus as ProjectScheduleWorkflowStatus },
    data: { ...data, rowVersion: { increment: 1 } },
  });
  if (result.count !== 1) conflict('SCHEDULE_VERSION_CONFLICT');
}

async function audit(tx: Prisma.TransactionClient, actor: Actor, actionType: string, transactionId: string, oldValue: unknown, newValue: unknown) {
  await tx.auditLog.create({ data: {
    userId: actor.id, userRole: actor.role, moduleName: 'PROJECT_SCHEDULING', transactionId, actionType,
    oldValue: oldValue === null ? null : JSON.stringify(oldValue), newValue: JSON.stringify(newValue),
  } });
}

async function enforceExecutedFloor(tx:Prisma.TransactionClient,projectId:string,scheduleId:string){
  const current=await tx.projectSchedule.findFirst({where:{id:scheduleId,projectId},include:{activities:{include:{boqAllocations:true}}}});
  if(current)await assertWorkPackageExecutedScope(tx,projectId,current);
}

function amountShare(itemAmount: Prisma.Decimal, totalQuantity: Prisma.Decimal, quantityValue: Prisma.Decimal): Prisma.Decimal {
  if (totalQuantity.lte(0)) conflict('BOQ_ITEM_QUANTITY_INVALID');
  return money(itemAmount.mul(quantityValue).div(totalQuantity));
}

async function recomputeAllocationMoney(tx: Prisma.TransactionClient, schedule: { id: string; projectId: string; awardedContractAmount: Prisma.Decimal | string | number }, allocations: Array<{ id: string; activityId: string; awardedBoqItemId: string; allocatedQuantity: Prisma.Decimal | null; awardedQuantity: Prisma.Decimal | null; awardedAmount: Prisma.Decimal | null }>, knownActivityIds: string[] = []) {
  const byItem = new Map<string, typeof allocations>();
  for (const allocation of allocations) {
    const list = byItem.get(allocation.awardedBoqItemId) ?? [];
    list.push(allocation);
    byItem.set(allocation.awardedBoqItemId, list);
  }
  const awardedItems = await tx.awardedBOQItem.findMany({ where: { id: { in: [...byItem.keys()] }, projectId: schedule.projectId }, select: { id: true, quantity: true, totalCost: true } });
  const items = new Map(awardedItems.map((item) => [item.id, item]));
  const shares = new Map<string, Prisma.Decimal>();
  for (const [itemId, rows] of byItem) {
    const item = items.get(itemId);
    if (!item) conflict('BOQ_ITEM_NOT_FOUND');
    const itemQty = decimal(item.quantity, 'BOQ_ITEM_QUANTITY_INVALID');
    const itemAmount = decimal(item.totalCost, 'BOQ_ITEM_AMOUNT_INVALID');
    if (itemQty.isNegative() || itemAmount.isNegative()) conflict('BOQ_ITEM_VALUE_INVALID');
    if (itemQty.isZero() && itemAmount.isZero()) {
      for (const row of rows) {
        if (!decimal(row.allocatedQuantity, `ALLOCATION_QUANTITY_UNKNOWN:${row.id}`).isZero()) conflict('ALLOCATION_EXCEEDS_BOQ_QUANTITY');
        shares.set(row.id, new Prisma.Decimal(0));
      }
      continue;
    }
    if (itemQty.isZero()) conflict('BOQ_ITEM_VALUE_INVALID');
    rows.sort((a, b) => a.id.localeCompare(b.id));
    let cumulativeQuantity = new Prisma.Decimal(0);
    let priorAmount = new Prisma.Decimal(0);
    for (const row of rows) {
      const q = decimal(row.allocatedQuantity, `ALLOCATION_QUANTITY_UNKNOWN:${row.id}`);
      cumulativeQuantity = cumulativeQuantity.plus(q);
      const cumulativeAmount = amountShare(itemAmount, itemQty, cumulativeQuantity);
      shares.set(row.id, cumulativeAmount.minus(priorAmount));
      priorAmount = cumulativeAmount;
    }
    if (cumulativeQuantity.gt(itemQty)) conflict('ALLOCATION_EXCEEDS_BOQ_QUANTITY');
  }
  const activityAmounts = new Map<string, Prisma.Decimal>();
  let scheduledAmount = new Prisma.Decimal(0);
  for (const row of allocations) {
    const share = shares.get(row.id) ?? new Prisma.Decimal(0);
    scheduledAmount = scheduledAmount.plus(share);
    activityAmounts.set(row.activityId, (activityAmounts.get(row.activityId) ?? new Prisma.Decimal(0)).plus(share));
  }
  for (const activityId of knownActivityIds) {
    if (!activityAmounts.has(activityId)) activityAmounts.set(activityId, new Prisma.Decimal(0));
  }
  for (const row of allocations) {
    const item = items.get(row.awardedBoqItemId)!;
    const q = decimal(row.allocatedQuantity, 'ALLOCATION_QUANTITY_INVALID');
    await tx.scheduleBOQAllocation.update({ where: { id: row.id }, data: {
      allocatedAmount: shares.get(row.id) ?? new Prisma.Decimal(0),
      allocatedPercentage: decimal(item.quantity, 'BOQ_ITEM_QUANTITY_INVALID').gt(0) ? q.div(item.quantity).mul(100) : 0,
      awardedQuantity: item.quantity,
      awardedAmount: item.totalCost,
      mappedQuantity: q.toNumber(),
    } });
  }
  for (const [activityId, amount] of activityAmounts) {
    await tx.scheduleActivity.updateMany({ where: { id: activityId, scheduleId: schedule.id }, data: { allocatedAmount: amount } });
  }
  const awarded = decimal(schedule.awardedContractAmount, 'SCHEDULE_AWARDED_AMOUNT_INVALID');
  return { scheduledAmount, differenceAmount: awarded.minus(scheduledAmount) };
}

function validateBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('INVALID_REQUEST_BODY');
  return body as Record<string, unknown>;
}

export async function runWorkPackagePlanningCommand(args: { projectId: string; actor: Actor; body: unknown }) {
  const body = validateBody(args.body);
  if (typeof body.action !== 'string') fail('ACTION_REQUIRED');
  const action = body.action;
  if (action === 'start') assertOnly(body, ['action', 'currentScheduleId', 'expectedRowVersion']);
  else if (action === 'suggest') assertOnly(body, ['action', 'currentScheduleId', 'expectedRowVersion']);
  else if (action === 'create') assertOnly(body, ['action', 'currentScheduleId', 'expectedRowVersion', 'name', 'activityCode', 'description', 'unit', 'plannedQuantity', 'plannedWeight', 'plannedStartDate', 'plannedFinishDate', 'plannedDuration']);
  else if (action === 'allocate') assertOnly(body, ['action', 'currentScheduleId', 'expectedRowVersion', 'boqItemId', 'activityId', 'allocatedQuantity','allocationId','locationId']);
  else if (action === 'remove-allocation') assertOnly(body, ['action', 'currentScheduleId', 'expectedRowVersion', 'allocationId']);
  else if (action === 'dependency') assertOnly(body, ['action', 'currentScheduleId', 'expectedRowVersion', 'predecessorId', 'successorId', 'dependencyType', 'lagDays', 'remarks', 'remove', 'dependencyId']);
  else fail('UNKNOWN_ACTION');

  return transaction(async (tx) => {
    const boq = await approvedBoq(tx, args.projectId);
    if (action === 'start') {
      const existingId = body.currentScheduleId;
      const existing = existingId === undefined
        ? await tx.projectSchedule.findFirst({ where: { projectId: args.projectId, workflowStatus: { in: [...EDITABLE] as ProjectScheduleWorkflowStatus[] } }, orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }] })
        : await tx.projectSchedule.findFirst({ where: { id: existingId as string, projectId: args.projectId } });
      if (existing) {
        if (!EDITABLE.has(existing.workflowStatus)) conflict('SCHEDULE_NOT_EDITABLE_IN_CURRENT_STATUS');
        const active=await tx.projectSchedule.findFirst({where:{projectId:args.projectId,workflowStatus:ProjectScheduleWorkflowStatus.ACTIVE_BASELINE},select:{id:true}});
        if(active&&existing.parentScheduleId!==active.id)conflict('START_A_REASONED_PLAN_REVISION');
        const expected = await checkVersion(existing, body.expectedRowVersion);
        if ((existing.lockedBOQVersionId && existing.lockedBOQVersionId !== boq.version.id) || (existing.lockedBOQChecksum && existing.lockedBOQChecksum !== boq.canonical)) conflict('SCHEDULE_BOQ_PIN_MISMATCH');
        if (existing.generationRulesVersion !== WORKSPACE_RULES_VERSION) {
          await bump(tx, existing, expected, { generationRulesVersion: WORKSPACE_RULES_VERSION, lockedBOQVersionId: boq.version.id, lockedBOQChecksum: boq.canonical });
          let wbs = await tx.scheduleWBS.findFirst({ where: { scheduleId: existing.id }, orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }] });
          if (!wbs) wbs = await tx.scheduleWBS.create({ data: { scheduleId: existing.id, code: 'GENERAL', name: 'General', level: 1, orderIndex: 0 } });
          await audit(tx, args.actor, 'BOQ_WPS_DRAFT_ADOPTED', existing.id, { generationRulesVersion: existing.generationRulesVersion, lockedBOQVersionId: existing.lockedBOQVersionId, lockedBOQChecksum: existing.lockedBOQChecksum }, { generationRulesVersion: WORKSPACE_RULES_VERSION, lockedBOQVersionId: boq.version.id, lockedBOQChecksum: boq.canonical, wbsId: wbs.id, rowVersion: expected + 1 });
          return { scheduleId: existing.id, rowVersion: expected + 1, created: false };
        }
        if (existing.lockedBOQVersionId !== boq.version.id || existing.lockedBOQChecksum !== boq.canonical) conflict('SCHEDULE_BOQ_PIN_MISMATCH');
        return { scheduleId: existing.id, rowVersion: existing.rowVersion, created: false };
      }
      const active=await tx.projectSchedule.findFirst({where:{projectId:args.projectId,workflowStatus:ProjectScheduleWorkflowStatus.ACTIVE_BASELINE},select:{id:true}});
      if(active)conflict('START_A_REASONED_PLAN_REVISION');
      const name = typeof body.name === 'string' ? text(body.name, 'INVALID_SCHEDULE_NAME') : 'Work Packages';
      const schedule = await tx.projectSchedule.create({ data: {
        projectId: args.projectId, name, status: 'DRAFT', workflowStatus: ProjectScheduleWorkflowStatus.AI_GENERATED_DRAFT,
        lockedBOQVersionId: boq.version.id, lockedBOQChecksum: boq.canonical,
        awardedContractAmount: boq.contractAmount, scheduledAmount: 0, differenceAmount: boq.contractAmount,
        generationRulesVersion: WORKSPACE_RULES_VERSION, generatedById: args.actor.id, generatedAt: new Date(), rowVersion: 1,
      } });
      const projectState=await tx.workPackageExecutionState.findUnique({where:{projectId:args.projectId},select:{dataJson:true}});
      if(projectState){const stored=JSON.parse(projectState.dataJson);const details=readWorkPackagePlanDetails(null);details.locations=stored.locations||[];await tx.projectSchedule.updateMany({where:{id:schedule.id},data:{description:JSON.stringify(details)}});}
      const wbs = await tx.scheduleWBS.create({ data: { scheduleId: schedule.id, code: 'GENERAL', name: 'General', level: 1, orderIndex: 0 } });
      await audit(tx, args.actor, 'BOQ_WPS_DRAFT_STARTED', schedule.id, null, { scheduleId: schedule.id, boqVersionId: boq.version.id, checksum: boq.canonical, wbsId: wbs.id, rowVersion: 1 });
      return { scheduleId: schedule.id, rowVersion: 1, created: true };
    }

    const schedule = await selectSchedule(tx, args.projectId, body.currentScheduleId);
    if (schedule.lockedBOQVersionId !== boq.version.id || schedule.lockedBOQChecksum !== boq.canonical) conflict('SCHEDULE_BOQ_PIN_MISMATCH');
    const expected = await checkVersion(schedule, body.expectedRowVersion);
    const wbs = await tx.scheduleWBS.findFirst({ where: { scheduleId: schedule.id }, orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }] });
    if (!wbs) conflict('SCHEDULE_WBS_REQUIRED');

    if (action === 'suggest') {
      const existing = await tx.scheduleActivity.count({ where: { scheduleId: schedule.id } });
      if (existing) conflict('SUGGEST_REQUIRES_EMPTY_DRAFT');
      await bump(tx, schedule, expected);
      const created = [];
      const details=readWorkPackagePlanDetails(schedule.description);
      const sections=new Map<string,{name:string;items:typeof boq.items;order:number}>();
      for(const item of boq.items){const identity=boq.sectionIdentity[item.id],key=identity?.id||`legacy:${item.category||'General works'}`;const existing=sections.get(key);sections.set(key,{name:identity?.name||item.category||'General works',items:[...(existing?.items||[]),item],order:identity?.order||0});}
      let index=0,startDay=1,accumulatedWeight=new Prisma.Decimal(0);
      for (const {name:section,items} of [...sections.values()].sort((left,right)=>left.order-right.order)) {
        const amount=items.reduce((sum,item)=>sum.plus(String(item.totalCost)),new Prisma.Decimal(0));
        const weight=index===sections.size-1?new Prisma.Decimal(1).minus(accumulatedWeight):amount.div(boq.contractAmount).toDecimalPlaces(6);
        accumulatedWeight=accumulatedWeight.plus(weight);
        const fullDescription=section;
        const duration=packageDurationDays(section,weight.mul(100).toNumber());
        const activity = await tx.scheduleActivity.create({ data: {
          scheduleId: schedule.id, wbsId: wbs.id, activityCode: `WP-${String(++index).padStart(2,'0')}`,
          // Activity names have a 191-character storage limit; retain the full
          // authoritative BOQ description in the separate LongText field.
          name: Array.from(fullDescription).slice(0, 191).join(''), description: fullDescription,
          plannedQuantity: 0, unit: null, plannedDuration: duration,
          plannedWeight: weight.toNumber(),
          allocatedAmount: amount, status: 'NOT_STARTED',
        } });
        details.packageIdentities={...details.packageIdentities,[activity.id]:activity.id};
        details.packageAssumptions={...details.packageAssumptions,[activity.id]:{plannedStartDay:startDay,procurementLeadDays:procurementLeadDays(section),laborCrew:laborCrew(section)}};
        startDay+=duration;
        const budget=estimatePhPublicWorksBudget(amount.toNumber(),section);
        for(const[kind,value]of [['MATERIAL',budget.materials],['LABOR',budget.labor],['EQUIPMENT',budget.equipment]]as const){const cost=new Prisma.Decimal(value).toDecimalPlaces(2).toFixed(2);details.resources.push({id:randomUUID(),activityId:activity.id,kind,description:`System suggested ${kind.toLowerCase()} allowance`,quantity:'1',unit:'allowance',unitCost:cost,amount:cost,isSystemSuggested:true});}
        for(const item of items){
          const q=decimal(item.quantity,'BOQ_ITEM_QUANTITY_INVALID'),itemAmount=decimal(item.totalCost,'BOQ_ITEM_AMOUNT_INVALID');
          if(q.isNegative()||itemAmount.isNegative()||(q.isZero()&&!itemAmount.isZero()))conflict('BOQ_ITEM_VALUE_INVALID');
          await tx.scheduleBOQAllocation.create({ data: {
          scheduleId: schedule.id, projectId: args.projectId, activityId: activity.id, awardedBoqItemId: item.id,
          allocationMode: q.isZero() ? 'REFERENCE_ONLY' : 'SINGLE', mappedQuantity: q.toNumber(), allocatedQuantity: q, allocatedPercentage: q.isZero() ? 0 : 100,
          awardedQuantity: q, awardedAmount: itemAmount, allocatedAmount: itemAmount,
        } });
          created.push({ activityId: activity.id, boqItemId: item.id, allocatedQuantity: q.toString(), allocatedAmount: money(itemAmount).toFixed(2) });
        }
      }
      const scheduledAmount = created.reduce((sum, row) => sum.plus(row.allocatedAmount), new Prisma.Decimal(0));
      const differenceAmount = boq.contractAmount.minus(scheduledAmount);
      await tx.projectSchedule.updateMany({ where: { id: schedule.id, rowVersion: expected + 1 }, data: { scheduledAmount, differenceAmount,description:JSON.stringify(details) } });
      await audit(tx, args.actor, 'BOQ_WPS_SUGGESTED_ACTIVITIES_CREATED', schedule.id, null, { created, rowVersion: expected + 1 });
      return { scheduleId: schedule.id, rowVersion: expected + 1, activities: created };
    }

    if (action === 'create') {
      const name = text(body.name, 'INVALID_ACTIVITY_NAME',180);
      if(name.length<3)fail('PACKAGE_NAME_TOO_SHORT');
      const code = body.activityCode === undefined || body.activityCode === null || body.activityCode === '' ? null : text(body.activityCode, 'INVALID_ACTIVITY_CODE',40);
      if(!code)fail('PACKAGE_CODE_REQUIRED');
      if(await tx.scheduleActivity.findFirst({where:{scheduleId:schedule.id,activityCode:code}}))conflict('PACKAGE_CODE_ALREADY_EXISTS');
      if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') fail('INVALID_DESCRIPTION');
      if (typeof body.description === 'string' && Array.from(body.description).length > 10000) fail('DESCRIPTION_TOO_LONG');
      if (body.unit !== undefined && body.unit !== null && typeof body.unit !== 'string') fail('INVALID_UNIT');
      if (typeof body.unit === 'string' && Array.from(body.unit).length > 191) fail('UNIT_TOO_LONG');
      const plannedQuantity = body.plannedQuantity === undefined ? 0 : quantity(body.plannedQuantity).toNumber();
      const plannedWeight = body.plannedWeight === undefined ? 0 : Number(body.plannedWeight);
      if (!Number.isFinite(plannedWeight) || plannedWeight <= 0 || plannedWeight > 1) fail('INVALID_PLANNED_WEIGHT');
      const start = parseDate(body.plannedStartDate, 'INVALID_PLANNED_START_DATE');
      const finish = parseDate(body.plannedFinishDate, 'INVALID_PLANNED_FINISH_DATE');
      if (start && finish && finish < start) fail('FINISH_BEFORE_START');
      const duration = body.plannedDuration === undefined || body.plannedDuration===0 ? packageDurationDays(name,plannedWeight*100) : body.plannedDuration;
      if (typeof duration !== 'number' || !Number.isSafeInteger(duration) || duration < 1 || duration>3650) fail('INVALID_PLANNED_DURATION');
      await bump(tx, schedule, expected);
      const activity = await tx.scheduleActivity.create({ data: {
        scheduleId: schedule.id, wbsId: wbs.id, name, activityCode: code,
        description: typeof body.description === 'string' ? body.description : null,
        unit: typeof body.unit === 'string' ? body.unit.trim() || null : null,
        plannedQuantity, plannedWeight, plannedDuration: duration,
        plannedStartDate: start, plannedFinishDate: finish, status: 'NOT_STARTED', allocatedAmount: 0,
      } });
      const details=readWorkPackagePlanDetails(schedule.description);
      details.packageIdentities={...details.packageIdentities,[activity.id]:activity.id};
      const preceding=await tx.scheduleActivity.count({where:{scheduleId:schedule.id,id:{not:activity.id}}});
      details.packageAssumptions={...details.packageAssumptions,[activity.id]:{plannedStartDay:preceding*21+1,procurementLeadDays:procurementLeadDays(name),laborCrew:laborCrew(name)}};
      await tx.projectSchedule.updateMany({where:{id:schedule.id,rowVersion:expected+1},data:{description:JSON.stringify(details)}});
      await audit(tx, args.actor, 'BOQ_WPS_ACTIVITY_CREATED', activity.id, null, { name, activityCode: code, plannedQuantity, plannedWeight, plannedStartDate: start?.toISOString() ?? null, plannedFinishDate: finish?.toISOString() ?? null, rowVersion: expected + 1 });
      return { scheduleId: schedule.id, activityId: activity.id, rowVersion: expected + 1 };
    }

    if (action === 'allocate') {
      const boqItemId = text(body.boqItemId, 'BOQ_ITEM_ID_REQUIRED');
      const activityId = text(body.activityId, 'ACTIVITY_ID_REQUIRED');
      const requested = quantity(body.allocatedQuantity);
      const item = boq.items.find((entry) => entry.id === boqItemId);
      if (!item) fail('BOQ_ITEM_NOT_FOUND', 404);
      const itemQuantity = decimal(item.quantity, 'BOQ_ITEM_QUANTITY_INVALID');
      const itemAmount = decimal(item.totalCost, 'BOQ_ITEM_AMOUNT_INVALID');
      if (itemQuantity.isNegative() || itemAmount.isNegative() || (itemQuantity.isZero() && !itemAmount.isZero())) conflict('BOQ_ITEM_VALUE_INVALID');
      const activity = await tx.scheduleActivity.findFirst({ where: { id: activityId, scheduleId: schedule.id } });
      if (!activity) fail('ACTIVITY_NOT_FOUND', 404);
      const details=readWorkPackagePlanDetails(schedule.description);
      const locationId=body.locationId==null||body.locationId===''?null:text(body.locationId,'INVALID_LOCATION_ID');
      if(locationId&&!details.locations.some(row=>row.id===locationId&&row.isActive!==false))fail('ACTIVE_LOCATION_REQUIRED');
      const allocations = await tx.scheduleBOQAllocation.findMany({ where: { scheduleId: schedule.id, awardedBoqItemId: boqItemId }, orderBy: { id: 'asc' } });
      const existing=body.allocationId?allocations.find(row=>row.id===body.allocationId&&row.activityId===activityId):allocations.find(row=>row.activityId===activityId&&(details.allocationLocations[row.id]||null)===locationId);
      if(body.allocationId&&!existing)fail('ALLOCATION_NOT_FOUND',404);
      let total = requested;
      for (const allocation of allocations) if (allocation.id !== existing?.id) total = total.plus(decimal(allocation.allocatedQuantity, `ALLOCATION_QUANTITY_UNKNOWN:${allocation.id}`));
      if (itemQuantity.isZero() && (!itemAmount.isZero() || !total.isZero())) conflict('BOQ_ITEM_VALUE_INVALID');
      if (total.gt(itemQuantity)) conflict('ALLOCATION_EXCEEDS_BOQ_QUANTITY');
      await bump(tx, schedule, expected);
      const allocation = existing
        ? await tx.scheduleBOQAllocation.update({ where: { id: existing.id }, data: { allocatedQuantity: requested, mappedQuantity: requested.toNumber(), awardedQuantity: itemQuantity, awardedAmount: itemAmount, allocationMode: itemQuantity.isZero() ? 'REFERENCE_ONLY' : 'QUANTITY_SPLIT' } })
        : await tx.scheduleBOQAllocation.create({ data: { scheduleId: schedule.id, projectId: args.projectId, activityId, awardedBoqItemId: boqItemId, allocatedQuantity: requested, mappedQuantity: requested.toNumber(), awardedQuantity: itemQuantity, awardedAmount: itemAmount, allocationMode: itemQuantity.isZero() ? 'REFERENCE_ONLY' : 'QUANTITY_SPLIT' } });
      if(locationId)details.allocationLocations[allocation.id]=locationId;else delete details.allocationLocations[allocation.id];
      if(schedule.previousBaselineId)details.resourcesReviewNeeded={...details.resourcesReviewNeeded,[activityId]:true};
      const all = await tx.scheduleBOQAllocation.findMany({ where: { scheduleId: schedule.id }, orderBy: { id: 'asc' } });
      const totals = await recomputeAllocationMoney(tx, schedule, all);
      await tx.projectSchedule.updateMany({ where: { id: schedule.id, rowVersion: expected + 1 }, data: {...totals,description:JSON.stringify(details)} });
      await enforceExecutedFloor(tx,args.projectId,schedule.id);
      await audit(tx, args.actor, existing ? 'BOQ_WPS_ALLOCATION_UPDATED' : 'BOQ_WPS_ALLOCATION_CREATED', allocation.id, existing ? { allocatedQuantity: existing.allocatedQuantity?.toString() ?? null } : null, { boqItemId, activityId, allocatedQuantity: requested.toString(), rowVersion: expected + 1 });
      return { scheduleId: schedule.id, allocationId: allocation.id, allocatedQuantity: requested.toString(), scheduledAmount: totals.scheduledAmount.toFixed(2), differenceAmount: totals.differenceAmount.toFixed(2), rowVersion: expected + 1 };
    }

    if (action === 'remove-allocation') {
      const allocationId = text(body.allocationId, 'ALLOCATION_ID_REQUIRED');
      const allocation = await tx.scheduleBOQAllocation.findFirst({ where: { id: allocationId, scheduleId: schedule.id } });
      if (!allocation) fail('ALLOCATION_NOT_FOUND', 404);
      await bump(tx, schedule, expected);
      await tx.scheduleBOQAllocation.delete({ where: { id: allocation.id } });
      const details=readWorkPackagePlanDetails(schedule.description);delete details.allocationLocations[allocation.id];
      if(schedule.previousBaselineId)details.resourcesReviewNeeded={...details.resourcesReviewNeeded,[allocation.activityId]:true};
      const all = await tx.scheduleBOQAllocation.findMany({ where: { scheduleId: schedule.id }, orderBy: { id: 'asc' } });
      const totals = await recomputeAllocationMoney(tx, schedule, all, [allocation.activityId]);
      await tx.projectSchedule.updateMany({ where: { id: schedule.id, rowVersion: expected + 1 }, data: {...totals,description:JSON.stringify(details)} });
      await enforceExecutedFloor(tx,args.projectId,schedule.id);
      await audit(tx, args.actor, 'BOQ_WPS_ALLOCATION_REMOVED', allocation.id, { boqItemId: allocation.awardedBoqItemId, activityId: allocation.activityId, allocatedQuantity: allocation.allocatedQuantity?.toString() ?? null, allocatedAmount: allocation.allocatedAmount?.toString() ?? null }, { removed: true, rowVersion: expected + 1 });
      return { scheduleId: schedule.id, allocationId: allocation.id, scheduledAmount: totals.scheduledAmount.toFixed(2), differenceAmount: totals.differenceAmount.toFixed(2), rowVersion: expected + 1 };
    }

    const remove = body.remove === true;
    if (remove) {
      const dependencyId = text(body.dependencyId, 'DEPENDENCY_ID_REQUIRED');
      const dependency = await tx.scheduleDependency.findFirst({ where: { id: dependencyId, scheduleId: schedule.id } });
      if (!dependency) fail('DEPENDENCY_NOT_FOUND', 404);
      await bump(tx, schedule, expected);
      await tx.scheduleDependency.delete({ where: { id: dependencyId } });
      await audit(tx, args.actor, 'BOQ_WPS_DEPENDENCY_REMOVED', dependency.id, dependency, { removed: true, rowVersion: expected + 1 });
      return { scheduleId: schedule.id, dependencyId, rowVersion: expected + 1 };
    }
    const predecessorId = text(body.predecessorId, 'PREDECESSOR_REQUIRED');
    const successorId = text(body.successorId, 'SUCCESSOR_REQUIRED');
    if (predecessorId === successorId) fail('DEPENDENCY_SELF_LINK');
    const [predecessor, successor] = await Promise.all([
      tx.scheduleActivity.findFirst({ where: { id: predecessorId, scheduleId: schedule.id }, select: { id: true } }),
      tx.scheduleActivity.findFirst({ where: { id: successorId, scheduleId: schedule.id }, select: { id: true } }),
    ]);
    if (!predecessor || !successor) fail('DEPENDENCY_ACTIVITY_NOT_FOUND', 404);
    const dependencyType = body.dependencyType === undefined ? 'FS' : body.dependencyType;
    if (typeof dependencyType !== 'string' || !['FS', 'SS', 'FF', 'SF'].includes(dependencyType)) fail('INVALID_DEPENDENCY_TYPE');
    const lagDays = body.lagDays === undefined ? 0 : body.lagDays;
    if (typeof lagDays !== 'number' || !Number.isSafeInteger(lagDays) || lagDays < 0 || lagDays > 36500) fail('INVALID_DEPENDENCY_LAG');
    const remarks = body.remarks === undefined || body.remarks === null ? null : text(body.remarks, 'INVALID_DEPENDENCY_REMARKS', 10000);
    const duplicate = await tx.scheduleDependency.findFirst({ where: { scheduleId: schedule.id, predecessorId, successorId, type: dependencyType } });
    if (duplicate) conflict('DEPENDENCY_ALREADY_EXISTS');
    const links = await tx.scheduleDependency.findMany({ where: { scheduleId: schedule.id }, select: { predecessorId: true, successorId: true } });
    const outgoing = new Map<string, string[]>();
    for (const link of links) outgoing.set(link.predecessorId, [...(outgoing.get(link.predecessorId) ?? []), link.successorId]);
    const pending = [successorId];
    const visited = new Set<string>();
    while (pending.length) {
      const current = pending.pop()!;
      if (current === predecessorId) conflict('DEPENDENCY_CYCLE');
      if (visited.has(current)) continue;
      visited.add(current);
      pending.push(...(outgoing.get(current) ?? []));
    }
    await bump(tx, schedule, expected);
    const dependency = await tx.scheduleDependency.create({ data: { scheduleId: schedule.id, predecessorId, successorId, type: dependencyType, lagDays, remarks } });
    await audit(tx, args.actor, 'BOQ_WPS_DEPENDENCY_CREATED', dependency.id, null, { predecessorId, successorId, dependencyType, lagDays, remarks, rowVersion: expected + 1 });
    return { scheduleId: schedule.id, dependencyId: dependency.id, rowVersion: expected + 1 };
  });
}

export async function getWorkPackagePlanningData(projectId: string) {
  return prisma.$transaction(async (tx) => {
    const boq = await approvedBoq(tx as unknown as Prisma.TransactionClient, projectId);
    const schedules = await tx.projectSchedule.findMany({
      where: { projectId }, orderBy: [{ createdAt: 'desc' }],
      select: { id: true, name: true, workflowStatus: true, generationRulesVersion: true, rowVersion: true, lockedBOQVersionId: true, lockedBOQChecksum: true, awardedContractAmount: true, scheduledAmount: true, differenceAmount: true, createdAt: true, updatedAt: true,
        activities: { orderBy: { createdAt: 'asc' }, include: { boqAllocations: true } },
        wbsNodes: { orderBy: { orderIndex: 'asc' } }, dependencies: true },
    });
    return {
      projectId, boqVersion: { id: boq.version.id, versionNumber: boq.version.versionNumber, checksum: boq.canonical },
      contractAmount: boq.contractAmount.toString(),
      boqItems: boq.items.map((item) => ({ id: item.id, itemCode: item.itemCode, description: item.description, unit: item.unit, quantity: String(item.quantity), amount: String(item.totalCost) })),
      schedules: schedules.map((schedule) => ({ ...schedule, awardedContractAmount: schedule.awardedContractAmount.toString(), scheduledAmount: schedule.scheduledAmount.toString(), differenceAmount: schedule.differenceAmount.toString(), activities: schedule.activities.map((activity) => ({ ...activity, plannedStartDate: activity.plannedStartDate?.toISOString() ?? null, plannedFinishDate: activity.plannedFinishDate?.toISOString() ?? null, allocatedAmount: activity.allocatedAmount.toString(), boqAllocations: activity.boqAllocations.map((allocation) => ({ ...allocation, allocatedQuantity: allocation.allocatedQuantity?.toString() ?? null, allocatedAmount: allocation.allocatedAmount?.toString() ?? null })) })) })),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
