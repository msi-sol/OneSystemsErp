import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
// @ts-nocheck
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

// Helper for consistent error handling
const handleError = (res: Response, error: any, message: string) => {
  console.error(message, error);
  // Database errors include the query and server paths; show a plain message instead (details stay in the log).
  const isDatabaseError = typeof error?.name === 'string' && error.name.startsWith('PrismaClient');
  const duplicate = error?.code === 'P2002';
  res.status(duplicate ? 409 : 500).json({ success: false, error: duplicate ? 'A record with the same details already exists.' : isDatabaseError ? 'The record could not be saved. Check the entries and try again.' : (error.message || 'An unexpected error occurred') });
};

// --- SUBCONTRACTOR READ --- 

router.post('/getSubcontractors', async (req: Request, res: Response) => {
  try {
    const subcontractors = await prisma.subcontractor.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: subcontractors });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in getSubcontractors:');
  }
});

router.post('/getSubcontractorById', async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'Subcontractor ID is required' });
    const subcontractor = await prisma.subcontractor.findUnique({
      where: { id },
      include: {
        packages: true,
        jobOrders: true,
        subcontractBillings: true,
        backCharges: true
      }
    });
    res.json({ success: true, data: subcontractor });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in getSubcontractorById:');
  }
});

router.post('/getSubcontractPackages', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;
    const pkgFilter: any = {};
    if (projectId) pkgFilter.projectId = projectId;
  
    const packages = await prisma.subcontractPackage.findMany({
      where: pkgFilter,
      include: {
        subcontractor: {
          include: { subcontractorBOQItems: true }
        },
        project: true,
        accomplishments: true,
        billings: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Preserve original serialization behavior for consistency
    res.json({ success: true, data: JSON.parse(JSON.stringify(packages)) });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in getSubcontractPackages:');
  }
});

router.post('/getAccomplishments', async (req: Request, res: Response) => {
  try {
    const { packageId } = req.body;
    const accomplishments = await prisma.subcontractAccomplishment.findMany({
      where: packageId ? { packageId } : undefined,
      include: {
        package: {
          include: { subcontractor: true, project: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: accomplishments });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in getAccomplishments:');
  }
});

router.post('/getBillings', async (req: Request, res: Response) => {
  try {
    const { packageId } = req.body;
    const billings = await prisma.subcontractBilling.findMany({
      where: packageId ? { packageId } : undefined,
      include: {
        subcontractor: true,
        package: true,
        jobOrder: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: billings });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in getBillings:');
  }
});

router.post('/getAwardedBoqItemsByProjectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ success: false, error: 'Project ID is required' });
    const items = await prisma.awardedBOQItem.findMany({
      where: { projectId },
      select: { id: true, itemCode: true, category: true, description: true, unit: true, quantity: true, totalCost: true, combinedUnitCost: true }
    });
    res.json({ success: true, items });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in getAwardedBoqItemsByProjectId:');
  }
});

router.post('/getSubcontractPackageById', async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'Subcontract Package ID is required' });
    const pkg = await prisma.subcontractPackage.findUnique({
      where: { id },
      include: {
        project: true,
        subcontractor: {
          include: { subcontractorBOQItems: { include: { awardedBoqItem: true } } }
        },
        programOfWorks: true,
        accomplishments: true,
        billings: true,
        jobOrders: true,
      }
    });
    res.json({ success: true, data: pkg });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in getSubcontractPackageById:');
  }
});

// --- MUTATIONS ---

/**
 * Maps the subcontractor form to the database columns. The form's "Trade category" is stored in `specialization`
 * (the tradeCategory column was removed) and a GCash number goes to the bank fields when no bank is given; the raw
 * form used to be passed straight to Prisma, so every registration failed with "Unknown argument tradeCategory".
 */
const SUBCONTRACTOR_TEXT_FIELDS = ['businessName', 'address', 'contactPerson', 'contactNumber', 'email', 'tin', 'birReg', 'dtiSecReg', 'mayorPermit', 'pcabLicense', 'bankName', 'bankAccountName', 'bankAccountNumber', 'remarks'] as const;
const BUSINESS_TYPES = ['CORPORATION', 'PARTNERSHIP', 'SOLE_PROPRIATOR', 'INDIVIDUAL_CONTRACTOR'];
function subcontractorData(input: any) {
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const data: Record<string, unknown> = {};
  if (input?.name !== undefined) data.name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  for (const field of SUBCONTRACTOR_TEXT_FIELDS) if (input?.[field] !== undefined) data[field] = text(input[field]);
  if (input?.businessType !== undefined) data.businessType = BUSINESS_TYPES.includes(input.businessType) ? input.businessType : 'CORPORATION';
  if (input?.tradeCategory !== undefined) data.specialization = text(input.tradeCategory) ? [text(input.tradeCategory)] : null;
  const gcash = text(input?.gcashNumber);
  if (gcash && !text(input?.bankAccountNumber)) { data.bankName = text(input?.bankName) ?? 'GCash'; data.bankAccountNumber = gcash; }
  return data;
}

router.post('/createSubcontractor', async (req: Request, res: Response) => {
  try {
    const data = subcontractorData(req.body.data);
    if (!data.name) return res.status(400).json({ success: false, error: 'Enter the subcontractor name.' });
    const sameName = (await prisma.subcontractor.findMany({ select: { name: true } })).some(other => other.name.trim().toLowerCase().replace(/\s+/g, ' ') === String(data.name).toLowerCase());
    if (sameName) return res.status(409).json({ success: false, error: 'A subcontractor with the same name already exists.' });
    const result = await prisma.subcontractor.create({ data: data as any });
    res.json({ success: true, data: result });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in createSubcontractor:');
  }
});

router.post('/updateSubcontractor', async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'Subcontractor ID is required' });
    const data = subcontractorData(req.body.data);
    if (data.name !== undefined && !data.name) return res.status(400).json({ success: false, error: 'Enter the subcontractor name.' });
    const result = await prisma.subcontractor.update({ where: { id }, data: data as any });
    res.json({ success: true, data: result });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in updateSubcontractor:');
  }
});

router.post('/deleteSubcontractor', async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'Subcontractor ID is required' });
    await prisma.subcontractor.delete({ where: { id } });
    res.json({ success: true, message: 'Subcontractor deleted successfully' });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in deleteSubcontractor:');
  }
});

router.post('/createSubcontractPackage', async (req: Request, res: Response) => {
  try {
    const { data } = req.body;
    const result = await prisma.subcontractPackage.create({ data });
    res.json({ success: true, data: result });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in createSubcontractPackage:');
  }
});

router.post('/updateSubcontractPackage', async (req: Request, res: Response) => {
  try {
    const { id, data } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'Subcontract Package ID is required' });
    const result = await prisma.subcontractPackage.update({ where: { id }, data });
    res.json({ success: true, data: result });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in updateSubcontractPackage:');
  }
});

router.post('/createAccomplishment', async (req: Request, res: Response) => {
  try {
    const { data } = req.body;
    const result = await prisma.subcontractAccomplishment.create({ data });
    res.json({ success: true, data: result });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in createAccomplishment:');
  }
});

router.post('/createBilling', async (req: Request, res: Response) => {
  try {
    const { data } = req.body;
    const result = await prisma.subcontractBilling.create({ data });
    res.json({ success: true, data: result });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in createBilling:');
  }
});

router.post('/createFullSubcontractPackage', async (req: Request, res: Response) => {
  try {
    const { packageData, boqItems, powData } = req.body;
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
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in createFullSubcontractPackage:');
  }
});

router.post('/deleteSubcontractPackage', async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'Subcontract Package ID is required' });
    await prisma.subcontractPackage.delete({ where: { id } });
    res.json({ success: true, message: 'Subcontract package deleted successfully' });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in deleteSubcontractPackage:');
  }
});

router.post('/updateFullSubcontractPackage', async (req: Request, res: Response) => {
  try {
    const { id, packageData, boqItems, powData } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'Subcontract Package ID is required' });
    const result = await prisma.$transaction(async (tx) => {
      if (packageData.startDate) packageData.startDate = new Date(packageData.startDate);
      if (packageData.targetCompletion) packageData.targetCompletion = new Date(packageData.targetCompletion);

      const updatedPackage = await tx.subcontractPackage.update({ where: { id }, data: packageData });

      if (boqItems && boqItems.length > 0) {
        // Find existing BOQ items for this subcontractor and delete those that are replaced
        const boqData = boqItems.map((item: any) => ({
          subcontractorId: updatedPackage.subcontractorId,
          awardedBoqItemId: item.id,
          quantity: parseFloat(item.subcontractorQuantity) || 0,
          unitCost: parseFloat(item.subcontractorUnitCost) || 0,
          totalCost: (parseFloat(item.subcontractorQuantity) || 0) * (parseFloat(item.subcontractorUnitCost) || 0),
        }));
        // Basic sync approach: clear existing mapping for this package's subcontractor and reinsert
        await tx.subcontractorBOQItem.deleteMany({ 
          where: { 
            subcontractorId: updatedPackage.subcontractorId,
            awardedBoqItemId: { in: boqItems.map((i: any) => i.id) }
          }
        });
        await tx.subcontractorBOQItem.createMany({ data: boqData });
      }

      if (powData) {
        if (powData.startDate) powData.startDate = new Date(powData.startDate);
        if (powData.endDate) powData.endDate = new Date(powData.endDate);
        
        const existingPow = await tx.programOfWorks.findFirst({ where: { packageId: id } });
        if (existingPow) {
          await tx.programOfWorks.update({ 
            where: { id: existingPow.id }, 
            data: powData 
          });
        } else {
          await tx.programOfWorks.create({ 
            data: { ...powData, packageId: id } 
          });
        }
      }

      return updatedPackage;
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in updateFullSubcontractPackage:');
  }
});

router.post('/updateSubcontractPackageStatus', async (req: Request, res: Response) => {
  try {
    const { id, status } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'Subcontract Package ID is required' });
    if (!status) return res.status(400).json({ success: false, error: 'Status is required' });
    // The approval chain is Draft -> Checking (PM) -> Endorsement (PD) -> Approved. Any status used to be accepted
    // from anyone, so a package could be approved in one step by any user.
    const TRANSITIONS: Record<string, { from: string[]; permission: string }> = {
      FOR_REVIEW: { from: ['DRAFT', 'RETURNED'], permission: 'canSubmit' },
      FOR_FINAL_APPROVAL: { from: ['FOR_REVIEW'], permission: 'canApprove' },
      APPROVED: { from: ['FOR_FINAL_APPROVAL'], permission: 'canApprove' },
    };
    const FAST_APPROVERS = ['SUPER_ADMIN', 'ADMIN', 'PROJECT_DIRECTOR'];
    const transition = TRANSITIONS[status];
    if (!transition) return res.status(400).json({ success: false, error: 'This status change is not supported here.' });
    const userId = req.body.sessionId as string;
    const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { role: true } }) : null;
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const role = req.body.simulatedRole || user.role;
    const current = await prisma.subcontractPackage.findUnique({ where: { id }, select: { status: true } });
    if (!current) return res.status(404).json({ success: false, error: 'Subcontract package not found.' });
    // Directors/admins may approve directly from any pre-approval stage (the "Fast Approve" shortcut).
    const fastApproval = status === 'APPROVED' && FAST_APPROVERS.includes(role) && ['DRAFT', 'RETURNED', 'FOR_REVIEW', 'FOR_FINAL_APPROVAL'].includes(current.status);
    if (!fastApproval && !transition.from.includes(current.status)) {
      return res.status(409).json({ success: false, error: `This package is ${current.status.replace(/_/g, ' ').toLowerCase()}; it cannot move to ${status.replace(/_/g, ' ').toLowerCase()} from there.` });
    }
    await requirePermission(userId, 'SUBCONTRACTING', transition.permission, req.body.simulatedRole);
    const moved = await prisma.subcontractPackage.updateMany({
      where: { id, status: current.status },
      data: { status, ...(status === 'APPROVED' ? { isLocked: true } : {}) },
    });
    if (moved.count !== 1) return res.status(409).json({ success: false, error: 'The package changed meanwhile. Refresh and try again.' });
    const result = await prisma.subcontractPackage.findUnique({ where: { id } });
    res.json({ success: true, data: result });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in updateSubcontractPackageStatus:');
  }
});

router.post('/unlockSubcontractPackage', async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'Subcontract Package ID is required' });
    const result = await prisma.subcontractPackage.update({ where: { id }, data: { isLocked: false } }); // Assuming 'isLocked' field exists
    res.json({ success: true, data: result });
  } catch (error: any) {
    handleError(res, error, 'Prisma Error in unlockSubcontractPackage:');
  }
});

export default router;
