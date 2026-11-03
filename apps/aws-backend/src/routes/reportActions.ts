import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

// Helper to get user authentication details
async function getUserAuthDetails(sessionId: string | null) {
  let user = null;
  if (sessionId) {
    user = await prisma.user.findUnique({ where: { id: sessionId } });
  }
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'SYSTEM_ADMIN';
  return { user, isSuperAdmin };
}

// Helper to construct project filtering conditions based on auth and active project ID
function getProjectFilter(isSuperAdmin: boolean, sessionId: string | null, activeProjectId: string | null) {
  const filter: any = {};
  if (!isSuperAdmin && sessionId) {
    filter.userAssignments = { some: { userId: sessionId, assignmentStatus: 'active' } };
  }
  if (activeProjectId) {
    filter.id = activeProjectId;
  }
  return filter;
}

// AWS Express endpoint for getFinancialReport
router.post('/getFinancialReport', async (req, res) => {
  try {
    // Extract arguments (sessionId, activeProjectId) from req.body
    const { sessionId, activeProjectId } = req.body;

    const { isSuperAdmin } = await getUserAuthDetails(sessionId);
    const projectFilter = getProjectFilter(isSuperAdmin, sessionId, activeProjectId);

    const projects = await prisma.project.findMany({
      where: projectFilter,
      select: {
        id: true,
        name: true,
        contractAmount: true,
        status: true,
        expenses: {
          select: { amount: true }
        }
      }
    });

    // Calculate outstanding payables globally for now
    const unpaidPOs = await prisma.purchaseOrder.aggregate({
      where: { status: { not: 'PAID' } },
      _sum: { totalAmount: true }
    });

    const report = projects.map(p => {
      const totalExpenses = p.expenses.reduce((sum, exp) => sum + exp.amount, 0);
      return {
        projectId: p.id,
        projectName: p.name,
        status: p.status,
        budget: p.contractAmount || 0,
        expenses: totalExpenses,
        balance: (p.contractAmount || 0) - totalExpenses
      };
    });

    res.json({
      success: true,
      projectFinancials: report,
      globalOutstandingPayables: unpaidPOs._sum.totalAmount || 0
    });
  } catch (error: any) {
    console.error('Error in getFinancialReport:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// AWS Express endpoint for getProjectReport
router.post('/getProjectReport', async (req, res) => {
  try {
    const { sessionId, activeProjectId } = req.body;

    const { isSuperAdmin } = await getUserAuthDetails(sessionId);
    const projectFilter = getProjectFilter(isSuperAdmin, sessionId, activeProjectId);

    const projects = await prisma.project.findMany({
      where: projectFilter,
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        awardedBoqItems: {
          select: { percentageAccomplished: true }
        }
      }
    });

    const report = projects.map(p => {
      let avgAccomplishment = 0;
      if (p.awardedBoqItems.length > 0) {
        const sum = p.awardedBoqItems.reduce((acc, item) => acc + (item.percentageAccomplished || 0), 0);
        avgAccomplishment = sum / p.awardedBoqItems.length;
      }

      return {
        projectId: p.id,
        projectName: p.name,
        status: p.status,
        startDate: p.startDate,
        endDate: p.endDate,
        accomplishment: avgAccomplishment
      };
    });

    res.json({ success: true, data: report });
  } catch (error: any) {
    console.error('Error in getProjectReport:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// AWS Express endpoint for getInventoryReport
router.post('/getInventoryReport', async (req, res) => {
  try {
    const { sessionId, activeProjectId } = req.body;

    const { isSuperAdmin } = await getUserAuthDetails(sessionId);

    const inventoryFilter: any = {
      deliveredQty: {
        gt: prisma.consolidatedBOQItem.fields.consumedQty // Assuming this direct field comparison is valid in your Prisma setup
      }
    };

    // Apply user assignment filter for related project if not super admin
    if (!isSuperAdmin && sessionId) {
      inventoryFilter.project = {
        userAssignments: { some: { userId: sessionId, assignmentStatus: 'active' } }
      };
    }
    // Apply active project ID filter directly on the ConsolidatedBOQItem table
    if (activeProjectId) {
      inventoryFilter.projectId = activeProjectId;
    }

    const items = await prisma.consolidatedBOQItem.findMany({
      where: inventoryFilter,
      select: {
        id: true,
        category: true,
        description: true,
        unitCost: true,
        deliveredQty: true,
        consumedQty: true
      }
    });

    const report = items.map(item => {
      const qoh = item.deliveredQty - item.consumedQty;
      return {
        stockId: item.id,
        category: item.category || 'Uncategorized',
        description: item.description,
        quantityOnHand: qoh,
        estimatedUnitCost: item.unitCost,
        totalEstimatedValue: qoh * item.unitCost
      };
    });

    res.json({ success: true, data: report });
  } catch (error: any) {
    console.error('Error in getInventoryReport:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
