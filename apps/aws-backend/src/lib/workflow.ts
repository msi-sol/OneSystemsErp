import { prisma } from './prisma';
import { PrismaClient } from '@prisma/client';
import { requirePermission } from './permissions';

export async function submitTransaction(
  userId: string, 
  userRole: string, 
  moduleName: string, 
  transactionId: string,
  simulatedRole?: string
) {
  await requirePermission(userId, moduleName, 'canSubmit', simulatedRole);

  await prisma.transactionWorkflow.upsert({
    where: {
      id: `${moduleName}_${transactionId}`
    },
    update: {
      currentStatus: 'SUBMITTED',
      currentStage: 'REVIEW',
      preparedBy: userId,
      preparedByRole: userRole,
      datePrepared: new Date()
    },
    create: {
      id: `${moduleName}_${transactionId}`,
      moduleName,
      transactionId,
      preparedBy: userId,
      preparedByRole: userRole,
      currentStatus: 'SUBMITTED',
      currentStage: 'REVIEW',
      datePrepared: new Date()
    }
  });

  await logAudit(userId, userRole, moduleName, transactionId, 'SUBMIT', 'DRAFT', 'SUBMITTED');
}

export async function approveTransaction(
  userId: string,
  userRole: string,
  moduleName: string,
  transactionId: string,
  remarks?: string,
  simulatedRole?: string
) {
  await requirePermission(userId, moduleName, 'canApprove', simulatedRole);

  let workflow = await prisma.transactionWorkflow.findFirst({
    where: { moduleName, transactionId }
  });

  if (!workflow) {
    workflow = await prisma.transactionWorkflow.create({
      data: {
        id: `${moduleName}_${transactionId}`,
        moduleName,
        transactionId,
        preparedBy: userId,
        preparedByRole: userRole,
        currentStatus: 'SUBMITTED',
        currentStage: 'REVIEW',
        datePrepared: new Date()
      }
    });
  }
  
  if (workflow.preparedBy === userId && userRole !== 'SUPER_ADMIN' && userRole !== 'ADMIN') {
    throw new Error("Self-approval is strictly prohibited by system rules.");
  }

  await prisma.transactionWorkflow.update({
    where: { id: workflow.id },
    data: {
      currentStatus: 'APPROVED',
      currentStage: 'PAYMENT_PROCESSING',
      approvedBy: userId,
      approvedByRole: userRole,
      dateApproved: new Date(),
      remarks
    }
  });

  await logAudit(userId, userRole, moduleName, transactionId, 'APPROVE', workflow.currentStatus, 'APPROVED', remarks);
}

export async function logAudit(
  userId: string | null,
  userRole: string | null,
  moduleName: string,
  transactionId: string,
  actionType: string,
  oldValue?: string,
  newValue?: string,
  remarks?: string
) {
  await prisma.auditLog.create({
    data: {
      userId,
      userRole,
      moduleName,
      transactionId,
      actionType,
      oldValue,
      newValue,
      remarks
    }
  });
}

export async function lockRecord(
  userId: string,
  moduleName: string,
  transactionId: string,
  reason?: string,
  simulatedRole?: string
) {
  await requirePermission(userId, moduleName, 'canLock', simulatedRole);

  await prisma.lockedRecord.upsert({
    where: {
      moduleName_transactionId: {
        moduleName,
        transactionId
      }
    },
    update: {
      lockedBy: userId,
      lockedAt: new Date(),
      reason
    },
    create: {
      moduleName,
      transactionId,
      lockedBy: userId,
      reason
    }
  });
  
  await logAudit(userId, null, moduleName, transactionId, 'LOCK_RECORD', undefined, 'LOCKED', reason);
}
