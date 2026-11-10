import { isApprovedBilling, type SubcontractBillingLike } from '@/lib/finance/payables';

/**
 * Gross amount billed by subcontractors: approved billings only (approved, approved for payment or paid), using the
 * billing's gross for that period so the progressive totals are not double counted. Drafts, submissions under
 * review and rejected billings are not billed yet.
 */
export function billedAmount(billings: SubcontractBillingLike[] | null | undefined) {
  return (billings ?? []).filter(isApprovedBilling).reduce((sum, billing) => sum + (Number(billing.currentGross) || 0), 0);
}
