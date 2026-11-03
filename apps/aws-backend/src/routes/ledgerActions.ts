import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

router.post('/getProjectCostLedger', async (req, res) => {
  try {
    const { projectId } = req.body;

    if (typeof projectId !== 'string' || projectId.trim() === '') {
      return res.status(400).json({ success: false, error: 'projectId is required and must be a non-empty string.' });
    }

    const entries = await prisma.projectCostLedger.findMany({
      where: { projectId },
      orderBy: { costDate: 'desc' }
    });

    return res.json({ success: true, data: entries });
  } catch (error: any) {
    console.error('AWS Backend: Failed to fetch project cost ledger:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

export default router;
