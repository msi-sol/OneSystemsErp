import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requirePermission } from '../lib/permissions'; // Adjust path as necessary
import { submitTransaction } from '../lib/workflow'; // Adjust path as necessary

const router = Router();

router.post('/generatePaymentBatch', async (req, res) => {
  try {
    const { periodId, paymentMethodType, payrollBankAccountId } = req.body;
    // Acting user comes from the verified backend token (auth middleware), never from the client body.
    const userId = req.body.sessionId as string;

    if (!periodId || !paymentMethodType || !payrollBankAccountId || !userId) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) throw new Error('User not found');

    // Requires canReleasePayment because a batch explicitly triggers payment processing
    await requirePermission(currentUser.id, 'PAYROLL', 'canReleasePayment');

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: {
        payrolls: {
          where: {
            worker: {
              allowedPaymentMethod: paymentMethodType === 'GCASH' ? 'GCash Only' : 'Bank Transfer Only'
            },
            paymentStatus: { in: ['PENDING', 'UNPAID'] } // Assuming 'PENDING' or 'UNPAID'
          },
          include: { worker: true }
        }
      }
    });

    if (!period) throw new Error('Payroll period not found');
    if (!period.isLocked) throw new Error('Payroll must be locked to generate batches');
    if (period.payrolls.length === 0) throw new Error(`No eligible unpaid payslips found for ${paymentMethodType}`);

    // Create the Batch
    const batchNumber = `BAT-${paymentMethodType}-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const totalAmount = period.payrolls.reduce((sum, p) => sum + p.netPay, 0);

    const account = await prisma.payrollBankAccount.findUnique({ where: { id: payrollBankAccountId } });
    if (!account) throw new Error('Funding account not found');

    if (account.currentAvailableBalance < totalAmount) {
      const shortage = totalAmount - account.currentAvailableBalance;
      return res.json({ success: false, error: 'Insufficient funds', shortage });
    }

    // Wrap batch creation and balance reserve in a transaction
    const [batch] = await prisma.$transaction([
      prisma.paymentBatch.create({
      data: {
        batchNumber,
        payrollPeriodId: periodId,
        paymentMethodType,
        payrollBankAccountId,
        status: 'DRAFT',
        totalAmount,
        totalWorkers: period.payrolls.length,
        preparedById: userId,
        rows: {
          create: period.payrolls.map(p => ({
            payrollId: p.id,
            workerId: p.workerId,
            amount: p.netPay,
            status: 'PENDING'
          }))
        }
      }
      }),
      prisma.payrollBankAccount.update({
        where: { id: account.id },
        data: {
          currentAvailableBalance: { decrement: totalAmount },
          reservedPayrollBalance: { increment: totalAmount }
        }
      })
    ]);

    // Link payslips
    await prisma.payroll.updateMany({
      where: { id: { in: period.payrolls.map(p => p.id) } },
      data: { paymentBatchId: batch.id }
    });

    await submitTransaction(currentUser.id, currentUser.role || 'FINANCE_OFFICER', 'PAYROLL', batch.id);

    // Note: revalidatePath is a Next.js specific function and should not be run on the backend.
    // The Next.js proxy action will handle revalidation.

    return res.json({ success: true, batchId: batch.id });
  } catch (error: any) {
    console.error('Error generating payment batch:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
