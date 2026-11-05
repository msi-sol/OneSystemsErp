import type { ExecutionSiteLog, ExecutionWeeklyPlan, ExecutionWorkEntry } from './work-package-execution-types';

export const EXECUTION_QUANTITY_TOLERANCE = 0.0001;
const DAY_MS = 86_400_000;

export function canMutateSiteLog(logBaselineScheduleId: string, activeScheduleId: string, activityStillActive: boolean) {
  return logBaselineScheduleId === activeScheduleId && activityStillActive;
}

export function effectiveWorkEntries(log: ExecutionSiteLog): ExecutionWorkEntry[] {
  const latest = new Map<string, ExecutionWorkEntry>();
  for (const entry of log.workEntries) {
    const key = entry.correctionOfId ?? entry.id;
    const previous = latest.get(key);
    if (!previous || Date.parse(entry.recordedAt) >= Date.parse(previous.recordedAt)) latest.set(key, entry);
  }
  return [...latest.values()];
}

export function periodsOverlap(a: { periodStart: string; periodEnd: string }, b: { periodStart: string; periodEnd: string }) {
  return Date.parse(`${a.periodStart}T00:00:00Z`) <= Date.parse(`${b.periodEnd}T00:00:00Z`) &&
    Date.parse(`${b.periodStart}T00:00:00Z`) <= Date.parse(`${a.periodEnd}T00:00:00Z`);
}

export function validatePeriod(start: string, end: string) {
  const a = Date.parse(`${start}T00:00:00Z`), b = Date.parse(`${end}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || !Number.isFinite(a) || !Number.isFinite(b) || new Date(a).toISOString().slice(0, 10) !== start || new Date(b).toISOString().slice(0, 10) !== end || b < a || b - a > 30 * DAY_MS) return false;
  return true;
}

export function remainingAllocation(allocated: number | null, measured: number, overlappingTargets: number) {
  return allocated === null ? null : Math.max(0, allocated - measured - overlappingTargets);
}

export function weeklyTargetCheck(input: {
  quantity: number; allocated: number | null; measured: number; overlappingTargets: number; locationId: string | null;
}) {
  if (!input.locationId) return { ok: false as const, reason: 'UNLOCATED_SCOPE', remaining: remainingAllocation(input.allocated, input.measured, input.overlappingTargets) };
  if (input.allocated === null) return { ok: false as const, reason: 'NO_STATED_QUANTITY', remaining: null };
  const remaining = remainingAllocation(input.allocated, input.measured, input.overlappingTargets)!;
  if (!(input.quantity > 0)) return { ok: false as const, reason: 'QUANTITY_MUST_BE_POSITIVE', remaining };
  if (input.quantity > remaining + EXECUTION_QUANTITY_TOLERANCE) return { ok: false as const, reason: 'QUANTITY_EXCEEDS_REMAINING', remaining };
  return { ok: true as const, remaining };
}

export function measuredTotals(logs: ExecutionSiteLog[]) {
  const totals = new Map<string, number>();
  for (const log of logs) for (const entry of effectiveWorkEntries(log)) {
    const key = entry.allocationId;
    totals.set(key, (totals.get(key) ?? 0) + Number(entry.quantity));
  }
  return totals;
}

export function isActivePlan(plan: ExecutionWeeklyPlan) { return plan.status === 'DRAFT' || plan.status === 'COMMITTED'; }

export function revisionExecutedFloor(input: {
  siteLogs: ExecutionSiteLog[];
  nextAllocations: Array<{ sourcePackageId: string; boqItemId: string; locationId: string | null; allocatedQuantity: number | null }>;
  oldAllocationIdentity: Record<string, { sourcePackageId: string; boqItemId: string; locationId: string | null }>;
}) {
  const executed = new Map<string, number>();
  for (const log of input.siteLogs) for (const entry of effectiveWorkEntries(log)) {
    const identity = input.oldAllocationIdentity[entry.allocationId];
    if (!identity || !identity.locationId) continue;
    const key = `${identity.sourcePackageId}|${identity.boqItemId}|${identity.locationId}`;
    executed.set(key, (executed.get(key) ?? 0) + Number(entry.quantity));
  }
  return [...executed].flatMap(([key, quantity]) => {
    const allocation = input.nextAllocations.find((item) => `${item.sourcePackageId}|${item.boqItemId}|${item.locationId ?? ''}` === key);
    const planned = allocation?.allocatedQuantity ?? 0;
    return planned + EXECUTION_QUANTITY_TOLERANCE < quantity ? [{ key, executed: quantity, planned }] : [];
  });
}
