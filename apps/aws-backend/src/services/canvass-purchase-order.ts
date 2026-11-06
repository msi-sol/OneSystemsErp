import { Prisma } from '@prisma/client';
import { isFullQuotationCoverage } from '../../../../src/lib/procurement/quotation-validation';
import { createPurchaseOrdersFromMrInTransaction, PurchaseOrderInputError, PurchaseOrderTransitionConflict } from './purchase-order-transitions';

export class CanvassPurchaseOrderError extends Error {
  constructor(message: string, readonly statusCode: number = 409) {
    super(message);
    this.name = 'CanvassPurchaseOrderError';
  }
}

type GenerateCanvassPOResult = { poId: string; alreadyExists: boolean };

export async function generateCanvassPurchaseOrder(
  prisma: any,
  { canvassId, supplierId, userId }: { canvassId: string; supplierId: string; userId: string },
): Promise<GenerateCanvassPOResult> {
  return prisma.$transaction(async (tx: any) => {
    const canvass = await tx.canvassForm.findUnique({
      where: { id: canvassId },
      include: { mr: true, items: { select: { id: true, quantityRequired: true } } },
    });
    if (!canvass) throw new CanvassPurchaseOrderError('Canvass not found.', 404);
    if (!canvass.mrId || !canvass.mr) {
      throw new CanvassPurchaseOrderError('Link this canvass to a material request before generating a purchase order.');
    }

    if (canvass.status === 'COMPLETED') {
      const existingPO = await tx.purchaseOrder.findFirst({
        where: { canvassFormId: canvassId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!existingPO) throw new CanvassPurchaseOrderError('This canvass is completed but has no linked purchase order. Contact an administrator.');
      return { poId: existingPO.id, alreadyExists: true };
    }

    if (canvass.status !== 'APPROVED') {
      throw new CanvassPurchaseOrderError('Only the currently approved canvass recommendation can generate a purchase order.');
    }
    if (canvass.recommendedSupplierId !== supplierId) {
      throw new CanvassPurchaseOrderError('The selected supplier is not the currently approved canvass recommendation.');
    }

    const quotation = await tx.supplierQuotation.findFirst({
      where: { canvassFormId: canvassId, supplierId },
      include: { supplier: true, items: { include: { canvassItem: true } } },
    });
    if (!quotation) throw new CanvassPurchaseOrderError('The approved supplier quotation could not be found.', 404);
    if (!isFullQuotationCoverage(canvass.items, quotation.items)) {
      throw new CanvassPurchaseOrderError('Partial availability — not compared as full fulfillment. A complete-scope quotation is required for this recommendation flow.');
    }

    const claimed = await tx.canvassForm.updateMany({
      where: { id: canvassId, status: 'APPROVED', recommendedSupplierId: supplierId },
      data: { status: 'COMPLETED' },
    });
    if (claimed.count !== 1) {
      throw new CanvassPurchaseOrderError('The approved canvass recommendation changed. Refresh and retry.');
    }

    try {
      const createdPOIds = await createPurchaseOrdersFromMrInTransaction(
        tx,
        canvass.mrId,
        quotation.items
          .filter((item: any) => Number(item.quantityAvailable) > 0)
          .map((item: any) => ({
            supplierId,
            consolidatedBoqItemId: item.canvassItem.consolidatedBoqItemId,
            quantity: item.quantityAvailable,
            unitCost: item.unitCost,
          })),
        { userId, userRole: 'PURCHASING_OFFICER' },
        { status: 'DRAFT', canvassFormId: canvass.id },
      );
      if (createdPOIds.length !== 1) throw new CanvassPurchaseOrderError('Expected one canvass purchase order to be created.');
      return { poId: createdPOIds[0], alreadyExists: false };
    } catch (error) {
      if (error instanceof PurchaseOrderInputError || error instanceof PurchaseOrderTransitionConflict) {
        throw new CanvassPurchaseOrderError(error.message);
      }
      throw error;
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
