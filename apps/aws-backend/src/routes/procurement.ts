import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requirePermission } from '../lib/permissions';
import { validateTransactionWithAI } from '../lib/aiValidation';
import { approvePurchaseOrderInTransaction, createPurchaseOrdersFromMrInTransaction, PurchaseOrderInputError, PurchaseOrderSelfApprovalError, PurchaseOrderTransitionConflict, submitPurchaseOrderInTransaction } from '../services/purchase-order-transitions';

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
    if (typeof mrId !== 'string' || !mrId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Select an approved MRF and at least one material line.' });
    }

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

    const createdPOIds = await prisma.$transaction(tx => createPurchaseOrdersFromMrInTransaction(tx, mrId, items, {
      userId,
      userRole: currentUser.role || 'PURCHASING_OFFICER',
      simulatedRole,
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.json({ success: true, createdPOIds });
  } catch (error: any) {
    console.error('Error creating PO from MRF:', error);
    const status = error instanceof PurchaseOrderInputError ? 400 :
      error instanceof PurchaseOrderTransitionConflict ? 409 : 500;
    res.status(status).json({ error: error.message || 'Failed to create PO' });
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
    await prisma.$transaction(tx => approvePurchaseOrderInTransaction(tx, poId, {
      userId,
      userRole: currentUser.role || 'PROJECT_DIRECTOR',
      simulatedRole,
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error approving PO:', error);
    const forbidden = error instanceof PurchaseOrderSelfApprovalError || (error instanceof Error &&
      (error.message.startsWith('Unauthorized Action:') || error.message.includes('Self-approval is strictly prohibited')));
    const status = forbidden ? 403 : error instanceof PurchaseOrderTransitionConflict ? 409 : 500;
    res.status(status).json({ error: error.message || 'Failed to approve PO' });
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

    await requirePermission(userId, 'PURCHASE_ORDER', 'canSubmit', simulatedRole);
    await prisma.$transaction(tx => submitPurchaseOrderInTransaction(tx, poId, {
      userId,
      userRole: currentUser.role || 'PURCHASING_OFFICER',
      simulatedRole,
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error submitting PO:', error);
    const status = error instanceof Error && error.message.startsWith('Unauthorized Action:') ? 403 :
      error instanceof PurchaseOrderTransitionConflict ? 409 : 500;
    res.status(status).json({ error: error.message || 'Failed to submit PO' });
  }
});

export default router;
