import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { buildDraftBOQChecksum } from './draft-workflow';
import { createBOQReviewDocument, type BOQSourceRow } from './review-state';

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
    const lines = [];
    const sectionIdentityByItemId: Record<string, { id: string; name: string; order: number }> = {};
    const sourceRows: BOQSourceRow[] = [];
    for (const [index, item] of items.entries()) {
      const quantity = item.quantity ?? 0;
      const amount = item.amount ?? 0;
      const statedRate = item.unitCost ?? null;
      const usedRate = quantity > 0 ? new Prisma.Decimal(String(amount)).div(String(quantity)).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toNumber() : statedRate ?? 0;
      const itemCode = item.itemNumber || `ROW-${item.sourceRowNumber ?? index + 1}`;
      const line = await tx.awardedBOQItem.create({ data: {
        projectId, itemCode, category: item.section?.sectionName || 'GENERAL',
        description: item.description, unit: item.unit || 'lot', quantity,
        directCost: item.totalDirectCost ?? 0, indirectCost: item.totalIndirectCost ?? 0,
        combinedUnitCost: usedRate, totalCost: amount, status: 'DRAFT',
        remainingQuantity: quantity, balanceAmount: amount,
        revisedContractQuantity: quantity, revisedContractUnitPrice: usedRate,
        revisedContractAmount: amount,
      } });
      lines.push(line);
      const sectionName = item.section?.sectionName || 'GENERAL';
      sectionIdentityByItemId[line.id] = { id: item.sectionId || `legacy-extracted:${sectionName}`, name: sectionName, order: item.section?.displayOrder ?? index + 1 };
      sourceRows.push({
        sourceRowNumber: item.sourceRowNumber ?? index + 1, section: sectionName, sectionSourceKey: item.sectionId || `section:${index + 1}`,
        sectionOrder: item.section?.displayOrder ?? index + 1, itemId: line.id, itemCode: item.itemNumber || '',
        description: item.description, unit: item.unit || 'lot', quantity: String(quantity), unitCost: String(usedRate),
        sourceUnitCost: statedRate === null ? null : String(statedRate), rateDerived: statedRate === null || !new Prisma.Decimal(String(quantity)).mul(String(statedRate)).minus(String(amount)).abs().lte('0.01'),
        quantityDefaulted: item.quantity === null, unitDefaulted: item.unit === null, itemCodeSynthesized: !item.itemNumber,
        amount: String(amount), breakdown: { totalDirectCost: item.totalDirectCost == null ? null : String(item.totalDirectCost), totalIndirectCost: item.totalIndirectCost == null ? null : String(item.totalIndirectCost) },
      });
    }
    const checksum = buildDraftBOQChecksum(lines);
    const version = await tx.projectBOQVersion.create({ data: {
      projectId, sourceUploadedWorkbookFileId: uploadId, versionNumber: 1, status: 'DRAFT',
      committedBy: userId, committedAt: new Date(), totalAmount: total.toNumber(), checksum,
      sourceProvenance: 'BOQ_TEMPLATE_CENTER', remarks: 'Imported as an editable BOQ draft; Engineer review and Project Manager approval are required before locking.',
    } });
    const source = await tx.uploadedWorkbookFile.findUnique({ where: { id: uploadId }, select: { originalFilename: true, fileHash: true } });
    const reviewDocument = createBOQReviewDocument({
      projectId, versionId: version.id, uploadId, fileName: source?.originalFilename ?? 'Uploaded BOQ workbook', fileHash: source?.fileHash ?? '',
      selectedSheet: items[0]?.sheetName ?? '', mapping: {}, breakdownMapping: {}, rows: sourceRows,
      sectionIdentityByItemId,
    });
    await tx.bOQReviewState.create({ data: { projectId, versionId: version.id, dataJson: JSON.stringify(reviewDocument) } });
    await tx.uploadedWorkbookFile.update({ where: { id: uploadId }, data: { commitStatus: 'COMMITTED' } });
    await tx.workbookExtractionAudit.create({ data: {
      uploadedWorkbookFileId: uploadId, projectId, action: 'COMMIT_TO_BOQ_DRAFT', status: 'SUCCESS',
      message: `Imported ${items.length} draft BOQ items. Engineer review and Project Manager approval are still required.`, performedBy: userId,
    } });
    return { success: true as const, count: items.length, versionId: version.id, status: 'DRAFT' as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15000, timeout: 30000 });
}
