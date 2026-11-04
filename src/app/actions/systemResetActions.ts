'use server';
import { verifySession } from '@/lib/dal/auth';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { seedRoleAccounts, type TemporaryCredential } from '@/lib/role-account-seed';
import type { Prisma } from '@prisma/client';

export async function resetTransactionData(confirmationText: string) {
  try {
    const cookieStore = await cookies();
    const __session = await verifySession();
  const sessionId = __session?.id || '';

    if (!sessionId) throw new Error('Unauthorized');
    const currentUser = await prisma.user.findUnique({ where: { id: sessionId }});
    const userCount = await prisma.user.count();
    if (userCount > 0 && currentUser?.role !== 'SUPER_ADMIN') {
      throw new Error('Unauthorized Action: Only SUPER_ADMIN can perform a master reset.');
    }
    
    // ============================================================================
    // PHASE 1: Delete all transactional data in correct FK dependency order
    // Uses a single batch $transaction (array mode) for atomicity.
    // If ANY delete fails, the ENTIRE transaction rolls back — nothing is lost.
    // ============================================================================
    await prisma.$transaction([
      // --- Logs, AI Results, Activity Tracking ---
      prisma.aIValidationLog.deleteMany({}),
      prisma.auditLog.deleteMany({}),
      prisma.aIValidationEvidence.deleteMany({}),
      prisma.aIValidationFinding.deleteMany({}),
      prisma.aIDuplicatePhotoCheck.deleteMany({}),
      prisma.aIHumanReview.deleteMany({}),
      prisma.aIValidationRun.deleteMany({}),
      prisma.aIWorkerValidationResult.deleteMany({}),
      prisma.aIValidationResult.deleteMany({}),
      prisma.aIReferenceUsageLog.deleteMany({}),
      prisma.aINotification.deleteMany({}),
      prisma.aISearchLog.deleteMany({}),
      prisma.aIAuditFinding.deleteMany({}),
      prisma.aIRiskScore.deleteMany({}),
      prisma.aIValidationOverride.deleteMany({}),
      prisma.aITransactionValidation.deleteMany({}),
      prisma.notebookReferenceApprovalLog.deleteMany({}),
      prisma.notebookReferenceIndexLog.deleteMany({}),
      prisma.userLoginLog.deleteMany({}),
      prisma.paymentLog.deleteMany({}),
      prisma.payrollAuditLog.deleteMany({}),
      // --- Transaction Workflows & Locks ---
      prisma.revisionRequest.deleteMany({}),
      prisma.lockedRecord.deleteMany({}),
      prisma.transactionWorkflow.deleteMany({}),
      // --- Canvassing & Procurement ---
      prisma.quotationItem.deleteMany({}),
      prisma.supplierQuotation.deleteMany({}),
      prisma.canvassItem.deleteMany({}),
      prisma.canvassForm.deleteMany({}),
      prisma.purchaseOrderItem.deleteMany({}),
      prisma.purchaseOrder.deleteMany({}),
      prisma.materialRequestItem.deleteMany({}),
      prisma.materialRequest.deleteMany({}),
      // --- Equipment ---
      prisma.equipmentAIValidation.deleteMany({}),
      prisma.equipmentTelemetry.deleteMany({}),
      prisma.equipmentMaintenance.deleteMany({}),
      prisma.equipmentUtilization.deleteMany({}),
      prisma.equipmentDeployment.deleteMany({}),
      prisma.equipment.deleteMany({}),
      // --- Delivery & Inventory ---
      prisma.accountsPayable.deleteMany({}),
      prisma.deliveryItem.deleteMany({}),
      prisma.delivery.deleteMany({}),
      prisma.consumptionItem.deleteMany({}),
      prisma.consumptionLog.deleteMany({}),
      prisma.returnItem.deleteMany({}),
      prisma.materialReturn.deleteMany({}),
      prisma.issuanceItem.deleteMany({}),
      prisma.materialIssuance.deleteMany({}),
      // --- Expenses & Petty Cash ---
      prisma.expenseApprovalLog.deleteMany({}),
      prisma.expenseAIValidation.deleteMany({}),
      prisma.expenseProofFile.deleteMany({}),
      prisma.expenseBreakdownItem.deleteMany({}),
      prisma.pettyCashExpense.deleteMany({}),
      prisma.pettyCashReplenishment.deleteMany({}),
      prisma.expense.deleteMany({}),
      prisma.pettyCashAccount.deleteMany({}),
      // --- Subcontracting ---
      prisma.subcontractBilling.deleteMany({}),
      prisma.subcontractAccomplishment.deleteMany({}),
      prisma.jobOrder.deleteMany({}),
      prisma.subcontractorBOQItem.deleteMany({}),
      prisma.programOfWorks.deleteMany({}),
      prisma.subcontractPackage.deleteMany({}),
      prisma.backCharge.deleteMany({}),
      // --- Payments & Banking ---
      prisma.accomplishmentRecord.deleteMany({}),
      prisma.paymentRecord.deleteMany({}),
      prisma.paymentFallbackRecommendation.deleteMany({}),
      prisma.paymentException.deleteMany({}),
      prisma.paymentBatchRow.deleteMany({}),
      prisma.paymentBatch.deleteMany({}),
      // --- Payroll & HR ---
      prisma.payrollFundingRequest.deleteMany({}),
      prisma.payrollApproval.deleteMany({}),
      prisma.deductionLog.deleteMany({}),
      prisma.deductionLedger.deleteMany({}),
      prisma.payrollDeduction.deleteMany({}),
      prisma.payrollEarning.deleteMany({}),
      prisma.allowance.deleteMany({}),
      prisma.payroll.deleteMany({}),
      prisma.dailyTimeRecord.deleteMany({}),
      prisma.workerDocument.deleteMany({}),
      prisma.payrollPeriod.deleteMany({}),
      prisma.worker.deleteMany({}),
      // --- Accomplishments, Billings, Variation Orders ---
      prisma.projectAccomplishmentAIFinding.deleteMany({}),
      prisma.projectAccomplishmentFileVersion.deleteMany({}),
      prisma.projectAccomplishmentFile.deleteMany({}),
      prisma.bOQLotBreakdown.deleteMany({}),
      prisma.accomplishmentItem.deleteMany({}),
      prisma.accomplishment.deleteMany({}),
      prisma.inspection.deleteMany({}),
      prisma.billingDeduction.deleteMany({}),
      prisma.billingItem.deleteMany({}),
      prisma.billing.deleteMany({}),
      prisma.payment.deleteMany({}),
      prisma.aIVariationOrderValidation.deleteMany({}),
      prisma.variationOrderDocument.deleteMany({}),
      prisma.variationOrderApproval.deleteMany({}),
      prisma.variationOrderItem.deleteMany({}),
      prisma.variationOrder.deleteMany({}),
      // --- Documents & Evidence ---
      prisma.evidenceFile.deleteMany({}),
      prisma.projectCamera.deleteMany({}),
      prisma.liveCameraSnapshot.deleteMany({}),
      // --- Core Master Data (Projects, BOQs, Suppliers, Subcontractors) ---
      prisma.bOQMapping.deleteMany({}),
      prisma.awardedBOQItem.deleteMany({}),
      prisma.consolidatedBOQItem.deleteMany({}),
      prisma.scheduleRevisionRequest.deleteMany({}),
      prisma.scheduleRecoveryPlan.deleteMany({}),
      prisma.scheduleDelayRecord.deleteMany({}),
      prisma.scheduleProgressUpdate.deleteMany({}),
      prisma.schedulePOWMapping.deleteMany({}),
      prisma.scheduleBOQAllocation.deleteMany({}),
      prisma.scheduleMilestone.deleteMany({}),
      prisma.scheduleDependency.deleteMany({}),
      prisma.scheduleActivity.deleteMany({}),
      prisma.scheduleWBS.deleteMany({}),
      prisma.projectSchedule.deleteMany({}),
      prisma.projectUserAssignment.deleteMany({}),
      prisma.project.deleteMany({}),
      prisma.supplier.deleteMany({}),
      prisma.subcontractor.deleteMany({}),
    ]);

    // ============================================================================
    // PHASE 2: Seed reference data templates
    // This is a SEPARATE transaction so even if seeding fails,
    // the wipe is already committed and we don't leave partial state.
    // ============================================================================
    let temporaryCredentials: TemporaryCredential[] = [];
    try {
      temporaryCredentials = await prisma.$transaction(async (tx) => {
        // Seed sample workers
        await tx.worker.createMany({
          data: [
            { firstName: 'Sample', lastName: 'Foreman', designation: 'Foreman', workerCategory: 'SKILLED', dailyRate: 800 },
            { firstName: 'Sample', lastName: 'Mason', designation: 'Mason', workerCategory: 'SKILLED', dailyRate: 650 },
            { firstName: 'Sample', lastName: 'Carpenter', designation: 'Carpenter', workerCategory: 'SKILLED', dailyRate: 650 },
            { firstName: 'Sample', lastName: 'Helper 1', designation: 'Helper', workerCategory: 'UNSKILLED', dailyRate: 500 },
            { firstName: 'Sample', lastName: 'Helper 2', designation: 'Helper', workerCategory: 'UNSKILLED', dailyRate: 500 }
          ]
        });

        // Seed sample subcontractors
        await tx.subcontractor.createMany({
          data: [
            { name: 'Sample Steel Works Subcon', businessType: 'CORPORATION', contactPerson: 'Juan Dela Cruz' },
            { name: 'Sample Painting Subcon', businessType: 'CORPORATION', contactPerson: 'Pedro Penduko' },
            { name: 'Sample Electrical Subcon', businessType: 'CORPORATION', contactPerson: 'John Doe' },
            { name: 'Sample Plumbing Subcon', businessType: 'CORPORATION', contactPerson: 'Jane Doe' },
            { name: 'Sample Tile Works Subcon', businessType: 'CORPORATION', contactPerson: 'Mario Rossi' }
          ]
        });

        // Seed sample suppliers
        await tx.supplier.createMany({
          data: [
            { name: 'Sample Hardware Supplier', contactPerson: 'Supplier Contact 1' },
            { name: 'Sample Cement Supplier', contactPerson: 'Supplier Contact 2' },
            { name: 'Sample Electrical Supplier', contactPerson: 'Supplier Contact 3' },
            { name: 'Sample Lumber Supplier', contactPerson: 'Supplier Contact 4' },
            { name: 'Sample Paints Supplier', contactPerson: 'Supplier Contact 5' }
          ]
        });

        // Clean up old sample users that were previously seeded
        await tx.userRole.deleteMany({ where: { user: { email: { startsWith: 'sample.' } } } });
        await tx.user.deleteMany({ where: { email: { startsWith: 'sample.' } } });

        // Make sure the role-based accounts exist; existing accounts keep their passwords
        const issued = await seedRoleAccounts(tx as unknown as Prisma.TransactionClient);

        // Log the reset action
        await tx.auditLog.create({
          data: {
            user: { connect: { id: currentUser ? currentUser.id : "system" } },
            remarks: `MASTER RESET: All transactional and master data wiped. Only Users, System Roles, Access Matrix, and Knowledge Base preserved. Temporary passwords issued: ${issued.length}.`,
            moduleName: 'SYSTEM_SETTINGS',
            actionType: 'DELETE'
          }
        });

        return issued;
      }, { timeout: 30000 });
    } catch (seedError: any) {
      console.error('Seeding after reset failed (non-critical):', seedError);
      // The wipe succeeded, seeding is best-effort
    }

    // ============================================================================
    // PROTECTED (NOT deleted):
    //   User, UserRole, SystemRole, Role, RolePermission, Module,
    //   WorkflowTemplate, WorkflowStep, RoleConflictRule,
    //   AIValidationRule, AIModulePrompt,
    //   KnowledgeRecord, KnowledgeReference, KnowledgeAuditTrail,
    //   KnowledgeRuleReference, KnowledgeRuleAuditLog,
    //   NotebookReference*, AINotebookReference,
    //   DocumentTemplate,
    //   GovernmentSettings, SSSTable, BIRWithholdingTaxTable,
    //   PayrollCutoffSetting,
    //   PayrollBankAccount, PayrollBankLedger, PaymentProvider, ReceivingBank
    // ============================================================================

    revalidatePath('/', 'layout');
    return { success: true, temporaryCredentials };
  } catch (error: any) {
    console.error('Failed to reset transaction data:', error);
    return { success: false, error: error.message };
  }
}

export async function getCurrentUserRole() {
  try {
    const cookieStore = await cookies();
    const __session = await verifySession();
  const sessionId = __session?.id || '';
    const simulatedRole = cookieStore.get('simulatedRole')?.value;
    
    if (simulatedRole) return simulatedRole;
    if (!sessionId) return null;

    const currentUser = await prisma.user.findUnique({ where: { id: sessionId }});
    
    if (!currentUser) {
      const userCount = await prisma.user.count();
      if (userCount === 0) return 'SUPER_ADMIN';
    }

    return currentUser?.role || null;
  } catch (e: any) {
    console.error('Failed to get current user role:', e);
    return null;
  }
}
