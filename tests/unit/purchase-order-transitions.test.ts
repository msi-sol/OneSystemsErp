jest.mock('../../apps/aws-backend/src/lib/workflow', () => ({
  approveTransaction: jest.fn().mockResolvedValue(undefined),
  submitTransaction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/boq/benchmark-request-allowance', () => ({ assertMaterialRequestAllowance: jest.fn().mockResolvedValue(undefined) }));

import { approveTransaction, submitTransaction } from '../../apps/aws-backend/src/lib/workflow';
import { approvePurchaseOrderInTransaction, createPurchaseOrdersFromMrInTransaction, PurchaseOrderInputError, PurchaseOrderSelfApprovalError, PurchaseOrderTransitionConflict, submitPurchaseOrderInTransaction } from '../../apps/aws-backend/src/services/purchase-order-transitions';

const actor = { userId: 'approver', userRole: 'PROJECT_DIRECTOR', simulatedRole: undefined };
function transaction(status = 'FOR_REVIEW', projectId = 'project-1') {
  return {
    purchaseOrder: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'po-1', status, preparerId: 'preparer', mrId: 'mr-1', mr: { projectId, status: 'APPROVED', items: [{ consolidatedBoqItemId: 'material-1', quantity: 4, approvedQuantity: 4 }] }, supplier: { name: 'Supplier' },
        items: [{ id: 'line-1', consolidatedBoqItemId: 'material-1', quantity: 4, unitCost: 12.5, consolidatedBoqItem: { projectId } }],
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    commitmentLedger: { create: jest.fn().mockResolvedValue({}) },
    consolidatedBOQItem: { update: jest.fn().mockResolvedValue({}) },
    transactionWorkflow: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
}

describe('purchase-order workflow transitions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('claims a review PO and writes commitments and workflow through the same transaction', async () => {
    const tx = transaction();
    await approvePurchaseOrderInTransaction(tx as never, 'po-1', actor);

    expect(tx.purchaseOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'po-1', status: 'FOR_REVIEW' }, data: { status: 'APPROVED', approverId: 'approver' },
    });
    expect(tx.commitmentLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ approvedAmount: 50, projectId: 'project-1' }) });
    expect(tx.consolidatedBOQItem.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'material-1' }, data: { committedCost: { increment: 50 } } }));
    expect(approveTransaction).toHaveBeenCalledWith('approver', 'PROJECT_DIRECTOR', 'PURCHASE_ORDER', 'po-1', 'Approved PO digitally', undefined, tx);
  });

  it('blocks quotation-origin POs that exceed their approved request or overlap another PO', async () => {
    const tx = transaction();
    tx.purchaseOrder.findMany.mockResolvedValue([{ items: [{ consolidatedBoqItemId: 'material-1', quantity: 1 }] }]);
    await expect(approvePurchaseOrderInTransaction(tx as never, 'po-1', actor)).rejects.toThrow(/Combined PO quantities/);
    expect(tx.commitmentLedger.create).not.toHaveBeenCalled();
    expect(tx.purchaseOrder.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a repeated approval before writing any commitment', async () => {
    const tx = transaction('APPROVED');
    await expect(approvePurchaseOrderInTransaction(tx as never, 'po-1', actor))
      .rejects.toBeInstanceOf(PurchaseOrderTransitionConflict);
    expect(tx.purchaseOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.commitmentLedger.create).not.toHaveBeenCalled();
    expect(approveTransaction).not.toHaveBeenCalled();
  });

  it('preserves the PO preparer self-approval restriction before claiming or posting commitments', async () => {
    const tx = transaction();
    (tx.purchaseOrder.findUnique as jest.Mock).mockResolvedValue({
      id: 'po-1', status: 'FOR_REVIEW', preparerId: actor.userId, mr: { projectId: 'project-1', status: 'APPROVED', items: [{ consolidatedBoqItemId: 'material-1', quantity: 4, approvedQuantity: 4 }] }, supplier: { name: 'Supplier' },
      items: [{ id: 'line-1', consolidatedBoqItemId: 'material-1', quantity: 4, unitCost: 12.5, consolidatedBoqItem: { projectId: 'project-1' } }],
    });
    await expect(approvePurchaseOrderInTransaction(tx as never, 'po-1', actor))
      .rejects.toBeInstanceOf(PurchaseOrderSelfApprovalError);
    expect(tx.purchaseOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.commitmentLedger.create).not.toHaveBeenCalled();
  });

  it('rejects a cross-project line and propagates workflow rejection to abort its caller transaction', async () => {
    const invalid = transaction('FOR_REVIEW', 'project-1');
    (invalid.purchaseOrder.findUnique as jest.Mock).mockResolvedValue({
      id: 'po-1', status: 'FOR_REVIEW', mr: { projectId: 'project-1', status: 'APPROVED', items: [{ consolidatedBoqItemId: 'material-1', quantity: 4, approvedQuantity: 4 }] }, supplier: { name: 'Supplier' },
      items: [{ id: 'line-1', consolidatedBoqItemId: 'foreign-material', quantity: 1, unitCost: 1, consolidatedBoqItem: { projectId: 'project-2' } }],
    });
    await expect(approvePurchaseOrderInTransaction(invalid as never, 'po-1', actor))
      .rejects.toBeInstanceOf(PurchaseOrderTransitionConflict);
    expect(invalid.purchaseOrder.updateMany).not.toHaveBeenCalled();
    expect(invalid.commitmentLedger.create).not.toHaveBeenCalled();

    const tx = transaction();
    (approveTransaction as jest.Mock).mockRejectedValueOnce(new Error('Self-approval is strictly prohibited'));
    await expect(approvePurchaseOrderInTransaction(tx as never, 'po-1', actor))
      .rejects.toThrow('Self-approval is strictly prohibited');
    expect(approveTransaction).toHaveBeenCalledWith('approver', 'PROJECT_DIRECTOR', 'PURCHASE_ORDER', 'po-1', 'Approved PO digitally', undefined, tx);
  });

  it('submits only a draft PO and passes the transaction to the workflow submitter', async () => {
    const tx = transaction('DRAFT');
    await submitPurchaseOrderInTransaction(tx as never, 'po-1', actor);
    expect(tx.purchaseOrder.updateMany).toHaveBeenCalledWith({ where: { id: 'po-1', status: 'DRAFT' }, data: { status: 'FOR_REVIEW' } });
    expect(submitTransaction).toHaveBeenCalledWith('approver', 'PROJECT_DIRECTOR', 'PURCHASE_ORDER', 'po-1', undefined, tx);

    const reviewed = transaction('APPROVED');
    await expect(submitPurchaseOrderInTransaction(reviewed as never, 'po-1', actor))
      .rejects.toBeInstanceOf(PurchaseOrderTransitionConflict);
    expect(reviewed.purchaseOrder.updateMany).not.toHaveBeenCalled();
  });

  it('rejects submit and approval when the linked MRF has been cancelled or rejected', async () => {
    const cancelledForApproval = transaction();
    (cancelledForApproval.purchaseOrder.findUnique as jest.Mock).mockResolvedValue({
      id: 'po-1', status: 'FOR_REVIEW', preparerId: 'preparer', mr: { projectId: 'project-1', status: 'CANCELLED' }, supplier: { name: 'Supplier' },
      items: [{ id: 'line-1', consolidatedBoqItemId: 'material-1', quantity: 1, unitCost: 1, consolidatedBoqItem: { projectId: 'project-1' } }],
    });
    await expect(approvePurchaseOrderInTransaction(cancelledForApproval as never, 'po-1', actor)).rejects.toBeInstanceOf(PurchaseOrderTransitionConflict);
    expect(cancelledForApproval.commitmentLedger.create).not.toHaveBeenCalled();

    const rejectedForSubmit = transaction('DRAFT');
    (rejectedForSubmit.purchaseOrder.findUnique as jest.Mock).mockResolvedValue({ id: 'po-1', status: 'DRAFT', mr: { status: 'REJECTED' } });
    await expect(submitPurchaseOrderInTransaction(rejectedForSubmit as never, 'po-1', actor)).rejects.toBeInstanceOf(PurchaseOrderTransitionConflict);
    expect(rejectedForSubmit.purchaseOrder.updateMany).not.toHaveBeenCalled();
  });

  it.each(['APPROVED', 'FULLY_PROCURED'])('creates supplier-split POs from %s using fresh remaining quantities after cancelled orders', async initialStatus => {
    const tx: {
      materialRequest: { findUnique: jest.Mock; updateMany: jest.Mock };
      supplier: { findMany: jest.Mock };
      purchaseOrder: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
      transactionWorkflow: Record<string, jest.Mock>;
      auditLog: { create: jest.Mock };
    } = {
      materialRequest: {
        findUnique: jest.fn().mockResolvedValue({ id: 'mr-1', status: initialStatus, projectId: 'project-1', items: [
          { consolidatedBoqItemId: 'material-1', quantity: 10, approvedQuantity: 10, consolidatedBoqItem: { projectId: 'project-1' } },
          { consolidatedBoqItemId: 'material-2', quantity: 5, approvedQuantity: 5, consolidatedBoqItem: { projectId: 'project-1' } },
        ] }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      supplier: { findMany: jest.fn().mockResolvedValue([{ id: 'supplier-1', isVatable: false }, { id: 'supplier-2', isVatable: true }]) },
      purchaseOrder: {
        findMany: jest.fn().mockResolvedValue([{ items: [{ consolidatedBoqItemId: 'material-1', quantity: 4 }] }]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValueOnce({ id: 'po-1' }).mockResolvedValueOnce({ id: 'po-2' }),
      },
      transactionWorkflow: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const created = await createPurchaseOrdersFromMrInTransaction(tx, 'mr-1', [
      { supplierId: 'supplier-1', consolidatedBoqItemId: 'material-1', quantity: 3, unitCost: 10 },
      { supplierId: 'supplier-1', consolidatedBoqItemId: 'material-1', quantity: 3, unitCost: 10 },
      { supplierId: 'supplier-2', consolidatedBoqItemId: 'material-2', quantity: 2, unitCost: 10 },
    ], actor);

    expect(created).toEqual(['po-1', 'po-2']);
    expect(tx.purchaseOrder.create).toHaveBeenCalledTimes(2);
    expect(submitTransaction).toHaveBeenCalledTimes(2);
    expect(tx.materialRequest.updateMany).toHaveBeenCalledWith({ where: { id: 'mr-1', status: initialStatus }, data: { status: 'PARTIALLY_PROCURED' } });
  });

  it('blocks inactive MRFs and aggregate quantities beyond the approved balance before creating POs', async () => {
    const tx: {
      materialRequest: { findUnique: jest.Mock; updateMany: jest.Mock };
      supplier: { findMany: jest.Mock };
      purchaseOrder: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
    } = {
      materialRequest: {
        findUnique: jest.fn().mockResolvedValue({ id: 'mr-1', status: 'CANCELLED', projectId: 'project-1', items: [] }),
        updateMany: jest.fn(),
      },
      supplier: { findMany: jest.fn() }, purchaseOrder: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    };
    await expect(createPurchaseOrdersFromMrInTransaction(tx, 'mr-1', [{ supplierId: 's', consolidatedBoqItemId: 'm', quantity: 1, unitCost: 1 }], actor))
      .rejects.toBeInstanceOf(PurchaseOrderTransitionConflict);
    expect(tx.supplier.findMany).not.toHaveBeenCalled();

    tx.materialRequest.findUnique.mockResolvedValue({ id: 'mr-1', status: 'APPROVED', projectId: 'project-1', items: [
      { consolidatedBoqItemId: 'material-1', quantity: 5, approvedQuantity: 5, consolidatedBoqItem: { projectId: 'project-1' } },
    ] });
    tx.supplier.findMany.mockResolvedValue([{ id: 'supplier-1', isVatable: false }]);
    tx.purchaseOrder.findMany.mockResolvedValue([{ items: [{ consolidatedBoqItemId: 'material-1', quantity: 3 }] }]);
    await expect(createPurchaseOrdersFromMrInTransaction(tx, 'mr-1', [
      { supplierId: 'supplier-1', consolidatedBoqItemId: 'material-1', quantity: 1.1, unitCost: 2 },
      { supplierId: 'supplier-1', consolidatedBoqItemId: 'material-1', quantity: 1, unitCost: 2 },
    ], actor)).rejects.toBeInstanceOf(PurchaseOrderTransitionConflict);
    expect(tx.purchaseOrder.create).not.toHaveBeenCalled();

    await expect(createPurchaseOrdersFromMrInTransaction(tx, 'mr-1', [
      { supplierId: 'supplier-1', consolidatedBoqItemId: 'material-1', quantity: Number.POSITIVE_INFINITY, unitCost: 2 },
    ], actor)).rejects.toBeInstanceOf(PurchaseOrderInputError);
  });
});
