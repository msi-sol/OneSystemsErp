import { WorkPackageExecutionError } from '@/lib/scheduling/work-package-execution';
import { NextResponse } from 'next/server';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { runWorkPackageReviewCommand, WorkPackageReviewError } from '@/lib/scheduling/work-package-review';

type Context = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if(error instanceof WorkPackageExecutionError) return NextResponse.json({error:error.message},{status:error.status});
  if (error instanceof WorkPackageReviewError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  return NextResponse.json({ error: 'WORK_PACKAGE_REVIEW_FAILED' }, { status: 500 });
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id: projectId } = await params;
    const actor = await getSessionActor();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON_BODY' }, { status: 400 });
    }
    const action = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).action
      : undefined;
    const capacity = await planningCapacity(actor, projectId);
    const allowed = action === 'review'
      ? capacity.canReviewPlan
      : action === 'approve'
        ? capacity.canApprovePlan
        : ['start-revision', 'cancel-revision'].includes(String(action))
          ? capacity.canEditPlan || capacity.canApprovePlan
          : false;
    if (!allowed) return NextResponse.json({ error: 'PROJECT_ACCESS_DENIED' }, { status: 403 });

    const result = await runWorkPackageReviewCommand({ projectId, actor, body });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof WorkPackageExecutionError) return NextResponse.json({error:error.message},{status:error.status});
    return errorResponse(error);
  }
}
