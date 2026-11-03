import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

router.post('/validatePaymentBatchWithAI', async (req, res) => {
  try {
    const { batchId } = req.body;

    if (!batchId) {
      return res.status(400).json({ success: false, error: 'batchId is required' });
    }

    const batch = await prisma.paymentBatch.findUnique({
      where: { id: batchId },
      include: {
        rows: {
          include: { worker: true }
        }
      }
    });

    if (!batch) {
      return res.status(404).json({ success: false, error: 'Batch not found' });
    }

    // Build the payload to send to AI
    const payload = batch.rows.map(r => ({
      payslipId: r.payrollId,
      workerName: `${r.worker.firstName} ${r.worker.lastName}`,
      netPay: r.amount,
      targetMethod: batch.paymentMethodType,
      workerAllowedMethod: r.worker.allowedPaymentMethod,
      accountName: batch.paymentMethodType === 'GCASH' ? r.worker.gcashAccountName : r.worker.bankAccountName,
      accountNumber: batch.paymentMethodType === 'GCASH' ? r.worker.gcashNumber : r.worker.bankAccountNumber,
      verificationStatus: batch.paymentMethodType === 'GCASH' ? r.worker.gcashVerificationStatus : r.worker.bankVerificationStatus,
      profileStatus: r.worker.paymentProfileStatus,
      status: (r.worker as any).status
    }));

    let anomalies: string[] = [];
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED' = 'LOW';

    // Simulated AI Rules Engine
    payload.forEach(row => {
      // 1. Inactive Worker
      if (row.status !== 'ACTIVE') {
        anomalies.push(`Worker ${row.workerName} is INACTIVE but included in the batch.`);
        riskLevel = 'BLOCKED';
      }
      
      // 2. Unverified Profile
      if (row.profileStatus !== 'Verified' || row.verificationStatus !== 'Verified') {
        anomalies.push(`Worker ${row.workerName} has an unverified payment profile.`);
        riskLevel = riskLevel === 'BLOCKED' ? 'BLOCKED' : 'HIGH';
      }

      // 3. Mismatched Payment Method
      if (row.targetMethod === 'GCASH' && row.workerAllowedMethod !== 'GCash Only') {
        anomalies.push(`Worker ${row.workerName} is in a GCash batch but allowed method is ${row.workerAllowedMethod}.`);
        riskLevel = 'BLOCKED';
      }

      // 4. Missing Account Details
      if (!row.accountNumber || !row.accountName) {
        anomalies.push(`Worker ${row.workerName} is missing account details.`);
        riskLevel = 'BLOCKED';
      }

      // 5. Unusually High Net Pay Anomaly
      if (row.netPay > 50000) {
        anomalies.push(`Worker ${row.workerName} has an unusually high net pay (₱${row.netPay}). Needs manual review.`);
        if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
      }
    });

    // Simulated duplicate check
    const accountNumbers = payload.map(p => p.accountNumber);
    const duplicates = accountNumbers.filter((item, index) => accountNumbers.indexOf(item) !== index);
    if (duplicates.length > 0) {
      anomalies.push(`Found duplicate account numbers in the batch: ${[...new Set(duplicates)].join(', ')}`);
      riskLevel = 'BLOCKED';
    }

    if (anomalies.length === 0) {
      anomalies.push('No anomalies detected. All profiles are verified and details match routing rules.');
    }

    // Save the audit result
    await prisma.paymentBatch.update({
      where: { id: batchId },
      data: {
        aiRiskLevel: riskLevel,
        aiAuditNotes: anomalies.join('\n')
      }
    });

    return res.json({ success: true, riskLevel, anomalies });
  } catch (error: any) {
    console.error("Error in validatePaymentBatchWithAI:", error);
    return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

export default router;
