import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { submitTransaction, approveTransaction } from '../lib/workflow';
import { requirePermission } from '../lib/permissions';

const router = Router();

router.post('/createFundingRequest', async (req, res) => {
  try {
    const { periodId, destinationAccountId, userId, boqItemId } = req.body; // userId should be provided by authenticated request

    // In a production backend, userId would typically be derived from an authenticated session/token,
    // not directly from req.body. For this migration, we use the provided userId for actions and permissions.
    await requirePermission(userId, 'PAYROLL', 'canSubmit');

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: { payrolls: true }
    });

    if (!period) {
      return res.status(404).json({ success: false, error: 'Payroll period not found' });
    }
    if (!period.isLocked) {
      return res.status(400).json({ success: false, error: 'Payroll must be locked before requesting funding' });
    }

    const totalNetPay = period.payrolls.reduce((sum, p) => sum + p.netPay, 0);
    const estimatedCharges = 500;
    const totalRequiredFunding = totalNetPay + estimatedCharges;

    const account = await prisma.payrollBankAccount.findUnique({
      where: { id: destinationAccountId }
    });

    if (!account) {
      return res.status(404).json({ success: false, error: 'Destination account not found' });
    }

    const availablePayrollBalance = account.currentAvailableBalance;
    const fundingShortage = Math.max(0, totalRequiredFunding - availablePayrollBalance);

    const fundingRequestNumber = `FR-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    const request = await prisma.payrollFundingRequest.create({
      data: {
        fundingRequestNumber,
        payrollPeriodId: periodId,
        destinationAccountId,
        totalNetPay,
        estimatedCharges,
        totalRequiredFunding,
        availablePayrollBalance,
        fundingShortage,
        preparedById: userId,
        fundingStatus: 'PENDING'
      }
    });

    // The original code hardcoded 'HR_OFFICER' role for submitTransaction. In a real app,
    // this role would be derived from the authenticated user's actual role.
    await submitTransaction(userId, 'HR_OFFICER', 'PAYROLL', request.id);

    if (boqItemId) {
      const awardedItem = await prisma.awardedBOQItem.findUnique({
        where: { id: boqItemId }
      });
      
      const targetProjectId = period.projectId || awardedItem?.projectId;

      if (targetProjectId) {
        await prisma.expense.create({
          data: {
            amount: totalRequiredFunding,
            netAmount: totalNetPay,
            vatAmount: 0,
            date: new Date(),
            category: 'PAYROLL',
            description: `Payroll Funding Request ${fundingRequestNumber}`,
            receiptRef: fundingRequestNumber,
            status: 'PENDING',
            projectId: targetProjectId,
            loggedById: userId,
            awardedBoqItemId: boqItemId
          }
        });
      }
    }

    return res.json({ success: true, requestId: request.id });
  } catch (error: any) {
    console.error('Error creating funding request:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/approveFundingRequest', async (req, res) => {
  try {
    const { requestId, userId } = req.body; // userId should be provided by authenticated request

    const request = await prisma.payrollFundingRequest.findUnique({
      where: { id: requestId },
      include: { destinationAccount: true }
    });

    if (!request) {
      return res.status(404).json({ success: false, error: 'Funding request not found' });
    }
    
    // Fetch the user's role for permissions and maker-checker validation.
    const actingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!actingUser) {
      return res.status(403).json({ success: false, error: 'User not found or unauthorized' });
    }

    await requirePermission(actingUser.id, 'PAYROLL', 'canApprove');
      
    // Enforce Maker-Checker
    if (request.preparedById === actingUser.id && actingUser.role !== 'SUPER_ADMIN' && actingUser.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Self-approval is strictly prohibited. The Maker cannot be the Approver.' });
    }
    
    await approveTransaction(actingUser.id, actingUser.role, 'PAYROLL', request.id, 'Approved Payroll Funding');

    // Update account balance
    await prisma.payrollBankAccount.update({
      where: { id: request.destinationAccountId },
      data: {
        currentAvailableBalance: { increment: request.totalRequiredFunding },
        reservedPayrollBalance: { increment: request.totalRequiredFunding } 
      }
    });

    // Create Ledger
    // Note: balanceAfter should ideally reflect the state AFTER the update, 
    // but for consistency with original calculation, we use the value before update + increment.
    await prisma.payrollBankLedger.create({
      data: {
        payrollBankAccountId: request.destinationAccountId,
        transactionType: 'FUNDING',
        amount: request.totalRequiredFunding,
        balanceAfter: request.destinationAccount.currentAvailableBalance + request.totalRequiredFunding, 
        referenceId: request.id,
        referenceNumber: request.fundingRequestNumber,
        remarks: 'Funding Approved & Transferred',
        createdById: userId
      }
    });

    // Update Request
    await prisma.payrollFundingRequest.update({
      where: { id: requestId },
      data: {
        fundingStatus: 'FUNDED',
        approvedById: userId,
        dateFunded: new Date()
      }
    });

    // Automatically approve the linked BOQ expense if one exists
    await prisma.expense.updateMany({
      where: { receiptRef: request.fundingRequestNumber },
      data: { status: 'APPROVED', approverId: userId }
    });

    // Return payrollPeriodId for Next.js revalidation
    return res.json({ success: true, payrollPeriodId: request.payrollPeriodId });
  } catch (error: any) {
    console.error('Error approving funding request:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
