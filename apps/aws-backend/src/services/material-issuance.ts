import { Prisma } from '@prisma/client';

type StockStore = Pick<Prisma.TransactionClient, 'consolidatedBOQItem'>;
type DraftInput = { projectId: string; foremanId: string; activity: string; items: Array<{ consolidatedBoqItemId: string; requestedQty: number }> };

export async function validateIssuanceDraft(tx: StockStore, input: DraftInput) {
  if (!input || typeof input.projectId !== 'string' || !input.projectId || typeof input.foremanId !== 'string' || !input.foremanId || typeof input.activity !== 'string' || !input.activity.trim()) {
    throw new Error('Select a project, requesting personnel, and activity.');
  }
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 500) throw new Error('Select at least one material.');
  const ids = new Set<string>();
  for (const item of input.items) {
    if (!item || typeof item.consolidatedBoqItemId !== 'string' || !item.consolidatedBoqItemId || !Number.isFinite(item.requestedQty) || item.requestedQty <= 0) throw new Error('Every material needs a positive finite quantity.');
    if (ids.has(item.consolidatedBoqItemId)) throw new Error('A material can appear only once in an issuance slip.');
    ids.add(item.consolidatedBoqItemId);
  }
  const materials = await tx.consolidatedBOQItem.findMany({ where: { projectId: input.projectId, id: { in: [...ids] } }, select: { id: true, description: true, deliveredQty: true, consumedQty: true } });
  if (materials.length !== ids.size) throw new Error('Every issuance material must belong to the selected project.');
  for (const item of input.items) {
    const material = materials.find(row => row.id === item.consolidatedBoqItemId)!;
    if (new Prisma.Decimal(item.requestedQty).gt(new Prisma.Decimal(material.deliveredQty).minus(material.consumedQty))) throw new Error(`Not enough project stock for ${material.description}.`);
  }
}

export async function prepareIssuance(tx: Prisma.TransactionClient, issuanceId: string, warehousemanId: string, inputs: Array<{ id: string; releasedQty: number }>) {
  if (typeof warehousemanId !== 'string' || !warehousemanId) throw new Error('Select the personnel preparing the issuance.');
  const slip = await tx.materialIssuance.findUnique({ where: { id: issuanceId }, include: { items: { include: { consolidatedBoqItem: true } } } });
  if (!slip || slip.status !== 'PENDING') throw new Error('Only a pending issuance can be prepared.');
  if (!Array.isArray(inputs) || inputs.length !== slip.items.length || new Set(inputs.map(item => item?.id)).size !== inputs.length) throw new Error('Provide each item from this issuance exactly once.');
  const totals = new Map<string, Prisma.Decimal>();
  for (const input of inputs) {
    const item = slip.items.find(row => row.id === input?.id);
    if (!item || item.consolidatedBoqItem.projectId !== slip.projectId) throw new Error('An item does not belong to this issuance and project.');
    if (!Number.isFinite(input.releasedQty) || input.releasedQty <= 0 || input.releasedQty > item.requestedQty) throw new Error('Prepared quantity must be positive and cannot exceed the requested quantity.');
    const quantity = (totals.get(item.consolidatedBoqItemId) || new Prisma.Decimal(0)).plus(input.releasedQty);
    totals.set(item.consolidatedBoqItemId, quantity);
    if (quantity.gt(new Prisma.Decimal(item.consolidatedBoqItem.deliveredQty).minus(item.consolidatedBoqItem.consumedQty))) throw new Error(`Not enough project stock for ${item.consolidatedBoqItem.description}.`);
  }
  for (const input of inputs) {
    await tx.issuanceItem.update({ where: { id: input.id }, data: { releasedQty: input.releasedQty } });
  }
  const result = await tx.materialIssuance.updateMany({ where: { id: issuanceId, status: 'PENDING' }, data: { status: 'PROCESSED', warehousemanId } });
  if (result.count !== 1) throw new Error('Issuance changed while preparing materials. Refresh and try again.');
}
