import express from 'express';
import type { Server } from 'node:http';

jest.mock('../../apps/aws-backend/src/lib/prisma', () => ({ prisma: {
  user: { findUnique: jest.fn() }, purchaseOrder: { findUnique: jest.fn() },
  delivery: { create: jest.fn() }, $transaction: jest.fn(),
  consolidatedBOQItem: { findMany: jest.fn() },
} }));
jest.mock('../../apps/aws-backend/src/lib/permissions', () => ({ requirePermission: jest.fn() }));
jest.mock('../../apps/aws-backend/src/lib/workflow', () => ({ submitTransaction: jest.fn(), approveTransaction: jest.fn() }));
jest.mock('../../apps/aws-backend/src/lib/aiValidation', () => ({ validateTransactionWithAI: jest.fn(), verifyDeliveryDocumentWithAI: jest.fn() }));
jest.mock('../../apps/aws-backend/src/services/s3.service', () => ({ uploadFileToS3: jest.fn() }));
jest.mock('@/lib/s3', () => ({ privateUploadUrl: jest.fn() }));

import { prisma } from '../../apps/aws-backend/src/lib/prisma';
import deliveryRouter from '../../apps/aws-backend/src/routes/delivery';

describe('delivery receipt status enforcement', () => {
  let server: Server;
  let base: string;
  const materialId = 'material-1';
  const input = { poId: 'po-1', receiptNumber: 'DR-TEST', noFileReason: 'Local workflow test', items: [{ consolidatedBoqItemId: materialId, quantity: 2, drQuantity: 3, remarks: 'One unit outstanding' }] };

  beforeAll(async () => {
    const app = express(); app.use(express.json()); app.use(deliveryRouter);
    await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected local test listener');
    base = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'receiver-1', role: 'STOCKMAN' });
    (prisma.delivery.create as jest.Mock).mockResolvedValue({ id: 'delivery-1' });
    (prisma.consolidatedBOQItem.findMany as jest.Mock).mockResolvedValue([{ id: materialId, description: 'Test cement' }]);
  });

  function order(status: string) {
    return { id: 'po-1', status, mr: { projectId: 'project-1' }, items: [{ consolidatedBoqItemId: materialId, consolidatedBoqItem: { projectId: 'project-1' } }] };
  }
  const post = (route: string, body?: unknown) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-session': 'receiver-1' }, body: body ? JSON.stringify(body) : undefined });

  it.each(['FOR_REVIEW', 'CANCELLED', 'DELIVERED'])('rejects %s orders before creating a receipt', async status => {
    (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValue(order(status));
    const response = await post('/encode', input);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('approved');
    expect(prisma.delivery.create).not.toHaveBeenCalled();
  });

  it.each(['APPROVED', 'ISSUED', 'PARTIALLY_DELIVERED'])('preserves actual and DR quantities when encoding a partial receipt for %s orders', async status => {
    (prisma.purchaseOrder.findUnique as jest.Mock).mockResolvedValue(order(status));
    const response = await post('/encode', input);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, deliveryId: 'delivery-1' });
    expect(prisma.delivery.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      poId: 'po-1', hasProof: false, isMismatch: true,
      items: { create: [expect.objectContaining({ quantity: 2, drQuantity: 3, consolidatedBoqItemId: materialId })] },
    }) }));
  });

  it('rolls back approval when the PO was canceled after the receipt was encoded', async () => {
    const tx = { delivery: { findUnique: jest.fn().mockResolvedValue({ status: 'FOR_ACCOUNTANT_APPROVAL', po: { status: 'CANCELLED' } }), updateMany: jest.fn() }, consolidatedBOQItem: { update: jest.fn() }, accountsPayable: { create: jest.fn() } };
    (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(tx));
    const response = await post('/delivery-1/approve');
    expect(response.status).toBe(409);
    expect(tx.delivery.updateMany).not.toHaveBeenCalled();
    expect(tx.consolidatedBOQItem.update).not.toHaveBeenCalled();
    expect(tx.accountsPayable.create).not.toHaveBeenCalled();
  });

  it('posts the same correctly allocated repeated-material cost to stock, ledger and payable', async () => {
    const receipt = { id: 'delivery-1', poId: 'po-1', status: 'FOR_ACCOUNTANT_APPROVAL', receiptNumber: 'DR-TEST', createdAt: new Date(),
      items: [{ consolidatedBoqItemId: materialId, quantity: 5, drQuantity: 5, consolidatedBoqItem: { projectId: 'project-1', unitCost: 999, deliveredQty: 0, actualCost: 0 } }],
      po: { status: 'APPROVED', supplierId: 'supplier', supplier: { name: 'Supplier', isVatable: false }, mr: { projectId: 'project-1' }, items: [
        { id: 'a', consolidatedBoqItemId: materialId, quantity: 4, unitCost: 10 },
        { id: 'b', consolidatedBoqItemId: materialId, quantity: 6, unitCost: 20 },
      ] },
    };
    const tx = {
      delivery: { findUnique: jest.fn().mockResolvedValue(receipt), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([receipt]) },
      consolidatedBOQItem: { update: jest.fn() }, projectCostLedger: { create: jest.fn() },
      accountsPayable: { count: jest.fn().mockResolvedValue(0), create: jest.fn() }, purchaseOrder: { update: jest.fn() },
      commitmentLedger: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c-other', supplierName: 'Other', remainingCommitment: 200, deliveredAmount: 0 },
          { id: 'c-same', supplierName: 'Supplier', remainingCommitment: 40, deliveredAmount: 0 },
        ]),
        update: jest.fn(),
      },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(tx));
    const response = await post('/delivery-1/approve');
    expect(response.status).toBe(200);
    // The ₱60 delivered becomes actual cost, so it leaves the open commitments: same supplier first, then the rest.
    expect(tx.commitmentLedger.update).toHaveBeenCalledWith({ where: { id: 'c-same' }, data: { deliveredAmount: 40, remainingCommitment: 0, status: 'FULFILLED' } });
    expect(tx.commitmentLedger.update).toHaveBeenCalledWith({ where: { id: 'c-other' }, data: { deliveredAmount: 20, remainingCommitment: 180, status: 'ACTIVE' } });
    expect(tx.consolidatedBOQItem.update).toHaveBeenCalledWith(expect.objectContaining({ data: { deliveredQty: 5, actualCost: 60 } }));
    expect(tx.projectCostLedger.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ grossAmount: 60, netAmount: 60 }) }));
    expect(tx.accountsPayable.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 60 }) }));
    expect(tx.purchaseOrder.update).toHaveBeenCalledWith({ where: { id: 'po-1' }, data: { status: 'PARTIALLY_DELIVERED' } });
  });
});
