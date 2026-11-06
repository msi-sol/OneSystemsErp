import { Prisma } from '@prisma/client';

type ReturnInput = { issuanceId: string; projectId: string; foremanId: string; items: Array<{ issuanceItemId: string; consolidatedBoqItemId: string; returnedQty: number; condition: string }> };

export async function validateMaterialReturnDraft(tx: Prisma.TransactionClient, input: ReturnInput) {
  if (!input || typeof input.issuanceId !== 'string' || !Array.isArray(input.items) || !input.items.length) throw new Error('Select a released issuance and at least one return item.');
  const issuance = await tx.materialIssuance.findUnique({ where: { id: input.issuanceId }, include: { items: true, returns: { where: { status: { in: ['PENDING', 'COMPLETED'] } }, include: { items: true } } } });
  if (!issuance || !['RELEASED', 'COMPLETED'].includes(issuance.status)) throw new Error('Only released materials can be returned.');
  if (input.projectId !== issuance.projectId || input.foremanId !== issuance.foremanId) throw new Error('The return project and requesting personnel must match the original issuance.');
  const seen = new Set<string>();
  for (const item of input.items) {
    const source = issuance.items.find(row => row.id === item?.issuanceItemId && row.consolidatedBoqItemId === item.consolidatedBoqItemId);
    if (!source || seen.has(source.id)) throw new Error('Provide each original issuance item once with its matching material.');
    seen.add(source.id);
    if (!Number.isFinite(item.returnedQty) || item.returnedQty <= 0 || !['GOOD', 'DAMAGED', 'SCRAP'].includes(item.condition)) throw new Error('Return quantities must be positive and have a valid condition.');
    const alreadyReturned = issuance.returns.flatMap(row => row.items).filter(row => row.issuanceItemId === source.id).reduce((sum, row) => sum.plus(row.returnedQty), new Prisma.Decimal(0));
    if (alreadyReturned.plus(item.returnedQty).gt(source.releasedQty)) throw new Error('Return exceeds the released quantity after prior and pending returns.');
  }
}
