import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionActor, checkSchedulingAccess } from '@/lib/scheduling/authUtils';

// The proxy only verifies that a session exists; mutating a project needs project permissions.
async function authorizeProject(projectId: string, action: 'canEdit' | 'canDelete') {
  const actor = await getSessionActor().catch(() => null);
  if (!actor) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const access = await checkSchedulingAccess(actor.id, actor.role, projectId, action);
  if (!access.allowed) return NextResponse.json({ error: 'FORBIDDEN_PROJECT_ACCESS' }, { status: 403 });
  return null;
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    const denied = await authorizeProject(projectId, 'canEdit');
    if (denied) return denied;
    const body = await req.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: { status }
    });

    return NextResponse.json({ success: true, project: updatedProject });
  } catch (error: any) {
    console.error('Error updating project:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    const denied = await authorizeProject(projectId, 'canDelete');
    if (denied) return denied;

    // First delete some common children that might cause FK constraints if not cascaded
    await prisma.projectSchedule.deleteMany({ where: { projectId } });
    await prisma.awardedBOQItem.deleteMany({ where: { projectId } });
    await prisma.consolidatedBOQItem.deleteMany({ where: { projectId } });
    await prisma.materialRequest.deleteMany({ where: { projectId } });
    await prisma.projectUserAssignment.deleteMany({ where: { projectId } });

    // Now delete the project itself
    await prisma.project.delete({
      where: { id: projectId }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
