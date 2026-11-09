/**
 * Procurement tracking for each master material: how much is requested, ordered, delivered, issued and on hand,
 * which stage it has reached, and the movement history (requests, canvass, POs, deliveries, issuances, returns).
 * Pure: the caller loads the records.
 *
 * Quantities count only records that are in effect: drafts, rejected and cancelled documents appear in the history
 * but not in the totals. Delivered, issued and on hand use the material's stock counters (the same figures material
 * issuance checks), so on hand = delivered − issued (net of materials returned to stock).
 */
export type TrackingStage = 'NOT_REQUESTED' | 'REQUESTED' | 'ORDERED' | 'PARTLY_DELIVERED' | 'IN_STOCK' | 'IN_USE' | 'ISSUED';
export type TrackingEvent = {
  kind: 'REQUEST' | 'CANVASS' | 'ORDER' | 'DELIVERY' | 'ISSUANCE' | 'RETURN';
  date: string;
  document: string;
  href: string | null;
  quantity: number;
  status: string;
  detail: string;
  counted: boolean;
};
export type MaterialTracking = {
  requested: number; ordered: number; delivered: number; issued: number; onHand: number;
  stage: TrackingStage; awaiting: number; events: TrackingEvent[];
};

type Doc = { id: string; status: string; createdAt: Date | string };
export type TrackingInput = {
  materials: Array<{ id: string; deliveredQty: number; consumedQty: number }>;
  requestItems: Array<{ materialId: string; quantity: number; approvedQuantity: number | null; request: Doc & { mrNumber: string; purpose: string | null } }>;
  canvassItems: Array<{ materialId: string; quantityRequired: number; canvass: Doc & { canvassNumber: string } }>;
  orderItems: Array<{ materialId: string; quantity: number; unitCost: number; order: Doc & { poNumber: string; supplierName: string | null } }>;
  deliveryItems: Array<{ materialId: string; quantity: number; delivery: Doc & { receiptNumber: string | null; date: Date | string; poNumber: string | null } }>;
  issuanceItems: Array<{ materialId: string; requestedQty: number; releasedQty: number; issuance: Doc & { misNumber: string; activity: string; releaseDate: Date | string | null } }>;
  returnItems: Array<{ materialId: string; returnedQty: number; condition: string; materialReturn: Doc & { mrsNumber: string; receiveDate: Date | string | null } }>;
};

const INACTIVE = new Set(['DRAFT', 'REJECTED', 'CANCELLED', 'CANCELED', 'VOIDED', 'RETURNED']);
const NOT_YET_ORDERED = new Set(['DRAFT', 'FOR_REVIEW', 'REJECTED', 'CANCELLED', 'CANCELED', 'VOIDED', 'RETURNED']);
const DELIVERED = new Set(['APPROVED', 'COMPLETED']);
const RELEASED = new Set(['RELEASED', 'COMPLETED']);
/** Documents still waiting for someone (so the row can say "1 awaiting action"). */
const AWAITING = new Set(['PENDING', 'FOR_REVIEW', 'FOR_APPROVAL', 'SUBMITTED', 'FOR_ACCOUNTANT_APPROVAL', 'FOR_VERIFICATION', 'ENDORSED']);

const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : new Date(0).toISOString());
const words = (status: string) => status.toLowerCase().replace(/_/g, ' ');
const fmt = (value: number) => Number(value.toFixed(4));

export function buildMaterialTracking(input: TrackingInput): Record<string, MaterialTracking> {
  const result: Record<string, MaterialTracking> = {};
  for (const material of input.materials) {
    const delivered = Math.max(0, material.deliveredQty);
    const issued = Math.max(0, material.consumedQty);
    result[material.id] = { requested: 0, ordered: 0, delivered: fmt(delivered), issued: fmt(issued), onHand: fmt(Math.max(0, delivered - issued)), stage: 'NOT_REQUESTED', awaiting: 0, events: [] };
  }
  const add = (materialId: string, event: TrackingEvent, docStatus: string) => {
    const row = result[materialId];
    if (!row) return;
    row.events.push(event);
    if (AWAITING.has(docStatus)) row.awaiting += 1;
  };

  for (const item of input.requestItems) {
    const counted = !INACTIVE.has(item.request.status);
    const quantity = item.approvedQuantity ?? item.quantity;
    if (counted && result[item.materialId]) result[item.materialId].requested += quantity;
    add(item.materialId, { kind: 'REQUEST', date: iso(item.request.createdAt), document: item.request.mrNumber, href: `/material-requests/${item.request.id}`, quantity, status: words(item.request.status), detail: item.request.purpose || 'Material request', counted }, item.request.status);
  }
  for (const item of input.canvassItems) {
    add(item.materialId, { kind: 'CANVASS', date: iso(item.canvass.createdAt), document: item.canvass.canvassNumber, href: `/procurement/canvassing/${item.canvass.id}`, quantity: item.quantityRequired, status: words(item.canvass.status), detail: 'Supplier quotations compared', counted: false }, item.canvass.status);
  }
  for (const item of input.orderItems) {
    const counted = !NOT_YET_ORDERED.has(item.order.status);
    if (counted && result[item.materialId]) result[item.materialId].ordered += item.quantity;
    add(item.materialId, { kind: 'ORDER', date: iso(item.order.createdAt), document: item.order.poNumber, href: `/procurement/purchase-orders/${item.order.id}`, quantity: item.quantity, status: words(item.order.status), detail: `${item.order.supplierName || 'Supplier'} · ₱${item.unitCost.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} each`, counted }, item.order.status);
  }
  for (const item of input.deliveryItems) {
    add(item.materialId, { kind: 'DELIVERY', date: iso(item.delivery.date || item.delivery.createdAt), document: item.delivery.receiptNumber || 'Delivery receipt', href: `/deliveries/${item.delivery.id}`, quantity: item.quantity, status: words(item.delivery.status), detail: item.delivery.poNumber ? `Against ${item.delivery.poNumber}` : 'Delivery', counted: DELIVERED.has(item.delivery.status) }, item.delivery.status);
  }
  for (const item of input.issuanceItems) {
    const released = RELEASED.has(item.issuance.status);
    add(item.materialId, { kind: 'ISSUANCE', date: iso(item.issuance.releaseDate || item.issuance.createdAt), document: item.issuance.misNumber, href: '/material-issuance', quantity: released ? item.releasedQty : item.requestedQty, status: words(item.issuance.status), detail: item.issuance.activity || 'Issued to site', counted: released }, item.issuance.status);
  }
  for (const item of input.returnItems) {
    add(item.materialId, { kind: 'RETURN', date: iso(item.materialReturn.receiveDate || item.materialReturn.createdAt), document: item.materialReturn.mrsNumber, href: '/material-issuance', quantity: item.returnedQty, status: words(item.materialReturn.status), detail: item.condition === 'GOOD' ? 'Returned to stock' : `Returned · ${words(item.condition)}`, counted: item.materialReturn.status === 'COMPLETED' || item.materialReturn.status === 'RECEIVED' }, item.materialReturn.status);
  }

  for (const row of Object.values(result)) {
    row.requested = fmt(row.requested);
    row.ordered = fmt(row.ordered);
    row.events.sort((a, b) => b.date.localeCompare(a.date));
    row.stage = row.issued > 0 ? (row.onHand > 0 ? 'IN_USE' : 'ISSUED')
      : row.delivered > 0 ? (row.ordered > 0 && row.delivered < row.ordered ? 'PARTLY_DELIVERED' : 'IN_STOCK')
        : row.ordered > 0 ? 'ORDERED'
          : row.requested > 0 ? 'REQUESTED' : 'NOT_REQUESTED';
  }
  return result;
}
