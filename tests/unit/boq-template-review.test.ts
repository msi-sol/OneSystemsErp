jest.mock('@/lib/prisma', () => ({ prisma: { uploadedWorkbookFile: { findUnique: jest.fn() }, $transaction: jest.fn() } }));
jest.mock('@/lib/scheduling/authUtils', () => ({ getSessionActor: jest.fn(), checkSchedulingAccess: jest.fn() }));

import { prisma } from '@/lib/prisma';
import { checkSchedulingAccess, getSessionActor } from '@/lib/scheduling/authUtils';
import { updateTemplateUploadReviewStatus } from '@/lib/boq/template-review';

type Upload = {
  id: string;
  projectId: string;
  validationStatus: string;
  extractionStatus: string;
  commitStatus: string;
};

function setup(uploadOverrides: Partial<Upload> = {}, updateCount = 1) {
  const upload: Upload = {
    id: 'upload-1',
    projectId: 'project-1',
    validationStatus: 'SUCCESS',
    extractionStatus: 'SUCCESS',
    commitStatus: 'PENDING',
    ...uploadOverrides,
  };
  const tx = {
    uploadedWorkbookFile: {
      updateMany: jest.fn(async () => ({ count: updateCount })),
    },
    workbookExtractionAudit: {
      create: jest.fn(async () => ({})),
    },
  };
  (prisma.uploadedWorkbookFile.findUnique as jest.Mock).mockResolvedValue(upload);
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx));
  (getSessionActor as jest.Mock).mockResolvedValue({ id: 'actor-1', role: 'PROJECT_DIRECTOR', name: 'Reviewer' });
  (checkSchedulingAccess as jest.Mock).mockResolvedValue({ allowed: true, projectRole: 'PROJECT_DIRECTOR' });
  return { upload, tx };
}

beforeEach(() => jest.resetAllMocks());

test.each(['PENDING', 'RETURNED_FOR_CORRECTION'])('submits a %s upload after successful validation and extraction', async (commitStatus) => {
  const { tx } = setup({ commitStatus });

  await expect(updateTemplateUploadReviewStatus('upload-1', 'SUBMIT_FOR_REVIEW'))
    .resolves.toEqual({ success: true, status: 'SUBMITTED_FOR_REVIEW' });

  expect(checkSchedulingAccess).toHaveBeenCalledWith('actor-1', 'PROJECT_DIRECTOR', 'project-1', 'canEdit');
  expect(tx.uploadedWorkbookFile.updateMany).toHaveBeenCalledWith({
    where: { id: 'upload-1', commitStatus },
    data: { commitStatus: 'SUBMITTED_FOR_REVIEW' },
  });
  expect(tx.workbookExtractionAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    uploadedWorkbookFileId: 'upload-1', projectId: 'project-1', action: 'SUBMITTED_FOR_REVIEW',
    status: 'SUCCESS', performedBy: 'actor-1', performedByRole: 'PROJECT_DIRECTOR',
  }) });
});

test.each(['PENDING', 'SUBMITTED_FOR_REVIEW'])('returns a %s upload for correction with approval access', async (commitStatus) => {
  const { tx } = setup({ commitStatus });

  await expect(updateTemplateUploadReviewStatus('upload-1', 'RETURN_FOR_CORRECTION'))
    .resolves.toEqual({ success: true, status: 'RETURNED_FOR_CORRECTION' });

  expect(checkSchedulingAccess).toHaveBeenCalledWith('actor-1', 'PROJECT_DIRECTOR', 'project-1', 'canApprove');
  expect(tx.uploadedWorkbookFile.updateMany).toHaveBeenCalledWith({
    where: { id: 'upload-1', commitStatus },
    data: { commitStatus: 'RETURNED_FOR_CORRECTION' },
  });
  expect(tx.workbookExtractionAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    action: 'RETURNED_FOR_CORRECTION', performedBy: 'actor-1', projectId: 'project-1',
  }) });
});

test('requires an authenticated actor before loading the upload', async () => {
  (getSessionActor as jest.Mock).mockRejectedValue(new Error('UNAUTHORIZED'));
  await expect(updateTemplateUploadReviewStatus('upload-1', 'SUBMIT_FOR_REVIEW')).rejects.toThrow('UNAUTHORIZED');
  expect(prisma.uploadedWorkbookFile.findUnique).not.toHaveBeenCalled();
});

test('rejects missing uploads', async () => {
  setup();
  (prisma.uploadedWorkbookFile.findUnique as jest.Mock).mockResolvedValue(null);
  await expect(updateTemplateUploadReviewStatus('missing', 'SUBMIT_FOR_REVIEW'))
    .rejects.toMatchObject({ code: 'UPLOAD_NOT_FOUND' });
  expect(checkSchedulingAccess).not.toHaveBeenCalled();
});

test('requires edit permission to submit and approval permission to return', async () => {
  const { tx } = setup();
  (checkSchedulingAccess as jest.Mock).mockResolvedValue({ allowed: false });

  await expect(updateTemplateUploadReviewStatus('upload-1', 'SUBMIT_FOR_REVIEW'))
    .rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(tx.uploadedWorkbookFile.updateMany).not.toHaveBeenCalled();
  expect(tx.workbookExtractionAudit.create).not.toHaveBeenCalled();
});

test.each([
  ['validationStatus', { validationStatus: 'FAILED' }],
  ['extractionStatus', { extractionStatus: 'FAILED' }],
])('rejects submission when %s did not succeed', async (_field, overrides) => {
  const { tx } = setup(overrides);
  await expect(updateTemplateUploadReviewStatus('upload-1', 'SUBMIT_FOR_REVIEW'))
    .rejects.toMatchObject({ code: 'UPLOAD_NOT_READY' });
  expect(tx.uploadedWorkbookFile.updateMany).not.toHaveBeenCalled();
  expect(tx.workbookExtractionAudit.create).not.toHaveBeenCalled();
});

test('rejects committed uploads without changing state or auditing', async () => {
  const { tx } = setup({ commitStatus: 'COMMITTED' });
  await expect(updateTemplateUploadReviewStatus('upload-1', 'RETURN_FOR_CORRECTION'))
    .rejects.toMatchObject({ code: 'UPLOAD_COMMITTED' });
  expect(tx.uploadedWorkbookFile.updateMany).not.toHaveBeenCalled();
  expect(tx.workbookExtractionAudit.create).not.toHaveBeenCalled();
});

test.each([
  ['SUBMITTED_FOR_REVIEW', 'SUBMIT_FOR_REVIEW'],
  ['RETURNED_FOR_CORRECTION', 'RETURN_FOR_CORRECTION'],
] as const)('rejects invalid transition from %s', async (commitStatus, action) => {
  const { tx } = setup({ commitStatus });
  await expect(updateTemplateUploadReviewStatus('upload-1', action))
    .rejects.toMatchObject({ code: 'INVALID_REVIEW_TRANSITION' });
  expect(tx.uploadedWorkbookFile.updateMany).not.toHaveBeenCalled();
});

test('rolls back the audit when compare-and-set detects a concurrent change', async () => {
  const { tx } = setup({ commitStatus: 'SUBMITTED_FOR_REVIEW' }, 0);
  await expect(updateTemplateUploadReviewStatus('upload-1', 'RETURN_FOR_CORRECTION'))
    .rejects.toMatchObject({ code: 'REVIEW_STATUS_CONFLICT' });
  expect(tx.workbookExtractionAudit.create).not.toHaveBeenCalled();
});
