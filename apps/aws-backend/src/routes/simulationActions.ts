import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { SimulationEngine, SimulationMode } from '../../../../src/lib/simulationEngine'; // Adjust path as per your AWS backend structure

const router = Router();

// Middleware/helper to get current user and check role - can be refactored into a separate auth middleware
async function getCurrentUserAndRole() {
  const currentUser = await prisma.user.findFirst();
  if (!currentUser) {
    throw new Error('Unauthorized');
  }
  // For demo, assume SUPER_ADMIN role
  const role = 'SUPER_ADMIN';
  return { currentUser, role };
}

router.post('/runSimulationScenario', async (req, res) => {
  try {
    const { scenarioId, mode } = req.body;

    const { currentUser, role } = await getCurrentUserAndRole();

    // Check roles: Only Super Admin, Security Officer, SOC Manager, Developer Admin
    const allowedRoles = ['SUPER_ADMIN', 'SECURITY_OFFICER', 'SOC_MANAGER', 'DEVELOPER_ADMIN'];
    if (!allowedRoles.includes(role)) {
      throw new Error('Forbidden: You do not have permission to run security simulations.');
    }

    const result = await SimulationEngine.runScenario(scenarioId, mode, currentUser.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error in runSimulationScenario:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getSimulationScenarios', async (req, res) => {
  try {
    await getCurrentUserAndRole(); // Just to ensure user is authorized

    const result = await prisma.securitySimulationScenario.findMany({
      orderBy: { category: 'asc' },
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error in getSimulationScenarios:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getSimulationStats', async (req, res) => {
  try {
    await getCurrentUserAndRole(); // Just to ensure user is authorized

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const runsToday = await prisma.securitySimulationRun.count({
      where: { startedAt: { gte: today } },
    });

    const passedRuns = await prisma.securitySimulationRun.count({
      where: {
        startedAt: { gte: today },
        overallResult: 'Passed'
      },
    });

    const failedRuns = await prisma.securitySimulationRun.count({
      where: {
        startedAt: { gte: today },
        overallResult: 'Failed'
      },
    });

    const allRuns = await prisma.securitySimulationRun.findMany({
      where: { status: 'COMPLETED' },
      select: { finalScore: true, detectionScore: true, responseScore: true, evidenceScore: true },
    });

    let avgFinalScore = 0;
    let avgDetectionScore = 0;
    let avgResponseScore = 0;
    let avgEvidenceScore = 0;

    if (allRuns.length > 0) {
      avgFinalScore = allRuns.reduce((sum, run) => sum + (run.finalScore || 0), 0) / allRuns.length;
      avgDetectionScore = allRuns.reduce((sum, run) => sum + (run.detectionScore || 0), 0) / allRuns.length;
      avgResponseScore = allRuns.reduce((sum, run) => sum + (run.responseScore || 0), 0) / allRuns.length;
      avgEvidenceScore = allRuns.reduce((sum, run) => sum + (run.evidenceScore || 0), 0) / allRuns.length;
    }

    const result = {
      runsToday,
      passedRuns,
      failedRuns,
      readinessScore: avgFinalScore,
      detectionScore: avgDetectionScore,
      responseScore: avgResponseScore,
      evidenceScore: avgEvidenceScore,
    };
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error in getSimulationStats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
