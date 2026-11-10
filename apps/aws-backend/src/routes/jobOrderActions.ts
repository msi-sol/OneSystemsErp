import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import * as express from 'express'; // Required for express.json()
import { PrismaClient } from '@prisma/client';
import { requirePermission } from '../lib/permissions';
const router = Router();

// Middleware to parse JSON body for this router specifically.
// In a full Express app, this might be defined globally: app.use(express.json());
router.use(express.json());

router.post('/getJobOrders', async (req, res) => {
  try {
    const { projectId } = req.body;
    const jobOrders = await prisma.jobOrder.findMany({
      where: projectId ? { projectId } : undefined,
      include: {
        subcontractor: true,
        project: true,
        // Billed totals on the dashboards come from these approved billings.
        subcontractBillings: { select: { currentGross: true, approvalStatus: true, status: true, packageId: true } },
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: jobOrders });
  } catch (error: any) {
    console.error("Error fetching job orders:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getJobOrderById', async (req, res) => {
  try {
    const { id } = req.body;
    const jobOrder = await prisma.jobOrder.findUnique({
      where: { id },
      include: {
        subcontractor: true,
        project: true,
        subcontractAccomplishments: true,
        subcontractBillings: true
      }
    });
    res.json({ success: true, data: jobOrder });
  } catch (error: any) {
    console.error("Error fetching job order by ID:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getConsolidatedBoqItemsByProjectId', async (req, res) => {
  try {
    const { projectId } = req.body;
    const items = await prisma.consolidatedBOQItem.findMany({
      where: {
        projectId,
        quantity: { gt: 0 },
        totalCost: { gt: 0 }
      },
      select: { id: true, category: true, description: true, totalCost: true, itemCode: true, quantity: true, unitCost: true, unit: true }
    });
    const mapped = items.map(item => ({ ...item, combinedUnitCost: item.unitCost }));
    res.json({ success: true, items: mapped });
  } catch (error: any) {
    console.error("Error fetching consolidated BOQ items:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// The form (and the auth middleware's sessionId/simulatedRole) put keys on the body that are not
// JobOrder columns (boqReferenceIds, jobOrderType, durationDays, relations from initialData...).
// Passing the body straight to Prisma made every create/update fail validation, so only real
// columns are copied, with date-only strings converted to Dates.
const PAYMENT_BASIS = ['PROGRESS', 'MILESTONE', 'LUMP_SUM', 'PER_QUANTITY', 'PER_LOT', 'PER_DAY', 'PER_MANPOWER'];
const MATERIAL_RESPONSIBILITY = ['COMPANY_SUPPLIED', 'CONTRACTOR_SUPPLIED', 'MIXED'];
const BOQ_PSEUDO_REFERENCES = ['1_LOT', 'ADDITIONAL_WORKS'];

function toDateOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value as any);
  return isNaN(date.getTime()) ? null : date;
}

function textOrNull(value: unknown) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

async function buildJobOrderData(input: any, projectId: string) {
  const data: any = {};
  if (input.jobNumber !== undefined) data.jobNumber = String(input.jobNumber).trim();
  if (input.description !== undefined) data.description = String(input.description ?? '');
  if (input.location !== undefined) data.location = String(input.location ?? '');
  if (input.contractAmount !== undefined) {
    const amount = Number(input.contractAmount);
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Contract amount must be a non-negative number.');
    data.contractAmount = amount;
  }
  if (input.paymentBasis !== undefined) {
    if (!PAYMENT_BASIS.includes(input.paymentBasis)) throw new Error('Invalid payment basis.');
    data.paymentBasis = input.paymentBasis;
  }
  if (input.materialResponsibility !== undefined) {
    if (!MATERIAL_RESPONSIBILITY.includes(input.materialResponsibility)) throw new Error('Invalid material responsibility.');
    data.materialResponsibility = input.materialResponsibility;
  }
  if (input.subcontractorId !== undefined) data.subcontractorId = textOrNull(input.subcontractorId);
  if (input.packageId !== undefined) data.packageId = textOrNull(input.packageId);
  if (input.startDate !== undefined) data.startDate = toDateOrNull(input.startDate);
  if (input.completionDate !== undefined) data.completionDate = toDateOrNull(input.completionDate);
  for (const key of ['requiredOutput', 'safetyRequirements', 'acceptanceCriteria', 'remarks']) {
    if (input[key] !== undefined) data[key] = textOrNull(input[key]);
  }
  if (data.startDate && data.completionDate && data.completionDate < data.startDate) {
    throw new Error('Completion date cannot be before the start date.');
  }

  // Link the first real consolidated BOQ item; the pseudo references (1 Lot / additional works) have no row.
  if (Array.isArray(input.boqReferenceIds)) {
    const realRef = input.boqReferenceIds.find((ref: string) => ref && !BOQ_PSEUDO_REFERENCES.includes(ref));
    if (realRef) {
      const item = await prisma.consolidatedBOQItem.findFirst({ where: { id: realRef, projectId }, select: { id: true } });
      if (!item) throw new Error('The selected BOQ item does not belong to this project.');
      data.consolidatedBoqItemId = item.id;
    } else {
      data.consolidatedBoqItemId = null;
    }
  }
  return data;
}

router.post('/createJobOrder', async (req, res) => {
  try {
    const userId = req.body.sessionId as string;
    await requirePermission(userId, 'SUBCONTRACTING', 'canCreate', req.body.simulatedRole);
    const projectId = textOrNull(req.body.projectId);
    if (!projectId) return res.status(400).json({ success: false, error: 'Project is required.' });
    const data = await buildJobOrderData(req.body, projectId);
    if (!data.jobNumber) return res.status(400).json({ success: false, error: 'Job order number is required.' });
    if (!data.description || !data.location) return res.status(400).json({ success: false, error: 'Description and location are required.' });
    if (!data.paymentBasis || !data.materialResponsibility || data.contractAmount === undefined) {
      return res.status(400).json({ success: false, error: 'Contract amount, payment basis and material responsibility are required.' });
    }
    const jobOrder = await prisma.jobOrder.create({
      data: { ...data, projectId, status: 'DRAFT', preparedBy: userId },
    });
    res.json({ success: true, data: jobOrder });
  } catch (error: any) {
    console.error("Error creating job order:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/updateJobOrder', async (req, res) => {
  try {
    const userId = req.body.sessionId as string;
    await requirePermission(userId, 'SUBCONTRACTING', 'canEditDraft', req.body.simulatedRole);
    const { id, data: input } = req.body;
    const existing = await prisma.jobOrder.findUnique({ where: { id }, select: { projectId: true, status: true } });
    if (!existing) return res.status(404).json({ success: false, error: 'Job order not found.' });
    if (['APPROVED', 'ISSUED', 'CANCELLED'].includes(existing.status)) {
      return res.status(409).json({ success: false, error: `A ${existing.status.toLowerCase()} job order can no longer be edited.` });
    }
    // Project and status are not editable here (status changes go through updateJobOrderStatus).
    const data = await buildJobOrderData(input || {}, existing.projectId);
    const jobOrder = await prisma.jobOrder.update({
      where: { id },
      data,
    });
    res.json({ success: true, data: jobOrder });
  } catch (error: any) {
    console.error("Error updating job order:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/deleteJobOrder', async (req, res) => {
  try {
    const { id } = req.body;
    await requirePermission(req.body.sessionId, 'SUBCONTRACTING', 'canDeleteDraft', req.body.simulatedRole);
    await prisma.jobOrder.delete({
      where: { id },
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting job order:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/updateJobOrderStatus', async (req, res) => {
  try {
    const { id, newStatus } = req.body;
    // Approval/issuance needs approval rights, cancellation needs cancel rights; moving through review needs submit rights.
    const STATUS_PERMISSION: Record<string, string> = {
      DRAFT: 'canReturnForCorrection',
      FOR_REVIEW: 'canSubmit',
      FOR_FINANCIAL_REVIEW: 'canReview',
      FOR_TECHNICAL_REVIEW: 'canReview',
      APPROVED: 'canApprove',
      ISSUED: 'canApprove',
      CANCELLED: 'canCancel',
    };
    const action = STATUS_PERMISSION[newStatus];
    if (!action) return res.status(400).json({ success: false, error: 'Invalid job order status.' });
    await requirePermission(req.body.sessionId, 'SUBCONTRACTING', action, req.body.simulatedRole);
    const approver = newStatus === 'APPROVED' ? { approvedBy: req.body.sessionId } : newStatus.startsWith('FOR_') && newStatus !== 'FOR_REVIEW' ? { reviewedBy: req.body.sessionId } : {};
    const jobOrder = await prisma.jobOrder.update({
      where: { id },
      data: { status: newStatus, ...approver },
    });
    res.json({ success: true, data: jobOrder });
  } catch (error: any) {
    console.error("Error updating job order status:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/unlockJobOrder', (_req, res) => {
  return res.status(409).json({ success: false, error: 'WORKFLOW_UNAVAILABLE: This legacy job-order unlock action has no supported lock field. Use the authorized job-order workflow instead. No changes were saved.' });
});

export default router;
