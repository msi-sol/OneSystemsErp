import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

router.post('/updateProfile', async (req: Request, res: Response) => {
  try {
    const { userId, name, email, password } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized. User ID is missing.' });
    }

    if (!name || !email) {
      return res.status(400).json({ success: false, error: 'Name and email are required.' });
    }

    if (password) {
      return res.status(400).json({ success: false, error: 'Change your password from the Change Password page.' });
    }

    const dataToUpdate: any = {
      name,
      email,
    };

    await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
    });

    res.json({ success: true, message: 'Profile updated successfully!' });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Email is already in use by another account.' }); // 409 Conflict
    }
    console.error('Error updating profile:', error);
    res.status(500).json({ success: false, error: 'An error occurred while updating the profile.' });
  }
});

export default router;
