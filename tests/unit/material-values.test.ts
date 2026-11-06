import { materialQuantity, materialTotalCost } from '@/lib/procurement/material-values';

describe('material quantities and values after variations', () => {
  const original = { quantity: 10, totalCost: 100, revisedQuantity: 0, revisedTotalCost: 0 };
  it('keeps original values for historical rows whose revision fields were never initialized', () => {
    expect(materialQuantity(original)).toBe(10);
    expect(materialTotalCost(original)).toBe(100);
  });
  it('retains a complete deduction instead of displaying the original allowance again', () => {
    const deducted = { ...original, voDeductiveQty: 10, voDeductiveCost: 100 };
    expect(materialQuantity(deducted)).toBe(0);
    expect(materialTotalCost(deducted)).toBe(0);
  });
  it('shows revised positive values and zero-cost variation materials', () => {
    expect(materialQuantity({ ...original, revisedQuantity: 5 })).toBe(5);
    expect(materialTotalCost({ ...original, revisedTotalCost: 50 })).toBe(50);
    expect(materialTotalCost({ ...original, isVariationItem: true })).toBe(0);
  });
});
