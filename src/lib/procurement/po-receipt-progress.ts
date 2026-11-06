export type ReceiptProgressOrderItem = { id: string; consolidatedBoqItemId: string; quantity: number };
export type ReceiptProgressDelivery = { items: Array<{ consolidatedBoqItemId: string; quantity: number }> };

export function calculatePoReceiptProgress(orderItems: ReceiptProgressOrderItem[], approvedDeliveries: ReceiptProgressDelivery[]) {
  const deliveredByMaterial = new Map<string, number>();
  for (const delivery of approvedDeliveries) {
    for (const item of delivery.items) {
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      deliveredByMaterial.set(item.consolidatedBoqItemId,
        (deliveredByMaterial.get(item.consolidatedBoqItemId) || 0) + quantity);
    }
  }

  const orderedByMaterial = new Map<string, number>();
  for (const item of orderItems) {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) continue;
    orderedByMaterial.set(item.consolidatedBoqItemId,
      (orderedByMaterial.get(item.consolidatedBoqItemId) || 0) + quantity);
  }

  // Delivery rows reference the material, not a PO line. Allocate receipt quantities
  // across repeated lines in order so the per-line remaining values still total correctly.
  const unassignedReceiptByMaterial = new Map(deliveredByMaterial);
  const remainingByOrderItemId = new Map<string, number>();
  for (const item of orderItems) {
    const ordered = Number(item.quantity);
    if (!Number.isFinite(ordered) || ordered < 0) {
      remainingByOrderItemId.set(item.id, 0);
      continue;
    }
    const unassigned = unassignedReceiptByMaterial.get(item.consolidatedBoqItemId) || 0;
    const applied = Math.min(ordered, unassigned);
    remainingByOrderItemId.set(item.id, Math.max(0, ordered - applied));
    unassignedReceiptByMaterial.set(item.consolidatedBoqItemId, Math.max(0, unassigned - applied));
  }

  const hasReceived = [...deliveredByMaterial.entries()].some(([materialId, quantity]) =>
    orderedByMaterial.has(materialId) && quantity > 0);
  const fullyReceived = orderItems.length > 0 && [...orderedByMaterial.entries()].every(([materialId, quantity]) =>
    (deliveredByMaterial.get(materialId) || 0) >= quantity);

  return {
    deliveredByMaterial,
    remainingByOrderItemId,
    status: hasReceived ? (fullyReceived ? 'DELIVERED' : 'PARTIALLY_DELIVERED') : null,
  };
}
