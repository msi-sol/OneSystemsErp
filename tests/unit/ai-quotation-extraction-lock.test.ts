import express from 'express';
import type { Server } from 'node:http';

jest.mock('../../apps/aws-backend/src/lib/prisma', () => ({ prisma: {
  canvassForm: { findUnique: jest.fn(), updateMany: jest.fn() },
  supplier: { findMany: jest.fn() },
  supplierQuotation: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
} }));
jest.mock('../../src/lib/s3', () => ({ uploadToS3: jest.fn().mockResolvedValue({ url: 'https://local.invalid/file' }) }));
// Quotation extraction runs on OpenAI through the shared helper; stub it with a fixed extraction.
jest.mock('../../src/lib/ai/openai-model', () => ({
  openAIModel: jest.fn(),
  generateOpenAIText: jest.fn().mockResolvedValue(JSON.stringify({
    supplierId: 'supplier-1', matches: true, findings: 'Extracted',
    items: [{ canvassItemId: 'item-1', unitCost: 2 }],
  })),
}));

import { prisma } from '../../apps/aws-backend/src/lib/prisma';
import aiRouter from '../../apps/aws-backend/src/routes/ai';

describe('AI quotation extraction lock', () => {
  let server: Server;
  let base: string;
  const tx = {
    canvassForm: { updateMany: jest.fn() },
    supplierQuotation: { updateMany: jest.fn(), create: jest.fn() },
  };

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(aiRouter);
    await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected local test listener');
    base = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.canvassForm.findUnique as jest.Mock).mockResolvedValue({
      id: 'canvass-1', projectId: 'project-1', status: 'DRAFT',
      updatedAt: new Date('2026-11-07T00:00:00.000Z'),
      items: [{ id: 'item-1', quantityRequired: 3, consolidatedBoqItem: { description: 'Item' } }],
    });
    (prisma.supplier.findMany as jest.Mock).mockResolvedValue([{ id: 'supplier-1', name: 'Supplier One' }]);
    (prisma.supplierQuotation.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.$transaction as jest.Mock).mockImplementation((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
    tx.canvassForm.updateMany.mockResolvedValue({ count: 1 });
    tx.supplierQuotation.updateMany.mockResolvedValue({ count: 1 });
    tx.supplierQuotation.create.mockResolvedValue({ id: 'quote-1' });
  });

  const request = () => fetch(`${base}/quotations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ canvassId: 'canvass-1', files: [{ name: 'quote.pdf', type: 'application/pdf', base64: 'ZmlsZQ==' }] }),
  });

  it.each(['APPROVED', 'COMPLETED'])('rejects %s before calling the AI provider', async status => {
    (prisma.canvassForm.findUnique as jest.Mock).mockResolvedValue({
      id: 'canvass-1', projectId: 'project-1', status, items: [],
    });
    const response = await request();
    expect(response.status).toBe(409);
    expect(prisma.supplier.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not create extracted quotation data if the status locks before save', async () => {
    tx.canvassForm.updateMany.mockResolvedValue({ count: 0 });
    const response = await request();
    expect(response.status).toBe(200);
    expect((await response.json()).results[0].success).toBe(false);
    expect(tx.canvassForm.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'canvass-1', status: { notIn: ['APPROVED', 'COMPLETED'] }, updatedAt: new Date('2026-11-07T00:00:00.000Z') },
    }));
    expect(tx.supplierQuotation.create).not.toHaveBeenCalled();
  });

  it('resets the canvass endorsement when extraction adds a quote', async () => {
    (prisma.canvassForm.findUnique as jest.Mock).mockResolvedValue({
      id: 'canvass-1', projectId: 'project-1', status: 'ENDORSED',
      updatedAt: new Date('2026-11-07T00:00:00.000Z'),
      items: [{ id: 'item-1', quantityRequired: 3, consolidatedBoqItem: { description: 'Item' } }],
    });
    const response = await request();
    expect(response.status).toBe(200);
    expect(tx.canvassForm.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ updatedAt: new Date('2026-11-07T00:00:00.000Z') }),
      data: expect.objectContaining({ status: 'DRAFT', recommendedSupplierId: null }),
    }));
    expect(tx.supplierQuotation.create).toHaveBeenCalled();
  });
});
