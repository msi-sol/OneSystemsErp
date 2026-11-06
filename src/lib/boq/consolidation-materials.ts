import Decimal from 'decimal.js';

export type ConsolidationMaterialInput = {
  itemCode: string;
  category: string;
  description: string;
  unit: string;
  quantity: number;
  unitCost: number;
  /** Optional source total, used when the source amount is authoritative. */
  totalCost?: number;
  /** Source record IDs are returned for callers that must preserve mappings. */
  sourceId?: string;
};

export type ConsolidatedMaterial = {
  itemCodePrefix: string;
  category: string;
  description: string;
  unit: string;
  quantity: number;
  totalCost: number;
  unitCost: number;
  sourceIds: string[];
};

function normalizeIdentity(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function usableCode(value: string): string {
  const code = normalizeIdentity(value);
  return code === 'n/a' ? '' : code;
}

/**
 * Consolidate only identical item identities with the same normalized unit.
 * Item codes and descriptions retain punctuation so distinct specifications
 * are not merged by fuzzy or prefix matching.
 */
export function consolidateMaterialRows(rows: ConsolidationMaterialInput[]): ConsolidatedMaterial[] {
  const groups = new Map<string, ConsolidatedMaterial>();

  for (const row of rows) {
    const description = row.description.trim();
    if (!description) continue;

    const code = usableCode(row.itemCode);
    const normalizedDescription = normalizeIdentity(description);
    const unit = row.unit.trim() || 'lot';
    const key = JSON.stringify([code, normalizedDescription, normalizeIdentity(unit)]);
    const quantity = Number.isFinite(row.quantity) ? row.quantity : 0;
    const unitCost = Number.isFinite(row.unitCost) ? row.unitCost : 0;
    const lineTotal = Number.isFinite(row.totalCost) ? row.totalCost! : new Decimal(quantity).times(unitCost).toNumber();
    const existing = groups.get(key);

    if (existing) {
      existing.quantity = new Decimal(existing.quantity).plus(quantity).toNumber();
      existing.totalCost = new Decimal(existing.totalCost).plus(lineTotal).toNumber();
      existing.unitCost = existing.quantity === 0 ? 0 : new Decimal(existing.totalCost).div(existing.quantity).toNumber();
      if (row.sourceId) existing.sourceIds.push(row.sourceId);
      continue;
    }

    groups.set(key, {
      itemCodePrefix: row.itemCode.trim() || description,
      category: row.category,
      description,
      unit,
      quantity,
      totalCost: lineTotal,
      unitCost: quantity === 0 ? 0 : new Decimal(lineTotal).div(quantity).toNumber(),
      sourceIds: row.sourceId ? [row.sourceId] : [],
    });
  }

  return [...groups.values()];
}

