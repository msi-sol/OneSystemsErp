export interface SelectedBoqItem {
  id: string;
  joCost: number; // user-entered JO cost for this item (used in individual mode)
}

export const LUMP_SUM_REFERENCE = '1_LOT';

/** Copies only the fields the form edits, so relations and workflow fields are never posted back. */
export function buildEditFormState<T extends Record<string, unknown>>(initialData: Record<string, unknown>, defaults: T): T {
  const state: Record<string, unknown> = {};
  for (const key of Object.keys(defaults)) state[key] = initialData[key] ?? defaults[key];
  return state as T;
}

export function selectedItemsFromReferences(references: string[] | null | undefined): SelectedBoqItem[] {
  return (references ?? []).filter((id) => id !== LUMP_SUM_REFERENCE).map((id) => ({ id, joCost: 0 }));
}

/**
 * Per-item JO costs are not stored, so when an existing job order opens they are
 * rebuilt from its contract amount, weighted by each item's master BOQ value.
 */
export function allocateContractAmount(
  selected: SelectedBoqItem[],
  boqItems: Array<{ id: string; quantity?: unknown; combinedUnitCost?: unknown }>,
  contractAmount: number,
): SelectedBoqItem[] {
  const masterCost = (id: string) => {
    const item = boqItems.find((boqItem) => boqItem.id === id);
    return item ? (Number(item.quantity) || 0) * (Number(item.combinedUnitCost) || 0) : 0;
  };
  const totalMaster = selected.reduce((sum, item) => sum + masterCost(item.id), 0);
  const roundedTotal = Math.round(contractAmount * 100);
  let allocated = 0;
  return selected.map((item, index) => {
    const share = totalMaster > 0 ? masterCost(item.id) / totalMaster : 1 / selected.length;
    // Working in centavos lets the last item take the rounding remainder.
    const cents = index === selected.length - 1 ? roundedTotal - allocated : Math.round(roundedTotal * share);
    allocated += cents;
    return { ...item, joCost: cents / 100 };
  });
}
