import { generateCanvassPurchaseOrder } from '../../apps/aws-backend/src/services/canvass-purchase-order';

function makePrisma({ status = 'APPROVED', recommendedSupplierId = 'supplier-a', mrStatus = 'APPROVED', existingPO = false, existingOrders = [], failCreate = false } = {}) {
  const state: any = {
    canvass: {
      id: 'canvass-a',
      status,
      recommendedSupplierId,
      mrId: 'mr-a',
      mr: { projectId: 'project-a' },
      items: [{ id: 'canvass-item-a', quantityRequired: 1 }],
    },
    quotation: {
      id: 'quotation-a',
      supplierId: 'supplier-a',
      supplier: { isVatable: true },
      items: [{
        canvassItemId: 'canvass-item-a',
        unitCost: 112,
        quantityAvailable: 1,
        canvassItem: { consolidatedBoqItemId: 'boq-item-a' },
      }],
    },
    request: {
      id: 'mr-a',
      projectId: 'project-a',
      status: mrStatus,
      items: [{ consolidatedBoqItemId: 'boq-item-a', quantity: 1, approvedQuantity: 1, consolidatedBoqItem: { projectId: 'project-a' } }],
    },
    orders: existingPO ? [{ id: 'existing-po', canvassFormId: 'canvass-a' }] : structuredClone(existingOrders),
  };

  const prisma: any = {
    $transaction: async (work: (tx: any) => Promise<any>, options: any) => {
      prisma.lastTransactionOptions = options;
      const snapshot = structuredClone(state);
      const tx = {
        canvassForm: {
          findUnique: async () => state.canvass,
          updateMany: async ({ where, data }: any) => {
            if (state.canvass.id !== where.id || state.canvass.status !== where.status ||
                state.canvass.recommendedSupplierId !== where.recommendedSupplierId) return { count: 0 };
            Object.assign(state.canvass, data);
            return { count: 1 };
          },
        },
        materialRequest: {
          findUnique: async () => state.request,
          updateMany: async ({ where, data }: any) => {
            if (state.request.id !== where.id || state.request.status !== where.status) return { count: 0 };
            Object.assign(state.request, data);
            return { count: 1 };
          },
        },
        supplier: { findMany: async ({ where }: any) => [{ id: where.id.in[0], isVatable: true, name: 'Supplier A' }] },
        supplierQuotation: { findFirst: async () => state.quotation },
        purchaseOrder: {
          findFirst: async ({ where }: any) => {
            if (where.canvassFormId) return state.orders[0] ? { id: state.orders[0].id } : null;
            return null;
          },
          findMany: async () => state.orders,
          create: async ({ data }: any) => {
            if (failCreate) throw new Error('PO insert failed.');
            const created = { id: 'created-po', ...data };
            state.orders.push(created);
            return { id: created.id };
          },
        },
      };

      try {
        return await work(tx);
      } catch (error) {
        Object.keys(state).forEach(key => delete state[key]);
        Object.assign(state, snapshot);
        throw error;
      }
    },
    state,
  };
  return prisma;
}

describe('canvass-generated purchase orders', () => {
  it('rejects draft canvasses before creating a PO', async () => {
    const prisma = makePrisma({ status: 'DRAFT' });
    await expect(generateCanvassPurchaseOrder(prisma, { canvassId: 'canvass-a', supplierId: 'supplier-a', userId: 'user-a' }))
      .rejects.toThrow(/currently approved/);
    expect(prisma.state.orders).toHaveLength(0);
  });

  it('rejects a supplier that is not the approved recommendation', async () => {
    const prisma = makePrisma({ recommendedSupplierId: 'supplier-b' });
    await expect(generateCanvassPurchaseOrder(prisma, { canvassId: 'canvass-a', supplierId: 'supplier-a', userId: 'user-a' }))
      .rejects.toThrow(/not the currently approved/);
    expect(prisma.state.orders).toHaveLength(0);
  });

  it('rejects a canvass linked to a cancelled material request', async () => {
    const prisma = makePrisma({ mrStatus: 'CANCELLED' });
    await expect(generateCanvassPurchaseOrder(prisma, { canvassId: 'canvass-a', supplierId: 'supplier-a', userId: 'user-a' }))
      .rejects.toThrow(/approved MRF with a remaining quantity balance/);
    expect(prisma.state.orders).toHaveLength(0);
  });

  it('rejects a PO that would exceed the remaining approved MRF quantity', async () => {
    const prisma = makePrisma({ existingOrders: [{ items: [{ consolidatedBoqItemId: 'boq-item-a', quantity: 0.75 }] }] });
    await expect(generateCanvassPurchaseOrder(prisma, { canvassId: 'canvass-a', supplierId: 'supplier-a', userId: 'user-a' }))
      .rejects.toThrow(/exceeds the approved MRF balance of 0.25/);
    expect(prisma.state.canvass.status).toBe('APPROVED');
    expect(prisma.state.request.status).toBe('APPROVED');
    expect(prisma.state.orders).toHaveLength(1);
  });

  it('returns the same linked PO for completed retries without creating another', async () => {
    const prisma = makePrisma({ status: 'COMPLETED', existingPO: true });
    await expect(generateCanvassPurchaseOrder(prisma, { canvassId: 'canvass-a', supplierId: 'any-retry-value', userId: 'user-a' }))
      .resolves.toEqual({ poId: 'existing-po', alreadyExists: true });
    expect(prisma.state.orders).toHaveLength(1);
  });

  it('rolls back the completion claim when PO creation fails', async () => {
    const prisma = makePrisma({ failCreate: true });
    await expect(generateCanvassPurchaseOrder(prisma, { canvassId: 'canvass-a', supplierId: 'supplier-a', userId: 'user-a' }))
      .rejects.toThrow('PO insert failed.');
    expect(prisma.state.canvass.status).toBe('APPROVED');
    expect(prisma.state.orders).toHaveLength(0);
    expect(prisma.lastTransactionOptions.isolationLevel).toBeDefined();
  });

  it('claims the recommendation and creates a correctly taxed complete-scope PO', async () => {
    const prisma = makePrisma();
    await expect(generateCanvassPurchaseOrder(prisma, { canvassId: 'canvass-a', supplierId: 'supplier-a', userId: 'user-a' }))
      .resolves.toEqual({ poId: 'created-po', alreadyExists: false });
    expect(prisma.state.canvass.status).toBe('COMPLETED');
    expect(prisma.state.request.status).toBe('FULLY_PROCURED');
    expect(prisma.state.orders[0].totalAmount).toBe(112);
    expect(prisma.state.orders[0].netAmount).toBeCloseTo(100, 10);
    expect(prisma.state.orders[0].vatAmount).toBeCloseTo(12, 10);
    expect(prisma.state.orders[0].items.create).toEqual([{ quantity: 1, unitCost: 112, consolidatedBoqItemId: 'boq-item-a' }]);
  });
});
