import { NextResponse } from 'next/server';
import { submitDraftForReview } from '@/lib/services/schedule-workflow.service';
import { getSessionActor, checkSchedulingAccess } from '@/lib/scheduling/authUtils';
import { prisma } from '@/lib/prisma';
import { validateScheduleForReview } from '@/lib/scheduling/scheduleWorkflow';


export async function POST(req: Request, { params }: { params: Promise<{ id: string, scheduleId: string }> }) {
  try {
    const { id: projectId, scheduleId } = await params;
    const body = await req.json();
    const { expectedRowVersion } = body;

    if (typeof expectedRowVersion !== 'number') {
      return NextResponse.json({ error: 'Invalid rowVersion' }, { status: 400 });
    }

    const actor = await getSessionActor();
    const access = await checkSchedulingAccess(actor.id, actor.role, projectId, 'canSubmit');
    if (!access.allowed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const user = await prisma.user.findUnique({ where: { id: actor.id } });
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentSchedule = await prisma.projectSchedule.findUnique({
      where: { id: scheduleId, projectId }
    });

    if (!currentSchedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    if (currentSchedule.workflowStatus !== 'AI_GENERATED_DRAFT') {
      return NextResponse.json({ error: 'WORKFLOW_STATE_CONFLICT' }, { status: 409 });
    }

    if (currentSchedule.rowVersion !== expectedRowVersion) {
      return NextResponse.json({ error: 'CONCURRENT_SCHEDULE_CHANGE' }, { status: 409 });
    }

    const opSession = {
      userId: user.id,
      email: user.email || '',
      sessionVersion: user.sessionVersion,
      accountActive: user.status === 'ACTIVE',
      accountLocked: Boolean(user.lockedUntil && user.lockedUntil > new Date()),
      mustChangePassword: user.mustChangePassword
    };

    // STAGE A: Read-only validation outside transaction
    const validationResult = await validateScheduleForReview({
      projectId,
      scheduleId,
      actorId: actor.id,
      expectedRowVersion,
      tx: prisma
    });

    if (!validationResult || !validationResult.isValid) {
      return NextResponse.json({ 
        error: 'VALIDATION_FAILED',
        errors: validationResult?.errors || [], 
        warnings: validationResult?.warnings || [] 
      }, { status: 400 });
    }

    const idempotencyKey = `SUBMIT_DRAFT_FOR_REVIEW:${scheduleId}:${expectedRowVersion}:${actor.id}`;

    // STAGE B: Short atomic workflow transaction
    const result = await submitDraftForReview(
      projectId,
      scheduleId,
      expectedRowVersion,
      idempotencyKey,
      opSession
    );

    return NextResponse.json({ success: true, ...result });

  } catch (error: any) {
    if (error.name === 'IdempotencyError' || error.name === 'ConcurrencyError' || error.message === 'SCHEDULE_VERSION_CONFLICT') {
      return NextResponse.json({ error: 'CONCURRENT_SCHEDULE_CHANGE' }, { status: 409 });
    }
    if (error.name === 'AuthorizationError') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('Error validating/submitting schedule:', error);
    return NextResponse.json({ error: 'DATABASE_OPERATION_FAILED' }, { status: 500 });
  }
}
