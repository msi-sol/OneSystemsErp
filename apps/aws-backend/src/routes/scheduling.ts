import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requirePermission } from '../lib/permissions';

const router = Router();
function getPbacContext(req: any) {
  return {
    userId: req.headers['x-user-session'] as string | undefined,
    activeProjectId: req.headers['x-active-project-id'] as string | undefined,
    simulatedRole: req.headers['x-simulated-role'] as string | undefined,
  };
}

router.delete('/:projectId', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SCHEDULING', 'canDelete', simulatedRole);
    
    const { projectId } = req.params;

    const schedules = await prisma.projectSchedule.findMany({
      where: { projectId },
      take: 2,
    });
    if (schedules.length > 1) return res.status(409).json({ success: false, error: 'CHOOSE_SCHEDULE: This project has multiple schedule revisions. Delete a specific schedule through the scheduling workflow.' });
    const schedule = schedules[0];

    if (!schedule) {
      throw new Error('Schedule not found for this project');
    }

    await prisma.projectSchedule.delete({
      where: { id: schedule.id }
    });

    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

export default router;
