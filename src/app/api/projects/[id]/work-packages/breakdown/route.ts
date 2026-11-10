import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { readPlanDetails } from '@/lib/scheduling/work-package-details-types';
import { attachWorkPackageBreakdown, WorkPackageDetailsError } from '@/lib/scheduling/work-package-details';
import { parseWorkspaceWorkbook, MAX_WORKSPACE_FILE_BYTES, normalizeWorkspaceMapping } from '@/lib/boq/workspace-parser';
import { readWorkspaceOriginal, workspaceDocumentMime } from '@/lib/boq/workspace-service';
import { WorkspaceError } from '@/lib/boq/workspace-types';
import { readDupaFiles, saveDupaSelections } from '@/lib/scheduling/dupa-bulk';

type Context = { params: Promise<{ id: string }> };
// Bulk reading runs the DUPA reader on every DUPA found plus one AI linking call.
export const maxDuration = 300;
const EDITABLE = ['AI_GENERATED_DRAFT', 'INVALID_GENERATED_DRAFT', 'TECHNICAL_REVISIONS_REQUIRED'];
const SUPPORTED = /\.(xlsx|xls|csv|tsv|pdf|docx|txt|png|jpe?g|webp)$/i;
function errorResponse(error: unknown) {
  if (error instanceof WorkspaceError || error instanceof WorkPackageDetailsError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) return NextResponse.json({ error: 'Sign in before uploading a package breakdown.' }, { status: 401 });
  console.error('Package breakdown request failed', error);
  return NextResponse.json({ error: 'The breakdown could not be processed. Refresh the plan and try again.' }, { status: 500 });
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id: projectId } = await params;
    const actor = await getSessionActor();
    if (!(await planningCapacity(actor, projectId)).canEditPlan) throw new WorkspaceError('You do not have permission to upload a package breakdown for this plan.', 403);
    if (Number(request.headers.get('content-length')) > MAX_WORKSPACE_FILE_BYTES + 2 * 1024 * 1024) throw new WorkspaceError('The document request is too large.', 400);
    const form = await request.formData();
    const bulkAction = form.get('action');
    if (bulkAction === 'bulk-read' || bulkAction === 'bulk-save') return NextResponse.json(await bulk(form, bulkAction, projectId, actor));
    const file = form.get('file');
    if (!file || typeof file === 'string' || !/\.(xlsx|xls|csv|tsv|pdf|docx|txt|png|jpe?g|webp)$/i.test(file.name) || file.size <= 0 || file.size > MAX_WORKSPACE_FILE_BYTES) throw new WorkspaceError('Choose a supported Excel, delimited text, PDF, Word, text or PNG/JPEG/WEBP source, up to 10 MiB.', 400);
    const text = (key: string) => { const value = form.get(key); if (value !== null && typeof value !== 'string') throw new WorkspaceError(`Invalid ${key}.`, 400); return typeof value === 'string' ? value.trim() : ''; };
    const scheduleId = text('scheduleId'), activityId = text('activityId');
    const schedule = await prisma.projectSchedule.findFirst({ where: { id: scheduleId, projectId }, select: { workflowStatus: true, generationRulesVersion: true, activities: { where: { id: activityId }, select: { id: true } } } });
    if (!schedule || !schedule.activities.length) throw new WorkspaceError('Choose a package in the intended project and plan.', 404);
    if (!['AI_GENERATED_DRAFT', 'INVALID_GENERATED_DRAFT', 'TECHNICAL_REVISIONS_REQUIRED'].includes(schedule.workflowStatus) || schedule.generationRulesVersion !== 'BOQ_WPS_WORKSPACE_V1') throw new WorkspaceError('Upload a breakdown in an editable work-package draft. Approved schedules require a revision.', 409);
    let mapping = null;
    const rawMapping = text('mapping');
    if (rawMapping) { try { mapping = normalizeWorkspaceMapping(JSON.parse(rawMapping)); } catch { throw new WorkspaceError('Map the breakdown columns with valid values.', 400); } }
    const selectedSheet = text('sheetName') || null;
    const buffer = Buffer.from(await file.arrayBuffer());
    const action = text('action');
    if (action === 'analyze') {
      const parsed = await parseWorkspaceWorkbook({ buffer, fileName: file.name, selectedSheet, mapping, documentToken: text('documentToken') || null,
        documentContext: `dupa:${actor.id}:${projectId}:${scheduleId}:${activityId}` });
      if (parsed.items.length > 500) throw new WorkspaceError('A package breakdown supports at most 500 component rows. Select the intended package worksheet.', 400);
      return NextResponse.json({ analysis: parsed.analysis, rows: parsed.items });
    }
    if (action !== 'preserve' || !mapping || !selectedSheet) throw new WorkspaceError('Analyze the breakdown and select its worksheet and columns first.', 400);
    return NextResponse.json(await attachWorkPackageBreakdown({ projectId, scheduleId, activityId, actor, buffer, fileName: file.name,
      fileHash: text('fileHash'), selectedSheet, mapping, expectedRowVersion: Number(text('expectedRowVersion')), documentToken: text('documentToken') || null }));
  } catch (error) { return errorResponse(error); }
}

/** Many DUPAs from one or more files: read + AI package/BOQ suggestions, then save the chosen ones (one or all). */
async function bulk(form: FormData, action: 'bulk-read' | 'bulk-save', projectId: string, actor: Awaited<ReturnType<typeof getSessionActor>>) {
  const scheduleId = String(form.get('scheduleId') ?? '').trim();
  const schedule = await prisma.projectSchedule.findFirst({ where: { id: scheduleId, projectId }, select: { workflowStatus: true, generationRulesVersion: true } });
  if (!schedule) throw new WorkspaceError('The work-package plan was not found in this project.', 404);
  if (!EDITABLE.includes(schedule.workflowStatus) || schedule.generationRulesVersion !== 'BOQ_WPS_WORKSPACE_V1') throw new WorkspaceError('Upload DUPAs in an editable work-package draft. Approved schedules require a revision.', 409);
  const files = form.getAll('file').filter((value): value is File => typeof value !== 'string');
  if (!files.length || files.length > 20) throw new WorkspaceError('Choose 1 to 20 DUPA files.', 400);
  const inputs = [];
  for (const file of files) {
    if (!SUPPORTED.test(file.name) || file.size <= 0 || file.size > MAX_WORKSPACE_FILE_BYTES) throw new WorkspaceError(`${file.name}: choose a supported Excel, CSV, PDF, Word, text or image file up to 10 MiB.`, 400);
    inputs.push({ buffer: Buffer.from(await file.arrayBuffer()), fileName: file.name });
  }
  if (action === 'bulk-read') return readDupaFiles({ actor, projectId, scheduleId, files: inputs });
  if (inputs.length !== 1) throw new WorkspaceError('Save the DUPAs of one file at a time.', 400);
  let selections: Array<{ key: string; activityId: string; boqItemIds: string[] }>;
  try {
    const raw = JSON.parse(String(form.get('selections') ?? '[]'));
    if (!Array.isArray(raw) || !raw.length || raw.length > 40) throw new Error();
    selections = raw.map((entry: Record<string, unknown>) => {
      if (typeof entry?.key !== 'string' || typeof entry.activityId !== 'string' || !entry.activityId) throw new Error();
      return { key: entry.key, activityId: entry.activityId, boqItemIds: Array.isArray(entry.boqItemIds) ? entry.boqItemIds.filter((id): id is string => typeof id === 'string').slice(0, 50) : [] };
    });
  } catch { throw new WorkspaceError('Choose a package for every DUPA to save.', 400); }
  return saveDupaSelections({ actor, projectId, scheduleId, expectedRowVersion: Number(form.get('expectedRowVersion')), file: inputs[0], selections });
}

export async function GET(request: Request, { params }: Context) {
  try {
    const { id: projectId } = await params;
    const actor = await getSessionActor();
    if (!(await planningCapacity(actor, projectId)).canView) throw new WorkspaceError('You do not have access to this project.', 403);
    const query = new URL(request.url).searchParams;
    const schedule = await prisma.projectSchedule.findFirst({ where: { id: query.get('scheduleId') || '', projectId }, select: { description: true } });
    const upload = schedule && readPlanDetails(schedule.description).breakdownUploads?.find(row => row.id === query.get('uploadId'));
    if (!upload) throw new WorkspaceError('Package breakdown not found in this project and plan.', 404);
    const buffer = await readWorkspaceOriginal(upload.storagePath);
    return new NextResponse(new Uint8Array(buffer), { headers: { 'Content-Type': workspaceDocumentMime(upload.fileName),
      'Content-Disposition': `attachment; filename="package-breakdown.xlsx"; filename*=UTF-8''${encodeURIComponent(upload.fileName)}`, 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}
