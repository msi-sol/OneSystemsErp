import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth';
import { hasPermission, getPermissionsForRole } from '../lib/permissions';
import { prisma } from '../lib/prisma';
import { MAX_BOQ_UPLOAD_BYTES, validateBOQUploadFile } from '../../../../src/lib/boq/upload-input';
import { runBoqUploadJob } from '../jobs/boqWorker';

const router = Router();
const COMPLETED_RETENTION_MS = 15 * 60 * 1000;
const MAX_COMPLETED_JOBS = 100;
const MAX_PROCESSING_JOBS = 4;
type Job = {
  ownerId: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  completedAt?: number;
  result?: Awaited<ReturnType<typeof runBoqUploadJob>>;
  error?: string;
};

// Transient status only. Cleanup never deletes uploaded files or database records.
export const jobStore = new Map<string, Job>();

function cleanupJobs() {
  const completed = [...jobStore.entries()].filter(([, job]) => job.completedAt !== undefined)
    .sort((a, b) => a[1].completedAt! - b[1].completedAt!);
  let retained = completed.length;
  for (const [id, job] of completed) {
    if (Date.now() - job.completedAt! > COMPLETED_RETENTION_MS || retained > MAX_COMPLETED_JOBS) {
      jobStore.delete(id);
      retained--;
    }
  }
}

async function mayUpload(userId: string, projectId: string | null, simulatedRole?: string) {
  if (await hasPermission(userId, 'PROJECT_MANAGEMENT', projectId ? 'canEditDraft' : 'canCreate', simulatedRole)) return true;
  if (!projectId || simulatedRole) return false;
  const assignment = await prisma.projectUserAssignment.findUnique({
    where: { userId_projectId: { userId, projectId } },
    select: { assignmentStatus: true, projectRole: true },
  });
  if (!assignment || assignment.assignmentStatus !== 'active') return false;
  const permissions = await getPermissionsForRole(assignment.projectRole);
  return permissions.PROJECT_MANAGEMENT?.canEditDraft === true;
}

router.post('/boq-upload', async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user || typeof user.id !== 'string' || !user.id) {
      return res.status(401).json({ success: false, error: 'An authenticated user is required.' });
    }
    const { projectId: requestedProjectId, fileBufferBase64, fileName } = req.body || {};
    const projectId = requestedProjectId === undefined || requestedProjectId === null || requestedProjectId === '' ? null : requestedProjectId;
    if (projectId !== null && (typeof projectId !== 'string' || !/^[A-Za-z0-9_-]{1,191}$/.test(projectId))) {
      return res.status(400).json({ success: false, error: 'Invalid project ID.' });
    }
    if (typeof fileName !== 'string' || fileName.length > 255 || /[\\/\x00-\x1f]/.test(fileName)) {
      return res.status(400).json({ success: false, error: 'Invalid workbook filename.' });
    }
    if (typeof fileBufferBase64 !== 'string' || fileBufferBase64.length > Math.ceil(MAX_BOQ_UPLOAD_BYTES / 3) * 4 ||
        fileBufferBase64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(fileBufferBase64)) {
      return res.status(400).json({ success: false, error: 'Invalid or oversized workbook data.' });
    }
    const buffer = Buffer.from(fileBufferBase64, 'base64');
    const validationError = validateBOQUploadFile({ name: fileName, size: buffer.length });
    if (validationError || buffer.toString('base64') !== fileBufferBase64) {
      return res.status(400).json({ success: false, error: validationError || 'Invalid workbook data.' });
    }
    if (!await mayUpload(user.id, projectId, req.pbacContext?.simulatedRole)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to upload this project BOQ.' });
    }
    cleanupJobs();
    if ([...jobStore.values()].filter(job => job.status === 'PROCESSING').length >= MAX_PROCESSING_JOBS) {
      return res.status(503).json({ success: false, error: 'BOQ processing is busy. Please try again shortly.' });
    }
    const jobId = `boq-${randomUUID()}`;
    jobStore.set(jobId, { ownerId: user.id, status: 'PROCESSING' });
    void runBoqUploadJob(jobId, projectId, fileBufferBase64, fileName, user)
      .then(result => {
        jobStore.set(jobId, result.success
          ? { ownerId: user.id, status: 'COMPLETED', result, completedAt: Date.now() }
          : { ownerId: user.id, status: 'FAILED', error: result.error || 'Failed to process BOQ upload.', completedAt: Date.now() });
        cleanupJobs();
      })
      .catch(() => {
        jobStore.set(jobId, { ownerId: user.id, status: 'FAILED', error: 'Failed to process BOQ upload.', completedAt: Date.now() });
        cleanupJobs();
      });
    return res.json({ success: true, jobId, status: 'PROCESSING' });
  } catch (error) {
    console.error('Failed to dispatch BOQ upload job:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({ success: false, error: 'Unable to start BOQ processing.' });
  }
});

router.get('/:jobId', (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  if (typeof userId !== 'string' || !userId) return res.status(401).json({ success: false, error: 'An authenticated user is required.' });
  cleanupJobs();
  const job = jobStore.get(req.params.jobId as string);
  if (!job || job.ownerId !== userId) return res.status(404).json({ success: false, error: 'Job not found' });
  return res.json({ success: true, status: job.status, ...(job.result ? { result: job.result } : {}), ...(job.error ? { error: job.error } : {}) });
});

export default router;
