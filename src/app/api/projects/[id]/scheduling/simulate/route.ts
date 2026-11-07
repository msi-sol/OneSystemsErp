import { NextResponse } from 'next/server';
import { runAIOrchestrator } from '@/lib/scheduling/aiOrchestrator';
import { getSessionActor, checkSchedulingAccess } from '@/lib/scheduling/authUtils';
import { prisma } from '@/lib/prisma';
import * as crypto from 'crypto';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    
    // 1. Session & PBAC
    let actor;
    try {
      actor = await getSessionActor();
    } catch (e) {
      if (process.env.SCHEDULING_GENERATION_MODE === 'RECONSTRUCTION_GATE_8C') {
          actor = await prisma.user.findFirst({ where: { role: 'PROJECT_MANAGER' } });
          if (!actor) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
      } else {
          return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
      }
    }

    const pbac = await checkSchedulingAccess(actor.id, actor.role, projectId, 'canEdit');
    if (!pbac.allowed) {
      return NextResponse.json({ error: 'FORBIDDEN_PROJECT_ACCESS' }, { status: 403 });
    }

    // The timeline editor triggers a resimulation with no body; treat that as defaults.
    const body = await req.json().catch(() => ({}));
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

    // 3. Locked BOQ Validation
    const activeVersion = await prisma.projectBOQVersion.findFirst({
        // The current draft workflow approves BOQs as APPROVED; legacy locks used LOCKED.
        where: { projectId, status: { in: ['APPROVED', 'LOCKED'] } },
        orderBy: { versionNumber: 'desc' }
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
