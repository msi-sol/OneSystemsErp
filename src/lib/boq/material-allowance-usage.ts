import { Prisma } from '@prisma/client';
import { MR_UNRESERVED_STATUSES } from './benchmark-request-allowance';

const COMMITTED = ['APPROVED', 'ISSUED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'COMPLETED'];
type Request = { id: string; status: string; items: { consolidatedBoqItemId: string | null; quantity: number; approvedQuantity: number | null }[]; purchaseOrders: { status: string; items: { consolidatedBoqItemId: string; quantity: number; unitCost: number }[] }[] };

/** MR reservations and PO commitments are separate: never add the PO quantity to its MR again. */
export function materialAllowanceUsage(requests: Request[], materialId: string, quantity: string, amount: string) {
  let reserved = new Prisma.Decimal(0), committed = new Prisma.Decimal(0);
  for (const request of requests) {
    if (!MR_UNRESERVED_STATUSES.includes(request.status)) for (const line of request.items) {
      if (line.consolidatedBoqItemId === materialId) reserved = reserved.plus(String(line.approvedQuantity ?? line.quantity));
    }
    for (const order of request.purchaseOrders.filter(row => COMMITTED.includes(row.status))) for (const line of order.items) {
      if (line.consolidatedBoqItemId === materialId) committed = committed.plus(new Prisma.Decimal(String(line.quantity)).times(String(line.unitCost)));
    }
  }
  return { approvedQuantity: quantity, reservedQuantity: reserved.toString(), remainingQuantity: Prisma.Decimal.max(0, new Prisma.Decimal(quantity).minus(reserved)).toString(),
    approvedBudget: amount, committedCost: committed.toFixed(2), remainingBudget: Prisma.Decimal.max(0, new Prisma.Decimal(amount).minus(committed)).toFixed(2),
    quantityLimitReached: reserved.gte(quantity), costLimitReached: committed.gte(amount), overBudget: committed.gt(amount) };
}

export async function readMaterialAllowanceUsage(tx: Prisma.TransactionClient, projectId: string) {
  const [materials, requests] = await Promise.all([
    tx.consolidatedBOQItem.findMany({ where: { projectId, mappings: { some: { mappingType: 'BENCHMARK_REVIEW', status: 'APPROVED' } } }, select: { id: true, description: true, unit: true, quantity: true, totalCost: true } }),
    tx.materialRequest.findMany({ where: { projectId }, include: { items: true, purchaseOrders: { include: { items: true } } } }),
  ]);
  return materials.map(row => ({ materialId: row.id, description: row.description, unit: row.unit, ...materialAllowanceUsage(requests, row.id, String(row.quantity), String(row.totalCost)) }));
}
