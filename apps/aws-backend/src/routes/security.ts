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

router.get('/events', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    // Security check logic
    const events = await prisma.securityEvent.findMany({
      take: parseInt(req.query.limit as string) || 100,
      orderBy: { timestamp: 'desc' },
    });
    res.json(events);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.get('/stats', async (req, res) => {
  try {
    const [totalBlocked, criticalThreats, aiInjections] = await Promise.all([
      prisma.securityEvent.count({ where: { status: 'BLOCKED' } }),
      prisma.securityEvent.count({ where: { severity: 'CRITICAL' } }),
      prisma.securityEvent.count({ where: { threatType: 'PROMPT_INJECTION_ATTEMPT' } }),
    ]);
    res.json({ totalBlocked, criticalThreats, aiInjections });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

export default router;
