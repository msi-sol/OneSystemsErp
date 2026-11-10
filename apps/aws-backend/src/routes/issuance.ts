import { consumeMaterialReservations } from '../../../../src/lib/scheduling/work-package-material-inventory';
import { readPackageMaterialPlanning } from '../../../../src/lib/scheduling/work-package-material-planning';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { validateTransactionWithAI } from '../lib/aiValidation';
import { prepareIssuance, validateIssuanceDraft } from '../services/material-issuance';
import { materialStock } from '../../../../src/lib/procurement/material-values';

const router = Router();
function getPbacContext(req: any) {
  return {
    userId: req.headers['x-user-session'] as string | undefined,
    activeProjectId: req.headers['x-active-project-id'] as string | undefined,
    simulatedRole: req.headers['x-simulated-role'] as string | undefined,
  };
}

router.get('/consolidated-items/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const items = await prisma.consolidatedBOQItem.findMany({
      where: { projectId },
      orderBy: { description: 'asc' }
    });
    
    const availableItems = items.filter((item: any) => item.deliveredQty > item.consumedQty);
    res.json({ success: true, data: availableItems });
  } catch (error: any) {
    console.error('Error fetching consolidated items:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch items' });
  }
});

router.post('/create', async (req, res) => {
  try {
    const data = req.body;
    const { userId } = getPbacContext(req);
    await validateIssuanceDraft(prisma, data);

    const validation = await validateTransactionWithAI(
      'Material Issuance',
      {
        action: 'Create Material Issuance Slip',
        projectId: data.projectId,
        activity: data.activity,
        itemsRequested: data.items
      },
      data.foremanId || userId || 'unknown',
      'USER'
    );

    if (validation.validationStatus === 'BLOCKING ISSUE') {
      return res.json({ 
        success: false, 
        error: `AI Blocked Transaction: ${validation.findings}`,
        validationLogId: validation.validationLogId 
      });
    }

    const count = await prisma.materialIssuance.count();
    const misNumber = `MIS-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const issuance = await prisma.$transaction(async tx => {
      await validateIssuanceDraft(tx, data);
      return tx.materialIssuance.create({
      data: {
        misNumber,
        projectId: data.projectId,
        foremanId: data.foremanId,
        activity: data.activity,
        items: {
          create: data.items.map((item: any) => ({
            consolidatedBoqItemId: item.consolidatedBoqItemId,
            requestedQty: item.requestedQty,
          }))
        }
      }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.json({ success: true, issuance });
  } catch (error: any) {
    console.error('Error creating issuance slip:', error);
    res.status(400).json({ success: false, error: error.message || 'Failed to create issuance slip' });
  }
});

router.post('/:id/process', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = getPbacContext(req);
    const { itemsData } = req.body;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    await prisma.$transaction(async (tx) => {
      await prepareIssuance(tx, id, userId, itemsData);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error processing issuance:', error);
    res.status(400).json({ success: false, error: error.message || 'Failed to process issuance' });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = getPbacContext(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const overAllocation:{materialId:string;description:string;unit:string;required:number;alreadyIssued:number;releasing:number;excess:number}[]=[];
    await prisma.$transaction(async (tx) => {
      const slip = await tx.materialIssuance.findUnique({
        where: { id },
        include: { items: true }
      });

      if (!slip) throw new Error('Slip not found');
      if (slip.status !== 'PROCESSED') throw new Error('Slip must be processed first');

      const packageLink=await tx.auditLog.findFirst({where:{transactionId:slip.id,actionType:'WPS_PROCUREMENT_RECORD_LINKED'},orderBy:{createdAt:'desc'},select:{newValue:true}});
      const sourcePackageId=packageLink?JSON.parse(packageLink.newValue||'{}').sourcePackageId||null:null;
      // The destination section's material allocation (required vs already issued). Releasing more is still allowed,
      // as before, but it is flagged on the slip's history and returned as a warning, never silently accepted.
      const allocation=sourcePackageId?await readPackageMaterialPlanning(tx,slip.projectId,sourcePackageId):[];
      for (const item of slip.items) {
        const requirement=allocation.find(row=>row.materialId===item.consolidatedBoqItemId);
        if(!requirement)continue;
        const required=Number(requirement.requiredQuantity), afterRelease=Number(requirement.issued)+Number(item.releasedQty);
        if(required>0&&afterRelease>required+1e-9)overAllocation.push({materialId:item.consolidatedBoqItemId,description:requirement.description,unit:requirement.unit,required,alreadyIssued:Number(requirement.issued),releasing:Number(item.releasedQty),excess:Number((afterRelease-required).toFixed(4))});
      }
      if(overAllocation.length)await tx.auditLog.create({data:{userId,userRole:'SYSTEM',moduleName:'MATERIAL_ISSUANCE',transactionId:slip.id,actionType:'ISSUANCE_ABOVE_SECTION_ALLOCATION',newValue:JSON.stringify({projectId:slip.projectId,sourcePackageId,items:overAllocation})}});
      for (const item of slip.items) {
        const boqItem = await tx.consolidatedBOQItem.findUnique({
          where: { id: item.consolidatedBoqItemId }
        });

        if (!boqItem) throw new Error('BOQ Item not found');
        if(boqItem.projectId!==slip.projectId)throw Error('Issuance material must belong to the same project.');

        const available = materialStock(boqItem);
        if (item.releasedQty > available) {
          throw new Error(`Not enough inventory for ${boqItem.description}. Available: ${available}, Requested: ${item.releasedQty}`);
        }

        if(!Number.isFinite(item.releasedQty)||item.releasedQty<=0||item.releasedQty>item.requestedQty)throw Error('Released quantity must be positive and cannot exceed the requested quantity.');
        await consumeMaterialReservations(tx,{projectId:slip.projectId,materialId:boqItem.id,quantity:item.releasedQty,projectStock:available,sourcePackageId});
        await tx.consolidatedBOQItem.update({
          where: { id: boqItem.id },
          data: {
            consumedQty: new Prisma.Decimal(String(boqItem.consumedQty)).plus(String(item.releasedQty)).toNumber()
          }
        });
      }

      await tx.materialIssuance.update({
        where: { id },
        data: {
          status: 'RELEASED',
          accountantId: userId,
          releaseDate: new Date(),
          releasedById: userId
        }
      });
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});

    res.json({ success: true, ...(overAllocation.length ? { warnings: overAllocation.map(row=>`${row.description}: ${row.alreadyIssued + row.releasing} ${row.unit} issued to this section, above its allocation of ${row.required} (by ${row.excess}).`) } : {}) });
  } catch (error: any) {
    console.error('Error approving issuance:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to approve issuance' });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.materialIssuance.update({
      where: { id },
      data: { status: 'REJECTED' }
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error rejecting issuance:', error);
    res.status(500).json({ success: false, error: 'Failed to reject' });
  }
});

export default router;
