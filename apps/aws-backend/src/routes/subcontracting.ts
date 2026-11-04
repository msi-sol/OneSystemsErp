import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PackageStatus, PrismaClient } from '@prisma/client';
import { requirePermission } from '../lib/permissions';
import { assertBoqItemsNotInJobOrder, changeJobOrderStatus, createJobOrderFromRequest, deleteJobOrderFromRequest, JOB_ORDER_DELETE_ACTION, JOB_ORDER_EDIT_ACTION, JOB_ORDER_UNLOCK_ACTION, jobOrderErrorStatus, jobOrderStatusAction, unlockJobOrderFromRequest, updateJobOrderFromRequest } from '../lib/jobOrderWrites';

const router = Router();

// The right each package status needs, following the job order statuses. Everything
// from approval onward holds a commitment, so it needs an approver.
const PACKAGE_STATUS_ACTIONS: Record<PackageStatus, string> = {
  DRAFT: 'canReturnForCorrection',
  FOR_REVIEW: 'canSubmit',
  FOR_BUDGET_VALIDATION: 'canReview',
  FOR_TECHNICAL_APPROVAL: 'canReview',
  FOR_FINAL_APPROVAL: 'canReview',
  APPROVED: 'canApprove',
  AGREEMENT_ISSUED: 'canApprove',
  JOB_ORDER_ISSUED: 'canApprove',
  ONGOING: 'canApprove',
  FOR_INSPECTION: 'canApprove',
  PARTIALLY_ACCOMPLISHED: 'canApprove',
  FOR_BILLING: 'canApprove',
  BILLED: 'canApprove',
  PARTIALLY_PAID: 'canApprove',
  FULLY_PAID: 'canApprove',
  CLOSED: 'canApprove',
  CANCELLED: 'canCancel',
};
const PACKAGE_LOCKED_ERROR = 'Package is approved and locked. Unlock it before changing it.';

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
    const result = await createJobOrderFromRequest(req.body);
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(jobOrderErrorStatus(error)).json({ success: false, error: error.message }); }
});

router.put('/job-orders/:id', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', JOB_ORDER_EDIT_ACTION, simulatedRole);
    const result = await updateJobOrderFromRequest(req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(jobOrderErrorStatus(error)).json({ success: false, error: error.message }); }
});

router.delete('/job-orders/:id', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', JOB_ORDER_DELETE_ACTION, simulatedRole);
    await deleteJobOrderFromRequest(req.params.id);
    res.json({ success: true });
  } catch (error: any) { res.status(jobOrderErrorStatus(error)).json({ success: false, error: error.message }); }
});

router.put('/job-orders/:id/status', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    const { status, action } = jobOrderStatusAction(req.body?.newStatus);
    await requirePermission(userId!, 'SUBCONTRACTING', action, simulatedRole);
    const result = await changeJobOrderStatus(req.params.id, status);
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(jobOrderErrorStatus(error)).json({ success: false, error: error.message }); }
});

router.put('/job-orders/:id/unlock', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', JOB_ORDER_UNLOCK_ACTION, simulatedRole);
    const result = await unlockJobOrderFromRequest(req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(jobOrderErrorStatus(error)).json({ success: false, error: error.message }); }
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
    await requirePermission(userId!, 'SUBCONTRACTING', 'canEditDraft', simulatedRole);
    // Accreditation is an approval, not a draft edit.
    const { accreditation, ...data } = req.body;
    const result = await prisma.subcontractor.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/subcontractors/:id', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SUBCONTRACTING', 'canDeleteDraft', simulatedRole);
    const { id } = req.params;
    // Deleting a subcontractor cascades to its packages, job orders and billings.
    const subcontractor = await prisma.subcontractor.findUnique({
      where: { id },
      select: { _count: { select: { packages: true, jobOrders: true, subcontractBillings: true, backCharges: true, subcontractorBOQItems: true } } },
    });
    if (subcontractor && Object.values(subcontractor._count).some((count) => count > 0)) {
      return res.status(409).json({ success: false, error: 'This subcontractor has packages, job orders or billings and cannot be deleted.' });
    }
    await prisma.subcontractor.delete({ where: { id } });
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
    await requirePermission(userId!, 'SUBCONTRACTING', 'canEditDraft', simulatedRole);
    const { id } = req.params;
    const pkg = await prisma.subcontractPackage.findUnique({ where: { id }, select: { isLocked: true } });
    if (pkg?.isLocked) return res.status(409).json({ success: false, error: PACKAGE_LOCKED_ERROR });
    // Status and the lock only change through their own routes.
    const { status, isLocked, ...data } = req.body;
    const result = await prisma.subcontractPackage.update({ where: { id }, data });
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
      await assertBoqItemsNotInJobOrder(packageData.projectId, boqItems.map((item: any) => item.id));
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
    await requirePermission(userId!, 'SUBCONTRACTING', 'canEditDraft', simulatedRole);
    let { packageData, boqItems, powData } = req.body;
    const { id } = req.params;
    const pkg = await prisma.subcontractPackage.findUnique({ where: { id }, select: { isLocked: true } });
    if (pkg?.isLocked) return res.status(409).json({ success: false, error: PACKAGE_LOCKED_ERROR });

    const result = await prisma.$transaction(async (tx) => {
      if (packageData.startDate) packageData.startDate = new Date(packageData.startDate);
      if (packageData.targetCompletion) packageData.targetCompletion = new Date(packageData.targetCompletion);

      const { project, subcontractor, programOfWorks, accomplishments, billings, jobOrders, status, isLocked, ...cleanData } = packageData;
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
    await requirePermission(userId!, 'SUBCONTRACTING', 'canDeleteDraft', simulatedRole);
    const { id } = req.params;
    const pkg = await prisma.subcontractPackage.findUnique({ where: { id }, select: { status: true, isLocked: true } });
    if (pkg && (pkg.status !== 'DRAFT' || pkg.isLocked)) return res.status(409).json({ success: false, error: 'Only an unlocked draft package can be deleted.' });
    await prisma.programOfWorks.deleteMany({ where: { packageId: id } });
    await prisma.subcontractPackage.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.put('/packages/:id/status', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    const { id } = req.params;
    const { status } = req.body;
    if (typeof status !== 'string' || !Object.hasOwn(PACKAGE_STATUS_ACTIONS, status)) return res.status(400).json({ success: false, error: 'status is not a valid package status.' });
    const action = PACKAGE_STATUS_ACTIONS[status as PackageStatus];
    await requirePermission(userId!, 'SUBCONTRACTING', action, simulatedRole);
    const isApproved = status === 'APPROVED';

    const pkg = await prisma.subcontractPackage.findUnique({ where: { id }, include: { project: true, subcontractor: true } });
    if (!pkg) throw new Error("Package not found");
    if (pkg.isLocked && action !== 'canApprove') return res.status(409).json({ success: false, error: PACKAGE_LOCKED_ERROR });

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
