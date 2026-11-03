import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

router.post('/getUsersWithRoles', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        userRoles: {
          include: { role: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    const roles = await prisma.role.findMany({ orderBy: { roleName: 'asc' } });
    
    res.json({ success: true, users, roles });
  } catch (e: any) {
    console.error('Error fetching users with roles:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/assignRoleToUser', async (req, res) => {
  try {
    const { userId, roleId } = req.body;
    if (!userId || !roleId) {
      return res.status(400).json({ success: false, error: 'userId and roleId are required.' });
    }

    const existing = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } }
    });

    if (!existing) {
      await prisma.userRole.create({
        data: { userId, roleId }
      });
    }
    
    res.json({ success: true });
  } catch (e: any) {
    console.error('Error assigning role to user:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/removeRoleFromUser', async (req, res) => {
  try {
    const { userId, roleId } = req.body;
    if (!userId || !roleId) {
      return res.status(400).json({ success: false, error: 'userId and roleId are required.' });
    }

    await prisma.userRole.delete({
      where: { userId_roleId: { userId, roleId } }
    });
    
    res.json({ success: true });
  } catch (e: any) {
    console.error('Error removing role from user:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/updateUserStatus', async (req, res) => {
  try {
    const { userId, status } = req.body;
    if (!userId || !status) {
      return res.status(400).json({ success: false, error: 'userId and status are required.' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { status }
    });
    
    res.json({ success: true });
  } catch (e: any) {
    console.error('Error updating user status:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
