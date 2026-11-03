import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

async function verifyAdminAccess() {
  const currentUser = await prisma.user.findFirst(); // Mocking as requested previously
  if (!currentUser) throw new Error('Unauthorized');
  
  // For demo, assume SUPER_ADMIN role
  const role = 'SUPER_ADMIN';

  const allowedRoles = ['SUPER_ADMIN', 'SECURITY_OFFICER', 'SOC_MANAGER'];
  if (process.env.NODE_ENV !== 'production') {
    allowedRoles.push('DEVELOPER_ADMIN');
  }

  if (!allowedRoles.includes(role)) {
    throw new Error('Forbidden: You do not have permission to clear simulation data.');
  }

  return currentUser;
}

router.post('/clearCurrentSimulationRun', async (req, res) => {
  try {
    const { runId, archiveBeforeClear } = req.body;

    if (typeof runId !== 'string' || typeof archiveBeforeClear !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Invalid arguments provided.' });
    }

    const user = await verifyAdminAccess();

    const run = await prisma.securitySimulationRun.findUnique({
      where: { id: runId },
      include: { scenario: true }
    });

    if (!run) {
      throw new Error('Simulation run not found');
    }

    // Count records
    const eventsCount = await prisma.securityEvent.count({ where: { simulationRunId: runId, simulated: true } });
    const incidentsCount = await prisma.securityIncident.count({ where: { linkedSimulationRunId: runId } });
    
    const eventIds = await prisma.securityEvent.findMany({
      where: { simulationRunId: runId, simulated: true },
      select: { id: true }
    });
    const eIds = eventIds.map(e => e.id);
    const countermeasuresCount = await prisma.countermeasureLog.count({
      where: { securityEventId: { in: eIds } }
    });

    if (archiveBeforeClear) {
      // Generate archive
      const events = await prisma.securityEvent.findMany({ where: { simulationRunId: runId, simulated: true } });
      const incidents = await prisma.securityIncident.findMany({ where: { linkedSimulationRunId: runId } });
      const countermeasures = await prisma.countermeasureLog.findMany({ where: { securityEventId: { in: eIds } } });

      await prisma.securitySimulationArchive.create({
        data: {
          archiveNumber: `ARC-${Date.now()}`,
          simulationRunId: run.id,
          scenarioName: run.scenario?.name || 'Unknown',
          runMode: run.runMode,
          environment: run.environment,
          initiatedBy: run.initiatedBy,
          clearedBy: user.id,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          totalEventsArchived: events.length,
          totalIncidentsArchived: incidents.length,
          totalCountermeasuresArchived: countermeasures.length,
          detectionScore: run.detectionScore,
          responseScore: run.responseScore,
          evidenceScore: run.evidenceScore,
          finalScore: run.finalScore,
          overallResult: run.overallResult,
          archiveJson: JSON.stringify({ events, incidents, countermeasures, run }),
        }
      });
    }

    // Delete countermeasures linked to simulated events of this run
    await prisma.countermeasureLog.deleteMany({
      where: { securityEventId: { in: eIds } }
    });

    // Delete Incidents
    await prisma.securityIncident.deleteMany({
      where: { linkedSimulationRunId: runId }
    });

    // Delete Events
    await prisma.securityEvent.deleteMany({
      where: { simulationRunId: runId, simulated: true }
    });

    // Delete Run
    await prisma.securitySimulationRun.delete({
      where: { id: runId }
    });

    console.log(`AUDIT LOG: User ${user.id} cleared simulation run ${runId}. Events: ${eventsCount}, Incidents: ${incidentsCount}, Countermeasures: ${countermeasuresCount}. Archive: ${archiveBeforeClear}`);

    return res.json({ success: true, message: 'Simulation run cleared successfully.' });
  } catch (error: any) {
    console.error('Error clearing current simulation run:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/clearAllSimulationData', async (req, res) => {
  try {
    const { archiveBeforeClear } = req.body;
    
    if (typeof archiveBeforeClear !== 'boolean') {
      return res.status(400).json({ success: false, error: 'Invalid arguments provided.' });
    }

    const user = await verifyAdminAccess();

    // Count records safely (ONLY WHERE simulated = true)
    const eventsCount = await prisma.securityEvent.count({ where: { simulated: true } });
    const incidentsCount = await prisma.securityIncident.count({ where: { linkedSimulationRunId: { not: null } } });
    
    const eventIds = await prisma.securityEvent.findMany({
      where: { simulated: true },
      select: { id: true }
    });
    const eIds = eventIds.map(e => e.id);
    const countermeasuresCount = await prisma.countermeasureLog.count({
      where: { securityEventId: { in: eIds } }
    });

    if (archiveBeforeClear) {
      const events = await prisma.securityEvent.findMany({ where: { simulated: true } });
      const incidents = await prisma.securityIncident.findMany({ where: { linkedSimulationRunId: { not: null } } });
      const countermeasures = await prisma.countermeasureLog.findMany({ where: { securityEventId: { in: eIds } } });

      await prisma.securitySimulationArchive.create({
        data: {
          archiveNumber: `ARC-ALL-${Date.now()}`,
          scenarioName: 'ALL_SIMULATIONS',
          clearedBy: user.id,
          totalEventsArchived: events.length,
          totalIncidentsArchived: incidents.length,
          totalCountermeasuresArchived: countermeasures.length,
          archiveJson: JSON.stringify({ events, incidents, countermeasures }),
        }
      });
    }

    // Safety first! Delete only strictly simulated data
    await prisma.countermeasureLog.deleteMany({
      where: { securityEventId: { in: eIds } }
    });

    await prisma.securityIncident.deleteMany({
      where: { linkedSimulationRunId: { not: null } }
    });

    await prisma.securityEvent.deleteMany({
      where: { simulated: true }
    });

    await prisma.securitySimulationRun.deleteMany(); // Since these are inherently simulated configurations

    console.log(`AUDIT LOG: User ${user.id} cleared ALL simulation data. Events: ${eventsCount}, Incidents: ${incidentsCount}, Countermeasures: ${countermeasuresCount}. Archive: ${archiveBeforeClear}`);

    return res.json({ success: true, message: 'All simulation data cleared successfully.' });
  } catch (error: any) {
    console.error('Error clearing all simulation data:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
