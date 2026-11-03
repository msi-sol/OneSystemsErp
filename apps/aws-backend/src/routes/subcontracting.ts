import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requirePermission } from '../lib/permissions';

const router = Router();
function parseBoqReferenceIds(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item: unknown) => typeof item === 'string')) return parsed;
  } catch { /* Older records may contain one plain BOQ ID. */ }
  return [value];
}

function getPbacContext(req: any) {
  return {
    userId: req.headers['x-user-session'] as string | undefined,
    activeProjectId: req.headers['x-active-project-id'] as string | undefined,
    simulatedRole: req.headers['x-simulated-role'] as string | undefined,
  };
}

// ---------------------------------------------------------
// JOB ORDERS
// ---------------------------------------------------------

router.post('/job-orders', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canCreate', simulatedRole);
    const data = req.body;

    if (!data.jobNumber) data.jobNumber = 'JO-' + Date.now();
    const existing = await prisma.jobOrder.findUnique({ where: { jobNumber: data.jobNumber } });
    if (existing) throw new Error(`A Job Order with number "${data.jobNumber}" already exists.`);
    
    if (data.startDate) data.startDate = new Date(data.startDate);
    if (data.completionDate) data.completionDate = new Date(data.completionDate);
    
    if (data.contractAmount > 250000) {
      data.isThresholdExceeded = true;
      data.thresholdWarning = "This Job Order amount exceeds the standard Job Order limit. Consider converting this to a full subcontract.";
    }

    const boqReferenceIds = data.boqReferenceIds || [];
    if (!Array.isArray(boqReferenceIds) || !boqReferenceIds.every((id: unknown) => typeof id === 'string')) return res.status(400).json({ success: false, error: 'BOQ references must be a list of IDs.' });
    if (boqReferenceIds.length > 0) {
      const pureBoqIds = boqReferenceIds.filter((id: string) => id !== '1_LOT');
      if (pureBoqIds.length > 0) {
        const existingSubcontract = await prisma.subcontractorBOQItem.findFirst({
          where: { awardedBoqItemId: { in: pureBoqIds } }
        });
        if (existingSubcontract) throw new Error(`Conflict Error: One or more selected BOQ items are already assigned to an active Subcontract Package.`);
      }
    }

    const existingJOs = await prisma.jobOrder.findMany({
      where: { projectId: data.projectId, subcontractorId: data.subcontractorId }
    });

    const isDuplicate = existingJOs.some(jo => {
      const existingIds = parseBoqReferenceIds(jo.boqReferenceId);
      if (existingIds.length === boqReferenceIds.length && existingIds.length > 0) {
        const sortedExisting = [...existingIds].sort();
        const sortedIncoming = [...boqReferenceIds].sort();
        return sortedExisting.every((val, index) => val === sortedIncoming[index]);
      }
      return false;
    });

    if (isDuplicate) throw new Error("Duplicate Error: A Job Order for this Subcontractor with the exact same BOQ scope already exists.");

    const { durationDays, boqReferenceIds: _, jobOrderType, ...prismaData } = data;
    prismaData.boqReferenceId = JSON.stringify(boqReferenceIds);

    const result = await prisma.jobOrder.create({ data: prismaData });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/job-orders/:id', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canEdit', simulatedRole);
    const { id } = req.params;
    const data = req.body;

    if (data.startDate) data.startDate = new Date(data.startDate);
    if (data.completionDate) data.completionDate = new Date(data.completionDate);
    
    if (data.contractAmount > 250000) {
      data.isThresholdExceeded = true;
      data.thresholdWarning = "This Job Order amount exceeds the standard Job Order limit. Consider converting this to a full subcontract.";
    } else {
      data.isThresholdExceeded = false;
      data.thresholdWarning = null;
    }

    const existing = await prisma.jobOrder.findUnique({
      where: { id },
      include: { subcontractAccomplishments: true, subcontractBillings: true }
    });
    
    if (existing) {
      const isLocked = existing.subcontractAccomplishments.some((a: any) => a.status === 'APPROVED') || 
                       existing.subcontractBillings.some((b: any) => b.status === 'APPROVED_FOR_PAYMENT' || b.paymentStatus === 'PAID');
      if (isLocked) throw new Error("Job Order is locked and cannot be edited because accomplishments or payments have been processed.");
    }

    const boqReferenceId = data.boqReferenceIds || [];
    if (!Array.isArray(boqReferenceId) || !boqReferenceId.every((id: unknown) => typeof id === 'string')) return res.status(400).json({ success: false, error: 'BOQ references must be a list of IDs.' });
    const { durationDays, project, subcontractor, subcontractAccomplishments, subcontractBillings, boqReferenceIds: _, jobOrderType, ...prismaData } = data;
    prismaData.boqReferenceId = JSON.stringify(boqReferenceId);

    const result = await prisma.jobOrder.update({ where: { id }, data: prismaData });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/job-orders/:id', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canDelete', simulatedRole);
    await prisma.jobOrder.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/job-orders/:id/status', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canEdit', simulatedRole);
    const { id } = req.params;
    const { newStatus } = req.body;

    const jo = await prisma.jobOrder.findUnique({ where: { id }, include: { project: true, subcontractor: true } });
    if (!jo) throw new Error("Job order not found");

    const result = await prisma.jobOrder.update({ where: { id }, data: { status: newStatus } });

    const isApproved = newStatus === 'APPROVED';
    if (isApproved && jo.status !== 'APPROVED' && jo.consolidatedBoqItemId) {
      await prisma.commitmentLedger.create({
        data: {
          projectId: jo.projectId,
          consolidatedBoqItemId: jo.consolidatedBoqItemId,
          commitmentType: 'SUBCONTRACT',
          subcontractorName: jo.subcontractor?.name || '',
          approvedAmount: jo.contractAmount,
          remainingCommitment: jo.contractAmount,
          status: 'ACTIVE'
        }
      });
      await prisma.consolidatedBOQItem.update({
        where: { id: jo.consolidatedBoqItemId },
        data: { committedCost: { increment: jo.contractAmount } }
      });
    }

    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/job-orders/:id/unlock', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canEdit', simulatedRole);
    const result = await prisma.jobOrder.update({ where: { id: req.params.id }, data: { status: 'FOR_FINANCIAL_REVIEW' } });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

// ---------------------------------------------------------
// SUBCONTRACTING
// ---------------------------------------------------------

router.post('/subcontractors', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canCreate', simulatedRole);
    const result = await prisma.subcontractor.create({ data: req.body });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/subcontractors/:id', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canEdit', simulatedRole);
    const result = await prisma.subcontractor.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/subcontractors/:id', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canDelete', simulatedRole);
    await prisma.subcontractor.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/packages', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canCreate', simulatedRole);
    const data = req.body;
    if (!data.packageNumber) data.packageNumber = 'SP-' + Date.now();
    const result = await prisma.subcontractPackage.create({ data });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/packages/:id', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canEdit', simulatedRole);
    const result = await prisma.subcontractPackage.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/accomplishments', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canCreate', simulatedRole);
    const data = req.body;
    if (data.cumulativePercent > 100) throw new Error("Cumulative accomplishment cannot exceed 100%");
    const result = await prisma.subcontractAccomplishment.create({ data });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/billings', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canCreate', simulatedRole);
    const data = req.body;
    if (!data.billingNumber) data.billingNumber = 'BILL-' + Date.now();
    const result = await prisma.subcontractBilling.create({ data });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/packages/full', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canCreate', simulatedRole);
    let { packageData, boqItems, powData } = req.body;

    if (boqItems && boqItems.length > 0) {
      const awardedBoqIds = boqItems.map((item: any) => item.id);
      const conflictingJO = await prisma.jobOrder.findFirst({
        where: { boqReferenceId: { in: awardedBoqIds } }
      });
      if (conflictingJO) throw new Error(`Conflict Error: BOQ item is already assigned to active Job Order (${conflictingJO.jobNumber}).`);
    }

    const result = await prisma.$transaction(async (tx) => {
      if (packageData.startDate) packageData.startDate = new Date(packageData.startDate);
      if (packageData.targetCompletion) packageData.targetCompletion = new Date(packageData.targetCompletion);
      if (!packageData.packageNumber) packageData.packageNumber = 'SP-' + Date.now();

      const newPackage = await tx.subcontractPackage.create({ data: packageData });

      if (boqItems && boqItems.length > 0) {
        const boqData = boqItems.map((item: any) => ({
          subcontractorId: newPackage.subcontractorId,
          awardedBoqItemId: item.id,
          quantity: parseFloat(item.subcontractorQuantity) || 0,
          unitCost: parseFloat(item.subcontractorUnitCost) || 0,
          totalCost: (parseFloat(item.subcontractorQuantity) || 0) * (parseFloat(item.subcontractorUnitCost) || 0),
        }));
        await tx.subcontractorBOQItem.createMany({ data: boqData });
      }

      if (powData) {
        if (powData.startDate) powData.startDate = new Date(powData.startDate);
        if (powData.endDate) powData.endDate = new Date(powData.endDate);
        await tx.programOfWorks.create({ data: { ...powData, packageId: newPackage.id } });
      }

      return newPackage;
    });

    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/packages/full/:id', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canEdit', simulatedRole);
    let { packageData, boqItems, powData } = req.body;
    const { id } = req.params;

    const result = await prisma.$transaction(async (tx) => {
      if (packageData.startDate) packageData.startDate = new Date(packageData.startDate);
      if (packageData.targetCompletion) packageData.targetCompletion = new Date(packageData.targetCompletion);

      const { project, subcontractor, programOfWorks, accomplishments, billings, jobOrders, ...cleanData } = packageData;
      const updatedPackage = await tx.subcontractPackage.update({ where: { id }, data: cleanData });

      if (powData) {
        if (powData.startDate) powData.startDate = new Date(powData.startDate);
        if (powData.endDate) powData.endDate = new Date(powData.endDate);

        const existingPow = await tx.programOfWorks.findFirst({ where: { packageId: id } });
        if (existingPow) {
          await tx.programOfWorks.update({ where: { id: existingPow.id }, data: powData });
        } else {
          await tx.programOfWorks.create({ data: { ...powData, packageId: id } });
        }
      }

      return updatedPackage;
    });

    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/packages/:id', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canDelete', simulatedRole);
    const { id } = req.params;
    await prisma.programOfWorks.deleteMany({ where: { packageId: id } });
    await prisma.subcontractPackage.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/packages/:id/status', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canEdit', simulatedRole);
    const { id } = req.params;
    const { status } = req.body;
    const isApproved = status === 'APPROVED';
    
    const pkg = await prisma.subcontractPackage.findUnique({ where: { id }, include: { project: true, subcontractor: true } });
    if (!pkg) throw new Error("Package not found");

    const result = await prisma.subcontractPackage.update({
      where: { id },
      data: { status: status as any, isLocked: isApproved ? true : undefined }
    });

    if (isApproved && pkg.status !== 'APPROVED' && pkg.consolidatedBoqItemId) {
      await prisma.commitmentLedger.create({
        data: {
          projectId: pkg.projectId,
          consolidatedBoqItemId: pkg.consolidatedBoqItemId,
          commitmentType: 'SUBCONTRACT',
          subcontractorName: pkg.subcontractor?.name || '',
          approvedAmount: pkg.contractAmount,
          remainingCommitment: pkg.contractAmount,
          status: 'ACTIVE'
        }
      });
      await prisma.consolidatedBOQItem.update({
        where: { id: pkg.consolidatedBoqItemId },
        data: { committedCost: { increment: pkg.contractAmount } }
      });
    }
    
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/packages/:id/unlock', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    // Explicit permission enforcement for unlocking is checked below
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } }
    });

    const packageBillings = await prisma.subcontractBilling.findMany({
      where: { packageId: id, status: { in: ['APPROVED_FOR_PAYMENT', 'PAID'] } }
    });

    const hasCompletedPayments = packageBillings.length > 0;
    let isAuthorized = false;
    
    if (hasCompletedPayments) {
      isAuthorized = user?.email === 'pd@gmail.com' || user?.role === 'PROJECT_DIRECTOR' || user?.role === 'SUPER_ADMIN' || (user?.userRoles?.some(ur => ['SUPER_ADMIN', 'PROJECT_DIRECTOR'].includes(ur.role.roleCode)) ?? false);
    } else {
      isAuthorized = user?.email === 'pd@gmail.com' || user?.role === 'PROJECT_DIRECTOR' || user?.role === 'PROJECT_MANAGER' || user?.role === 'SUPER_ADMIN' || (user?.userRoles?.some(ur => ['SUPER_ADMIN', 'PROJECT_DIRECTOR', 'PROJECT_MANAGER'].includes(ur.role.roleCode)) ?? false);
    }

    if (!isAuthorized) {
      return res.status(403).json({ success: false, error: hasCompletedPayments ? 'Unauthorized: Since payment has been approved/completed, only the Project Director can unlock this package.' : 'Unauthorized: Only Project Managers or Project Directors can unlock packages.' });
    }

    const result = await prisma.subcontractPackage.update({ where: { id }, data: { isLocked: false } });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

export default router;
