import { NextResponse } from 'next/server';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { MAX_WORKSPACE_FILE_BYTES, normalizeWorkspaceBreakdownMapping, normalizeWorkspaceMapping } from '@/lib/boq/workspace-parser';
import { confirmBOQWorkspaceUpload } from '@/lib/boq/workspace-service';
import { WorkspaceError } from '@/lib/boq/workspace-types';

const MAX_MULTIPART_BYTES = MAX_WORKSPACE_FILE_BYTES + 2 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const actor = await getSessionActor();
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
      throw new WorkspaceError('The workbook request is too large.', 400);
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
      throw new WorkspaceError('Choose an .xlsx workbook to confirm.', 400);
    }
    if (!file.name || !/\.(xlsx|pdf|docx)$/i.test(file.name)) throw new WorkspaceError('Choose Excel (.xlsx), PDF, or Word (.docx).', 400);
    if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_WORKSPACE_FILE_BYTES) {
      throw new WorkspaceError('The workbook must be between 1 byte and 10 MiB.', 400);
    }

    const expectedFileHash = form.get('fileHash');
    const selectedSheet = form.get('sheetName');
    const rawMapping = form.get('mapping');
    const rawBreakdownMapping = form.get('breakdownMapping');
    const rawProjectId = form.get('projectId');
    const rawProjectName = form.get('projectName');
    if (typeof expectedFileHash !== 'string' || !/^[a-f\d]{64}$/i.test(expectedFileHash)) throw new WorkspaceError('Analyze the workbook before confirming it.', 400);
    if (typeof selectedSheet !== 'string' || !selectedSheet.trim()) throw new WorkspaceError('Choose a BOQ worksheet before confirming.', 400);
    if (typeof rawMapping !== 'string' || !rawMapping.trim()) throw new WorkspaceError('Map the required BOQ columns before confirming.', 400);
    if (rawBreakdownMapping !== null && typeof rawBreakdownMapping !== 'string') throw new WorkspaceError('Invalid cost-breakdown mapping.', 400);
    if (rawProjectId !== null && typeof rawProjectId !== 'string') throw new WorkspaceError('Invalid target project.', 400);
    if (typeof rawProjectId === 'string' && rawProjectId.trim()) throw new WorkspaceError('BOQ Workspace creates new projects only. Open the existing project BOQ to review or correct its source.', 400);
    if (rawProjectName !== null && typeof rawProjectName !== 'string') throw new WorkspaceError('Invalid project name.', 400);
    let mapping;
    try {
      mapping = normalizeWorkspaceMapping(JSON.parse(rawMapping));
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      throw new WorkspaceError('Column mapping must be valid JSON.', 400);
    }
    if (!mapping) throw new WorkspaceError('Map the required BOQ columns before confirming.', 400);
    let breakdownMapping = null;
    if (typeof rawBreakdownMapping === 'string' && rawBreakdownMapping.trim()) {
      try { breakdownMapping = normalizeWorkspaceBreakdownMapping(JSON.parse(rawBreakdownMapping)); }
      catch (error) {
        if (error instanceof WorkspaceError) throw error;
        throw new WorkspaceError('Cost-breakdown mapping must be valid JSON.', 400);
      }
    }

    const projectId = typeof rawProjectId === 'string' && rawProjectId.trim() ? rawProjectId.trim() : null;
    const result = await confirmBOQWorkspaceUpload({
      actor,
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      expectedFileHash,
      selectedSheet: selectedSheet.trim(),
      mapping,
      breakdownMapping,
      projectId,
      projectName: typeof rawProjectName === 'string' ? rawProjectName : '',
      projectContractAmount: form.get('projectContractAmount'),
      documentToken: typeof form.get('documentToken') === 'string' ? String(form.get('documentToken')) : null,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof WorkspaceError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) return NextResponse.json({ success: false, error: 'Your session has expired. Sign in and try again.' }, { status: 401 });
    return NextResponse.json({ success: false, error: 'The draft BOQ could not be saved. Please try again.' }, { status: 500 });
  }
}
