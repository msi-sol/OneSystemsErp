import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

// Mock reconciliation that simulates updating batch rows based on a file upload
router.post('/reconcileBatch', async (req, res) => {
  try {
    const { batchId, results, userId } = req.body;

    if (!batchId || !results || !userId) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const batch = await prisma.paymentBatch.findUnique({
      where: { id: batchId },
      include: { rows: true }
    });

    if (!batch) {
      return res.status(404).json({ success: false, error: 'Batch not found' });
    }

    // Simulate applying results
    for (const result of results) {
      const row = batch.rows.find(r => r.payrollId === result.payslipId);
      if (row) {
        await prisma.paymentBatchRow.update({
          where: { id: row.id },
          data: {
            status: result.status,
            transactionReference: result.reference || null,
            reconciledAt: new Date()
          }
        });

        // Update Payroll status
        await prisma.payroll.update({
          where: { id: row.payrollId },
          data: {
            paymentStatus: result.status === 'SUCCESSFUL' ? 'PAID' : 'FAILED',
            transactionReference: result.reference || null
          }
        });
      }
    }

    // Check if entire batch is complete
    const updatedRows = await prisma.paymentBatchRow.findMany({ where: { paymentBatchId: batchId } });
    const allProcessed = updatedRows.every(r => r.status === 'SUCCESSFUL' || r.status === 'FAILED');
    
    if (allProcessed) {
      await prisma.paymentBatch.update({
        where: { id: batchId },
        data: { status: 'RELEASED', dateReleased: new Date(), releasedById: userId }
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error reconciling batch:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
