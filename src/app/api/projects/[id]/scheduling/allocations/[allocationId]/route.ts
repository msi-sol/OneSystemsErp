import { NextResponse } from 'next/server';
import { checkSchedulingAccess, getSessionActor } from '@/lib/scheduling/authUtils';
import { DraftEditingError, editDraftScheduleAllocation } from '@/lib/scheduling/draft-editing';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; allocationId: string }> },
) {
  try {
    const { id: projectId, allocationId } = await params;
    const actor = await getSessionActor();
    const access = await checkSchedulingAccess(actor.id, actor.role, projectId, 'canEditDraft');
    if (!access.allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_REQUEST_BODY' }, { status: 400 });
    }

    const result = await editDraftScheduleAllocation({ projectId, allocationId, actor, body });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof DraftEditingError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'DATABASE_OPERATION_FAILED' }, { status: 500 });
  }
}
