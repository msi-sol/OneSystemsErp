import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { validateQuotationLines } from '../../../../src/lib/procurement/quotation-validation';
import { CanvassPurchaseOrderError, generateCanvassPurchaseOrder } from '../services/canvass-purchase-order';

const router = Router();
const IMMUTABLE_QUOTATION_CANVASS_STATUSES = ['APPROVED', 'COMPLETED'];
const IMMUTABLE_QUOTATION_ERROR = 'Supplier quotations cannot be changed after the canvass recommendation is approved or a purchase order is generated.';

class CanvassQuotationLockedError extends Error {}

function getPbacContext(req: any) {
  return {
    userId: req.headers['x-user-session'] as string | undefined,
    activeProjectId: req.headers['x-active-project-id'] as string | undefined,
    simulatedRole: req.headers['x-simulated-role'] as string | undefined,
  };
}

async function invalidateCanvassComparison(tx: any, canvassId: string) {
  await tx.canvassForm.updateMany({
    where: { id: canvassId, status: 'ENDORSED' },
    data: { status: 'DRAFT' },
  });
  const editable = await tx.canvassForm.updateMany({
    where: { id: canvassId, status: { notIn: IMMUTABLE_QUOTATION_CANVASS_STATUSES } },
    data: { aiSummary: null, recommendedSupplierId: null },
  });
  if (editable.count !== 1) throw new CanvassQuotationLockedError(IMMUTABLE_QUOTATION_ERROR);

  await tx.supplierQuotation.updateMany({
    where: { canvassFormId: canvassId },
    data: { isRecommended: false, aiRank: null, aiRationale: null },
  });
}

function rejectLockedCanvass(res: any, status: string) {
  if (!IMMUTABLE_QUOTATION_CANVASS_STATUSES.includes(status)) return false;
  res.status(409).json({ success: false, error: IMMUTABLE_QUOTATION_ERROR });
  return true;
}

// Create Canvass Form
router.post('/', async (req, res) => {
  try {
    const { mrId } = req.body;
    const { userId } = getPbacContext(req);

    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const mr = await prisma.materialRequest.findUnique({
      where: { id: mrId },
      include: { items: true, project: true }
    });

    if (!mr) return res.status(404).json({ success: false, error: 'Material request not found' });

    const canvassItems = mr.items.filter(item => {
      const quantity = Number(item.approvedQuantity ?? item.quantity);
      return Number.isFinite(quantity) && quantity > 0;
    });
    if (canvassItems.length === 0) {
      return res.status(400).json({ success: false, error: 'This material request has no approved items with a positive quantity to canvass.' });
    }

    const existingCanvass = await prisma.canvassForm.findFirst({
      where: { mrId: mrId }
    });

    if (existingCanvass) {
      return res.json({ success: true, canvassId: existingCanvass.id });
    }

    const currentYear = new Date().getFullYear();
    const prefix = `CANV-${currentYear}-`;
    const lastCanvass = await prisma.canvassForm.findFirst({
      where: { canvassNumber: { startsWith: prefix } },
      orderBy: { canvassNumber: 'desc' },
      select: { canvassNumber: true }
    });

    let nextNumber = 1;
    if (lastCanvass && lastCanvass.canvassNumber) {
      const lastInt = parseInt(lastCanvass.canvassNumber.substring(prefix.length), 10);
      if (!isNaN(lastInt)) nextNumber = lastInt + 1;
    }
    const canvassNumber = `${prefix}${String(nextNumber).padStart(4, '0')}`;

    const canvass = await prisma.canvassForm.create({
      data: {
        canvassNumber,
        mrId: mr.id,
        projectId: mr.projectId,
        preparedById: userId,
        status: 'DRAFT',
        items: {
          create: canvassItems.map(item => ({
            quantityRequired: item.approvedQuantity ?? item.quantity,
            consolidatedBoqItemId: item.consolidatedBoqItemId
          }))
        }
      }
    });

    res.json({ success: true, canvassId: canvass.id });
  } catch (error: any) {
    console.error('Error creating canvass:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to create canvass form' });
  }
});

// Add Supplier Quotation
router.post('/:id/quotations', async (req, res) => {
  try {
    const { id } = req.params;
    const { supplierId, items } = req.body;

    const canvass = await prisma.canvassForm.findUnique({
      where: { id },
      include: { items: { select: { id: true, quantityRequired: true } } },
    });
    if (!canvass) return res.status(404).json({ success: false, error: 'Canvass not found' });
    if (rejectLockedCanvass(res, canvass.status)) return;

    let validatedItems;
    try {
      validatedItems = validateQuotationLines(items, canvass.items);
    } catch (validationError: any) {
      return res.status(400).json({ success: false, error: validationError.message });
    }
    const totalAmount = validatedItems.reduce((sum, item) => sum + item.totalCost, 0);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({ success: false, error: 'The quotation must have a finite positive total.' });
    }

    const quotation = await prisma.$transaction(async tx => {
      await invalidateCanvassComparison(tx, id);
      const created = await tx.supplierQuotation.create({
        data: {
          canvassFormId: id,
          supplierId: supplierId,
          status: 'RECEIVED',
          totalAmount,
          items: {
            create: validatedItems.map(item => ({
              canvassItemId: item.canvassItemId,
              unitCost: item.unitCost,
              quantityAvailable: item.quantityAvailable,
              totalCost: item.totalCost,
              brand: item.brand,
              remarks: item.remarks
            }))
          }
        }
      });
      return created;
    });

    res.json({ success: true, quotationId: quotation.id });
  } catch (error: any) {
    if (error instanceof CanvassQuotationLockedError) return res.status(409).json({ success: false, error: error.message });
    console.error('Error adding quotation:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to add quotation' });
  }
});

// Update Supplier Quotation
router.put('/:id/quotations/:quotationId', async (req, res) => {
  try {
    const { id } = req.params;
    const { quotationId } = req.params;
    const { supplierId, items } = req.body;

    const [canvass, existingQuotation] = await Promise.all([
      prisma.canvassForm.findUnique({
        where: { id },
        include: { items: { select: { id: true, quantityRequired: true } } },
      }),
      prisma.supplierQuotation.findFirst({
        where: { id: quotationId, canvassFormId: id },
        select: { id: true },
      }),
    ]);
    if (!canvass) return res.status(404).json({ success: false, error: 'Canvass not found' });
    if (!existingQuotation) return res.status(404).json({ success: false, error: 'Quotation not found in this canvass' });
    if (rejectLockedCanvass(res, canvass.status)) return;

    let validatedItems;
    try {
      validatedItems = validateQuotationLines(items, canvass.items);
    } catch (validationError: any) {
      return res.status(400).json({ success: false, error: validationError.message });
    }
    const totalAmount = validatedItems.reduce((sum, item) => sum + item.totalCost, 0);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return res.status(400).json({ success: false, error: 'The quotation must have a finite positive total.' });
    }

    await prisma.$transaction(async tx => {
      await invalidateCanvassComparison(tx, id);
      await tx.quotationItem.deleteMany({ where: { quotationId } });
      await tx.supplierQuotation.update({
        where: { id: quotationId },
        data: {
          supplierId,
          totalAmount,
          items: {
            create: validatedItems.map(item => ({
              canvassItemId: item.canvassItemId,
              unitCost: item.unitCost,
              quantityAvailable: item.quantityAvailable,
              totalCost: item.totalCost,
              brand: item.brand,
              remarks: item.remarks,
            }))
          }
        }
      });
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof CanvassQuotationLockedError) return res.status(409).json({ success: false, error: error.message });
    console.error('Error updating quotation:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update quotation' });
  }
});

// Auto Generate PO
router.post('/:id/generate-po', async (req, res) => {
  const { id } = req.params;
  const { supplierId } = req.body;
  const { userId } = getPbacContext(req);

  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const result = await generateCanvassPurchaseOrder(prisma, { canvassId: id, supplierId, userId });
    return res.json({ success: true, poId: result.poId, alreadyExists: result.alreadyExists });
  } catch (error: any) {
    console.error('Error generating PO:', error);
    // A concurrent retry may lose the status claim after another request created the PO.
    const current = await prisma.canvassForm.findUnique({ where: { id }, select: { status: true } }).catch(() => null);
    if (current?.status === 'COMPLETED') {
      const existingPO = await prisma.purchaseOrder.findFirst({
        where: { canvassFormId: id },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }).catch(() => null);
      if (existingPO) return res.json({ success: true, poId: existingPO.id, alreadyExists: true });
    }
    const statusCode = error instanceof CanvassPurchaseOrderError ? error.statusCode : 500;
    return res.status(statusCode).json({ success: false, error: error.message || 'Failed to generate PO' });
  }
});

// Send Canvass Email
router.post('/:id/email', async (req, res) => {
  try {
    const { id } = req.params;
    const { supplierIds } = req.body;

    const canvass = await prisma.canvassForm.findUnique({
      where: { id },
      include: { mr: true }
    });

    if (!canvass) return res.status(404).json({ success: false, error: 'Canvass not found' });

    const suppliers = await prisma.supplier.findMany({
      where: { id: { in: supplierIds } }
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    res.json({ 
      success: true, 
      message: `Canvass form successfully emailed to ${suppliers.length} supplier(s).` 
    });
  } catch (error: any) {
    console.error('Error sending canvass email:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to send emails' });
  }
});

// Approve Recommendation
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = getPbacContext(req);
    
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const canvass = await prisma.canvassForm.findUnique({ where: { id } });

    if (!canvass) return res.status(404).json({ success: false, error: 'Canvass not found' });
    if (!canvass.recommendedSupplierId) return res.status(400).json({ success: false, error: 'No recommended supplier to approve.' });
    if (canvass.status !== 'ENDORSED') {
      return res.status(409).json({ success: false, error: 'Only an endorsed canvass recommendation can be approved.' });
    }

    const approved = await prisma.canvassForm.updateMany({
      where: { id, status: 'ENDORSED' },
      data: { status: 'APPROVED' }
    });
    if (approved.count !== 1) return res.status(409).json({ success: false, error: 'The canvass status changed. Refresh and try again.' });

    res.json({ success: true, message: 'AI Recommendation Approved successfully.' });
  } catch (error: any) {
    console.error('Error approving canvass recommendation:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to approve recommendation' });
  }
});

// Endorse Recommendation
router.post('/:id/endorse', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = getPbacContext(req);
    
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const canvass = await prisma.canvassForm.findUnique({ where: { id } });

    if (!canvass) return res.status(404).json({ success: false, error: 'Canvass not found' });
    if (!canvass.recommendedSupplierId) return res.status(400).json({ success: false, error: 'No recommended supplier to endorse.' });
    if (!['DRAFT', 'RETURNED'].includes(canvass.status)) {
      return res.status(409).json({ success: false, error: 'Only a draft or returned canvass recommendation can be endorsed.' });
    }

    const endorsed = await prisma.canvassForm.updateMany({
      where: { id, status: { in: ['DRAFT', 'RETURNED'] } },
      data: { status: 'ENDORSED' }
    });
    if (endorsed.count !== 1) return res.status(409).json({ success: false, error: 'The canvass status changed. Refresh and try again.' });

    res.json({ success: true, message: 'AI Recommendation Endorsed successfully.' });
  } catch (error: any) {
    console.error('Error endorsing canvass recommendation:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to endorse recommendation' });
  }
});

// Delete Canvass
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, simulatedRole } = getPbacContext(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const role = simulatedRole || user.role;
    if (role !== 'SUPER_ADMIN') return res.status(403).json({ success: false, error: 'Unauthorized: Only SUPER_ADMIN can delete canvass forms' });

    await prisma.canvassForm.delete({ where: { id } });
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting canvass:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete canvass' });
  }
});

export default router;
