import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requirePermission } from '../lib/permissions';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

const router = Router();
function getPbacContext(req: any) {
  return {
    userId: req.headers['x-user-session'] as string | undefined,
    activeProjectId: req.headers['x-active-project-id'] as string | undefined,
    simulatedRole: req.headers['x-simulated-role'] as string | undefined,
  };
}

router.post('/validate', async (req, res) => {
  try {
    const { workerData } = req.body;
    const prompt = `
You are an expert HR and Payroll AI Assistant for a Philippine construction firm.
Your job is to strictly validate a new worker profile submission against standard business logic.
You must output a JSON array of issues found, if any. If the profile is perfect, return an empty array.

Here is the worker profile data to validate:
${JSON.stringify(workerData, null, 2)}

Validation Rules:
1. "FREELANCE_CONSULTANT" or "RETAINER_CONSULTANT" MUST have a TIN or a Valid ID. If not, return a CRITICAL severity issue.
2. "FREELANCE_CONSULTANT" does not require SSS, PhilHealth, Pag-IBIG. But if they have withholding tax enabled, they MUST have a TIN.
3. Daily Workers MUST have a dailyRate > 0. If not, return a HIGH severity issue.
4. Monthly Employees MUST have a basicMonthlySalary > 0.
5. Hourly Workers MUST have an hourlyRate > 0.
6. One-Lot / Lump Sum workers MUST have a contractAmount > 0 and a paymentBasis selected.
7. If SSS Deduction is enabled, SSS Number is highly recommended (warning if missing).
8. If PhilHealth Deduction is enabled, PhilHealth Number is highly recommended.
9. If Pag-IBIG Deduction is enabled, Pag-IBIG Number is highly recommended.
10. If Payroll Mode is BANK_TRANSFER, Bank Name and Bank Account Number MUST be provided.
11. If Payroll Mode is GCASH, GCash Number MUST be provided.

Output exactly a JSON array of objects with the following schema, and NO markdown wrapping or other text:
[
  {
    "category": "Profile" | "GovernmentIDs" | "Payment" | "Documents" | "Rules",
    "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    "message": "Detailed explanation of the issue",
    "recommendedCorrection": "How the user can fix it",
    "fieldRef": "The name of the field that is problematic (e.g. 'sssNumber', 'dailyRate')"
  }
]
`;

    const { text } = await generateText({
      model: google('gemini-2.5-flash'),
      prompt: prompt,
      temperature: 0.1,
    });

    let cleanedText = text.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    let validationResults = [];
    try {
      validationResults = JSON.parse(cleanedText);
    } catch (e) {
      console.error('Failed to parse AI validation response', cleanedText);
    }

    res.json({ success: true, results: validationResults });

  } catch (error: any) {
    console.error('AI Worker Validation Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/save', async (req, res) => {
  try {
    const { data, aiValidationLogs } = req.body;
    const { userId, simulatedRole } = getPbacContext(req);

    if (userId) {
      if (data.id) {
        await requirePermission(userId, 'WORKER_DATABASE', 'canEditDraft', simulatedRole);
      } else {
        await requirePermission(userId, 'WORKER_DATABASE', 'canCreate', simulatedRole);
      }
    }

    const rateData = {
      dailyRate: Number(data.dailyRate || 0),
      basicMonthlySalary: Number(data.basicMonthlySalary || 0),
      hourlyRate: Number(data.hourlyRate || 0),
      pieceRate: Number(data.pieceRate || 0),
      contractAmount: Number(data.contractAmount || 0),
      professionalFee: Number(data.professionalFee || 0),
      retentionPercentage: Number(data.retentionPercentage || 0),
      withholdingTaxRate: Number(data.withholdingTaxRate || 0),
      allowance: Number(data.allowance || 0),
      standardWorkHours: Number(data.standardWorkHours || 8),
    };

    const dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    const dateHired = data.dateHired ? new Date(data.dateHired) : null;
    const engagementStartDate = data.engagementStartDate ? new Date(data.engagementStartDate) : null;
    const contractEndDate = data.contractEndDate ? new Date(data.contractEndDate) : null;
    const validIdExpiryDate = data.validIdExpiryDate ? new Date(data.validIdExpiryDate) : null;
    
    delete data.createdAt;
    delete data.updatedAt;
    if (data.gcashLastUpdatedDate === '') delete data.gcashLastUpdatedDate;
    if (data.bankLastUpdatedDate === '') delete data.bankLastUpdatedDate;
    if (data.projectId === '') data.projectId = null;

    let worker;

    const payload = {
      ...data,
      ...rateData,
      dateOfBirth,
      dateHired,
      engagementStartDate,
      contractEndDate,
      validIdExpiryDate,
      id: undefined
    };

    if (data.id) {
      const existingWorker = await prisma.worker.findUnique({ where: { id: data.id }});
      
      if (existingWorker) {
        let paymentChanged = false;
        
        if (payload.gcashNumber !== existingWorker.gcashNumber || payload.gcashAccountName !== existingWorker.gcashAccountName) {
          payload.gcashVerificationStatus = 'Pending';
          paymentChanged = true;
        }
        
        if (payload.bankAccountNumber !== existingWorker.bankAccountNumber || payload.bankName !== existingWorker.bankName) {
          payload.bankVerificationStatus = 'Pending';
          paymentChanged = true;
        }
        
        if (paymentChanged) {
          payload.paymentProfileStatus = 'Pending';
        }
      }

      worker = await prisma.worker.update({
        where: { id: data.id },
        data: payload
      });
    } else {
      payload.paymentProfileStatus = 'Pending';
      payload.gcashVerificationStatus = payload.gcashNumber ? 'Pending' : undefined;
      payload.bankVerificationStatus = payload.bankAccountNumber ? 'Pending' : undefined;
      
      worker = await prisma.worker.create({
        data: payload
      });
    }

    if (aiValidationLogs && aiValidationLogs.length > 0) {
      await Promise.all(aiValidationLogs.map((log: any) => 
        prisma.aIWorkerValidationResult.create({
          data: {
            workerId: worker.id,
            category: log.category,
            severity: log.severity,
            message: log.message,
            fieldRef: log.fieldRef,
            status: log.status || 'IGNORED',
            ignoreReason: log.ignoreReason || 'User proceeded despite warning'
          }
        })
      ));
    }

    res.json({ success: true, workerId: worker.id });
  } catch (error: any) {
    console.error('Save Worker Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/approve-payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, simulatedRole } = getPbacContext(req);

    if (userId) {
      await requirePermission(userId, 'WORKER_DATABASE', 'canReleasePayment', simulatedRole);
    }
    
    const user = await prisma.user.findUnique({ where: { id: userId! } });

    const worker = await prisma.worker.findUnique({ where: { id } });
    if (!worker) throw new Error('Worker not found');

    const updateData: any = {
      paymentProfileStatus: 'Verified',
      paymentHoldReason: null
    };

    if (worker.allowedPaymentMethod === 'GCash Only' && worker.gcashNumber) {
      updateData.gcashVerificationStatus = 'Verified';
      updateData.gcashApprovedBy = user?.name || 'Finance Admin';
      updateData.gcashLastUpdatedDate = new Date();
    } else if (worker.allowedPaymentMethod === 'Bank Transfer Only' && worker.bankAccountNumber) {
      updateData.bankVerificationStatus = 'Verified';
      updateData.bankApprovedBy = user?.name || 'Finance Admin';
      updateData.bankLastUpdatedDate = new Date();
    }

    await prisma.worker.update({
      where: { id },
      data: updateData
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/hold-payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const { userId, simulatedRole } = getPbacContext(req);

    if (userId) {
      await requirePermission(userId, 'WORKER_DATABASE', 'canEditDraft', simulatedRole);
    }

    await prisma.worker.update({
      where: { id },
      data: {
        paymentProfileStatus: 'On Hold',
        paymentHoldReason: reason
      }
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, simulatedRole } = getPbacContext(req);

    if (userId) {
      await requirePermission(userId, 'WORKER_DATABASE', 'canDeleteDraft', simulatedRole);
    }

    await prisma.worker.delete({
      where: { id }
    });
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting worker:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete worker' });
  }
});

export default router;
