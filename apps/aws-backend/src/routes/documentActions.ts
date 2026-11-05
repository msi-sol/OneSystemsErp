import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { uploadToS3 } from '../../../../src/lib/s3';

const router = Router();

router.post('/uploadDocument', async (req, res) => {
  try {
    const { fileName, fileContentBase64, fileType, fileSize, category, projectId, uploaderId } = req.body;

    if (!fileName || !fileContentBase64) {
      return res.status(400).json({ success: false, error: 'No file content provided.' });
    }

    const fileExtension = path.extname(fileName);
    const baseName = path.basename(fileName, fileExtension);
    const safeBaseName = baseName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueName = `${safeBaseName}_${Date.now()}${fileExtension}`;
    const buffer = Buffer.from(fileContentBase64, 'base64');
    const actorId = String(req.headers['x-user-session'] || '');
    const { url: fileUrl } = await uploadToS3(uniqueName, buffer, {
      contentType: fileType || 'application/octet-stream', module: 'DOCUMENTS', projectId: projectId || null, uploadedBy: actorId,
    });

    await prisma.document.create({
      data: {
        title: fileName,
        category: category || 'OTHER',
        fileUrl,
        fileType: fileType || 'application/octet-stream',
        fileSize: fileSize,
        projectId: projectId || null,
        uploaderId: actorId
      }
    });

    res.json({ success: true, message: 'Document uploaded successfully!' });
  } catch (error: any) {
    console.error('Error uploading document:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getAllDocuments', async (req, res) => {
  try {
    const docs = await prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: { select: { name: true, email: true } },
        project: { select: { name: true } }
      }
    });
    res.json(docs);
  } catch (error: any) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/deleteDocument', async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, error: 'Document ID is required.' });
    }

    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    // Try to delete physical file
    try {
      if (doc.fileUrl.startsWith('/uploads/documents/')) {
        const filePath = path.join(process.cwd(), 'public', doc.fileUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (e) {
      console.error('Failed to delete physical file:', e);
      // Continue with database deletion even if file deletion fails
    }

    await prisma.document.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting document:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
