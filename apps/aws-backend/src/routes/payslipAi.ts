import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

router.post('/explainPayslipWithAI', async (req, res) => {
  try {
    const { payrollId } = req.body;

    if (!payrollId) {
      return res.status(400).json({ success: false, error: 'Payroll ID is required.' });
    }

    const payroll = await prisma.payroll.findUnique({
      where: { id: payrollId },
      include: {
        worker: true,
        payrollPeriod: true
      }
    });

    if (!payroll) throw new Error('Payroll record not found');

    // In a real application, this would call an LLM (e.g., OpenAI, Gemini, Claude)
    // passing the payroll JSON object and asking for a natural language explanation.
    // For this prototype, we simulate the AI reasoning based on the precise numbers.

    const workerName = `${payroll.worker.firstName} ${payroll.worker.lastName}`;
    const rateType = payroll.worker.rateType;
    
    let explanation = `Here is a clear breakdown of how **${workerName}**'s salary was computed for this period:\n\n`;

    // Base Pay explanation
    if (rateType === 'MONTHLY') {
      explanation += `1. **Basic Pay (₱${payroll.basicPay.toFixed(2)})**: The worker is on a fixed monthly rate. This amount represents half of their monthly salary for the semi-monthly cutoff.\n`;
    } else if (rateType === 'DAILY') {
      explanation += `1. **Basic Pay (₱${payroll.basicPay.toFixed(2)})**: The worker is on a daily rate of ₱${payroll.worker.dailyRate.toFixed(2)}. They worked **${payroll.daysWorked} days** during this cutoff (₱${payroll.worker.dailyRate.toFixed(2)} × ${payroll.daysWorked}).\n`;
    } else {
      explanation += `1. **Basic Pay (₱${payroll.basicPay.toFixed(2)})**: The worker is on an hourly rate of ₱${payroll.worker.hourlyRate.toFixed(2)}. They rendered **${payroll.regularHours} regular hours**.\n`;
    }

    // Overtime
    if (payroll.overtimePay > 0) {
      explanation += `2. **Overtime (₱${payroll.overtimePay.toFixed(2)})**: They rendered **${payroll.overtimeHours} hours** of overtime, computed at 125% of their standard hourly rate.\n`;
    } else {
      explanation += `2. **Overtime**: No overtime was logged during this period.\n`;
    }

    // Deductions
    explanation += `\n**Deductions Summary:**\n`;
    
    let hasDeductions = false;
    if (payroll.sssDeduction > 0) {
      explanation += `- **SSS (₱${payroll.sssDeduction.toFixed(2)})**: Based on the active government SSS contribution table for their salary bracket.\n`;
      hasDeductions = true;
    }
    if (payroll.philhealthDeduction > 0) {
      explanation += `- **PhilHealth (₱${payroll.philhealthDeduction.toFixed(2)})**: Standard premium split according to settings.\n`;
      hasDeductions = true;
    }
    if (payroll.pagibigDeduction > 0) {
      explanation += `- **Pag-IBIG (₱${payroll.pagibigDeduction.toFixed(2)})**: Standard contribution.\n`;
      hasDeductions = true;
    }
    if (payroll.withholdingTax > 0) {
      explanation += `- **Withholding Tax (₱${payroll.withholdingTax.toFixed(2)})**: Computed using the standard TRAIN/CREATE Law bracket for your taxable income (₱${payroll.taxableCompensation.toFixed(2)}).\n`;
      hasDeductions = true;
    }
    if (payroll.cashAdvance > 0) {
      explanation += `- **Cash Advance (₱${payroll.cashAdvance.toFixed(2)})**: Installment payment for an active cash advance.\n`;
      hasDeductions = true;
    }
    if (payroll.loanDeduction > 0) {
      explanation += `- **Loan (₱${payroll.loanDeduction.toFixed(2)})**: Installment payment for an active salary/company loan.\n`;
      hasDeductions = true;
    }

    if (!hasDeductions) {
      explanation += `- *No deductions were applied to this payroll.*\n`;
    }

    explanation += `\n**Final Result:**\nSubtracting the total deductions (₱${payroll.totalDeductions.toFixed(2)}) from the Gross Pay (₱${payroll.grossPay.toFixed(2)}) results in a final **Net Pay of ₱${payroll.netPay.toFixed(2)}**.`;

    // Simulate network delay for AI generation effect
    await new Promise(resolve => setTimeout(resolve, 1500));

    return res.json({ success: true, explanation });

  } catch (error: any) {
    console.error('Error in explainPayslipWithAI:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to generate explanation.' });
  }
});

export default router;
