import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requirePermission } from '../lib/permissions';
import { validateTransactionWithAI } from '../lib/aiValidation';
import { logAudit } from '../lib/workflow';

const router = Router();
function getPbacContext(req: any) {
  return {
    userId: req.headers['x-user-session'] as string | undefined,
    activeProjectId: req.headers['x-active-project-id'] as string | undefined,
    simulatedRole: req.headers['x-simulated-role'] as string | undefined,
  };
}

/**
 * AI-Assisted Payroll Computation Engine
 */
async function computePayrollForPeriod(payrollPeriodId: string) {
  const period = await prisma.payrollPeriod.findUnique({
    where: { id: payrollPeriodId },
    include: {
      dtrs: { include: { worker: true } },
      payrolls: true
    }
  });

  if (!period) throw new Error('Payroll period not found');

  const govSettings = await prisma.governmentSettings.findFirst() || {
    phEmployeeRate: 2.5,
    pagibigEmployeeRate: 2.0,
    deductionSchedule: 'SPLIT'
  } as any;

  // Map calendarRule to expected payrollCategory
  const categoryMap: Record<string, string> = {
    'WEEKLY': 'Weekly Salaried',
    'SEMI_MONTHLY': 'Semi-Monthly',
    'MONTHLY': 'Monthly'
  };
  // const allowedCategory = categoryMap[period.calendarRule];

  // Filter out workers that shouldn't be in this cutoff
  const dtrsToProcess = period.dtrs.filter(dtr => {
    if (!dtr.worker.subjectToPayrollCutoff) return false;
    return true;
  });

  // Group DTRs by Worker
  const workerMap = new Map();
  for (const dtr of dtrsToProcess) {
    if (!workerMap.has(dtr.workerId)) {
      workerMap.set(dtr.workerId, {
        worker: dtr.worker,
        totalRegularHours: 0,
        totalOvertimeHours: 0,
        daysWorked: 0
      });
    }
    const data = workerMap.get(dtr.workerId);
    data.totalRegularHours += dtr.regularHours;
    data.totalOvertimeHours += dtr.overtimeHours;
    if (dtr.regularHours > 0) data.daysWorked += 1;
  }

  const payrollResults = [];

  for (const [workerId, data] of workerMap.entries()) {
    const worker = data.worker;
    let basicPay = 0;
    let overtimePay = 0;
    let retentionAmount = 0;

    // 1. Basic Pay Computation
    if (worker.rateType === 'MONTHLY_SALARY') {
      basicPay = (worker.basicMonthlySalary || 0) / 2; // Assuming semi-monthly
      // Convert to hourly for OT
      const hourlyRate = ((worker.basicMonthlySalary || 0) / 22) / (worker.standardWorkHours || 8);
      overtimePay = data.totalOvertimeHours * hourlyRate * 1.25; 
    } else if (worker.rateType === 'DAILY_RATE') {
      basicPay = (worker.dailyRate || 0) * data.daysWorked;
      const hourlyRate = (worker.dailyRate || 0) / (worker.standardWorkHours || 8);
      overtimePay = data.totalOvertimeHours * hourlyRate * 1.25;
    } else if (worker.rateType === 'HOURLY_RATE') {
      basicPay = (worker.hourlyRate || 0) * data.totalRegularHours;
      overtimePay = data.totalOvertimeHours * (worker.hourlyRate || 0) * 1.25;
    } else if (worker.rateType === 'PIECE_RATE') {
      basicPay = worker.pieceRate || 0;
    } else if (worker.rateType === 'ONE_LOT') {
      basicPay = worker.contractAmount || 0;
      if (worker.retentionPercentage && worker.retentionPercentage > 0) {
        retentionAmount = basicPay * (worker.retentionPercentage / 100);
        basicPay -= retentionAmount;
      }
    } else if (worker.rateType === 'PROFESSIONAL_FEE') {
      basicPay = worker.professionalFee || 0;
    }

    // Fallback: If basicPay is still 0 but we have a daily rate and attendance, assume daily worker
    if (basicPay === 0 && (worker.dailyRate || 0) > 0 && data.daysWorked > 0) {
      basicPay = (worker.dailyRate || 0) * data.daysWorked;
      const hourlyRate = (worker.dailyRate || 0) / (worker.standardWorkHours || 8);
      overtimePay = data.totalOvertimeHours * hourlyRate * 1.25;
    }

    let grossPay = basicPay + overtimePay;

    // 2. Government Deductions
    let sssDeduction = 0;
    let philHealthDeduction = 0;
    let pagIbigDeduction = 0;

    if (worker.sssDeductionEnabled) {
      sssDeduction = grossPay * 0.045; // 4.5% approx
    }
    
    if (worker.philHealthDeductionEnabled) {
      philHealthDeduction = grossPay * (govSettings.phEmployeeRate / 100);
    }

    if (worker.pagibigDeductionEnabled) {
      pagIbigDeduction = Math.min(grossPay * (govSettings.pagibigEmployeeRate / 100), 200);
    }

    // Schedule adjustments
    if (govSettings.deductionSchedule === 'SPLIT') {
      sssDeduction /= 2;
      philHealthDeduction /= 2;
      pagIbigDeduction /= 2;
    }

    // 3. Tax Computation
    let withholdingTax = 0;
    const taxableIncome = grossPay - (sssDeduction + philHealthDeduction + pagIbigDeduction);
    
    if (worker.withholdingTaxEnabled) {
      if (worker.withholdingTaxType === 'EXPANDED_WITHHOLDING_TAX' || (worker.withholdingTaxRate && worker.withholdingTaxRate > 0)) {
        withholdingTax = taxableIncome * ((worker.withholdingTaxRate || 0) / 100);
      } else if (taxableIncome > 10417) {
        if (taxableIncome >= 333333) {
          withholdingTax = 91770.70 + ((taxableIncome - 333333) * 0.35);
        } else if (taxableIncome >= 83333) {
          withholdingTax = 16770.70 + ((taxableIncome - 83333) * 0.30);
        } else if (taxableIncome >= 33333) {
          withholdingTax = 4270.70 + ((taxableIncome - 33333) * 0.25);
        } else if (taxableIncome >= 16667) {
          withholdingTax = 937.50 + ((taxableIncome - 16667) * 0.20);
        } else if (taxableIncome >= 10417) {
          withholdingTax = (taxableIncome - 10417) * 0.15;
        }
      }
    }

    // 4. Ledger Deductions (Loans & Cash Advances)
    const activeLedgers = await prisma.deductionLedger.findMany({
      where: { workerId: worker.id, status: 'ACTIVE' }
    });

    let cashAdvanceDeduction = 0;
    let loanDeduction = 0;

    for (const ledger of activeLedgers) {
      const deductAmount = Math.min(ledger.deductionPerPayroll, ledger.balance);
      if (ledger.type === 'CASH_ADVANCE') cashAdvanceDeduction += deductAmount;
      if (ledger.type === 'LOAN') loanDeduction += deductAmount;
    }

    const totalDeductions = sssDeduction + philHealthDeduction + pagIbigDeduction + withholdingTax + cashAdvanceDeduction + loanDeduction;
    const netPay = grossPay - totalDeductions;

    // 5. Payment Rule Validations
    let paymentStatus = 'PENDING';
    let paymentHoldReason = null;

    if (worker.payrollCategory === 'Weekly Salaried') {
      if (worker.allowedPaymentMethod !== 'GCash Only') {
        paymentStatus = 'EXCEPTION';
        paymentHoldReason = 'Weekly salaried workers must be paid through GCash only.';
      } else if (!worker.gcashNumber) {
        paymentStatus = 'ON_HOLD';
        paymentHoldReason = 'Missing GCash mobile number.';
      } else if (worker.gcashVerificationStatus !== 'Verified') {
        paymentStatus = 'ON_HOLD';
        paymentHoldReason = 'GCash profile is not verified.';
      }
    } else if (['Semi-Monthly', 'Monthly', '1-Lot Consultant', 'Freelance Consultant'].includes(worker.payrollCategory || '')) {
      if (worker.allowedPaymentMethod !== 'Bank Transfer Only') {
        paymentStatus = 'EXCEPTION';
        paymentHoldReason = `${worker.payrollCategory} workers must be paid through nominated bank account only.`;
      } else if (!worker.bankAccountNumber) {
        paymentStatus = 'ON_HOLD';
        paymentHoldReason = 'Missing bank account number.';
      } else if (worker.bankVerificationStatus !== 'Verified') {
        paymentStatus = 'ON_HOLD';
        paymentHoldReason = 'Bank account is not verified.';
      }
    }

    const existingPayroll = period.payrolls.find((p: any) => p.workerId === workerId);
    
    const payrollData = {
      payrollPeriodId: period.id,
      workerId: worker.id,
      daysWorked: data.daysWorked,
      regularHours: data.totalRegularHours,
      overtimeHours: data.totalOvertimeHours,
      basicPay,
      overtimePay,
      grossPay,
      taxableCompensation: taxableIncome > 0 ? taxableIncome : 0,
      sssDeduction,
      philhealthDeduction: philHealthDeduction,
      pagibigDeduction: pagIbigDeduction,
      withholdingTax,
      finalWithholdingTax: withholdingTax,
      cashAdvance: cashAdvanceDeduction,
      loanDeduction,
      totalDeductions,
      netPay,
      paymentMethod: worker.allowedPaymentMethod,
      paymentStatus,
      paymentHoldReason: paymentHoldReason || undefined
    };

    if (existingPayroll) {
      await prisma.payroll.update({ where: { id: existingPayroll.id }, data: payrollData });
    } else {
      await prisma.payroll.create({ data: payrollData });
    }

    payrollResults.push(payrollData);
  }

  // Clean up payroll records for workers with no attendance
  const computedWorkerIds = Array.from(workerMap.keys());
  await prisma.payroll.deleteMany({
    where: {
      payrollPeriodId: period.id,
      workerId: { notIn: computedWorkerIds }
    }
  });

  return { success: true, count: payrollResults.length };
}

// ------------------------------------------------------------------
// PAYROLL CORE ACTIONS
// ------------------------------------------------------------------

router.post('/engine/compute', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'PAYROLL', 'canEdit', simulatedRole);
    
    const { payrollPeriodId } = req.body;
    const result = await computePayrollForPeriod(payrollPeriodId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/period/create', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'PAYROLL', 'canCreate', simulatedRole);
    
    const { month, year, calendarRule, periodType, startDate, endDate, payrollDate, projectId, notes } = req.body;

    const existing = await prisma.payrollPeriod.findFirst({
      where: { 
        month: Number(month), 
        year: Number(year), 
        calendarRule, periodType, 
        projectId: projectId || null 
      }
    });
    if (existing) throw new Error(`A payroll period for ${periodType} of ${month}/${year} already exists.`);

    const validation = await validateTransactionWithAI(
      'Payroll Generation',
      { action: 'Create New Payroll Period', month, year, calendarRule, periodType, startDate, endDate },
      userId!,
      simulatedRole || 'HR_OFFICER'
    );

    if (validation.validationStatus === 'BLOCKING ISSUE') {
      return res.status(400).json({ 
        success: false, 
        error: `AI Blocked Transaction: ${validation.findings}`,
        validationLogId: validation.validationLogId 
      });
    }

    const typeCode = periodType.replace('_', '').substring(0, 4);
    const projCode = projectId ? '-PROJ' : '';
    const batchNumber = `PAY-${year}-${String(month).padStart(2, '0')}-${typeCode}${projCode}-${Math.floor(Math.random() * 1000)}`;

    const period = await prisma.payrollPeriod.create({
      data: {
        payrollBatchNumber: batchNumber,
        month: Number(month), year: Number(year),
        calendarRule, periodType,
        startDate: new Date(startDate), endDate: new Date(endDate), payrollDate: new Date(payrollDate),
        projectId: projectId || null, notes: notes || null,
        status: 'DRAFT', createdById: userId!
      }
    });

    const categoryMap: Record<string, string> = {
      'WEEKLY': 'Weekly Salaried', 'SEMI_MONTHLY': 'Semi-Monthly', 'MONTHLY': 'Monthly'
    };
    const workerFilter: any = {};
    if (projectId) workerFilter.assignedProjectId = projectId;
    if (categoryMap[calendarRule]) workerFilter.payrollCategory = categoryMap[calendarRule];

    const workers = await prisma.worker.findMany({ where: workerFilter });
    if (workers.length > 0) {
      const payrollEntries = workers.map(w => ({
        workerId: w.id, payrollPeriodId: period.id, projectId: projectId || null,
        compensationType: w.employmentType === 'REGULAR' ? 'MONTHLY' : w.employmentType === 'PROJECT_BASED' ? 'PROJECT_BASED' : 'DAILY',
        rate: w.dailyRate || 0, basicPay: 0, netPay: 0
      }));
      await prisma.payroll.createMany({ data: payrollEntries });
    }

    await logAudit(
      userId!,
      simulatedRole || 'HR_OFFICER',
      'PAYROLL',
      period.id,
      'CREATE_PAYROLL_PERIOD',
      undefined,
      'DRAFT',
      `Created ${periodType} payroll period for ${month}/${year}`
    );

    res.json({ success: true, data: period });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.delete('/period/:id', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'PAYROLL', 'canDelete', simulatedRole);
    const { id } = req.params;

    const period = await prisma.payrollPeriod.findUnique({ where: { id } });
    if (!period) throw new Error('Period not found');
    if (period.status !== 'DRAFT') throw new Error('Only DRAFT periods can be deleted');

    await prisma.dailyTimeRecord.deleteMany({ where: { payrollPeriodId: id } });
    await prisma.payroll.deleteMany({ where: { payrollPeriodId: id } });
    await prisma.payrollPeriod.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ------------------------------------------------------------------
// DTR ACTIONS
// ------------------------------------------------------------------

router.post('/dtr/save-manual', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'PAYROLL', 'canEdit', simulatedRole);
    const { data, payrollPeriodId } = req.body;
    const { workerId, date, timeIn, timeOut, regularHours, overtimeHours } = data;

    const parsedDate = new Date(date);
    let parsedTimeIn = null;
    let parsedTimeOut = null;
    
    if (timeIn) {
      const [h, m] = timeIn.split(':').map(Number);
      parsedTimeIn = new Date(parsedDate);
      parsedTimeIn.setHours(h, m, 0, 0);
    }
    
    if (timeOut) {
      const [h, m] = timeOut.split(':').map(Number);
      parsedTimeOut = new Date(parsedDate);
      parsedTimeOut.setHours(h, m, 0, 0);
      if (parsedTimeIn && parsedTimeOut < parsedTimeIn) parsedTimeOut.setDate(parsedTimeOut.getDate() + 1);
    }
    
    const existing = await prisma.dailyTimeRecord.findUnique({
      where: { workerId_date: { workerId, date: parsedDate } }
    });

    if (existing) {
      await prisma.dailyTimeRecord.update({
        where: { id: existing.id },
        data: { timeIn: parsedTimeIn, timeOut: parsedTimeOut, regularHours: Number(regularHours), overtimeHours: Number(overtimeHours), payrollPeriodId }
      });
    } else {
      await prisma.dailyTimeRecord.create({
        data: { workerId, date: parsedDate, timeIn: parsedTimeIn, timeOut: parsedTimeOut, regularHours: Number(regularHours), overtimeHours: Number(overtimeHours), payrollPeriodId }
      });
    }

    await computePayrollForPeriod(payrollPeriodId);
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post('/dtr/save-bulk', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'PAYROLL', 'canEdit', simulatedRole);
    const { workerId, payrollPeriodId, entries } = req.body;

    // Attendance must not change once the payroll period is locked (approved/funded).
    if (payrollPeriodId) {
      const period = await prisma.payrollPeriod.findUnique({ where: { id: payrollPeriodId }, select: { isLocked: true } });
      if (period?.isLocked) {
        return res.status(409).json({ success: false, error: 'This payroll period is locked. DTR entries can no longer be edited.' });
      }
    }

    for (const entry of entries) {
      const parsedDate = new Date(entry.date);
      if (entry.regularHours === 0 && entry.overtimeHours === 0 && !entry.timeIn && !entry.timeOut) continue;

      let parsedTimeIn = null; let parsedTimeOut = null;
      if (entry.timeIn) {
        const [h, m] = entry.timeIn.split(':').map(Number);
        parsedTimeIn = new Date(parsedDate); parsedTimeIn.setHours(h, m, 0, 0);
      }
      if (entry.timeOut) {
        const [h, m] = entry.timeOut.split(':').map(Number);
        parsedTimeOut = new Date(parsedDate); parsedTimeOut.setHours(h, m, 0, 0);
        if (parsedTimeIn && parsedTimeOut < parsedTimeIn) parsedTimeOut.setDate(parsedTimeOut.getDate() + 1);
      }
      
      const existing = await prisma.dailyTimeRecord.findUnique({
        where: { workerId_date: { workerId, date: parsedDate } }
      });

      if (existing) {
        await prisma.dailyTimeRecord.update({
          where: { id: existing.id },
          data: { timeIn: parsedTimeIn, timeOut: parsedTimeOut, regularHours: Number(entry.regularHours), overtimeHours: Number(entry.overtimeHours), payrollPeriodId }
        });
      } else {
        await prisma.dailyTimeRecord.create({
          data: { workerId, date: parsedDate, timeIn: parsedTimeIn, timeOut: parsedTimeOut, regularHours: Number(entry.regularHours), overtimeHours: Number(entry.overtimeHours), payrollPeriodId }
        });
      }
    }

    await computePayrollForPeriod(payrollPeriodId);
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// A pure data syncing endpoint for biometrics uploaded on Vercel
router.post('/dtr/biometrics-sync', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'PAYROLL', 'canCreate', simulatedRole);
    
    const { rows, payrollPeriodId, fileUrl } = req.body;

    const period = await prisma.payrollPeriod.findUnique({ where: { id: payrollPeriodId } });
    const workers = await prisma.worker.findMany();
    if (!period || workers.length === 0) throw new Error('No workers found');

    const workerMap = new Map();
    for (const w of workers) if (w.workerId) workerMap.set(w.workerId, w.id);

    let insertedCount = 0;
    let outOfBoundsCount = 0;

    for (const row of rows) {
      const empNo = row['Emp No'] || row['Employee No'] || row['Worker ID'];
      if (!empNo) continue;
      
      const workerDbId = workerMap.get(empNo);
      if (!workerDbId) continue;
      
      let dateStr = row['Date'];
      if (!dateStr) continue;
      
      let date: Date;
      if (typeof dateStr === 'number' || (typeof dateStr === 'string' && !isNaN(Number(dateStr)) && Number(dateStr) > 25000)) {
        date = new Date(Math.round((Number(dateStr) - 25569) * 864e5));
      } else {
        date = new Date(dateStr);
      }
      
      if (date < period.startDate || date > period.endDate) {
        outOfBoundsCount++;
        continue;
      }
      
      let regularHours = parseFloat(row['Regular Hours']);
      let overtimeHours = parseFloat(row['OT Hours']);
      
      if (isNaN(regularHours)) {
        const totalHours = parseFloat(row['Total Hours']) || parseFloat(row['TotalHours']) || 0;
        if (totalHours > 8) {
          regularHours = 8;
          overtimeHours = totalHours - 8;
        } else {
          regularHours = totalHours;
          overtimeHours = 0;
        }
      } else {
        if (isNaN(overtimeHours)) overtimeHours = 0;
      }

      await prisma.dailyTimeRecord.upsert({
        where: { workerId_date: { workerId: workerDbId, date } },
        update: { regularHours, overtimeHours, payrollPeriodId, sourceFile: fileUrl },
        create: { workerId: workerDbId, date, regularHours, overtimeHours, payrollPeriodId, sourceFile: fileUrl }
      });
      insertedCount++;
    }

    if (insertedCount === 0) {
      if (outOfBoundsCount > 0) {
        throw new Error(`Found ${outOfBoundsCount} records, but none matched cutoff.`);
      } else {
        throw new Error('No valid DTR records found for the workers in this file.');
      }
    }

    await computePayrollForPeriod(payrollPeriodId);
    res.json({ success: true, insertedCount });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

export default router;
