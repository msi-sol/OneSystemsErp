import { Prisma } from '@prisma/client';
import { approveTransaction, submitTransaction } from '../lib/workflow';
import { assertMaterialRequestAllowance } from '../../../../src/lib/boq/benchmark-request-allowance';

type Transaction = Prisma.TransactionClient;
type Actor = { userId: string; userRole: string; simulatedRole?: string };
type PurchaseOrderCreationOptions = { status?: 'DRAFT' | 'FOR_REVIEW'; canvassFormId?: string };

export class PurchaseOrderTransitionConflict extends Error {}
export class PurchaseOrderSelfApprovalError extends Error {}
export class PurchaseOrderInputError extends Error {}

type CreatePurchaseOrderLine = { supplierId: unknown; consolidatedBoqItemId: unknown; quantity: unknown; unitCost: unknown };

function positiveDecimal(value: unknown, message: string) {
  let result: Prisma.Decimal;
  try { result = new Prisma.Decimal(typeof value === 'number' ? value : String(value)); }
  catch { throw new PurchaseOrderInputError(message); }
  if (!result.isFinite() || result.lte(0)) throw new PurchaseOrderInputError(message);
  return result;
}

function nonnegativeDecimal(value: unknown, message: string) {
  let result: Prisma.Decimal;
  try { result = new Prisma.Decimal(typeof value === 'number' ? value : String(value)); }
  catch { throw new PurchaseOrderInputError(message); }
  if (!result.isFinite() || result.lt(0)) throw new PurchaseOrderInputError(message);
  return result;
}

/** Creates a supplier-split PO batch while reserving approved MRF quantities atomically. */
export async function createPurchaseOrdersFromMrInTransaction(
  tx: Transaction,
  mrId: string,
  lines: CreatePurchaseOrderLine[],
  actor: Actor,
  options: PurchaseOrderCreationOptions = {},
) {
  if (!Array.isArray(lines) || !lines.length) throw new PurchaseOrderInputError('Select at least one MRF material line to procure.');
  const request = await tx.materialRequest.findUnique({
    where: { id: mrId },
    include: { items: { include: { consolidatedBoqItem: { select: { projectId: true } } } } },
  });
  if (!request || !['APPROVED', 'PARTIALLY_PROCURED', 'FULLY_PROCURED'].includes(request.status)) {
    throw new PurchaseOrderTransitionConflict('Only an approved MRF with a remaining quantity balance can receive another PO.');
  }
  if (!request.items.length) throw new PurchaseOrderTransitionConflict('The approved MRF has no material lines.');

  const approvedByMaterial = new Map<string, Prisma.Decimal>();
  for (const item of request.items) {
    const materialId = item.consolidatedBoqItemId;
    if (!materialId || item.consolidatedBoqItem.projectId !== request.projectId) {
      throw new PurchaseOrderTransitionConflict('Every approved MRF line must reference a material in its project.');
    }
    const quantity = positiveDecimal(item.approvedQuantity ?? item.quantity, 'Every approved MRF line must have a positive finite quantity.');
    approvedByMaterial.set(materialId, (approvedByMaterial.get(materialId) || new Prisma.Decimal(0)).plus(quantity));
  }

  const prepared = lines.map(line => {
    if (typeof line.supplierId !== 'string' || !line.supplierId || typeof line.consolidatedBoqItemId !== 'string' || !line.consolidatedBoqItemId) {
      throw new PurchaseOrderInputError('Each PO line needs a supplier and material from the selected MRF.');
    }
    const quantity = positiveDecimal(line.quantity, 'PO quantities must be positive finite numbers.');
    const unitCost = nonnegativeDecimal(line.unitCost, 'PO rates must be nonnegative finite numbers.');
    const amount = quantity.times(unitCost);
    if (!amount.isFinite() || amount.gt(Number.MAX_SAFE_INTEGER)) throw new PurchaseOrderInputError('A PO line amount exceeds the supported numeric range.');
    if (!approvedByMaterial.has(line.consolidatedBoqItemId)) throw new PurchaseOrderInputError('Every PO material must appear on the selected MRF.');
    return { supplierId: line.supplierId, consolidatedBoqItemId: line.consolidatedBoqItemId, quantity, unitCost, amount };
  });

  const supplierIds = [...new Set(prepared.map(line => line.supplierId))];
  const suppliers = await tx.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, isVatable: true, name: true } });
  const supplierById = new Map(suppliers.map(supplier => [supplier.id, supplier]));
  if (supplierById.size !== supplierIds.length) throw new PurchaseOrderInputError('One or more selected suppliers could not be found.');

  const requestedByMaterial = new Map<string, Prisma.Decimal>();
  for (const line of prepared) {
    requestedByMaterial.set(line.consolidatedBoqItemId,
      (requestedByMaterial.get(line.consolidatedBoqItemId) || new Prisma.Decimal(0)).plus(line.quantity));
  }

  const existingOrders = await tx.purchaseOrder.findMany({
    where: { mrId, status: { notIn: ['CANCELLED', 'CANCELED', 'REJECTED', 'RETURNED', 'VOIDED'] } },
    include: { items: { select: { consolidatedBoqItemId: true, quantity: true } } },
  });
  const alreadyOrdered = new Map<string, Prisma.Decimal>();
  for (const order of existingOrders) {
    for (const item of order.items) {
      const quantity = positiveDecimal(item.quantity, 'An existing PO line has an invalid quantity; resolve it before creating another PO.');
      alreadyOrdered.set(item.consolidatedBoqItemId,
        (alreadyOrdered.get(item.consolidatedBoqItemId) || new Prisma.Decimal(0)).plus(quantity));
    }
  }
  for (const [materialId, requested] of requestedByMaterial) {
    const approved = approvedByMaterial.get(materialId)!;
    const ordered = alreadyOrdered.get(materialId) || new Prisma.Decimal(0);
    if (ordered.plus(requested).gt(approved)) {
      throw new PurchaseOrderTransitionConflict(`PO quantity for material ${materialId} exceeds the approved MRF balance of ${Prisma.Decimal.max(0, approved.minus(ordered)).toString()}.`);
    }
  }

  const activeMaterialIds = new Set([...approvedByMaterial.keys()]);
  const fullyCovered = [...activeMaterialIds].every(materialId =>
    (alreadyOrdered.get(materialId) || new Prisma.Decimal(0)).plus(requestedByMaterial.get(materialId) || new Prisma.Decimal(0)).gte(approvedByMaterial.get(materialId)!));

  const prefix = `PO-${new Date().getFullYear()}-`;
  const lastPO = await tx.purchaseOrder.findFirst({ where: { poNumber: { startsWith: prefix } }, orderBy: { poNumber: 'desc' }, select: { poNumber: true } });
  let count = 0;
  if (lastPO?.poNumber) {
    const lastInt = parseInt(lastPO.poNumber.substring(prefix.length), 10);
    if (!isNaN(lastInt)) count = lastInt;
  }

  const supplierGroups = new Map<string, typeof prepared>();
  for (const line of prepared) supplierGroups.set(line.supplierId, [...supplierGroups.get(line.supplierId) || [], line]);
  const createdPOIds: string[] = [];
  for (const [supplierId, supplierItems] of supplierGroups) {
    const supplier = supplierById.get(supplierId)!;
    const totalAmount = supplierItems.reduce((sum, item) => sum + item.amount.toNumber(), 0);
    if (!Number.isFinite(totalAmount) || totalAmount > Number.MAX_SAFE_INTEGER) throw new PurchaseOrderInputError('The PO total is outside the supported numeric range.');
    let netAmount = totalAmount, vatAmount = 0;
    if (supplier.isVatable) { netAmount = totalAmount / 1.12; vatAmount = totalAmount - netAmount; }

    count++;
    const poNumber = `${prefix}${String(count).padStart(4, '0')}`;
    const po = await tx.purchaseOrder.create({
      data: {
        poNumber, status: options.status || 'FOR_REVIEW', supplierId, mrId, preparerId: actor.userId,
        ...(options.canvassFormId ? { canvassFormId: options.canvassFormId } : {}),
        totalAmount, netAmount, vatAmount,
        items: { create: supplierItems.map(item => ({
          quantity: item.quantity.toNumber(), unitCost: item.unitCost.toNumber(), consolidatedBoqItemId: item.consolidatedBoqItemId,
        })) },
      },
    });
    if ((options.status || 'FOR_REVIEW') !== 'DRAFT') {
      await submitTransaction(actor.userId, actor.userRole, 'PURCHASE_ORDER', po.id, actor.simulatedRole, tx);
    }
    createdPOIds.push(po.id);
  }

  const changed = await tx.materialRequest.updateMany({
    where: { id: mrId, status: request.status },
    data: { status: fullyCovered ? 'FULLY_PROCURED' : 'PARTIALLY_PROCURED' },
  });
  if (changed.count !== 1) throw new PurchaseOrderTransitionConflict('The MRF changed while POs were being created. Refresh and retry.');
  return createdPOIds;
}

export async function approvePurchaseOrderInTransaction(tx: Transaction, poId: string, actor: Actor) {
  const po = await tx.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      items: { include: { consolidatedBoqItem: { select: { projectId: true } } } },
      mr: { select: { projectId: true, status: true, items: { select: { consolidatedBoqItemId: true, quantity: true, approvedQuantity: true } } } },
      supplier: { select: { name: true } },
    },
  });
  if (!po || po.status !== 'FOR_REVIEW') {
    throw new PurchaseOrderTransitionConflict('Only a PO awaiting review can be approved. Refresh to see its current status.');
  }
  if (['CANCELLED', 'REJECTED'].includes(po.mr.status)) {
    throw new PurchaseOrderTransitionConflict('The linked MRF was cancelled or rejected. This PO cannot be approved.');
  }
  if (!['APPROVED', 'PARTIALLY_PROCURED', 'FULLY_PROCURED'].includes(po.mr.status)) throw new PurchaseOrderTransitionConflict('Approve the material request before approving its purchase order.');
  if (po.preparerId === actor.userId && actor.userRole !== 'SUPER_ADMIN' && actor.userRole !== 'ADMIN') {
    throw new PurchaseOrderSelfApprovalError('Self-approval blocked by Workflow Engine.');
  }
  if (!po.items.length) throw new PurchaseOrderTransitionConflict('A purchase order must contain at least one material line.');

  const lineAmounts = po.items.map(item => {
    const quantity = Number(item.quantity), unitCost = Number(item.unitCost), amount = quantity * unitCost;
    if (item.consolidatedBoqItem.projectId !== po.mr.projectId ||
        !Number.isFinite(quantity) || quantity <= 0 ||
        !Number.isFinite(unitCost) || unitCost < 0 || !Number.isFinite(amount)) {
      throw new PurchaseOrderTransitionConflict('Every PO line must reference a material in the MRF project and have a positive finite quantity and nonnegative finite rate.');
    }
    return { item, amount };
  });

  const approvedByMaterial = new Map<string, Prisma.Decimal>();
  for (const item of po.mr.items) {
    if (!item.consolidatedBoqItemId) throw new PurchaseOrderTransitionConflict('The approved request contains an invalid material reference.');
    approvedByMaterial.set(item.consolidatedBoqItemId, (approvedByMaterial.get(item.consolidatedBoqItemId) || new Prisma.Decimal(0)).plus(positiveDecimal(item.approvedQuantity ?? item.quantity, 'The approved request contains an invalid quantity.')));
  }
  const otherOrders = await tx.purchaseOrder.findMany({ where: { mrId: po.mrId, id: { not: poId }, status: { notIn: ['CANCELLED', 'CANCELED', 'REJECTED', 'RETURNED', 'VOIDED'] } }, select: { items: { select: { consolidatedBoqItemId: true, quantity: true } } } });
  const ordered = new Map<string, Prisma.Decimal>();
  for (const item of [...po.items, ...otherOrders.flatMap(order => order.items)]) {
    ordered.set(item.consolidatedBoqItemId, (ordered.get(item.consolidatedBoqItemId) || new Prisma.Decimal(0)).plus(positiveDecimal(item.quantity, 'A linked PO has an invalid quantity.')));
  }
  for (const [materialId, quantity] of ordered) {
    if (!approvedByMaterial.has(materialId) || quantity.gt(approvedByMaterial.get(materialId)!)) throw new PurchaseOrderTransitionConflict('Combined PO quantities exceed the approved material request. Correct or cancel overlapping orders before approval.');
  }
  await assertMaterialRequestAllowance(tx, po.mr.projectId, po.mrId, po.mr.status);

  const claimed = await tx.purchaseOrder.updateMany({
    where: { id: poId, status: 'FOR_REVIEW' },
    data: { status: 'APPROVED', approverId: actor.userId },
  });
  if (claimed.count !== 1) throw new PurchaseOrderTransitionConflict('Another user changed this PO. Refresh before retrying.');

  for (const { item, amount } of lineAmounts) {
    await tx.commitmentLedger.create({
      data: {
        projectId: po.mr.projectId,
        consolidatedBoqItemId: item.consolidatedBoqItemId,
        commitmentType: 'PURCHASE_ORDER',
        supplierName: po.supplier?.name || '',
        approvedAmount: amount,
        remainingCommitment: amount,
        status: 'ACTIVE',
      },
    });
    await tx.consolidatedBOQItem.update({
      where: { id: item.consolidatedBoqItemId },
      data: { committedCost: { increment: amount } },
    });
  }

  await approveTransaction(actor.userId, actor.userRole, 'PURCHASE_ORDER', poId, 'Approved PO digitally', actor.simulatedRole, tx);
}

const INACTIVE_PO_STATUSES = ['CANCELLED', 'CANCELED', 'REJECTED', 'RETURNED', 'VOIDED'];

/**
 * "Return for further canvassing" (meeting minutes, PO step): a canvass PO that is still a draft or under review
 * is set aside (RETURNED, which every quantity check already ignores), its canvass reopens as RETURNED so
 * quotations can be added or corrected and a new recommendation endorsed, and the request's procured status is
 * recomputed from its remaining active orders. Approved POs carry budget commitments and cannot be returned here.
 */
export async function returnPurchaseOrderToCanvassingInTransaction(tx: Transaction, poId: string, actor: Actor, reason: string) {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (trimmed.length < 5 || trimmed.length > 500) throw new PurchaseOrderInputError('Give a reason of 5 to 500 characters for returning this order to canvassing.');
  const po = await tx.purchaseOrder.findUnique({ where: { id: poId }, select: { id: true, status: true, canvassFormId: true, mrId: true } });
  if (!po) throw new PurchaseOrderTransitionConflict('Purchase order not found.');
  if (!po.canvassFormId) throw new PurchaseOrderTransitionConflict('Only a purchase order created from a canvass can be returned to canvassing.');
  if (!['DRAFT', 'FOR_REVIEW'].includes(po.status)) {
    throw new PurchaseOrderTransitionConflict('Only a draft or under-review purchase order can be returned to canvassing. Approved orders already carry budget commitments.');
  }

  const claimed = await tx.purchaseOrder.updateMany({ where: { id: poId, status: po.status }, data: { status: 'RETURNED' } });
  if (claimed.count !== 1) throw new PurchaseOrderTransitionConflict('Another user changed this PO. Refresh before retrying.');
  await tx.transactionWorkflow.updateMany({ where: { moduleName: 'PURCHASE_ORDER', transactionId: poId }, data: { currentStatus: 'RETURNED', remarks: trimmed } });

  const reopened = await tx.canvassForm.updateMany({
    where: { id: po.canvassFormId, status: 'COMPLETED' },
    data: { status: 'RETURNED', aiSummary: null, recommendedSupplierId: null },
  });
  if (reopened.count !== 1) throw new PurchaseOrderTransitionConflict('The linked canvass is not in its completed state. Refresh before retrying.');
  await tx.supplierQuotation.updateMany({ where: { canvassFormId: po.canvassFormId }, data: { isRecommended: false, aiRank: null, aiRationale: null } });

  const request = await tx.materialRequest.findUnique({ where: { id: po.mrId }, select: { status: true, items: { select: { consolidatedBoqItemId: true, quantity: true, approvedQuantity: true } } } });
  if (request && ['APPROVED', 'PARTIALLY_PROCURED', 'FULLY_PROCURED'].includes(request.status)) {
    const approved = new Map<string, Prisma.Decimal>();
    for (const item of request.items) if (item.consolidatedBoqItemId) approved.set(item.consolidatedBoqItemId, (approved.get(item.consolidatedBoqItemId) || new Prisma.Decimal(0)).plus(String(item.approvedQuantity ?? item.quantity)));
    const active = await tx.purchaseOrder.findMany({ where: { mrId: po.mrId, status: { notIn: INACTIVE_PO_STATUSES } }, select: { items: { select: { consolidatedBoqItemId: true, quantity: true } } } });
    const ordered = new Map<string, Prisma.Decimal>();
    for (const item of active.flatMap(order => order.items)) ordered.set(item.consolidatedBoqItemId, (ordered.get(item.consolidatedBoqItemId) || new Prisma.Decimal(0)).plus(String(item.quantity)));
    const status = ordered.size === 0 ? 'APPROVED'
      : [...approved].every(([materialId, quantity]) => (ordered.get(materialId) || new Prisma.Decimal(0)).gte(quantity)) ? 'FULLY_PROCURED' : 'PARTIALLY_PROCURED';
    if (status !== request.status) await tx.materialRequest.updateMany({ where: { id: po.mrId, status: request.status }, data: { status } });
  }

  await tx.auditLog.create({ data: { userId: actor.userId, userRole: actor.userRole, moduleName: 'PURCHASE_ORDER', transactionId: poId, actionType: 'RETURN_TO_CANVASSING', oldValue: po.status, newValue: 'RETURNED', remarks: trimmed } });
  return { poId, canvassFormId: po.canvassFormId };
}

export async function submitPurchaseOrderInTransaction(tx: Transaction, poId: string, actor: Actor) {
  const po = await tx.purchaseOrder.findUnique({ where: { id: poId }, select: { id: true, status: true, mr: { select: { status: true } } } });
  if (!po || po.status !== 'DRAFT') {
    throw new PurchaseOrderTransitionConflict('Only a draft PO can be submitted for review. Refresh to see its current status.');
  }
  if (['CANCELLED', 'REJECTED'].includes(po.mr.status)) {
    throw new PurchaseOrderTransitionConflict('The linked MRF was cancelled or rejected. This PO cannot be submitted.');
  }
  const claimed = await tx.purchaseOrder.updateMany({
    where: { id: poId, status: 'DRAFT' },
    data: { status: 'FOR_REVIEW' },
  });
  if (claimed.count !== 1) throw new PurchaseOrderTransitionConflict('Another user changed this PO. Refresh before retrying.');

  await submitTransaction(actor.userId, actor.userRole, 'PURCHASE_ORDER', poId, actor.simulatedRole, tx);
}
