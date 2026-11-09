import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
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

/**
 * Subcontract / job-order billing approval: DRAFT -> SUBMITTED (to PM) -> FOR_VALIDATION (endorsed to PD)
 * -> APPROVED_FOR_PAYMENT. These handlers were switched off ("legacy workflow"), so a billing could never leave
 * DRAFT: subcontract costs never reached payables or the project's actual cost. Each step checks the current status
 * and permission; the final approval posts the billed gross to the project's actual-cost ledger, like approved
 * deliveries post materials.
 */
async function moveBilling(req: any, res: any, from: string[], to: 'SUBMITTED' | 'FOR_VALIDATION' | 'APPROVED_FOR_PAYMENT', permission: string) {
  const { id } = req.body;
  if (!id) return res.status(400).json({ success: false, error: 'Billing ID is required.' });
  const userId = req.body.sessionId as string;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  await requirePermission(userId, 'SUBCONTRACTING', permission, req.body.simulatedRole);
  const result = await prisma.$transaction(async (tx: any) => {
    const billing = await tx.subcontractBilling.findUnique({ where: { id }, include: { subcontractor: { select: { name: true } } } });
    if (!billing) return { status: 404, error: 'Billing not found.' };
    if (!from.includes(billing.status)) return { status: 409, error: `This billing is ${String(billing.status).replace(/_/g, ' ').toLowerCase()}; it cannot move to ${to.replace(/_/g, ' ').toLowerCase()} from there.` };
    const moved = await tx.subcontractBilling.updateMany({
      where: { id, status: billing.status },
      data: { status: to, approvalStatus: to === 'APPROVED_FOR_PAYMENT' ? 'APPROVED' : to === 'SUBMITTED' ? 'SUBMITTED' : 'FOR_APPROVAL' },
    });
    if (moved.count !== 1) return { status: 409, error: 'The billing changed meanwhile. Refresh and try again.' };
    if (to === 'APPROVED_FOR_PAYMENT' && billing.currentGross > 0) {
      await tx.projectCostLedger.create({ data: {
        projectId: billing.projectId, costDate: new Date(), costCategory: 'SUBCONTRACT',
        referenceDocumentType: billing.jobOrderId ? 'JOB_ORDER_BILLING' : 'SUBCONTRACT_BILLING', referenceDocumentNo: billing.billingNumber,
        subcontractorName: billing.subcontractor?.name ?? null,
        grossAmount: billing.currentGross, withholdingTaxAmount: billing.whtDeduction || 0, netAmount: billing.currentGross,
        unpaidBalance: billing.netPayable, paymentStatus: 'UNPAID', approvalStatus: 'APPROVED', approvedById: userId,
      } });
    }
    return { status: 200 };
  });
  if (result.status !== 200) return res.status(result.status).json({ success: false, error: result.error });
  return res.json({ success: true });
}

router.post('/submitBillingToPM', asyncHandler((req, res) => moveBilling(req, res, ['DRAFT'], 'SUBMITTED', 'canSubmit')));
router.post('/endorseBillingToPD', asyncHandler((req, res) => moveBilling(req, res, ['SUBMITTED'], 'FOR_VALIDATION', 'canApprove')));
router.post('/approvePaymentRequest', asyncHandler((req, res) => moveBilling(req, res, ['FOR_VALIDATION'], 'APPROVED_FOR_PAYMENT', 'canApprove')));

/**
 * Subcontract payment: Finance endorses the disbursement (method, reference, date) to the Project Director, who
 * approves (a PaymentRecord is written, the billing becomes PAID and its actual-cost ledger row is marked paid) or
 * rejects it. The endorsed details are kept in the billing's supportingDocs JSON (the schema has no columns for a
 * pending payment). These handlers were switched off, so subcontractors could never be paid in the system.
 */
const PAYMENT_DIRECTORS = ['PROJECT_DIRECTOR', 'SUPER_ADMIN'];
const docsOf = (billing: any) => (billing?.supportingDocs && typeof billing.supportingDocs === 'object' && !Array.isArray(billing.supportingDocs) ? billing.supportingDocs : {});

router.post('/endorseSubcontractPayment', asyncHandler(async (req, res) => {
  const { billingId, paymentData } = req.body;
  const userId = req.body.sessionId as string;
  if (!billingId) return res.status(400).json({ success: false, error: 'Billing ID is required.' });
  await requirePermission(userId, 'PAYMENT_ISSUANCE', 'canCreate', req.body.simulatedRole);
  const method = typeof paymentData?.paymentMethod === 'string' ? paymentData.paymentMethod.trim() : '';
  const reference = typeof paymentData?.paymentRef === 'string' ? paymentData.paymentRef.trim() : '';
  const date = paymentData?.paidAt ? new Date(paymentData.paidAt) : null;
  if (!method || !reference || !date || Number.isNaN(date.getTime())) return res.status(400).json({ success: false, error: 'Enter the payment method, reference number and payment date.' });
  const billing = await prisma.subcontractBilling.findUnique({ where: { id: billingId } });
  if (!billing) return res.status(404).json({ success: false, error: 'Billing not found.' });
  if (billing.status !== 'APPROVED_FOR_PAYMENT' || billing.paymentStatus === 'PAID') return res.status(409).json({ success: false, error: 'Only a billing approved for payment and not yet paid can be endorsed for disbursement.' });
  if (docsOf(billing).pendingPayment) return res.status(409).json({ success: false, error: 'This payment is already endorsed and awaiting the Project Director.' });
  await prisma.subcontractBilling.update({ where: { id: billingId }, data: {
    accountingStatus: 'REVIEWED',
    supportingDocs: { ...docsOf(billing), pendingPayment: { amount: billing.netPayable, method, reference, date: date.toISOString(), endorsedById: userId, endorsedAt: new Date().toISOString() } },
  } });
  return res.json({ success: true });
}));

router.post('/approveSubcontractPayment', asyncHandler(async (req, res) => {
  const { billingId } = req.body;
  const userId = req.body.sessionId as string;
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { role: true } }) : null;
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const role = req.body.simulatedRole || user.role;
  if (!PAYMENT_DIRECTORS.includes(role)) return res.status(403).json({ success: false, error: 'Only the Project Director can approve a subcontract disbursement.' });
  const result = await prisma.$transaction(async (tx: any) => {
    const billing = await tx.subcontractBilling.findUnique({ where: { id: billingId } });
    if (!billing) return { status: 404, error: 'Billing not found.' };
    const pending = docsOf(billing).pendingPayment;
    if (!pending || billing.paymentStatus === 'PAID') return { status: 409, error: 'There is no endorsed payment awaiting approval for this billing.' };
    if (pending.endorsedById === userId && role !== 'SUPER_ADMIN') return { status: 403, error: 'Self-approval is not allowed. Another director must approve the payment you endorsed.' };
    const claimed = await tx.subcontractBilling.updateMany({ where: { id: billingId, paymentStatus: { not: 'PAID' } }, data: {
      paymentStatus: 'PAID', status: 'PAID',
      supportingDocs: { ...docsOf(billing), pendingPayment: null, payment: { ...pending, approvedById: userId, approvedAt: new Date().toISOString() } },
    } });
    if (claimed.count !== 1) return { status: 409, error: 'The payment changed meanwhile. Refresh and try again.' };
    await tx.paymentRecord.create({ data: { billingId, amountPaid: pending.amount, paymentDate: new Date(pending.date), method: pending.method, referenceNumber: pending.reference } });
    await tx.projectCostLedger.updateMany({
      where: { projectId: billing.projectId, referenceDocumentNo: billing.billingNumber, costCategory: 'SUBCONTRACT' },
      data: { paidAmount: pending.amount, unpaidBalance: 0, paymentStatus: 'PAID' },
    });
    return { status: 200 };
  });
  if (result.status !== 200) return res.status(result.status).json({ success: false, error: result.error });
  return res.json({ success: true });
}));

router.post('/rejectSubcontractPayment', asyncHandler(async (req, res) => {
  const { billingId } = req.body;
  const userId = req.body.sessionId as string;
  const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { role: true } }) : null;
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!PAYMENT_DIRECTORS.includes(req.body.simulatedRole || user.role)) return res.status(403).json({ success: false, error: 'Only the Project Director can reject a subcontract disbursement.' });
  const billing = await prisma.subcontractBilling.findUnique({ where: { id: billingId } });
  if (!billing || !docsOf(billing).pendingPayment) return res.status(409).json({ success: false, error: 'There is no endorsed payment awaiting approval for this billing.' });
  await prisma.subcontractBilling.update({ where: { id: billingId }, data: { accountingStatus: 'PENDING', supportingDocs: { ...docsOf(billing), pendingPayment: null } } });
  return res.json({ success: true });
}));

export default router;
