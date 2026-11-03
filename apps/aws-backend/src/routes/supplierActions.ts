import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

router.post('/createSupplier', async (req, res) => {
  try {
    // Original authentication check using sessionId from cookies is removed here.
    // In an Express app, authentication typically happens via middleware
    // that verifies a token from headers (e.g., Authorization header)
    // before the request reaches the route handler.

    const { name, tin, contactPerson, contactNumber, email, address, paymentTerms, isVatable } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const newSupplier = await prisma.supplier.create({
      data: {
        name,
        tin,
        contactPerson,
        contactNumber,
        email,
        address,
        paymentTerms,
        isVatable: typeof isVatable === 'boolean' ? isVatable : false // Ensure boolean type
      }
    });

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

    const { id, name, tin, contactPerson, contactNumber, email, address, paymentTerms, isVatable } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, error: 'Supplier ID is required' });
    }
    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const updatedSupplier = await prisma.supplier.update({
      where: { id },
      data: {
        name,
        tin,
        contactPerson,
        contactNumber,
        email,
        address,
        paymentTerms,
        isVatable: typeof isVatable === 'boolean' ? isVatable : false // Ensure boolean type
      }
    });

    return res.json({ success: true, supplier: updatedSupplier });
  } catch (error: any) {
    console.error('Error updating supplier:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update supplier' });
  }
});

export default router;
