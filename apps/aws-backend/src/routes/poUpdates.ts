import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

router.post('/updatePOStatus', async (req, res) => {
  try {
    const { poId, status, approverId } = req.body; // approverId will be sent by the Next.js action if status is 'ISSUED'

    if (!poId || !status) {
      return res.status(400).json({ success: false, error: 'Missing poId or status' });
    }

    const data: any = { status };

    if (status === 'ISSUED') {
      if (!approverId) {
        return res.status(400).json({ success: false, error: 'approverId is required for ISSUED status' });
      }
      data.approverId = approverId; // The Project Director approves
    }

    await prisma.purchaseOrder.update({
      where: { id: poId },
      data
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating PO status:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

export default router;
