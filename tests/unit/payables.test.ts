import { subcontractBillingOutstanding, supplierCostNotYetExpensed, supplierPayableOutstanding } from '@/lib/finance/payables';
import { billedAmount } from '@/lib/subcontracting/billed-amount';

describe('payables owed', () => {
  it('counts what is still owed on supplier payables for received deliveries', () => {
    expect(supplierPayableOutstanding({ amount: 612000, paidAmount: 0, status: 'PENDING' })).toBe(612000);
    expect(supplierPayableOutstanding({ amount: 612000, paidAmount: 200000, status: 'PARTIAL' })).toBe(412000);
    expect(supplierPayableOutstanding({ amount: 612000, paidAmount: 612000, status: 'ACCRUED' })).toBe(612000);
    expect(supplierPayableOutstanding({ amount: 612000, paidAmount: 612000, status: 'PAID' })).toBe(0);
  });

  it('counts delivered material cost once: unpaid at net, paid/accrued already in expenses', () => {
    expect(supplierCostNotYetExpensed({ amount: 612000, netAmount: 546428.57, status: 'PENDING' })).toBe(546428.57);
    expect(supplierCostNotYetExpensed({ amount: 612000, netAmount: 546428.57, status: 'PAID' })).toBe(0);
    expect(supplierCostNotYetExpensed({ amount: 612000, netAmount: 546428.57, status: 'ACCRUED' })).toBe(0);
  });

  it('owes approved subcontract billings less payments, never the unbilled contract balance', () => {
    expect(subcontractBillingOutstanding({ netPayable: 112500, approvalStatus: 'APPROVED', status: 'APPROVED_FOR_PAYMENT', payments: [{ amountPaid: 50000 }] })).toBe(62500);
    expect(subcontractBillingOutstanding({ netPayable: 112500, approvalStatus: 'APPROVED', status: 'PAID', paymentStatus: 'PAID' })).toBe(0);
    expect(subcontractBillingOutstanding({ netPayable: 112500, approvalStatus: 'FOR_APPROVAL', status: 'SUBMITTED' })).toBe(0);
  });
});

describe('subcontract billed amount', () => {
  it('sums the gross of approved billings only', () => {
    expect(billedAmount([
      { currentGross: 125000, approvalStatus: 'APPROVED', status: 'PAID' },
      { currentGross: 50000, approvalStatus: 'FOR_APPROVAL', status: 'SUBMITTED' },
      { currentGross: 20000, approvalStatus: 'REJECTED', status: 'DRAFT' },
    ])).toBe(125000);
    expect(billedAmount(undefined)).toBe(0);
  });
});
