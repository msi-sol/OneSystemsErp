import Decimal from 'decimal.js';

type ReleaseItem = { id: string; consolidatedBoqItemId: string; releasedQty: number; consolidatedBoqItem: { category?: string | null; description: string; unit: string } };
type ReturnItem = { issuanceItemId: string; returnedQty: number };
type ReturnableIssuance = { items: ReleaseItem[]; returns?: Array<{ status: string; items?: ReturnItem[] }> };

export function returnableMaterials(issuance: ReturnableIssuance) {
  const reserved = new Map<string, Decimal>();
  for (const receipt of issuance.returns || []) {
    if (!['PENDING', 'COMPLETED'].includes(receipt.status)) continue;
    for (const item of receipt.items || []) reserved.set(item.issuanceItemId, (reserved.get(item.issuanceItemId) || new Decimal(0)).plus(item.returnedQty));
  }
  return issuance.items.flatMap(item => {
    const maxQty = Decimal.max(0, new Decimal(item.releasedQty).minus(reserved.get(item.id) || 0)).toNumber();
    return maxQty > 0 ? [{ issuanceItemId: item.id, consolidatedBoqItemId: item.consolidatedBoqItemId,
      category: item.consolidatedBoqItem.category || 'N/A', description: item.consolidatedBoqItem.description,
      unit: item.consolidatedBoqItem.unit, maxQty, returnedQty: 0, condition: 'GOOD' }] : [];
  });
}

