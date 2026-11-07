jest.mock('@/lib/prisma', () => ({ prisma: {
  canvassForm: { findUnique: jest.fn() },
  supplierQuotation: { update: jest.fn() },
  $transaction: jest.fn(),
} }));

import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/ai/compare-quotations/route';

const quoteFixture = {
  id: 'quote-1',
  supplierId: 'supplier-1',
  supplier: { name: 'Supplier One' },
  totalAmount: 10,
  deliveryPeriod: '7 Days',
  paymentTerms: 'COD',
  items: [{ canvassItemId: 'item-1', quantityAvailable: 1, unitCost: 10 }],
};

describe('AI quotation comparison lock', () => {
  const tx = {
    canvassForm: { updateMany: jest.fn() },
    supplierQuotation: { update: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.canvassForm.findUnique as jest.Mock).mockResolvedValue({
      id: 'canvass-1',
      status: 'DRAFT',
      updatedAt: new Date('2026-11-07T00:00:00.000Z'),
      items: [{ id: 'item-1', quantityRequired: 1 }],
      quotations: [quoteFixture],
    });
    (prisma.$transaction as jest.Mock).mockImplementation((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
    tx.canvassForm.updateMany.mockResolvedValue({ count: 1 });
    tx.supplierQuotation.update.mockResolvedValue({});
  });

  it.each(['APPROVED', 'COMPLETED'])('rejects %s before comparison work', async status => {
    (prisma.canvassForm.findUnique as jest.Mock).mockResolvedValue({
      id: 'canvass-1', status, updatedAt: new Date('2026-11-07T00:00:00.000Z'), items: [{ id: 'item-1', quantityRequired: 1 }], quotations: [quoteFixture],
    });
    const response = await POST(new Request('http://local/api/ai/compare-quotations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ canvassId: 'canvass-1' }),
    }));
    expect(response.status).toBe(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechecks status atomically before changing the recommendation', async () => {
    jest.useFakeTimers();
    tx.canvassForm.updateMany.mockResolvedValue({ count: 0 });
    const responsePromise = POST(new Request('http://local/api/ai/compare-quotations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ canvassId: 'canvass-1' }),
    }));
    await jest.advanceTimersByTimeAsync(3500);
    const response = await responsePromise;
    expect(response.status).toBe(409);
    expect(tx.canvassForm.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'canvass-1', status: { notIn: ['APPROVED', 'COMPLETED'] }, updatedAt: new Date('2026-11-07T00:00:00.000Z') },
    }));
    expect(tx.supplierQuotation.update).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('resets a canvass endorsement when comparison changes the recommendation', async () => {
    (prisma.canvassForm.findUnique as jest.Mock).mockResolvedValue({
      id: 'canvass-1', status: 'ENDORSED', updatedAt: new Date('2026-11-07T00:00:00.000Z'),
      items: [{ id: 'item-1', quantityRequired: 1 }], quotations: [quoteFixture],
    });
    jest.useFakeTimers();
    const responsePromise = POST(new Request('http://local/api/ai/compare-quotations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ canvassId: 'canvass-1' }),
    }));
    await jest.advanceTimersByTimeAsync(3500);
    expect((await responsePromise).status).toBe(200);
    expect(tx.canvassForm.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { notIn: ['APPROVED', 'COMPLETED'] } }),
      data: expect.objectContaining({ status: 'DRAFT', recommendedSupplierId: 'supplier-1' }),
    }));
    jest.useRealTimers();
  });
});
