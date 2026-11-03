import { NextResponse } from 'next/server';
import { getSessionActor, checkSchedulingAccess } from '@/lib/scheduling/authUtils';
import {
  approveAndLockDraftBOQ,
  assertDraftBOQPermission,
  DraftBOQWorkflowError,
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
    const actor = await actorForProject(projectId, 'canEditDraft');
    const result = await updateDraftBOQLine(projectId, actor.id, await readJson(request));
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id: projectId } = await params;
    const actor = await actorForProject(projectId, 'canApprove');
    const result = await approveAndLockDraftBOQ(projectId, actor.id, await readJson(request));
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
