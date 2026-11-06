import { canReceivePurchaseOrder } from '@/lib/procurement/receivable-purchase-order';

describe('purchase order receipt eligibility', () => {
  it.each(['APPROVED', 'ISSUED', 'PARTIALLY_DELIVERED'])('allows actual receipts for %s orders', status => {
    expect(canReceivePurchaseOrder(status)).toBe(true);
  });

  it.each(['DRAFT', 'FOR_REVIEW', 'SUBMITTED', 'REJECTED', 'CANCELLED', 'DELIVERED', 'COMPLETED', ''])('prevents stock and costs from being received against %s orders', status => {
    expect(canReceivePurchaseOrder(status)).toBe(false);
  });
});
