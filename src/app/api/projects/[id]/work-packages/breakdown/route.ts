import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { readPlanDetails } from '@/lib/scheduling/work-package-details-types';
import { attachWorkPackageBreakdown, WorkPackageDetailsError } from '@/lib/scheduling/work-package-details';
import { parseWorkspaceWorkbook, MAX_WORKSPACE_FILE_BYTES, normalizeWorkspaceMapping } from '@/lib/boq/workspace-parser';
import { readWorkspaceOriginal } from '@/lib/boq/workspace-service';
import { WorkspaceError } from '@/lib/boq/workspace-types';

type Context = { params: Promise<{ id: string }> };
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
    if (!(await planningCapacity(actor, projectId)).canEditPlan) throw new WorkspaceError('A project Planner or Engineer capacity is required to upload a package breakdown.', 403);
    if (Number(request.headers.get('content-length')) > MAX_WORKSPACE_FILE_BYTES + 128 * 1024) throw new WorkspaceError('The workbook request is too large.', 400);
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string' || !/\.xlsx$/i.test(file.name) || file.size <= 0 || file.size > MAX_WORKSPACE_FILE_BYTES) throw new WorkspaceError('Choose a nonempty .xlsx workbook, up to 10 MiB.', 400);
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
      const parsed = await parseWorkspaceWorkbook({ buffer, fileName: file.name, selectedSheet, mapping });
      if (parsed.items.length > 500) throw new WorkspaceError('A package breakdown supports at most 500 component rows. Select the intended package worksheet.', 400);
      return NextResponse.json({ analysis: parsed.analysis, rows: parsed.items });
    }
    if (action !== 'preserve' || !mapping || !selectedSheet) throw new WorkspaceError('Analyze the breakdown and select its worksheet and columns first.', 400);
    return NextResponse.json(await attachWorkPackageBreakdown({ projectId, scheduleId, activityId, actor, buffer, fileName: file.name,
      fileHash: text('fileHash'), selectedSheet, mapping, expectedRowVersion: Number(text('expectedRowVersion')) }));
  } catch (error) { return errorResponse(error); }
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
    return new NextResponse(new Uint8Array(buffer), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="package-breakdown.xlsx"; filename*=UTF-8''${encodeURIComponent(upload.fileName)}`, 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}
