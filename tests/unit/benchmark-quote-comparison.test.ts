import { benchmarkRate, compareQuoteToBenchmark } from '@/lib/procurement/benchmark-quote-comparison';

const items = [
  { id: 'accu', quantityRequired: 3, consolidatedBoqItem: { description: 'ACCU 18HP', unit: 'units', unitCost: 466699.996667 } },
  { id: 'fcu', quantityRequired: 2, consolidatedBoqItem: { description: 'FCU 2HP', unit: 'units', unitCost: 34692.66, revisedBenchmarkUnitCost: 35000 } },
];

describe('supplier quotes compared with the procurement benchmark', () => {
  it('uses the revised benchmark rate when a variation changed it', () => {
    expect(benchmarkRate(items[1].consolidatedBoqItem)).toBe(35000);
    expect(benchmarkRate({ unitCost: 0 })).toBeNull();
  });

  it('falls back to the approved rate when the revised rate was never set (stored as 0)', () => {
    // Master materials generated from the Procurement Benchmark tab leave revisedBenchmarkUnitCost at its default 0.
    expect(benchmarkRate({ unitCost: 466700, revisedBenchmarkUnitCost: 0 })).toBe(466700);
    expect(benchmarkRate({ unitCost: 0, revisedBenchmarkUnitCost: 0 })).toBeNull();
  });

  it('reports under- and over-budget lines and the overall difference', () => {
    const result = compareQuoteToBenchmark(items, [
      { canvassItemId: 'accu', unitCost: 460000 },
      { canvassItemId: 'fcu', unitCost: 36000 },
    ]);
    expect(result.lines.map(line => [line.canvassItemId, line.overBudget])).toEqual([['accu', false], ['fcu', true]]);
    expect(result.overBudgetLines.map(line => line.difference)).toEqual([2000]);
    expect(result.benchmarkTotal).toBe(1470099.99);
    expect(result.quotedTotal).toBe(1452000);
    expect(result.overBudget).toBe(false);
  });

  it('compares only the quantity the supplier can supply and skips lines without a benchmark rate', () => {
    const result = compareQuoteToBenchmark([...items, { id: 'misc', quantityRequired: 1, consolidatedBoqItem: { unitCost: null } }], [
      { canvassItemId: 'accu', unitCost: 470000, quantityAvailable: 1 },
      { canvassItemId: 'misc', unitCost: 10 },
    ]);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ quantity: 1, difference: 3300, overBudget: true });
  });
});
