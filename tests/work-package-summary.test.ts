import { buildWorkPackageSummary } from '../src/lib/scheduling/work-package-summary';

describe('buildWorkPackageSummary', () => {
  const boqItems = [
    { id: 'item-a', itemCode: 'A-1', description: 'Concrete', unit: 'm3', quantity: '10.125', totalCost: '1000' },
    { id: 'item-b', itemCode: 'B-2', description: 'Steel', unit: 'kg', quantity: 0, totalCost: 0 },
    { id: 'item-c', itemCode: 'C-3', description: 'Paint', unit: 'L', quantity: '3', totalCost: '300' },
  ] as const;

  it('summarizes quantity splits and uses stored allocation amounts without deriving prices', () => {
    const result = buildWorkPackageSummary({
      awardedContractAmount: '1000.00',
      workflowStatus: 'AI_GENERATED_DRAFT',
      activities: [
        {
          id: 'activity-1', activityCode: 'WP-01', name: 'Foundation',
          plannedStartDate: '2026-01-02T00:00:00.000Z', plannedFinishDate: new Date('2026-01-11T00:00:00Z'),
          actualProgressPercent: '25', wbs: { name: 'Substructure' },
          boqAllocations: [
            { id: 'alloc-1', awardedBoqItemId: 'item-a', allocatedQuantity: '4.125', allocatedAmount: '321.456', awardedBoqItem: boqItems[0] },
            { id: 'alloc-2', awardedBoqItemId: 'item-a', allocatedQuantity: '6', allocatedAmount: '678.544', awardedBoqItem: boqItems[0] },
          ],
        },
      ],
    }, boqItems);

    expect(result.packages[0]).toMatchObject({
      code: 'WP-01', groupName: 'Substructure', startDate: '2026-01-02', finishDate: '2026-01-11',
      amount: '1000.00', weightPercent: '100.00', recordedProgressPercent: 25,
    });
    expect(result.packages[0].scope.map(line => line.allocatedQuantity)).toEqual(['4.125', '6']);
    expect(result.packages[0].scope.map(line => line.id)).toEqual(['alloc-1', 'alloc-2']);
    expect(result.packages[0].scope.map(line => line.boqItemId)).toEqual(['item-a', 'item-a']);
    expect(result.coverage[0]).toMatchObject({ allocatedQuantity: '10.125', remainingQuantity: '0', status: 'planned' });
    expect(result.coverage[1]).toMatchObject({ approvedQuantity: '0', allocatedQuantity: '0', remainingQuantity: '0', status: 'unplanned' });
    expect(result.coverage[2]).toMatchObject({ allocatedQuantity: '0', status: 'unplanned' });
    expect(result.allocatedAmount).toBe('1000.00');
  });

  it('distinguishes unknown and legacy quantity from zero or absent allocation', () => {
    const result = buildWorkPackageSummary({
      activities: [
        { id: 'legacy', name: 'Legacy', boqAllocations: [{ id: 'legacy-allocation', awardedBoqItemId: 'item-a', mappedQuantity: 7, awardedBoqItem: boqItems[0] }] },
        { id: 'invalid-quantity', name: 'Invalid quantity', actualProgressPercent: '', boqAllocations: [{ id: 'negative-quantity', awardedBoqItemId: 'item-a', allocatedQuantity: -2, mappedQuantity: 4, awardedBoqItem: boqItems[0] }] },
        { id: 'missing-quantity', name: 'Missing quantity', boqAllocations: [{ id: 'missing-quantity-allocation', awardedBoqItemId: 'item-c', awardedBoqItem: boqItems[2] }] },
        { id: 'missing', name: 'Missing scope' },
        { id: 'zero', name: 'Zero allocation', boqAllocations: [{ id: 'zero-allocation', awardedBoqItemId: 'item-b', allocatedQuantity: 0, awardedBoqItem: boqItems[1] }] },
      ],
    }, boqItems);

    expect(result.packages[0].scope[0]).toMatchObject({ allocatedQuantity: '7', legacyQuantity: true });
    expect(result.coverage[0]).toMatchObject({ allocatedQuantity: null, remainingQuantity: null, status: 'unknown' });
    expect(result.coverage[1]).toMatchObject({ allocatedQuantity: '0', remainingQuantity: '0', status: 'planned' });
    expect(result.packages[1].scope[0]).toMatchObject({ allocatedQuantity: null, legacyQuantity: false });
    expect(result.packages[1].recordedProgressPercent).toBeNull();
    expect(result.coverage[2]).toMatchObject({ allocatedQuantity: null, remainingQuantity: null, status: 'unknown' });
    expect(result.packages[3].scope).toEqual([]);
    expect(result.missingScopeCount).toBe(1);
    expect(result.allocatedAmount).toBeNull();
  });

  it('flags over-allocation, invalid values and invalid dates while preserving exact decimal math', () => {
    const result = buildWorkPackageSummary({
      awardedContractAmount: '3', workflowStatus: 'ACTIVE_BASELINE',
      activities: [
        {
          id: 'one', name: 'One', activityCode: '', plannedStartDate: 'not-a-date', plannedFinishDate: null,
          actualProgressPercent: 101, allocatedAmount: '1.005',
          boqAllocations: [{ id: 'a', awardedBoqItemId: 'item-a', allocatedQuantity: '10.126', allocatedAmount: '1.005', awardedBoqItem: boqItems[0] }],
        },
      ],
    }, boqItems);

    expect(result.packages[0]).toMatchObject({ code: 'Uncoded', startDate: null, finishDate: null, amount: '1.01', weightPercent: '33.50', recordedProgressPercent: null });
    expect(result.coverage[0]).toMatchObject({ allocatedQuantity: '10.126', remainingQuantity: '-0.001', status: 'overallocated' });
    expect(result.datedCount).toBe(0);
    expect(result.isImmutable).toBe(true);

    const invalid = buildWorkPackageSummary({ awardedContractAmount: 'Infinity', activities: [{ id: 'bad', name: 'Bad', allocatedAmount: '-4', plannedStartDate: '2026-02', plannedFinishDate: '2026-02-03' }] }, []);
    expect(invalid.contractAmount).toBeNull();
    expect(invalid.packages[0].amount).toBeNull();
    expect(invalid.packages[0].startDate).toBeNull();
    expect(invalid.datedCount).toBe(0);

    const reversed = buildWorkPackageSummary({ activities: [{ id: 'reversed', name: 'Reversed', plannedStartDate: '2026-03-10', plannedFinishDate: '2026-03-09' }] }, []);
    expect(reversed.packages[0]).toMatchObject({ startDate: null, finishDate: null });
    const impossible = buildWorkPackageSummary({ activities: [{ id: 'impossible', name: 'Impossible', plannedStartDate: '2026-02-30', plannedFinishDate: '2026-03-01' }] }, []);
    expect(impossible.packages[0]).toMatchObject({ startDate: null, finishDate: '2026-03-01' });
  });

  it('recognizes only immutable baseline workflow states and sums with high precision', () => {
    for (const workflowStatus of ['ACTIVE_BASELINE', 'SUPERSEDED_BASELINE', 'ARCHIVED_BASELINE']) {
      expect(buildWorkPackageSummary({ workflowStatus }, []).isImmutable).toBe(true);
    }
    expect(buildWorkPackageSummary({ workflowStatus: 'AI_GENERATED_DRAFT' }, []).isImmutable).toBe(false);

    const result = buildWorkPackageSummary({ activities: [
      { id: 'a', name: 'A', allocatedAmount: '0.1' },
      { id: 'b', name: 'B', allocatedAmount: '0.2' },
    ] }, []);
    expect(result.allocatedAmount).toBe('0.30');
  });
});
