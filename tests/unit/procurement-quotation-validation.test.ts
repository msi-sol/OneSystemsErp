import { getComparableQuotationTotal, getMinimumPositiveQuotationTotal, isFullQuotationCoverage, splitTaxInclusiveAmount, validateQuotationLines } from '../../src/lib/procurement/quotation-validation';

const canvassLines = [
  { id: 'line-a', quantityRequired: 10 },
  { id: 'line-b', quantityRequired: 4 },
];

describe('manual supplier quotation validation', () => {
  it('preserves partial availability and calculates total from offered quantities', () => {
    const lines = validateQuotationLines([
      { canvassItemId: 'line-a', unitCost: 5, quantityAvailable: 3 },
      { canvassItemId: 'line-b', unitCost: 8, quantityAvailable: 0 },
    ], canvassLines);

    expect(lines).toEqual([
      { canvassItemId: 'line-a', unitCost: 5, quantityAvailable: 3, totalCost: 15 },
      { canvassItemId: 'line-b', unitCost: 8, quantityAvailable: 0, totalCost: 0 },
    ]);
  });

  it('rejects missing or nonpositive prices for available lines', () => {
    expect(() => validateQuotationLines([
      { canvassItemId: 'line-a', quantityAvailable: 2 },
      { canvassItemId: 'line-b', unitCost: 8, quantityAvailable: 0 },
    ], canvassLines)).toThrow(/positive unit cost/);
    for (const unitCost of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(() => validateQuotationLines([
        { canvassItemId: 'line-a', unitCost, quantityAvailable: 2 },
        { canvassItemId: 'line-b', unitCost: 8, quantityAvailable: 0 },
      ], canvassLines)).toThrow(/positive unit cost/);
    }
    expect(() => validateQuotationLines([
      { canvassItemId: 'line-a', unitCost: 0, quantityAvailable: 2 },
      { canvassItemId: 'line-b', unitCost: 8, quantityAvailable: 0 },
    ], canvassLines)).toThrow(/positive unit cost/);
  });

  it('rejects zero-total and empty offers', () => {
    expect(() => validateQuotationLines([
      { canvassItemId: 'line-a', unitCost: 0, quantityAvailable: 0 },
      { canvassItemId: 'line-b', unitCost: 0, quantityAvailable: 0 },
    ], canvassLines)).toThrow(/at least one available item/);
    expect(() => validateQuotationLines([], canvassLines)).toThrow(/at least one canvassed item/);
  });

  it('rejects over-availability, foreign IDs, duplicates, and omitted canvass lines', () => {
    expect(() => validateQuotationLines([
      { canvassItemId: 'line-a', unitCost: 1, quantityAvailable: 11 },
      { canvassItemId: 'line-b', unitCost: 1, quantityAvailable: 0 },
    ], canvassLines)).toThrow(/between 0 and the requested quantity/);
    expect(() => validateQuotationLines([
      { canvassItemId: 'foreign', unitCost: 1, quantityAvailable: 1 },
      { canvassItemId: 'line-b', unitCost: 1, quantityAvailable: 0 },
    ], canvassLines)).toThrow(/unique items from this canvass/);
    expect(() => validateQuotationLines([
      { canvassItemId: 'line-a', unitCost: 1, quantityAvailable: 1 },
      { canvassItemId: 'line-a', unitCost: 1, quantityAvailable: 1 },
    ], canvassLines)).toThrow(/unique items from this canvass/);
    expect(() => validateQuotationLines([
      { canvassItemId: 'line-a', unitCost: 1, quantityAvailable: 1 },
    ], canvassLines)).toThrow(/exactly once/);
    for (const quantityAvailable of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => validateQuotationLines([
        { canvassItemId: 'line-a', unitCost: 1, quantityAvailable },
        { canvassItemId: 'line-b', unitCost: 1, quantityAvailable: 0 },
      ], canvassLines)).toThrow(/between 0 and the requested quantity/);
    }
  });
});

describe('quotation comparison price validation', () => {
  it('returns the smallest finite positive quotation total', () => {
    expect(getMinimumPositiveQuotationTotal([100, 40, 75])).toBe(40);
  });

  it.each([[0], [-1], [Number.NaN], [Number.POSITIVE_INFINITY]])('rejects invalid totals %p', total => {
    expect(() => getMinimumPositiveQuotationTotal([100, total])).toThrow(/zero, or invalid totals/);
  });

  it('excludes partial offers and compares only full requested scope', () => {
    const partial = [
      { canvassItemId: 'line-a', unitCost: 5, quantityAvailable: 3 },
      { canvassItemId: 'line-b', unitCost: 8, quantityAvailable: 4 },
    ];
    const complete = [
      { canvassItemId: 'line-a', unitCost: 5, quantityAvailable: 10 },
      { canvassItemId: 'line-b', unitCost: 8, quantityAvailable: 4 },
    ];

    expect(isFullQuotationCoverage(canvassLines, partial)).toBe(false);
    expect(getComparableQuotationTotal(canvassLines, partial)).toBeNull();
    expect(isFullQuotationCoverage(canvassLines, complete)).toBe(true);
    expect(getComparableQuotationTotal(canvassLines, complete)).toBe(82);
  });

  it('splits vatable quote totals using the existing inclusive-tax rule', () => {
    const vatable = splitTaxInclusiveAmount(112, true);
    expect(vatable.netAmount).toBeCloseTo(100, 10);
    expect(vatable.vatAmount).toBeCloseTo(12, 10);
    expect(splitTaxInclusiveAmount(112, false)).toEqual({ netAmount: 112, vatAmount: 0 });
  });
});
