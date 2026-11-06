jest.mock('../../apps/aws-backend/src/lib/prisma', () => ({
  prisma: {
    transactionWorkflow: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() },
    lockedRecord: { upsert: jest.fn() },
  },
}));
jest.mock('../../apps/aws-backend/src/lib/permissions', () => ({
  requirePermission: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../../apps/aws-backend/src/lib/prisma';
import { approveTransaction, submitTransaction } from '../../apps/aws-backend/src/lib/workflow';

const globalDb = prisma as unknown as {
  transactionWorkflow: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  auditLog: { create: jest.Mock };
};

describe('transaction-aware workflow approval', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the supplied transaction for workflow reads, writes, and audit', async () => {
    const tx = {
      transactionWorkflow: {
        findFirst: jest.fn().mockResolvedValue({ id: 'workflow-1', preparedBy: 'preparer', currentStatus: 'SUBMITTED' }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    await approveTransaction('approver', 'ACCOUNTANT', 'DELIVERY_RECEIVING', 'delivery-1', 'Approved', undefined, tx as never);

    expect(tx.transactionWorkflow.findFirst).toHaveBeenCalledWith({ where: { moduleName: 'DELIVERY_RECEIVING', transactionId: 'delivery-1' } });
    expect(tx.transactionWorkflow.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'workflow-1' } }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actionType: 'APPROVE' }) }));
    expect(globalDb.transactionWorkflow.findFirst).not.toHaveBeenCalled();
    expect(globalDb.transactionWorkflow.update).not.toHaveBeenCalled();
    expect(globalDb.auditLog.create).not.toHaveBeenCalled();
  });

  it('propagates self-approval rejection before writing workflow or audit records', async () => {
    const tx = {
      transactionWorkflow: {
        findFirst: jest.fn().mockResolvedValue({ id: 'workflow-1', preparedBy: 'same-user', currentStatus: 'SUBMITTED' }),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };

    await expect(approveTransaction('same-user', 'ACCOUNTANT', 'DELIVERY_RECEIVING', 'delivery-1', undefined, undefined, tx as never))
      .rejects.toThrow('Self-approval is strictly prohibited');
    expect(tx.transactionWorkflow.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('uses the supplied transaction for workflow submission and audit', async () => {
    const tx = {
      transactionWorkflow: { upsert: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    await submitTransaction('preparer', 'PURCHASING_OFFICER', 'PURCHASE_ORDER', 'po-1', undefined, tx as never);

    expect(tx.transactionWorkflow.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'PURCHASE_ORDER_po-1' } }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actionType: 'SUBMIT' }) }));
    expect(globalDb.auditLog.create).not.toHaveBeenCalled();
  });
});
