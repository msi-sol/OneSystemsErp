import { NextResponse } from 'next/server';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { normalizeWorkspaceBreakdownMapping, normalizeWorkspaceMapping } from '@/lib/boq/workspace-parser';
import { acceptCorrectedBOQCarryForward, BOQSourceVersionError, stageCorrectedBOQSource } from '@/lib/boq/source-version-workflow';
import { WorkspaceError } from '@/lib/boq/workspace-types';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getSessionActor();
    const { id } = await params;
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') return NextResponse.json({ error: 'Choose a corrected .xlsx workbook.' }, { status: 400 });
    const versionId = form.get('versionId');
    const selectedSheet = form.get('sheetName');
    const expectedFileHash = form.get('fileHash');
    const rawRowVersion = form.get('expectedRowVersion');
    const expectedRowVersion = Number(rawRowVersion);
    const rawMapping = form.get('mapping');
    const rawBreakdown = form.get('breakdownMapping');
    if (typeof versionId !== 'string' || !versionId || typeof selectedSheet !== 'string' || !selectedSheet.trim() || typeof expectedFileHash !== 'string' || !/^[a-f\d]{64}$/i.test(expectedFileHash) || typeof rawRowVersion !== 'string' || !/^\d+$/.test(rawRowVersion) || !Number.isSafeInteger(expectedRowVersion) || expectedRowVersion < 0 || typeof rawMapping !== 'string') {
      return NextResponse.json({ error: 'Analyze and map the corrected workbook before staging it.' }, { status: 400 });
    }
    const mapping = normalizeWorkspaceMapping(JSON.parse(rawMapping));
    const breakdownMapping = typeof rawBreakdown === 'string' && rawBreakdown.trim() ? normalizeWorkspaceBreakdownMapping(JSON.parse(rawBreakdown)) : null;
    if (!mapping) return NextResponse.json({ error: 'Choose the corrected workbook columns.' }, { status: 400 });
    const result = await stageCorrectedBOQSource({ actor, projectId: id, versionId, expectedRowVersion, buffer: Buffer.from(await file.arrayBuffer()), fileName: file.name, selectedSheet: selectedSheet.trim(), mapping, breakdownMapping: breakdownMapping ?? undefined, expectedFileHash });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BOQSourceVersionError || error instanceof WorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid column mapping JSON.' }, { status: 400 });
    if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
    return NextResponse.json({ error: 'The corrected BOQ source could not be staged.' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getSessionActor();
    const { id } = await params;
    const body = await request.json();
    if (!body || typeof body !== 'object' || !['accept-carry-forward', 'reject-source'].includes(body.action)
      || typeof body.versionId !== 'string' || typeof body.sourceVersionId !== 'string'
      || !Number.isSafeInteger(body.expectedRowVersion) || body.expectedRowVersion < 0
      || typeof body.reason !== 'string' || (body.action === 'accept-carry-forward' && typeof body.identityKey !== 'string')) {
      return NextResponse.json({ error: 'Invalid corrected-source assessment request.' }, { status: 400 });
    }
    return NextResponse.json(await acceptCorrectedBOQCarryForward({ actor, projectId: id, versionId: body.versionId, sourceVersionId: body.sourceVersionId, expectedRowVersion: body.expectedRowVersion, identityKey: body.identityKey ?? '', reason: body.reason, reject: body.action === 'reject-source' }));
  } catch (error) {
    if (error instanceof BOQSourceVersionError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
    if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
    return NextResponse.json({ error: 'The source assessment could not be saved.' }, { status: 500 });
  }
}
