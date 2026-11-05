import { NextResponse } from 'next/server';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { getWorkPackageProjectLocations, mutateWorkPackageProjectLocation, WorkPackageLocationError } from '@/lib/scheduling/work-package-project-locations';

type Context = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (error instanceof WorkPackageLocationError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  return NextResponse.json({ error: 'WORK_PACKAGE_LOCATIONS_FAILED' }, { status: 500 });
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const actor = await getSessionActor();
    const capacity = await planningCapacity(actor, id);
    if (!capacity.canView) return NextResponse.json({ error: 'PROJECT_ACCESS_DENIED' }, { status: 403 });
    return NextResponse.json(await getWorkPackageProjectLocations(id));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const actor = await getSessionActor();
    const capacity = await planningCapacity(actor, id);
    if (!capacity.canEditPlan) return NextResponse.json({ error: 'PROJECT_ACCESS_DENIED' }, { status: 403 });
    let body: unknown;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'INVALID_JSON_BODY' }, { status: 400 }); }
    return NextResponse.json(await mutateWorkPackageProjectLocation({ projectId: id, actor, body }));
  } catch (error) { return errorResponse(error); }
}
