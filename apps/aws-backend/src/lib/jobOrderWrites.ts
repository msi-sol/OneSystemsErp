import { JobOrderStatus, JobOrderType, MaterialResponsibility, PaymentTerms, Prisma } from '@prisma/client';
import { prisma } from './prisma';

export const JOB_ORDER_THRESHOLD = 250000;

// Scope markers the form stores beside BOQ IDs. They are not BOQ items.
const SCOPE_MARKERS = new Set(['1_LOT', 'ADDITIONAL_WORKS']);

// The only body fields that reach Prisma. Requests also carry form-only fields
// (durationDays) and the sessionId and simulatedRole that requireAuth adds, and
// workflow fields such as status must only change through the status routes.
const TEXT_FIELDS = ['description', 'location', 'requiredOutput', 'safetyRequirements', 'acceptanceCriteria', 'remarks'] as const;
const REQUIRED_TEXT_FIELDS = new Set<string>(['description', 'location']);
const REFERENCE_FIELDS = ['subcontractorId', 'packageId', 'consolidatedBoqItemId'] as const;
const DATE_FIELDS = ['startDate', 'completionDate'] as const;
const ENUM_FIELDS: Array<{ field: 'paymentBasis' | 'materialResponsibility' | 'jobOrderType'; values: Record<string, string>; required: boolean }> = [
  { field: 'paymentBasis', values: PaymentTerms, required: true },
  { field: 'materialResponsibility', values: MaterialResponsibility, required: true },
  { field: 'jobOrderType', values: JobOrderType, required: false },
];

// The actions the role matrix can grant. RolePermission has no canEdit or canDelete
// column, so checks on those pass for system administrators only.
export const JOB_ORDER_EDIT_ACTION = 'canEditDraft';
export const JOB_ORDER_DELETE_ACTION = 'canDeleteDraft';
export const JOB_ORDER_UNLOCK_ACTION = 'canUnlockWithAuthorization';
const STATUS_ACTIONS: Record<JobOrderStatus, string> = {
  DRAFT: 'canReturnForCorrection',
  FOR_REVIEW: 'canSubmit',
  FOR_FINANCIAL_REVIEW: 'canReview',
  FOR_TECHNICAL_REVIEW: 'canReview',
  APPROVED: 'canApprove',
  ISSUED: 'canApprove',
  CANCELLED: 'canCancel',
};

// Job orders in these statuses hold commitments and can only be changed by unlocking.
const LOCKED_STATUSES = new Set<JobOrderStatus>(['APPROVED', 'ISSUED']);

type JobOrderBody = Record<string, unknown>;

export class JobOrderRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function parseBoqReferenceIds(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item: unknown) => typeof item === 'string')) return parsed;
  } catch { /* Older records may contain one plain BOQ ID. */ }
  return [value];
}

const boqItemIds = (references: string[]) => references.filter((id) => !SCOPE_MARKERS.has(id));

/** Adds the fields the job order pages read but the table does not store. */
export function withJobOrderReadFields<T extends { boqReferenceId: string | null; contractAmount: number }>(jobOrder: T) {
  return {
    ...jobOrder,
    boqReferenceIds: parseBoqReferenceIds(jobOrder.boqReferenceId),
    isThresholdExceeded: jobOrder.contractAmount > JOB_ORDER_THRESHOLD,
  };
}

function readBoqReferences(body: JobOrderBody): string[] | undefined {
  const references = body.boqReferenceIds;
  if (references === undefined) return undefined;
  if (!Array.isArray(references) || !references.every((id: unknown) => typeof id === 'string')) {
    throw new JobOrderRequestError('BOQ references must be a list of IDs.', 400);
  }
  return Array.from(new Set(references));
}

// Only fields present in the body are returned, so an update leaves the rest alone.
function readJobOrderFields(body: JobOrderBody) {
  const data: Record<string, unknown> = {};

  for (const field of TEXT_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (value !== null && typeof value !== 'string') throw new JobOrderRequestError(`${field} must be text.`, 400);
    if (REQUIRED_TEXT_FIELDS.has(field) && !value?.trim()) throw new JobOrderRequestError(`${field} is required.`, 400);
    data[field] = value;
  }
  for (const field of REFERENCE_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (value !== null && typeof value !== 'string') throw new JobOrderRequestError(`${field} must be an ID.`, 400);
    data[field] = value || null;
  }
  for (const field of DATE_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    const date = value ? new Date(value as string) : null;
    if (date && Number.isNaN(date.getTime())) throw new JobOrderRequestError(`${field} is not a valid date.`, 400);
    data[field] = date;
  }
  for (const { field, values, required } of ENUM_FIELDS) {
    if (body[field] === undefined) continue;
    const value = (body[field] || null) as string | null;
    if (value === null ? required : !Object.values(values).includes(value)) throw new JobOrderRequestError(`${field} is not a valid option.`, 400);
    data[field] = value;
  }
  if (body.contractAmount !== undefined) {
    const amount = typeof body.contractAmount === 'string' && body.contractAmount.trim() === '' ? NaN : Number(body.contractAmount);
    if (body.contractAmount === null || !Number.isFinite(amount) || amount < 0) throw new JobOrderRequestError('contractAmount must be a number of zero or more.', 400);
    data.contractAmount = amount;
  }
  return data;
}

async function linkedBoqItemIds(ids: string[], from: 'awardedBoqItemId' | 'consolidatedBoqItemId') {
  const to = from === 'awardedBoqItemId' ? 'consolidatedBoqItemId' : 'awardedBoqItemId';
  const mappings = await prisma.bOQMapping.findMany({ where: { [from]: { in: ids } }, select: { [to]: true } });
  return (mappings as Array<Record<string, string | null>>).map((mapping) => mapping[to]).filter((id): id is string => Boolean(id));
}

// Job orders reference ConsolidatedBOQItem IDs and packages AwardedBOQItem IDs,
// so each conflict check compares both IDs and whatever BOQMapping links them to.
async function assertNotInSubcontractPackage(consolidatedIds: string[]) {
  if (consolidatedIds.length === 0) return;
  const awardedIds = await linkedBoqItemIds(consolidatedIds, 'consolidatedBoqItemId');
  const existing = await prisma.subcontractorBOQItem.findFirst({
    where: { awardedBoqItemId: { in: [...consolidatedIds, ...awardedIds] } },
  });
  if (existing) throw new JobOrderRequestError('Conflict Error: One or more selected BOQ items are already assigned to an active Subcontract Package.', 409);
}

export async function assertBoqItemsNotInJobOrder(projectId: string | undefined, awardedIds: string[]) {
  if (awardedIds.length === 0) return;
  const claimed = new Set([...awardedIds, ...await linkedBoqItemIds(awardedIds, 'awardedBoqItemId')]);
  const jobOrders = await prisma.jobOrder.findMany({
    where: { projectId, boqReferenceId: { not: null }, status: { not: 'CANCELLED' } },
    select: { jobNumber: true, boqReferenceId: true },
  });
  const conflicting = jobOrders.find((jobOrder) => boqItemIds(parseBoqReferenceIds(jobOrder.boqReferenceId)).some((id) => claimed.has(id)));
  if (conflicting) throw new JobOrderRequestError(`Conflict Error: BOQ item is already assigned to active Job Order (${conflicting.jobNumber}).`, 409);
}

async function assertNotDuplicateScope(projectId: string, subcontractorId: string | null, references: string[], excludeId?: string) {
  const incoming = boqItemIds(references).sort();
  if (incoming.length === 0) return;
  const jobOrders = await prisma.jobOrder.findMany({
    where: { projectId, subcontractorId, status: { not: 'CANCELLED' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { boqReferenceId: true },
  });
  const isDuplicate = jobOrders.some((jobOrder) => {
    const existing = boqItemIds(parseBoqReferenceIds(jobOrder.boqReferenceId)).sort();
    return existing.length === incoming.length && existing.every((id, index) => id === incoming[index]);
  });
  if (isDuplicate) throw new JobOrderRequestError('Duplicate Error: A Job Order for this Subcontractor with the exact same BOQ scope already exists.', 409);
}

const PROCESSED_WORK = { subcontractAccomplishments: true, subcontractBillings: { include: { payments: true } } } as const;

function hasProcessedWork(jobOrder: Prisma.JobOrderGetPayload<{ include: typeof PROCESSED_WORK }>) {
  return jobOrder.subcontractAccomplishments.some((a) => a.status === 'APPROVED') ||
    jobOrder.subcontractBillings.some((b) => b.status === 'APPROVED_FOR_PAYMENT' || b.status === 'PAID' || b.paymentStatus === 'PAID' || b.payments.length > 0);
}

export async function createJobOrderFromRequest(body: JobOrderBody) {
  const data = readJobOrderFields(body);
  const references = readBoqReferences(body) ?? [];

  const projectId = body.projectId;
  if (typeof projectId !== 'string' || !projectId) throw new JobOrderRequestError('projectId is required.', 400);
  for (const field of ['description', 'location', 'contractAmount', 'paymentBasis', 'materialResponsibility']) {
    if (data[field] === undefined) throw new JobOrderRequestError(`${field} is required.`, 400);
  }
  if (body.jobNumber !== undefined && typeof body.jobNumber !== 'string') throw new JobOrderRequestError('jobNumber must be text.', 400);
  const jobNumber = (body.jobNumber as string | undefined) || `JO-${Date.now()}`;

  if (await prisma.jobOrder.findUnique({ where: { jobNumber } })) {
    throw new JobOrderRequestError(`A Job Order with number "${jobNumber}" already exists.`, 409);
  }
  await assertNotInSubcontractPackage(boqItemIds(references));
  await assertNotDuplicateScope(projectId, (data.subcontractorId as string | null | undefined) ?? null, references);

  const created = await prisma.jobOrder.create({
    data: { ...data, jobNumber, projectId, boqReferenceId: JSON.stringify(references) } as Prisma.JobOrderUncheckedCreateInput,
  });
  return withJobOrderReadFields(created);
}

export async function updateJobOrderFromRequest(id: string, body: JobOrderBody) {
  const data = readJobOrderFields(body);
  const references = readBoqReferences(body);

  const newProjectId = body.projectId;
  if (newProjectId !== undefined && (typeof newProjectId !== 'string' || !newProjectId)) throw new JobOrderRequestError('projectId must be an ID.', 400);

  const existing = await prisma.jobOrder.findUnique({ where: { id }, include: PROCESSED_WORK });
  if (!existing) throw new JobOrderRequestError('Job Order not found.', 404);

  if (hasProcessedWork(existing)) throw new JobOrderRequestError('Job Order is locked and cannot be edited because accomplishments or payments have been processed.', 409);
  if (LOCKED_STATUSES.has(existing.status)) throw new JobOrderRequestError('Job Order is approved and locked. Unlock it before editing.', 409);

  const projectId = newProjectId ?? existing.projectId;
  const subcontractorId = data.subcontractorId === undefined ? existing.subcontractorId : data.subcontractorId as string | null;
  const scopeReferences = references ?? parseBoqReferenceIds(existing.boqReferenceId);

  // Items the job order already holds are not rechecked, so editing the location
  // of an older record does not fail on a conflict that predates the edit.
  if (references) {
    const held = new Set(parseBoqReferenceIds(existing.boqReferenceId));
    await assertNotInSubcontractPackage(boqItemIds(references).filter((ref) => !held.has(ref)));
  }
  await assertNotDuplicateScope(projectId, subcontractorId, scopeReferences, id);

  const updated = await prisma.jobOrder.update({
    where: { id },
    data: {
      ...data,
      ...(newProjectId ? { projectId } : {}),
      ...(references ? { boqReferenceId: JSON.stringify(references) } : {}),
    } as Prisma.JobOrderUncheckedUpdateInput,
  });
  return withJobOrderReadFields(updated);
}

export function jobOrderStatusAction(newStatus: unknown): { status: JobOrderStatus; action: string } {
  if (typeof newStatus !== 'string' || !Object.hasOwn(STATUS_ACTIONS, newStatus)) throw new JobOrderRequestError('newStatus is not a valid Job Order status.', 400);
  return { status: newStatus as JobOrderStatus, action: STATUS_ACTIONS[newStatus as JobOrderStatus] };
}

// Moves only from the status that was read, so two approvals at once commit once.
async function moveJobOrderStatus(tx: Prisma.TransactionClient, id: string, from: JobOrderStatus, to: JobOrderStatus) {
  const { count } = await tx.jobOrder.updateMany({ where: { id, status: from }, data: { status: to } });
  if (count === 0) throw new JobOrderRequestError('Job Order status changed while saving. Reload and try again.', 409);
}

// Splits the amount by master BOQ value, as the form does, because per-item costs
// are not stored. Work with no BOQ items stays a project-level commitment.
async function commitmentShares(tx: Prisma.TransactionClient, jobOrder: { projectId: string; boqReferenceId: string | null; consolidatedBoqItemId: string | null; contractAmount: number }) {
  const references = boqItemIds(parseBoqReferenceIds(jobOrder.boqReferenceId));
  const ids = references.length > 0 || !jobOrder.consolidatedBoqItemId ? references : [jobOrder.consolidatedBoqItemId];
  const items = await tx.consolidatedBOQItem.findMany({
    where: { id: { in: ids }, projectId: jobOrder.projectId },
    select: { id: true, quantity: true, unitCost: true },
  });
  if (items.length === 0) return [{ consolidatedBoqItemId: null, amount: jobOrder.contractAmount }];

  const masterCost = (item: (typeof items)[number]) => (item.quantity || 0) * (item.unitCost || 0);
  const totalMaster = items.reduce((sum, item) => sum + masterCost(item), 0);
  const roundedTotal = Math.round(jobOrder.contractAmount * 100);
  let allocated = 0;
  return items.map((item, index) => {
    const share = totalMaster > 0 ? masterCost(item) / totalMaster : 1 / items.length;
    // Working in centavos lets the last item take the rounding remainder.
    const cents = index === items.length - 1 ? roundedTotal - allocated : Math.round(roundedTotal * share);
    allocated += cents;
    return { consolidatedBoqItemId: item.id, amount: cents / 100 };
  });
}

async function recordCommitments(tx: Prisma.TransactionClient, jobOrder: Parameters<typeof commitmentShares>[1] & { id: string; subcontractor: { name: string } | null }) {
  for (const { consolidatedBoqItemId, amount } of await commitmentShares(tx, jobOrder)) {
    await tx.commitmentLedger.create({
      data: {
        projectId: jobOrder.projectId,
        jobOrderId: jobOrder.id,
        consolidatedBoqItemId,
        commitmentType: 'SUBCONTRACT',
        subcontractorName: jobOrder.subcontractor?.name || '',
        approvedAmount: amount,
        remainingCommitment: amount,
        status: 'ACTIVE',
      },
    });
    if (consolidatedBoqItemId) {
      await tx.consolidatedBOQItem.update({ where: { id: consolidatedBoqItemId }, data: { committedCost: { increment: amount } } });
    }
  }
}

async function releaseCommitments(tx: Prisma.TransactionClient, jobOrderId: string) {
  const active = await tx.commitmentLedger.findMany({ where: { jobOrderId, status: 'ACTIVE' } });
  for (const { id, consolidatedBoqItemId, approvedAmount } of active) {
    await tx.commitmentLedger.update({ where: { id }, data: { status: 'RELEASED', remainingCommitment: 0 } });
    if (consolidatedBoqItemId) {
      await tx.consolidatedBOQItem.update({ where: { id: consolidatedBoqItemId }, data: { committedCost: { decrement: approvedAmount } } });
    }
  }
}

export async function changeJobOrderStatus(id: string, status: JobOrderStatus) {
  const updated = await prisma.$transaction(async (tx) => {
    const jobOrder = await tx.jobOrder.findUnique({ where: { id }, include: { subcontractor: true } });
    if (!jobOrder) throw new JobOrderRequestError('Job Order not found.', 404);
    if (jobOrder.status === 'CANCELLED') throw new JobOrderRequestError('A cancelled Job Order cannot change status.', 409);
    if (status === 'ISSUED' && jobOrder.status !== 'APPROVED') throw new JobOrderRequestError('Only an approved Job Order can be issued.', 409);
    if (status !== 'ISSUED' && LOCKED_STATUSES.has(jobOrder.status)) throw new JobOrderRequestError('Job Order is approved and locked. Unlock it before changing its status.', 409);

    await moveJobOrderStatus(tx, id, jobOrder.status, status);
    if (status === 'APPROVED') await recordCommitments(tx, jobOrder);
    return tx.jobOrder.findUniqueOrThrow({ where: { id } });
  });
  return withJobOrderReadFields(updated);
}

export async function unlockJobOrderFromRequest(id: string) {
  const updated = await prisma.$transaction(async (tx) => {
    const jobOrder = await tx.jobOrder.findUnique({ where: { id }, include: PROCESSED_WORK });
    if (!jobOrder) throw new JobOrderRequestError('Job Order not found.', 404);
    if (!LOCKED_STATUSES.has(jobOrder.status)) throw new JobOrderRequestError('Only an approved Job Order can be unlocked.', 409);
    if (hasProcessedWork(jobOrder)) throw new JobOrderRequestError('Job Order cannot be unlocked because accomplishments or payments have been processed.', 409);

    await moveJobOrderStatus(tx, id, jobOrder.status, 'FOR_FINANCIAL_REVIEW');
    await releaseCommitments(tx, id);
    return tx.jobOrder.findUniqueOrThrow({ where: { id } });
  });
  return withJobOrderReadFields(updated);
}

export async function deleteJobOrderFromRequest(id: string) {
  const jobOrder = await prisma.jobOrder.findUnique({ where: { id }, include: PROCESSED_WORK });
  if (!jobOrder) throw new JobOrderRequestError('Job Order not found.', 404);
  // Deleting cascades to accomplishments, billings and payment records.
  if (hasProcessedWork(jobOrder)) throw new JobOrderRequestError('Job Order cannot be deleted because accomplishments or payments have been processed.', 409);
  if (LOCKED_STATUSES.has(jobOrder.status)) throw new JobOrderRequestError('Job Order is approved and locked. Unlock it before deleting.', 409);
  await prisma.jobOrder.delete({ where: { id } });
}

export function jobOrderErrorStatus(error: unknown): number {
  if (error instanceof JobOrderRequestError) return error.status;
  const { message, code } = (error ?? {}) as { message?: unknown; code?: unknown };
  if (typeof message === 'string' && message.startsWith('Unauthorized')) return 403;
  if (code === 'P2002') return 409;
  if (code === 'P2003') return 400;
  return 500;
}
