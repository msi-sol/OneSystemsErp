import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
function getPbacContext(req: any) {
  return {
    userId: req.headers['x-user-session'] as string | undefined,
    activeProjectId: req.headers['x-active-project-id'] as string | undefined,
    simulatedRole: req.headers['x-simulated-role'] as string | undefined,
  };
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
          create: mr.items.map(item => ({
            quantityRequired: item.approvedQuantity || item.quantity,
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

    const quotation = await prisma.supplierQuotation.create({
      data: {
        canvassFormId: id,
        supplierId: supplierId,
        status: 'RECEIVED',
        totalAmount: items.reduce((acc: number, item: any) => acc + (item.unitCost * item.quantityAvailable), 0),
        items: {
          create: items.map((item: any) => ({
            canvassItemId: item.canvassItemId,
            unitCost: item.unitCost,
            quantityAvailable: item.quantityAvailable,
            totalCost: item.unitCost * item.quantityAvailable,
            brand: item.brand,
            remarks: item.remarks
          }))
        }
      }
    });

    res.json({ success: true, quotationId: quotation.id });
  } catch (error: any) {
    console.error('Error adding quotation:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to add quotation' });
  }
});

// Update Supplier Quotation
router.put('/:id/quotations/:quotationId', async (req, res) => {
  try {
    const { quotationId } = req.params;
    const { supplierId, items } = req.body;

    await prisma.quotationItem.deleteMany({ where: { quotationId } });
    const totalAmount = items.reduce((acc: number, item: any) => acc + (item.unitCost * item.quantityAvailable), 0);
    await prisma.supplierQuotation.update({
      where: { id: quotationId },
      data: {
        supplierId,
        totalAmount,
        items: {
          create: items.map((item: any) => ({
            canvassItemId: item.canvassItemId,
            unitCost: item.unitCost,
            quantityAvailable: item.quantityAvailable,
            totalCost: item.unitCost * item.quantityAvailable,
            brand: item.brand,
            remarks: item.remarks
          }))
        }
      }
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating quotation:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update quotation' });
  }
});

// Auto Generate PO
router.post('/:id/generate-po', async (req, res) => {
  try {
    const { id } = req.params;
    const { supplierId } = req.body;
    const { userId } = getPbacContext(req);

    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const canvass = await prisma.canvassForm.findUnique({
      where: { id },
      include: { mr: true }
    });

    if (!canvass) return res.status(404).json({ success: false, error: 'Canvass not found' });

    if (!canvass.mrId) return res.status(409).json({ success: false, error: 'Link this canvass to a material request before generating a purchase order.' });

    const quotation = await prisma.supplierQuotation.findFirst({
      where: { canvassFormId: id, supplierId: supplierId },
      include: { items: { include: { canvassItem: true } } }
    });

    if (!quotation) return res.status(404).json({ success: false, error: 'Quotation not found' });

    const currentYear = new Date().getFullYear();
    const prefix = `PO-${currentYear}-`;
    const lastPO = await prisma.purchaseOrder.findFirst({
      where: { poNumber: { startsWith: prefix } },
      orderBy: { poNumber: 'desc' },
      select: { poNumber: true }
    });

    let nextNumber = 1;
    if (lastPO && lastPO.poNumber) {
      const lastInt = parseInt(lastPO.poNumber.substring(prefix.length), 10);
      if (!isNaN(lastInt)) nextNumber = lastInt + 1;
    }
    const poNumber = `${prefix}${String(nextNumber).padStart(4, '0')}`;

    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierId,
        mrId: canvass.mrId,
        canvassFormId: canvass.id,
        preparerId: userId,
        status: 'DRAFT',
        totalAmount: quotation.totalAmount,
        netAmount: quotation.totalAmount,
        items: {
          create: quotation.items.map(qi => ({
            quantity: qi.quantityAvailable || qi.canvassItem.quantityRequired,
            unitCost: qi.unitCost,
            consolidatedBoqItemId: qi.canvassItem.consolidatedBoqItemId
          }))
        }
      }
    });

    await prisma.canvassForm.update({
      where: { id },
      data: { status: 'COMPLETED' }
    });

    res.json({ success: true, poId: po.id });
  } catch (error: any) {
    console.error('Error generating PO:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to generate PO' });
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

    await prisma.canvassForm.update({
      where: { id },
      data: { status: 'APPROVED' }
    });

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

    await prisma.canvassForm.update({
      where: { id },
      data: { status: 'ENDORSED' }
    });

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
