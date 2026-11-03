import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

router.post('/createPayrollAccount', async (req, res) => {
  try {
    const { data, userId } = req.body;

    // Validate input if necessary
    if (!data || !userId) {
      return res.status(400).json({ success: false, error: 'Missing data or userId' });
    }

    const account = await prisma.payrollBankAccount.create({
      data: {
        bankName: data.bankName,
        bankBranch: data.bankBranch,
        accountNumber: data.accountNumber,
        accountName: data.accountName,
        currency: data.currency,
        beginningBalance: data.beginningBalance,
        currentAvailableBalance: data.beginningBalance,
        createdById: userId,
        status: 'ACTIVE'
      }
    });

    // Create opening ledger entry
    if (data.beginningBalance > 0) {
      await prisma.payrollBankLedger.create({
        data: {
          payrollBankAccountId: account.id,
          transactionType: 'DEPOSIT',
          amount: data.beginningBalance,
          balanceAfter: data.beginningBalance,
          remarks: 'Opening Balance',
          createdById: userId
        }
      });
    }

    res.json({ success: true, accountId: account.id });
  } catch (error: any) {
    console.error('Error creating payroll account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
