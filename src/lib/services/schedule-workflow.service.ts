import { Prisma } from '@prisma/client';
import { transactionContext, prisma } from '@/lib/prisma';
import { executeStartTechnicalReviewMutation, executeAddRequiredReviewCommentsMutation, executeAddFinanceReviewCommentMutation, executeBaselineActivationMutation } from '@/lib/services/schedule-gateway';
import { assertLegacySchedulingWorkflow } from '@/lib/scheduling/scheduleWorkflow';
import crypto from 'crypto';

export type OperationalSession = {
  userId: string;
  email: string;
  sessionVersion: number;
  accountActive: boolean;
  accountLocked: boolean;
  mustChangePassword: boolean;
};

export class IdempotencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyError';
  }
}

export class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrencyError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

function hashIdempotencyKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function submitDraftForReview(
  projectId: string,
  scheduleId: string,
  expectedRowVersion: number,
  idempotencyKey: string,
  actor: OperationalSession
) {
  if (!actor.accountActive || actor.accountLocked || actor.mustChangePassword) {
    throw new AuthorizationError('Invalid or locked account.');
  }

  // 1. Verify Project Assignment and PBAC
  const assignment = await prisma.projectUserAssignment.findFirst({
    where: {
      projectId,
      userId: actor.userId,
      assignmentStatus: 'active',
    }
  });

  // Example constraint: Engineer must submit
  if (!assignment || !['SITE_ENGINEER', 'PROJECT_ENGINEER'].includes(assignment.projectRole)) {
    throw new AuthorizationError('Actor is not authorized to submit draft for review.');
  }

  const idempotencyKeyHash = hashIdempotencyKey(idempotencyKey);
  const action = 'SUBMIT_DRAFT_FOR_REVIEW';

  // Establish provenance before Prisma creates the transaction client so its
  // extension callbacks capture the same workflow context as the service.
  return transactionContext.run({ sourceProvenance: 'GATE9_WORKFLOW_ENGINE' }, () => prisma.$transaction(async (tx) => {
      // Idempotency Check
    const existing = await tx.scheduleWorkflowTransition.findUnique({
      where: {
        scheduleId_action_idempotencyKeyHash: {
          scheduleId,
          action,
          idempotencyKeyHash,
        },
      },
    });

    if (existing) {
      if (
        existing.projectId === projectId &&
        existing.fromStatus === 'AI_GENERATED_DRAFT' &&
        existing.toStatus === 'READY_FOR_REVIEW' &&
        existing.actorUserId === actor.userId &&
        existing.expectedRowVersion === expectedRowVersion &&
        existing.resultingRowVersion === expectedRowVersion + 1
      ) {
        return { status: 'IDEMPOTENT_SUCCESS', transition: existing };
      }
      throw new IdempotencyError('IDEMPOTENCY_CONFLICT');
    }

    // Verify current status
    const currentSchedule = await tx.projectSchedule.findUnique({
      where: { id: scheduleId, projectId },
    });

    if (!currentSchedule) {
      throw new Error('Schedule not found');
    }

    assertLegacySchedulingWorkflow(currentSchedule);

    if (currentSchedule.workflowStatus !== 'AI_GENERATED_DRAFT') {
      throw new Error(`Invalid status transition from ${currentSchedule.workflowStatus}`);
    }

    // Optimistic Concurrency Update
    const updateResult = await tx.projectSchedule.updateMany({
      where: {
        id: scheduleId,
        projectId,
        workflowStatus: 'AI_GENERATED_DRAFT',
        rowVersion: expectedRowVersion,
      },
      data: {
        workflowStatus: 'READY_FOR_REVIEW',
        rowVersion: { increment: 1 },
      },
    });

    if (updateResult.count !== 1) {
      throw new ConcurrencyError('Concurrency error: Expected row version or status mismatch.');
    }

    const newRowVersion = expectedRowVersion + 1;

    // Create Operational Transition Record
    const transition = await tx.scheduleWorkflowTransition.create({
      data: {
        projectId,
        scheduleId,
        action,
        fromStatus: 'AI_GENERATED_DRAFT',
        toStatus: 'READY_FOR_REVIEW',
        actorUserId: actor.userId,
        actorSessionVersion: actor.sessionVersion,
        expectedRowVersion,
        resultingRowVersion: newRowVersion,
        idempotencyKeyHash,
      },
    });

    // Create Audit Log
    await tx.auditLog.create({
      data: {
        actionType: 'SCHEDULE_SUBMITTED_FOR_REVIEW',
        moduleName: 'PROJECT_SCHEDULING',
        userId: actor.userId,
        newValue: JSON.stringify({
          entityType: 'ProjectSchedule',
          entityId: scheduleId,
          projectId,
          action,
          expectedRowVersion,
          newRowVersion,
          idempotencyKeyHash,
        }),
      },
    });

    return { status: 'SUCCESS', transition };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}

export async function startTechnicalReview(
  projectId: string,
  scheduleId: string,
  expectedRowVersion: number,
  idempotencyKey: string,
  actor: OperationalSession
) {
  if (!actor.accountActive || actor.accountLocked || actor.mustChangePassword) {
    throw new AuthorizationError('Invalid or locked account.');
  }

  // Verify PBAC for Project Manager
  const assignment = await prisma.projectUserAssignment.findFirst({
    where: {
      projectId,
      userId: actor.userId,
      assignmentStatus: 'active',
    }
  });

  if (!assignment || assignment.projectRole !== 'PROJECT_MANAGER') {
    throw new AuthorizationError('Actor is not authorized to start technical review.');
  }

  const idempotencyKeyHash = hashIdempotencyKey(idempotencyKey);
  const action = 'START_TECHNICAL_REVIEW';

  return executeStartTechnicalReviewMutation({
    projectId,
    scheduleId,
    expectedRowVersion,
    idempotencyKeyHash,
    actorUserId: actor.userId,
    actorSessionVersion: actor.sessionVersion,
    action,
  });
}

export async function addRequiredReviewComments(
  projectId: string,
  scheduleId: string,
  expectedRowVersion: number,
  actor: OperationalSession
) {
  if (!actor.accountActive || actor.accountLocked || actor.mustChangePassword) {
    throw new AuthorizationError('Invalid or locked account.');
  }

  const assignment = await prisma.projectUserAssignment.findFirst({
    where: {
      projectId,
      userId: actor.userId,
      assignmentStatus: 'active',
    }
  });

  if (!assignment || assignment.projectRole !== 'PROJECT_MANAGER') {
    throw new AuthorizationError('Actor is not authorized to add manager review comments.');
  }

  const user = await prisma.user.findUnique({ where: { id: actor.userId } });
  const name = user?.name || user?.email || 'Unknown';

  return executeAddRequiredReviewCommentsMutation({
    projectId,
    scheduleId,
    expectedRowVersion,
    actorUserId: actor.userId,
    actorRoleSnapshot: assignment.projectRole,
    actorNameSnapshot: name,
  });
}

export async function addFinanceReviewComment(
  projectId: string,
  scheduleId: string,
  expectedRowVersion: number,
  actor: OperationalSession
) {
  if (!actor.accountActive || actor.accountLocked || actor.mustChangePassword) {
    throw new AuthorizationError('Invalid or locked account.');
  }

  const assignment = await prisma.projectUserAssignment.findFirst({
    where: {
      projectId,
      userId: actor.userId,
      assignmentStatus: 'active',
    }
  });

  if (!assignment || assignment.projectRole !== 'FINANCE_OFFICER') {
    throw new AuthorizationError('Actor is not authorized to add finance review comment.');
  }

  const user = await prisma.user.findUnique({ where: { id: actor.userId } });
  const name = user?.name || user?.email || 'Unknown';

  return executeAddFinanceReviewCommentMutation({
    projectId,
    scheduleId,
    expectedRowVersion,
    actorUserId: actor.userId,
    actorRoleSnapshot: assignment.projectRole,
    actorNameSnapshot: name,
  });
}

export async function activateScheduleBaseline(
  projectId: string,
  scheduleId: string,
  expectedRowVersion: number,
  idempotencyKey: string,
  actor: OperationalSession
) {
  if (!actor.accountActive || actor.accountLocked || actor.mustChangePassword) {
    throw new AuthorizationError('Invalid or locked account.');
  }

  // Verify PBAC for Director roles via explicit project assignment
  const assignment = await prisma.projectUserAssignment.findFirst({
    where: {
      projectId,
      userId: actor.userId,
      assignmentStatus: 'active',
    }
  });

  if (!assignment || (assignment.projectRole !== 'DIRECTORS' && assignment.projectRole !== 'PROJECT_DIRECTOR')) {
    throw new AuthorizationError('Actor is not authorized to activate baseline.');
  }

  const user = await prisma.user.findUnique({ where: { id: actor.userId } });
  const name = user?.name || user?.email || 'Unknown';
  
  const requestFingerprint = crypto.createHash('sha256').update(JSON.stringify({ 
    operation: 'activateScheduleBaseline', 
    projectId, 
    scheduleId, 
    actorId: actor.userId, 
    expectedRowVersion 
  })).digest('hex');

  return executeBaselineActivationMutation({
    projectId,
    scheduleId,
    expectedRowVersion,
    actorUserId: actor.userId,
    actorRoleSnapshot: assignment.projectRole,
    actorNameSnapshot: name,
    idempotencyKey,
    requestFingerprint
  });
}

