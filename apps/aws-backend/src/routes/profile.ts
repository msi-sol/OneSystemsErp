import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

router.post('/updateProfile', async (req: Request, res: Response) => {
  try {
    const { userId, name, email, password, confirmPassword } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized. User ID is missing.' });
    }

    if (!name || !email) {
      return res.status(400).json({ success: false, error: 'Name and email are required.' });
    }

    if (password && password !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Passwords do not match.' });
    }

    const dataToUpdate: any = {
      name,
      email,
    };

    if (password) {
      // In a real application, ensure you hash the password before saving. 
      // Based on auth.ts, passwords here might be plain text for prototype, 
      // but update this as per project security standards.
      dataToUpdate.password = password; // Assuming plain text for now as per original comment
    }

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
