import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { getUserPermissions } from '../lib/permissions'; // Adjust path as per your AWS backend structure

const router = Router();

// Middleware to parse JSON body, assuming it's applied globally or per-route
// router.use(express.json()); // This would typically be in your main app.ts

router.post('/checkSocAccess', async (req, res) => {
  try {
    // Acting user comes from the verified backend token (auth middleware), never from the client body.
    const userId = req.body.sessionId as string;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    const permissions = await getUserPermissions(userId);
    const hasAccess = !permissions.IS_ADMIN && !permissions.SYSTEM_SETTINGS?.canView ? false : true;
    res.json({ success: true, data: hasAccess });
  } catch (error: any) {
    console.error('Error in checkSocAccess:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getSocDashboardStats', async (req, res) => {
  try {
    const { includeSimulated = true } = req.body;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const whereClause = includeSimulated ? {} : { simulated: false };

    const [
      totalEvents,
      blockedThreats,
      criticalThreats,
      failedLogins,
      aiAttacks,
      fileThreats,
      activeIncidents,
    ] = await Promise.all([
      prisma.securityEvent.count({ where: { timestamp: { gte: today }, ...whereClause } }),
      prisma.securityEvent.count({ where: { timestamp: { gte: today }, OR: [{ status: 'BLOCKED' }, { result: 'BLOCKED' }, { blocked: true }], ...whereClause } }),
      prisma.securityEvent.count({ where: { timestamp: { gte: today }, severity: { in: ['CRITICAL', 'Critical'] }, ...whereClause } }),
      prisma.securityEvent.count({ where: { timestamp: { gte: today }, OR: [{ threatType: 'UNAUTHENTICATED_ACCESS' }, { category: 'Authentication' }], ...whereClause } }),
      prisma.securityEvent.count({ where: { timestamp: { gte: today }, category: 'AI', ...whereClause } }),
      prisma.securityEvent.count({ where: { timestamp: { gte: today }, category: 'FILE', ...whereClause } }),
      prisma.securityIncident.count({ where: { status: { notIn: ['Resolved', 'Closed'] } } }),
    ]);

    res.json({
      success: true,
      data: {
        totalEvents,
        blockedThreats,
        criticalThreats,
        failedLogins,
        aiAttacks,
        fileThreats,
        activeIncidents,
      },
    });
  } catch (error: any) {
    console.error('Error in getSocDashboardStats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getLiveThreatFeed', async (req, res) => {
  try {
    const { limit = 50, includeSimulated = true } = req.body;
    const whereClause = includeSimulated ? {} : { simulated: false };
    const data = await prisma.securityEvent.findMany({
      take: limit,
      where: whereClause,
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        timestamp: true,
        severity: true,
        threatType: true,
        sourceIp: true,
        country: true,
        city: true,
        userEmail: true,
        userRole: true,
        module: true,
        systemResponse: true,
        result: true,
        status: true,
        simulated: true,
        simulationRunId: true,
        expectedResponse: true,
        actualResponse: true,
      }
    });
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in getLiveThreatFeed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getEventDetails', async (req, res) => {
  try {
    const { eventId } = req.body;
    if (!eventId) {
      return res.status(400).json({ success: false, error: 'eventId is required' });
    }
    const data = await prisma.securityEvent.findUnique({
      where: { id: eventId },
      include: {
        incident: true,
      }
    });
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in getEventDetails:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getThreatMapData', async (req, res) => {
  try {
    const { includeSimulated = true } = req.body;
    const whereClause = includeSimulated
      ? { latitude: { not: null }, longitude: { not: null } }
      : { latitude: { not: null }, longitude: { not: null }, simulated: false };

    const recentEvents = await prisma.securityEvent.findMany({
      take: 100,
      orderBy: { timestamp: 'desc' },
      where: whereClause,
      select: {
        id: true,
        sourceIp: true,
        latitude: true,
        longitude: true,
        severity: true,
        status: true,
        threatType: true,
        country: true,
        city: true,
        simulated: true,
      }
    });
    res.json({ success: true, data: recentEvents });
  } catch (error: any) {
    console.error('Error in getThreatMapData:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getCountermeasuresData', async (req, res) => {
  try {
    const { limit = 20 } = req.body;
    const data = await prisma.countermeasureLog.findMany({
      take: limit,
      orderBy: { timestamp: 'desc' },
    });
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in getCountermeasuresData:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
