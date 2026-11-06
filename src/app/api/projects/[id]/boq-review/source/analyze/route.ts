import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { analyzeBOQWorkbook, MAX_WORKSPACE_FILE_BYTES, normalizeWorkspaceMapping, normalizeWorkspaceBreakdownMapping } from '@/lib/boq/workspace-parser';
import { WorkspaceError } from '@/lib/boq/workspace-types';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getSessionActor();
    const { id } = await params;
    if (!(await planningCapacity(actor, id)).canEdit) return NextResponse.json({ success:false,error:'You do not have access to correct this project BOQ.' },{status:403});
    if (Number(request.headers.get('content-length')) > MAX_WORKSPACE_FILE_BYTES + 2 * 1024 * 1024) throw new WorkspaceError('The workbook request is too large.',400);
    const form = await request.formData();
    const versionId = form.get('versionId');
    if (typeof versionId !== 'string' || !versionId) throw new WorkspaceError('Choose the draft BOQ version before analyzing a correction.',400);
    const version = await prisma.projectBOQVersion.findFirst({where:{id:versionId,projectId:id},select:{status:true}});
    if (!version) return NextResponse.json({success:false,error:'BOQ version not found.'},{status:404});
    const project = await prisma.project.findUnique({where:{id},select:{boqLocked:true}});
    if (!project || project.boqLocked || version.status !== 'DRAFT') throw new WorkspaceError('This BOQ is locked. Corrected source adoption requires an editable draft; the approved baseline stays unchanged.',409);
    const file = form.get('file');
    if (!file || typeof file === 'string' || !file.name || !/\.xlsx$/i.test(file.name) || file.size < 1 || file.size > MAX_WORKSPACE_FILE_BYTES) throw new WorkspaceError('Choose a corrected .xlsx workbook up to 10 MiB.',400);
    const text = (key:string) => {const value=form.get(key);if(value!==null&&typeof value!=='string')throw new WorkspaceError(`Invalid ${key}.`,400);return typeof value==='string'?value:null;};
    const sheet = text('sheetName');
    const rawMapping = text('mapping'),rawBreakdown = text('breakdownMapping');
    const analysis = await analyzeBOQWorkbook({buffer:Buffer.from(await file.arrayBuffer()),fileName:file.name,selectedSheet:sheet?.trim()||null,
      mapping:rawMapping?normalizeWorkspaceMapping(JSON.parse(rawMapping)):null,
      breakdownMapping:rawBreakdown?normalizeWorkspaceBreakdownMapping(JSON.parse(rawBreakdown)):null,
      documentContext:`boq-correction:${actor.id}:${id}:${versionId}`});
    return NextResponse.json({success:true,analysis},{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {
    if(error instanceof WorkspaceError)return NextResponse.json({success:false,error:error.message},{status:error.status});
    if(error instanceof SyntaxError)return NextResponse.json({success:false,error:'Column mapping must be valid JSON.'},{status:400});
    if(error instanceof Error&&error.message.startsWith('UNAUTHORIZED:'))return NextResponse.json({success:false,error:'Sign in to continue.'},{status:401});
    console.error('Corrected BOQ source analysis failed:',error);
    return NextResponse.json({success:false,error:'The corrected workbook could not be analyzed.'},{status:500});
  }
}
