import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import * as express from 'express'; // Required for express.json()
import { PrismaClient } from '@prisma/client';
import { withJobOrderReadFields } from '../lib/jobOrderWrites';
const router = Router();

// Middleware to parse JSON body for this router specifically.
// In a full Express app, this might be defined globally: app.use(express.json());
router.use(express.json());

router.post('/getJobOrders', async (req, res) => {
  try {
    const { projectId } = req.body;
    const jobOrders = await prisma.jobOrder.findMany({
      where: projectId ? { projectId } : undefined,
      include: {
        subcontractor: true,
        project: true,
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: jobOrders.map(withJobOrderReadFields) });
  } catch (error: any) {
    console.error("Error fetching job orders:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getJobOrderById', async (req, res) => {
  try {
    const { id } = req.body;
    const jobOrder = await prisma.jobOrder.findUnique({
      where: { id },
      include: {
        subcontractor: true,
        project: true,
        subcontractAccomplishments: true,
        subcontractBillings: true
      }
    });
    res.json({ success: true, data: jobOrder && withJobOrderReadFields(jobOrder) });
  } catch (error: any) {
    console.error("Error fetching job order by ID:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getConsolidatedBoqItemsByProjectId', async (req, res) => {
  try {
    const { projectId } = req.body;
    const items = await prisma.consolidatedBOQItem.findMany({
      where: {
        projectId,
        quantity: { gt: 0 },
        totalCost: { gt: 0 }
      },
      select: { id: true, category: true, description: true, totalCost: true, itemCode: true, quantity: true, unitCost: true, unit: true }
    });
    const mapped = items.map(item => ({ ...item, combinedUnitCost: item.unitCost }));
    res.json({ success: true, items: mapped });
  } catch (error: any) {
    console.error("Error fetching consolidated BOQ items:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
