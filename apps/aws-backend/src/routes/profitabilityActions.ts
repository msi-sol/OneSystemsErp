import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router, Request, Response } from 'express';
import { computeProfitability } from '../../../../src/lib/finance/project-profitability';
const router = Router();

router.post('/getProjectProfitability', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId is required.' });
    }

    // 1. Contract revenue: the awarded BOQ (approved items, or all items while none are marked approved).
    const awardedItems = await prisma.awardedBOQItem.findMany({ where: { projectId, status: 'APPROVED' } });
    const activeAwardedItems = awardedItems.length > 0 ? awardedItems : await prisma.awardedBOQItem.findMany({ where: { projectId } });

    // 2. Target cost: the master materials list (copied from the procurement benchmark), with each material's
    //    benchmark lines and their BOQ links so material costs can be shown per BOQ item.
    const [materials, benchmark, costLedger, commitmentLedger, orderedLines] = await Promise.all([
      prisma.consolidatedBOQItem.findMany({
        where: { projectId },
        select: { id: true, totalCost: true, unitCost: true, mappings: { select: { awardedBoqItemId: true, procurementBenchmarkItem: { select: { totalCost: true } } } } },
      }),
      prisma.procurementBenchmarkItem.aggregate({ where: { projectId }, _sum: { totalCost: true } }),
      // 3. Actual cost (approved ledger) and 4. commitments.
      prisma.projectCostLedger.findMany({ where: { projectId, approvalStatus: 'APPROVED' } }),
      prisma.commitmentLedger.findMany({ where: { projectId, status: 'ACTIVE' } }),
      // Ordered lines: purchase orders that are approved or further along.
      prisma.purchaseOrderItem.findMany({
        where: { po: { mr: { projectId }, status: { notIn: ['DRAFT', 'FOR_REVIEW', 'CANCELLED', 'CANCELED', 'REJECTED', 'RETURNED', 'VOIDED'] } } },
        select: { consolidatedBoqItemId: true, quantity: true, unitCost: true },
      }),
    ]);

    // 5. Metrics (see src/lib/finance/project-profitability.ts for the rules).
    const result = computeProfitability({
      awardedItems: activeAwardedItems.map(item => ({ id: item.id, itemCode: item.itemCode, description: item.description, totalCost: item.totalCost })),
      materials: materials.map(item => ({
        id: item.id, totalCost: item.totalCost, unitCost: item.unitCost,
        links: item.mappings.map(mapping => ({ awardedBoqItemId: mapping.awardedBoqItemId, weight: mapping.procurementBenchmarkItem?.totalCost ?? 1 })),
      })),
      benchmarkTotal: benchmark._sum.totalCost || 0,
      costs: costLedger.map(entry => ({ netAmount: entry.netAmount, costCategory: entry.costCategory, consolidatedBoqItemId: entry.consolidatedBoqItemId, awardedBoqItemId: entry.awardedBoqItemId })),
      commitments: commitmentLedger.map(entry => ({ approvedAmount: entry.approvedAmount, remainingCommitment: entry.remainingCommitment, commitmentType: entry.commitmentType, consolidatedBoqItemId: entry.consolidatedBoqItemId, awardedBoqItemId: entry.awardedBoqItemId, createdAt: entry.createdAt })),
      orderedLines,
    });
    const { actualCostIncurred, committedCost } = result;

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

    return res.json({
      success: true,
      data: {
        ...result,
        cashFlow: {
          totalBilled,
          totalCollected,
          uncollectedBilling,
          totalPayables,
          cashSurplus
        },
      }
    });

  } catch (error: any) {
    console.error('Profitability fetch error (AWS):', error);
    return res.status(500).json({ success: false, error: error.message || 'An unexpected error occurred.' });
  }
});

export default router;
