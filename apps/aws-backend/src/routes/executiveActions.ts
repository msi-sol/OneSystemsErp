import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requirePermission } from '../lib/permissions'; // Adjust path based on your AWS backend setup

const router = Router();

/**
 * Internal helper function to validate user access and retrieve effective role.
 * This replaces the original getUserId and checkExecutiveAccess which relied on Next.js cookies.
 * The necessary sessionToken and simulatedRole are now passed from the Next.js frontend in the request body.
 */
async function _getAccessDetails(sessionToken: string, simulatedRoleFromRequest?: string) {
  const userId = sessionToken || ''; // Assuming sessionToken directly contains the userId

  if (!userId) {
    throw new Error('Unauthorized: Session token missing');
  }

  await requirePermission(userId, 'PROJECT_MANAGEMENT', 'canView'); // Base requirement
  
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('Unauthorized: User not found');

  // Support role simulation: use simulatedRoleFromRequest if valid, otherwise user's actual role
  const effectiveRole = (simulatedRoleFromRequest && (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'PROJECT_DIRECTOR' || user.role === 'DIRECTORS')) 
    ? simulatedRoleFromRequest 
    : (user.role || 'GUEST_USER');

  // Check if effective role is in the allowed executive roles list
  const allowedRoles = [
    'SYSTEM_ADMIN',
    'SUPER_ADMIN',
    'PROJECT_DIRECTOR',
    'DIRECTORS',
    'PROJECT_MANAGER',
    'ADMINISTRATOR',
    'ADMIN'
  ];

  if (!allowedRoles.includes(effectiveRole)) {
    throw new Error('Unauthorized: Executive access required');
  }

  return { user, effectiveRole };
}

/**
 * Retrieves the high-level company overview KPIs for the Executive Home Dashboard
 */
router.post('/getCompanyOverview', async (req, res) => {
  try {
    const { sessionToken, simulatedRole, projectId } = req.body;

    const { user, effectiveRole } = await _getAccessDetails(sessionToken, simulatedRole);
    const isSuperAdmin = effectiveRole === 'SUPER_ADMIN' || effectiveRole === 'SYSTEM_ADMIN';

    // Fetch all active/ongoing projects or the specific selected project
    const projectFilter: any = { status: { in: ['ACTIVE', 'ONGOING', 'STARTED'] } };
    if (projectId && projectId !== 'ALL') {
      projectFilter.id = projectId;
    }
    
    if (!isSuperAdmin) {
      projectFilter.userAssignments = {
        some: {
          userId: user.id,
          assignmentStatus: 'active'
        }
      };
    }

    const activeProjects = await prisma.project.findMany({
      where: projectFilter,
      select: {
        id: true,
        contractAmount: true,
        variationOrders: {
          where: { currentStatus: 'APPROVED' },
          select: { netVariationAmount: true }
        },
        billings: {
          where: { status: { in: ['APPROVED', 'SUBMITTED', 'PAID'] } },
          select: { currentBillingAmount: true, payments: { select: { amountPaid: true } } }
        },
        expenses: {
          where: { status: 'APPROVED' },
          select: { netAmount: true }
        },
        payrolls: {
          where: { paymentStatus: 'PAID' },
          select: { netPay: true }
        },
        subcontractBillings: {
          where: { approvalStatus: 'APPROVED' },
          select: { currentGross: true, remainingBalance: true, packageId: true, jobOrderId: true }
        },
        materialRequests: {
          select: {
            purchaseOrders: {
              select: {
                payables: {
                  where: { status: { not: 'PAID' } },
                  select: { amount: true, paidAmount: true, status: true }
                }
              }
            }
          }
        },
        _count: {
          select: {
            projectValidations: {
              where: { riskLevel: { in: ['HIGH', 'CRITICAL'] } }
            }
          }
        }
      }
    });

    let totalContractAmount = 0;
    let totalApprovedVOs = 0;
    let totalBilledAmount = 0;
    let totalCollectedAmount = 0;
    let totalOutstandingReceivables = 0;
    let totalActualCost = 0;
    let totalSubcontractPayables = 0;
    let totalJobOrderPayables = 0;
    let totalSupplierPayables = 0;
    let totalCriticalRisks = 0;

    activeProjects.forEach(p => {
      // Contract & VOs
      totalContractAmount += p.contractAmount;
      const projectVOs = p.variationOrders.reduce((sum, vo) => sum + (vo.netVariationAmount || 0), 0);
      totalApprovedVOs += projectVOs;

      // Billings & Collections
      p.billings.forEach(b => {
        totalBilledAmount += b.currentBillingAmount;
        const collected = b.payments.reduce((sum, pmt) => sum + pmt.amountPaid, 0);
        totalCollectedAmount += collected;
        totalOutstandingReceivables += (b.currentBillingAmount - collected);
      });

      // Costs
      const projectExpenses = p.expenses.reduce((sum, e) => sum + e.netAmount, 0);
      const projectPayrolls = p.payrolls.reduce((sum, pr) => sum + (pr.netPay || 0), 0);
      const projectSubcontract = p.subcontractBillings.reduce((sum, sb) => sum + sb.currentGross, 0);
      
      totalActualCost += (projectExpenses + projectPayrolls + projectSubcontract);

      // Payables
      p.subcontractBillings.forEach(sb => {
        if (sb.packageId) totalSubcontractPayables += sb.remainingBalance;
        if (sb.jobOrderId) totalJobOrderPayables += sb.remainingBalance;
      });

      p.materialRequests.forEach(mr => {
        mr.purchaseOrders.forEach(po => {
          po.payables.forEach(payable => {
            if (payable.status === 'ACCRUED') {
              totalSupplierPayables += payable.amount;
            } else {
              totalSupplierPayables += (payable.amount - payable.paidAmount);
            }
          });
        });
      });

      // Risks
      totalCriticalRisks += p._count.projectValidations;
    });

    const result = {
      activeProjectsCount: activeProjects.length,
      totalContractAmount,
      totalApprovedVOs,
      revisedContractAmount: totalContractAmount + totalApprovedVOs,
      totalBilledAmount,
      totalCollectedAmount,
      totalOutstandingReceivables,
      totalActualCost,
      totalSubcontractPayables,
      totalJobOrderPayables,
      totalSupplierPayables,
      totalProjectExpensesToDate: totalSubcontractPayables + totalJobOrderPayables + totalSupplierPayables,
      totalCriticalRisks,
      
      // Derived Metrics
      overallProgressPercentage: totalContractAmount > 0 ? (totalBilledAmount / totalContractAmount) * 100 : 0,
      costToDateRatio: totalContractAmount > 0 ? (totalActualCost / totalContractAmount) * 100 : 0
    };

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error in getCompanyOverview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Retrieves the project portfolio list for the executive dashboard
 */
router.post('/getProjectPortfolio', async (req, res) => {
  try {
    const { sessionToken, simulatedRole } = req.body;

    const { user, effectiveRole } = await _getAccessDetails(sessionToken, simulatedRole);
    const isSuperAdmin = effectiveRole === 'SUPER_ADMIN' || effectiveRole === 'SYSTEM_ADMIN';

    const projects = await prisma.project.findMany({
      where: isSuperAdmin ? undefined : {
        userAssignments: {
          some: {
            userId: user.id,
            assignmentStatus: 'active'
          }
        }
      },
      orderBy: { contractAmount: 'desc' },
      select: {
        id: true,
        name: true,
        contractNumber: true,
        client: true,
        status: true,
        contractAmount: true,
        startDate: true,
        revisedCompletionDate: true,
        originalCompletionDate: true,
        projectValidationScore: true, // Fetch AI risk score
        variationOrders: {
          where: { currentStatus: 'APPROVED' },
          select: { netVariationAmount: true }
        },
        billings: {
          where: { status: { in: ['APPROVED', 'SUBMITTED', 'PAID'] } },
          select: { currentBillingAmount: true, payments: { select: { amountPaid: true } } }
        },
        consolidatedBoqItems: {
          select: { totalCost: true }
        }
      }
    });

    const result = projects.map(p => {
      const totalVOs = p.variationOrders.reduce((sum, vo) => sum + (vo.netVariationAmount || 0), 0);
      const revisedAmount = p.contractAmount + totalVOs;
      const totalBilled = p.billings.reduce((sum, b) => sum + b.currentBillingAmount, 0);
      const progress = revisedAmount > 0 ? (totalBilled / revisedAmount) * 100 : 0;
      const consolidatedCost = p.consolidatedBoqItems.reduce((sum, i) => sum + (i.totalCost || 0), 0);
      
      return {
        ...p,
        totalVOs,
        revisedAmount,
        totalBilled,
        progressPercentage: progress,
        consolidatedCost,
        // Default to GRAY risk if no score exists yet
        riskLevel: p.projectValidationScore?.riskLevel || 'GRAY',
        validationConfidenceScore: p.projectValidationScore?.validationConfidenceScore || 0
      };
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error in getProjectPortfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
