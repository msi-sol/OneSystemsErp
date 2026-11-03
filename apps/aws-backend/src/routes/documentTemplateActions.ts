import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

// Endpoint for uploadDocumentTemplate
router.post('/uploadDocumentTemplate', async (req, res) => {
  try {
    const { fileUrl, fileName, templateName, templateType, uploadedById } = req.body;

    if (!fileUrl || !fileName || !templateType || !templateName) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Usually there's only one active template per type, we can optionally deprecate the others
    await prisma.documentTemplate.updateMany({
      where: { templateType },
      data: { status: 'INACTIVE' },
    });

    const template = await prisma.documentTemplate.create({
      data: {
        fileUrl,
        fileName,
        templateName,
        templateType,
        uploadedById: uploadedById || null,
        status: 'ACTIVE',
      },
    });

    return res.json({ success: true, data: template });
  } catch (error: any) {
    console.error('Template Upload Error (AWS Backend):', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to upload template' });
  }
});

// Endpoint for fetchActiveTemplates
router.post('/fetchActiveTemplates', async (req, res) => {
  try {
    const templates = await prisma.documentTemplate.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { templateType: 'asc' },
      include: {
        uploadedBy: { select: { name: true } },
      },
    });
    return res.json({ success: true, data: templates });
  } catch (error: any) {
    console.error('Fetch Templates Error (AWS Backend):', error);
    return res.status(500).json({ success: false, error: 'Failed to load templates' });
  }
});

export default router;
