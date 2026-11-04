import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { approveAndLockDraftBOQ, buildDraftBOQChecksum, type DraftBOQDatabase, type DraftBOQTransaction } from './draft-workflow';

export async function commitTemplateToBOQ(uploadId: string, projectId: string, userId: string) {
  if (!uploadId || !projectId || !userId) throw new Error('An authenticated user and upload are required.');
  return prisma.$transaction(async tx => {
    const upload = await tx.uploadedWorkbookFile.findUnique({ where: { id: uploadId } });
    if (!upload || upload.projectId !== projectId) throw new Error('Upload record not found for this project.');
    if (upload.commitStatus === 'COMMITTED') return { success: true as const, alreadyCommitted: true, count: 0 };
    if (upload.commitStatus === 'RETURNED_FOR_CORRECTION') throw new Error('Upload a corrected workbook before importing this BOQ.');
    if (upload.validationStatus !== 'SUCCESS' || upload.extractionStatus !== 'SUCCESS') {
      throw new Error('Correct the workbook validation errors before importing it.');
    }
    const project = await tx.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error('Project not found.');
    if (project.boqLocked || await tx.awardedBOQItem.count({ where: { projectId } }) ||
        await tx.projectBOQVersion.count({ where: { projectId } })) {
      throw new Error('This project already has a BOQ. Use its draft/revision workflow instead of importing over it.');
    }
    const items = await tx.bOQExtractedItem.findMany({
      where: { uploadedWorkbookFileId: uploadId, projectId }, include: { section: true },
      orderBy: { sourceRowNumber: 'asc' },
    });
    if (!items.length) throw new Error('The workbook has no BOQ items to import.');
    const total = items.reduce((sum, item) => sum.add(String(item.amount ?? 0)), new Prisma.Decimal(0));
    if (!project.contractAmount || !total.equals(String(project.contractAmount))) {
      throw new Error('The BOQ total must match the project contract amount before approval.');
    }
    await tx.awardedBOQItem.createMany({ data: items.map(item => ({
      projectId, itemCode: item.itemNumber || 'UNCODED', category: item.section?.sectionName || 'GENERAL',
      description: item.description, unit: item.unit || 'LOT', quantity: item.quantity ?? 0,
      directCost: item.totalDirectCost ?? 0, indirectCost: item.totalIndirectCost ?? 0,
      combinedUnitCost: item.unitCost ?? 0, totalCost: item.amount ?? 0, status: 'DRAFT',
      remainingQuantity: item.quantity ?? 0, balanceAmount: item.amount ?? 0,
      revisedContractQuantity: item.quantity ?? 0, revisedContractUnitPrice: item.unitCost ?? 0,
      revisedContractAmount: item.amount ?? 0,
    })) });
    const lines = await tx.awardedBOQItem.findMany({ where: { projectId } });
    const checksum = buildDraftBOQChecksum(lines);
    const version = await tx.projectBOQVersion.create({ data: {
      projectId, sourceUploadedWorkbookFileId: uploadId, versionNumber: 1, status: 'DRAFT',
      committedBy: userId, committedAt: new Date(), totalAmount: total.toNumber(), checksum,
      sourceProvenance: 'BOQ_TEMPLATE_CENTER',
    } });
    // Apply the existing approval/checksum/immutable-schedule rules in this transaction.
    const approvalClient: DraftBOQDatabase = {
      $transaction: callback => callback(tx as unknown as DraftBOQTransaction),
    };
    await approveAndLockDraftBOQ(projectId, userId, { versionId: version.id, expectedChecksum: checksum }, approvalClient);
    await tx.uploadedWorkbookFile.update({ where: { id: uploadId }, data: { commitStatus: 'COMMITTED' } });
    await tx.workbookExtractionAudit.create({ data: {
      uploadedWorkbookFileId: uploadId, projectId, action: 'COMMIT_TO_AWARDED_BOQ', status: 'SUCCESS',
      message: `Approved and imported ${items.length} BOQ items.`, performedBy: userId,
    } });
    return { success: true as const, count: items.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15000, timeout: 30000 });
}
