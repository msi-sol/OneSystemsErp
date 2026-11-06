import Decimal from 'decimal.js';
import type { WorkspaceItem, WorkspaceMapping } from '@/lib/boq/workspace-types';
import type { PlanResource } from './work-package-details-types';

export const RESOURCE_KINDS = ['MATERIAL', 'LABOR', 'EQUIPMENT', 'ALLOWANCE'] as const;
export type BreakdownKind = typeof RESOURCE_KINDS[number];
export type PackageBreakdownUpload = {
  id: string; activityId: string; fileName: string; fileHash: string; storagePath: string;
  sheetName: string; mapping: WorkspaceMapping; rows: WorkspaceItem[];
  uploadedAt: string; uploadedById: string; originScheduleId: string;
  appliedAt: string | null; appliedById: string | null; resourceIds: string[];
  categories: Record<string, BreakdownKind>; reason: string | null;
  replacedResources?: PlanResource[];
};

export class PackageBreakdownError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** Imported quantities are already package-level quantities; never scale by BOQ quantity. */
export function buildBreakdownResources(rows: WorkspaceItem[], categories: unknown) {
  if (!rows.length || rows.length > 500) throw new PackageBreakdownError('A package breakdown must contain 1–500 component rows.');
  if (!categories || typeof categories !== 'object' || Array.isArray(categories)) throw new PackageBreakdownError('Choose a resource category for every component row.');
  const selected = categories as Record<string, unknown>;
  if (Object.keys(selected).some(key => !rows.some(row => String(row.sourceRowNumber) === key))) throw new PackageBreakdownError('The category selection includes a row outside this breakdown.');
  return rows.map(row => {
    const kind = selected[String(row.sourceRowNumber)];
    if (!RESOURCE_KINDS.includes(kind as BreakdownKind)) throw new PackageBreakdownError(`Choose a resource category for row ${row.sourceRowNumber}.`);
    if (row.quantityDefaulted || row.unitDefaulted) throw new PackageBreakdownError(`Row ${row.sourceRowNumber}: provide an explicit quantity and unit before adding resource costs.`);
    const quantity = new Decimal(row.quantity);
    const rate = new Decimal(row.sourceUnitCost ?? row.unitCost);
    const amount = new Decimal(row.amount);
    if (!quantity.isFinite() || !rate.isFinite() || !amount.isFinite() || quantity.lt(0) || rate.lt(0) || amount.lt(0)
      || rate.decimalPlaces() > 2 || !quantity.times(rate).toDecimalPlaces(2).equals(amount)) {
      throw new PackageBreakdownError(`Row ${row.sourceRowNumber}: quantity × unit rate must match the amount, with a rate of at most two decimal places. Correct the workbook or retain it as evidence only.`);
    }
    return { kind: kind as BreakdownKind, description: row.description, unit: row.unit,
      quantity: quantity.toString(), unitCost: rate.toFixed(2), amount: amount.toFixed(2), sourceRowNumber: row.sourceRowNumber };
  });
}

export function resourceFingerprint(row: { kind: string; description: string; unit: string; quantity: string; unitCost: string }) {
  return JSON.stringify([row.kind, row.description.normalize('NFKC').trim().toLocaleLowerCase(), row.unit.trim().toLocaleLowerCase(), new Decimal(row.quantity).toString(), new Decimal(row.unitCost).toString()]);
}
