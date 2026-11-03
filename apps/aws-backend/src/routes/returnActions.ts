import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

router.post('/createMaterialReturn', async (req, res) => {
  try {
    const { data } = req.body; // Original function takes 'data' as a single argument
    const { issuanceId, projectId, foremanId, items } = data;

    // Generate MRS number (Material Return Slip)
    const count = await prisma.materialReturn.count();
    const mrsNumber = `MRS-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const newReturn = await prisma.materialReturn.create({
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

    res.json({ success: true, data: newReturn });
  } catch (error: any) {
    console.error('Error creating material return (AWS):', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to create return slip' });
  }
});

router.post('/processMaterialReturn', async (req, res) => {
  try {
    const { returnId, warehousemanId } = req.body; // Original function takes returnId, warehousemanId as arguments

    const materialReturn = await prisma.materialReturn.findUnique({
      where: { id: returnId },
      include: { items: true }
    });

    if (!materialReturn) throw new Error('Return slip not found');
    if (materialReturn.status === 'COMPLETED') throw new Error('Return slip already completed');

    // For each item with GOOD condition, decrease the consumedQty
    for (const item of materialReturn.items) {
      if (item.condition === 'GOOD') {
        await prisma.consolidatedBOQItem.update({
          where: { id: item.consolidatedBoqItemId },
          data: {
            consumedQty: { decrement: Number(item.returnedQty) }
          }
        });
      }
    }

    const updatedReturn = await prisma.materialReturn.update({
      where: { id: returnId },
      data: {
        status: 'COMPLETED',
        warehousemanId,
        receiveDate: new Date()
      }
    });

    await prisma.materialIssuance.update({
      where: { id: materialReturn.issuanceId },
      data: { status: 'COMPLETED' }
    });

    res.json({ success: true, data: updatedReturn });
  } catch (error: any) {
    console.error('Error processing material return (AWS):', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to process return slip' });
  }
});

export default router;
