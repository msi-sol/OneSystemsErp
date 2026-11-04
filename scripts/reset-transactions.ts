import { PrismaClient } from '@prisma/client';
import path from 'path';
import { createResetBackup } from '../src/lib/reset-backup';

const prisma = new PrismaClient();

export async function main() {
  console.log('Starting Safe Zero Data / Fresh Simulation Reset...');

  try {
    // 1. Back up the database first. A failure here stops the reset.
    const backupPath = await createResetBackup(prisma);

    // 2. Perform the deletions
    console.log('Deleting transaction data in safe dependency order...');
    await prisma.$transaction(async (tx) => {
      // AI & Activity Logs
      await tx.aIValidationLog.deleteMany({});
      await tx.auditLog.deleteMany({});
      await tx.aIValidationEvidence.deleteMany({});
      await tx.aIValidationFinding.deleteMany({});
      await tx.aIDuplicatePhotoCheck.deleteMany({});
      await tx.aIHumanReview.deleteMany({});
      await tx.aIValidationRun.deleteMany({});
      await tx.aIWorkerValidationResult.deleteMany({});
      await tx.aIValidationResult.deleteMany({});

      // Subcontracting
      await tx.subcontractBilling.deleteMany({});
      await tx.subcontractAccomplishment.deleteMany({});
      await tx.jobOrder.deleteMany({});
      await tx.subcontractPackage.deleteMany({});
      await tx.subcontractorBOQItem.deleteMany({});
      await tx.backCharge.deleteMany({});
      await tx.accomplishmentRecord.deleteMany({});
      await tx.paymentRecord.deleteMany({});

      // Banking and Payments
      await tx.paymentFallbackRecommendation.deleteMany({});
      await tx.paymentException.deleteMany({});
      await tx.paymentBatchRow.deleteMany({});
      await tx.paymentBatch.deleteMany({});
      await tx.payrollFundingRequest.deleteMany({});
      await tx.payrollBankLedger.deleteMany({});
      await tx.payrollBankAccount.deleteMany({});
      await tx.receivingBank.deleteMany({});
      await tx.paymentProvider.deleteMany({});
      await tx.paymentLog.deleteMany({});

      // Knowledge Base and Validations are specifically PRESERVED.

      // Payroll & HR
      await tx.payrollAuditLog.deleteMany({});
      await tx.payrollApproval.deleteMany({});
      await tx.deductionLog.deleteMany({});
      await tx.deductionLedger.deleteMany({});
      await tx.payrollDeduction.deleteMany({});
      await tx.payrollEarning.deleteMany({});
      await tx.payroll.deleteMany({});
      await tx.payrollPeriod.deleteMany({});
      await tx.dailyTimeRecord.deleteMany({});
      await tx.workerDocument.deleteMany({});

      // Petty Cash
      await tx.pettyCashExpense.deleteMany({});
      await tx.pettyCashReplenishment.deleteMany({});
      await tx.pettyCashAccount.deleteMany({});

      // Expenses
      await tx.expenseApprovalLog.deleteMany({});
      await tx.expenseAIValidation.deleteMany({});
      await tx.expenseProofFile.deleteMany({});
      await tx.expenseBreakdownItem.deleteMany({});
      await tx.expense.deleteMany({});

      // Procurement & Inventory
      await tx.accountsPayable.deleteMany({});
      await tx.deliveryItem.deleteMany({});
      await tx.delivery.deleteMany({});
      await tx.consumptionItem.deleteMany({});
      await tx.consumptionLog.deleteMany({});
      await tx.returnItem.deleteMany({});
      await tx.materialReturn.deleteMany({});
      await tx.issuanceItem.deleteMany({});
      await tx.materialIssuance.deleteMany({});
      await tx.purchaseOrderItem.deleteMany({});
      await tx.purchaseOrder.deleteMany({});
      await tx.materialRequestItem.deleteMany({});
      await tx.materialRequest.deleteMany({});

      // Project Accomplishment & Billing
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
      await tx.variationOrder.deleteMany({});
      await tx.evidenceFile.deleteMany({});
      await tx.projectCamera.deleteMany({});
      await tx.liveCameraSnapshot.deleteMany({});
      await tx.documentTemplate.deleteMany({});
      await tx.document.deleteMany({});

      // BOQ & Project
      await tx.bOQMapping.deleteMany({});
      await tx.awardedBOQItem.deleteMany({});
      await tx.consolidatedBOQItem.deleteMany({});
      await tx.project.deleteMany({});
      
      // Finally, log this massive reset action into AuditLog
      const systemAdmin = await tx.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
      const auditLogData: any = {
        remarks: 'ZERO_DATA_RESET: Transactional data has been successfully cleared via CLI script. Backup: ' + path.basename(backupPath),
        moduleName: 'SYSTEM_SETTINGS',
        actionType: 'DELETE',
        ipAddress: 'CLI'
      };
      if (systemAdmin) {
        auditLogData.user = { connect: { id: systemAdmin.id } };
      }
      await tx.auditLog.create({ data: auditLogData });
    }, {
      timeout: 60000 // Allow up to 60s for the transaction
    });

    console.log('✅ Successfully cleared all transaction data.');
    console.log('✅ Master data, users, roles, and settings have been preserved.');
  } catch (error) {
    console.error('❌ Failed to clear transaction data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) main();
