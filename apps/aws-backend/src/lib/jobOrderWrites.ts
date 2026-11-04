import { JobOrderType, MaterialResponsibility, PaymentTerms, Prisma } from '@prisma/client';
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

  const existing = await prisma.jobOrder.findUnique({
    where: { id },
    include: { subcontractAccomplishments: true, subcontractBillings: true },
  });
  if (!existing) throw new JobOrderRequestError('Job Order not found.', 404);

  const isLocked = existing.subcontractAccomplishments.some((a) => a.status === 'APPROVED') ||
    existing.subcontractBillings.some((b) => b.status === 'APPROVED_FOR_PAYMENT' || b.paymentStatus === 'PAID');
  if (isLocked) throw new JobOrderRequestError('Job Order is locked and cannot be edited because accomplishments or payments have been processed.', 409);

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

export function jobOrderErrorStatus(error: unknown): number {
  if (error instanceof JobOrderRequestError) return error.status;
  const { message, code } = (error ?? {}) as { message?: unknown; code?: unknown };
  if (typeof message === 'string' && message.startsWith('Unauthorized')) return 403;
  if (code === 'P2002') return 409;
  if (code === 'P2003') return 400;
  return 500;
}
