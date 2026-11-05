// @ts-nocheck
import { Router } from 'express';
import { generateUploadUrl, generateDownloadUrl } from '../services/s3.service';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { hasPermission, getUserPermissions } from '../lib/permissions';
import { headStoredUpload } from '../../../../src/lib/s3';

const router = Router();

// Endpoint to generate a presigned URL for uploading files
router.post('/presigned-url/upload', async (req, res) => {
  try {
    const { key: requestedKey, contentType } = req.body;
    const userId = String(req.headers['x-user-session'] || '');
    const moduleName = String(req.body.module || 'DOCUMENTS');
    if (!await hasPermission(userId, moduleName, 'canCreate', req.headers['x-simulated-role'] as string | undefined)) return res.status(403).json({ error: 'Forbidden' });
    
    if (!requestedKey || !contentType) {
      return res.status(400).json({ error: 'Missing key or contentType' });
    }

    if (!/^[A-Z][A-Z_]{1,39}$/.test(moduleName)) return res.status(400).json({ error: 'Invalid upload module' });
    const key = `uploads/${moduleName.toLowerCase()}/${randomUUID()}-${path.basename(String(requestedKey)).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0,48)}`;
    const url = await generateUploadUrl(key, contentType, { module: moduleName, uploadedBy: userId, projectId: req.headers['x-active-project-id'] as string | undefined });
    res.json({ url, key });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// Endpoint to generate a presigned URL for downloading files
router.post('/presigned-url/download', async (req, res) => {
  try {
    const { key } = req.body;
    
    if (!key) {
      return res.status(400).json({ error: 'Missing key' });
    }
    const userId = String(req.headers['x-user-session'] || '');
    const object = await headStoredUpload(String(key));
    const metadata = object.Metadata || {};
    if (!metadata.module || !metadata.uploadedby || metadata.uploadedby !== userId && !await hasPermission(userId, metadata.module, 'canView', req.headers['x-simulated-role'] as string | undefined)) return res.status(403).json({ error: 'Forbidden' });
    if (metadata.adminonly === 'true' && metadata.uploadedby !== userId) {
      const permissions = await getUserPermissions(userId, req.headers['x-simulated-role'] as string | undefined);
      if (!permissions.IS_ADMIN && !permissions.IS_SYSTEM_ADMIN) return res.status(403).json({ error: 'Forbidden' });
    }
    const url = await generateDownloadUrl(key);
    res.json({ url });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

export default router;
