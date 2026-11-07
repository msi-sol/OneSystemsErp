import { WorkPackageExecutionError } from '@/lib/scheduling/work-package-execution';
import { NextResponse } from 'next/server';
import { WorkPackageLocationError } from '@/lib/scheduling/work-package-project-locations';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import {
  getWorkPackagePlanningData,
  runWorkPackagePlanningCommand,
  WorkPackagePlanningError,
} from '@/lib/scheduling/work-package-planning';

type Context = { params: Promise<{ id: string }> };

async function authorize(projectId: string, action: 'canView' | 'canEditDraft') {
  const actor = await getSessionActor();
  const capacity = await planningCapacity(actor, projectId);
  const allowed = action === 'canView' ? capacity.canView : capacity.canEditPlan;
  if (!allowed) return { actor, response: NextResponse.json({ error: 'PROJECT_ACCESS_DENIED' }, { status: 403 }) };
  return { actor, response: null };
}

function errorResponse(error: unknown) {
  if(error instanceof WorkPackageExecutionError) return NextResponse.json({error:error.message},{status:error.status});
  if (error instanceof WorkPackagePlanningError || error instanceof WorkPackageLocationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('UNAUTHORIZED:')) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  console.error('Work Packages API failed:', error);
  return NextResponse.json({ error: 'WORK_PACKAGE_REQUEST_FAILED' }, { status: 500 });
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const auth = await authorize(id, 'canView');
    if (auth.response) return auth.response;
    const data = await getWorkPackagePlanningData(id);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof WorkPackageExecutionError) return NextResponse.json({error:error.message},{status:error.status});
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const auth = await authorize(id, 'canEditDraft');
    if (auth.response) return auth.response;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON_BODY' }, { status: 400 });
    }
    const result = await runWorkPackagePlanningCommand({ projectId: id, actor: auth.actor, body });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof WorkPackageExecutionError) return NextResponse.json({error:error.message},{status:error.status});
    return errorResponse(error);
  }
}
