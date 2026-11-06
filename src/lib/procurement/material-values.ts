type MaterialValues = {
  quantity: number; totalCost?: number; revisedQuantity?: number | null; revisedTotalCost?: number | null;
  voAdditiveQty?: number; voDeductiveQty?: number; voAdditiveCost?: number; voDeductiveCost?: number; isVariationItem?: boolean;
};

// Legacy rows use zero as an uninitialized revision. A documented variation,
// however, may legitimately reduce the quantity or value all the way to zero.
export function materialQuantity(item: MaterialValues): number {
  const revised = item.revisedQuantity;
  if (revised != null && Number.isFinite(revised) && (revised > 0 || item.isVariationItem || (item.voAdditiveQty || 0) > 0 || (item.voDeductiveQty || 0) > 0)) return revised;
  return item.quantity;
}

export function materialTotalCost(item: MaterialValues): number {
  const revised = item.revisedTotalCost;
  if (revised != null && Number.isFinite(revised) && (revised > 0 || item.isVariationItem || (item.voAdditiveCost || 0) > 0 || (item.voDeductiveCost || 0) > 0)) return revised;
  return item.totalCost ?? 0;
}
