jest.mock('@/lib/prisma', () => ({
  prisma: {
    project: { findUnique: jest.fn() }, projectBOQVersion: { findFirst: jest.fn(), update: jest.fn() },
    bOQReviewState: { findFirst: jest.fn(), updateMany: jest.fn() }, uploadedWorkbookFile: { findFirst: jest.fn() },
    awardedBOQItem: { findMany: jest.fn(), update: jest.fn() }, projectSchedule: { findMany: jest.fn() }, auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  },
  transactionContext: new (jest.requireActual('node:async_hooks').AsyncLocalStorage)(),
}));
jest.mock('@/lib/scheduling/planning-capacity', () => ({ planningCapacity: jest.fn(async () => ({ canEdit: true })) }));
jest.mock('@/lib/boq/workspace-service', () => ({ readWorkspaceOriginal: jest.fn(async () => Buffer.from('synthetic workbook')) }));
jest.mock('@/lib/boq/workspace-parser', () => ({
  normalizeWorkspaceMapping: jest.fn((value) => value), normalizeWorkspaceBreakdownMapping: jest.fn((value) => value),
  parseWorkspaceWorkbook: jest.fn(),
}));

import { prisma } from '@/lib/prisma';
import { parseWorkspaceWorkbook } from '@/lib/boq/workspace-parser';
import { applyCorrectedBOQReading, buildBOQSourceItemIdByRow, previewCorrectedBOQReading, BOQReadingWorkflowError } from '@/lib/boq/reading-workflow';
import { buildDraftBOQChecksum, type DraftBOQLine } from '@/lib/boq/draft-workflow';
import { createBOQReviewDocument, type BOQSourceRow } from '@/lib/boq/review-state';

const row = (sourceRowNumber: number, itemId: string | null): BOQSourceRow => ({
  sourceRowNumber, section: 'General', itemId, itemCode: `I-${sourceRowNumber}`, description: 'Work', unit: 'lot',
  quantity: '1', unitCost: '10', amount: '10', breakdown: {},
});

describe('same-version BOQ reading row identity', () => {
  it('retains the canonical association when a re-read temporarily stops recognizing a row', () => {
    const document = createBOQReviewDocument({
      projectId: 'project-a', versionId: 'version-a', uploadId: 'upload-a', fileName: 'boq.xlsx', fileHash: 'hash',
      selectedSheet: 'BOQ', mapping: {}, breakdownMapping: {}, rows: [row(8, 'line-a')],
    });
    document.source.currentRows = [];
    expect(buildBOQSourceItemIdByRow(document).get(8)).toBe('line-a');
  });

  it('uses preserved reading history and prevents one canonical line from mapping to multiple rows', () => {
    const document = createBOQReviewDocument({
      projectId: 'project-a', versionId: 'version-a', uploadId: null, fileName: null, fileHash: null,
      selectedSheet: null, mapping: {}, breakdownMapping: {}, rows: [],
    });
    document.readingHistory.push({
      id: 'reading-1', sourceUploadId: null, fileName: 'boq.xlsx', fileHash: 'hash', selectedSheet: 'BOQ',
      mapping: {}, breakdownMapping: {}, rows: [row(8, 'line-a'), row(9, 'line-a')], conflicts: [], reason: 'Corrected mapping',
      comparison: [], appliedAt: '2026-11-05T00:00:00.000Z', createdAt: '2026-11-05T00:00:00.000Z',
    });
    expect([...buildBOQSourceItemIdByRow(document)]).toEqual([[8, 'line-a']]);
  });
});

function makeApplyHarness() {
  const line: DraftBOQLine & { projectId: string } = {
    id: 'line-a', projectId: 'project-a', itemCode: 'I-8', category: 'Earthworks', description: 'Work', unit: 'm3',
    quantity: 10, combinedUnitCost: 2, totalCost: 20,
  };
  const checksum = buildDraftBOQChecksum([line]);
  const source = { ...row(8, 'line-a'), unit: 'm3' };
  const document = createBOQReviewDocument({
    projectId: 'project-a', versionId: 'version-a', uploadId: 'upload-a', fileName: 'boq.xlsx', fileHash: 'hash-a',
    selectedSheet: 'BOQ', mapping: { headerRow: 1, itemCode: 1, description: 2, unit: 3, quantity: 4, unitCost: 5, amount: 6 },
    breakdownMapping: {}, rows: [source],
  });
  document.revisions.push({ id: 'revision-a', itemId: 'line-a', actorId: 'reviewer', reason: 'Set the saved unit.', before: { unit: 'lot' }, after: { unit: 'm3' }, action: 'LINE_UPDATED', changedFields: ['unit'], createdAt: '2026-11-05T00:00:00.000Z' });
  const state = { id: 'state-a', projectId: 'project-a', versionId: 'version-a', rowVersion: 4, dataJson: JSON.stringify(document) };
  const version = { id: 'version-a', projectId: 'project-a', versionNumber: 1, status: 'DRAFT', checksum };
  const upload = { id: 'upload-a', storagePath: '.runtime/boq-workspace/upload-a.xlsx', originalFilename: 'boq.xlsx', fileHash: 'hash-a' };
  const parsedItem = {
    sourceRowNumber: 8, section: 'Earthworks', sectionSourceKey: 'section-1', sectionOrder: 1, sectionStartRow: 1,
    quantityDefaulted: false, unitDefaulted: false, itemCodeSynthesized: false, sourceUnitCost: 2, rateDerived: false,
    itemCode: 'I-8', description: 'Work', unit: 'kg', quantity: 10, unitCost: 2, amount: 20,
  };
  (prisma.project.findUnique as jest.Mock).mockResolvedValue({ id: 'project-a', status: 'PLANNING', boqLocked: false });
  (prisma.projectBOQVersion.findFirst as jest.Mock).mockResolvedValue(version);
  (prisma.bOQReviewState.findFirst as jest.Mock).mockImplementation(async () => ({ ...state }));
  (prisma.uploadedWorkbookFile.findFirst as jest.Mock).mockResolvedValue(upload);
  (prisma.awardedBOQItem.findMany as jest.Mock).mockImplementation(async () => [{ ...line }]);
  (parseWorkspaceWorkbook as jest.Mock).mockResolvedValue({
    analysis: { fileHash: 'hash-a', errors: [], printedTotal: null }, items: [parsedItem],
  });
  const audits: Array<Record<string, unknown>> = [];
  const tx = {
    project: { findUnique: jest.fn(async () => ({ id: 'project-a', status: 'PLANNING', boqLocked: false })) },
    projectBOQVersion: { findFirst: jest.fn(async () => version), update: jest.fn(async () => version) },
    bOQReviewState: {
      findFirst: jest.fn(async () => ({ ...state })),
      updateMany: jest.fn(async ({ data }: { data: { dataJson: string; rowVersion: { increment: number } } }) => {
        state.dataJson = data.dataJson;
        state.rowVersion += data.rowVersion.increment;
        return { count: 1 };
      }),
    },
    awardedBOQItem: {
      findMany: jest.fn(async () => [{ ...line }]),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(line, data)),
    },
    projectSchedule: { findMany: jest.fn(async () => []) },
    auditLog: { create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data; }) },
  };
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback: (tx: typeof tx) => unknown) => callback(tx));
  return { line, document, state, tx, audits, checksum };
}

describe('corrected reading conflict decisions', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['KEEP_CURRENT', 'm3'],
    ['USE_READING', 'kg'],
  ] as const)('stores %s choice, reason, reviewer and time with the reading audit', async (decision, expectedUnit) => {
    const harness = makeApplyHarness();
    const input = {
      actor: { id: 'engineer-a', role: 'PROJECT_ENGINEER' }, projectId: 'project-a', versionId: 'version-a',
      expectedChecksum: harness.checksum, expectedRowVersion: 4, reason: 'Reviewed the corrected source.',
      conflictDecisions: { 'line-a:unit': { decision, reason: 'Checked the signed unit schedule.' } },
    };
    const preview = await previewCorrectedBOQReading(input);
    expect(preview.preview[0]?.conflicts).toHaveLength(1);
    const result = await applyCorrectedBOQReading({ ...input, expectedPreviewHash: preview.expectedPreviewHash });
    const saved = JSON.parse(harness.state.dataJson) as ReturnType<typeof createBOQReviewDocument>;
    const conflict = saved.readingHistory[0]?.conflicts?.[0];
    expect(result.success).toBe(true);
    expect(harness.line.unit).toBe(expectedUnit);
    expect(conflict).toMatchObject({ decision, decisionReason: 'Checked the signed unit schedule.', decidedBy: 'engineer-a' });
    expect(conflict?.decidedAt).toBe(saved.readingHistory[0]?.appliedAt);
    expect(saved.source.originalRows[0]?.unit).toBe('m3');
    const audit = JSON.parse(String(harness.audits[0]?.newValue)) as { conflicts: Array<Record<string, unknown>> };
    expect(audit.conflicts[0]).toMatchObject({ decision, decisionReason: 'Checked the signed unit schedule.', decidedBy: 'engineer-a' });
  });

  it('rejects a stale review row version before applying or auditing a corrected reading', async () => {
    const harness = makeApplyHarness();
    await expect(applyCorrectedBOQReading({
      actor: { id: 'engineer-a', role: 'PROJECT_ENGINEER' }, projectId: 'project-a', versionId: 'version-a',
      expectedChecksum: harness.checksum, expectedRowVersion: 3, reason: 'Reviewed the corrected source.', expectedPreviewHash: 'unused',
      conflictDecisions: { 'line-a:unit': { decision: 'KEEP_CURRENT', reason: 'Checked the signed unit schedule.' } },
    })).rejects.toBeInstanceOf(BOQReadingWorkflowError);
    expect(harness.tx.bOQReviewState.updateMany).not.toHaveBeenCalled();
    expect(harness.tx.auditLog.create).not.toHaveBeenCalled();
  });
});
