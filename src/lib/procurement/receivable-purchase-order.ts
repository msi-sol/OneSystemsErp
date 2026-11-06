/** Orders may receive staggered deliveries only after purchasing approval. */
export const RECEIVABLE_PO_STATUSES = ['APPROVED', 'ISSUED', 'PARTIALLY_DELIVERED'] as const;

export function canReceivePurchaseOrder(status: string): boolean {
  return (RECEIVABLE_PO_STATUSES as readonly string[]).includes(status);
}
