import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

// Helper for common try/catch
const asyncHandler = (fn: (req: any, res: any, next: any) => Promise<any>) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch((error: any) => {
    console.error(`Error in ${req.originalUrl}:`, error);
    res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  });

router.post('/getPackageProgressHubData', asyncHandler(async (req, res) => {
  const { packageId } = req.body;
  if (!packageId) {
    throw new Error('Package ID is required');
  }
  const pkg = await prisma.subcontractPackage.findUnique({
    where: { id: packageId },
    include: {
      subcontractor: {
        include: { subcontractorBOQItems: { include: { awardedBoqItem: true } } }
      },
      accomplishments: { orderBy: { createdAt: 'desc' } },
      billings: { orderBy: { createdAt: 'desc' } }
    }
  });
  if (!pkg) {
    throw new Error('Package not found');
  }
  return res.json({ success: true, data: pkg });
}));

router.post('/getJobOrderProgressHubData', asyncHandler(async (req, res) => {
  const { jobOrderId } = req.body;
  if (!jobOrderId) {
    throw new Error('Job Order ID is required');
  }
  const jo = await prisma.jobOrder.findUnique({
    where: { id: jobOrderId },
    include: {
      subcontractor: true,
      subcontractAccomplishments: { orderBy: { createdAt: 'desc' } },
      subcontractBillings: { orderBy: { createdAt: 'desc' } }
    }
  });
  if (!jo) {
    throw new Error('Job Order not found');
  }
  return res.json({ success: true, data: jo });
}));

router.post('/createAccomplishment', asyncHandler(async (req, res) => {
  const data = req.body; // This 'data' object should already contain the `inspectionReport` path if a file was uploaded.
  const result = await prisma.subcontractAccomplishment.create({ data });
  return res.json({ success: true, data: result });
}));

router.post('/approveAccomplishment', asyncHandler(async (req, res) => {
  const { id } = req.body;
  if (!id) {
    throw new Error('Accomplishment ID is required');
  }
  const result = await prisma.subcontractAccomplishment.update({
    where: { id },
    data: { status: 'APPROVED' }
  });
  return res.json({ success: true, data: result });
}));

router.post('/createBilling', asyncHandler(async (req, res) => {
  let data = req.body;
  if (!data.billingNumber) data.billingNumber = `INV-${Date.now()}`;
  const result = await prisma.subcontractBilling.create({ data });
  return res.json({ success: true, data: result });
}));

router.post('/processPayment', asyncHandler(async (req, res) => {
  const { billingId } = req.body;
  if (!billingId) {
    throw new Error('Billing ID is required');
  }
  const result = await prisma.subcontractBilling.update({
    where: { id: billingId },
    data: { status: 'PAID' }
  });
  return res.json({ success: true, data: result });
}));

router.post('/submitBillingToPM', (_req, res) => {
  return res.status(409).json({ success: false, error: 'WORKFLOW_UNAVAILABLE: Billing submission to the project manager is unavailable because this legacy workflow is not supported by the current database schema. No changes were saved.' });
});

router.post('/endorseBillingToPD', (_req, res) => {
  return res.status(409).json({ success: false, error: 'WORKFLOW_UNAVAILABLE: Billing endorsement to the project director is unavailable because this legacy workflow is not supported by the current database schema. No changes were saved.' });
});

router.post('/approvePaymentRequest', (_req, res) => {
  return res.status(409).json({ success: false, error: 'WORKFLOW_UNAVAILABLE: Payment-request approval is unavailable because this legacy workflow is not supported by the current database schema. No changes were saved.' });
});

router.post('/endorseSubcontractPayment', (_req, res) => {
  return res.status(409).json({ success: false, error: 'WORKFLOW_UNAVAILABLE: Subcontract payment endorsement is unavailable because this legacy workflow is not supported by the current database schema. No changes were saved.' });
});

router.post('/approveSubcontractPayment', (_req, res) => {
  return res.status(409).json({ success: false, error: 'WORKFLOW_UNAVAILABLE: Subcontract payment approval is unavailable because this legacy workflow is not supported by the current database schema. No changes were saved.' });
});

router.post('/rejectSubcontractPayment', (_req, res) => {
  return res.status(409).json({ success: false, error: 'WORKFLOW_UNAVAILABLE: Subcontract payment rejection is unavailable because this legacy workflow is not supported by the current database schema. No changes were saved.' });
});

export default router;
