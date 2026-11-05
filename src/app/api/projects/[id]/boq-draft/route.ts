import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionActor, checkSchedulingAccess } from '@/lib/scheduling/authUtils';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import {
  approveAndLockDraftBOQ,
  assertDraftBOQPermission,
  addDraftBOQLine,
  DraftBOQWorkflowError,
  removeDraftBOQLine,
  updateDraftBOQLine,
} from '@/lib/boq/draft-workflow';

type RouteContext = { params: Promise<{ id: string }> };

async function actorForProject(projectId: string, action: 'canEditDraft' | 'canApprove') {
  const actor = await getSessionActor();
  const access = await checkSchedulingAccess(actor.id, actor.role, projectId, action);
  assertDraftBOQPermission(access.allowed);
  return actor;
}

function errorResponse(error: unknown) {
  if (error instanceof DraftBOQWorkflowError) {
    return NextResponse.json({ error: error.code }, { status: error.status });
  }
  if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  console.error('Draft BOQ workflow failed:', error);
  return NextResponse.json({ error: 'DATABASE_OPERATION_FAILED' }, { status: 500 });
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new DraftBOQWorkflowError('INVALID_JSON', 400);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id: projectId } = await params;
    const actor = await getSessionActor();
    const capacity = await planningCapacity(actor, projectId);
    assertDraftBOQPermission(capacity.canEdit);
    const body = await readJson(request);
    const action = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).action : null;
    const result = action === 'add'
      ? await addDraftBOQLine(projectId, actor.id, body)
      : action === 'remove'
        ? await removeDraftBOQLine(projectId, actor.id, body)
        : await updateDraftBOQLine(projectId, actor.id, body);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id: projectId } = await params;
    const actor = await actorForProject(projectId, 'canApprove');
    const latest = await prisma.projectBOQVersion.findFirst({ where: { projectId }, orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }], select: { id: true, sourceProvenance: true } });
    const hasModuleReview = latest ? await prisma.bOQReviewState.findFirst({ where: { projectId, versionId: latest.id }, select: { id: true } }) : null;
    if (hasModuleReview || ['BOQ_WORKSPACE', 'BOQ_CORRECTED_SOURCE', 'BOQ_TEMPLATE_CENTER'].includes(String(latest?.sourceProvenance ?? ''))) return NextResponse.json({ error: 'Use the BOQ module engineering review and Project Manager approval.' }, { status: 409 });
    const result = await approveAndLockDraftBOQ(projectId, actor.id, await readJson(request));
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
