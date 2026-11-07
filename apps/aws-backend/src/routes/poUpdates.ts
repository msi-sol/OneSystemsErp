import { prisma } from '../lib/prisma';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requirePermission } from '../lib/permissions';
import {
  PurchaseOrderInputError,
  PurchaseOrderTransitionConflict,
  returnPurchaseOrderToCanvassingInTransaction,
} from '../services/purchase-order-transitions';

const router = Router();

type AuthedRequest = { user?: { id: string; role: string }; pbacContext?: { simulatedRole?: string } };

/**
 * Only "Reject PO" (FOR_REVIEW back to DRAFT) uses this route. It previously accepted any status from any
 * signed-in user, which could mark a PO APPROVED without the approval checks or budget commitments.
 */
router.post('/updatePOStatus', async (req, res) => {
  try {
    const { user, pbacContext } = req as typeof req & AuthedRequest;
    const { poId, status } = req.body;
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (typeof poId !== 'string' || !poId || status !== 'DRAFT') {
      return res.status(400).json({ success: false, error: 'Only returning a purchase order under review to draft is supported here.' });
    }
    await requirePermission(user.id, 'PURCHASE_ORDER', 'canApprove', pbacContext?.simulatedRole);
    const changed = await prisma.purchaseOrder.updateMany({ where: { id: poId, status: 'FOR_REVIEW' }, data: { status: 'DRAFT' } });
    if (changed.count !== 1) return res.status(409).json({ success: false, error: 'Only a purchase order under review can be rejected. Refresh to see its current status.' });
    await prisma.auditLog.create({ data: { userId: user.id, userRole: user.role, moduleName: 'PURCHASE_ORDER', transactionId: poId, actionType: 'REJECT_TO_DRAFT', oldValue: 'FOR_REVIEW', newValue: 'DRAFT' } });
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('Error updating PO status:', message);
    res.status(message.startsWith('Unauthorized Action') ? 403 : 500).json({ success: false, error: message });
  }
});

/** Return a draft or under-review canvass PO for further canvassing (see the service for the full rules). */
router.post('/returnToCanvassing', async (req, res) => {
  try {
    const { user, pbacContext } = req as typeof req & AuthedRequest;
    const { poId, reason } = req.body;
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (typeof poId !== 'string' || !poId) return res.status(400).json({ success: false, error: 'Missing purchase order.' });
    await requirePermission(user.id, 'PURCHASE_ORDER', 'canApprove', pbacContext?.simulatedRole);
    const result = await prisma.$transaction(
      tx => returnPurchaseOrderToCanvassingInTransaction(tx, poId, { userId: user.id, userRole: user.role, simulatedRole: pbacContext?.simulatedRole }, reason),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    res.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status = error instanceof PurchaseOrderInputError ? 400 : error instanceof PurchaseOrderTransitionConflict ? 409 : message.startsWith('Unauthorized Action') ? 403 : 500;
    if (status === 500) console.error('Error returning PO to canvassing:', message);
    res.status(status).json({ success: false, error: message });
  }
});

export default router;
