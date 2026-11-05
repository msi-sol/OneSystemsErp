import { randomUUID } from 'node:crypto';
import { Prisma, ProjectScheduleWorkflowStatus } from '@prisma/client';
import { prisma, transactionContext } from '@/lib/prisma';
import { readWorkPackagePlanDetails } from '@/lib/scheduling/work-package-details-types';
import { synchronizeDraftConstraints } from '@/lib/scheduling/work-package-constraint-sync';
import {
  emptyExecutionDocument, type ExecutionConstraint, type ExecutionSiteLog,
  type ExecutionPackageView, type ExecutionWeeklyPlan, type ExecutionWeeklyTarget, type WorkPackageExecutionData, type WorkPackageExecutionDocument,
} from '@/lib/scheduling/work-package-execution-types';
import { canMutateSiteLog, effectiveWorkEntries, isActivePlan, periodsOverlap, validatePeriod, weeklyTargetCheck } from '@/lib/scheduling/work-package-execution-rules';

type Actor = { id: string; role: string; name?: string | null };
type Db = Prisma.TransactionClient;
type Obj = Record<string, unknown>;
const MAX_AUDIT = 5000;

export class WorkPackageExecutionError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'WorkPackageExecutionError'; }
}
const CONSTRAINT_TYPES = new Set(['DRAWING_OR_DOCUMENT', 'ACCESS_OR_WORK_AREA', 'PRECEDING_WORK', 'SUBCONTRACTOR', 'APPROVAL_OR_DECISION', 'OTHER']);
function fail(code: string, status = 400): never { throw new WorkPackageExecutionError(code, status); }
function conflict(code: string): never { return fail(code, 409); }
function obj(value: unknown): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_REQUEST_BODY');
  return value as Obj;
}
function assertOnly(value: Obj, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail('UNKNOWN_REQUEST_FIELD');
}
function text(value: unknown, code: string, max = 191): string {
  if (typeof value !== 'string' || !value.trim()) fail(code);
  const result = value.trim();
  if ([...result].length > max) fail(`${code}_TOO_LONG`);
  return result;
}
function note(value: unknown) {
  if (value === undefined) return '';
  if (typeof value !== 'string') fail('WORK_DESCRIPTION_INVALID');
  const result = value.trim();
  if (result.length > 1000) fail('WORK_DESCRIPTION_TOO_LONG');
  return result;
}
function laborRate(value: unknown) {
  // The source labor schema coerces a supplied blank rate to numeric zero.
  const supplied = value === null || typeof value === 'string' && value.trim() === '' ? 0 : value;
  return decimal(supplied, 'INVALID_LABOR_RATE', false, true);
}
function optionalText(value: unknown, code: string, max = 1000): string | null {
  if (value === null || value === undefined || value === '') return null;
  return text(value, code, max);
}
function decimal(value: unknown, code: string, positive = false, nonnegative = false): string {
  if (typeof value !== 'string' && typeof value !== 'number') fail(code);
  const raw = String(value).trim();
  if (raw.length > 66 || !/^\d+(?:\.\d+)?$/.test(raw)) fail(code);
  const d = new Prisma.Decimal(raw);
  if (!d.isFinite() || d.decimalPlaces() > 30 || positive && !d.gt(0) || nonnegative && d.isNegative()) fail(code);
  return d.toString();
}
function isoDate(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(code);
  const d = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) fail(code);
  return value;
}
function todayManila() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(value => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function readDocument(raw: string | null | undefined): WorkPackageExecutionDocument {
  if (!raw) return emptyExecutionDocument();
  try {
    const value = JSON.parse(raw) as WorkPackageExecutionDocument;
    if (value.version !== 1 || !Array.isArray(value.weeklyPlans) || !Array.isArray(value.siteLogs) || !Array.isArray(value.constraints) || !Array.isArray(value.audit)) fail('EXECUTION_STATE_INVALID', 500);
    return value;
  } catch (error) {
    if (error instanceof WorkPackageExecutionError) throw error;
    fail('EXECUTION_STATE_INVALID', 500);
  }
}
function transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  return transactionContext.run({ sourceProvenance: 'GATE9_WORKFLOW_ENGINE' }, async () => {
    try {
      return await prisma.$transaction(tx => fn(tx as unknown as Db), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15000, timeout: 30000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') conflict('EXECUTION_VERSION_CONFLICT');
      throw error;
    }
  });
}
function requireVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail('INVALID_EXPECTED_ROW_VERSION');
  return value;
}
function parseDetails(raw: string | null) {
  try { return readWorkPackagePlanDetails(raw); } catch { conflict('WORK_PACKAGE_PLAN_DETAILS_INVALID'); }
}

async function activePlan(tx: Db, projectId: string) {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, status: true, boqLocked: true } });
  if (!project) fail('PROJECT_NOT_FOUND', 404);
  if (project.status === 'ARCHIVED') conflict('PROJECT_ARCHIVED');
  const schedule = await tx.projectSchedule.findFirst({
    where: { projectId, workflowStatus: ProjectScheduleWorkflowStatus.ACTIVE_BASELINE },
    orderBy: { activatedAt: 'desc' },
    include: { activities: { orderBy: { id: 'asc' }, include: { boqAllocations: { orderBy: { id: 'asc' }, include: { awardedBoqItem: true } } } }, baselineActivations: { where: { isAuthoritative: true, invalidatedAt: null }, orderBy: { activatedAt: 'desc' }, take: 1 } },
  });
  if (!schedule) conflict('APPROVED_WORK_PACKAGE_BASELINE_REQUIRED');
  if (!project.boqLocked || !schedule.lockedBOQVersionId || !schedule.lockedBOQChecksum || schedule.baselineActivations.length !== 1 || schedule.baselineActivations[0]!.lockedBOQChecksum !== schedule.lockedBOQChecksum) conflict('APPROVED_BOQ_PIN_REQUIRED');
  const version = await tx.projectBOQVersion.findFirst({ where: { id: schedule.lockedBOQVersionId, projectId }, select: { id: true, checksum: true, status: true } });
  if (!version || version.checksum !== schedule.lockedBOQChecksum || !['APPROVED', 'LOCKED'].includes(version.status)) conflict('APPROVED_BOQ_PIN_MISMATCH');
  return { project, schedule, version };
}

async function loadState(tx: Db, projectId: string) {
  const row = await tx.workPackageExecutionState.findUnique({ where: { projectId } });
  return { row, document: readDocument(row?.dataJson), rowVersion: row?.rowVersion ?? 0 };
}

function sourcePackageIdentities(description: string | null, activities: Array<{ id: string }>) {
  parseDetails(description);
  let identities: Record<string, unknown> = {};
  if (description) {
    try {
      const parsed = JSON.parse(description) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const candidate = (parsed as Record<string, unknown>).packageIdentities;
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) identities = candidate as Record<string, unknown>;
      }
    } catch { /* `parseDetails` owns malformed tagged documents. */ }
  }
  return new Map(activities.map(activity => [activity.id, typeof identities[activity.id] === 'string' && identities[activity.id] ? identities[activity.id] as string : activity.id]));
}

function baselineConstraints(description: string | null, sourceByActivity: Map<string, string>, at: string): ExecutionConstraint[] {
  const details = parseDetails(description);
  return details.constraints.map(row => ({
    id: row.id, source: 'BASELINE', activityId: row.activityId, sourcePackageId: row.activityId ? sourceByActivity.get(row.activityId) ?? row.activityId : null,
    type: row.type ?? 'OTHER', title: row.title ?? row.description.slice(0, 191), description: row.description, ownerId: row.ownerId, neededBy: row.neededBy,
    status: row.status, blocking: row.blocking, resolution: row.resolution, createdAt: at, createdById: 'baseline',
    resolvedAt: row.resolvedAt ?? (row.status === 'RESOLVED' ? at : null), resolvedById: row.resolvedById ?? null, history: [],
  }));
}

function currentConstraints(document: WorkPackageExecutionDocument, baseline: ExecutionConstraint[]) {
  const baselineOverrides = new Map(document.constraints.filter(item => item.source === 'BASELINE').map(item => [item.id, item]));
  const operational = document.constraints.filter(item => item.source === 'OPERATIONAL');
  const operationalIds = new Set(operational.map(item => item.id));
  const visibleBaseline = baseline.filter(item => !operationalIds.has(item.id)).map(item => {
    const override = baselineOverrides.get(item.id);
    return override ? { ...item, ownerId: override.ownerId, neededBy: override.neededBy, status: override.status, resolution: override.resolution, resolvedAt: override.resolvedAt, resolvedById: override.resolvedById, history: override.history } : item;
  });
  return [...visibleBaseline, ...operational];
}

function toDay(date: Date | null): string | null { return date ? date.toISOString().slice(0, 10) : null; }

async function readData(tx: Db, projectId: string, horizonDays: number): Promise<WorkPackageExecutionData> {
  const { schedule, version } = await activePlan(tx, projectId);
  const state = await loadState(tx, projectId);
  const sourceByActivity = sourcePackageIdentities(schedule.description, schedule.activities);
  const allocations = schedule.activities.flatMap(activity => activity.boqAllocations.map(allocation => {
    const details = parseDetails(schedule.description);
    const locationId = details.allocationLocations[allocation.id] ?? null;
    return {
      allocationId: allocation.id, activityId: activity.id, sourcePackageId: sourceByActivity.get(activity.id) ?? activity.id,
      boqItemId: allocation.awardedBoqItemId, itemCode: allocation.awardedBoqItem.itemCode, description: allocation.awardedBoqItem.description,
      unit: allocation.awardedBoqItem.unit, locationId, approvedQuantity: String(allocation.awardedBoqItem.quantity),
      allocatedQuantity: allocation.allocatedQuantity?.toString() ?? (allocation.mappedQuantity ? String(allocation.mappedQuantity) : null),
      allocatedAmount: allocation.allocatedAmount?.toString() ?? String(allocation.awardedBoqItem.totalCost),
    };
  }));
  const actual = new Map<string, number>();
  for (const log of state.document.siteLogs) for (const entry of effectiveEntries(log)) {
    const key = `${entry.sourcePackageId}|${entry.boqItemId}|${entry.locationId ?? ''}`;
    actual.set(key, (actual.get(key) ?? 0) + Number(entry.quantity));
  }
  const packageViews = schedule.activities.map(activity => {
    const sourcePackageId = sourceByActivity.get(activity.id) ?? activity.id;
    const rows = allocations.filter(row => row.activityId === activity.id).map(row => {
      const measuredToDate = actual.get(`${row.sourcePackageId}|${row.boqItemId}|${row.locationId ?? ''}`) ?? 0;
      const allocated = row.allocatedQuantity === null ? null : Number(row.allocatedQuantity);
      return { ...row, measuredToDate: String(measuredToDate), remainingQuantity: allocated === null ? null : String(Math.max(0, allocated - measuredToDate)) };
    });
    return { activityId: activity.id, sourcePackageId, code: activity.activityCode ?? activity.id, name: activity.name, startDate: toDay(activity.plannedStartDate), finishDate: toDay(activity.plannedFinishDate), weight: activity.plannedWeight, allocations: rows };
  });
  const baseline = baselineConstraints(schedule.description, sourceByActivity, schedule.activatedAt?.toISOString() ?? schedule.createdAt.toISOString());
  const constraints = currentConstraints(state.document, baseline);
  const plans = state.document.weeklyPlans.map(plan => ({ ...plan, actualByTarget: plan.status === 'CLOSED' && Array.isArray(plan.closeSnapshot)
    ? plan.closeSnapshot as Array<{ targetId: string; actual: string; achievementPercent: number; remaining: string; shortfall: string }>
    : plan.targets.map(target => {
      const actualQty = state.document.siteLogs.filter(log => target.sourcePackageId === log.sourcePackageId && log.logDate >= plan.periodStart && log.logDate <= plan.periodEnd)
        .flatMap(effectiveEntries).filter(entry => entry.boqItemId === target.boqItemId && (entry.locationId ?? '') === target.locationId).reduce((sum, entry) => sum + Number(entry.quantity), 0);
      return { targetId: target.id, actual: String(actualQty), achievementPercent: Number(target.quantity) > 0 ? actualQty / Number(target.quantity) * 100 : 0, remaining: String(Math.max(0, Number(target.quantity) - actualQty)), shortfall: String(Math.max(0, Number(target.quantity) - actualQty)) };
    }) }));
  return {
    success: true, projectId, rowVersion: state.rowVersion,
    baseline: { scheduleId: schedule.id, baselineCode: schedule.baselineCode, revisionCode: schedule.revisionCode, approvedAt: schedule.activatedAt?.toISOString() ?? null, boqVersionId: version.id, boqChecksum: schedule.lockedBOQChecksum },
    packages: packageViews, locations: state.document.locations?.length ? state.document.locations : parseDetails(schedule.description).locations, weeklyPlans: plans, siteLogs: state.document.siteLogs, constraints,
    lookAhead: deriveLookAhead(packageViews, state.document.siteLogs, constraints, horizonDays),
  };
}

const effectiveEntries = effectiveWorkEntries;

function deriveLookAhead(packages: ExecutionPackageView[], logs: ExecutionSiteLog[], constraints: ExecutionConstraint[], horizonDays: number) {
  const today = todayManila();
  const totals = new Map<string, number>();
  for (const log of logs) for (const entry of effectiveEntries(log)) {
    const k = `${entry.sourcePackageId}|${entry.boqItemId}|${entry.locationId ?? ''}`;
    totals.set(k, (totals.get(k) ?? 0) + Number(entry.quantity));
  }
  const withStatus = packages.map(pkg => {
    const complete = pkg.allocations.length > 0 && pkg.allocations.every(a => a.allocatedQuantity !== null && (totals.get(`${a.sourcePackageId}|${a.boqItemId}|${a.locationId ?? ''}`) ?? 0) >= Number(a.allocatedQuantity) - .0001);
    const actual = pkg.allocations.reduce((sum, a) => sum + (totals.get(`${a.sourcePackageId}|${a.boqItemId}|${a.locationId ?? ''}`) ?? 0), 0);
    const horizonEnd = new Date(Date.parse(`${today}T00:00:00Z`) + horizonDays * 86400000).toISOString().slice(0, 10);
    const lane: 'late' | 'underway' | 'upcoming' | null = complete ? null : pkg.finishDate && pkg.finishDate < today ? 'late' : pkg.startDate && pkg.startDate <= today ? 'underway' : pkg.startDate && pkg.startDate <= horizonEnd ? 'upcoming' : null;
    const physicalStatus: 'not-started' | 'in-progress' | 'complete' = actual <= .0001 ? 'not-started' : complete ? 'complete' : 'in-progress';
    return { ...pkg, physicalStatus, lane };
  });
  const openConstraints = constraints.filter(c => c.status === 'OPEN');
  const constraintStanding = openConstraints.flatMap(constraint => {
    if (!constraint.neededBy) return [];
    const pkg = constraint.sourcePackageId ? packages.find(row => row.sourcePackageId === constraint.sourcePackageId) : undefined;
    const neededBy = constraint.neededBy.slice(0, 10);
    const standing: 'overdue' | 'conflicts-with-start' | 'approaching' | null = neededBy < today ? 'overdue' : pkg?.startDate && neededBy > pkg.startDate ? 'conflicts-with-start' : neededBy <= new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10) ? 'approaching' : null;
    return standing ? [{ constraintId: constraint.id, sourcePackageId: constraint.sourcePackageId, standing, neededBy, plannedStartDate: pkg?.startDate ?? null }] : [];
  });
  return { horizonDays, late: withStatus.filter(p => p.lane === 'late'), underway: withStatus.filter(p => p.lane === 'underway'), upcoming: withStatus.filter(p => p.lane === 'upcoming'), attention: { undated: withStatus.filter(p => !p.startDate || !p.finishDate), openConstraints, constraintStanding } };
}

export async function getWorkPackageExecutionData(projectId: string, horizonDays = 21): Promise<WorkPackageExecutionData> {
  if (![14, 21, 28, 42].includes(horizonDays)) fail('INVALID_LOOK_AHEAD_HORIZON');
  return prisma.$transaction(tx => readData(tx as unknown as Db, projectId, horizonDays), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Keep prior measured quantity in the approved scope during revision/scope edits. */
export async function assertWorkPackageExecutedScope(
  tx: Prisma.TransactionClient,
  projectId: string,
  schedule: { id: string; description: string | null; activities: Array<{ id: string; boqAllocations: Array<{ id: string; awardedBoqItemId: string; allocatedQuantity: Prisma.Decimal | null; mappedQuantity: number }> }> },
) {
  const row = await tx.workPackageExecutionState.findUnique({ where: { projectId }, select: { dataJson: true } });
  if (!row) return;
  const doc = readDocument(row.dataJson);
  const sourceByActivity = sourcePackageIdentities(schedule.description, schedule.activities);
  const details = parseDetails(schedule.description);
  const planned = new Map<string, Prisma.Decimal>();
  for (const activity of schedule.activities) for (const allocation of activity.boqAllocations) {
    const sourcePackageId = sourceByActivity.get(activity.id) ?? activity.id;
    const locationId = details.allocationLocations[allocation.id] ?? null;
    const key = `${sourcePackageId}|${allocation.awardedBoqItemId}|${locationId ?? ''}`;
    const quantity = allocation.allocatedQuantity ?? new Prisma.Decimal(allocation.mappedQuantity || 0);
    planned.set(key, (planned.get(key) ?? new Prisma.Decimal(0)).plus(quantity));
  }
  const executed = new Map<string, Prisma.Decimal>();
  for (const log of doc.siteLogs) for (const entry of effectiveEntries(log)) {
    if (entry.locationId === null) continue;
    const key = `${entry.sourcePackageId}|${entry.boqItemId}|${entry.locationId}`;
    executed.set(key, (executed.get(key) ?? new Prisma.Decimal(0)).plus(entry.quantity));
  }
  for (const [key, quantity] of executed) {
    if ((planned.get(key) ?? new Prisma.Decimal(0)).plus('0.0001').lt(quantity)) conflict(`REVISION_SCOPE_BELOW_EXECUTED:${key}`);
  }
}

async function persist(tx: Db, projectId: string, current: Awaited<ReturnType<typeof loadState>>, expected: number, doc: WorkPackageExecutionDocument) {
  if (current.rowVersion !== expected) conflict('EXECUTION_VERSION_CONFLICT');
  const rowVersion = expected + 1;
  if (current.row) {
    const result = await tx.workPackageExecutionState.updateMany({ where: { id: current.row.id, projectId, rowVersion: expected }, data: { rowVersion, dataJson: JSON.stringify(doc) } });
    if (result.count !== 1) conflict('EXECUTION_VERSION_CONFLICT');
  } else {
    if (expected !== 0) conflict('EXECUTION_VERSION_CONFLICT');
    try { await tx.workPackageExecutionState.create({ data: { projectId, rowVersion, dataJson: JSON.stringify(doc) } }); }
    catch { conflict('EXECUTION_VERSION_CONFLICT'); }
  }
  return rowVersion;
}

function addAudit(doc: WorkPackageExecutionDocument, actorId: string, action: string, entityId: string, before: unknown, after: unknown) {
  doc.audit.push({ id: randomUUID(), action, actorId, at: new Date().toISOString(), entityId, before, after });
  if (doc.audit.length > MAX_AUDIT) conflict('EXECUTION_AUDIT_LIMIT_REACHED');
}

function flattenBase(schedule: Awaited<ReturnType<typeof activePlan>>['schedule']) {
  const sourceByActivity = sourcePackageIdentities(schedule.description, schedule.activities);
  const details = parseDetails(schedule.description);
  return schedule.activities.flatMap(activity => activity.boqAllocations.map(allocation => ({
    allocationId: allocation.id, activityId: activity.id, sourcePackageId: sourceByActivity.get(activity.id) ?? activity.id,
    boqItemId: allocation.awardedBoqItemId, locationId: details.allocationLocations[allocation.id] ?? null,
    unit: allocation.awardedBoqItem.unit, allocatedQuantity: allocation.allocatedQuantity?.toString() ?? (allocation.mappedQuantity ? String(allocation.mappedQuantity) : null),
    approvedQuantity: allocation.awardedBoqItem.quantity.toString(),
  })));
}

export async function runWorkPackageExecutionCommand(args: { projectId: string; actor: Actor; body: unknown }) {
  const body = obj(args.body);
  const action = text(body.action, 'ACTION_REQUIRED', 60);
  const expected = requireVersion(body.expectedRowVersion);
  const allowed: Record<string, string[]> = {
    'create-weekly-plan': ['action', 'expectedRowVersion', 'scheduleId', 'periodStart', 'periodEnd'],
    'save-weekly-target': ['action', 'expectedRowVersion', 'scheduleId', 'planId', 'allocationId', 'quantity', 'targetId', 'blockedAcknowledged', 'reason'],
    'remove-weekly-target': ['action', 'expectedRowVersion', 'scheduleId', 'planId', 'targetId'],
    'commit-weekly-plan': ['action', 'expectedRowVersion', 'scheduleId', 'planId'],
    'close-weekly-plan': ['action', 'expectedRowVersion', 'scheduleId', 'planId'],
    'discard-weekly-plan': ['action', 'expectedRowVersion', 'scheduleId', 'planId', 'reason'],
    'create-site-log': ['action', 'expectedRowVersion', 'scheduleId', 'activityId', 'logDate', 'workDescription', 'weather'],
    'update-site-log': ['action', 'expectedRowVersion', 'scheduleId', 'logId', 'workDescription', 'weather'],
    'save-site-log': ['action', 'expectedRowVersion', 'scheduleId', 'logId', 'workDescription', 'weather', 'equipmentHours', 'laborEntries', 'workEntries', 'blockedAcknowledged'],
    'record-work': ['action', 'expectedRowVersion', 'scheduleId', 'logId', 'allocationId', 'quantity', 'blockedAcknowledged'],
    'correct-work': ['action', 'expectedRowVersion', 'scheduleId', 'logId', 'allocationId', 'quantity', 'entryId', 'correctionReason', 'blockedAcknowledged'],
    'remove-work-entry': ['action', 'expectedRowVersion', 'scheduleId', 'logId', 'allocationId', 'entryId', 'correctionReason', 'blockedAcknowledged'],
    'record-labor': ['action', 'expectedRowVersion', 'scheduleId', 'logId', 'trade', 'headcount', 'hoursPerWorker', 'hourlyRate', 'subcontractor'],
    'replace-labor-entries': ['action', 'expectedRowVersion', 'scheduleId', 'logId', 'entries'],
    'set-equipment-hours': ['action', 'expectedRowVersion', 'scheduleId', 'logId', 'hours'],
    'create-constraint': ['action', 'expectedRowVersion', 'scheduleId', 'activityId', 'type', 'title', 'description', 'ownerId', 'neededBy', 'blocking'],
    'assign-constraint': ['action', 'expectedRowVersion', 'scheduleId', 'constraintId', 'ownerId', 'neededBy'],
    'resolve-constraint': ['action', 'expectedRowVersion', 'scheduleId', 'constraintId', 'resolution'],
  };
  if (!allowed[action]) fail('UNKNOWN_EXECUTION_ACTION');
  assertOnly(body, allowed[action]!);
  return transaction(async tx => {
    const { schedule } = await activePlan(tx, args.projectId);
    if (body.scheduleId !== undefined && body.scheduleId !== schedule.id) conflict('ACTIVE_BASELINE_CHANGED');
    const current = await loadState(tx, args.projectId);
    if (current.rowVersion !== expected) conflict('EXECUTION_VERSION_CONFLICT');
    const doc = structuredClone(current.document);
    const now = new Date().toISOString();
    const allocations = flattenBase(schedule);
    const currentById = new Map(allocations.map(row => [row.allocationId, row]));
    const baseline = baselineConstraints(schedule.description, sourcePackageIdentities(schedule.description, schedule.activities), schedule.activatedAt?.toISOString() ?? now);
    if (!doc.constraints.length) doc.constraints = baseline;
    else {
      const known = new Set(doc.constraints.map(c => c.id));
      doc.constraints.push(...baseline.filter(c => !known.has(c.id)));
    }
    let entityId = schedule.id;
    let before: unknown = null, after: unknown = null;
    switch (action) {
      case 'create-weekly-plan': {
        const start = isoDate(body.periodStart, 'INVALID_PERIOD_START');
        const end = isoDate(body.periodEnd, 'INVALID_PERIOD_END');
        if (!validatePeriod(start, end)) fail('INVALID_WEEKLY_PERIOD');
        if (doc.weeklyPlans.some(plan => plan.periodStart === start && plan.status !== 'DISCARDED')) conflict('WEEKLY_PLAN_ALREADY_EXISTS');
        const plan: ExecutionWeeklyPlan = { id: randomUUID(), periodStart: start, periodEnd: end, status: 'DRAFT', baselineScheduleId: schedule.id, targets: [], closedAt: null, closedById: null, closeSnapshot: null, discardedAt: null, discardedById: null, discardReason: null };
        doc.weeklyPlans.push(plan); entityId = plan.id; after = plan; break;
      }
      case 'save-weekly-target': {
        const plan = doc.weeklyPlans.find(p => p.id === body.planId);
        if (!plan) fail('WEEKLY_PLAN_NOT_FOUND', 404);
        if (!['DRAFT', 'COMMITTED'].includes(plan.status)) conflict('WEEKLY_PLAN_NOT_EDITABLE');
        if (plan.baselineScheduleId !== schedule.id) conflict('WEEKLY_PLAN_BASELINE_SUPERSEDED');
        if (plan.periodEnd < todayManila()) conflict('WEEKLY_PERIOD_ALREADY_ENDED');
        const allocationId = text(body.allocationId, 'ALLOCATION_REQUIRED');
        const allocation = currentById.get(allocationId);
        if (!allocation) fail('ALLOCATION_NOT_FOUND', 404);
        const quantity = decimal(body.quantity, 'INVALID_TARGET_QUANTITY', true);
        const oldId = body.targetId === undefined ? null : text(body.targetId, 'TARGET_ID_INVALID');
        const existing = oldId ? plan.targets.find(t => t.id === oldId) : plan.targets.find(t => t.allocationId === allocationId);
        if (oldId && !existing) fail('WEEKLY_TARGET_NOT_FOUND', 404);
        if (existing && existing.allocationId !== allocationId) conflict('WEEKLY_TARGET_ALLOCATION_IMMUTABLE');
        if (plan.targets.some(target => target.allocationId === allocationId && target.id !== existing?.id)) conflict('DUPLICATE_WEEKLY_ALLOCATION');
        if (!existing && plan.targets.length >= 500) conflict('WEEKLY_TARGET_LIMIT_REACHED');
        const priorForAllocation = plan.targets.filter(t => t.allocationId === allocationId && t.id !== existing?.id).reduce((n, t) => n + Number(t.quantity), 0);
        const historical = doc.weeklyPlans.filter(other => other.id !== plan.id && isActivePlan(other) && periodsOverlap(plan, other)).flatMap(other => other.targets).filter(t => t.sourcePackageId === allocation.sourcePackageId && t.boqItemId === allocation.boqItemId && t.locationId === (allocation.locationId ?? '')).reduce((n, t) => n + Number(t.quantity), 0);
        const measured = doc.siteLogs.flatMap(effectiveEntries).filter(e => e.sourcePackageId === allocation.sourcePackageId && e.boqItemId === allocation.boqItemId && (e.locationId ?? '') === (allocation.locationId ?? '')).reduce((n, e) => n + Number(e.quantity), 0);
        const result = weeklyTargetCheck({ quantity: Number(quantity), allocated: allocation.allocatedQuantity === null ? null : Number(allocation.allocatedQuantity), measured, overlappingTargets: historical + priorForAllocation, locationId: allocation.locationId });
        if (!result.ok) conflict(result.reason);
        const hasOpen = doc.constraints.some(c => c.status === 'OPEN' && (!c.sourcePackageId || c.sourcePackageId === allocation.sourcePackageId));
        const ack = body.blockedAcknowledged === true;
        if (hasOpen && !ack) fail('OPEN_CONSTRAINT_ACK_REQUIRED');
        const target: ExecutionWeeklyTarget = { id: existing?.id ?? randomUUID(), activityId: allocation.activityId, sourcePackageId: allocation.sourcePackageId, allocationId, boqItemId: allocation.boqItemId, locationId: allocation.locationId!, unit: allocation.unit, quantity, blockedAcknowledged: ack, reason: optionalText(body.reason, 'TARGET_REASON_INVALID', 1000), createdAt: existing?.createdAt ?? now, createdById: existing?.createdById ?? args.actor.id };
        before = existing; after = target; entityId = target.id;
        if (existing) plan.targets = plan.targets.map(t => t.id === existing.id ? target : t); else plan.targets.push(target);
        break;
      }
      case 'remove-weekly-target': {
        const plan = doc.weeklyPlans.find(p => p.id === body.planId);
        if (!plan) fail('WEEKLY_PLAN_NOT_FOUND', 404);
        if (plan.status !== 'DRAFT') conflict('WEEKLY_PLAN_NOT_EDITABLE');
        const id = text(body.targetId, 'TARGET_ID_REQUIRED');
        const target = plan.targets.find(t => t.id === id); if (!target) fail('WEEKLY_TARGET_NOT_FOUND', 404);
        before = target; entityId = id; plan.targets = plan.targets.filter(t => t.id !== id); after = { removed: true }; break;
      }
      case 'commit-weekly-plan': {
        const plan = doc.weeklyPlans.find(p => p.id === body.planId);
        if (!plan) fail('WEEKLY_PLAN_NOT_FOUND', 404);
        if (plan.status !== 'DRAFT') conflict('WEEKLY_PLAN_NOT_COMMITTABLE');
        if (plan.baselineScheduleId !== schedule.id) conflict('WEEKLY_PLAN_BASELINE_SUPERSEDED');
        if (!plan.targets.length) fail('WEEKLY_PLAN_REQUIRES_TARGET');
        before = plan.status; plan.status = 'COMMITTED'; after = plan.status; entityId = plan.id; break;
      }
      case 'close-weekly-plan': {
        const plan = doc.weeklyPlans.find(p => p.id === body.planId);
        if (!plan) fail('WEEKLY_PLAN_NOT_FOUND', 404);
        if (!['DRAFT', 'COMMITTED'].includes(plan.status)) conflict('ONLY_OPEN_PLAN_CAN_CLOSE');
        const actualByTarget = plan.targets.map(target => {
          const actual = doc.siteLogs.filter(log => log.sourcePackageId === target.sourcePackageId && log.logDate >= plan.periodStart && log.logDate <= plan.periodEnd).flatMap(effectiveEntries).filter(e => e.boqItemId === target.boqItemId && (e.locationId ?? '') === target.locationId).reduce((n, e) => n + Number(e.quantity), 0);
          const targetQuantity = Number(target.quantity);
          const shortfall = Math.max(0, targetQuantity - actual);
          return { targetId: target.id, allocationId: target.allocationId, actual: String(actual), target: targetQuantity, shortfall: String(shortfall), achievementPercent: targetQuantity ? actual / targetQuantity * 100 : 0, remaining: String(shortfall) };
        });
        before = { status: plan.status }; plan.status = 'CLOSED'; plan.closedAt = now; plan.closedById = args.actor.id; plan.closeSnapshot = actualByTarget; after = { status: plan.status, actualByTarget }; entityId = plan.id; break;
      }
      case 'discard-weekly-plan': {
        const plan = doc.weeklyPlans.find(p => p.id === body.planId);
        if (!plan) fail('WEEKLY_PLAN_NOT_FOUND', 404);
        if (plan.status !== 'DRAFT') conflict('ONLY_DRAFT_PLAN_CAN_DISCARD');
        const reason = text(body.reason, 'DISCARD_REASON_REQUIRED', 2000);
        before = { status: plan.status, targets: plan.targets }; plan.status = 'DISCARDED'; plan.discardedAt = now; plan.discardedById = args.actor.id; plan.discardReason = reason; after = { status: plan.status, reason }; entityId = plan.id; break;
      }
      case 'create-site-log': {
        const activityId = text(body.activityId, 'ACTIVITY_REQUIRED');
        const pkg = schedule.activities.find(a => a.id === activityId); if (!pkg) fail('ACTIVITY_NOT_FOUND', 404);
        const logDate = isoDate(body.logDate, 'INVALID_LOG_DATE');
        let log = doc.siteLogs.find(l => l.activityId === activityId && l.logDate === logDate);
        if (log) conflict('SITE_LOG_ALREADY_EXISTS');
        if (doc.siteLogs.length >= 50000) conflict('SITE_LOG_LIMIT_REACHED');
        log = { id: randomUUID(), activityId, baselineScheduleId: schedule.id, sourcePackageId: sourcePackageIdentities(schedule.description, schedule.activities).get(activityId) ?? activityId, logDate, workDescription: note(body.workDescription), weather: optionalText(body.weather, 'WEATHER_INVALID', 120), equipmentHours: null, blockedAcknowledged: false, workEntries: [], laborEntries: [], createdAt: now, createdById: args.actor.id };
        doc.siteLogs.push(log); entityId = log.id; after = log; break;
      }
      case 'update-site-log': {
        const log = doc.siteLogs.find(l => l.id === body.logId); if (!log) fail('SITE_LOG_NOT_FOUND', 404);
        assertLogCurrent(log, schedule.id, schedule.activities.some(a => a.id === log.activityId));
        before = { workDescription: log.workDescription, weather: log.weather };
        if (body.workDescription !== undefined) log.workDescription = note(body.workDescription);
        if (body.weather !== undefined) log.weather = optionalText(body.weather, 'WEATHER_INVALID', 120);
        after = { workDescription: log.workDescription, weather: log.weather }; entityId = log.id; break;
      }
      case 'save-site-log': {
        const log = doc.siteLogs.find(l => l.id === body.logId); if (!log) fail('SITE_LOG_NOT_FOUND', 404);
        assertLogCurrent(log, schedule.id, schedule.activities.some(a => a.id === log.activityId));
        if (!['workDescription', 'weather', 'equipmentHours', 'laborEntries', 'workEntries'].some(key => body[key] !== undefined)) fail('NO_SITE_LOG_STREAMS_SUPPLIED');
        before = { workDescription: log.workDescription, weather: log.weather, equipmentHours: log.equipmentHours, laborEntries: log.laborEntries, workEntries: effectiveEntries(log) };
        if (body.workDescription !== undefined) log.workDescription = note(body.workDescription);
        if (body.weather !== undefined) log.weather = optionalText(body.weather, 'WEATHER_INVALID', 120);
        if (body.equipmentHours !== undefined) log.equipmentHours = body.equipmentHours === null || body.equipmentHours === '' ? null : decimal(body.equipmentHours, 'INVALID_EQUIPMENT_HOURS', false, true);
        if (body.laborEntries !== undefined) {
          if (!Array.isArray(body.laborEntries) || body.laborEntries.length > 300) fail('INVALID_LABOR_ENTRIES');
          log.laborEntries = body.laborEntries.map((item: unknown) => {
            const row = obj(item);
            if (typeof row.headcount !== 'number' || !Number.isSafeInteger(row.headcount) || row.headcount <= 0 || row.headcount > 10000) fail('INVALID_LABOR_HEADCOUNT');
            const trade = text(row.trade, 'LABOR_TRADE_REQUIRED', 100);
            if (trade.length < 2) fail('LABOR_TRADE_TOO_SHORT');
            const hoursPerWorker = decimal(row.hoursPerWorker, 'INVALID_LABOR_HOURS', true);
            const hourlyRate = laborRate(row.hourlyRate);
            if (Number(hoursPerWorker) > 24 || Number(hourlyRate) > 1_000_000) fail('INVALID_LABOR_ENTRY');
            return { id: randomUUID(), trade, headcount: row.headcount, hoursPerWorker, hourlyRate, subcontractor: optionalText(row.subcontractor, 'INVALID_SUBCONTRACTOR', 160), recordedAt: now, recordedById: args.actor.id };
          });
        }
        if (body.workEntries !== undefined) {
          if (!Array.isArray(body.workEntries) || body.workEntries.length > 1000) fail('INVALID_WORK_ENTRIES');
          const submitted = body.workEntries.map((item: unknown) => {
            const row = obj(item);
            const allocationId = text(row.allocationId, 'ALLOCATION_REQUIRED');
            const allocation = currentById.get(allocationId);
            if (!allocation || allocation.activityId !== log.activityId) fail('ALLOCATION_NOT_FOUND', 404);
            if (!allocation.locationId) conflict('UNLOCATED_SCOPE_CANNOT_BE_MEASURED');
            const quantity = decimal(row.quantity, 'INVALID_MEASURED_QUANTITY', true);
            if (Number(quantity) > 1_000_000_000) fail('INVALID_MEASURED_QUANTITY');
            return { allocation, quantity };
          });
          if (new Set(submitted.map(item => item.allocation.allocationId)).size !== submitted.length) fail('DUPLICATE_DAILY_ALLOCATION');
          const openConstraints = doc.constraints.filter(c => c.status === 'OPEN' && (!c.sourcePackageId || c.sourcePackageId === log.sourcePackageId));
          if (submitted.length && openConstraints.length && body.blockedAcknowledged !== true) fail('OPEN_CONSTRAINT_ACK_REQUIRED');
          const previous = effectiveEntries(log);
          const previousByAllocation = new Map(previous.map(entry => [entry.allocationId, entry]));
          const projectedByAllocation = new Map<string, number>();
          const projectedByBoq = new Map<string, number>();
          for (const entry of doc.siteLogs.flatMap(effectiveEntries)) {
            projectedByAllocation.set(`${entry.sourcePackageId}|${entry.boqItemId}|${entry.locationId ?? ''}`, (projectedByAllocation.get(`${entry.sourcePackageId}|${entry.boqItemId}|${entry.locationId ?? ''}`) ?? 0) + Number(entry.quantity));
            projectedByBoq.set(entry.boqItemId, (projectedByBoq.get(entry.boqItemId) ?? 0) + Number(entry.quantity));
          }
          for (const entry of previous) {
            const allocationKey = `${entry.sourcePackageId}|${entry.boqItemId}|${entry.locationId ?? ''}`;
            projectedByAllocation.set(allocationKey, (projectedByAllocation.get(allocationKey) ?? 0) - Number(entry.quantity));
            projectedByBoq.set(entry.boqItemId, (projectedByBoq.get(entry.boqItemId) ?? 0) - Number(entry.quantity));
          }
          const replacements: ExecutionSiteLog['workEntries'] = [];
          for (const row of submitted) {
            const allocation = row.allocation;
            const key = `${allocation.sourcePackageId}|${allocation.boqItemId}|${allocation.locationId}`;
            const nextAllocation = (projectedByAllocation.get(key) ?? 0) + Number(row.quantity);
            if (allocation.allocatedQuantity !== null && nextAllocation > Number(allocation.allocatedQuantity) + .0001) conflict('MEASURED_QUANTITY_EXCEEDS_ALLOCATION');
            const nextBoq = (projectedByBoq.get(allocation.boqItemId) ?? 0) + Number(row.quantity);
            if (nextBoq > Number(allocation.approvedQuantity) + .0001) conflict('MEASURED_QUANTITY_EXCEEDS_APPROVED_BOQ');
            projectedByAllocation.set(key, nextAllocation); projectedByBoq.set(allocation.boqItemId, nextBoq);
            const old = previousByAllocation.get(allocation.allocationId);
            if (old && Number(old.quantity) === Number(row.quantity)) { replacements.push(old); continue; }
            replacements.push({ id: randomUUID(), allocationId: allocation.allocationId, sourcePackageId: allocation.sourcePackageId, boqItemId: allocation.boqItemId, locationId: allocation.locationId, quantity: row.quantity, unit: allocation.unit, recordedAt: now, recordedById: args.actor.id, correctionOfId: old ? old.correctionOfId ?? old.id : null, correctionReason: old ? 'Corrected through saved daily record.' : null });
          }
          for (const old of previous) if (!submitted.some(item => item.allocation.allocationId === old.allocationId)) {
            replacements.push({ id: randomUUID(), allocationId: old.allocationId, sourcePackageId: old.sourcePackageId, boqItemId: old.boqItemId, locationId: old.locationId, quantity: '0', unit: old.unit, recordedAt: now, recordedById: args.actor.id, correctionOfId: old.correctionOfId ?? old.id, correctionReason: 'Removed through saved daily record.' });
          }
          const additions = replacements.filter(entry => !previousByAllocation.has(entry.allocationId) || entry.id !== previousByAllocation.get(entry.allocationId)!.id);
          if (log.workEntries.length + additions.length > 1000) conflict('SITE_LOG_WORK_ENTRY_LIMIT_REACHED');
          log.workEntries.push(...additions);
          log.blockedAcknowledged = openConstraints.length > 0 && submitted.length > 0;
        }
        after = { workDescription: log.workDescription, weather: log.weather, equipmentHours: log.equipmentHours, laborEntries: log.laborEntries, workEntries: effectiveEntries(log) }; entityId = log.id; break;
      }
      case 'record-work':
      case 'correct-work':
      case 'remove-work-entry': {
        const log = doc.siteLogs.find(l => l.id === body.logId); if (!log) fail('SITE_LOG_NOT_FOUND', 404);
        assertLogCurrent(log, schedule.id, schedule.activities.some(a => a.id === log.activityId));
        const allocationId = text(body.allocationId, 'ALLOCATION_REQUIRED'); const allocation = currentById.get(allocationId);
        if (!allocation || allocation.activityId !== log.activityId) fail('ALLOCATION_NOT_FOUND', 404);
        if (!allocation.locationId) conflict('UNLOCATED_SCOPE_CANNOT_BE_MEASURED');
        const correctionId = action !== 'record-work' ? text(body.entryId, 'CORRECTION_ENTRY_REQUIRED') : null;
        const selectedEntry = correctionId ? log.workEntries.find(e => e.id === correctionId) : null;
        if (correctionId && !selectedEntry) fail('WORK_ENTRY_NOT_FOUND', 404);
        const rootId = selectedEntry ? (selectedEntry.correctionOfId ?? selectedEntry.id) : null;
        const rootEntry = rootId ? effectiveEntries(log).find(e => (e.correctionOfId ?? e.id) === rootId) : null;
        if (correctionId && !rootEntry) fail('WORK_ENTRY_NOT_FOUND', 404);
        if (rootEntry && rootEntry.allocationId !== allocationId) conflict('WORK_CORRECTION_CANNOT_MOVE_ALLOCATION_IDENTITY');
        const reason = correctionId ? text(body.correctionReason, 'CORRECTION_REASON_REQUIRED', 2000) : null;
        const qty = action === 'remove-work-entry' ? '0' : decimal(body.quantity, 'INVALID_MEASURED_QUANTITY', action === 'record-work', true);
        if (Number(qty) > 1_000_000_000) fail('INVALID_MEASURED_QUANTITY');
        if (action === 'record-work' && effectiveEntries(log).some(e => e.allocationId === allocationId)) conflict('WORK_ENTRY_ALREADY_EXISTS_USE_CORRECTION');
        const currentEffective = doc.siteLogs.flatMap(effectiveEntries);
        const sameAllocation = currentEffective.filter(e => e.sourcePackageId === allocation.sourcePackageId && e.boqItemId === allocation.boqItemId && e.locationId === allocation.locationId);
        const priorForAllocation = sameAllocation.reduce((sum, e) => sum + Number(e.quantity), 0) - (rootEntry ? Number(rootEntry.quantity) : 0);
        if (allocation.allocatedQuantity !== null && priorForAllocation + Number(qty) > Number(allocation.allocatedQuantity) + .0001) conflict('MEASURED_QUANTITY_EXCEEDS_ALLOCATION');
        const allBoqActual = currentEffective.filter(e => e.boqItemId === allocation.boqItemId).reduce((sum, e) => sum + Number(e.quantity), 0) - (rootEntry ? Number(rootEntry.quantity) : 0);
        if (allBoqActual + Number(qty) > Number(allocation.approvedQuantity) + .0001) conflict('MEASURED_QUANTITY_EXCEEDS_APPROVED_BOQ');
        const openBlocking = doc.constraints.some(c => c.status === 'OPEN' && (!c.sourcePackageId || c.sourcePackageId === log.sourcePackageId));
        if (openBlocking && body.blockedAcknowledged !== true) fail('OPEN_CONSTRAINT_ACK_REQUIRED');
        const entry = { id: randomUUID(), allocationId, sourcePackageId: allocation.sourcePackageId, boqItemId: allocation.boqItemId, locationId: allocation.locationId, quantity: qty, unit: allocation.unit, recordedAt: now, recordedById: args.actor.id, correctionOfId: rootEntry ? (rootEntry.correctionOfId ?? rootEntry.id) : null, correctionReason: reason };
        if (log.workEntries.length >= 1000) conflict('SITE_LOG_WORK_ENTRY_LIMIT_REACHED');
        before = rootEntry; after = entry; entityId = entry.id; log.workEntries.push(entry); log.blockedAcknowledged = openBlocking;
        break;
      }
      case 'record-labor': {
        const log = doc.siteLogs.find(l => l.id === body.logId); if (!log) fail('SITE_LOG_NOT_FOUND', 404);
        assertLogCurrent(log, schedule.id, schedule.activities.some(a => a.id === log.activityId));
        if (typeof body.headcount !== 'number' || !Number.isSafeInteger(body.headcount) || body.headcount <= 0 || body.headcount > 10000) fail('INVALID_LABOR_HEADCOUNT');
        const trade = text(body.trade, 'LABOR_TRADE_REQUIRED', 100);
        if (trade.length < 2) fail('LABOR_TRADE_TOO_SHORT');
        const hoursPerWorker = decimal(body.hoursPerWorker, 'INVALID_LABOR_HOURS', true);
        const hourlyRate = laborRate(body.hourlyRate);
        if (Number(hoursPerWorker) > 24 || Number(hourlyRate) > 1_000_000) fail('INVALID_LABOR_ENTRY');
        const entry = { id: randomUUID(), trade, headcount: body.headcount, hoursPerWorker, hourlyRate, subcontractor: optionalText(body.subcontractor, 'INVALID_SUBCONTRACTOR', 160), recordedAt: now, recordedById: args.actor.id };
        if (log.laborEntries.length >= 300) conflict('SITE_LOG_LABOR_ENTRY_LIMIT_REACHED');
        before = null; after = entry; entityId = entry.id; log.laborEntries.push(entry); break;
      }
      case 'set-equipment-hours': {
        const log = doc.siteLogs.find(l => l.id === body.logId); if (!log) fail('SITE_LOG_NOT_FOUND', 404);
        assertLogCurrent(log, schedule.id, schedule.activities.some(a => a.id === log.activityId));
        before = log.equipmentHours;
        log.equipmentHours = body.hours === null || body.hours === '' ? null : decimal(body.hours, 'INVALID_EQUIPMENT_HOURS', false, true);
        after = log.equipmentHours; entityId = log.id; break;
      }
      case 'replace-labor-entries': {
        const log = doc.siteLogs.find(l => l.id === body.logId); if (!log) fail('SITE_LOG_NOT_FOUND', 404);
        assertLogCurrent(log, schedule.id, schedule.activities.some(a => a.id === log.activityId));
        if (!Array.isArray(body.entries) || body.entries.length > 300) fail('INVALID_LABOR_ENTRIES');
        const entries = body.entries.map((item: unknown) => {
          const row = obj(item);
          if (typeof row.headcount !== 'number' || !Number.isSafeInteger(row.headcount) || row.headcount <= 0 || row.headcount > 10000) fail('INVALID_LABOR_HEADCOUNT');
          const trade = text(row.trade, 'LABOR_TRADE_REQUIRED', 100);
          if (trade.length < 2) fail('LABOR_TRADE_TOO_SHORT');
          const hoursPerWorker = decimal(row.hoursPerWorker, 'INVALID_LABOR_HOURS', true);
          const hourlyRate = laborRate(row.hourlyRate);
          if (Number(hoursPerWorker) > 24 || Number(hourlyRate) > 1_000_000) fail('INVALID_LABOR_ENTRY');
          return { id: randomUUID(), trade, headcount: row.headcount, hoursPerWorker, hourlyRate, subcontractor: optionalText(row.subcontractor, 'INVALID_SUBCONTRACTOR', 160), recordedAt: now, recordedById: args.actor.id };
        });
        before = log.laborEntries; log.laborEntries = entries; after = entries; entityId = log.id; break;
      }
      case 'create-constraint': {
        const activityId = body.activityId === undefined || body.activityId === null ? null : text(body.activityId, 'ACTIVITY_INVALID');
        const activity = activityId ? schedule.activities.find(a => a.id === activityId) : null;
        if (activityId && !activity) fail('ACTIVITY_NOT_FOUND', 404);
        const type = text(body.type ?? 'OTHER', 'CONSTRAINT_TYPE_INVALID', 64);
        if (!CONSTRAINT_TYPES.has(type)) fail('CONSTRAINT_TYPE_INVALID');
        const ownerId = optionalText(body.ownerId, 'CONSTRAINT_OWNER_INVALID', 191);
        await ensureProjectOwner(tx, args.projectId, ownerId);
        const constraint: ExecutionConstraint = { id: randomUUID(), source: 'OPERATIONAL', activityId, sourcePackageId: activityId ? sourcePackageIdentities(schedule.description, schedule.activities).get(activityId) ?? activityId : null, type, title: text(body.title, 'CONSTRAINT_TITLE_REQUIRED', 191), description: text(body.description, 'CONSTRAINT_DESCRIPTION_REQUIRED', 4000), ownerId, neededBy: body.neededBy == null || body.neededBy === '' ? null : isoDate(body.neededBy, 'CONSTRAINT_NEEDED_BY_INVALID'), status: 'OPEN', blocking: body.blocking === true, resolution: null, createdAt: now, createdById: args.actor.id, resolvedAt: null, resolvedById: null, history: [] };
        if (doc.constraints.length >= 1000) conflict('CONSTRAINT_LIMIT_REACHED');
        doc.constraints.push(constraint); before = null; after = constraint; entityId = constraint.id; break;
      }
      case 'assign-constraint': {
        const constraint = doc.constraints.find(c => c.id === body.constraintId); if (!constraint) fail('CONSTRAINT_NOT_FOUND', 404);
        if (constraint.status !== 'OPEN') conflict('RESOLVED_CONSTRAINT_IMMUTABLE');
        before = { ownerId: constraint.ownerId, neededBy: constraint.neededBy };
        if (body.ownerId !== undefined) {
          constraint.ownerId = optionalText(body.ownerId, 'CONSTRAINT_OWNER_INVALID', 191);
          await ensureProjectOwner(tx, args.projectId, constraint.ownerId);
        }
        if (body.neededBy !== undefined) constraint.neededBy = body.neededBy == null || body.neededBy === '' ? null : isoDate(body.neededBy, 'CONSTRAINT_NEEDED_BY_INVALID');
        constraint.history.push({ action, actorId: args.actor.id, at: now, before, after: { ownerId: constraint.ownerId, neededBy: constraint.neededBy } });
        after = { ownerId: constraint.ownerId, neededBy: constraint.neededBy }; entityId = constraint.id; break;
      }
      case 'resolve-constraint': {
        const constraint = doc.constraints.find(c => c.id === body.constraintId); if (!constraint) fail('CONSTRAINT_NOT_FOUND', 404);
        if (constraint.status !== 'OPEN') conflict('RESOLVED_CONSTRAINT_IMMUTABLE');
        const resolution = text(body.resolution, 'CONSTRAINT_RESOLUTION_REQUIRED', 2000);
        before = { status: constraint.status, resolution: constraint.resolution };
        constraint.status = 'RESOLVED'; constraint.resolution = resolution; constraint.resolvedAt = now; constraint.resolvedById = args.actor.id;
        constraint.history.push({ action, actorId: args.actor.id, at: now, before, after: { status: constraint.status, resolution } });
        after = { status: constraint.status, resolution }; entityId = constraint.id; break;
      }
      default: fail('UNKNOWN_EXECUTION_ACTION');
    }
    if (['create-constraint', 'assign-constraint', 'resolve-constraint'].includes(action)) {
      try { await synchronizeDraftConstraints(tx, args.projectId, doc.constraints, schedule.id); }
      catch (error) {
        if (error instanceof Error && error.message === 'SCHEDULE_VERSION_CONFLICT') conflict('SCHEDULE_VERSION_CONFLICT');
        throw error;
      }
    }
    addAudit(doc, args.actor.id, action, entityId, before, after);
    const rowVersion = await persist(tx, args.projectId, current, expected, doc);
    return { success: true, rowVersion, action, entityId };
  });
}

function assertLogCurrent(log: ExecutionSiteLog, activeScheduleId: string, activityStillActive: boolean) {
  if (!canMutateSiteLog(log.baselineScheduleId, activeScheduleId, activityStillActive)) conflict('SUPERSEDED_BASELINE_SITE_LOG_IMMUTABLE');
}

async function ensureProjectOwner(tx: Db, projectId: string, ownerId: string | null) {
  if (!ownerId) return;
  const assignment = await tx.projectUserAssignment.findUnique({ where: { userId_projectId: { userId: ownerId, projectId } }, select: { assignmentStatus: true } });
  if (assignment?.assignmentStatus !== 'active') fail('CONSTRAINT_OWNER_NOT_ACTIVE_PROJECT_MEMBER');
}
