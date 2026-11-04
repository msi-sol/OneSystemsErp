import { prisma } from '@/lib/prisma';
import { checkSchedulingAccess, getSessionActor } from '@/lib/scheduling/authUtils';

export type TemplateReviewAction = 'SUBMIT_FOR_REVIEW' | 'RETURN_FOR_CORRECTION';
export type TemplateReviewStatus = 'SUBMITTED_FOR_REVIEW' | 'RETURNED_FOR_CORRECTION';

export class TemplateReviewError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'TemplateReviewError';
  }
}

const allowedPreviousStatuses: Record<TemplateReviewAction, string[]> = {
  SUBMIT_FOR_REVIEW: ['PENDING', 'RETURNED_FOR_CORRECTION'],
  RETURN_FOR_CORRECTION: ['PENDING', 'SUBMITTED_FOR_REVIEW'],
};

const nextStatuses: Record<TemplateReviewAction, TemplateReviewStatus> = {
  SUBMIT_FOR_REVIEW: 'SUBMITTED_FOR_REVIEW',
  RETURN_FOR_CORRECTION: 'RETURNED_FOR_CORRECTION',
};

export async function updateTemplateUploadReviewStatus(
  uploadId: string,
  action: TemplateReviewAction,
) {
  const actor = await getSessionActor();
  if (!Object.prototype.hasOwnProperty.call(allowedPreviousStatuses, action)) {
    throw new TemplateReviewError('Unsupported BOQ upload review action.', 'INVALID_REVIEW_ACTION');
  }
  const upload = await prisma.uploadedWorkbookFile.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      projectId: true,
      validationStatus: true,
      extractionStatus: true,
      commitStatus: true,
    },
  });

  if (!upload) {
    throw new TemplateReviewError('BOQ upload was not found.', 'UPLOAD_NOT_FOUND');
  }

  const permission = action === 'SUBMIT_FOR_REVIEW' ? 'canEdit' : 'canApprove';
  const access = await checkSchedulingAccess(actor.id, actor.role, upload.projectId, permission);
  if (!access.allowed) {
    throw new TemplateReviewError(
      action === 'SUBMIT_FOR_REVIEW'
        ? 'You do not have permission to submit this project BOQ for review.'
        : 'You do not have permission to return this project BOQ for correction.',
      'FORBIDDEN',
    );
  }

  if (upload.commitStatus === 'COMMITTED') {
    throw new TemplateReviewError('A committed BOQ upload cannot change review status.', 'UPLOAD_COMMITTED');
  }

  if (!allowedPreviousStatuses[action].includes(upload.commitStatus)) {
    throw new TemplateReviewError(
      `Cannot ${action === 'SUBMIT_FOR_REVIEW' ? 'submit' : 'return'} a BOQ upload from ${upload.commitStatus}.`,
      'INVALID_REVIEW_TRANSITION',
    );
  }

  if (action === 'SUBMIT_FOR_REVIEW'
    && (upload.validationStatus !== 'SUCCESS' || upload.extractionStatus !== 'SUCCESS')) {
    throw new TemplateReviewError(
      'BOQ upload must pass validation and extraction before it can be submitted for review.',
      'UPLOAD_NOT_READY',
    );
  }

  const status = nextStatuses[action];
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.uploadedWorkbookFile.updateMany({
      where: { id: upload.id, commitStatus: upload.commitStatus },
      data: { commitStatus: status },
    });

    if (changed.count !== 1) {
      throw new TemplateReviewError(
        'BOQ upload review status changed concurrently. Refresh and try again.',
        'REVIEW_STATUS_CONFLICT',
      );
    }

    await tx.workbookExtractionAudit.create({
      data: {
        uploadedWorkbookFileId: upload.id,
        projectId: upload.projectId,
        action: status,
        status: 'SUCCESS',
        message: action === 'SUBMIT_FOR_REVIEW'
          ? 'BOQ upload submitted for review.'
          : 'BOQ upload returned for correction.',
        performedBy: actor.id,
        performedByRole: actor.role,
      },
    });

    return { success: true as const, status };
  });

  return updated;
}
