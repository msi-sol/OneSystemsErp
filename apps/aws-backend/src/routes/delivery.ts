import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requirePermission } from '../lib/permissions';
import { submitTransaction, approveTransaction } from '../lib/workflow';
import { validateTransactionWithAI, verifyDeliveryDocumentWithAI } from '../lib/aiValidation';
import { uploadFileToS3 } from '../services/s3.service';
import { privateUploadUrl } from '../../../../src/lib/s3';
import { randomUUID } from 'node:crypto';

const router = Router();
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

    let drDocumentText = noFileReason ? `No document uploaded. Reason provided by user: ${noFileReason}` : 'No document uploaded.';
    let proofFileUrl: string | undefined;
    let hasProof = true;

    if (fileBase64 && mimeType && fileName) {
      const buffer = Buffer.from(fileBase64, 'base64');
      
      const s3Key = `deliveries/${randomUUID()}`;
      const uploadProject = await prisma.purchaseOrder.findUnique({ where: { id: poId }, select: { mr: { select: { projectId: true } } } });
      proofFileUrl = privateUploadUrl(await uploadFileToS3(buffer, s3Key, mimeType, { module: 'DELIVERY_RECEIVING', uploadedBy: userId, projectId: uploadProject?.mr.projectId }));

      const po = await prisma.purchaseOrder.findUnique({
        where: { id: poId },
        include: { supplier: true }
      });

      if (!po) throw new Error("PO not found for AI Verification");

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
          create: items.map((item: any) => ({
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
    res.status(500).json({ error: error.message || 'Failed to encode delivery' });
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

    const delivery = await prisma.delivery.findUnique({
      where: { id },
      include: { 
        items: { include: { consolidatedBoqItem: true } },
        po: { include: { supplier: true, items: true, mr: true } }
      }
    });

    if (!delivery || delivery.status !== 'FOR_ACCOUNTANT_APPROVAL') {
      return res.status(400).json({ error: 'Invalid delivery status' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id },
        data: { status: 'APPROVED', approverId: user.id }
      });

      for (const item of delivery.items) {
        const poItem = delivery.po.items.find(i => i.consolidatedBoqItemId === item.consolidatedBoqItemId);
        const unitCost = poItem ? poItem.unitCost : item.consolidatedBoqItem.unitCost;
        const actualLineCost = item.quantity * unitCost;

        await tx.consolidatedBOQItem.update({
          where: { id: item.consolidatedBoqItemId },
          data: {
            deliveredQty: { increment: item.quantity },
            actualCost: { increment: actualLineCost }
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
        }
      }

      const totalAmount = delivery.items.reduce((sum, item) => {
        const poItem = delivery.po.items.find(i => i.consolidatedBoqItemId === item.consolidatedBoqItemId);
        const unitCost = poItem ? poItem.unitCost : item.consolidatedBoqItem.unitCost;
        return sum + (item.quantity * unitCost);
      }, 0);

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
    });

    await approveTransaction(user.id, user.role || 'PROJECT_ACCOUNTANT', 'DELIVERY_RECEIVING', id, 'Approved Delivery', simulatedRole);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error approving delivery:', error);
    res.status(500).json({ error: error.message || 'Failed to approve delivery' });
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
