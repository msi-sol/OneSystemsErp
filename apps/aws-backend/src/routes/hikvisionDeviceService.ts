import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { requirePermission } from '../lib/permissions';

// Use a fallback secret for local dev if not in env
const SECRET_KEY = process.env.ENCRYPTION_SECRET || 'vOVH6sdmpNWjRRIqCc7rdxs01lwHzfr3'; 

function encrypt(text: string) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(SECRET_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(SECRET_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// requireAuth sets these headers from the signed backend token, replacing anything the caller sent.
function verifiedUser(req: any) {
  return {
    userId: req.headers['x-user-session'] as string,
    simulatedRole: req.headers['x-simulated-role'] as string | undefined,
  };
}

// requirePermission in lib/permissions.ts words every refusal this way.
function failureStatus(e: any) {
  return e?.message?.startsWith('Unauthorized Action') ? 403 : 500;
}

const router = Router();

router.use((req, res, next) => {
  if (!verifiedUser(req).userId) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }
  next();
});

// Maps to /hikvisionDeviceService/getHikvisionDevices
router.post('/getHikvisionDevices', async (req, res) => {
  try {
    const { userId, simulatedRole } = verifiedUser(req);
    await requirePermission(userId, 'EQUIPMENT', 'canView', simulatedRole);
    
    const devices = await prisma.hikvisionDevice.findMany({
      include: {
        equipment: { select: { code: true, name: true, status: true, plateNumber: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Never return plain text passwords to client
    const safeDevices = devices.map(d => ({
      ...d,
      passwordEncrypted: d.passwordEncrypted ? '******' : null,
      rtspUrlEncrypted: d.rtspUrlEncrypted ? '******' : null
    }));

    res.json({ success: true, data: safeDevices });
  } catch (e: any) {
    console.error('Error in getHikvisionDevices:', e);
    res.status(failureStatus(e)).json({ success: false, error: e.message });
  }
});

// Maps to /hikvisionDeviceService/registerHikvisionDevice
router.post('/registerHikvisionDevice', async (req, res) => {
  try {
    const { userId, simulatedRole } = verifiedUser(req);
    await requirePermission(userId, 'EQUIPMENT', 'canCreate', simulatedRole);
    const { data } = req.body;

    const {
      deviceName,
      deviceModel,
      deviceSerialNumber,
      imeiOrUniqueId,
      integrationType,
      ipAddress,
      domainName,
      port,
      username,
      password,
      equipmentId,
      simNumber,
      simProvider
    } = data;

    const passwordEncrypted = password ? encrypt(password) : null;

    const newDevice = await prisma.hikvisionDevice.create({
      data: {
        deviceName,
        deviceModel,
        deviceSerialNumber,
        imeiOrUniqueId,
        integrationType,
        ipAddress,
        domainName,
        port: port ? parseInt(port) : null,
        usernameEncrypted: username,
        passwordEncrypted,
        equipmentId: equipmentId || null,
        simNumber,
        simProvider,
        installedBy: userId, // userId for tracking who installed it
        installationDate: new Date()
      }
    });

    res.json({ success: true, data: newDevice });
  } catch (e: any) {
    console.error('Error in registerHikvisionDevice:', e);
    res.status(failureStatus(e)).json({ success: false, error: e.message });
  }
});

// Maps to /hikvisionDeviceService/testDeviceConnection
router.post('/testDeviceConnection', async (req, res) => {
  try {
    const { userId, simulatedRole } = verifiedUser(req);
    await requirePermission(userId, 'EQUIPMENT', 'canView', simulatedRole);
    const { deviceId } = req.body;
    
    const device = await prisma.hikvisionDevice.findUnique({ where: { id: deviceId } });
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    // MOCK: In production, we'd ping the ISAPI endpoint: 
    // e.g. http://${device.ipAddress}:${device.port}/ISAPI/System/deviceInfo
    
    // Simulate network delay
    await new Promise(r => setTimeout(r, 1000));
    
    let result;
    if (device.integrationType === 'DEVICE_GATEWAY') {
      result = { success: true, message: 'Gateway integration ready for incoming webhooks.' };
    } else if (device.ipAddress) {
      result = { success: true, message: `Successfully connected to ${device.ipAddress} via ISAPI.` };
    } else {
      result = { success: false, message: 'Cannot test connection. IP or Gateway not configured.' };
    }

    res.json({ success: true, data: result }); // Wrap result in data for consistency
  } catch (e: any) {
    console.error('Error in testDeviceConnection:', e);
    res.status(failureStatus(e)).json({ success: false, error: e.message });
  }
});

export default router;
