import { randomUUID } from 'node:crypto';
import { Prisma, ProjectScheduleWorkflowStatus } from '@prisma/client';
import { prisma, transactionContext } from '@/lib/prisma';
import { readWorkPackagePlanDetails, type PlanLocation } from '@/lib/scheduling/work-package-details-types';
import { emptyExecutionDocument, type WorkPackageExecutionDocument } from '@/lib/scheduling/work-package-execution-types';

type Actor = { id: string; role: string; name?: string | null };
type Tx = Prisma.TransactionClient;
const EDITABLE:ProjectScheduleWorkflowStatus[] = [ProjectScheduleWorkflowStatus.AI_GENERATED_DRAFT, ProjectScheduleWorkflowStatus.INVALID_GENERATED_DRAFT, ProjectScheduleWorkflowStatus.TECHNICAL_REVISIONS_REQUIRED];

export class WorkPackageLocationError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'WorkPackageLocationError'; }
}
function fail(code: string, status = 400): never { throw new WorkPackageLocationError(code, status); }
function conflict(code: string): never { fail(code, 409); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_REQUEST_BODY');
  return value as Record<string, unknown>;
}
function text(value: unknown, code: string, max = 191): string {
  if (typeof value !== 'string' || !value.trim()) fail(code);
  const result = value.trim();
  if ([...result].length > max) fail(`${code}_TOO_LONG`);
  return result;
}
function rowVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail('INVALID_EXPECTED_ROW_VERSION');
  return value;
}
function decode(raw: string | null | undefined): WorkPackageExecutionDocument {
  if (!raw) return emptyExecutionDocument();
  try {
    const doc = JSON.parse(raw) as WorkPackageExecutionDocument;
    if (doc.version !== 1 || !Array.isArray(doc.weeklyPlans) || !Array.isArray(doc.siteLogs) || !Array.isArray(doc.constraints) || !Array.isArray(doc.audit)) fail('EXECUTION_STATE_INVALID', 500);
    if (doc.locations !== undefined && !Array.isArray(doc.locations)) fail('EXECUTION_STATE_INVALID', 500);
    if (doc.locations) validateLocations(doc.locations);
    return doc;
  } catch (error) {
    if (error instanceof WorkPackageLocationError) throw error;
    fail('EXECUTION_STATE_INVALID', 500);
  }
}
function validateLocations(locations: PlanLocation[]) {
  const ids = new Set<string>();
  for (const location of locations) {
    if (!location || typeof location.id !== 'string' || !location.id.trim() || location.id.length > 191 || typeof location.name !== 'string' || !location.name.trim() || location.name.length > 191 || location.parentId !== null && (typeof location.parentId !== 'string' || location.parentId.length > 191) || location.code !== undefined && (typeof location.code !== 'string' || location.code.length > 64) || location.isActive !== undefined && typeof location.isActive !== 'boolean' || ids.has(location.id)) fail('EXECUTION_STATE_INVALID', 500);
    ids.add(location.id);
  }
  for (const location of locations) {
    if (location.parentId && !ids.has(location.parentId)) fail('EXECUTION_STATE_INVALID', 500);
    if (location.parentId === location.id || location.parentId && isDescendant(locations, location.parentId, location.id)) fail('EXECUTION_STATE_INVALID', 500);
  }
  for (const location of locations) {
    if (locations.some(other => other.id !== location.id && other.parentId === location.parentId && other.name.trim().toLocaleLowerCase() === location.name.trim().toLocaleLowerCase())) fail('EXECUTION_STATE_INVALID', 500);
    if (location.code && locations.some(other => other.id !== location.id && other.code?.trim().toLocaleLowerCase() === location.code!.trim().toLocaleLowerCase())) fail('EXECUTION_STATE_INVALID', 500);
  }
}
function scheduleLocations(description: string | null): PlanLocation[] {
  return readWorkPackagePlanDetails(description).locations;
}
function uniqueName(locations: PlanLocation[], name: string, parentId: string | null, exceptId?: string) {
  if (locations.some(item => item.id !== exceptId && item.parentId === parentId && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) conflict('DUPLICATE_LOCATION_NAME');
}
function uniqueCode(locations: PlanLocation[], code: string | undefined, exceptId?: string) {
  if (code && locations.some(item => item.id !== exceptId && item.code?.trim().toLocaleLowerCase() === code.toLocaleLowerCase())) conflict('DUPLICATE_LOCATION_CODE');
}
function isDescendant(locations: PlanLocation[], candidate: string, ancestor: string): boolean {
  let row = locations.find(item => item.id === candidate);
  const seen = new Set<string>();
  while (row?.parentId && !seen.has(row.id)) {
    if (row.parentId === ancestor) return true;
    seen.add(row.id);
    row = locations.find(item => item.id === row!.parentId);
  }
  return false;
}
async function transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return transactionContext.run({ sourceProvenance: 'GATE9_WORKFLOW_ENGINE' }, async () => {
    try { return await prisma.$transaction(tx => work(tx as unknown as Tx), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15000, timeout: 30000 }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') conflict('EXECUTION_VERSION_CONFLICT');
      throw error;
    }
  });
}

async function readParts(tx: Tx, projectId: string) {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, status: true } });
  if (!project) fail('PROJECT_NOT_FOUND', 404);
  const [state, schedules] = await Promise.all([
    tx.workPackageExecutionState.findUnique({ where: { projectId } }),
    tx.projectSchedule.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' }, select: { id: true, description: true, rowVersion: true, workflowStatus: true, generationRulesVersion: true } }),
  ]);
  const doc = decode(state?.dataJson);
  const activeBaseline = schedules.find(schedule => schedule.workflowStatus === ProjectScheduleWorkflowStatus.ACTIVE_BASELINE && schedule.generationRulesVersion === 'BOQ_WPS_WORKSPACE_V1');
  let locations = doc.locations;
  if (!locations?.length && activeBaseline) locations = scheduleLocations(activeBaseline.description);
  if (!locations?.length) locations = schedules.filter(schedule => schedule.generationRulesVersion === 'BOQ_WPS_WORKSPACE_V1').flatMap(schedule => scheduleLocations(schedule.description));
  const merged = new Map<string, PlanLocation>();
  for (const location of locations ?? []) merged.set(location.id, location);
  return { project, state, doc, schedules, locations: [...merged.values()] };
}

/** Read project locations, falling back to a frozen baseline when the live state is not initialized yet. */
export async function getWorkPackageProjectLocations(projectId: string) {
  return prisma.$transaction(async tx => {
    const result = await readParts(tx as unknown as Tx, projectId);
    return { success: true as const, projectId, rowVersion: result.state?.rowVersion ?? 0, locations: result.locations };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function syncEditableDrafts(tx: Tx, locations: PlanLocation[], schedules: Awaited<ReturnType<typeof readParts>>['schedules']) {
  for (const schedule of schedules) {
    if (schedule.generationRulesVersion !== 'BOQ_WPS_WORKSPACE_V1' || !EDITABLE.includes(schedule.workflowStatus)) continue;
    const details = readWorkPackagePlanDetails(schedule.description);
    if (JSON.stringify(details.locations) === JSON.stringify(locations)) continue;
    details.locations = locations;
    const result = await tx.projectSchedule.updateMany({ where: { id: schedule.id, rowVersion: schedule.rowVersion, workflowStatus: schedule.workflowStatus }, data: { description: JSON.stringify(details), rowVersion: { increment: 1 } } });
    if (result.count !== 1) conflict('SCHEDULE_VERSION_CONFLICT');
  }
}

async function saveState(tx: Tx, projectId: string, actorId: string, row: { id: string; rowVersion: number; dataJson: string } | null, expected: number, doc: WorkPackageExecutionDocument, before: PlanLocation[]) {
  if ((row?.rowVersion ?? 0) !== expected) conflict('EXECUTION_VERSION_CONFLICT');
  doc.locations = doc.locations ?? [];
  doc.audit.push({ id: randomUUID(), action: 'PROJECT_LOCATIONS_CHANGED', actorId, at: new Date().toISOString(), entityId: 'project', before, after: doc.locations });
  if (doc.audit.length > 5000) conflict('EXECUTION_AUDIT_LIMIT_REACHED');
  const next = expected + 1;
  if (row) {
    const updated = await tx.workPackageExecutionState.updateMany({ where: { id: row.id, projectId, rowVersion: expected }, data: { dataJson: JSON.stringify(doc), rowVersion: next } });
    if (updated.count !== 1) conflict('EXECUTION_VERSION_CONFLICT');
  } else {
    try { await tx.workPackageExecutionState.create({ data: { projectId, dataJson: JSON.stringify(doc), rowVersion: next } }); }
    catch { conflict('EXECUTION_VERSION_CONFLICT'); }
  }
  return next;
}

/** Project-truth locations remain editable after approval; frozen baselines are never rewritten. */
export async function mutateWorkPackageProjectLocation(args: { projectId: string; actor: Actor; body: unknown }) {
  const body = object(args.body);
  const action = text(body.action, 'ACTION_REQUIRED', 30);
  const expected = rowVersion(body.expectedRowVersion);
  if (!['create', 'update', 'archive'].includes(action)) fail('UNKNOWN_LOCATION_ACTION');
  const allowed = action === 'create' ? ['action', 'expectedRowVersion', 'name', 'code', 'parentId'] : action === 'update' ? ['action', 'expectedRowVersion', 'id', 'name', 'code', 'parentId'] : ['action', 'expectedRowVersion', 'id'];
  if (Object.keys(body).some(key => !allowed.includes(key))) fail('UNKNOWN_REQUEST_FIELD');

  return transaction(async tx => {
    const parts = await readParts(tx, args.projectId);
    if (parts.project.status === 'ARCHIVED') conflict('PROJECT_ARCHIVED');
    const expectedLocations = expected === 0 ? parts.locations : parts.doc.locations ?? parts.locations;
    if (expected !== (parts.state?.rowVersion ?? 0)) conflict('EXECUTION_VERSION_CONFLICT');
    const locations = [...expectedLocations];
    let changedId: string;
    if (action === 'create') {
      const name = text(body.name, 'LOCATION_NAME_REQUIRED');
      const code = body.code === undefined || body.code === null || body.code === '' ? undefined : text(body.code, 'LOCATION_CODE_INVALID', 64);
      const parentId = body.parentId === undefined || body.parentId === null || body.parentId === '' ? null : text(body.parentId, 'LOCATION_PARENT_INVALID');
      if (parentId && !locations.some(item => item.id === parentId && item.isActive !== false)) conflict('INVALID_LOCATION_PARENT');
      uniqueName(locations, name, parentId);
      uniqueCode(locations, code);
      changedId = randomUUID();
      locations.push({ id: changedId, name, parentId, ...(code ? { code } : {}), isActive: true });
    } else {
      changedId = text(body.id, 'LOCATION_ID_REQUIRED');
      const index = locations.findIndex(item => item.id === changedId);
      if (index < 0) fail('LOCATION_NOT_FOUND', 404);
      const current = locations[index]!;
      if (current.isActive === false) conflict('LOCATION_ARCHIVED');
      if (action === 'update') {
        const name = text(body.name, 'LOCATION_NAME_REQUIRED');
        const code = body.code === undefined ? current.code : body.code === null || body.code === '' ? undefined : text(body.code, 'LOCATION_CODE_INVALID', 64);
        const parentId = body.parentId === undefined || body.parentId === null || body.parentId === '' ? null : text(body.parentId, 'LOCATION_PARENT_INVALID');
        if (parentId && !locations.some(item => item.id === parentId && item.isActive !== false)) conflict('INVALID_LOCATION_PARENT');
        if (parentId === changedId || parentId && isDescendant(locations, parentId, changedId)) conflict('LOCATION_HIERARCHY_CYCLE');
        uniqueName(locations, name, parentId, changedId);
        uniqueCode(locations, code, changedId);
        locations[index] = { ...current, name, parentId, ...(code ? { code } : { code: undefined }) };
      } else {
        if (locations.some(item => item.parentId === changedId && item.isActive !== false)) conflict('LOCATION_HAS_CHILDREN');
        // Archiving stops new selection; it never removes the location identity
        // or rewrites allocations, frozen baselines, targets or site evidence.
        locations[index] = { ...current, isActive: false };
      }
    }
    const doc = structuredClone(parts.doc);
    doc.locations = locations;
    const nextVersion = await saveState(tx, args.projectId, args.actor.id, parts.state ? { id: parts.state.id, rowVersion: parts.state.rowVersion, dataJson: parts.state.dataJson } : null, expected, doc, expectedLocations);
    await syncEditableDrafts(tx, locations, parts.schedules);
    return { success: true as const, projectId: args.projectId, rowVersion: nextVersion, locationId: changedId, locations };
  });
}

/** Helper for planner creation before the first execution-data GET. */
export async function projectLocationsForPlanning(projectId: string): Promise<PlanLocation[]> {
  const result = await getWorkPackageProjectLocations(projectId);
  return result.locations;
}

/** Pure reader for callers already inside a serializable Prisma transaction. */
export function readProjectLocationsFromExecutionState(dataJson: string | null | undefined): PlanLocation[] {
  return decode(dataJson).locations ?? [];
}
