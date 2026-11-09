import { buildMaterialTracking, type TrackingInput } from '@/lib/procurement/material-tracking';

const empty: Omit<TrackingInput, 'materials'> = { requestItems: [], canvassItems: [], orderItems: [], deliveryItems: [], issuanceItems: [], returnItems: [] };
const doc = (id: string, status: string, createdAt: string) => ({ id, status, createdAt });

describe('master material tracking', () => {
  it('starts every material as not requested with no history', () => {
    const result = buildMaterialTracking({ ...empty, materials: [{ id: 'm1', deliveredQty: 0, consumedQty: 0 }] });
    expect(result.m1).toEqual({ requested: 0, ordered: 0, delivered: 0, issued: 0, onHand: 0, stage: 'NOT_REQUESTED', awaiting: 0, events: [] });
  });

  it('follows a material from request to stock and keeps every movement, newest first', () => {
    const result = buildMaterialTracking({
      materials: [{ id: 'm1', deliveredQty: 1, consumedQty: 0 }],
      requestItems: [{ materialId: 'm1', quantity: 2, approvedQuantity: 1, request: { ...doc('mr', 'FULLY_PROCURED', '2026-11-07T01:00:00Z'), mrNumber: 'MR-1', purpose: null } }],
      canvassItems: [{ materialId: 'm1', quantityRequired: 1, canvass: { ...doc('cv', 'COMPLETED', '2026-11-07T02:00:00Z'), canvassNumber: 'CANV-1' } }],
      orderItems: [
        { materialId: 'm1', quantity: 1, unitCost: 450000, order: { ...doc('po', 'PARTIALLY_DELIVERED', '2026-11-08T00:00:00Z'), poNumber: 'PO-1', supplierName: 'Supplier A' } },
        { materialId: 'm1', quantity: 5, unitCost: 1, order: { ...doc('po2', 'FOR_REVIEW', '2026-11-08T01:00:00Z'), poNumber: 'PO-2', supplierName: null } },
      ],
      deliveryItems: [
        { materialId: 'm1', quantity: 2, delivery: { ...doc('dr1', 'REJECTED', '2026-11-09T00:00:00Z'), receiptNumber: 'DR-1', date: '2026-11-09T00:00:00Z', poNumber: 'PO-1' } },
        { materialId: 'm1', quantity: 1, delivery: { ...doc('dr2', 'APPROVED', '2026-11-09T01:00:00Z'), receiptNumber: 'DR-2', date: '2026-11-09T01:00:00Z', poNumber: 'PO-1' } },
      ],
      issuanceItems: [
        { materialId: 'm1', requestedQty: 1, releasedQty: 1, issuance: { ...doc('mis1', 'COMPLETED', '2026-11-09T02:00:00Z'), misNumber: 'MIS-1', activity: 'Roof deck', releaseDate: '2026-11-09T02:00:00Z' } },
        { materialId: 'm1', requestedQty: 1, releasedQty: 0, issuance: { ...doc('mis2', 'PENDING', '2026-11-09T04:00:00Z'), misNumber: 'MIS-2', activity: 'Roof deck', releaseDate: null } },
      ],
      returnItems: [{ materialId: 'm1', returnedQty: 1, condition: 'GOOD', materialReturn: { ...doc('mrs', 'COMPLETED', '2026-11-09T03:00:00Z'), mrsNumber: 'MRS-1', receiveDate: '2026-11-09T03:00:00Z' } }],
    });
    const row = result.m1;
    // Approved quantity counts; the PO under review is not ordered yet; the rejected delivery is history only.
    expect(row).toEqual(expect.objectContaining({ requested: 1, ordered: 1, delivered: 1, issued: 0, onHand: 1, stage: 'IN_STOCK', awaiting: 2 }));
    expect(row.events.map((event) => event.document)).toEqual(['MIS-2', 'MRS-1', 'MIS-1', 'DR-2', 'DR-1', 'PO-2', 'PO-1', 'CANV-1', 'MR-1']);
    expect(row.events.find((event) => event.document === 'DR-1')).toEqual(expect.objectContaining({ counted: false, href: '/deliveries/dr1', status: 'rejected' }));
    expect(row.events.find((event) => event.document === 'PO-1')).toEqual(expect.objectContaining({ counted: true, href: '/procurement/purchase-orders/po', detail: 'Supplier A · ₱450,000.00 each' }));
  });

  it('names the stage from the furthest movement', () => {
    const stage = (deliveredQty: number, consumedQty: number, ordered = 0) => buildMaterialTracking({
      ...empty,
      materials: [{ id: 'm', deliveredQty, consumedQty }],
      orderItems: ordered ? [{ materialId: 'm', quantity: ordered, unitCost: 1, order: { ...doc('po', 'APPROVED', '2026-11-01'), poNumber: 'PO', supplierName: null } }] : [],
    }).m.stage;
    expect(stage(0, 0, 4)).toBe('ORDERED');
    expect(stage(2, 0, 4)).toBe('PARTLY_DELIVERED');
    expect(stage(4, 0, 4)).toBe('IN_STOCK');
    expect(stage(4, 1, 4)).toBe('IN_USE');
    expect(stage(4, 4, 4)).toBe('ISSUED');
  });
});
