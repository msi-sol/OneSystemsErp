import { NextResponse } from 'next/server';
import { getSessionActor, checkSchedulingAccess } from '@/lib/scheduling/authUtils';
import { AiCheckError, runBoqAiCheck, runWorkPackageAiCheck } from '@/lib/ai/planning-ai-check';

// Optional AI Check for the BOQ and work-package steps. Read-only: it returns insights and proposals;
// accepting a proposal goes through the normal BOQ draft / work-package endpoints and their permissions.
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    const actor = await getSessionActor().catch(() => null);
    if (!actor) return NextResponse.json({ error: 'Your session has expired. Sign in and try again.' }, { status: 401 });
    const access = await checkSchedulingAccess(actor.id, actor.role, projectId, 'canView');
    if (!access.allowed) return NextResponse.json({ error: 'You do not have access to this project.' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const scope = body && typeof body === 'object' ? (body as Record<string, unknown>).scope : null;
    if (scope === 'boq') return NextResponse.json(await runBoqAiCheck(actor, projectId));
    if (scope === 'work-packages') return NextResponse.json(await runWorkPackageAiCheck(actor, projectId));
    return NextResponse.json({ error: 'Choose what to check: boq or work-packages.' }, { status: 400 });
  } catch (error) {
    if (error instanceof AiCheckError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('AI Check failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'The AI Check could not run. Try again; nothing was changed.' }, { status: 500 });
  }
}
