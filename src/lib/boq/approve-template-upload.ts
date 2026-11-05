import { prisma } from '@/lib/prisma';
import { getSessionActor, checkSchedulingAccess } from '@/lib/scheduling/authUtils';
import { commitTemplateToBOQ } from './boq-template-commit-service';
import { reviewBOQModule } from './module-review';

export async function approveTemplateUploadForCurrentActor(uploadId: string, expectedProjectId?: string) {
  const actor = await getSessionActor();
  const upload = await prisma.uploadedWorkbookFile.findUnique({ where: { id: uploadId }, select: { projectId: true } });
  if (!upload || (expectedProjectId && expectedProjectId !== upload.projectId)) throw new Error('Upload record not found.');
  const workspaceVersion = await prisma.projectBOQVersion.findFirst({ where: {
    projectId: upload.projectId, sourceUploadedWorkbookFileId: uploadId, sourceProvenance: 'BOQ_WORKSPACE',
  }, orderBy: { versionNumber: 'desc' } });
  if (workspaceVersion) return reviewBOQModule(upload.projectId, actor, {
    action: 'approve', versionId: workspaceVersion.id, expectedChecksum: workspaceVersion.checksum,
  });
  const access = await checkSchedulingAccess(actor.id, actor.role, upload.projectId, 'canApprove');
  if (!access.allowed) throw new Error('You do not have permission to approve this project BOQ.');
  return commitTemplateToBOQ(uploadId, upload.projectId, actor.id);
}
