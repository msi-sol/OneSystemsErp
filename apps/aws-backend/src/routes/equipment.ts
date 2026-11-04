import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requirePermission } from '../lib/permissions';

const router = Router();

// The status moves these routes make and the right each needs. Moving only from
// the step before stops a holder of a later right from skipping the approval.
type StatusMoves = Record<string, { from: string; action: string }>;
const DEPLOYMENT_MOVES: StatusMoves = {
  APPROVED: { from: 'REQUESTED', action: 'canApprove' },
  DISPATCHED: { from: 'APPROVED', action: 'canEditDraft' },
  RETURNED: { from: 'DISPATCHED', action: 'canEditDraft' },
};
const MAINTENANCE_MOVES: StatusMoves = {
  IN_PROGRESS: { from: 'SCHEDULED', action: 'canEditDraft' },
  COMPLETED: { from: 'IN_PROGRESS', action: 'canEditDraft' },
};

function getPbacContext(req: any) {
  return {
    userId: req.headers['x-user-session'] as string | undefined,
    activeProjectId: req.headers['x-active-project-id'] as string | undefined,
    simulatedRole: req.headers['x-simulated-role'] as string | undefined,
  };
}

// ------------------------------------------------------------------
// EQUIPMENT REGISTRY ACTIONS
// ------------------------------------------------------------------

router.get('/list', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canView', simulatedRole);
    
    const data = await prisma.equipment.findMany({
      orderBy: { name: 'asc' },
      include: {
        deployments: {
          where: { status: 'ACTIVE' },
          include: { project: { select: { id: true, name: true } } }
        }
      }
    });
    res.json(data);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post('/create', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canCreate', simulatedRole);
    const data = await prisma.equipment.create({ data: req.body });
    res.json(data);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ------------------------------------------------------------------
// TELEMETRY & FMS ACTIONS
// ------------------------------------------------------------------

router.get('/telemetry/active', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canView', simulatedRole);
    
    const fleet = await prisma.equipment.findMany({
      where: { fmsDeviceId: { not: null } },
      include: {
        telemetry: { orderBy: { timestamp: 'desc' }, take: 1 },
        deployments: {
          where: { status: 'ACTIVE' },
          include: { project: { select: { name: true } } }
        }
      }
    });
    res.json(fleet);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.get('/telemetry/stats', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canView', simulatedRole);

    const totalVehicles = await prisma.equipment.count({ where: { fmsDeviceId: { not: null } } });
    const activeNow = await prisma.equipmentTelemetry.count({
      where: { engineState: 'MOVING', timestamp: { gte: new Date(Date.now() - 3600000) } }
    });
    const fleet = await prisma.equipment.findMany({
      where: { fmsDeviceId: { not: null } },
      select: { lastEngineHours: true }
    });
    const totalEngineHours = fleet.reduce((sum, eq) => sum + (eq.lastEngineHours || 0), 0);
    const faultEvents = await prisma.equipmentTelemetry.count({
      where: { faultCodes: { not: null }, timestamp: { gte: new Date(Date.now() - 86400000) } }
    });

    res.json({ totalVehicles, activeNow, totalEngineHours, faultEvents });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ------------------------------------------------------------------
// DEPLOYMENT WORKFLOW ACTIONS
// ------------------------------------------------------------------

router.get('/deployment/options', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canView', simulatedRole);
    
    const [equipment, projects, workers] = await Promise.all([
      prisma.equipment.findMany({ select: { id: true, code: true, name: true, category: true, status: true } }),
      prisma.project.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } }),
      prisma.worker.findMany({ where: { employmentStatus: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true, designation: true } })
    ]);
    res.json({ equipment, projects, workers });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.get('/deployment/list', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canView', simulatedRole);
    
    const deployments = await prisma.equipmentDeployment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        equipment: { select: { code: true, name: true } },
        project: { select: { name: true } },
        driver: { select: { firstName: true, lastName: true } },
        requestedBy: { select: { name: true } },
        approvedBy: { select: { name: true } }
      }
    });
    res.json(deployments);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post('/deployment/request', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canCreate', simulatedRole);
    
    const { equipmentId, targetDate, expectedReturnDate, purpose, destinationAddress, destinationLat, destinationLng, projectId, driverId } = req.body;

    const start = new Date(targetDate);
    const end = expectedReturnDate ? new Date(expectedReturnDate) : null;
    
    const overlaps = await prisma.equipmentDeployment.findMany({
      where: {
        equipmentId,
        status: { in: ['APPROVED', 'DISPATCHED'] },
        OR: [
          { targetDate: { lte: end || start }, expectedReturnDate: { gte: start } }
        ]
      }
    });

    if (overlaps.length > 0) throw new Error('Equipment is already deployed or approved for deployment during these dates.');

    const result = await prisma.equipmentDeployment.create({
      data: {
        equipmentId, projectId, driverId: driverId || null, targetDate: start, expectedReturnDate: end,
        purpose, destinationAddress, destinationLat, destinationLng,
        status: 'REQUESTED', requestedById: userId!,
      }
    });
    res.json(result);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.put('/deployment/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus } = req.body;
    const { userId, simulatedRole } = getPbacContext(req);
    if (!Object.hasOwn(DEPLOYMENT_MOVES, newStatus)) return res.status(400).json({ error: 'newStatus is not a valid deployment status.' });
    const move = DEPLOYMENT_MOVES[newStatus];
    await requirePermission(userId!, 'EQUIPMENT', move.action, simulatedRole);

    const deployment = await prisma.equipmentDeployment.findUnique({ where: { id }, select: { status: true } });
    if (!deployment) throw new Error('Deployment not found');
    if (deployment.status !== move.from) return res.status(409).json({ error: `Only a ${move.from} deployment can move to ${newStatus}.` });

    const updateData: any = { status: newStatus };
    if (newStatus === 'APPROVED') updateData.approvedById = userId;
    else if (newStatus === 'DISPATCHED') {
      updateData.dateDeployed = new Date();
      const dep = await prisma.equipmentDeployment.findUnique({ where: { id } });
      if (dep) await prisma.equipment.update({ where: { id: dep.equipmentId }, data: { status: 'DEPLOYED' } });
    } else if (newStatus === 'RETURNED') {
      updateData.dateReturned = new Date();
      const dep = await prisma.equipmentDeployment.findUnique({ where: { id } });
      if (dep) await prisma.equipment.update({ where: { id: dep.equipmentId }, data: { status: 'ACTIVE' } });
    }

    const result = await prisma.equipmentDeployment.update({
      where: { id },
      data: updateData,
      include: {
        equipment: { select: { code: true, name: true } },
        project: { select: { name: true } },
        driver: { select: { firstName: true, lastName: true } }
      }
    });
    res.json(result);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ------------------------------------------------------------------
// UTILIZATION LOG ACTIONS
// ------------------------------------------------------------------

router.post('/utilization/list', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canView', simulatedRole);

    const { equipmentId, projectId, source, dateFrom, dateTo } = req.body;
    const where: any = {};
    if (equipmentId) where.equipmentId = equipmentId;
    if (projectId) where.projectId = projectId;
    if (source) where.source = source;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const logs = await prisma.equipmentUtilization.findMany({
      where, orderBy: { date: 'desc' },
      include: {
        equipment: { select: { id: true, code: true, name: true, category: true, lastEngineHours: true, hourlyRate: true } },
        project: { select: { id: true, name: true } }
      }
    });
    res.json(logs);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.get('/utilization/options', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canView', simulatedRole);

    const [equipment, projects] = await Promise.all([
      prisma.equipment.findMany({
        select: {
          id: true, code: true, name: true, category: true, status: true, lastEngineHours: true, fmsDeviceId: true, fmsProvider: true,
          deployments: {
            where: { status: { in: ['DISPATCHED', 'APPROVED'] } },
            include: { project: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' }, take: 1
          }
        }, orderBy: { code: 'asc' }
      }),
      prisma.project.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } })
    ]);
    res.json({ equipment, projects });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post('/utilization/create', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canCreate', simulatedRole);

    const { equipmentId, projectId, date, hoursUsed, fuelConsumed, taskDescription } = req.body;

    const log = await prisma.equipmentUtilization.create({
      data: {
        equipmentId, projectId, date: new Date(date), hoursUsed, fuelConsumed, taskDescription: taskDescription || null,
        loggedBy: userId!, source: 'MANUAL'
      },
      include: {
        equipment: { select: { code: true, name: true } },
        project: { select: { name: true } }
      }
    });

    const equipment = await prisma.equipment.findUnique({ where: { id: equipmentId } });
    if (equipment) {
      const newTotalHours = (equipment.lastEngineHours || 0) + hoursUsed;
      await prisma.equipment.update({ where: { id: equipmentId }, data: { lastEngineHours: newTotalHours } });
    }
    res.json(log);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post('/utilization/sync', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canCreate', simulatedRole);
    const { equipmentId } = req.body;

    const equipment = await prisma.equipment.findUnique({
      where: { id: equipmentId },
      include: {
        telemetry: { orderBy: { timestamp: 'desc' }, take: 1 },
        deployments: {
          where: { status: { in: ['DISPATCHED', 'APPROVED'] } },
          orderBy: { createdAt: 'desc' }, take: 1,
          include: { project: { select: { id: true, name: true } } }
        }
      }
    });

    if (!equipment) throw new Error('Equipment not found');
    if (!equipment.fmsDeviceId) throw new Error('Equipment is not connected to an FMS device');
    if (!equipment.telemetry || equipment.telemetry.length === 0) throw new Error('No telemetry data available for this equipment');

    const latestTelemetry = equipment.telemetry[0];
    const activeDeployment = equipment.deployments[0];
    if (!activeDeployment) throw new Error('Equipment has no active deployment. Assign it to a project first.');

    const telemetryHours = latestTelemetry.engineHours || 0;
    const previousHours = equipment.lastEngineHours || 0;
    const deltaHours = Math.max(0, telemetryHours - previousHours);

    const log = await prisma.equipmentUtilization.create({
      data: {
        equipmentId, projectId: activeDeployment.projectId, date: latestTelemetry.timestamp, hoursUsed: deltaHours,
        fuelConsumed: latestTelemetry.fuelLevel || 0,
        taskDescription: `Auto-synced from FMS (${equipment.fmsProvider || 'Unknown'}) — Engine: ${latestTelemetry.engineState || 'N/A'}, Speed: ${latestTelemetry.speed?.toFixed(1) || '0'} km/h`,
        loggedBy: userId!, source: 'FMS_AUTO'
      },
      include: {
        equipment: { select: { code: true, name: true } },
        project: { select: { name: true } }
      }
    });

    if (telemetryHours > previousHours) {
      await prisma.equipment.update({ where: { id: equipmentId }, data: { lastEngineHours: telemetryHours } });
    }
    res.json(log);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.delete('/utilization/:id', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canDeleteDraft', simulatedRole);
    const { id } = req.params;

    const log = await prisma.equipmentUtilization.findUnique({ where: { id } });
    if (!log) throw new Error('Utilization log not found');

    const equipment = await prisma.equipment.findUnique({ where: { id: log.equipmentId } });
    if (equipment) {
      const correctedHours = Math.max(0, (equipment.lastEngineHours || 0) - log.hoursUsed);
      await prisma.equipment.update({ where: { id: log.equipmentId }, data: { lastEngineHours: correctedHours } });
    }

    const result = await prisma.equipmentUtilization.delete({ where: { id } });
    res.json(result);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.get('/utilization/summary', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canView', simulatedRole);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const allLogs = await prisma.equipmentUtilization.findMany({
      where: { date: { gte: startOfMonth, lte: endOfMonth } },
      include: { equipment: { select: { code: true, name: true, hourlyRate: true } } }
    });

    const totalHours = allLogs.reduce((sum, l) => sum + l.hoursUsed, 0);
    const totalFuel = allLogs.reduce((sum, l) => sum + l.fuelConsumed, 0);
    const totalCost = allLogs.reduce((sum, l) => sum + (l.hoursUsed * (l.equipment.hourlyRate || 0)), 0);
    const manualCount = allLogs.filter(l => l.source === 'MANUAL').length;
    const fmsCount = allLogs.filter(l => l.source === 'FMS_AUTO').length;

    const byEquipment: Record<string, { code: string; name: string; hours: number }> = {};
    for (const log of allLogs) {
      const key = log.equipmentId;
      if (!byEquipment[key]) byEquipment[key] = { code: log.equipment.code, name: log.equipment.name, hours: 0 };
      byEquipment[key].hours += log.hoursUsed;
    }
    const topEquipment = Object.values(byEquipment).sort((a, b) => b.hours - a.hours).slice(0, 5);

    res.json({ totalLogs: allLogs.length, totalHours, totalFuel, totalCost, manualCount, fmsCount, topEquipment });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ------------------------------------------------------------------
// MAINTENANCE & REPAIR ACTIONS
// ------------------------------------------------------------------

router.post('/maintenance/list', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canView', simulatedRole);

    const { equipmentId, type, status, dateFrom, dateTo } = req.body;
    const where: any = {};
    if (equipmentId) where.equipmentId = equipmentId;
    if (type) where.type = type;
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.scheduledDate = {};
      if (dateFrom) where.scheduledDate.gte = new Date(dateFrom);
      if (dateTo) where.scheduledDate.lte = new Date(dateTo);
    }

    const data = await prisma.equipmentMaintenance.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: { equipment: { select: { id: true, code: true, name: true, category: true, status: true, lastEngineHours: true } } }
    });
    res.json(data);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.get('/maintenance/options', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canView', simulatedRole);

    const equipment = await prisma.equipment.findMany({
      select: {
        id: true, code: true, name: true, category: true, status: true, lastEngineHours: true, fmsDeviceId: true,
        telemetry: { orderBy: { timestamp: 'desc' }, take: 1, select: { faultCodes: true, engineHours: true, timestamp: true } }
      }, orderBy: { code: 'asc' }
    });
    res.json({ equipment });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post('/maintenance/create', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canCreate', simulatedRole);

    const { equipmentId, type, scheduledDate, description, cost, fmsFaultCode } = req.body;
    const record = await prisma.equipmentMaintenance.create({
      data: {
        equipmentId, type, scheduledDate: new Date(scheduledDate), description: description || null, cost: cost || 0,
        fmsFaultCode: fmsFaultCode || null, status: 'SCHEDULED'
      },
      include: { equipment: { select: { code: true, name: true } } }
    });
    res.json(record);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.put('/maintenance/:id/status', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    const { id } = req.params;
    const { newStatus, completionData } = req.body;
    if (!Object.hasOwn(MAINTENANCE_MOVES, newStatus)) return res.status(400).json({ error: 'newStatus is not a valid maintenance status.' });
    const move = MAINTENANCE_MOVES[newStatus];
    await requirePermission(userId!, 'EQUIPMENT', move.action, simulatedRole);

    const maintenance = await prisma.equipmentMaintenance.findUnique({ where: { id } });
    if (!maintenance) throw new Error('Maintenance record not found');
    if (maintenance.status !== move.from) return res.status(409).json({ error: `Only a ${move.from} record can move to ${newStatus}.` });

    const updateData: any = { status: newStatus };
    if (newStatus === 'IN_PROGRESS') {
      await prisma.equipment.update({ where: { id: maintenance.equipmentId }, data: { status: 'MAINTENANCE' } });
    } else if (newStatus === 'COMPLETED') {
      updateData.completedDate = new Date();
      if (completionData?.cost !== undefined) updateData.cost = completionData.cost;
      if (completionData?.description) updateData.description = completionData.description;
      await prisma.equipment.update({ where: { id: maintenance.equipmentId }, data: { status: 'ACTIVE' } });
    }

    const result = await prisma.equipmentMaintenance.update({
      where: { id }, data: updateData,
      include: { equipment: { select: { code: true, name: true, status: true } } }
    });
    res.json(result);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.delete('/maintenance/:id', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canDeleteDraft', simulatedRole);
    const { id } = req.params;

    const record = await prisma.equipmentMaintenance.findUnique({ where: { id } });
    if (!record) throw new Error('Maintenance record not found');
    // A completed record holds a final cost, so it is past being a draft.
    if (record.status === 'COMPLETED') await requirePermission(userId!, 'EQUIPMENT', 'canVoidRecord', simulatedRole);

    if (record.status === 'IN_PROGRESS') {
      await prisma.equipment.update({ where: { id: record.equipmentId }, data: { status: 'ACTIVE' } });
    }
    const result = await prisma.equipmentMaintenance.delete({ where: { id } });
    res.json(result);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.get('/maintenance/summary', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canView', simulatedRole);

    const [scheduled, inProgress, completed, allRecords] = await Promise.all([
      prisma.equipmentMaintenance.count({ where: { status: 'SCHEDULED' } }),
      prisma.equipmentMaintenance.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.equipmentMaintenance.count({ where: { status: 'COMPLETED' } }),
      prisma.equipmentMaintenance.findMany({ select: { cost: true, type: true, status: true } })
    ]);

    const totalCost = allRecords.reduce((sum, r) => sum + r.cost, 0);
    const preventiveCount = allRecords.filter(r => r.type === 'PREVENTIVE').length;
    const repairCount = allRecords.filter(r => r.type === 'REPAIR').length;
    const overdue = await prisma.equipmentMaintenance.count({ where: { status: 'SCHEDULED', scheduledDate: { lt: new Date() } } });

    res.json({ scheduled, inProgress, completed, overdue, totalCost, preventiveCount, repairCount, totalRecords: allRecords.length });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// ------------------------------------------------------------------
// AI SAFETY & DIAGNOSTICS ACTIONS
// ------------------------------------------------------------------

router.post('/ai/validations', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canView', simulatedRole);

    const { type, severity, status } = req.body;
    const where: any = {};
    if (type) where.type = type;
    if (severity) where.severity = severity;
    if (status) where.status = status;

    const data = await prisma.equipmentAIValidation.findMany({
      where, orderBy: { createdAt: 'desc' },
      include: { equipment: { select: { id: true, code: true, name: true, category: true, status: true, lastEngineHours: true } } }
    });
    res.json(data);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.put('/ai/validations/:id/status', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canReview', simulatedRole);
    const { id } = req.params;
    const { newStatus } = req.body;

    const result = await prisma.equipmentAIValidation.update({
      where: { id }, data: { status: newStatus },
      include: { equipment: { select: { code: true, name: true } } }
    });
    res.json(result);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.get('/fleet/events', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canView', simulatedRole);
    const limit = Number(req.query.limit) || 50;

    const data = await prisma.fleetEvent.findMany({
      orderBy: { eventTime: 'desc' }, take: limit,
      include: {
        equipment: { select: { code: true, name: true } },
        driver: { select: { firstName: true, lastName: true } },
        aiReviews: { select: { aiSummary: true, aiRiskScore: true, aiRecommendation: true } }
      }
    });
    res.json(data);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.get('/ai/dashboard', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canView', simulatedRole);

    const [openFindings, resolvedFindings, criticalFindings, highFindings, safetyEvents] = await Promise.all([
      prisma.equipmentAIValidation.count({ where: { status: 'OPEN' } }),
      prisma.equipmentAIValidation.count({ where: { status: 'RESOLVED' } }),
      prisma.equipmentAIValidation.count({ where: { severity: 'CRITICAL', status: 'OPEN' } }),
      prisma.equipmentAIValidation.count({ where: { severity: 'HIGH', status: 'OPEN' } }),
      prisma.fleetEvent.count({
        where: { status: { in: ['NEW', 'ACKNOWLEDGED'] }, eventTime: { gte: new Date(Date.now() - 7 * 86400000) } }
      })
    ]);

    res.json({ openFindings, resolvedFindings, criticalFindings, highFindings, safetyEvents });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post('/ai/run-diagnostics', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'EQUIPMENT', 'canCreate', simulatedRole);

    const equipment = await prisma.equipment.findMany({
      include: {
        telemetry: { orderBy: { timestamp: 'desc' }, take: 1 },
        maintenances: { orderBy: { createdAt: 'desc' }, take: 3 },
        utilizations: { orderBy: { date: 'desc' }, take: 30 },
        deployments: { where: { status: { in: ['DISPATCHED', 'APPROVED'] } }, take: 1 }
      }
    });

    const findings: { equipmentId: string; type: string; severity: string; findings: string; recommendations: string }[] = [];

    for (const eq of equipment) {
      const latestTelemetry = eq.telemetry[0] || null;
      const lastMaintenance = eq.maintenances[0] || null;
      const recentUtils = eq.utilizations;
      const engineHours = eq.lastEngineHours || 0;

      if (latestTelemetry?.faultCodes && latestTelemetry.faultCodes !== '[]' && latestTelemetry.faultCodes !== 'null') {
        findings.push({
          equipmentId: eq.id, type: 'PREDICTIVE_MAINTENANCE', severity: 'CRITICAL',
          findings: `Active Diagnostic Trouble Codes detected: ${latestTelemetry.faultCodes}. Equipment [${eq.code}] "${eq.name}" is reporting fault conditions from FMS telemetry recorded at ${latestTelemetry.timestamp.toISOString()}.`,
          recommendations: `Immediately schedule a diagnostic inspection and repair.`
        });
      }

      const lastMaintDate = lastMaintenance?.completedDate || lastMaintenance?.scheduledDate;
      const hoursSinceLastMaint = lastMaintDate ? (Date.now() - new Date(lastMaintDate).getTime()) / (1000 * 60 * 60 * 24) : 999;
      if (engineHours > 250 && hoursSinceLastMaint > 90) {
        findings.push({
          equipmentId: eq.id, type: 'PREDICTIVE_MAINTENANCE', severity: engineHours > 500 ? 'HIGH' : 'MEDIUM',
          findings: `Equipment [${eq.code}] "${eq.name}" has accumulated ${engineHours.toFixed(0)} engine hours with no maintenance in the last ${Math.floor(hoursSinceLastMaint)} days.`,
          recommendations: `Schedule preventive maintenance immediately.`
        });
      }

      if (recentUtils.length >= 5) {
        const avgHours = recentUtils.reduce((s, u) => s + u.hoursUsed, 0) / recentUtils.length;
        const avgFuel = recentUtils.reduce((s, u) => s + u.fuelConsumed, 0) / recentUtils.length;

        if (avgHours > 0 && avgFuel > 0) {
          const fuelPerHour = avgFuel / avgHours;
          if (fuelPerHour > 8 && eq.category === 'HEAVY') {
            findings.push({
              equipmentId: eq.id, type: 'FUEL_AUDIT', severity: 'MEDIUM',
              findings: `Equipment [${eq.code}] "${eq.name}" shows average fuel consumption of ${fuelPerHour.toFixed(1)} L/hr.`,
              recommendations: `Investigate potential causes: fuel line leaks, injector problems, operator behavior.`
            });
          }
        }

        const highUtilDays = recentUtils.filter(u => u.hoursUsed > 12).length;
        if (highUtilDays >= 3) {
          findings.push({
            equipmentId: eq.id, type: 'UTILIZATION_AUDIT', severity: 'MEDIUM',
            findings: `Equipment [${eq.code}] "${eq.name}" was operated for more than 12 hours/day on ${highUtilDays} of the last ${recentUtils.length} days.`,
            recommendations: `Review operator shift schedules. Consider rotating equipment.`
          });
        }
      }

      if (eq.deployments.length > 0 && eq.status === 'DEPLOYED') {
        const lastUtil = recentUtils[0];
        const daysSinceLastUtil = lastUtil ? (Date.now() - new Date(lastUtil.date).getTime()) / (1000 * 60 * 60 * 24) : 999;
        if (daysSinceLastUtil > 14) {
          findings.push({
            equipmentId: eq.id, type: 'UTILIZATION_AUDIT', severity: 'LOW',
            findings: `Equipment [${eq.code}] "${eq.name}" is currently deployed but has no utilization logs in the last ${Math.floor(daysSinceLastUtil)} days.`,
            recommendations: `Verify with the project site if the equipment is actively being used.`
          });
        }
      }
    }

    const existingOpen = await prisma.equipmentAIValidation.findMany({ where: { status: 'OPEN' }, select: { equipmentId: true, type: true } });
    const existingKeys = new Set(existingOpen.map(e => `${e.equipmentId}::${e.type}`));
    const newFindings = findings.filter(f => !existingKeys.has(`${f.equipmentId}::${f.type}`));

    if (newFindings.length > 0) {
      await prisma.equipmentAIValidation.createMany({
        data: newFindings.map(f => ({
          equipmentId: f.equipmentId, type: f.type, severity: f.severity, findings: f.findings, recommendations: f.recommendations, status: 'OPEN'
        }))
      });
    }

    res.json({ analyzed: equipment.length, newFindings: newFindings.length, skippedDuplicates: findings.length - newFindings.length });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

export default router;
