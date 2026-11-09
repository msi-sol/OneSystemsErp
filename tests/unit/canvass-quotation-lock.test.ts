import express from 'express';
import type { Server } from 'node:http';

jest.mock('../../apps/aws-backend/src/lib/prisma', () => ({ prisma: {
  canvassForm: { findUnique: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
  supplierQuotation: { findFirst: jest.fn() },
  supplier: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  auditLog: { create: jest.fn(), findFirst: jest.fn() },
  purchaseOrder: { count: jest.fn() },
  $transaction: jest.fn(),
} }));

import { prisma } from '../../apps/aws-backend/src/lib/prisma';
import canvassRouter from '../../apps/aws-backend/src/routes/canvass';

describe('canvass quotation mutation state guard', () => {
  let server: Server;
  let base: string;
  const quotationBody = {
    supplierId: 'supplier-1',
    items: [{ canvassItemId: 'item-1', unitCost: 5, quantityAvailable: 2 }],
  };
  const tx = {
    canvassForm: { updateMany: jest.fn() },
    supplierQuotation: { updateMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    quotationItem: { deleteMany: jest.fn() },
  };

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(canvassRouter);
    await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected local test listener');
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
    tx.canvassForm.updateMany.mockResolvedValue({ count: 1 });
    (prisma.canvassForm.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    tx.supplierQuotation.updateMany.mockResolvedValue({ count: 1 });
    tx.supplierQuotation.create.mockResolvedValue({ id: 'quotation-new' });
    tx.supplierQuotation.update.mockResolvedValue({ id: 'quotation-1' });
    tx.quotationItem.deleteMany.mockResolvedValue({ count: 1 });
    // The quotation being edited exists; no other quotation from the same supplier unless a test says so.
    (prisma.supplierQuotation.findFirst as jest.Mock).mockImplementation(({ where }) => Promise.resolve(where.supplierId ? null : { id: 'quotation-1' }));
    (prisma.supplier.findUnique as jest.Mock).mockResolvedValue({ id: 'supplier-1', name: 'Supplier One', paymentTerms: 'PDC 30' });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', role: 'PROCUREMENT' });
    (prisma.auditLog.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    (prisma.purchaseOrder.count as jest.Mock).mockResolvedValue(0);
  });

  function canvass(status: string) {
    (prisma.canvassForm.findUnique as jest.Mock).mockResolvedValue({
      id: 'canvass-1', status, items: [{ id: 'item-1', quantityRequired: 2 }],
    });
  }

  const post = (path: string, body: unknown) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const put = (path: string, body: unknown) => fetch(`${base}${path}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  it.each(['APPROVED', 'COMPLETED'])('blocks adding a quotation when canvass is %s', async status => {
    canvass(status);
    const response = await post('/canvass-1/quotations', quotationBody);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/cannot be changed/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['APPROVED', 'COMPLETED'])('blocks editing a quotation when canvass is %s', async status => {
    canvass(status);
    const response = await put('/canvass-1/quotations/quotation-1', quotationBody);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/cannot be changed/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps returned canvasses editable for a new supplier quotation', async () => {
    canvass('RETURNED');
    const response = await post('/canvass-1/quotations', quotationBody);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, quotationId: 'quotation-new' });
    expect(tx.canvassForm.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'canvass-1', status: { notIn: ['APPROVED', 'COMPLETED'] } },
    }));
    expect(tx.supplierQuotation.create).toHaveBeenCalled();
  });

  it('keeps returned canvasses editable for quotation corrections', async () => {
    canvass('RETURNED');
    const response = await put('/canvass-1/quotations/quotation-1', quotationBody);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(tx.quotationItem.deleteMany).toHaveBeenCalledWith({ where: { quotationId: 'quotation-1' } });
    expect(tx.supplierQuotation.update).toHaveBeenCalled();
  });

  it('resets an endorsed canvass to draft when quote content changes', async () => {
    canvass('ENDORSED');
    const response = await put('/canvass-1/quotations/quotation-1', quotationBody);
    expect(response.status).toBe(200);
    expect(tx.canvassForm.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'canvass-1', status: 'ENDORSED' }, data: { status: 'DRAFT' },
    });
    expect(tx.canvassForm.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: 'canvass-1', status: { notIn: ['APPROVED', 'COMPLETED'] } },
    }));
  });

  it('does not reset a returned canvass when quote content changes', async () => {
    canvass('RETURNED');
    tx.canvassForm.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    const response = await put('/canvass-1/quotations/quotation-1', quotationBody);
    expect(response.status).toBe(200);
    expect(tx.canvassForm.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.canvassForm.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'canvass-1', status: 'ENDORSED' }, data: { status: 'DRAFT' },
    });
    expect(tx.canvassForm.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: 'canvass-1', status: { notIn: ['APPROVED', 'COMPLETED'] } },
    }));
  });

  it('does not allow endorsing an approved or completed canvass', async () => {
    for (const status of ['APPROVED', 'COMPLETED']) {
      (prisma.canvassForm.findUnique as jest.Mock).mockResolvedValue({
        id: 'canvass-1', status, recommendedSupplierId: 'supplier-1',
      });
      const response = await fetch(base + '/canvass-1/endorse', {
        method: 'POST', headers: { 'x-user-session': 'user-1' },
      });
      expect(response.status).toBe(409);
    }
    expect(prisma.canvassForm.updateMany).not.toHaveBeenCalled();
  });

  it('allows a returned canvass to be endorsed with a guarded status transition', async () => {
    (prisma.canvassForm.findUnique as jest.Mock).mockResolvedValue({
      id: 'canvass-1', status: 'RETURNED', recommendedSupplierId: 'supplier-1',
    });
    const response = await fetch(base + '/canvass-1/endorse', {
      method: 'POST', headers: { 'x-user-session': 'user-1' },
    });
    expect(response.status).toBe(200);
    expect(prisma.canvassForm.updateMany).toHaveBeenCalledWith({
      where: { id: 'canvass-1', status: { in: ['DRAFT', 'RETURNED'] } },
      data: { status: 'ENDORSED' },
    });
  });

  it('only approves an endorsed canvass and rechecks that state on update', async () => {
    (prisma.canvassForm.findUnique as jest.Mock).mockResolvedValue({
      id: 'canvass-1', status: 'DRAFT', recommendedSupplierId: 'supplier-1',
    });
    const blocked = await fetch(base + '/canvass-1/approve', {
      method: 'POST', headers: { 'x-user-session': 'user-1' },
    });
    expect(blocked.status).toBe(409);
    expect(prisma.canvassForm.updateMany).not.toHaveBeenCalled();

    (prisma.canvassForm.findUnique as jest.Mock).mockResolvedValue({
      id: 'canvass-1', status: 'ENDORSED', recommendedSupplierId: 'supplier-1',
    });
    (prisma.canvassForm.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
    const race = await fetch(base + '/canvass-1/approve', {
      method: 'POST', headers: { 'x-user-session': 'user-1' },
    });
    expect(race.status).toBe(409);
    expect(prisma.canvassForm.updateMany).toHaveBeenCalledWith({
      where: { id: 'canvass-1', status: 'ENDORSED' }, data: { status: 'APPROVED' },
    });
  });

  it('rolls back a create if the canvass becomes locked before the transaction guard', async () => {
    canvass('DRAFT');
    tx.canvassForm.updateMany.mockResolvedValue({ count: 0 });
    const response = await post('/canvass-1/quotations', quotationBody);
    expect(response.status).toBe(409);
    expect(tx.supplierQuotation.create).not.toHaveBeenCalled();
  });

  it('refuses a second quotation from the same supplier and keeps the supplier terms', async () => {
    canvass('DRAFT');
    (prisma.supplierQuotation.findFirst as jest.Mock).mockResolvedValue({ id: 'quotation-1' });
    const duplicate = await post('/canvass-1/quotations', quotationBody);
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error).toMatch(/already has a quotation/i);

    (prisma.supplierQuotation.findFirst as jest.Mock).mockResolvedValue(null);
    const created = await post('/canvass-1/quotations', { ...quotationBody, deliveryPeriod: ' 7 days ' });
    expect(created.status).toBe(200);
    expect(tx.supplierQuotation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deliveryPeriod: '7 days', paymentTerms: 'PDC 30' }),
    }));
  });

  it('records the endorser and blocks them from approving their own endorsement', async () => {
    (prisma.canvassForm.findUnique as jest.Mock).mockResolvedValue({ id: 'canvass-1', status: 'DRAFT', recommendedSupplierId: 'supplier-1' });
    await fetch(base + '/canvass-1/endorse', { method: 'POST', headers: { 'x-user-session': 'user-1' } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actionType: 'CANVASS_ENDORSED', userId: 'user-1' }) }));

    (prisma.canvassForm.findUnique as jest.Mock).mockResolvedValue({ id: 'canvass-1', status: 'ENDORSED', recommendedSupplierId: 'supplier-1' });
    (prisma.auditLog.findFirst as jest.Mock).mockResolvedValue({ userId: 'user-1' });
    (prisma.canvassForm.updateMany as jest.Mock).mockClear();
    const self = await fetch(base + '/canvass-1/approve', { method: 'POST', headers: { 'x-user-session': 'user-1' } });
    expect(self.status).toBe(403);
    expect(prisma.canvassForm.updateMany).not.toHaveBeenCalled();

    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', role: 'ADMIN' });
    const admin = await fetch(base + '/canvass-1/approve', { method: 'POST', headers: { 'x-user-session': 'user-1' } });
    expect(admin.status).toBe(200);
  });

  it('keeps a canvass that already has purchase orders', async () => {
    (prisma.canvassForm.findUnique as jest.Mock).mockResolvedValue({ id: 'canvass-1', status: 'COMPLETED', preparedById: 'user-1', items: [], quotations: [] });
    (prisma.purchaseOrder.count as jest.Mock).mockResolvedValue(1);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user-1', role: 'SUPER_ADMIN' });
    const response = await fetch(base + '/canvass-1', { method: 'DELETE', headers: { 'x-user-session': 'user-1' } });
    expect(response.status).toBe(409);
    expect(prisma.canvassForm.delete).not.toHaveBeenCalled();
  });
});
