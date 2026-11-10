/**
 * What the project still owes, the same way the Supplier Payables and subcontract payment screens count it.
 * - Supplier: a payable is created per received delivery. PAID owes nothing; ACCRUED was booked as an expense but
 *   not paid, so the full amount is owed; otherwise the unpaid part. Undelivered PO balances are commitments, not
 *   payables.
 * - Subcontract / job order: approved billings not yet paid; owed = net payable less payments made.
 */
export type SupplierPayableLike = { amount: number; paidAmount?: number | null; status?: string | null };
export type SubcontractBillingLike = {
  netPayable?: number | null; currentGross?: number | null;
  approvalStatus?: string | null; status?: string | null; paymentStatus?: string | null;
  payments?: Array<{ amountPaid: number }> | null;
};

export function supplierPayableOutstanding(payable: SupplierPayableLike) {
  if (payable.status === 'PAID') return 0;
  if (payable.status === 'ACCRUED') return payable.amount;
  return Math.max(0, payable.amount - (payable.paidAmount || 0));
}

/** Delivered material cost not yet recorded as an expense (paid or accrued payables are already expenses). */
export function supplierCostNotYetExpensed(payable: SupplierPayableLike & { netAmount?: number | null }) {
  if (payable.status === 'PAID' || payable.status === 'ACCRUED') return 0;
  return payable.netAmount && payable.netAmount > 0 ? payable.netAmount : payable.amount;
}

export function isApprovedBilling(billing: SubcontractBillingLike) {
  if (billing.approvalStatus === 'REJECTED') return false;
  return billing.approvalStatus === 'APPROVED' || billing.status === 'APPROVED_FOR_PAYMENT' || billing.status === 'PAID';
}

export function subcontractBillingOutstanding(billing: SubcontractBillingLike) {
  if (!isApprovedBilling(billing) || billing.status === 'PAID' || billing.paymentStatus === 'PAID') return 0;
  const paid = (billing.payments ?? []).reduce((sum, payment) => sum + (payment.amountPaid || 0), 0);
  return Math.max(0, (billing.netPayable || 0) - paid);
}
