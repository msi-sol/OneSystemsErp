import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

/**
 * Cleans supplier input and refuses blank names and duplicates. A name of only spaces used to save as an empty
 * supplier, and the same supplier (same name ignoring case/spaces, or same TIN) could be added twice, which split
 * quotations and purchase orders across two records.
 */
const clean = (value: unknown) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');
const optional = (value: unknown) => clean(value) || null;
async function findDuplicateSupplier(name: string, tin: string | null, exceptId?: string) {
  const others = await prisma.supplier.findMany({ where: exceptId ? { id: { not: exceptId } } : {}, select: { id: true, name: true, tin: true } });
  const key = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
  const digits = (value: string | null) => (value || '').replace(/\D/g, '');
  return others.find((other) => key(other.name) === key(name)) ? 'name'
    : tin && digits(tin) && others.find((other) => digits(other.tin) === digits(tin)) ? 'TIN' : null;
}
function supplierData(body: any) {
  return {
    name: clean(body.name), tin: optional(body.tin), contactPerson: optional(body.contactPerson), contactNumber: optional(body.contactNumber),
    email: optional(body.email), address: optional(body.address), paymentTerms: optional(body.paymentTerms),
    isVatable: typeof body.isVatable === 'boolean' ? body.isVatable : false,
  };
}

router.post('/createSupplier', async (req, res) => {
  try {
    // Original authentication check using sessionId from cookies is removed here.
    // In an Express app, authentication typically happens via middleware
    // that verifies a token from headers (e.g., Authorization header)
    // before the request reaches the route handler.

    const data = supplierData(req.body);
    if (!data.name) return res.status(400).json({ success: false, error: 'Enter the supplier name.' });
    const duplicate = await findDuplicateSupplier(data.name, data.tin);
    if (duplicate) return res.status(409).json({ success: false, error: `A supplier with the same ${duplicate} already exists. Edit that supplier instead of adding it again.` });

    const newSupplier = await prisma.supplier.create({ data });

    return res.json({ success: true, supplier: newSupplier });
  } catch (error: any) {
    console.error('Error creating supplier:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create supplier' });
  }
});

router.post('/updateSupplier', async (req, res) => {
  try {
    // Original authentication check using sessionId from cookies is removed here.
    // In an Express app, authentication typically happens via middleware
    // that verifies a token from headers (e.g., Authorization header)
    // before the request reaches the route handler.

    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'Supplier ID is required' });
    const data = supplierData(req.body);
    if (!data.name) return res.status(400).json({ success: false, error: 'Enter the supplier name.' });
    const duplicate = await findDuplicateSupplier(data.name, data.tin, id);
    if (duplicate) return res.status(409).json({ success: false, error: `Another supplier already has the same ${duplicate}.` });

    const updatedSupplier = await prisma.supplier.update({ where: { id }, data });

    return res.json({ success: true, supplier: updatedSupplier });
  } catch (error: any) {
    console.error('Error updating supplier:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update supplier' });
  }
});

export default router;
