import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requirePermission } from '../lib/permissions'; // Adjust path as necessary

const router = Router();

router.post('/getLiveFleetLocations', async (req, res) => {
  try {
    // Extract userId from the request body, sent by the Next.js Server Action
    // Acting user comes from the verified backend token (auth middleware), never from the client body.
    const userId = req.body.sessionId as string;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized: userId missing.' });
    }

    await requirePermission(userId, 'EQUIPMENT', 'canView');

    // Get all active Hikvision devices and their latest GPS
    const devices = await prisma.hikvisionDevice.findMany({
      where: { status: 'ACTIVE' },
      include: {
        equipment: {
          include: {
            telemetry: {
              orderBy: { timestamp: 'desc' },
              take: 1
            }
          }
        }
      }
    });

    const result = devices.map(d => {
      const latestGps = d.equipment?.telemetry[0] || null;
      return {
        deviceId: d.id,
        deviceName: d.deviceName,
        equipmentCode: d.equipment?.code || 'N/A',
        equipmentName: d.equipment?.name || 'N/A',
        plateNumber: d.equipment?.plateNumber || 'N/A',
        lastSeenAt: d.lastSeenAt,
        integrationType: d.integrationType,
        telemetry: latestGps ? {
          latitude: latestGps.latitude,
          longitude: latestGps.longitude,
          speed: latestGps.speed,
          heading: latestGps.heading,
          engineState: latestGps.engineState,
          timestamp: latestGps.timestamp
        } : null
      };
    });

    res.json({ success: true, data: result });
  } catch (e: any) {
    console.error('Error in getLiveFleetLocations:', e);
    res.status(500).json({ success: false, error: e.message || 'An unknown error occurred.' });
  }
});

export default router;
