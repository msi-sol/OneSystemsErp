import { consolidateMaterialRows } from '@/lib/boq/consolidation-materials';

const row = (overrides: Partial<Parameters<typeof consolidateMaterialRows>[0][number]> = {}) => ({
  itemCode: 'MAT-01',
  category: 'Materials',
  description: 'Portland cement Type I',
  unit: 'bag',
  quantity: 1,
  unitCost: 100,
  ...overrides,
});

describe('legacy master material consolidation', () => {
  it('does not introduce binary rounding discrepancies when combining decimal quantities', () => {
    const [material] = consolidateMaterialRows([row({ quantity: 0.1, unitCost: 0.2 }), row({ quantity: 0.2, unitCost: 0.2 })]);
    expect(material.quantity).toBe(0.3);
    expect(material.totalCost).toBe(0.06);
    expect(material.unitCost).toBe(0.2);
  });
  it('merges identical identity and normalized units with quantity-weighted cost', () => {
    const [material] = consolidateMaterialRows([
      row({ quantity: 2, unitCost: 100 }),
      row({ itemCode: ' mat-01 ', description: ' PORTLAND   CEMENT TYPE I ', unit: ' BAG ', quantity: 3, unitCost: 120 }),
    ]);

    expect(material).toMatchObject({ quantity: 5, totalCost: 560, unitCost: 112, unit: 'bag' });
    expect(material.quantity * material.unitCost).toBe(material.totalCost);
  });

  it('keeps otherwise identical materials in different units separate', () => {
    const materials = consolidateMaterialRows([
      row({ quantity: 2, unit: 'bag' }),
      row({ quantity: 10, unit: 'kg' }),
    ]);

    expect(materials).toHaveLength(2);
    expect(materials.map(material => [material.quantity, material.unit])).toEqual([[2, 'bag'], [10, 'kg']]);
  });

  it('does not fuzzy-merge distinct codes, punctuation, prefixes, or specifications', () => {
    const materials = consolidateMaterialRows([
      row({ itemCode: 'PUMP-450', description: '5.0m pump lift, 4.5kW' }),
      row({ itemCode: 'PUMP-451', description: '5.0m pump lift, 4.5kW' }),
      row({ itemCode: 'PUMP-450', description: '5.0m pump lift 4.5kW' }),
      row({ itemCode: 'PUMP-450', description: '5.0m pump lift, 4.0kW' }),
      row({ itemCode: 'PUMP-450', description: '5.0m pump lift, 4.5kW spare' }),
    ]);

    expect(materials).toHaveLength(5);
  });

  it('keeps fractional quantities exact through the weighted aggregation', () => {
    const [material] = consolidateMaterialRows([
      row({ quantity: 0.25, unitCost: 10 }),
      row({ quantity: 0.75, unitCost: 14 }),
    ]);

    expect(material.quantity).toBe(1);
    expect(material.totalCost).toBe(13);
    expect(material.unitCost).toBe(13);
  });

  it('preserves authoritative benchmark totals when they differ from quantity times rate', () => {
    const [material] = consolidateMaterialRows([
      row({ quantity: 0.1, unitCost: 3, totalCost: 0.35, sourceId: 'line-1' }),
      row({ quantity: 0.2, unitCost: 2, totalCost: 0.41, sourceId: 'line-2' }),
    ]);

    expect(material.quantity).toBeCloseTo(0.3);
    expect(material.totalCost).toBeCloseTo(0.76);
    expect(material.unitCost).toBeCloseTo(0.76 / 0.3);
    expect(material.sourceIds).toEqual(['line-1', 'line-2']);
  });

  it('retains fractional authoritative amounts without rounding source totals', () => {
    const [material] = consolidateMaterialRows([
      row({ quantity: 0.125, unitCost: 1, totalCost: 0.1275 }),
      row({ quantity: 0.375, unitCost: 1, totalCost: 0.3825 }),
    ]);

    expect(material.quantity).toBe(0.5);
    expect(material.totalCost).toBe(0.51);
    expect(material.unitCost).toBe(1.02);
  });

  it('preserves zero-rate and zero-quantity rows without producing a nonfinite rate', () => {
    const [freeMaterial, zeroQuantity] = consolidateMaterialRows([
      row({ itemCode: 'FREE', quantity: 2, unitCost: 0 }),
      row({ itemCode: 'ZERO', description: 'Zero quantity item', quantity: 0, unitCost: 25 }),
    ]);

    expect(freeMaterial).toMatchObject({ quantity: 2, unitCost: 0, totalCost: 0 });
    expect(zeroQuantity).toMatchObject({ quantity: 0, unitCost: 0, totalCost: 0 });
    expect(Number.isFinite(zeroQuantity.unitCost)).toBe(true);
  });
});
