jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn().mockResolvedValue({}) })),
  DeleteObjectCommand: class { constructor(readonly input: unknown) {} },
  GetObjectCommand: class { constructor(readonly input: unknown) {} },
  PutObjectCommand: class { constructor(readonly input: unknown) {} },
}));
jest.mock('@/lib/prisma', () => ({
  prisma: { $transaction: jest.fn() },
  transactionContext: new (jest.requireActual('node:async_hooks').AsyncLocalStorage)(),
}));
jest.mock('@/lib/permissions', () => ({
  hasPermission: jest.fn(async () => true),
  getPermissionsForRole: jest.fn(async () => ({})),
}));
jest.mock('@/lib/boq/workspace-parser', () => ({ parseWorkspaceWorkbook: jest.fn() }));
jest.mock('@/lib/scheduling/planning-capacity', () => ({
  planningCapacity: jest.fn(async () => ({ canView: true, canEdit: true, canApprove: true, canEngineerReview: true })),
}));
jest.mock('@/lib/boq/draft-workflow', () => ({
  approveAndLockDraftBOQ: jest.fn(async () => ({ success: true })),
  buildDraftBOQChecksum: jest.fn(() => 'checksum-1'),
  DraftBOQWorkflowError: class DraftBOQWorkflowError extends Error {
    constructor(readonly code: string, readonly status: number) { super(code); }
  },
}));

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { parseWorkspaceWorkbook } from '@/lib/boq/workspace-parser';
import { confirmBOQWorkspaceUpload, parseWorkspaceContractCandidate } from '@/lib/boq/workspace-service';
import { BOQModuleReviewError, getBOQContractReconciliation, reviewBOQModule } from '@/lib/boq/module-review';
import { createBOQReviewDocument, reviewDocumentJson } from '@/lib/boq/review-state';
import { approveAndLockDraftBOQ } from '@/lib/boq/draft-workflow';

const projectId = 'project-contract-test';
const versionId = 'version-contract-test';

function uploadHarness(existingProject?: { id: string; contractAmount: number }) {
  const awardedItems: Array<Record<string, unknown>> = [];
  let reviewStateDataJson = '';
  const state = { project: existingProject ? { ...existingProject } : null as null | { id: string; contractAmount: number } };
  const tx = {
    uploadedWorkbookFile: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
    },
    project: {
      findUnique: jest.fn(async () => state.project ? { ...state.project, boqLocked: false, status: 'PLANNING' } : null),
      create: jest.fn(async ({ data }: { data: { name: string; contractAmount: number } }) => {
        state.project = { id: projectId, contractAmount: data.contractAmount };
        return { id: projectId };
      }),
    },
    awardedBOQItem: {
      count: jest.fn(async () => 0),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const line = { id: `line-${awardedItems.length + 1}`, ...data };
        awardedItems.push(line);
        return line;
      }),
    },
    projectBOQVersion: { count: jest.fn(async () => 0), create: jest.fn(async () => ({ id: versionId })) },
    bOQExtractedSection: { create: jest.fn(async ({ data }: { data: { sectionName: string; displayOrder: number } }) => ({ id: `section-${data.displayOrder}` })) },
    bOQExtractedItem: { createMany: jest.fn(async () => ({ count: 1 })) },
    bOQReviewState: { create: jest.fn(async ({ data }: { data: { dataJson: string } }) => { reviewStateDataJson = data.dataJson; return { id: 'review-state' }; }) },
    workbookExtractionAudit: { create: jest.fn(async () => ({ id: 'audit' })) },
  };
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback: (tx: typeof tx) => unknown) => callback(tx));
  return { tx, state, getReviewState: () => JSON.parse(reviewStateDataJson) as { contract: { verified: boolean }; finalApproval: unknown } };
}

const parsedAnalysis = {
  analysis: {
    fileName: 'sample.xlsx', fileHash: 'file-hash', selectedSheet: 'BOQ', mapping: { headerRow: 1, itemCode: 1, description: 2, unit: 3, quantity: 4, unitCost: 5, amount: 6 },
    breakdownMapping: {}, columns: [], preview: [], itemCount: 1, total: '100.00', printedTotal: null, errors: [], warnings: [], suggestedProjectName: 'Sample', sheets: [],
  },
  items: [{ sourceRowNumber: 2, section: 'General', sectionSourceKey: 'sec-1', sectionOrder: 1, sectionStartRow: 1, quantityDefaulted: false, unitDefaulted: false, itemCodeSynthesized: false,
    sourceUnitCost: 100, rateDerived: false, itemCode: '1', description: 'Work', unit: 'lot', quantity: 1, unitCost: 100, amount: 100 }],
};

describe('BOQ contract mismatch workflow', () => {
  const previousAws = { bucket: process.env.AWS_S3_BUCKET_NAME, access: process.env.AWS_ACCESS_KEY_ID, secret: process.env.AWS_SECRET_ACCESS_KEY };
  const previousNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'production';
    process.env.AWS_S3_BUCKET_NAME = 'unit-test-bucket';
    process.env.AWS_ACCESS_KEY_ID = 'unit-test-access';
    process.env.AWS_SECRET_ACCESS_KEY = 'unit-test-secret';
    (parseWorkspaceWorkbook as jest.Mock).mockResolvedValue(parsedAnalysis);
  });

  afterAll(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousAws.bucket === undefined) delete process.env.AWS_S3_BUCKET_NAME; else process.env.AWS_S3_BUCKET_NAME = previousAws.bucket;
    if (previousAws.access === undefined) delete process.env.AWS_ACCESS_KEY_ID; else process.env.AWS_ACCESS_KEY_ID = previousAws.access;
    if (previousAws.secret === undefined) delete process.env.AWS_SECRET_ACCESS_KEY; else process.env.AWS_SECRET_ACCESS_KEY = previousAws.secret;
  });

  test('new draft imports accept a positive mismatch and preserve both the entered contract and BOQ total', async () => {
    const { tx, state, getReviewState } = uploadHarness();
    const result = await confirmBOQWorkspaceUpload({
      actor: { id: 'actor', role: 'SUPER_ADMIN' }, buffer: Buffer.from('synthetic'), fileName: 'sample.xlsx', expectedFileHash: 'file-hash',
      selectedSheet: 'BOQ', mapping: parsedAnalysis.analysis.mapping, projectId: null, projectName: 'Sample project', projectContractAmount: '120.00',
    });
    expect(result.success).toBe(true);
    expect(state.project?.contractAmount).toBe(120);
    expect(tx.project.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ contractAmount: 120 }) }));
    expect(tx.projectBOQVersion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DRAFT', totalAmount: 100 }) }));
    expect(getReviewState().contract.verified).toBe(false);
    expect(getReviewState().finalApproval).toBeFalsy();
    expect(parseWorkspaceContractCandidate('120.00').toString()).toBe('120');
    expect(() => parseWorkspaceContractCandidate('0')).toThrow('positive safe amount');
  });

  test('existing project mismatch imports as a draft without replacing its contract amount', async () => {
    const { tx, state } = uploadHarness({ id: projectId, contractAmount: 130 });
    const result = await confirmBOQWorkspaceUpload({
      actor: { id: 'actor', role: 'SUPER_ADMIN' }, buffer: Buffer.from('synthetic'), fileName: 'sample.xlsx', expectedFileHash: 'file-hash',
      selectedSheet: 'BOQ', mapping: parsedAnalysis.analysis.mapping, projectId, projectName: '', projectContractAmount: '100.00',
    });
    expect(result.success).toBe(true);
    expect(state.project?.contractAmount).toBe(130);
    expect(tx.project.create).not.toHaveBeenCalled();
  });

  test('contract verification records an explicit mismatch without changing either amount', async () => {
    const { tx, project, lines, state } = reviewHarness({ contractAmount: 125, contractVerified: false });
    const result = await reviewBOQModule(projectId, { id: 'manager', role: 'PROJECT_MANAGER' }, {
      action: 'verify-contract', versionId, expectedRowVersion: 2, reason: 'Checked against signed contract.',
    });
    expect(result).toMatchObject({ reconciliation: { contractValue: '125.00', boqTotal: '100.00', difference: '25.00', reconciles: false } });
    expect(project.contractAmount).toBe(125);
    expect(lines.reduce((sum, item) => sum + Number(item.totalCost), 0)).toBe(100);
    expect(tx.project.update).not.toHaveBeenCalled();
    expect(JSON.parse(state.dataJson).contract).toMatchObject({ verified: true, verificationReason: 'Checked against signed contract.' });
  });

  test('Engineer review remains tied to the same checksum, while PM approval refuses a mismatch', async () => {
    reviewHarness({ contractAmount: 125, contractVerified: true });
    const reviewer = await reviewBOQModule(projectId, { id: 'engineer', role: 'PROJECT_ENGINEER' }, {
      action: 'review', versionId, expectedChecksum: 'checksum-1', comments: 'Reviewed this BOQ draft.', expectedRowVersion: 2,
    });
    expect(reviewer).toMatchObject({ status: 'ENGINEERING_REVIEWED' });

    const approval = reviewHarness({ contractAmount: 125, contractVerified: true, reviewedChecksum: 'checksum-1' });
    let approvalError: unknown;
    try {
      await reviewBOQModule(projectId, { id: 'manager', role: 'PROJECT_MANAGER' }, {
        action: 'approve', versionId, expectedChecksum: 'checksum-1', expectedRowVersion: 2,
      });
    } catch (error) { approvalError = error; }
    expect(approvalError).toBeInstanceOf(BOQModuleReviewError);
    expect((approvalError as BOQModuleReviewError).status).toBe(400);
    expect((approvalError as Error).message).toContain('PM approval is blocked');
    expect(approveAndLockDraftBOQ).not.toHaveBeenCalled();
    expect(approval.tx.bOQReviewState.updateMany).not.toHaveBeenCalled();
  });

  test('matching PM approval still requires and accepts the engineer checksum review', async () => {
    const approval = reviewHarness({ contractAmount: 100, contractVerified: true, reviewedChecksum: 'checksum-1' });
    const result = await reviewBOQModule(projectId, { id: 'manager', role: 'PROJECT_MANAGER' }, {
      action: 'approve', versionId, expectedChecksum: 'checksum-1', expectedRowVersion: 2,
    });
    expect(result).toMatchObject({ success: true, status: 'APPROVED' });
    expect(approveAndLockDraftBOQ).toHaveBeenCalledTimes(1);
    expect(approval.tx.bOQReviewState.updateMany).toHaveBeenCalledTimes(1);
  });

  test('reconciliation reports the preserved values and exact difference', () => {
    expect(getBOQContractReconciliation(new Prisma.Decimal('120.50'), new Prisma.Decimal('100.25'))).toEqual({
      contractValue: '120.50', boqTotal: '100.25', difference: '20.25', reconciles: false,
    });
  });
});

function reviewHarness(input: { contractAmount: number; contractVerified: boolean; reviewedChecksum?: string }) {
  const lines = [{ id: 'line-1', itemCode: '1', category: 'General', description: 'Work', unit: 'lot', quantity: 1, combinedUnitCost: 100, totalCost: 100 }];
  const project = { id: projectId, contractAmount: input.contractAmount, status: 'PLANNING', boqLocked: false };
  const document = createBOQReviewDocument({ projectId, versionId, uploadId: 'upload', fileName: 'sample.xlsx', fileHash: 'file-hash', selectedSheet: 'BOQ', mapping: {}, breakdownMapping: {}, rows: [] });
  document.contract = input.contractVerified ? { verified: true, verifiedBy: 'manager', verifiedAt: '2026-11-05T00:00:00.000Z', verificationReason: 'Checked.' } : document.contract;
  const state = { id: 'review-state', projectId, versionId, rowVersion: 2, dataJson: reviewDocumentJson(document) };
  const auditRows: Array<Record<string, unknown>> = input.reviewedChecksum ? [{ transactionId: versionId, actionType: 'BOQ_WORKSPACE_ENGINEERING_REVIEW', newValue: JSON.stringify({ checksum: input.reviewedChecksum }), createdAt: new Date() }] : [];
  const tx = {
    projectBOQVersion: { findFirst: jest.fn(async () => ({ id: versionId, projectId, versionNumber: 1, status: 'DRAFT', checksum: 'checksum-1' })) },
    project: { findUnique: jest.fn(async () => project), update: jest.fn(async () => project) },
    bOQReviewState: { findFirst: jest.fn(async () => state), updateMany: jest.fn(async ({ data }: { data: { dataJson: string; rowVersion: { increment: number } } }) => { state.dataJson = data.dataJson; state.rowVersion += data.rowVersion.increment; return { count: 1 }; }) },
    awardedBOQItem: { findMany: jest.fn(async () => lines) },
    auditLog: {
      findFirst: jest.fn(async () => auditRows.at(-1) ?? null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => { auditRows.push(data); return data; }),
    },
    uploadedWorkbookFile: { updateMany: jest.fn(async () => ({ count: 1 })) },
  };
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback: (tx: typeof tx) => unknown) => callback(tx));
  return { run: tx, tx, state, lines, project };
}
