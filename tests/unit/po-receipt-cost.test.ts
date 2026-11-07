import { calculatePoReceiptCosts, groupPoReceivingItems } from '@/lib/procurement/po-receipt-cost';

describe('receipt valuation across repeated PO materials', () => {
  const lines = [
    { id: 'a', consolidatedBoqItemId: 'cement', quantity: 4, unitCost: 10 },
    { id: 'b', consolidatedBoqItemId: 'cement', quantity: 6, unitCost: 20 },
  ];
  const item = (quantity: number) => ({ consolidatedBoqItemId: 'cement', quantity });
  it('uses each approved rate and reconciles partial receipts to the full PO amount', () => {
    expect(calculatePoReceiptCosts(lines, [], [item(5)])).toEqual({ lineCosts: [60], totalAmount: 60 });
    expect(calculatePoReceiptCosts([...lines].reverse(), [{ items: [item(5)] }], [item(5)])).toEqual({ lineCosts: [100], totalAmount: 100 });
  });
  it('does not consume the same remaining priced line twice within a receipt', () => {
    expect(calculatePoReceiptCosts(lines, [], [item(3), item(4)])).toEqual({ lineCosts: [30, 70], totalAmount: 100 });
  });
  it('carries fractional cent rounding forward across partial receipts', () => {
    const fractional = [{ id: 'a', consolidatedBoqItemId: 'cement', quantity: 3, unitCost: 0.3333333333333333 }];
    expect(calculatePoReceiptCosts(fractional, [], [item(1)]).totalAmount).toBe(0.33);
    expect(calculatePoReceiptCosts(fractional, [{ items: [item(1)] }], [item(1)]).totalAmount).toBe(0.34);
    expect(calculatePoReceiptCosts(fractional, [{ items: [item(2)] }], [item(1)]).totalAmount).toBe(0.33);
  });
  it('retains zero rates and rejects invalid prices or unrelated material receipts', () => {
    expect(calculatePoReceiptCosts([{ ...lines[0], unitCost: 0 }], [], [item(1)]).totalAmount).toBe(0);
    expect(() => calculatePoReceiptCosts([{ ...lines[0], unitCost: -1 }], [], [item(1)])).toThrow('invalid');
    expect(() => calculatePoReceiptCosts(lines, [], [{ consolidatedBoqItemId: 'other', quantity: 1 }])).toThrow('belong');
  });
  it('combines duplicate material rows into one receiving input without altering source data', () => {
    expect(groupPoReceivingItems(lines)).toEqual([{ ...lines[0], id: 'cement', quantity: 10 }]);
    expect(lines.map(row => row.quantity)).toEqual([4, 6]);
    expect(groupPoReceivingItems([{ ...lines[0], quantity: 0.1 }, { ...lines[1], quantity: 0.2 }])[0].quantity).toBe(0.3);
  });
});
