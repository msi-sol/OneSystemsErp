import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

router.post('/validatePayrollPreSubmission', async (req, res) => {
  try {
    const { periodId } = req.body; // Extract argument from req.body

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: {
        payrolls: { include: { worker: true } }
      }
    });

    if (!period) throw new Error('Payroll period not found');
    if (period.payrolls.length === 0) throw new Error('No payrolls generated yet.');

    const criticalErrors: string[] = [];
    const warnings: string[] = [];

    for (const payroll of period.payrolls) {
      const name = `${payroll.worker.firstName} ${payroll.worker.lastName}`;
      
      // 1. Negative or Zero Net Pay
      if (payroll.netPay <= 0) {
        criticalErrors.push(`[${name}] Net Pay is zero or negative (₱${payroll.netPay}). Adjust deductions or allowances.`);
      }

      // 2. High Deductions (Philippine Labor Law generally limits deductions to prevent starvation wages, though not strictly 50%, it's a good flag)
      if (payroll.grossPay > 0 && (payroll.totalDeductions / payroll.grossPay) >= 0.6) {
        criticalErrors.push(`[${name}] Total deductions (₱${payroll.totalDeductions}) exceed 60% of Gross Pay (₱${payroll.grossPay}). This requires manual adjustment.`);
      }

      // 3. Extreme Overtime (OT Pay > Basic Pay)
      if (payroll.overtimePay > payroll.basicPay) {
        warnings.push(`[${name}] Unusual Overtime ratio. OT Pay (₱${payroll.overtimePay}) is higher than Basic Pay (₱${payroll.basicPay}). Verify DTR.`);
      }

      // 4. Missing Government Numbers but deducting
      if (payroll.sssDeduction > 0 && !payroll.worker.sssNumber) {
        warnings.push(`[${name}] SSS is being deducted but the worker has no SSS Number encoded in their profile.`);
      }
      if (payroll.philhealthDeduction > 0 && !payroll.worker.philHealthNumber) {
        warnings.push(`[${name}] PhilHealth is being deducted but the worker has no PhilHealth Number encoded.`);
      }
      if (payroll.pagibigDeduction > 0 && !payroll.worker.pagIbigNumber) {
        warnings.push(`[${name}] Pag-IBIG is being deducted but the worker has no Pag-IBIG Number encoded.`);
      }
    }

    res.json({
      success: true,
      canSubmit: criticalErrors.length === 0,
      criticalErrors,
      warnings
    });

  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to validate payroll.' });
  }
});

router.post('/submitPayrollForReview', async (req, res) => {
  try {
    const { periodId } = req.body; // Extract argument from req.body

    await prisma.payrollPeriod.update({
      where: { id: periodId },
      data: { status: 'FOR_REVIEW' }
    });
    
    // Log Audit
    await prisma.payrollAuditLog.create({
      data: {
        actionType: 'PAYROLL_SUBMIT_REVIEW',
        module: 'PAYROLL',
        recordId: periodId,
        remarks: 'Payroll period submitted to Approver'
      }
    });
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to submit payroll.' });
  }
});

router.post('/approveAndLockPayroll', async (req, res) => {
  try {
    const { periodId } = req.body; // Extract argument from req.body
    // Current user context (mocked for now)
    const currentUserId = 'clxw8xxvj0000vwu4xxw8xxvj'; // This should come from an auth context in a real API

    await prisma.payrollPeriod.update({
      where: { id: periodId },
      data: { 
        status: 'APPROVED',
        isLocked: true,
        lockedAt: new Date(),
        lockedById: currentUserId
      }
    });
    
    // Log Audit
    await prisma.payrollAuditLog.create({
      data: {
        actionType: 'PAYROLL_APPROVED_LOCKED',
        module: 'PAYROLL',
        recordId: periodId,
        remarks: 'Payroll period approved and locked.'
      }
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to approve payroll.' });
  }
});

export default router;
