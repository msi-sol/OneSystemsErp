import Decimal from 'decimal.js';
import type { ReceiptProgressDelivery, ReceiptProgressOrderItem } from './po-receipt-progress';

const Exact = Decimal.clone({ precision: 50 });
type PricedOrderItem = ReceiptProgressOrderItem & { unitCost: number };
type ReceiptItem = ReceiptProgressDelivery['items'][number];

/** Delivery records identify materials, so consume repeated PO lines in the same
 * stable order as receipt progress. Never value every line at the first rate. */
export function calculatePoReceiptCosts(orderItems: PricedOrderItem[], previous: ReceiptProgressDelivery[], items: ReceiptItem[]) {
  const ordered = new Map<string, PricedOrderItem[]>();
  for (const line of [...orderItems].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitCost) || line.unitCost < 0) throw Error('The purchase order contains an invalid quantity or rate.');
    ordered.set(line.consolidatedBoqItemId, [...ordered.get(line.consolidatedBoqItemId) || [], line]);
  }
  const received = new Map<string, Decimal>();
  for (const delivery of previous) for (const item of delivery.items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw Error('A prior approved receipt contains an invalid quantity.');
    received.set(item.consolidatedBoqItemId, (received.get(item.consolidatedBoqItemId) || new Exact(0)).plus(String(item.quantity)));
  }
  function value(materialId: string, quantity: Decimal) {
    const lines = ordered.get(materialId);
    if (!lines?.length) throw Error('Every delivery material must belong to the purchase order.');
    let remaining = quantity, amount = new Exact(0);
    for (const line of lines) {
      const applied = Exact.min(remaining, String(line.quantity));
      amount = amount.plus(applied.times(String(line.unitCost)));
      remaining = remaining.minus(applied);
    }
    // Retain the existing over-delivery policy, using the final PO line rate.
    if (remaining.gt(0)) amount = amount.plus(remaining.times(String(lines[lines.length - 1].unitCost)));
    return amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }
  const lineCosts = items.map(item => {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw Error('Delivery quantities must be positive finite numbers.');
    const before = received.get(item.consolidatedBoqItemId) || new Exact(0);
    const after = before.plus(String(item.quantity));
    const cost = value(item.consolidatedBoqItemId, after).minus(value(item.consolidatedBoqItemId, before));
    received.set(item.consolidatedBoqItemId, after);
    return cost.toNumber();
  });
  const totalAmount = lineCosts.reduce((sum, cost) => sum.plus(String(cost)), new Exact(0)).toNumber();
  if (!Number.isFinite(totalAmount) || totalAmount > Number.MAX_SAFE_INTEGER) throw Error('The delivery cost exceeds the supported numeric range.');
  return { lineCosts, totalAmount };
}

/** One input per material matches the material identity stored on DeliveryItem. */
export function groupPoReceivingItems<T extends ReceiptProgressOrderItem>(items: T[]): T[] {
  const groups = new Map<string, T>();
  for (const item of items) {
    const prior = groups.get(item.consolidatedBoqItemId);
    groups.set(item.consolidatedBoqItemId, prior
      ? { ...prior, quantity: new Exact(String(prior.quantity)).plus(String(item.quantity)).toNumber() }
      : { ...item, id: item.consolidatedBoqItemId });
  }
  return [...groups.values()];
}
