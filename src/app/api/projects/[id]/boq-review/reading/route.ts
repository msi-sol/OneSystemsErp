import { NextResponse } from 'next/server';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { applyCorrectedBOQReading, BOQReadingWorkflowError, previewCorrectedBOQReading } from '@/lib/boq/reading-workflow';
import { WorkspaceError } from '@/lib/boq/workspace-types';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getSessionActor();
    const { id: projectId } = await params;
    let value: unknown;
    try { value = await request.json(); } catch { return NextResponse.json({ error: 'Invalid corrected reading request.' }, { status: 400 }); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return NextResponse.json({ error: 'Invalid corrected reading request.' }, { status: 400 });
    const body = value as Record<string, unknown>;
    const common = {
      actor,
      projectId,
      versionId: typeof body.versionId === 'string' ? body.versionId : '',
      expectedChecksum: typeof body.expectedChecksum === 'string' ? body.expectedChecksum : '',
      expectedRowVersion: Number(body.expectedRowVersion),
      selectedSheet: typeof body.selectedSheet === 'string' ? body.selectedSheet : undefined,
      mapping: body.mapping,
      breakdownMapping: body.breakdownMapping,
    };
    if (body.action === 'preview') return NextResponse.json(await previewCorrectedBOQReading(common));
    if (body.action === 'apply') {
      const conflictDecisions = body.conflictDecisions && typeof body.conflictDecisions === 'object' && !Array.isArray(body.conflictDecisions)
        ? body.conflictDecisions as Record<string, { decision: 'KEEP_CURRENT' | 'USE_READING'; reason: string }>
        : {};
      return NextResponse.json(await applyCorrectedBOQReading({ ...common, expectedPreviewHash: typeof body.expectedPreviewHash === 'string' ? body.expectedPreviewHash : '', reason: typeof body.reason === 'string' ? body.reason : '', conflictDecisions }));
    }
    return NextResponse.json({ error: 'Choose preview or apply.' }, { status: 400 });
  } catch (error) {
    if (error instanceof BOQReadingWorkflowError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof WorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
    return NextResponse.json({ error: 'The corrected BOQ reading could not be processed.' }, { status: 500 });
  }
}
