import { compareBOQLines, summarizeComparison, type BOQComparisonLine } from '@/lib/boq/comparison';

const line = (overrides: Partial<BOQComparisonLine> = {}): BOQComparisonLine => ({
  itemId: 'i1', rowNumber: 5, section: 'Earthworks', itemCode: '1.1', description: 'Excavation', unit: 'cu.m',
  quantity: '100', unitCost: '500', amount: '50000', ...overrides,
});

describe('BOQ file-to-system comparison', () => {
  it('matches identical lines by item id', () => {
    const rows = compareBOQLines([line()], [line()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'Matched', changed: [] });
  });

  it('lists exactly which fields changed', () => {
    const [row] = compareBOQLines([line()], [line({ quantity: '110', amount: '55000' })]);
    expect(row.status).toBe('Changed');
    expect(row.changed).toEqual(['quantity', 'amount']);
  });

  it('ignores sub-centavo noise but not real amount differences', () => {
    expect(compareBOQLines([line()], [line({ amount: '50000.001' })])[0].status).toBe('Matched');
    expect(compareBOQLines([line()], [line({ amount: '50000.01' })])[0].status).toBe('Changed');
  });

  it('does not count a system-generated code for a file row without one as a change', () => {
    expect(compareBOQLines([line({ itemCode: '' })], [line({ itemCode: 'ROW-5' })])[0].status).toBe('Matched');
    expect(compareBOQLines([line({ itemCode: '1.1' })], [line({ itemCode: '1.2' })])[0].changed).toEqual(['itemCode']);
  });

  it('does not flag a rate derived from the unchanged stated amount (reported as a reading finding instead)', () => {
    // File rate is a base cost (before mark-ups/VAT); the system keeps the amount and derives the all-in rate.
    expect(compareBOQLines([line({ quantity: '1', unitCost: '98313.33', amount: '103229' })], [line({ quantity: '1', unitCost: '103229', amount: '103229' })])[0].status).toBe('Matched');
    expect(compareBOQLines([line({ quantity: '3', unitCost: '3920.25', amount: '9879.02' })], [line({ quantity: '3', unitCost: '3293.01', amount: '9879.02' })])[0].status).toBe('Matched');
  });

  it('still flags a real unit rate change', () => {
    // Rate edited but amount not derived from it, or amount changed with it: both are real differences.
    expect(compareBOQLines([line()], [line({ unitCost: '550' })])[0].changed).toEqual(['unitCost']);
    expect(compareBOQLines([line()], [line({ unitCost: '550', amount: '55000' })])[0].changed).toEqual(['unitCost', 'amount']);
  });

  it('treats a quantity missing in the file as different from a stated one', () => {
    expect(compareBOQLines([line({ quantity: '' })], [line({ quantity: '0' })])[0].changed).toContain('quantity');
  });

  it('pairs by a unique item code when the file row has no item id', () => {
    const rows = compareBOQLines([line({ itemId: null })], [line({ itemId: 'x9' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('Matched');
  });

  it('does not pair a code that repeats in the file', () => {
    const rows = compareBOQLines([line({ itemId: null }), line({ itemId: null, rowNumber: 6 })], [line({ itemId: 'x9' })]);
    expect(rows.map(row => row.status)).toEqual(['Only in file', 'Only in file', 'Only in system']);
  });

  it('summarizes counts, totals and per-section differences', () => {
    const rows = compareBOQLines(
      [line(), line({ itemId: 'i2', itemCode: '2.1', section: 'Concrete', amount: '1000' })],
      [line({ amount: '60000' }), line({ itemId: 'i3', itemCode: '3.1', section: 'Finishes', amount: '500' })],
    );
    const summary = summarizeComparison(rows);
    expect(summary).toMatchObject({ matched: 0, changed: 1, onlyInFile: 1, onlyInSystem: 1, differences: 3, sourceTotal: 51000, currentTotal: 60500, difference: 9500 });
    expect(summary.sections.find(entry => entry.section === 'Concrete')).toMatchObject({ sourceAmount: 1000, currentAmount: 0, differences: 1 });
  });
});
