import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requirePermission } from '../lib/permissions';
import { submitTransaction, approveTransaction } from '../lib/workflow';
import { validateTransactionWithAI } from '../lib/aiValidation';

const router = Router();
function getPbacContext(req: any) {
  return {
    userId: req.headers['x-user-session'] as string | undefined,
    activeProjectId: req.headers['x-active-project-id'] as string | undefined,
    simulatedRole: req.headers['x-simulated-role'] as string | undefined,
  };
}

// Create PO from MRF
router.post('/po/from-mrf', async (req, res) => {
  try {
    const { mrId, items } = req.body;
    const { userId, simulatedRole } = getPbacContext(req);

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    await requirePermission(userId, 'PURCHASE_ORDER', 'canCreate', simulatedRole);

    const supplierGroups = items.reduce((groups: Record<string, any[]>, item: any) => {
      if (!groups[item.supplierId]) groups[item.supplierId] = [];
      groups[item.supplierId].push(item);
      return groups;
    }, {});

    const validation = await validateTransactionWithAI(
      'Purchase Order Generation',
      { action: 'Generate Purchase Orders from MRF', mrId, itemsToProcure: items },
      userId,
      currentUser.role || 'PURCHASING_OFFICER'
    );

    if (validation.validationStatus === 'BLOCKING ISSUE') {
      return res.json({ 
        success: false, 
        error: `AI Blocked Transaction: ${validation.findings}`,
        validationLogId: validation.validationLogId 
      });
    }

    const createdPOIds = [];
    const currentYear = new Date().getFullYear();
    const prefix = `PO-${currentYear}-`;
    const lastPO = await prisma.purchaseOrder.findFirst({
      where: { poNumber: { startsWith: prefix } },
      orderBy: { poNumber: 'desc' },
      select: { poNumber: true }
    });

    let count = 0;
    if (lastPO && lastPO.poNumber) {
      const lastInt = parseInt(lastPO.poNumber.substring(prefix.length), 10);
      if (!isNaN(lastInt)) count = lastInt;
    }

    for (const supplierId of Object.keys(supplierGroups)) {
      const supplierItems = supplierGroups[supplierId];
      const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
      const isVatable = supplier?.isVatable ?? false;

      const totalAmount = supplierItems.reduce((acc: number, item: any) => acc + (item.quantity * item.unitCost), 0);
      let netAmount = totalAmount;
      let vatAmount = 0;

      if (isVatable) {
        netAmount = totalAmount / 1.12;
        vatAmount = totalAmount - netAmount;
      }
      
      count++;
      const poNumber = `PO-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;

      const po = await prisma.purchaseOrder.create({
        data: {
          poNumber,
          status: 'FOR_REVIEW',
          supplierId,
          mrId,
          preparerId: userId,
          totalAmount,
          netAmount,
          vatAmount,
          items: {
            create: supplierItems.map((item: any) => ({
              quantity: item.quantity,
              unitCost: item.unitCost,
              consolidatedBoqItemId: item.consolidatedBoqItemId
            }))
          }
        }
      });

      await submitTransaction(userId, currentUser.role || 'PURCHASING_OFFICER', 'PURCHASE_ORDER', po.id, simulatedRole);
      createdPOIds.push(po.id);
    }

    await prisma.materialRequest.update({
      where: { id: mrId },
      data: { status: 'FULLY_PROCURED' }
    });

    res.json({ success: true, createdPOIds });
  } catch (error: any) {
    console.error('Error creating PO from MRF:', error);
    res.status(500).json({ error: error.message || 'Failed to create PO' });
  }
});

// Approve PO
router.post('/po/:poId/approve', async (req, res) => {
  try {
    const { poId } = req.params;
    const { userId, simulatedRole } = getPbacContext(req);

    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    await requirePermission(userId, 'PURCHASE_ORDER', 'canApprove', simulatedRole);

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { items: true, mr: true, supplier: true }
    });
    if (!po) return res.status(404).json({ error: 'PO not found' });

    if (po.preparerId === userId && currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Self-approval blocked by Workflow Engine.' });
    }

    await prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: 'APPROVED', approverId: userId }
    });

    if (po.mr && po.mr.projectId) {
      for (const item of po.items) {
        if (item.consolidatedBoqItemId) {
          const lineTotal = item.quantity * item.unitCost;
          await prisma.commitmentLedger.create({
            data: {
              projectId: po.mr.projectId,
              consolidatedBoqItemId: item.consolidatedBoqItemId,
              commitmentType: 'PURCHASE_ORDER',
              supplierName: po.supplier?.name || '',
              approvedAmount: lineTotal,
              remainingCommitment: lineTotal,
              status: 'ACTIVE'
            }
          });

          await prisma.consolidatedBOQItem.update({
            where: { id: item.consolidatedBoqItemId },
            data: { committedCost: { increment: lineTotal } }
          });
        }
      }
    }

    await approveTransaction(userId, currentUser.role || 'PROJECT_DIRECTOR', 'PURCHASE_ORDER', po.id, 'Approved PO digitally', simulatedRole);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error approving PO:', error);
    res.status(500).json({ error: error.message || 'Failed to approve PO' });
  }
});

// Submit PO
router.post('/po/:poId/submit', async (req, res) => {
  try {
    const { poId } = req.params;
    const { userId, simulatedRole } = getPbacContext(req);

    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) return res.status(404).json({ error: 'PO not found' });

    await prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: 'FOR_REVIEW' }
    });

    await submitTransaction(userId, currentUser.role || 'PURCHASING_OFFICER', 'PURCHASE_ORDER', po.id, simulatedRole);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error submitting PO:', error);
    res.status(500).json({ error: error.message || 'Failed to submit PO' });
  }
});

export default router;
