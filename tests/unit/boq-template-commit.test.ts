jest.mock('@/lib/prisma', () => ({
  prisma: { $transaction: jest.fn() },
  transactionContext: new (jest.requireActual('node:async_hooks').AsyncLocalStorage)(),
}));

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { commitTemplateToBOQ } from '@/lib/boq/boq-template-commit-service';
import { buildDraftBOQChecksum, type DraftBOQLine } from '@/lib/boq/draft-workflow';

type Line = DraftBOQLine & { projectId: string; status: string };
type Version = { id: string; projectId: string; status: string; checksum: string; versionNumber: number; committedBy?: string; approvedBy?: string; lockedById?: string };

function harness() {
  const state = {
    upload: { id: 'upload-1', projectId: 'project-1', commitStatus: 'PENDING', validationStatus: 'SUCCESS', extractionStatus: 'SUCCESS' },
    project: { id: 'project-1', boqLocked: false, contractAmount: 20 },
    lines: [] as Line[],
    version: null as Version | null,
    reviewState: null as { projectId: string; versionId: string; dataJson: string } | null,
  };
  const tx = {
    uploadedWorkbookFile: {
      findUnique: jest.fn(async () => state.upload),
      update: jest.fn(async ({ data }: { data: Partial<typeof state.upload> }) => Object.assign(state.upload, data)),
    },
    project: {
      findUnique: jest.fn(async () => ({ ...state.project })),
      update: jest.fn(async ({ data }: { data: Partial<typeof state.project> }) => Object.assign(state.project, data)),
    },
    bOQExtractedItem: { findMany: jest.fn(async () => [{
      sourceRowNumber: 7, sheetName: 'BOQ', sectionId: 'section-1', itemNumber: 'BOQ-001', description: 'Concrete', unit: 'm3', quantity: 10,
      totalDirectCost: 15, totalIndirectCost: 5, unitCost: 2, amount: 20,
      section: { sectionName: 'Structural', displayOrder: 3 },
    }]) },
    bOQReviewState: { create: jest.fn(async ({ data }: { data: { projectId: string; versionId: string; dataJson: string } }) => {
      state.reviewState = data;
      return data;
    }) },
    awardedBOQItem: {
      count: jest.fn(async () => state.lines.length),
      create: jest.fn(async ({ data }: { data: Omit<Line, 'id'> }) => {
        const line = { ...data, id: `line-${state.lines.length}` };
        state.lines.push(line);
        return line;
      }),
      findMany: jest.fn(async () => state.lines.map(line => ({ ...line }))),
      updateMany: jest.fn(async ({ data }: { data: Partial<Line> }) => {
        state.lines.forEach(line => Object.assign(line, data));
        return { count: state.lines.length };
      }),
    },
    projectBOQVersion: {
      count: jest.fn(async () => state.version ? 1 : 0),
      create: jest.fn(async ({ data }: { data: Omit<Version, 'id'> }) => {
        state.version = { ...data, id: 'version-1' };
        return state.version;
      }),
      findFirst: jest.fn(async () => state.version && { ...state.version }),
      update: jest.fn(async ({ data }: { data: Partial<Version> }) => Object.assign(state.version!, data)),
    },
    projectSchedule: {
      findMany: jest.fn(async () => [{ id: 'schedule-1', workflowStatus: 'AI_GENERATED_DRAFT', rowVersion: 2 }]),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    auditLog: { create: jest.fn(async () => ({})) },
    workbookExtractionAudit: { create: jest.fn(async () => ({})) },
  };
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  return { state, tx };
}

beforeEach(() => jest.resetAllMocks());

test('requires a corrected upload after it was returned for correction', async () => {
  const { state, tx } = harness();
  state.upload.commitStatus = 'RETURNED_FOR_CORRECTION';
  await expect(commitTemplateToBOQ('upload-1', 'project-1', 'actor')).rejects.toThrow('corrected workbook');
  expect(tx.awardedBOQItem.create).not.toHaveBeenCalled();
});

test('imports an editable draft and captures source metadata in the same transaction', async () => {
  const { state, tx } = harness();

  await expect(commitTemplateToBOQ('upload-1', 'project-1', 'approver-1')).resolves.toMatchObject({ success: true, count: 1, status: 'DRAFT', versionId: 'version-1' });

  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15000, timeout: 30000,
  });
  expect(tx.bOQExtractedItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { uploadedWorkbookFileId: 'upload-1', projectId: 'project-1' },
  }));
  expect(tx.awardedBOQItem.create).toHaveBeenCalledTimes(1);
  expect(tx.awardedBOQItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    projectId: 'project-1', itemCode: 'BOQ-001', description: 'Concrete', quantity: 10,
    totalCost: 20, status: 'DRAFT',
  }) });
  expect(state.lines[0]).toMatchObject({ itemCode: 'BOQ-001', category: 'Structural', quantity: 10, totalCost: 20, status: 'DRAFT' });
  expect(state.version).toMatchObject({
    status: 'DRAFT', checksum: buildDraftBOQChecksum(state.lines), committedBy: 'approver-1',
  });
  expect(state.project.boqLocked).toBe(false);
  expect(tx.project.update).not.toHaveBeenCalled();
  expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
  expect(tx.auditLog.create).not.toHaveBeenCalled();
  expect(state.reviewState).not.toBeNull();
  const review = JSON.parse(state.reviewState!.dataJson);
  expect(review.source.originalRows[0]).toMatchObject({ sourceRowNumber: 7, itemId: 'line-0', sourceUnitCost: '2', itemCode: 'BOQ-001' });
  expect(review.sectionIdentityByItemId['line-0']).toEqual({ id: 'section-1', name: 'Structural', order: 3 });
  expect(tx.workbookExtractionAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    action: 'COMMIT_TO_BOQ_DRAFT', uploadedWorkbookFileId: 'upload-1', projectId: 'project-1', performedBy: 'approver-1',
  }) });
  expect(state.upload.commitStatus).toBe('COMMITTED');
});

test.each(['validationStatus', 'extractionStatus'] as const)('rejects unsuccessful %s before importing', async field => {
  const { state, tx } = harness();
  state.upload[field] = 'FAILED';
  await expect(commitTemplateToBOQ('upload-1', 'project-1', 'actor')).rejects.toThrow('validation errors');
  expect(tx.awardedBOQItem.create).not.toHaveBeenCalled();
  expect(tx.uploadedWorkbookFile.update).not.toHaveBeenCalled();
});

test.each(['locked', 'existing lines', 'existing version'])('rejects a project with %s before importing', async reason => {
  const { state, tx } = harness();
  if (reason === 'locked') state.project.boqLocked = true;
  if (reason === 'existing lines') tx.awardedBOQItem.count.mockResolvedValue(1);
  if (reason === 'existing version') tx.projectBOQVersion.count.mockResolvedValue(1);
  await expect(commitTemplateToBOQ('upload-1', 'project-1', 'actor')).rejects.toThrow('already has a BOQ');
  expect(tx.awardedBOQItem.create).not.toHaveBeenCalled();
});

test('rejects cross-project uploads before reading or writing that project', async () => {
  const { tx } = harness();
  await expect(commitTemplateToBOQ('upload-1', 'other-project', 'actor')).rejects.toThrow('not found for this project');
  expect(tx.project.findUnique).not.toHaveBeenCalled();
  expect(tx.awardedBOQItem.create).not.toHaveBeenCalled();
});

test('rejects totals that differ from the contract before inserting BOQ lines', async () => {
  const { state, tx } = harness();
  state.project.contractAmount = 21;
  await expect(commitTemplateToBOQ('upload-1', 'project-1', 'actor')).rejects.toThrow('match the project contract');
  expect(tx.awardedBOQItem.create).not.toHaveBeenCalled();
});

test('draft import does not lock the project or update schedule pins', async () => {
  const { tx } = harness();
  await expect(commitTemplateToBOQ('upload-1', 'project-1', 'actor')).resolves.toMatchObject({ success: true, status: 'DRAFT' });
  expect(tx.project.update).not.toHaveBeenCalled();
  expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
  expect(tx.uploadedWorkbookFile.update).toHaveBeenCalledWith({ where: { id: 'upload-1' }, data: { commitStatus: 'COMMITTED' } });
});

test('a repeated successful import returns idempotently without creating another BOQ or audit', async () => {
  const { tx } = harness();
  await commitTemplateToBOQ('upload-1', 'project-1', 'actor');
  await expect(commitTemplateToBOQ('upload-1', 'project-1', 'actor')).resolves.toEqual({ success: true, alreadyCommitted: true, count: 0 });
  expect(tx.awardedBOQItem.create).toHaveBeenCalledTimes(1);
  expect(tx.projectBOQVersion.create).toHaveBeenCalledTimes(1);
  expect(tx.bOQReviewState.create).toHaveBeenCalledTimes(1);
  expect(tx.workbookExtractionAudit.create).toHaveBeenCalledTimes(1);
});

test('requires authenticated identity before opening a transaction', async () => {
  harness();
  await expect(commitTemplateToBOQ('upload-1', 'project-1', '')).rejects.toThrow('authenticated');
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
