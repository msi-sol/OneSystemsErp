import Decimal from 'decimal.js';

export type ReceiptProgressOrderItem = { id: string; consolidatedBoqItemId: string; quantity: number };
export type ReceiptProgressDelivery = { items: Array<{ consolidatedBoqItemId: string; quantity: number }> };

export function calculatePoReceiptProgress(orderItems: ReceiptProgressOrderItem[], approvedDeliveries: ReceiptProgressDelivery[]) {
  const delivered = new Map<string, Decimal>();
  for (const delivery of approvedDeliveries) {
    for (const item of delivery.items) {
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      delivered.set(item.consolidatedBoqItemId,
        (delivered.get(item.consolidatedBoqItemId) || new Decimal(0)).plus(String(quantity)));
    }
  }

  const orderedByMaterial = new Map<string, Decimal>();
  for (const item of orderItems) {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) continue;
    orderedByMaterial.set(item.consolidatedBoqItemId,
      (orderedByMaterial.get(item.consolidatedBoqItemId) || new Decimal(0)).plus(String(quantity)));
  }

  // Delivery rows reference the material, not a PO line. Allocate receipt quantities
  // across repeated lines in order so the per-line remaining values still total correctly.
  const unassignedReceiptByMaterial = new Map(delivered);
  const remainingByOrderItemId = new Map<string, number>();
  for (const item of [...orderItems].sort((a, b) => a.id.localeCompare(b.id))) {
    const ordered = Number(item.quantity);
    if (!Number.isFinite(ordered) || ordered < 0) {
      remainingByOrderItemId.set(item.id, 0);
      continue;
    }
    const unassigned = unassignedReceiptByMaterial.get(item.consolidatedBoqItemId) || new Decimal(0);
    const applied = Decimal.min(String(ordered), unassigned);
    remainingByOrderItemId.set(item.id, Decimal.max(0, new Decimal(String(ordered)).minus(applied)).toNumber());
    unassignedReceiptByMaterial.set(item.consolidatedBoqItemId, Decimal.max(0, unassigned.minus(applied)));
  }

  const hasReceived = [...delivered.entries()].some(([materialId, quantity]) =>
    orderedByMaterial.has(materialId) && quantity.gt(0));
  const fullyReceived = orderItems.length > 0 && [...orderedByMaterial.entries()].every(([materialId, quantity]) =>
    (delivered.get(materialId) || new Decimal(0)).gte(quantity));

  return {
    deliveredByMaterial: new Map([...delivered].map(([id, qty]) => [id, qty.toNumber()])),
    remainingByOrderItemId,
    status: hasReceived ? (fullyReceived ? 'DELIVERED' : 'PARTIALLY_DELIVERED') : null,
  };
}
