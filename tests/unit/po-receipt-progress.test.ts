import { calculatePoReceiptProgress } from '@/lib/procurement/po-receipt-progress';

describe('purchase order receipt progress', () => {
  const order = [
    { id: 'line-a', consolidatedBoqItemId: 'material-a', quantity: 10 },
    { id: 'line-b', consolidatedBoqItemId: 'material-b', quantity: 5 },
  ];

  it('counts only the approved deliveries supplied for this purchase order', () => {
    const progress = calculatePoReceiptProgress(order, [
      { items: [{ consolidatedBoqItemId: 'material-a', quantity: 4 }] },
    ]);
    expect(progress.remainingByOrderItemId.get('line-a')).toBe(6);
    expect(progress.remainingByOrderItemId.get('line-b')).toBe(5);
    expect(progress.status).toBe('PARTIALLY_DELIVERED');
  });

  it('marks a PO delivered only when every material line is received', () => {
    const progress = calculatePoReceiptProgress(order, [
      { items: [{ consolidatedBoqItemId: 'material-a', quantity: 10 }] },
      { items: [{ consolidatedBoqItemId: 'material-b', quantity: 5 }] },
    ]);
    expect(progress.status).toBe('DELIVERED');
    expect([...progress.remainingByOrderItemId.values()]).toEqual([0, 0]);
  });

  it('allocates material-keyed receipt quantities across repeated PO lines without losing totals', () => {
    const progress = calculatePoReceiptProgress([
      { id: 'line-a1', consolidatedBoqItemId: 'material-a', quantity: 4 },
      { id: 'line-a2', consolidatedBoqItemId: 'material-a', quantity: 6 },
    ], [{ items: [{ consolidatedBoqItemId: 'material-a', quantity: 7 }] }]);
    expect(progress.remainingByOrderItemId.get('line-a1')).toBe(0);
    expect(progress.remainingByOrderItemId.get('line-a2')).toBe(3);
    expect(progress.status).toBe('PARTIALLY_DELIVERED');
  });

  it('does not infer delivery status from no valid receipt quantities', () => {
    const progress = calculatePoReceiptProgress(order, [
      { items: [{ consolidatedBoqItemId: 'material-a', quantity: Number.NaN }] },
    ]);
    expect(progress.status).toBeNull();
    expect(progress.remainingByOrderItemId.get('line-a')).toBe(10);
  });
});
