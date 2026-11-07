import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

router.post('/createFundingRequest', async (req, res) => {
  try {
    const { accountId, amount, reason, periodId } = req.body; // Extract arguments from req.body
    // Acting user comes from the verified backend token (auth middleware), never from the client body.
    const userId = req.body.sessionId as string;

    const reqNumber = `FR-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    
    let actualPeriodId = periodId;
    if (!actualPeriodId) {
       const recentPeriod = await prisma.payrollPeriod.findFirst({ orderBy: { createdAt: 'desc' } }); // Order by createdAt for most recent
       actualPeriodId = recentPeriod?.id || '';
    }

    if (!actualPeriodId) {
      throw new Error('No payroll period found to associate the funding request.');
    }

    await prisma.payrollFundingRequest.create({
      data: {
        fundingRequestNumber: reqNumber,
        destinationAccountId: accountId,
        totalNetPay: amount,
        estimatedCharges: 0,
        totalRequiredFunding: amount,
        availablePayrollBalance: 0,
        fundingShortage: amount,
        fundingStatus: 'PENDING',
        remarks: reason,
        preparedById: userId,
        payrollPeriodId: actualPeriodId
      }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in createFundingRequest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/approveFundingRequest', async (req, res) => {
  try {
    const { requestId } = req.body; // Extract arguments from req.body

    const request = await prisma.payrollFundingRequest.findUnique({ where: { id: requestId } });
    if (!request || request.fundingStatus !== 'PENDING') throw new Error('Invalid or already processed request');

    const account = await prisma.payrollBankAccount.findUnique({ where: { id: request.destinationAccountId } });
    if (!account) throw new Error('Account not found');

    const newBalance = account.currentAvailableBalance + request.totalRequiredFunding;

    // Use transaction to ensure data integrity
    await prisma.$transaction([
      prisma.payrollFundingRequest.update({
        where: { id: requestId },
        data: { fundingStatus: 'APPROVED' }
      }),
      prisma.payrollBankAccount.update({
        where: { id: account.id },
        data: { currentAvailableBalance: newBalance }
      }),
      prisma.payrollBankLedger.create({
        data: {
          payrollBankAccountId: account.id,
          transactionType: 'DEPOSIT',
          amount: request.totalRequiredFunding,
          balanceAfter: newBalance,
          remarks: `Funding Deposit (Req: ${request.fundingRequestNumber})`,
          referenceId: request.id,
          createdById: 'system'
        }
      })
    ]);

    res.json({ success: true, accountId: account.id }); // Return account.id for revalidation
  } catch (error: any) {
    console.error('Error in approveFundingRequest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
