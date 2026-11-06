import type { BOQSourceRow } from './review-state';

/** Show source evidence, preserving missing values and rates before derivation. */
export function sourceComparisonFields(row: BOQSourceRow) {
  return {
    itemCode: row.itemCodeSynthesized ? '' : row.itemCode,
    unit: row.unitDefaulted ? '' : row.unit,
    quantity: row.quantityDefaulted ? '' : row.quantity,
    unitCost: row.sourceUnitCost === undefined ? row.unitCost : row.sourceUnitCost ?? '',
  };
}
