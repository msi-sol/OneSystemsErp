import { NextResponse } from 'next/server';
import { runAIOrchestrator } from '@/lib/scheduling/aiOrchestrator';
import { getSessionActor, checkSchedulingAccess } from '@/lib/scheduling/authUtils';
import { prisma } from '@/lib/prisma';
import { EDITABLE_STATUSES } from '@/lib/scheduling/scheduleWorkflow';
import { ProjectScheduleWorkflowStatus } from '@prisma/client';
import * as crypto from 'crypto';

const RETIRED_STATUSES: ProjectScheduleWorkflowStatus[] = [
  ProjectScheduleWorkflowStatus.SUPERSEDED_BASELINE,
  ProjectScheduleWorkflowStatus.ARCHIVED_BASELINE,
  ProjectScheduleWorkflowStatus.REJECTED,
];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    
    // 1. Session & PBAC
    let actor;
    try {
      actor = await getSessionActor();
    } catch (e) {
      // A sessionless run acts as a project manager, so it must never be reachable in production.
      if (process.env.SCHEDULING_GENERATION_MODE === 'RECONSTRUCTION_GATE_8C' && process.env.NODE_ENV !== 'production') {
          actor = await prisma.user.findFirst({ where: { role: 'PROJECT_MANAGER' } });
          if (!actor) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
      } else {
          return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
      }
    }

    const pbac = await checkSchedulingAccess(actor.id, actor.role, projectId, 'canEditDraft');
    if (!pbac.allowed) {
      return NextResponse.json({ error: 'FORBIDDEN_PROJECT_ACCESS' }, { status: 403 });
    }

    const body = await req.json();
    const idempotencyKey = body.idempotencyKey;
    const lockedBOQVersionId = body.lockedBOQVersionId;
    
    // 2. Enforce explicit Idempotency for Gate 8C
    if (process.env.SCHEDULING_GENERATION_MODE === 'RECONSTRUCTION_GATE_8C') {
        const expectedKey = `GATE8C:GENERATE:${projectId}:514c4bd4a7b188391c5ec7f04f198c2963035021a94b295a7b15d408ba831e17`;
        if (idempotencyKey !== expectedKey) {
            return NextResponse.json({ error: 'INVALID_IDEMPOTENCY_KEY' }, { status: 400 });
        }
    }

    // Idempotency check in DB
    if (idempotencyKey) {
      const existing = await prisma.scheduleGenerationAudit.findFirst({
         where: { generationRequestId: idempotencyKey, resultStatus: 'SUCCESS' }
      });
      if (existing) {
         return NextResponse.json({ 
           success: true, 
           message: 'Idempotent replay: Schedule already generated successfully.',
           scheduleId: existing.newScheduleId
         });
      }
    }

    // Generating retires every existing schedule, and the hub then hides them. A draft right may only replace drafts.
    const scheduleInProgress = await prisma.projectSchedule.findFirst({
      where: {
        projectId,
        workflowStatus: { notIn: [...EDITABLE_STATUSES, ...RETIRED_STATUSES] },
        status: { not: 'LEGACY_INVALID_DRAFT' },
      },
      select: { id: true },
    });
    if (scheduleInProgress) {
      return NextResponse.json({ error: 'SCHEDULE_PAST_DRAFT: This project has a schedule past drafting. Create a revision instead of generating a new schedule.' }, { status: 409 });
    }

    // 3. Locked BOQ Validation
    const activeVersion = await prisma.projectBOQVersion.findFirst({
        where: { projectId, status: 'LOCKED' }
    });
    
    if (!activeVersion) {
        return NextResponse.json({ error: 'MISSING_LOCKED_BOQ_VERSION' }, { status: 400 });
    }

    if (lockedBOQVersionId && activeVersion.id !== lockedBOQVersionId) {
        return NextResponse.json({ error: 'BOQ_VERSION_MISMATCH' }, { status: 400 });
    }

    const generationRequestId = idempotencyKey || crypto.randomUUID();

    const result = await runAIOrchestrator({
      projectId,
      generationRequestId,
      userId: actor.id,
      consolidateBoq: body.consolidateBoq ?? true,
      lockedBOQVersionId: activeVersion.id
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Schedule successfully generated and balanced using Universal AI Orchestrator.',
      scheduleId: (result as any).scheduleId,
      reconciliation: { diff: (result as any).difference },
      validationMetrics: (result as any).validationMetrics,
      feasibilityFlags: (result as any).feasibilityFlags
    });
    
  } catch (error: any) {
    console.error('Error in AI simulation route:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
