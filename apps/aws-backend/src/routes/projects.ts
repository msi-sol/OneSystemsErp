import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
// Helper to extract PBAC context from headers
function getPbacContext(req: any) {
  return {
    userId: req.headers['x-user-session'] as string | undefined,
    activeProjectId: req.headers['x-active-project-id'] as string | undefined,
    simulatedRole: req.headers['x-simulated-role'] as string | undefined,
  };
}

router.get('/dashboard-stats', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    let { activeProjectId } = getPbacContext(req);

    if (activeProjectId && activeProjectId !== 'ALL') {
      const projectExists = await prisma.project.findUnique({ where: { id: activeProjectId } });
      if (!projectExists) {
        activeProjectId = undefined;
      }
    }

    let projectIds: string[] | undefined = undefined;

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { projectAssignments: { where: { assignmentStatus: 'active' } } }
      });

      if (user) {
        const effectiveRole = (simulatedRole && (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'PROJECT_DIRECTOR' || user.role === 'DIRECTORS'))
          ? simulatedRole
          : (user.role || 'GUEST_USER');

        const isSuperAdmin = effectiveRole === 'SUPER_ADMIN' || effectiveRole === 'SYSTEM_ADMIN';

        if (!isSuperAdmin) {
          projectIds = user.projectAssignments.map(pa => pa.projectId);
        }
      }
    }

    let relationProjectFilter: any = {};
    if (activeProjectId && activeProjectId !== 'ALL') {
      relationProjectFilter = { projectId: activeProjectId };
    } else if (projectIds !== undefined) {
      relationProjectFilter = { projectId: { in: projectIds } };
    }

    let portfolioFilter: any = { status: { in: ['ACTIVE', 'ONGOING', 'STARTED', 'PLANNING'] } };
    if (projectIds !== undefined) {
      portfolioFilter.id = { in: projectIds };
    }

    const totalProjects = await prisma.project.count({ where: portfolioFilter });
    const totalUsers = await prisma.user.count();

    const pendingMRs = await prisma.materialRequest.count({
      where: { status: 'PENDING', ...relationProjectFilter },
    });

    const allPortfolioProjects = await prisma.project.findMany({
      where: portfolioFilter,
      select: { contractAmount: true },
    });
    const totalBudget = allPortfolioProjects.reduce((sum, p) => sum + (p.contractAmount || 0), 0);

    const expenses = await prisma.expense.aggregate({
      where: relationProjectFilter,
      _sum: { amount: true },
    });
    const totalExpenses = expenses._sum.amount || 0;

    const apWhere: any = { status: { not: 'PAID' } };
    if (relationProjectFilter.projectId) {
      apWhere.po = { mr: { projectId: relationProjectFilter.projectId } };
    }
    const unpaidAP = await prisma.accountsPayable.aggregate({
      where: apWhere,
      _sum: { amount: true },
    });

    const sbWhere: any = { paymentStatus: { not: 'PAID' } };
    if (relationProjectFilter.projectId) {
      sbWhere.projectId = relationProjectFilter.projectId;
    }
    const unpaidSubcontract = await prisma.subcontractBilling.aggregate({
      where: sbWhere,
      _sum: { netPayable: true },
    });

    const totalPayables = (unpaidAP._sum.amount || 0) + (unpaidSubcontract._sum.netPayable || 0);

    const boqStats = await prisma.awardedBOQItem.aggregate({
      where: relationProjectFilter,
      _avg: { percentageAccomplished: true },
    });
    const accomplishmentPercentage = boqStats._avg.percentageAccomplished || 0;

    const pendingAIOverrides = await prisma.aIValidationOverride.count({
      where: { approvedBy: null }
    });

    const pendingPettyCash = await prisma.pettyCashAccount.count({
      where: { currentBalance: { lt: 5000 }, ...relationProjectFilter }
    });

    const activePayrollPeriods = await prisma.payrollPeriod.count({
      where: { status: { in: ['DRAFT', 'PROCESSING', 'PENDING_APPROVAL'] }, ...relationProjectFilter }
    });

    const activePurchaseOrders = await prisma.purchaseOrder.count({
      where: {
        status: { in: ['PENDING', 'APPROVED', 'PARTIAL_DELIVERY'] },
        mr: relationProjectFilter.projectId ? { projectId: relationProjectFilter.projectId } : undefined
      }
    });

    const expectedDeliveries = await prisma.purchaseOrder.count({
      where: {
        status: { in: ['APPROVED', 'PARTIAL_DELIVERY'] },
        mr: relationProjectFilter.projectId ? { projectId: relationProjectFilter.projectId } : undefined
      }
    });

    const pendingMRFs = await prisma.materialRequest.count({
      where: { status: 'PENDING', ...relationProjectFilter }
    });

    const openCanvassing = await prisma.canvassForm.count({
      where: {
        status: { in: ['DRAFT', 'PENDING', 'OPEN', 'FOR_REVIEW'] },
        projectId: relationProjectFilter.projectId
      }
    });

    const totalWorkers = await prisma.worker.count({
      where: relationProjectFilter.projectId ? { projectId: relationProjectFilter.projectId } : undefined
    });
    const totalSubcontractors = await prisma.subcontractor.count();
    const totalSuppliers = await prisma.supplier.count();
    const totalAccomplishments = await prisma.accomplishment.count({
      where: relationProjectFilter
    });
    const totalIssuances = await prisma.materialIssuance.count({
      where: relationProjectFilter
    });
    const totalAuditLogs = await prisma.auditLog.count();
    const totalDailyLogs = await prisma.dailyTimeRecord.count({
      where: relationProjectFilter.projectId ? { projectId: relationProjectFilter.projectId } : undefined
    });
    const totalDocuments = await prisma.document.count({
      where: relationProjectFilter.projectId ? { projectId: relationProjectFilter.projectId } : undefined
    });
    const totalJobOrders = await prisma.jobOrder.count({
      where: relationProjectFilter
    });
    const totalVariationOrders = await prisma.variationOrder.count({
      where: relationProjectFilter
    });

    res.json({
      totalProjects,
      pendingMRs,
      totalBudget,
      totalUsers,
      totalExpenses,
      totalPayables,
      accomplishmentPercentage,
      pendingAIOverrides,
      pendingPettyCash,
      activePayrollPeriods,
      activePurchaseOrders,
      expectedDeliveries,
      pendingMRFs,
      openCanvassing,
      totalWorkers,
      totalSubcontractors,
      totalSuppliers,
      totalAccomplishments,
      totalIssuances,
      totalAuditLogs,
      totalDailyLogs,
      totalDocuments,
      totalJobOrders,
      totalVariationOrders
    });
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

router.post('/:id/assign-manager', async (req, res) => {
  try {
    const { id } = req.params;
    const { managerId } = req.body;
    await prisma.project.update({
      where: { id },
      data: { managerId }
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error assigning manager:', error);
    res.status(500).json({ error: error.message || 'Failed to assign manager' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, simulatedRole } = getPbacContext(req);

    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized: Please log in' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized: User not found' });

    const effectiveRole = simulatedRole ? simulatedRole : user.role;

    if (effectiveRole !== 'SUPER_ADMIN' && effectiveRole !== 'SYSTEM_ADMIN') {
      return res.status(403).json({ success: false, error: 'Unauthorized: Only SUPER_ADMIN can delete projects' });
    }

    await prisma.$transaction([
      prisma.projectUserAssignment.deleteMany({ where: { projectId: id } }),
      prisma.project.delete({ where: { id } })
    ]);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting project:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete project' });
  }
});

router.post('/:id/dates', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDateStr, durationDays } = req.body;

    const startDate = new Date(startDateStr);
    const originalCompletionDate = new Date(startDate);
    originalCompletionDate.setDate(originalCompletionDate.getDate() + durationDays);

    const project = await prisma.project.update({
      where: { id },
      data: {
        startDate,
        originalContractDuration: durationDays,
        originalCompletionDate,
        revisedCompletionDate: originalCompletionDate,
      },
      include: {
        projectSchedule: true
      }
    });

    res.json({ success: true, hasSchedule: !!project.projectSchedule });
  } catch (error: any) {
    console.error('Error updating project dates:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update project dates' });
  }
});

export default router;
