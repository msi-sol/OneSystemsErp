import { NextResponse } from 'next/server';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { analyzeBOQWorkbook, MAX_WORKSPACE_FILE_BYTES, normalizeWorkspaceBreakdownMapping, normalizeWorkspaceMapping } from '@/lib/boq/workspace-parser';
import { authorizeWorkspaceAnalyze } from '@/lib/boq/workspace-service';
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
      throw new WorkspaceError('Choose an .xlsx workbook to analyze.', 400);
    }
    if (!file.name || !/\.(xlsx|pdf|docx)$/i.test(file.name)) throw new WorkspaceError('Choose Excel (.xlsx), PDF, or Word (.docx). Save older .xls/.doc files in a supported format.', 400);
    if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_WORKSPACE_FILE_BYTES) {
      throw new WorkspaceError('The workbook must be between 1 byte and 10 MiB.', 400);
    }
    const rawProjectId = form.get('projectId');
    if (rawProjectId !== null && typeof rawProjectId !== 'string') throw new WorkspaceError('Invalid target project.', 400);
    const projectId = typeof rawProjectId === 'string' && rawProjectId.trim() ? rawProjectId.trim() : null;
    if (projectId) throw new WorkspaceError('BOQ Workspace creates new projects only. Open the existing project BOQ for source corrections.', 400);
    await authorizeWorkspaceAnalyze(actor, projectId);

    const rawSheetName = form.get('sheetName');
    if (rawSheetName !== null && typeof rawSheetName !== 'string') throw new WorkspaceError('Invalid worksheet selection.', 400);
    const rawMapping = form.get('mapping');
    if (rawMapping !== null && typeof rawMapping !== 'string') throw new WorkspaceError('Invalid column mapping.', 400);
    const rawBreakdownMapping = form.get('breakdownMapping');
    if (rawBreakdownMapping !== null && typeof rawBreakdownMapping !== 'string') throw new WorkspaceError('Invalid cost-breakdown mapping.', 400);
    const rawOffset = form.get('offset');
    if (rawOffset !== null && typeof rawOffset !== 'string') throw new WorkspaceError('Invalid preview offset.', 400);
    const previewOffset = rawOffset === null || rawOffset === '' ? 0 : Number(rawOffset);
    if (!Number.isSafeInteger(previewOffset) || previewOffset < 0 || (rawOffset !== null && !/^\d+$/.test(rawOffset))) {
      throw new WorkspaceError('Preview offset must be a nonnegative whole number.', 400);
    }
    const rawSectionKey = form.get('sectionKey');
    if (rawSectionKey !== null && typeof rawSectionKey !== 'string') throw new WorkspaceError('Invalid BOQ section selection.', 400);
    if (typeof rawSectionKey === 'string' && rawSectionKey.length > 500) throw new WorkspaceError('Invalid BOQ section selection.', 400);
    let mapping = null;
    if (typeof rawMapping === 'string' && rawMapping.trim()) {
      try {
        mapping = normalizeWorkspaceMapping(JSON.parse(rawMapping));
      } catch (error) {
        if (error instanceof WorkspaceError) throw error;
        throw new WorkspaceError('Column mapping must be valid JSON.', 400);
      }
    }
    let breakdownMapping = null;
    if (typeof rawBreakdownMapping === 'string' && rawBreakdownMapping.trim()) {
      try {
        breakdownMapping = normalizeWorkspaceBreakdownMapping(JSON.parse(rawBreakdownMapping));
      } catch (error) {
        if (error instanceof WorkspaceError) throw error;
        throw new WorkspaceError('Cost-breakdown mapping must be valid JSON.', 400);
      }
    }

    const analysis = await analyzeBOQWorkbook({
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      selectedSheet: typeof rawSheetName === 'string' && rawSheetName.trim() ? rawSheetName.trim() : null,
      mapping,
      breakdownMapping,
      previewOffset,
      sectionKey: typeof rawSectionKey === 'string' && rawSectionKey ? rawSectionKey : null,
      documentToken: typeof form.get('documentToken') === 'string' ? String(form.get('documentToken')) : null,
      documentContext: `boq:${actor.id}:${projectId || 'new'}`,
    });
    return NextResponse.json({ success: true, analysis });
  } catch (error) {
    if (error instanceof WorkspaceError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) return NextResponse.json({ success: false, error: 'Your session has expired. Sign in and try again.' }, { status: 401 });
    return NextResponse.json({ success: false, error: 'The workbook could not be analyzed. Please try again.' }, { status: 500 });
  }
}
