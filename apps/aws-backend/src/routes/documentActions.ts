import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const router = Router();

// --- Helper for file operations (adjust path for AWS environment) ---
// In a real AWS setup, this would typically interact with S3 or similar cloud storage.
// For this migration, we are preserving the original local file system logic.
const getUploadDirPath = () => {
  // In an Express app, process.cwd() is typically the root of the Express application.
  // Ensure 'public/uploads/documents' exists relative to where your Express app runs.
  return path.join(process.cwd(), 'public', 'uploads', 'documents');
};

router.post('/uploadDocument', async (req, res) => {
  try {
    const { fileName, fileContentBase64, fileType, fileSize, category, projectId, uploaderId } = req.body;

    if (!fileName || !fileContentBase64) {
      return res.status(400).json({ success: false, error: 'No file content provided.' });
    }

    const uploadDir = getUploadDirPath();
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const fileExtension = path.extname(fileName);
    const baseName = path.basename(fileName, fileExtension);
    const safeBaseName = baseName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueName = `${safeBaseName}_${Date.now()}${fileExtension}`;
    const filePath = path.join(uploadDir, uniqueName);

    const buffer = Buffer.from(fileContentBase64, 'base64');
    fs.writeFileSync(filePath, buffer);

    const fileUrl = `/uploads/documents/${uniqueName}`;

    await prisma.document.create({
      data: {
        title: fileName,
        category: category || 'OTHER',
        fileUrl,
        fileType: fileType || 'application/octet-stream',
        fileSize: fileSize,
        projectId: projectId || null,
        uploaderId: uploaderId || null
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
