import { prisma } from '../lib/prisma';
import {processWpsMaterialReturn}from'../lib/wps-material-return';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { validateMaterialReturnDraft } from '../services/material-returns';
const router = Router();
function getPbacContext(req: any) {
  return { userId: req.headers['x-user-session'] as string | undefined };
}

router.post('/createMaterialReturn', async (req, res) => {
  try {
    const { data } = req.body; // Original function takes 'data' as a single argument
    const { issuanceId, projectId, foremanId, items } = data;

    // Generate MRS number (Material Return Slip)
    const newReturn = await prisma.$transaction(async tx => {
      await validateMaterialReturnDraft(tx, data);
      const count = await tx.materialReturn.count();
      const mrsNumber = `MRS-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
      return tx.materialReturn.create({
      data: {
        mrsNumber,
        issuanceId,
        projectId,
        foremanId,
        items: {
          create: items.map((item: any) => ({
            returnedQty: item.returnedQty,
            condition: item.condition,
            issuanceItemId: item.issuanceItemId,
            consolidatedBoqItemId: item.consolidatedBoqItemId,
          }))
        }
      }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.json({ success: true, data: newReturn });
  } catch (error: any) {
    console.error('Error creating material return (AWS):', error);
    res.status(400).json({ success: false, error: error.message || 'Failed to create return slip' });
  }
});

router.post('/processMaterialReturn', async (req, res) => {
  try {
    const { userId } = getPbacContext(req);
    const { returnId } = req.body;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    // Both ordinary and package-linked returns need the same quantity guards
    // and transaction. A failed receipt must never partly restock inventory.
    const updatedReturn = await processWpsMaterialReturn(returnId, userId);

    res.json({ success: true, data: updatedReturn });
  } catch (error: any) {
    console.error('Error processing material return (AWS):', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to process return slip' });
  }
});

export default router;
