import { WorkPackageExecutionError } from '@/lib/scheduling/work-package-execution';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionActor, checkSchedulingAccess } from '@/lib/scheduling/authUtils';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import {
  DraftEditingError,
  deleteDraftScheduleActivity,
  editDraftScheduleActivity,
} from '@/lib/scheduling/draft-editing';

type RouteParams = { params: Promise<{ id: string; activityId: string }> };

async function canEditActivity(actor: { id: string; role: string }, projectId: string, activityId: string) {
  const activity = await prisma.scheduleActivity.findFirst({
    where: { id: activityId, schedule: { projectId } },
    select: { schedule: { select: { generationRulesVersion: true } } },
  });
  if (activity?.schedule.generationRulesVersion === 'BOQ_WPS_WORKSPACE_V1') {
    return (await planningCapacity(actor, projectId)).canEditPlan;
  }
  return (await checkSchedulingAccess(actor.id, actor.role, projectId, 'canEditDraft')).allowed;
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { id: projectId, activityId } = await params;
    const actor = await getSessionActor();
    if (!await canEditActivity(actor, projectId, activityId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_REQUEST_BODY' }, { status: 400 });
    }
    const activity = await editDraftScheduleActivity({ projectId, activityId, actor, body });
    return NextResponse.json({ success: true, activity });
  } catch (error) {
    if (error instanceof WorkPackageExecutionError) return NextResponse.json({error:error.message},{status:error.status});
    if (error instanceof DraftEditingError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'DATABASE_OPERATION_FAILED' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const { id: projectId, activityId } = await params;
    const actor = await getSessionActor();
    if (!await canEditActivity(actor, projectId, activityId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_REQUEST_BODY' }, { status: 400 });
    }
    const result = await deleteDraftScheduleActivity({ projectId, activityId, actor, body });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof WorkPackageExecutionError) return NextResponse.json({error:error.message},{status:error.status});
    if (error instanceof DraftEditingError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'DATABASE_OPERATION_FAILED' }, { status: 500 });
  }
}
