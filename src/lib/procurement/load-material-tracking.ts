import type { Prisma } from '@prisma/client';
import { buildMaterialTracking } from './material-tracking';

type Db = Pick<Prisma.TransactionClient, 'materialRequestItem' | 'canvassItem' | 'purchaseOrderItem' | 'deliveryItem' | 'issuanceItem' | 'returnItem'>;

/** Loads every procurement and stock record of a project's master materials and builds their tracking. */
export async function loadMaterialTracking(db: Db, projectId: string, materials: Array<{ id: string; deliveredQty: number; consumedQty: number }>) {
  const ofProject = { consolidatedBoqItem: { projectId } };
  const [requestItems, canvassItems, orderItems, deliveryItems, issuanceItems, returnItems] = await Promise.all([
    db.materialRequestItem.findMany({ where: ofProject, select: { consolidatedBoqItemId: true, quantity: true, approvedQuantity: true, mr: { select: { id: true, mrNumber: true, status: true, purpose: true, createdAt: true } } } }),
    db.canvassItem.findMany({ where: ofProject, select: { consolidatedBoqItemId: true, quantityRequired: true, canvassForm: { select: { id: true, canvassNumber: true, status: true, createdAt: true } } } }),
    db.purchaseOrderItem.findMany({ where: ofProject, select: { consolidatedBoqItemId: true, quantity: true, unitCost: true, po: { select: { id: true, poNumber: true, status: true, createdAt: true, supplier: { select: { name: true } } } } } }),
    db.deliveryItem.findMany({ where: ofProject, select: { consolidatedBoqItemId: true, quantity: true, delivery: { select: { id: true, receiptNumber: true, status: true, date: true, createdAt: true, po: { select: { poNumber: true } } } } } }),
    db.issuanceItem.findMany({ where: ofProject, select: { consolidatedBoqItemId: true, requestedQty: true, releasedQty: true, issuance: { select: { id: true, misNumber: true, status: true, activity: true, releaseDate: true, createdAt: true } } } }),
    db.returnItem.findMany({ where: ofProject, select: { consolidatedBoqItemId: true, returnedQty: true, condition: true, materialReturn: { select: { id: true, mrsNumber: true, status: true, receiveDate: true, createdAt: true } } } }),
  ]);
  return buildMaterialTracking({
    materials,
    requestItems: requestItems.map(item => ({ materialId: item.consolidatedBoqItemId, quantity: item.quantity, approvedQuantity: item.approvedQuantity, request: item.mr })),
    canvassItems: canvassItems.map(item => ({ materialId: item.consolidatedBoqItemId, quantityRequired: item.quantityRequired, canvass: item.canvassForm })),
    orderItems: orderItems.map(item => ({ materialId: item.consolidatedBoqItemId, quantity: item.quantity, unitCost: item.unitCost, order: { ...item.po, supplierName: item.po.supplier?.name ?? null } })),
    deliveryItems: deliveryItems.map(item => ({ materialId: item.consolidatedBoqItemId, quantity: item.quantity, delivery: { ...item.delivery, poNumber: item.delivery.po?.poNumber ?? null } })),
    issuanceItems: issuanceItems.map(item => ({ materialId: item.consolidatedBoqItemId, requestedQty: item.requestedQty, releasedQty: item.releasedQty, issuance: item.issuance })),
    returnItems: returnItems.map(item => ({ materialId: item.consolidatedBoqItemId, returnedQty: item.returnedQty, condition: item.condition, materialReturn: item.materialReturn })),
  });
}
