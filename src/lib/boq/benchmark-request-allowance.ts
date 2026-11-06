import { Prisma } from '@prisma/client';
import { projectGeneratedPackageAllowance } from './benchmark-allowance';

export const MR_UNRESERVED_STATUSES = ['DRAFT', 'AI_CHECKING', 'CANCELLED', 'REJECTED'];
const COMMITTED_PO_STATUSES = ['APPROVED', 'ISSUED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'COMPLETED'];
const REVIEW_ACTION = 'PROCUREMENT_BENCHMARK_REVIEW_STATE';
const LINK_ACTION = 'WPS_PROCUREMENT_RECORD_LINKED';

export function assertMaterialRequestTransition(from: string, to: string) {
  const sources: Record<string, string[]> = {
    SUBMITTED: ['AI_CHECKING', 'RETURNED'], FOR_REVIEW: ['SUBMITTED'],
    APPROVED: ['FOR_REVIEW'], REJECTED: ['FOR_REVIEW'], RETURNED: ['SUBMITTED', 'FOR_REVIEW'],
    CANCELLED: ['DRAFT', 'AI_CHECKING', 'SUBMITTED', 'FOR_REVIEW', 'RETURNED', 'APPROVED'],
  };
  if (!sources[to]?.includes(from)) throw new Error('The request status changed or this transition is not supported. Refresh before continuing.');
}

type RequestLine = { consolidatedBoqItemId: string | null; quantity: number; approvedQuantity: number | null };
export function requestAllowanceQuantities(lines: RequestLine[]) {
  const quantities = new Map<string, Prisma.Decimal>();
  for (const line of lines) {
    const value = line.approvedQuantity ?? line.quantity;
    if (!line.consolidatedBoqItemId || !Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) throw new Error('Every material request line needs a project material and a positive finite quantity.');
    quantities.set(line.consolidatedBoqItemId, (quantities.get(line.consolidatedBoqItemId) || new Prisma.Decimal(0)).plus(String(value)));
  }
  return quantities;
}

/** Must run inside the same serializable transaction as the MR status change. */
export async function assertMaterialRequestAllowance(tx: Prisma.TransactionClient, projectId: string, requestId: string, targetStatus: string) {
  const saved = await tx.auditLog.findFirst({ where: { moduleName: 'PROJECT_MANAGEMENT', transactionId: projectId, actionType: REVIEW_ACTION }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { newValue: true } });
  if (!saved) return;
  const review = JSON.parse(saved.newValue || 'null') as { id: string; projectId: string; status: string; materialIds?: string[]; benchmarkIds?: Record<string, string> } | null;
  if (!review || review.projectId !== projectId) throw new Error('Invalid benchmark review association.');
  if (review.status !== 'GENERATED') return;
  const requests = await tx.materialRequest.findMany({ where: { projectId }, include: { items: true, purchaseOrders: { select: { status: true } } } });
  const request = requests.find(row => row.id === requestId);
  if (!request) throw new Error('Material request not found in this project.');
  if (['CANCELLED', 'REJECTED'].includes(targetStatus)) {
    if (request.purchaseOrders.some(order => COMMITTED_PO_STATUSES.includes(order.status))) throw new Error('This request has an approved purchase commitment. Resolve or cancel that commitment before releasing its allowance.');
    return;
  }
  if (MR_UNRESERVED_STATUSES.includes(targetStatus)) return;
  if (!request.items.length) throw new Error('A submitted request needs at least one material line.');
  const proposed = requestAllowanceQuantities(request.items);
  if ([...proposed.keys()].some(id => !review.materialIds?.includes(id))) throw new Error('A requested material is outside the approved benchmark. Review an approved benchmark revision before requesting extra materials.');
  const materialRows = await tx.consolidatedBOQItem.findMany({ where: { projectId, id: { in: [...proposed.keys()] } }, select: { id: true } });
  if (materialRows.length !== proposed.size) throw new Error('Every requested material must belong to the intended project.');
  const activeRequests = requests.filter(row => row.id !== requestId && !MR_UNRESERVED_STATUSES.includes(row.status));
  const relevant = [request, ...activeRequests.filter(row => row.items.some(item => item.consolidatedBoqItemId && proposed.has(item.consolidatedBoqItemId)))];
  const linkEvents = await tx.auditLog.findMany({ where: { moduleName: 'PROJECT_SCHEDULING', actionType: LINK_ACTION, transactionId: { in: relevant.map(row => row.id) } }, select: { transactionId: true, newValue: true } });
  const packages = new Map<string, string>();
  for (const row of relevant) {
    const matches = linkEvents.filter(event => event.transactionId === row.id).map(event => JSON.parse(event.newValue || '{}')).filter(link => link.projectId === projectId && link.recordType === 'REQUEST' && link.recordId === row.id && typeof link.sourcePackageId === 'string' && link.sourcePackageId);
    if (matches.length !== 1) throw new Error(`Link draft/request ${row.id} to one intended Work Package before submitting. Existing active requests against these materials must also have an explicit package link.`);
    packages.set(row.id, matches[0].sourcePackageId);
  }
  const sourcePackageId = packages.get(requestId)!;
  const mappings = await tx.bOQMapping.findMany({ where: { mappingType: 'BENCHMARK_REVIEW', status: 'APPROVED', consolidatedBoqItemId: { in: [...proposed.keys()] } }, select: { consolidatedBoqItemId: true, procurementBenchmarkItemId: true, allocationQuantity: true, remarks: true, procurementBenchmarkItem: { select: { projectId: true } } } });
  const reserved = new Map<string, Prisma.Decimal>(), reservedInPackage = new Map<string, Prisma.Decimal>();
  for (const row of relevant.filter(row => row.id !== requestId)) {
    const quantities = requestAllowanceQuantities(row.items);
    for (const [materialId, quantity] of quantities) {
      reserved.set(materialId, (reserved.get(materialId) || new Prisma.Decimal(0)).plus(quantity));
      if (packages.get(row.id) === sourcePackageId) reservedInPackage.set(materialId, (reservedInPackage.get(materialId) || new Prisma.Decimal(0)).plus(quantity));
    }
  }
  for (const [materialId, quantity] of proposed) {
    const materialMappings = mappings.filter(row => row.consolidatedBoqItemId === materialId);
    const packageLimit = projectGeneratedPackageAllowance({ review, projectId, materialId, sourcePackageId, mappings: materialMappings });
    if (packageLimit === null) throw new Error('Approved package material allowance is unavailable.');
    const projectLimit = materialMappings.reduce((total, mapping) => JSON.parse(mapping.remarks || '{}').benchmarkReviewId === review.id ? total.plus(String(mapping.allocationQuantity)) : total, new Prisma.Decimal(0));
    const packageReserved = reservedInPackage.get(materialId) || new Prisma.Decimal(0), projectReserved = reserved.get(materialId) || new Prisma.Decimal(0);
    if (quantity.plus(packageReserved).gt(packageLimit)) throw new Error(`Request exceeds the approved package material quantity. Available: ${Prisma.Decimal.max(0, packageLimit.minus(packageReserved)).toString()}; requested: ${quantity.toString()}.`);
    if (quantity.plus(projectReserved).gt(projectLimit)) throw new Error(`Request exceeds the approved project material quantity. Available: ${Prisma.Decimal.max(0, projectLimit.minus(projectReserved)).toString()}.`);
  }
}
