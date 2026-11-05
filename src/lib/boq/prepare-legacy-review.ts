import { Prisma } from '@prisma/client';
import { prisma, transactionContext } from '@/lib/prisma';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { buildDraftBOQChecksum } from './draft-workflow';
import { createBOQReviewDocument, manualBOQSectionIdentity } from './review-state';

export class BOQReviewPreparationError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function fail(message: string, status: number): never { throw new BOQReviewPreparationError(message, status); }

export async function prepareLegacyBOQReview(input: { actor: { id: string; role: string }; projectId: string; versionId: string }) {
  const capacity = await planningCapacity(input.actor, input.projectId);
  if (!capacity.canEdit) fail('Your project capacity cannot prepare this BOQ review.', 403);
  return transactionContext.run({ sourceProvenance: 'GATE9_WORKFLOW_ENGINE' }, () => prisma.$transaction(async tx => {
    const [project, version, existing] = await Promise.all([
      tx.project.findUnique({ where: { id: input.projectId }, select: { id: true, status: true, boqLocked: true } }),
      tx.projectBOQVersion.findFirst({ where: { id: input.versionId, projectId: input.projectId } }),
      tx.bOQReviewState.findFirst({ where: { projectId: input.projectId, versionId: input.versionId } }),
    ]);
    if (!project || project.status === 'ARCHIVED' || project.boqLocked || !version || version.status !== 'DRAFT') fail('Only an unlocked draft BOQ can be prepared for review.', 409);
    if (existing) return { success: true, alreadyPrepared: true, rowVersion: existing.rowVersion };
    const latest = await tx.projectBOQVersion.findFirst({ where: { projectId: input.projectId }, orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }], select: { id: true, checksum: true } });
    if (!latest || latest.id !== version.id) fail('This BOQ is no longer the current draft.', 409);
    const lines = await tx.awardedBOQItem.findMany({ where: { projectId: input.projectId }, orderBy: [{ itemCode: 'asc' }, { id: 'asc' }] });
    if (!lines.length || buildDraftBOQChecksum(lines) !== latest.checksum) fail('The BOQ changed. Refresh before preparing its review record.', 409);

    const sectionOrder = new Map<string, number>();
    const sectionIdentityByItemId: Record<string, { id: string; name: string; order: number }> = {};
    for (const line of lines) {
      const sectionName = line.category?.trim() || 'General';
      if (!sectionOrder.has(sectionName)) sectionOrder.set(sectionName, sectionOrder.size + 1);
      sectionIdentityByItemId[line.id] = manualBOQSectionIdentity(sectionName, sectionOrder.get(sectionName)!);
    }
    const document = createBOQReviewDocument({
      projectId: input.projectId,
      versionId: input.versionId,
      uploadId: null,
      fileName: null,
      fileHash: null,
      selectedSheet: null,
      mapping: {},
      breakdownMapping: {},
      rows: [],
      provenance: 'LEGACY_CANONICAL_SNAPSHOT',
      sectionIdentityByItemId,
    });
    const now = new Date().toISOString();
    document.history.push({ action: 'LEGACY_DRAFT_REVIEW_PREPARED', actorId: input.actor.id, reason: null, at: now, before: { checksum: latest.checksum }, after: { lineCount: lines.length, originalWorkbookAvailable: false } });
    const state = await tx.bOQReviewState.create({ data: { projectId: input.projectId, versionId: input.versionId, dataJson: JSON.stringify(document) } });
    await tx.auditLog.create({ data: { userId: input.actor.id, userRole: input.actor.role, moduleName: 'PROJECT_BOQ', transactionId: input.versionId, actionType: 'PROJECT_BOQ_LEGACY_REVIEW_PREPARED', oldValue: null, newValue: JSON.stringify({ lineCount: lines.length, checksum: latest.checksum, originalWorkbookAvailable: false }) } });
    return { success: true, alreadyPrepared: false, rowVersion: state.rowVersion };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }));
}
