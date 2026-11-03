import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

router.post('/holdPayslip', async (req, res) => {
  try {
    const { payslipId, reason } = req.body;
    if (!payslipId || typeof payslipId !== 'string' || !reason || typeof reason !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid input: payslipId and reason are required strings.' });
    }
    await prisma.payroll.update({
      where: { id: payslipId },
      data: {
        paymentStatus: 'ON_HOLD',
        paymentHoldReason: reason
      }
    });
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error holding payslip:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/resolvePayslipException', async (req, res) => {
  try {
    const { payslipId } = req.body;
    if (!payslipId || typeof payslipId !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid input: payslipId is a required string.' });
    }
    await prisma.payroll.update({
      where: { id: payslipId },
      data: {
        paymentStatus: 'PENDING',
        paymentHoldReason: 'Resolved'
      }
    });
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Error resolving payslip exception:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
