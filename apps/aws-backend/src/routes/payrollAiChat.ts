import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

router.post('/askPayrollAssistant', async (req, res) => {
  try {
    const { question } = req.body;

    if (typeof question !== 'string') {
      return res.status(400).json({ success: false, error: 'Question parameter is missing or invalid.' });
    }

    const lowerQuestion = question.toLowerCase();
    
    // Simulate network delay for AI thinking
    await new Promise(resolve => setTimeout(resolve, 1500));

    let responseString: string;

    if (lowerQuestion.includes('cash advance') || lowerQuestion.includes('advances')) {
      const ledgers = await prisma.deductionLedger.findMany({
        where: { type: 'CASH_ADVANCE', status: 'ACTIVE' },
        include: { worker: true }
      });
      
      if (ledgers.length === 0) {
        responseString = "Currently, there are no workers with active cash advances in the system.";
      } else {
        responseString = `There are ${ledgers.length} active cash advances:\n\n`;
        ledgers.forEach(l => {
          responseString += `- **${l.worker.firstName} ${l.worker.lastName}**: ₱${l.balance.toFixed(2)} remaining (deducting ₱${l.deductionPerPayroll}/cutoff).\n`;
        });
      }
    } else if (lowerQuestion.includes('worker') || lowerQuestion.includes('employee')) {
      const activeWorkers = await prisma.worker.count({ where: { employmentStatus: 'ACTIVE' } });
      const inactiveWorkers = await prisma.worker.count({ where: { employmentStatus: 'INACTIVE' } });
      responseString = `We currently have **${activeWorkers} active workers** in the directory, and ${inactiveWorkers} inactive workers.`;
    } else if (lowerQuestion.includes('cutoff') || lowerQuestion.includes('period')) {
      const periods = await prisma.payrollPeriod.findMany({
        where: { status: 'FOR_REVIEW' }
      });
      if (periods.length === 0) {
        responseString = "There are no payroll periods currently pending review.";
      } else {
        responseString = `There is ${periods.length} payroll period currently pending your review and approval.`;
      }
    } else {
      // Default fallback
      responseString = `I am your AI Payroll Assistant. Based on the database, I can answer questions about active cash advances, worker counts, cutoff statuses, and specific payslip computations. How can I help you?`;
    }

    return res.json({ success: true, data: responseString });

  } catch (error: any) {
    console.error('Error in askPayrollAssistant:', error);
    return res.status(500).json({ success: false, error: "I'm sorry, I encountered an error connecting to the database." });
  }
});

export default router;
