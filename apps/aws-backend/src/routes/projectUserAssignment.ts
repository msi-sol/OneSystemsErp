import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

router.post('/getUserProjectAssignments', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required.' });
    }
    const assignments = await prisma.projectUserAssignment.findMany({
      where: { userId },
      include: {
        project: { select: { name: true, status: true, id: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: assignments });
  } catch (error: any) {
    console.error('Error in getUserProjectAssignments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getProjectTeamMembers', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'Project ID is required.' });
    }
    const members = await prisma.projectUserAssignment.findMany({
      where: { projectId },
      include: {
        user: { select: { name: true, email: true, role: true, id: true, lastLoginAt: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: members });
  } catch (error: any) {
    console.error('Error in getProjectTeamMembers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/addProjectAssignment', async (req: Request, res: Response) => {
  try {
    const { data } = req.body;
    if (!data || !data.userId || !data.projectId || !data.projectRole || !data.accessLevel) {
      return res.status(400).json({ success: false, error: 'Missing required assignment data.' });
    }

    const existing = await prisma.projectUserAssignment.findUnique({
      where: {
        userId_projectId: {
          userId: data.userId,
          projectId: data.projectId
        }
      }
    });

    if (existing) {
      return res.json({ success: false, error: 'User is already assigned to this project.' });
    }

    await prisma.projectUserAssignment.create({
      data: {
        userId: data.userId,
        projectId: data.projectId,
        projectRole: data.projectRole,
        accessLevel: data.accessLevel,
        remarks: data.remarks || null,
        assignmentStatus: 'active'
      }
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in addProjectAssignment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/updateProjectAssignment', async (req: Request, res: Response) => {
  try {
    const { assignmentId, data } = req.body;
    if (!assignmentId || !data) {
      return res.status(400).json({ success: false, error: 'Assignment ID and update data are required.' });
    }

    await prisma.projectUserAssignment.update({
      where: { id: assignmentId },
      data
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in updateProjectAssignment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/deleteProjectAssignment', async (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.body;
    if (!assignmentId) {
      return res.status(400).json({ success: false, error: 'Assignment ID is required.' });
    }
    await prisma.projectUserAssignment.delete({
      where: { id: assignmentId }
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error in deleteProjectAssignment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
