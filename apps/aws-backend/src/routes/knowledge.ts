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

router.post('/records', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SYSTEM_SETTINGS', 'canEditDraft', simulatedRole);
    
    const data = req.body;
    const isUpdate = !!data.id;
    let record;

    if (isUpdate) {
      record = await prisma.knowledgeRecord.update({
        where: { id: data.id },
        data: {
          title: data.title,
          description: data.description,
          notebookType: data.notebookType,
          notebookUrl: data.notebookUrl,
          relatedModule: data.relatedModule,
          documentType: data.documentType,
          version: data.version,
          status: data.status,
          uploadedFileUrl: data.uploadedFileUrl,
          summary: data.summary,
        }
      });

      await prisma.knowledgeAuditTrail.create({
        data: {
          knowledgeRecordId: record.id,
          action: 'Updated',
          performedBy: userId || 'System User',
          reason: 'Manual update'
        }
      });
    } else {
      record = await prisma.knowledgeRecord.create({
        data: {
          title: data.title,
          description: data.description,
          notebookType: data.notebookType,
          notebookUrl: data.notebookUrl,
          relatedModule: data.relatedModule,
          documentType: data.documentType,
          version: data.version || 'v1.0',
          status: data.status || 'Draft',
          uploadedFileUrl: data.uploadedFileUrl,
          summary: data.summary,
        }
      });

      await prisma.knowledgeAuditTrail.create({
        data: {
          knowledgeRecordId: record.id,
          action: 'Created',
          performedBy: userId || 'System User',
        }
      });
    }
    res.json({ success: true, record });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/records/:id', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'SYSTEM_SETTINGS', 'canDeleteDraft', simulatedRole);

    const record = await prisma.knowledgeRecord.findUnique({ where: { id: req.params.id }, select: { status: true } });
    if (record && record.status !== 'Draft') return res.status(409).json({ success: false, error: 'Only a draft knowledge record can be deleted.' });
    await prisma.knowledgeRecord.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

export default router;
