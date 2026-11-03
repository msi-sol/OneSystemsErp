import Decimal from 'decimal.js';

const ExactDecimal = Decimal.clone({ precision: 50 });

export type NumericInput = number | string | { toString(): string } | null | undefined;
export type DateInput = Date | string | null | undefined;

export interface WorkPackageSummaryInput {
  readonly id: string;
  readonly activityCode?: string | null;
  readonly name: string;
  readonly plannedStartDate?: DateInput;
  readonly plannedFinishDate?: DateInput;
  readonly allocatedAmount?: NumericInput;
  readonly actualProgressPercent?: NumericInput;
  readonly wbs?: { readonly name?: string | null } | null;
  readonly boqAllocations?: readonly WorkPackageAllocationInput[] | null;
}

export interface WorkPackageAllocationInput {
  readonly id: string;
  readonly awardedBoqItemId: string;
  readonly allocatedQuantity?: NumericInput;
  readonly mappedQuantity?: NumericInput;
  readonly allocatedAmount?: NumericInput;
  readonly awardedBoqItem?: {
    readonly id?: string;
    readonly itemCode?: string | null;
    readonly description?: string | null;
    readonly unit?: string | null;
    readonly quantity?: NumericInput;
    readonly totalCost?: NumericInput;
  } | null;
}

export interface WorkPackageScheduleInput {
  readonly awardedContractAmount?: NumericInput;
  readonly workflowStatus?: string | null;
  readonly activities?: readonly WorkPackageSummaryInput[] | null;
}

export interface WorkPackageScopeLine {
  id: string;
  boqItemId: string;
  itemCode: string;
  description: string;
  unit: string | null;
  approvedQuantity: string | null;
  allocatedQuantity: string | null;
  amount: string | null;
  legacyQuantity: boolean;
}

export interface WorkPackageSummary {
  id: string;
  code: string;
  name: string;
  groupName: string | null;
  startDate: string | null;
  finishDate: string | null;
  amount: string | null;
  weightPercent: string | null;
  recordedProgressPercent: number | null;
  scope: WorkPackageScopeLine[];
}

export interface BOQCoverageLine {
  id: string;
  itemCode: string;
  description: string;
  unit: string | null;
  approvedQuantity: string | null;
  allocatedQuantity: string | null;
  remainingQuantity: string | null;
  status: 'planned' | 'unplanned' | 'overallocated' | 'unknown';
}

export interface WorkPackageSummaryResult {
  contractAmount: string | null;
  allocatedAmount: string | null;
  packages: WorkPackageSummary[];
  coverage: BOQCoverageLine[];
  datedCount: number;
  missingScopeCount: number;
  isImmutable: boolean;
}

interface BOQItemInput {
  readonly id: string;
  readonly itemCode?: string | null;
  readonly description?: string | null;
  readonly unit?: string | null;
  readonly quantity?: NumericInput;
  readonly totalCost?: NumericInput;
}

function decimal(value: NumericInput): Decimal | null {
  if (value === null || value === undefined) return null;
  try {
    const parsed = new ExactDecimal(typeof value === 'number' ? String(value) : value.toString());
    return parsed.isFinite() && parsed.gte(0) ? parsed : null;
  } catch {
    return null;
  }
}

function currency(value: Decimal | null): string | null {
  return value ? value.toFixed(2) : null;
}

function quantity(value: Decimal | null): string | null {
  return value ? value.toString() : null;
}

function fullDate(value: DateInput): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
    if (!match) return null;
    const [, year, month, day] = match;
    const calendarDate = new Date(0);
    calendarDate.setUTCHours(0, 0, 0, 0);
    calendarDate.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
    if (calendarDate.getUTCFullYear() !== Number(year)
      || calendarDate.getUTCMonth() + 1 !== Number(month)
      || calendarDate.getUTCDate() !== Number(day)) return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const isoDate = parsed.toISOString().slice(0, 10);
  return typeof value === 'string' ? value.slice(0, 10) : isoDate;
}

function numberProgress(value: NumericInput): number | null {
  if (value === null || value === undefined) return null;
  try {
    const text = typeof value === 'number' ? String(value) : value.toString().trim();
    if (text === '') return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
  } catch {
    return null;
  }
}

function itemText(value: string | null | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

/** Builds a JSON-safe, read-only BOQ scope and work-package projection. */
export function buildWorkPackageSummary(
  schedule: WorkPackageScheduleInput,
  boqItems: readonly BOQItemInput[],
): WorkPackageSummaryResult {
  const contract = decimal(schedule.awardedContractAmount);
  const boqById = new Map(boqItems.map(item => [item.id, item]));
  const allocationsByBoq = new Map<string, { quantity: Decimal; unknown: boolean }>();
  let missingScopeCount = 0;
  let totalAmount = new ExactDecimal(0);
  let totalAmountUnknown = false;

  const packages = (schedule.activities ?? []).map(activity => {
    const allocations = activity.boqAllocations ?? [];
    const scope: WorkPackageScopeLine[] = allocations.map(allocation => {
      const boq = allocation.awardedBoqItem ?? boqById.get(allocation.awardedBoqItemId);
      const approvedQty = decimal(boq?.quantity);
      const allocatedQty = decimal(allocation.allocatedQuantity);
      const allocatedWasAbsent = allocation.allocatedQuantity === null || allocation.allocatedQuantity === undefined;
      const legacyQty = allocatedWasAbsent && allocation.mappedQuantity !== null && allocation.mappedQuantity !== undefined;
      const displayQty = allocatedQty ?? (legacyQty ? decimal(allocation.mappedQuantity) : null);
      const prior = allocationsByBoq.get(allocation.awardedBoqItemId) ?? { quantity: new ExactDecimal(0), unknown: false };
      if (allocatedQty === null) prior.unknown = true;
      else prior.quantity = prior.quantity.plus(allocatedQty);
      allocationsByBoq.set(allocation.awardedBoqItemId, prior);

      return {
        id: allocation.id,
        boqItemId: allocation.awardedBoqItemId,
        itemCode: itemText(boq?.itemCode, 'Uncoded'),
        description: itemText(boq?.description, 'Description unavailable'),
        unit: boq?.unit ?? null,
        approvedQuantity: quantity(approvedQty),
        allocatedQuantity: quantity(displayQty),
        amount: currency(decimal(allocation.allocatedAmount)),
        legacyQuantity: legacyQty,
      };
    });
    if (scope.length === 0) missingScopeCount += 1;

    let amount: Decimal | null;
    if (allocations.length === 0) amount = decimal(activity.allocatedAmount);
    else if (allocations.some(allocation => decimal(allocation.allocatedAmount) === null)) amount = null;
    else amount = allocations.reduce((sum, allocation) => sum!.plus(decimal(allocation.allocatedAmount)!), new ExactDecimal(0));
    if (amount === null) totalAmountUnknown = true;
    else totalAmount = totalAmount.plus(amount);

    let startDate = fullDate(activity.plannedStartDate);
    let finishDate = fullDate(activity.plannedFinishDate);
    if (startDate !== null && finishDate !== null && finishDate < startDate) {
      startDate = null;
      finishDate = null;
    }
    const progress = numberProgress(activity.actualProgressPercent);
    return {
      id: activity.id,
      code: activity.activityCode?.trim() || 'Uncoded',
      name: activity.name,
      groupName: activity.wbs?.name ?? null,
      startDate,
      finishDate,
      amount: currency(amount),
      weightPercent: amount !== null && contract !== null && !contract.isZero()
        ? amount.div(contract).times(100).toFixed(2)
        : null,
      recordedProgressPercent: progress,
      scope,
    };
  });

  const coverage: BOQCoverageLine[] = boqItems.map(item => {
    const approvedQty = decimal(item.quantity);
    const tally = allocationsByBoq.get(item.id);
    const allocatedQty = tally?.quantity ?? new ExactDecimal(0);
    const unknown = tally?.unknown ?? false;
    let status: BOQCoverageLine['status'];
    if (approvedQty === null || unknown) status = 'unknown';
    else if (!tally) status = 'unplanned';
    else if (allocatedQty.gt(approvedQty)) status = 'overallocated';
    else if (allocatedQty.eq(approvedQty)) status = 'planned';
    else status = 'unplanned';

    return {
      id: item.id,
      itemCode: itemText(item.itemCode, 'Uncoded'),
      description: itemText(item.description, 'Description unavailable'),
      unit: item.unit ?? null,
      approvedQuantity: quantity(approvedQty),
      allocatedQuantity: unknown ? null : quantity(allocatedQty),
      remainingQuantity: unknown || approvedQty === null ? null : quantity(approvedQty.minus(allocatedQty)),
      status,
    };
  });

  return {
    contractAmount: currency(contract),
    allocatedAmount: totalAmountUnknown ? null : currency(totalAmount),
    packages,
    coverage,
    datedCount: packages.filter(item => item.startDate !== null && item.finishDate !== null).length,
    missingScopeCount,
    isImmutable: ['ACTIVE_BASELINE', 'SUPERSEDED_BASELINE', 'ARCHIVED_BASELINE'].includes(schedule.workflowStatus ?? ''),
  };
}
