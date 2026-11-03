import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

router.post('/getProjectProfitability', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId is required.' });
    }

    // 1. Get Awarded BOQ items to calculate Contract Revenue
    const awardedItems = await prisma.awardedBOQItem.findMany({
      where: { projectId, status: 'APPROVED' }
    });

    // Fallback to all if none are specifically marked APPROVED (depends on your workflow)
    const activeAwardedItems = awardedItems.length > 0
      ? awardedItems
      : await prisma.awardedBOQItem.findMany({ where: { projectId } });

    const contractRevenue = activeAwardedItems.reduce((acc, item) => acc + item.totalCost, 0);

    // 2. Get Procurement Benchmark BOQ to calculate Target Execution Cost
    const benchmarkItems = await prisma.consolidatedBOQItem.findMany({
      where: { projectId }
    });

    const targetExecutionCost = benchmarkItems.reduce((acc, item) => acc + item.totalCost, 0);

    // 3. Get Actual Cost from ProjectCostLedger
    const costLedger = await prisma.projectCostLedger.findMany({
      where: { projectId, approvalStatus: 'APPROVED' }
    });

    const actualCostIncurred = costLedger.reduce((acc, entry) => acc + entry.netAmount, 0);

    // 4. Get Committed Cost from CommitmentLedger
    const commitmentLedger = await prisma.commitmentLedger.findMany({
      where: { projectId, status: 'ACTIVE' }
    });

    const committedCost = commitmentLedger.reduce((acc, entry) => acc + entry.remainingCommitment, 0);

    // 5. Calculate Metrics
    const targetProfit = contractRevenue - targetExecutionCost;
    const executionVariance = targetExecutionCost - actualCostIncurred;
    const realizedProfit = contractRevenue - actualCostIncurred;

    // Value Engineering Engine
    const totalExecutionCost = actualCostIncurred + committedCost;
    const veSavings = targetExecutionCost - totalExecutionCost;
    const isOverrun = veSavings < 0;

    const targetProfitMargin = contractRevenue > 0 ? (targetProfit / contractRevenue) * 100 : 0;
    const realizedProfitMargin = contractRevenue > 0 ? (realizedProfit / contractRevenue) * 100 : 0;

    // 6. Cash Flow Calculations
    const billings = await prisma.billing.findMany({
      where: { projectId, status: 'APPROVED' }
    });
    const totalBilled = billings.reduce((acc, b) => acc + b.currentBillingAmount, 0);

    const payments = await prisma.payment.findMany({
      where: {
        billing: { projectId },
        paymentStatus: 'CLEARED'
      }
    });
    const totalCollected = payments.reduce((acc, p) => acc + p.amountPaid, 0);

    // Outstanding Receivables
    const uncollectedBilling = totalBilled - totalCollected;

    // Supplier & Subcon Payables
    const totalPayables = committedCost; // simplify by using committed cost for now

    // Cash Deficit / Surplus
    const cashSurplus = totalCollected - actualCostIncurred;

    // 7. BOQ-Level Profitability
    const boqLevelDetails = activeAwardedItems.map(item => {
      // Find mapped forecast items (if any, although we removed BOQMapping creation, we can approximate or just show actual cost if costLedger has boqItemId)
      const itemActualCost = costLedger
        .filter(entry => entry.awardedBoqItemId === item.id)
        .reduce((sum, entry) => sum + entry.netAmount, 0);

      const itemCommittedCost = commitmentLedger
        .filter(entry => entry.awardedBoqItemId === item.id)
        .reduce((sum, entry) => sum + entry.remainingCommitment, 0);

      const totalItemExecutionCost = itemActualCost + itemCommittedCost;
      const itemProfit = item.totalCost - totalItemExecutionCost;

      return {
        id: item.id,
        itemCode: item.itemCode,
        description: item.description,
        awardedAmount: item.totalCost,
        actualCost: totalItemExecutionCost,
        variance: itemProfit,
        status: itemProfit >= 0 ? 'PROFITABLE' : 'OVERRUN'
      };
    });

    return res.json({
      success: true,
      data: {
        contractRevenue,
        targetExecutionCost,
        actualCostIncurred,
        committedCost,
        totalExecutionCost,
        targetProfit,
        executionVariance,
        realizedProfit,
        veSavings,
        isOverrun,
        targetProfitMargin,
        realizedProfitMargin,
        cashFlow: {
          totalBilled,
          totalCollected,
          uncollectedBilling,
          totalPayables,
          cashSurplus
        },
        boqLevelDetails
      }
    });

  } catch (error: any) {
    console.error('Profitability fetch error (AWS):', error);
    return res.status(500).json({ success: false, error: error.message || 'An unexpected error occurred.' });
  }
});

export default router;
