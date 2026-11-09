import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requirePermission } from '../lib/permissions';
import { submitTransaction, approveTransaction } from '../lib/workflow';
import { validateTransactionWithAI, verifyDeliveryDocumentWithAI } from '../lib/aiValidation';
import { uploadFileToS3 } from '../services/s3.service';
import { privateUploadUrl } from '../../../../src/lib/s3';
import { randomUUID } from 'node:crypto';
import { calculatePoReceiptProgress } from '../../../../src/lib/procurement/po-receipt-progress';
import { calculatePoReceiptCosts } from '../../../../src/lib/procurement/po-receipt-cost';
import { canReceivePurchaseOrder } from '../../../../src/lib/procurement/receivable-purchase-order';

const router = Router();
class DeliveryApprovalConflict extends Error {}
class DeliveryInputError extends Error {}

function getPbacContext(req: any) {
  return {
    userId: req.headers['x-user-session'] as string | undefined,
    activeProjectId: req.headers['x-active-project-id'] as string | undefined,
    simulatedRole: req.headers['x-simulated-role'] as string | undefined,
  };
}

router.post('/encode', async (req, res) => {
  try {
    const {
      poId,
      receiptNumber,
      items,
      fileBase64,
      mimeType,
      fileName,
      noFileReason
    } = req.body;

    const { userId, simulatedRole } = getPbacContext(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await requirePermission(user.id, 'DELIVERY_RECEIVING', 'canCreate', simulatedRole);

    if (!Array.isArray(items) || items.length === 0) throw new DeliveryInputError('At least one delivery line is required.');
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        supplier: true,
        mr: { select: { projectId: true } },
        items: { include: { consolidatedBoqItem: { select: { projectId: true } } } },
      },
    });
    if (!po) throw new DeliveryInputError('Purchase order not found.');
    if (!canReceivePurchaseOrder(po.status)) throw new DeliveryInputError('Only an approved, issued or partially delivered purchase order can receive materials.');
    for (const item of items) {
      // A line the DR lists but that did not arrive (actual 0) is a shortage: kept in the mismatch notes with its
      // remark, but not posted as a received line. It used to be refused, so a short delivery could not be encoded.
      const shortage = item && item.quantity === 0 && typeof item.remarks === 'string' && item.remarks.trim().length > 0;
      if (!item || typeof item.consolidatedBoqItemId !== 'string' ||
          typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || (item.quantity <= 0 && !shortage) ||
          typeof item.drQuantity !== 'number' || !Number.isFinite(item.drQuantity) || item.drQuantity <= 0) {
        throw new DeliveryInputError(item?.quantity === 0
          ? 'A line with 0 actual quantity needs a remark saying why it was not delivered.'
          : 'DR and actual delivery quantities must be positive numbers.');
      }
      const poItem = po.items.find(line => line.consolidatedBoqItemId === item.consolidatedBoqItemId);
      if (!poItem || poItem.consolidatedBoqItem.projectId !== po.mr.projectId) {
        throw new DeliveryInputError('Every delivery item must belong to the selected purchase order and project.');
      }
    }
    const receivedItems = items.filter((item: any) => item.quantity > 0);
    if (receivedItems.length === 0) throw new DeliveryInputError('Enter an actual quantity above 0 for at least one item. Nothing was received, so there is no delivery to record.');

    let drDocumentText = noFileReason ? `No document uploaded. Reason provided by user: ${noFileReason}` : 'No document uploaded.';
    let proofFileUrl: string | undefined;
    let hasProof = true;

    if (fileBase64 && mimeType && fileName) {
      const buffer = Buffer.from(fileBase64, 'base64');
      
      const s3Key = `deliveries/${randomUUID()}`;
      proofFileUrl = privateUploadUrl(await uploadFileToS3(buffer, s3Key, mimeType, { module: 'DELIVERY_RECEIVING', uploadedBy: userId, projectId: po.mr.projectId }));

      const itemIds = items.map((i: any) => i.consolidatedBoqItemId);
      const boqItems = await prisma.consolidatedBOQItem.findMany({
        where: { id: { in: itemIds } }
      });

      const poDetails = {
        poNumber: po.poNumber,
        supplierName: po.supplier.name,
        items: items.map((i: any) => {
          const b = boqItems.find((b: any) => b.id === i.consolidatedBoqItemId);
          return {
            description: b?.description || 'Unknown',
            quantity: i.quantity,
            drQuantity: i.drQuantity
          }
        })
      };

      const visionResult = await verifyDeliveryDocumentWithAI(buffer, mimeType, poDetails);

      if (!visionResult.matches) {
        return res.json({ 
          success: false, 
          error: `AI Document Mismatch: ${visionResult.findings}`,
          validationLogId: null 
        });
      }

      drDocumentText = `[AI EXTRACTED OCR & VISION MATCH PASSED]: ${visionResult.findings}`;
    } else if (noFileReason) {
      hasProof = false;
    }

    const mismatchedItems = items.filter((item: any) => item.quantity !== item.drQuantity);
    const isMismatch = mismatchedItems.length > 0;
    
    let mismatchNotes = null;
    if (isMismatch) {
      const itemIds = mismatchedItems.map((i: any) => i.consolidatedBoqItemId);
      const boqItems = await prisma.consolidatedBOQItem.findMany({
        where: { id: { in: itemIds } }
      });
      
      mismatchNotes = mismatchedItems.map((item: any) => {
        const boq = boqItems.find((b: any) => b.id === item.consolidatedBoqItemId);
        const diff = item.drQuantity - item.quantity;
        return `${diff > 0 ? 'Missing' : 'Over-delivered'} ${Math.abs(diff)} of ${boq?.description || 'Unknown Item'} (Reason: ${item.remarks})`;
      }).join(' | ');
    }

    if (hasProof !== false) {
      const validation = await validateTransactionWithAI(
        'Delivery Receiving',
        {
          action: 'Encode Delivery Receipt',
          poId,
          receiptNumber,
          isMismatch,
          mismatchNotes,
          items,
          attachedDocumentOCR: drDocumentText
        },
        user.id,
        user.role || 'STOCKMAN'
      );

      if (validation.validationStatus === 'BLOCKING ISSUE') {
        return res.json({ 
          success: false, 
          error: `AI Blocked Transaction: ${validation.findings}`,
          validationLogId: validation.validationLogId 
        });
      }
    }

    const delivery = await prisma.delivery.create({
      data: {
        poId,
        receiptNumber,
        status: 'FOR_ACCOUNTANT_APPROVAL',
        receivedById: user.id,
        proofFileUrl,
        hasProof,
        isMismatch,
        mismatchNotes,
        items: {
          create: receivedItems.map((item: any) => ({
            quantity: item.quantity,
            drQuantity: item.drQuantity,
            remarks: item.remarks,
            consolidatedBoqItemId: item.consolidatedBoqItemId,
          }))
        }
      }
    });

    await submitTransaction(user.id, user.role || 'STOCKMAN', 'DELIVERY_RECEIVING', delivery.id, simulatedRole);

    res.json({ success: true, deliveryId: delivery.id });
  } catch (error: any) {
    console.error('Error encoding delivery:', error);
    res.status(error instanceof DeliveryInputError ? 400 : 500).json({ error: error.message || 'Failed to encode delivery' });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, simulatedRole } = getPbacContext(req);
    
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await requirePermission(user.id, 'DELIVERY_RECEIVING', 'canApprove', simulatedRole);

    await prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.findUnique({
        where: { id },
        include: {
          items: { include: { consolidatedBoqItem: true } },
          po: { include: { supplier: true, items: true, mr: true } },
        },
      });
      if (!delivery || delivery.status !== 'FOR_ACCOUNTANT_APPROVAL') {
        throw new DeliveryApprovalConflict('This delivery is no longer awaiting approval. Refresh before retrying.');
      }
      if (!canReceivePurchaseOrder(delivery.po.status)) {
        throw new DeliveryApprovalConflict('The purchase order is no longer open for receiving. No stock or costs were applied.');
      }
      const claimed = await tx.delivery.updateMany({
        where: { id, status: 'FOR_ACCOUNTANT_APPROVAL' },
        data: { status: 'APPROVED', approverId: user.id },
      });
      if (claimed.count !== 1) throw new DeliveryApprovalConflict('Another approver processed this delivery. Refresh before retrying.');

      const priorDeliveries = await tx.delivery.findMany({
        where: { poId: delivery.poId, id: { not: id }, status: { in: ['APPROVED', 'COMPLETED'] } },
        include: { items: true },
      });
      const costs = calculatePoReceiptCosts(delivery.po.items, priorDeliveries, delivery.items);
      const balances = new Map<string, { delivered: Prisma.Decimal; cost: Prisma.Decimal }>();
      for (const [index, item] of delivery.items.entries()) {
        const poItem = delivery.po.items.find(i => i.consolidatedBoqItemId === item.consolidatedBoqItemId);
        if (!poItem || item.consolidatedBoqItem.projectId !== delivery.po.mr.projectId ||
            !Number.isFinite(item.quantity) || item.quantity <= 0 ||
            (item.drQuantity !== null && (!Number.isFinite(item.drQuantity) || item.drQuantity <= 0))) {
          throw new DeliveryApprovalConflict('A delivery line no longer matches a valid positive purchase-order item. No receipt quantities or costs were applied.');
        }
        const actualLineCost = costs.lineCosts[index];
        const prior = balances.get(item.consolidatedBoqItemId) || {
          delivered: new Prisma.Decimal(String(item.consolidatedBoqItem.deliveredQty)),
          cost: new Prisma.Decimal(String(item.consolidatedBoqItem.actualCost)),
        };
        const next = { delivered: prior.delivered.plus(String(item.quantity)), cost: prior.cost.plus(String(actualLineCost)) };
        balances.set(item.consolidatedBoqItemId, next);

        await tx.consolidatedBOQItem.update({
          where: { id: item.consolidatedBoqItemId },
          data: {
            deliveredQty: next.delivered.toNumber(),
            actualCost: next.cost.toNumber()
          }
        });

        if (delivery.po.mr && delivery.po.mr.projectId) {
          await tx.projectCostLedger.create({
            data: {
              projectId: delivery.po.mr.projectId,
              consolidatedBoqItemId: item.consolidatedBoqItemId,
              costDate: new Date(),
              costCategory: 'MATERIALS',
              referenceDocumentType: 'DELIVERY_RECEIPT',
              referenceDocumentNo: delivery.receiptNumber,
              supplierName: delivery.po.supplier.name,
              grossAmount: actualLineCost,
              netAmount: actualLineCost,
              paymentStatus: 'UNPAID',
              approvalStatus: 'APPROVED'
            }
          });

          // The delivered cost is now actual cost, so it is no longer an open commitment: reduce this material's
          // open PO commitments (same supplier first, then oldest first). Otherwise actual + committed counts it twice.
          let toRelease = new Prisma.Decimal(String(actualLineCost));
          const open = await tx.commitmentLedger.findMany({
            where: { projectId: delivery.po.mr.projectId, consolidatedBoqItemId: item.consolidatedBoqItemId, commitmentType: 'PURCHASE_ORDER', status: 'ACTIVE', remainingCommitment: { gt: 0 } },
            orderBy: { createdAt: 'asc' },
          });
          open.sort((a, b) => Number(b.supplierName === delivery.po.supplier.name) - Number(a.supplierName === delivery.po.supplier.name));
          for (const commitment of open) {
            if (toRelease.lte(0)) break;
            const release = Prisma.Decimal.min(toRelease, new Prisma.Decimal(String(commitment.remainingCommitment)));
            const remaining = new Prisma.Decimal(String(commitment.remainingCommitment)).minus(release);
            await tx.commitmentLedger.update({
              where: { id: commitment.id },
              data: {
                deliveredAmount: new Prisma.Decimal(String(commitment.deliveredAmount)).plus(release).toNumber(),
                remainingCommitment: remaining.toNumber(),
                status: remaining.lte(0) ? 'FULFILLED' : 'ACTIVE',
              },
            });
            toRelease = toRelease.minus(release);
          }
        }
      }

      const totalAmount = costs.totalAmount;

      let termDays = 0;
      if (delivery.po.supplier.paymentTerms) {
        const match = delivery.po.supplier.paymentTerms.match(/(\d+)/);
        if (match) {
          termDays = parseInt(match[1], 10);
        }
      }
      
      const dueDate = new Date(delivery.createdAt);
      dueDate.setDate(dueDate.getDate() + termDays);

      let calculatedNetAmount = totalAmount;
      let calculatedVatAmount = 0;
      if (delivery.po.supplier.isVatable) {
        calculatedNetAmount = totalAmount / 1.12;
        calculatedVatAmount = totalAmount - calculatedNetAmount;
      }

      const count = await tx.accountsPayable.count();
      const voucherNumber = `PV-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

      await tx.accountsPayable.create({
        data: {
          voucherNumber: voucherNumber,
          amount: totalAmount,
          netAmount: calculatedNetAmount,
          vatAmount: calculatedVatAmount,
          dueDate: dueDate,
          status: 'PENDING',
          deliveryId: delivery.id,
          poId: delivery.poId,
          supplierId: delivery.po.supplierId,
        }
      });

      const approvedDeliveries = await tx.delivery.findMany({
        where: { poId: delivery.poId, status: { in: ['APPROVED', 'COMPLETED'] } },
        include: { items: true },
      });
      const receiptProgress = calculatePoReceiptProgress(delivery.po.items, approvedDeliveries);
      if (receiptProgress.status) {
        await tx.purchaseOrder.update({
          where: { id: delivery.poId },
          data: { status: receiptProgress.status },
        });
      }
      await approveTransaction(user.id, user.role || 'PROJECT_ACCOUNTANT', 'DELIVERY_RECEIVING', id, 'Approved Delivery', simulatedRole, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error approving delivery:', error);
    res.status(error instanceof DeliveryApprovalConflict ? 409 : 500).json({ error: error.message || 'Failed to approve delivery' });
  }
});

// Reject a mis-encoded receipt that is still awaiting approval. Pending receipts have not changed stock, costs or
// payables (approval does that), so rejecting only closes the record; the correct receipt can then be encoded.
router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, simulatedRole } = getPbacContext(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 5 || reason.length > 500) return res.status(400).json({ error: 'Give a reason of 5 to 500 characters for rejecting this delivery.' });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    await requirePermission(user.id, 'DELIVERY_RECEIVING', 'canApprove', simulatedRole);
    const rejected = await prisma.delivery.updateMany({ where: { id, status: 'FOR_ACCOUNTANT_APPROVAL' }, data: { status: 'REJECTED', reviewerId: user.id } });
    if (rejected.count !== 1) return res.status(409).json({ error: 'Only a delivery awaiting approval can be rejected. Refresh to see its current status.' });
    await prisma.auditLog.create({ data: { userId: user.id, userRole: user.role, moduleName: 'DELIVERY_RECEIVING', transactionId: id, actionType: 'REJECT', oldValue: 'FOR_ACCOUNTANT_APPROVAL', newValue: 'REJECTED', remarks: reason } });
    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error && error.message ? error.message : 'Failed to reject delivery';
    res.status(message.startsWith('Unauthorized Action') ? 403 : 500).json({ error: message });
  }
});

router.post('/:id/upload-proof', async (req, res) => {
  try {
    const { id } = req.params;
    const { fileBase64, mimeType, fileName } = req.body;

    if (!fileBase64) return res.status(400).json({ error: 'No file provided' });

    const delivery = await prisma.delivery.findUnique({
      where: { id },
      include: {
        po: { include: { supplier: true } },
        items: { include: { consolidatedBoqItem: true } }
      }
    });

    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });

    const buffer = Buffer.from(fileBase64, 'base64');
    const s3Key = `deliveries/${randomUUID()}`;
    const proofFileUrl = privateUploadUrl(await uploadFileToS3(buffer, s3Key, mimeType, { module: 'DELIVERY_RECEIVING', uploadedBy: String(req.headers['x-user-session'] || '') }));

    const poDetails = {
      poNumber: delivery.po.poNumber,
      supplierName: delivery.po.supplier.name,
      items: delivery.items.map((i: any) => ({
        description: i.consolidatedBoqItem.description,
        quantity: i.quantity,
        drQuantity: i.drQuantity
      }))
    };

    const visionResult = await verifyDeliveryDocumentWithAI(buffer, mimeType, poDetails);

    if (!visionResult.matches) {
      return res.json({ 
        success: false, 
        error: `AI Document Mismatch: ${visionResult.findings}`
      });
    }

    await prisma.delivery.update({
      where: { id },
      data: { proofFileUrl, hasProof: true }
    });

    res.json({ success: true, proofFileUrl });
  } catch (error: any) {
    console.error('Error uploading delayed delivery proof:', error);
    res.status(500).json({ error: error.message || 'Failed to process delayed file upload.' });
  }
});

export default router;
