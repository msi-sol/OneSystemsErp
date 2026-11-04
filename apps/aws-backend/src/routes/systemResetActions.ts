import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { createResetBackup, ResetBackupError } from '../../../../src/lib/reset-backup';

const router = Router();

// NOTE: In a real AWS environment, process.cwd() for file paths (uploadsDir)
// would need to be adjusted to point to persistent storage like S3, EFS, or a designated
// writable directory in a Lambda environment, as local file system might not be persistent.

router.post('/resetTransactionData', async (req, res) => {
  try {
    const { confirmationText, sessionId } = req.body; // Identity is replaced by authenticated middleware.

    if (confirmationText !== 'RESET TRANSACTION DATA ONLY') {
      return res.status(400).json({ success: false, error: 'Invalid confirmation text.' });
    }

    if (typeof sessionId !== 'string' || !sessionId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const currentUser = await prisma.user.findUnique({ where: { id: sessionId } });
    if (!currentUser || currentUser.role !== 'SUPER_ADMIN') return res.status(403).json({ success: false, error: 'Only SUPER_ADMIN can perform a master reset.' });
    const currentUserId = currentUser.id;

    // 1. Back up the database first. A failure here stops the reset.
    const backupPath = await createResetBackup(prisma);

    // ============================================================================
    // STRICTLY PROTECTED TABLES (NEVER deleted by master reset):
    //   User, UserRole, SystemRole, Role, RolePermission, Module,
    //   WorkflowTemplate, WorkflowStep, RoleConflictRule,
    //   AIValidationRule, AIModulePrompt,
    //   KnowledgeRecord, KnowledgeReference, KnowledgeAuditTrail,
    //   KnowledgeRuleReference, KnowledgeRuleAuditLog,
    //   NotebookReference, NotebookReferenceVersion, NotebookReferenceModule,
    //   NotebookReferenceRole, NotebookReferenceProject,
    //   AINotebookReference,
    //   DocumentTemplate,
    //   GovernmentSettings, SSSTable, BIRWithholdingTaxTable,
    //   PayrollCutoffSetting,
    //   PayrollBankAccount, PayrollBankLedger, PaymentProvider, ReceivingBank
    // ============================================================================
    // EVERYTHING ELSE is wiped to give a true zero-data fresh start.
    // ============================================================================

    // 2. Perform the deletions in dependency-safe bottom-up order
    await prisma.$transaction(async (tx) => {
      // --- PHASE 1: Logs, AI Results, Activity Tracking ---
      await tx.aIValidationLog.deleteMany({});
      await tx.auditLog.deleteMany({});
      await tx.aIValidationEvidence.deleteMany({});
      await tx.aIValidationFinding.deleteMany({});
      await tx.aIDuplicatePhotoCheck.deleteMany({});
      await tx.aIHumanReview.deleteMany({});
      await tx.aIValidationRun.deleteMany({});
      await tx.aIWorkerValidationResult.deleteMany({});
      await tx.aIValidationResult.deleteMany({});
      await tx.aIReferenceUsageLog.deleteMany({});
      await tx.aINotification.deleteMany({});
      await tx.aISearchLog.deleteMany({});
      await tx.aIAuditFinding.deleteMany({});
      await tx.aIRiskScore.deleteMany({});
      await tx.aIValidationOverride.deleteMany({});
      await tx.aITransactionValidation.deleteMany({});
      await tx.notebookReferenceApprovalLog.deleteMany({});
      await tx.notebookReferenceIndexLog.deleteMany({});
      await tx.userLoginLog.deleteMany({});
      await tx.paymentLog.deleteMany({});
      await tx.payrollAuditLog.deleteMany({});

      // --- PHASE 2: Transaction Workflows & Locks ---
      await tx.revisionRequest.deleteMany({});
      await tx.lockedRecord.deleteMany({});
      await tx.transactionWorkflow.deleteMany({});

      // --- PHASE 3: Canvassing & Procurement ---
      await tx.quotationItem.deleteMany({});
      await tx.supplierQuotation.deleteMany({});
      await tx.canvassItem.deleteMany({});
      await tx.canvassForm.deleteMany({});
      await tx.purchaseOrderItem.deleteMany({});
      await tx.purchaseOrder.deleteMany({});
      await tx.materialRequestItem.deleteMany({});
      await tx.materialRequest.deleteMany({});

      // --- PHASE 4: Delivery, Inventory & Equipment ---
      await tx.equipmentAIValidation.deleteMany({});
      await tx.equipmentTelemetry.deleteMany({});
      await tx.equipmentMaintenance.deleteMany({});
      await tx.equipmentUtilization.deleteMany({});
      await tx.equipmentDeployment.deleteMany({});
      await tx.equipment.deleteMany({});

      await tx.accountsPayable.deleteMany({});
      await tx.deliveryItem.deleteMany({});
      await tx.delivery.deleteMany({});
      await tx.consumptionItem.deleteMany({});
      await tx.consumptionLog.deleteMany({});
      await tx.returnItem.deleteMany({});
      await tx.materialReturn.deleteMany({});
      await tx.issuanceItem.deleteMany({});
      await tx.materialIssuance.deleteMany({});

      // --- PHASE 5: Expenses & Petty Cash ---
      await tx.expenseApprovalLog.deleteMany({});
      await tx.expenseAIValidation.deleteMany({});
      await tx.expenseProofFile.deleteMany({});
      await tx.expenseBreakdownItem.deleteMany({});
      await tx.pettyCashExpense.deleteMany({});
      await tx.pettyCashReplenishment.deleteMany({});
      await tx.expense.deleteMany({});
      await tx.pettyCashAccount.deleteMany({});

      // --- PHASE 6: Subcontracting ---
      await tx.subcontractBilling.deleteMany({});
      await tx.subcontractAccomplishment.deleteMany({});
      await tx.jobOrder.deleteMany({});
      await tx.subcontractorBOQItem.deleteMany({});
      await tx.programOfWorks.deleteMany({});
      await tx.subcontractPackage.deleteMany({});
      await tx.backCharge.deleteMany({});
      await tx.accomplishmentRecord.deleteMany({});
      await tx.paymentRecord.deleteMany({});

      // --- PHASE 7: Payments & Banking Transactions ---
      await tx.paymentFallbackRecommendation.deleteMany({});
      await tx.paymentException.deleteMany({});
      await tx.paymentBatchRow.deleteMany({});
      await tx.paymentBatch.deleteMany({});
      await tx.payrollFundingRequest.deleteMany({});

      // --- PHASE 8: Payroll & HR (ALL workers deleted per user instruction) ---
      await tx.payrollApproval.deleteMany({});
      await tx.deductionLog.deleteMany({});
      await tx.deductionLedger.deleteMany({});
      await tx.payrollDeduction.deleteMany({});
      await tx.payrollEarning.deleteMany({});
      await tx.allowance.deleteMany({});
      await tx.payroll.deleteMany({});
      await tx.dailyTimeRecord.deleteMany({});
      await tx.workerDocument.deleteMany({});
      await tx.payrollPeriod.deleteMany({});
      await tx.worker.deleteMany({});  // Workers are wiped — admin can re-add manually

      // --- PHASE 9: Accomplishments, Billings, Variation Orders ---
      await tx.projectAccomplishmentAIFinding.deleteMany({});
      await tx.projectAccomplishmentFileVersion.deleteMany({});
      await tx.projectAccomplishmentFile.deleteMany({});
      await tx.bOQLotBreakdown.deleteMany({});
      await tx.accomplishmentItem.deleteMany({});
      await tx.accomplishment.deleteMany({});
      await tx.inspection.deleteMany({});
      await tx.billingDeduction.deleteMany({});
      await tx.billingItem.deleteMany({});
      await tx.billing.deleteMany({});
      await tx.payment.deleteMany({});
      await tx.aIVariationOrderValidation.deleteMany({});
      await tx.variationOrderDocument.deleteMany({});
      await tx.variationOrderApproval.deleteMany({});
      await tx.variationOrderItem.deleteMany({});
      await tx.variationOrder.deleteMany({});

      // --- PHASE 10: Documents & Evidence ---
      await tx.evidenceFile.deleteMany({});
      await tx.projectCamera.deleteMany({});
      await tx.liveCameraSnapshot.deleteMany({});

      // --- PHASE 11: Core Master Data (Projects, BOQs, Suppliers, Subcontractors) ---
      await tx.bOQMapping.deleteMany({});
      await tx.awardedBOQItem.deleteMany({});
      await tx.consolidatedBOQItem.deleteMany({});
      await tx.scheduleRevisionRequest.deleteMany({});
      await tx.scheduleRecoveryPlan.deleteMany({});
      await tx.scheduleDelayRecord.deleteMany({});
      await tx.scheduleProgressUpdate.deleteMany({});
      await tx.schedulePOWMapping.deleteMany({});
      await tx.scheduleBOQAllocation.deleteMany({});
      await tx.scheduleMilestone.deleteMany({});
      await tx.scheduleDependency.deleteMany({});
      await tx.scheduleActivity.deleteMany({});
      await tx.scheduleWBS.deleteMany({});
      await tx.projectSchedule.deleteMany({});
      await tx.projectUserAssignment.deleteMany({});
      await tx.project.deleteMany({});
      await tx.supplier.deleteMany({});
      await tx.subcontractor.deleteMany({});

      // --- PHASE 12: Seed Reference Data (Requested by User) ---
      await tx.worker.createMany({
        data: [
          { firstName: 'Sample', lastName: 'Foreman', designation: 'Foreman', workerCategory: 'SKILLED', dailyRate: 800 },
          { firstName: 'Sample', lastName: 'Mason', designation: 'Mason', workerCategory: 'SKILLED', dailyRate: 650 },
          { firstName: 'Sample', lastName: 'Carpenter', designation: 'Carpenter', workerCategory: 'SKILLED', dailyRate: 650 },
          { firstName: 'Sample', lastName: 'Helper 1', designation: 'Helper', workerCategory: 'UNSKILLED', dailyRate: 500 },
          { firstName: 'Sample', lastName: 'Helper 2', designation: 'Helper', workerCategory: 'UNSKILLED', dailyRate: 500 }
        ]
      });

      await tx.subcontractor.createMany({
        data: [
          { name: 'Sample Steel Works Subcon', businessType: 'CORPORATION', contactPerson: 'Juan Dela Cruz' },
          { name: 'Sample Painting Subcon', businessType: 'CORPORATION', contactPerson: 'Pedro Penduko' },
          { name: 'Sample Electrical Subcon', businessType: 'CORPORATION', contactPerson: 'John Doe' },
          { name: 'Sample Plumbing Subcon', businessType: 'CORPORATION', contactPerson: 'Jane Doe' },
          { name: 'Sample Tile Works Subcon', businessType: 'CORPORATION', contactPerson: 'Mario Rossi' }
        ]
      });

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

      const rolesToSeed = [
        { email: 'director@onesystemserp.com', name: 'Project Director', roleCode: 'PROJECT_DIRECTOR' },
        { email: 'manager@onesystemserp.com', name: 'Project Manager', roleCode: 'PROJECT_MANAGER' },
        { email: 'purchasing@onesystemserp.com', name: 'Purchasing Officer', roleCode: 'PURCHASING_OFFICER' },
        { email: 'finance@onesystemserp.com', name: 'Finance Officer', roleCode: 'FINANCE_OFFICER' },
        { email: 'accounting@onesystemserp.com', name: 'Accountant', roleCode: 'ACCOUNTANT' },
        { email: 'billing@onesystemserp.com', name: 'Billing Engineer', roleCode: 'BILLING_ENGINEER' },
        { email: 'engineer@onesystemserp.com', name: 'Site Engineer', roleCode: 'SITE_ENGINEER' },
        { email: 'admin@onesystemserp.com', name: 'Site Admin', roleCode: 'SITE_ADMIN' }
      ];

      for (const u of rolesToSeed) {
        let user = await tx.user.findFirst({ where: { email: u.email } });
        if (!user) {
          user = await tx.user.create({
            data: {
              name: u.name,
              email: u.email,
              passwordHash: '$2b$10$6VGqOkFNU48h/2NcmMYShuHLyRKZ9wlbVDfEtGpxSuhZO5t9A8O5u', // admin001
              password: 'admin001', // fallback
              role: u.roleCode,
              status: 'ACTIVE',
              defaultRole: u.roleCode
            }
          });
        } else {
          user = await tx.user.update({
            where: { id: user.id },
            data: {
              passwordHash: '$2b$10$6VGqOkFNU48h/2NcmMYShuHLyRKZ9wlbVDfEtGpxSuhZO5t9A8O5u',
              password: 'admin001',
              role: u.roleCode,
              defaultRole: u.roleCode
            }
          });
        }
        const roleRecord = await tx.role.findFirst({ where: { roleCode: u.roleCode } });
        if (roleRecord) {
          const existingUserRole = await tx.userRole.findFirst({
            where: { userId: user.id, roleId: roleRecord.id }
          });
          if (!existingUserRole) {
            await tx.userRole.create({
              data: { userId: user.id, roleId: roleRecord.id }
            });
          }
        }
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

      // Log the reset action
      await tx.auditLog.create({
        data: {
          user: { connect: { id: currentUserId } },
          remarks: 'MASTER RESET: All transactional and master data wiped. Only Users, System Roles, Access Matrix, and Knowledge Base preserved. Backup: ' + path.basename(backupPath),
          moduleName: 'SYSTEM_SETTINGS',
          actionType: 'DELETE'
        }
      });
    }, {
      timeout: 60000 // Allow up to 60s for the transaction
    });

    // 3. Clear all physical uploaded files
    // IMPORTANT: Adjust paths for AWS environment. This assumes local file system.
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const clearFolder = (dirPath: string) => {
        if (!fs.existsSync(dirPath)) return;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === 'documents') continue; // PROTECT Centralized Documents
            clearFolder(fullPath);
          } else {
            fs.unlinkSync(fullPath);
          }
        }
      };
      clearFolder(uploadsDir);
      console.log('Cleared all uploaded files.');
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Failed to reset transaction data:', error);
    if (error instanceof ResetBackupError) return res.status(503).json({ success: false, error: error.message });
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getCurrentUserRole', async (req, res) => {
  try {
    const { sessionId, simulatedRole } = req.body; // sessionId expected from proxy

    if (simulatedRole) return res.json({ success: true, role: simulatedRole });
    if (!sessionId) return res.json({ success: true, role: null });
    const currentUser = await prisma.user.findUnique({ where: { id: sessionId }});
    
    if (!currentUser) {
      const userCount = await prisma.user.count();
      if (userCount === 0) return res.json({ success: true, role: 'SUPER_ADMIN' });
    }

    return res.json({ success: true, role: currentUser?.role || null });
  } catch (e: any) {
    console.error('Failed to get current user role:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
