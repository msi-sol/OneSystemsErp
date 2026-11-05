import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionActor, checkSchedulingAccess } from '@/lib/scheduling/authUtils';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { createDraftScheduleActivity, DraftEditingError } from '@/lib/scheduling/draft-editing';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const actor = await getSessionActor();
    const access = await checkSchedulingAccess(actor.id, actor.role, projectId, 'canView');
    if (!access.allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const schedule = await prisma.projectSchedule.findFirst({
      where: { projectId },
      include: {
        activities: {
          include: {
            wbs: true,
            assignedTo: { select: { id: true, name: true, email: true } },
            boqAllocations: { include: { awardedBoqItem: { select: { id: true, itemCode: true, description: true } } } },
            predecessors: true,
            successors: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        wbsNodes: { orderBy: { orderIndex: 'asc' } },
        dependencies: true,
      },
    });
    if (!schedule) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    return NextResponse.json({ schedule });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'DATABASE_OPERATION_FAILED' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const actor = await getSessionActor();
    const latestSchedule = await prisma.projectSchedule.findFirst({ where: { projectId }, orderBy: { createdAt: 'desc' }, select: { generationRulesVersion: true } });
    if(latestSchedule?.generationRulesVersion==='BOQ_WPS_WORKSPACE_V1')return NextResponse.json({error:'Create packages in the Work Packages module.'},{status:409});
    const allowed = latestSchedule?.generationRulesVersion === 'BOQ_WPS_WORKSPACE_V1'
      ? (await planningCapacity(actor, projectId)).canEdit
      : (await checkSchedulingAccess(actor.id, actor.role, projectId, 'canEditDraft')).allowed;
    if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_REQUEST_BODY' }, { status: 400 });
    }
    const activity = await createDraftScheduleActivity({ projectId, actor, body });
    return NextResponse.json({ success: true, activity });
  } catch (error) {
    if (error instanceof DraftEditingError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'DATABASE_OPERATION_FAILED' }, { status: 500 });
  }
}
