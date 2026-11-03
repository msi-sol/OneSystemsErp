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

router.get('/roles-modules', async (req, res) => {
  try {
    const roles = await prisma.role.findMany({ orderBy: { roleName: 'asc' } });
    const modules = await prisma.module.findMany({ orderBy: { moduleName: 'asc' } });
    const rolePermissions = await prisma.rolePermission.findMany();
    res.json({ roles, modules, rolePermissions });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post('/role-permission', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SYSTEM_SETTINGS', 'canEditDraft', simulatedRole);
    
    const { roleId, moduleId, field, value } = req.body;
    
    const moduleInfo = await prisma.module.findUnique({ where: { id: moduleId } });
    if (!moduleInfo) throw new Error("Module not found");

    await prisma.rolePermission.upsert({
      where: {
        roleId_moduleId: {
          roleId,
          moduleId,
        }
      },
      update: {
        [field]: value
      },
      create: {
        roleId,
        moduleId,
        moduleName: moduleInfo.moduleName,
        [field]: value
      }
    });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

export default router;
