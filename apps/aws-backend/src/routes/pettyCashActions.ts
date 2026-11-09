import { prisma } from '../lib/prisma';
import { postExpenseToCostLedger } from '../services/expense-cost-ledger';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { validateTransactionWithAI } from '../lib/aiValidation'; // Adjust path as per AWS project structure

const router = Router();

// Helper to convert ISO strings back to Date objects for specific fields if needed
// Prisma often handles this automatically, but explicitly converting can prevent issues
function convertDatesInBody(body: any, dateFields: string[]) {
  const newBody = { ...body };
  for (const field of dateFields) {
    if (newBody[field] && typeof newBody[field] === 'string') {
      newBody[field] = new Date(newBody[field]);
    }
  }
  return newBody;
}

router.post('/createPettyCashAccount', async (req, res) => {
  try {
    const data = req.body;
    const account = await prisma.pettyCashAccount.create({
      data: {
        accountName: data.accountName,
        department: data.department || null,
        fundLimit: data.fundLimit,
        replenishmentTrigger: data.replenishmentTrigger || null,
        currentBalance: data.fundLimit, // Initial balance is the full limit
        projectId: data.projectId || null,
        custodianId: data.custodianId,
        approverId: data.approverId || null,
        reviewerId: data.reviewerId || null,
      }
    });
    return res.json({ success: true, account });
  } catch (error: any) {
    console.error('Error creating PC account:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/updatePettyCashAccount', async (req, res) => {
  try {
    const { id, data } = req.body;
    const account = await prisma.pettyCashAccount.update({
      where: { id },
      data: {
        accountName: data.accountName,
        fundLimit: data.fundLimit,
        projectId: data.projectId || null,
        custodianId: data.custodianId,
      }
    });
    return res.json({ success: true, account });
  } catch (error: any) {
    console.error('Error updating PC account:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/logPettyCashExpense', async (req, res) => {
  try {
    const rawData = req.body;
    const data = convertDatesInBody(rawData, ['date']); // Ensure date is a Date object

    // === AI VALIDATION INTERCEPTOR ===
    const validation = await validateTransactionWithAI(
      'Expense Ledger', // using Expense Ledger since policies usually cover all expenses
      {
        action: 'Log Petty Cash Expense',
        payee: data.payee,
        purpose: data.purpose,
        category: data.category,
        amount: data.amount,
        hasReceipt: !data.isNoReceipt
      },
      data.issuedById || 'unknown',
      'USER' // Default role for now
    );

    if (validation.validationStatus === 'BLOCKING ISSUE') {
      return res.status(403).json({ 
        success: false, 
        error: `AI Blocked Transaction: ${validation.findings}`,
        validationLogId: validation.validationLogId 
      });
    }
    // =================================

    await prisma.$transaction(async (tx) => {
      // 1. Get the account and check balance
      const account = await tx.pettyCashAccount.findUnique({ where: { id: data.accountId } });
      if (!account) throw new Error('Account not found');
      if (account.currentBalance < data.amount) throw new Error('Insufficient petty cash balance');

      // 2. Optional: Create General Expense entry if billable to project
      let generalExpenseId = null;
      if (data.createGeneralExpense && data.projectId && data.issuedById) {
        const genExp = await tx.expense.create({
          data: {
            project: { connect: { id: data.projectId } },
            receiptRef: `PC-${Date.now()}`,
            date: data.date,
            category: data.category,
            description: data.purpose,
            loggedBy: { connect: { id: data.issuedById } },
            supplierName: data.payee,
            netAmount: data.netAmount,
            vatAmount: data.vatAmount,
            amount: data.amount,
            isAccrued: false,
            breakdownItems: {
              create: [{
                description: data.purpose,
                quantity: 1,
                unit: 'lot',
                unitCost: data.netAmount,
                totalCost: data.netAmount,
                supplierName: data.payee
              }]
            }
          }
        });
        generalExpenseId = genExp.id;
      }

      // 3. Create Petty Cash Expense
      const pcExpense = await tx.pettyCashExpense.create({
        data: {
          account: { connect: { id: data.accountId } },
          date: data.date,
          payee: data.payee,
          purpose: data.purpose,
          category: data.category,
          amount: data.amount,
          isVat: data.isVat,
          netAmount: data.netAmount,
          vatAmount: data.vatAmount,
          billingEligibility: data.billingEligibility,
          receiptNumber: data.receiptNumber || null,
          attachmentUrl: data.attachmentUrl || null,
          isNoReceipt: data.isNoReceipt,
          remarks: data.remarks || null,
          status: 'PENDING',
          ...(generalExpenseId ? { expense: { connect: { id: generalExpenseId } } } : {})
        }
      });

      // 4. Update Account Balance
      await tx.pettyCashAccount.update({
        where: { id: data.accountId },
        data: { currentBalance: { decrement: data.amount } }
      });
    });

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error logging PC expense:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/createPettyCashReplenishment', async (req, res) => {
  try {
    const { accountId, expenseIds } = req.body;
    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.pettyCashAccount.findUnique({ where: { id: accountId } });
      if (!account) throw new Error('Account not found');

      // Verify all expenses are valid and PENDING
      const expenses = await tx.pettyCashExpense.findMany({
        where: {
          id: { in: expenseIds },
          accountId: accountId,
          status: 'PENDING',
          replenishmentId: null
        }
      });

      if (expenses.length !== expenseIds.length) {
        throw new Error('Some expenses are invalid or already replenished.');
      }

      const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

      // Create the Replenishment Request
      const req = await tx.pettyCashReplenishment.create({
        data: {
          accountId,
          requestNumber: `PCR-${Date.now()}`,
          status: 'DRAFT',
          fundLimit: account.fundLimit,
          beginningBalance: account.fundLimit, // Typically it's replenished back to fund limit
          totalExpenses: totalExpenses,
          cashOnHand: account.currentBalance,
          amountRequested: totalExpenses, // Usually request exactly what was spent
        }
      });

      // Link expenses to this replenishment
      await tx.pettyCashExpense.updateMany({
        where: { id: { in: expenseIds } },
        data: { replenishmentId: req.id }
      });

      return { success: true, req };
    });
    return res.json(result);
  } catch (error: any) {
    console.error('Error creating PC replenishment:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/submitPettyCashReplenishment', async (req, res) => {
  try {
    const { id } = req.body;
    await prisma.pettyCashReplenishment.update({
      where: { id },
      data: { status: 'SUBMITTED' }
    });
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error submitting PC replenishment:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/processPettyCashReplenishment', async (req, res) => {
  try {
    const { id, action, reviewerRemarks, approverId } = req.body;
    const actorId: string | undefined = req.body.sessionId || approverId; // signed-in reviewer
    const result = await prisma.$transaction(async (tx) => {
      const req = await tx.pettyCashReplenishment.findUnique({ where: { id } });
      if (!req) throw new Error('Request not found');

      const status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      
      const updated = await tx.pettyCashReplenishment.update({
        where: { id },
        data: {
          status,
          reviewerAction: action,
          reviewerRemarks: reviewerRemarks || null,
          approverId: approverId || null,
          approvalDate: action === 'APPROVE' ? new Date() : null,
        }
      });

      // Approving the replenishment approves its project expenses (the liquidation was reviewed) and posts them to
      // the project's actual cost; they used to stay DRAFT forever and never counted as project cost.
      if (action === 'APPROVE') {
        const linked = await tx.pettyCashExpense.findMany({ where: { replenishmentId: id, expenseId: { not: null } }, select: { expenseId: true } });
        for (const { expenseId } of linked) {
          const expense = await tx.expense.findUnique({ where: { id: expenseId! } });
          if (!expense || expense.status === 'APPROVED' || expense.status === 'REJECTED') continue;
          await tx.expense.update({ where: { id: expense.id }, data: { status: 'APPROVED', approvalStatus: 'APPROVED', approverId: actorId || null } });
          await postExpenseToCostLedger(tx, expense, actorId || expense.loggedById, 'PETTY_CASH');
        }
      }

      // If rejected, unlink the expenses so they can be grouped again
      if (action === 'REJECT') {
        await tx.pettyCashExpense.updateMany({
          where: { replenishmentId: id },
          data: { replenishmentId: null, status: 'PENDING' }
        });
      }

      return { success: true, req: updated };
    });
    return res.json(result);
  } catch (error: any) {
    console.error('Error processing PC replenishment:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/releasePettyCashReplenishment', async (req, res) => {
  try {
    const { id, releaseMode, releaseRefNo, receiverId } = req.body;
    const result = await prisma.$transaction(async (tx) => {
      const req = await tx.pettyCashReplenishment.findUnique({ 
        where: { id },
        include: { account: true, expenses: true }
      });
      if (!req || req.status !== 'APPROVED') throw new Error('Request not found or not approved');

      // Update request to RELEASED and CLOSED
      const updated = await tx.pettyCashReplenishment.update({
        where: { id },
        data: {
          status: 'CLOSED',
          releaseDate: new Date(),
          releaseMode,
          releaseRefNo,
          receiverId
        }
      });

      // Mark all expenses as LIQUIDATED
      await tx.pettyCashExpense.updateMany({
        where: { replenishmentId: id },
        data: { status: 'LIQUIDATED' }
      });

      // Restore Account Balance
      await tx.pettyCashAccount.update({
        where: { id: req.accountId },
        data: { currentBalance: { increment: req.amountRequested } }
      });

      return { success: true, req: updated };
    });
    return res.json(result);
  } catch (error: any) {
    console.error('Error releasing PC replenishment:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
