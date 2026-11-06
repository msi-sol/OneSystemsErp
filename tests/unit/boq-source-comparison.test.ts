import { sourceComparisonFields } from '@/lib/boq/source-comparison';
import type { BOQSourceRow } from '@/lib/boq/review-state';

const row: BOQSourceRow = { sourceRowNumber: 3, section: 'Works', itemCode: 'A-1', description: 'Excavation', unit: 'm3', quantity: '2', unitCost: '20.055', sourceUnitCost: '15', rateDerived: true, amount: '40.11', breakdown: {} };

describe('BOQ source comparison evidence', () => {
  it('shows the actual source rate rather than the normalized amount-per-quantity rate', () => {
    expect(sourceComparisonFields(row)).toMatchObject({ unitCost: '15', quantity: '2' });
  });
  it('keeps inferred quantities, units, codes and missing rates distinct from stated source values', () => {
    expect(sourceComparisonFields({ ...row, sourceUnitCost: null, quantityDefaulted: true, unitDefaulted: true, itemCodeSynthesized: true })).toEqual({ itemCode: '', unit: '', quantity: '', unitCost: '' });
  });
  it('preserves explicit zero rates and older readings without source-rate metadata', () => {
    expect(sourceComparisonFields({ ...row, sourceUnitCost: '0' }).unitCost).toBe('0');
    expect(sourceComparisonFields({ ...row, sourceUnitCost: undefined }).unitCost).toBe('20.055');
  });
});
