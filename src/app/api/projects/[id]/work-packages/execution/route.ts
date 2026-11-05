import { NextResponse } from 'next/server';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { getWorkPackageExecutionData, runWorkPackageExecutionCommand, WorkPackageExecutionError } from '@/lib/scheduling/work-package-execution';

type Context = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (error instanceof WorkPackageExecutionError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  return NextResponse.json({ error: 'WORK_PACKAGE_EXECUTION_FAILED' }, { status: 500 });
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const actor = await getSessionActor();
    const capacity = await planningCapacity(actor, id);
    if (!capacity.canView) return NextResponse.json({ error: 'PROJECT_ACCESS_DENIED' }, { status: 403 });
    const horizon = new URL(_request.url).searchParams.get('horizon');
    return NextResponse.json(await getWorkPackageExecutionData(id, horizon ? Number(horizon) : 21));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const actor = await getSessionActor();
    const capacity = await planningCapacity(actor, id);
    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'INVALID_JSON_BODY' }, { status: 400 }); }
    const action=body&&typeof body==='object'&&'action'in body?String(body.action):'';
    const permission=action.includes('weekly')?capacity.canManageWeekly:action.includes('constraint')?capacity.canEditPlan:capacity.canRecordSiteLogs;
    if (!permission) return NextResponse.json({ error: 'PROJECT_ACCESS_DENIED' }, { status: 403 });
    return NextResponse.json(await runWorkPackageExecutionCommand({ projectId: id, actor, body }));
  } catch (error) { return errorResponse(error); }
}
