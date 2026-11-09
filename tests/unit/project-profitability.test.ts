import { computeProfitability, type ProfitabilityInput } from '@/lib/finance/project-profitability';

const base: ProfitabilityInput = {
  awardedItems: [
    { id: 'boq-a', itemCode: 'A.1', description: 'ACCU', totalCost: 600_000 },
    { id: 'boq-b', itemCode: 'B.1', description: 'FCU', totalCost: 50_000 },
  ],
  materials: [
    { id: 'm1', totalCost: 466_700, unitCost: 466_700, links: [{ awardedBoqItemId: 'boq-a', weight: 466_700 }] },
    { id: 'm2', totalCost: 69_000, unitCost: 34_500, links: [{ awardedBoqItemId: 'boq-b', weight: 34_500 }, { awardedBoqItemId: null, weight: 34_500 }] },
  ],
  benchmarkTotal: 535_700,
  costs: [],
  commitments: [],
  orderedLines: [],
};

describe('project profitability', () => {
  it('shows no savings before anything is ordered; the unspent budget is "budget left"', () => {
    const result = computeProfitability(base);
    expect(result.purchaseSavings).toEqual({ orderedAmount: 0, budgetForOrdered: 0, savings: 0, lines: 0 });
    expect(result.budgetLeft).toBe(535_700);
    expect(result.boqLevelDetails.map((row) => row.status)).toEqual(['NOT_STARTED', 'NOT_STARTED']);
    expect(result.isOverrun).toBe(false);
  });

  it('does not count a delivered PO amount as both actual and committed', () => {
    const result = computeProfitability({
      ...base,
      costs: [{ netAmount: 450_000, costCategory: 'MATERIALS', consolidatedBoqItemId: 'm1', awardedBoqItemId: null }],
      // Old data: the delivery never reduced the commitment.
      commitments: [
        { approvedAmount: 450_000, remainingCommitment: 450_000, commitmentType: 'PURCHASE_ORDER', consolidatedBoqItemId: 'm1', awardedBoqItemId: null, createdAt: '2026-11-01' },
        { approvedAmount: 33_000, remainingCommitment: 33_000, commitmentType: 'PURCHASE_ORDER', consolidatedBoqItemId: 'm2', awardedBoqItemId: null, createdAt: '2026-11-01' },
      ],
    });
    expect(result.actualCostIncurred).toBe(450_000);
    expect(result.committedCost).toBe(33_000);
    expect(result.totalExecutionCost).toBe(483_000);
  });

  it('measures savings only on ordered quantities, at the benchmark rate', () => {
    const result = computeProfitability({ ...base, orderedLines: [{ consolidatedBoqItemId: 'm1', quantity: 1, unitCost: 450_000 }, { consolidatedBoqItemId: 'm2', quantity: 1, unitCost: 36_000 }] });
    expect(result.purchaseSavings).toEqual({ orderedAmount: 486_000, budgetForOrdered: 501_200, savings: 15_200, lines: 2 });
  });

  it('puts material costs on BOQ items through the benchmark links; the rest is unlinked', () => {
    const result = computeProfitability({
      ...base,
      costs: [
        { netAmount: 450_000, costCategory: 'MATERIALS', consolidatedBoqItemId: 'm1', awardedBoqItemId: null },
        { netAmount: 30_000, costCategory: 'MATERIALS', consolidatedBoqItemId: 'm2', awardedBoqItemId: null },
        { netAmount: 5_000, costCategory: 'CONSUMABLES', consolidatedBoqItemId: null, awardedBoqItemId: null },
      ],
    });
    expect(result.boqLevelDetails).toEqual([
      expect.objectContaining({ id: 'boq-a', actualCost: 450_000, variance: 150_000, status: 'WITHIN_CONTRACT' }),
      expect.objectContaining({ id: 'boq-b', actualCost: 15_000, variance: 35_000, status: 'WITHIN_CONTRACT' }),
    ]);
    // Half of m2 (its unlinked benchmark line) and the consumables have no BOQ item.
    expect(result.unlinkedCost).toBe(20_000);
  });

  it('flags a budget overrun and a BOQ item cost above its contract value', () => {
    const result = computeProfitability({ ...base, costs: [{ netAmount: 700_000, costCategory: 'MATERIALS', consolidatedBoqItemId: 'm1', awardedBoqItemId: null }] });
    expect(result.isOverrun).toBe(true);
    expect(result.budgetLeft).toBe(-164_300);
    expect(result.boqLevelDetails[0]).toEqual(expect.objectContaining({ status: 'OVERRUN', variance: -100_000 }));
  });
});
