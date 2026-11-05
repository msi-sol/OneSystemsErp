import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionActor, checkSchedulingAccess } from '@/lib/scheduling/authUtils';
import { hasPermission } from '@/lib/permissions';
import BOQTemplateClient, { type WorkspaceProject, type WorkspaceUpload } from './BOQTemplateClient';
import type { WorkspaceIssue } from '@/lib/boq/workspace-types';

export const dynamic = 'force-dynamic';

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function numberValue(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function reportIssues(report: Record<string, unknown>): WorkspaceIssue[] {
  const entries = [...(Array.isArray(report.errors) ? report.errors : []), ...(Array.isArray(report.warnings) ? report.warnings : [])];
  return entries.slice(0, 100).map(value => {
    const entry = objectValue(value);
    return { row: typeof entry.row === 'number' || typeof entry.row === 'string' ? entry.row : 'workbook',
      field: typeof entry.field === 'string' ? entry.field : 'BOQ',
      message: typeof entry.message === 'string' ? entry.message : typeof entry.issue === 'string' ? entry.issue : 'Review this workbook row.' };
  });
}

export default async function BOQWorkspacePage({ searchParams }: { searchParams: Promise<{ upload?: string; project?: string; mode?: string }> }) {
  const actor = await getSessionActor().catch(() => null);
  if (!actor) redirect('/login');
  const cookieStore = await cookies();
  const simulatedRole = cookieStore.get('simulatedRole')?.value;
  const effectiveRole = simulatedRole && ['SUPER_ADMIN', 'ADMIN', 'PROJECT_DIRECTOR', 'DIRECTORS'].includes(actor.role) ? simulatedRole : actor.role;
  const isSuperAdmin = ['SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(effectiveRole);
  const sourceProjects = await prisma.project.findMany({
    where: isSuperAdmin ? {} : { userAssignments: { some: { userId: actor.id, assignmentStatus: 'active' } } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, contractAmount: true, boqLocked: true,
      _count: { select: { awardedBoqItems: true } },
      uploadedWorkbookFiles: { take: 1, orderBy: { uploadedAt: 'desc' },
        select: { id: true, originalFilename: true, commitStatus: true, validationStatus: true } },
    },
  });
  const projectIds = sourceProjects.map(project => project.id);
  const versions = await prisma.projectBOQVersion.findMany({
    where: { projectId: { in: projectIds } }, select: { projectId: true, status: true },
    orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }],
  });
  const latestStatuses = new Map<string, string>();
  for (const version of versions) if (!latestStatuses.has(version.projectId)) latestStatuses.set(version.projectId, version.status);
  const projects: WorkspaceProject[] = await Promise.all(sourceProjects.map(async project => {
    const [edit, editDraft, approve] = await Promise.all([
      checkSchedulingAccess(actor.id, actor.role, project.id, 'canEdit'),
      checkSchedulingAccess(actor.id, actor.role, project.id, 'canEditDraft'),
      checkSchedulingAccess(actor.id, actor.role, project.id, 'canApprove'),
    ]);
    const upload = project.uploadedWorkbookFiles[0];
    return { id: project.id, name: project.name, contractAmount: project.contractAmount, boqLocked: project.boqLocked,
      hasBOQ: project._count.awardedBoqItems > 0, boqStatus: latestStatuses.get(project.id) || 'NOT_STARTED',
      fileName: upload?.originalFilename ?? null, uploadId: upload?.id ?? null,
      uploadStatus: upload ? upload.validationStatus === 'FAILED' || upload.validationStatus === 'CRITICAL_ERROR' ? 'VALIDATION_FAILED' : upload.commitStatus : null,
      canEdit: edit.allowed || editDraft.allowed, canApprove: approve.allowed };
  }));
  const [canCreate, canApprove] = await Promise.all([
    hasPermission(actor.id, 'PROJECT_MANAGEMENT', 'canCreate'),
    hasPermission(actor.id, 'PROJECT_MANAGEMENT', 'canApprove'),
  ]);
  const { upload: requestedUpload, project: requestedProject, mode: requestedMode } = await searchParams;
  const initialProjectId = projects.find(project => project.id === requestedProject && project.canEdit)?.id;
  const initialMode = initialProjectId ? 'existing' as const : requestedMode === 'new' && canCreate ? 'new' as const : undefined;
  let initialUpload: WorkspaceUpload | null = null;
  if (requestedUpload && requestedUpload.length <= 191) {
    const upload = await prisma.uploadedWorkbookFile.findFirst({
      where: { id: requestedUpload, projectId: { in: projectIds } },
      select: { id: true, projectId: true, originalFilename: true, preservedOriginalUrl: true, metadataJson: true,
        commitStatus: true, validationStatus: true, _count: { select: { extractedItems: true } } },
    });
    if (upload) {
      let metadata: Record<string, unknown> = {};
      try { metadata = objectValue(JSON.parse(upload.metadataJson || '{}')); } catch { /* A legacy upload may have no report. */ }
      const report = objectValue(metadata.report);
      const project = projects.find(item => item.id === upload.projectId)!;
      const total = await prisma.bOQExtractedItem.aggregate({ where: { uploadedWorkbookFileId: upload.id }, _sum: { amount: true } });
      initialUpload = { uploadId: upload.id, projectId: upload.projectId, fileName: upload.originalFilename,
        fileUrl: upload.preservedOriginalUrl || undefined,
        status: upload.validationStatus === 'FAILED' || upload.validationStatus === 'CRITICAL_ERROR' ? 'VALIDATION_FAILED' : upload.commitStatus,
        grandTotal: numberValue(report.grandTotal, total._sum.amount || 0), validRowsCount: numberValue(report.validRowsCount, upload._count.extractedItems),
        warningRowsCount: numberValue(report.warningRowsCount), errorRowsCount: numberValue(report.errorRowsCount, upload.validationStatus === 'SUCCESS' ? 0 : 1),
        sheetName: typeof metadata.sheetName === 'string' ? metadata.sheetName : undefined,
        canSubmit: project.canEdit, canApprove: project.canApprove,
        issues: reportIssues(report),
      };
    }
  }
  return <BOQTemplateClient key={initialUpload?.uploadId || initialProjectId || initialMode || 'workspace'} projects={projects} actorName={actor.name || actor.email || 'Current user'}
    actorRole={effectiveRole} canCreate={canCreate} canApprove={canApprove} canAnalyze={canCreate || projects.some(project => project.canEdit)} initialUpload={initialUpload} initialProjectId={initialProjectId} initialMode={initialMode} />;
}
