import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { BillingStatus, PrismaClient } from '@prisma/client';
import { requirePermission } from '../lib/permissions';

const router = Router();
function getPbacContext(req: any) {
  return {
    userId: req.headers['x-user-session'] as string | undefined,
    activeProjectId: req.headers['x-active-project-id'] as string | undefined,
    simulatedRole: req.headers['x-simulated-role'] as string | undefined,
  };
}

// Each step moves only from the status before it, so holding one step's right
// does not let a user pull back a billing that has already moved on.
async function moveBillingStatus(id: string, from: BillingStatus, to: BillingStatus) {
  const { count } = await prisma.subcontractBilling.updateMany({ where: { id, status: from }, data: { status: to } });
  if (count === 0) throw new Error(`Only a billing in ${from} can move to ${to}.`);
  return prisma.subcontractBilling.findUniqueOrThrow({ where: { id } });
}

// Accomplishment Form Save (after file upload)
router.post('/accomplishments', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canCreate', simulatedRole);
    const result = await prisma.subcontractAccomplishment.create({ data: req.body });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/accomplishments/:id/approve', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canApprove', simulatedRole);
    const result = await prisma.subcontractAccomplishment.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED' }
    });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/billings', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canCreate', simulatedRole);
    const data = req.body;
    const result = await prisma.subcontractBilling.create({
      data: {
        billingNumber: data.billingNumber,
        projectId: data.projectId,
        subcontractorId: data.subcontractorId,
        ...(data.packageId ? { packageId: data.packageId } : {}),
        ...(data.jobOrderId ? { jobOrderId: data.jobOrderId } : {}),
        contractAmount: data.contractAmount,
        previousGross: data.previousGross || 0,
        currentGross: data.currentGross || 0,
        totalGross: data.totalGross || 0,
        remainingBalance: data.remainingBalance || 0,
        netPayable: data.netPayable || 0,
        retentionDeduction: data.retentionDeduction || 0,
        whtDeduction: data.whtDeduction || 0,
        mobilizationDeduction: data.mobilizationDeduction || 0,
        status: 'DRAFT',
      }
    });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/billings/:id/process-payment', (_req, res) => {
  return res.status(409).json({ success: false, error: 'WORKFLOW_UNAVAILABLE: This legacy payment handler does not support the current approval and ledger schema. No payment was recorded.' });
});

router.put('/billings/:id/submit', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canSubmit', simulatedRole);
    const result = await moveBillingStatus(req.params.id, 'DRAFT', 'SUBMITTED');
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/billings/:id/endorse', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canReview', simulatedRole);
    const result = await moveBillingStatus(req.params.id, 'SUBMITTED', 'FOR_VALIDATION');
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/billings/:id/approve-request', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canApprove', simulatedRole);
    const result = await moveBillingStatus(req.params.id, 'FOR_VALIDATION', 'APPROVED_FOR_PAYMENT');

    const billing = await prisma.subcontractBilling.findUnique({ where: { id: req.params.id } });
    if (billing?.packageId) {
      await prisma.subcontractPackage.update({
        where: { id: billing.packageId },
        data: { status: 'BILLED' }
      });
    }

    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/billings/:id/endorse-payment', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'PAYMENT_ISSUANCE', 'canReview', simulatedRole);
    const result = await prisma.subcontractBilling.update({
      where: { id: req.params.id },
      data: {}
    });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/billings/:id/approve-payment', (_req, res) => {
  return res.status(409).json({ success: false, error: 'WORKFLOW_UNAVAILABLE: This legacy payment handler does not support the current approval and ledger schema. No payment was recorded.' });
});

router.put('/billings/:id/reject-payment', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'PAYMENT_ISSUANCE', 'canReject', simulatedRole);
    const result = await prisma.subcontractBilling.update({
      where: { id: req.params.id },
      data: {}
    });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------
// ACCOMPLISHMENT FILES (Excel / PDF Document Management)
// ---------------------------------------------------------

router.post('/accomplishment-files', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canCreate', simulatedRole);
    const data = req.body;
    const result = await prisma.projectAccomplishmentFile.create({ data });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/accomplishment-files/:id', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canEditDraft', simulatedRole);
    // Status and the lock only change through the versions route.
    const { status, isLockedOriginal, ...data } = req.body;
    const result = await prisma.projectAccomplishmentFile.update({
      where: { id: req.params.id },
      data
    });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/accomplishment-files/:id', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canDeleteDraft', simulatedRole);
    const file = await prisma.projectAccomplishmentFile.findUnique({ where: { id: req.params.id }, select: { status: true } });
    if (file?.status === 'BILLING') return res.status(409).json({ success: false, error: 'This accomplishment file is locked for billing and cannot be deleted.' });
    await prisma.projectAccomplishmentFile.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/accomplishment-files/:id/versions', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    const { fileRecordId, versionNumber, publicPath, isLocked } = req.body;
    await requirePermission(userId!, 'SUBCONTRACTING', isLocked ? 'canLock' : 'canRevise', simulatedRole);

    const result = await prisma.$transaction(async (tx) => {
      await tx.projectAccomplishmentFileVersion.create({
        data: {
          fileId: fileRecordId,
          versionNumber: versionNumber,
          filePath: publicPath,
        }
      });

      return await tx.projectAccomplishmentFile.update({
        where: { id: fileRecordId },
        data: {
          fileVersion: versionNumber,
          workingFilePath: publicPath,
          isLockedOriginal: isLocked,
          status: isLocked ? "BILLING" : "ACTIVE",
        }
      });
    });

    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

export default router;
