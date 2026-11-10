'use server';
import { verifySession } from '@/lib/dal/auth';

import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { isApprovedBilling, subcontractBillingOutstanding, supplierCostNotYetExpensed, supplierPayableOutstanding } from '@/lib/finance/payables';

async function _getAccessDetails() {
  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionToken = __session?.id || '';
  const simulatedRoleFromRequest = cookieStore.get('simulatedRole')?.value;

  const userId = sessionToken || ''; 

  if (!userId) {
    throw new Error('Unauthorized: Session token missing');
  }

  // Disabled requirePermission for NextJS server action to prevent dependency cycle
  // await requirePermission(userId, 'PROJECT_MANAGEMENT', 'canView'); 
  
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('Unauthorized: User not found');

  const effectiveRole = (simulatedRoleFromRequest && (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'PROJECT_DIRECTOR' || user.role === 'DIRECTORS')) 
    ? simulatedRoleFromRequest 
    : (user.role || 'GUEST_USER');

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
export async function getCompanyOverview(projectId?: string) {
  try {
    const { user, effectiveRole } = await _getAccessDetails();
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
          where: { status: { in: ['APPROVED', 'SUBMITTED', 'PARTIALLY_PAID', 'PAID'] } },
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
          where: { approvalStatus: { not: 'REJECTED' } },
          select: { currentGross: true, netPayable: true, approvalStatus: true, status: true, paymentStatus: true, packageId: true, jobOrderId: true, payments: { select: { amountPaid: true } } }
        },
        materialRequests: {
          select: {
            purchaseOrders: {
              select: {
                payables: {
                  select: { amount: true, paidAmount: true, netAmount: true, status: true }
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
      const approvedSubcontract = p.subcontractBillings.filter(isApprovedBilling);
      const projectSubcontract = approvedSubcontract.reduce((sum, sb) => sum + sb.currentGross, 0);
      const supplierPayables = p.materialRequests.flatMap(mr => mr.purchaseOrders.flatMap(po => po.payables));
      // Delivered materials are a cost once received; paid/accrued ones are already in expenses.
      const projectMaterialsNotExpensed = supplierPayables.reduce((sum, payable) => sum + supplierCostNotYetExpensed(payable), 0);

      totalActualCost += (projectExpenses + projectPayrolls + projectSubcontract + projectMaterialsNotExpensed);

      // Payables: what is still owed (not the unbilled contract balance).
      approvedSubcontract.forEach(sb => {
        const owed = subcontractBillingOutstanding(sb);
        if (sb.packageId) totalSubcontractPayables += owed;
        else if (sb.jobOrderId) totalJobOrderPayables += owed;
      });
      supplierPayables.forEach(payable => { totalSupplierPayables += supplierPayableOutstanding(payable); });

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
      totalPayablesOutstanding: totalSubcontractPayables + totalJobOrderPayables + totalSupplierPayables,
      totalCriticalRisks,
      
      // Derived Metrics
      overallProgressPercentage: totalContractAmount > 0 ? (totalBilledAmount / totalContractAmount) * 100 : 0,
      costToDateRatio: totalContractAmount > 0 ? (totalActualCost / totalContractAmount) * 100 : 0
    };

    return result;
  } catch (error: any) {
    console.error('Error in getCompanyOverview:', error);
    throw new Error(error.message || 'Failed to get company overview');
  }
}

/**
 * Retrieves the project portfolio list for the executive dashboard
 */
export async function getProjectPortfolio() {
  try {
    const { user, effectiveRole } = await _getAccessDetails();
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
          where: { status: { in: ['APPROVED', 'SUBMITTED', 'PARTIALLY_PAID', 'PAID'] } },
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
        riskLevel: (p as any).projectValidationScore?.riskLevel || 'GRAY',
        validationConfidenceScore: (p as any).projectValidationScore?.validationConfidenceScore || 0
      };
    });

    return result;
  } catch (error: any) {
    console.error('Error in getProjectPortfolio:', error);
    throw new Error(error.message || 'Failed to get project portfolio');
  }
}
