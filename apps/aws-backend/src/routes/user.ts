import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

// Internal helper to avoid code duplication and internal HTTP calls
async function _internalCreateSystemRole(roleName: string) {
  const normalized = roleName.toUpperCase().replace(/\s+/g, '_').trim();
  const existing = await prisma.systemRole.findUnique({
    where: { name: normalized }
  });
  if (!existing) {
    await prisma.systemRole.create({
      data: { name: normalized }
    });
  }

  // Ensure RBAC Role also exists
  const existingRbac = await prisma.role.findFirst({
    where: {
      OR: [
        { roleName: normalized },
        { roleCode: normalized }
      ]
    }
  });
  if (!existingRbac) {
    await prisma.role.create({
      data: {
        roleName: normalized,
        roleCode: normalized,
        description: normalized
      }
    });
  }
  return { success: true, name: normalized };
}

router.post('/getSystemRoles', async (req, res) => {
  try {
    const roles = await prisma.systemRole.findMany({
      orderBy: { name: 'asc' }
    });

    // Auto-sync legacy system roles to the RBAC Role table
    for (const r of roles) {
      const normalized = r.name.toUpperCase().trim();
      const existingRbac = await prisma.role.findFirst({
        where: {
          OR: [
            { roleName: normalized },
            { roleCode: r.name }
          ]
        }
      });
      if (!existingRbac) {
        await prisma.role.create({
          data: {
            roleName: normalized,
            roleCode: r.name,
            description: normalized
          }
        });
      }
    }
    res.json({ success: true, data: roles.map(r => r.name) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to get system roles.' });
  }
});

router.post('/deleteSystemRole', async (req, res) => {
  try {
    const { roleName } = req.body;
    if (!roleName) {
      return res.status(400).json({ success: false, error: 'roleName is required.' });
    }

    await prisma.systemRole.delete({
      where: { name: roleName }
    });
    
    const rbac = await prisma.role.findFirst({
      where: {
        OR: [
          { roleName },
          { roleCode: roleName }
        ]
      }
    });
    if (rbac) {
      await prisma.role.delete({ where: { id: rbac.id } });
    }
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to delete role.' });
  }
});

router.post('/updateSystemRole', async (req, res) => {
  try {
    const { oldName, newName } = req.body;
    if (!oldName || !newName) {
      return res.status(400).json({ success: false, error: 'oldName and newName are required.' });
    }

    const normalizedNew = newName.toUpperCase().trim();
    
    if (!normalizedNew) return res.status(400).json({ success: false, error: "Role name cannot be empty" });

    const existing = await prisma.systemRole.findUnique({
      where: { name: normalizedNew }
    });
    
    if (existing) return res.status(409).json({ success: false, error: "A role with this name already exists" });

    await prisma.systemRole.update({
      where: { name: oldName },
      data: { name: normalizedNew }
    });
    
    const rbac = await prisma.role.findFirst({
      where: {
        OR: [
          { roleName: oldName },
          { roleCode: oldName }
        ]
      }
    });
    if (rbac) {
      await prisma.role.update({
        where: { id: rbac.id },
        data: { roleName: normalizedNew, roleCode: normalizedNew }
      });
    }
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'An error occurred while updating the role.' });
  }
});

router.post('/createSystemRole', async (req, res) => {
  try {
    const { roleName } = req.body;
    if (!roleName) {
      return res.status(400).json({ success: false, error: 'roleName is required.' });
    }

    const result = await _internalCreateSystemRole(roleName);
    res.json({ success: result.success, name: result.name });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to create role.' });
  }
});

router.post('/createUser', async (req, res) => {
  try {
    const data = req.body;
    if (!data.name || !data.email || !data.role) {
      return res.status(400).json({ success: false, error: 'All fields are required.' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existingUser) {
      return res.status(409).json({ success: false, error: 'A user with this email already exists.' });
    }

    const finalRole = await _internalCreateSystemRole(data.role); // Use internal helper
    if (!finalRole || !finalRole.success) {
      return res.status(500).json({ success: false, error: 'Failed to resolve system role.' });
    }

    await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: finalRole.name!,
        password: 'admin001',
      }
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'An unexpected database error occurred.' });
  }
});

router.post('/updateUser', async (req, res) => {
  try {
    const { id, data } = req.body;
    if (!id || !data || !data.name || !data.email || !data.role) {
      return res.status(400).json({ success: false, error: 'User ID, Name, Email, and Role are required.' });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existingUser && existingUser.id !== id) {
      return res.status(409).json({ success: false, error: 'A different user with this email already exists.' });
    }

    const finalRole = await _internalCreateSystemRole(data.role); // Use internal helper
    if (!finalRole || !finalRole.success) {
      return res.status(500).json({ success: false, error: 'Failed to resolve system role.' });
    }

    const updateData: any = {
      name: data.name,
      email: data.email,
      role: finalRole.name!,
    };

    if (data.password && data.password.trim() !== '') {
      updateData.password = data.password;
    }

    await prisma.user.update({
      where: { id },
      data: updateData
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'An unexpected database error occurred.' });
  }
});

router.post('/deleteUser', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ success: false, error: 'User ID is required' });
    
    await prisma.user.delete({
      where: { id }
    });
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'An unexpected database error occurred.' });
  }
});

export default router;
