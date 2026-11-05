import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkSchedulingAccess, getSessionActor } from '@/lib/scheduling/authUtils';
import { assertScheduleEditable } from '@/lib/scheduling/scheduleWorkflow';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;

    let actor;
    try {
      actor = await getSessionActor();
    } catch {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const access = await checkSchedulingAccess(actor.id, actor.role, projectId, 'canDeleteDraft');
    if (!access.allowed) {
      return NextResponse.json({ error: 'You do not have permission to delete this schedule.' }, { status: 403 });
    }

    const schedules = await prisma.projectSchedule.findMany({
      where: { projectId }
    });

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    for (const schedule of schedules) {
      assertScheduleEditable(schedule);
    }

    const txOperations: any[] = [];
    
    for (const schedule of schedules) {
      txOperations.push(
        prisma.scheduleDependency.deleteMany({ where: { scheduleId: schedule.id } }),
        prisma.scheduleBOQAllocation.deleteMany({ where: { scheduleId: schedule.id } }),
        prisma.scheduleActivity.deleteMany({ where: { scheduleId: schedule.id } }),
        prisma.scheduleWBS.deleteMany({ where: { scheduleId: schedule.id } }),
        prisma.scheduleMilestone.deleteMany({ where: { scheduleId: schedule.id } }),
        prisma.projectSchedule.delete({ where: { id: schedule.id } })
      );
    }
      // Set the project status back to PLANNING since schedule is wiped
      txOperations.push(
        prisma.project.update({
          where: { id: projectId },
          data: { status: 'PLANNING' }
        })
      );

    await prisma.$transaction(txOperations);

    return NextResponse.json({ success: true, message: 'Schedule successfully deleted.' });
  } catch (error: any) {
    if (error.message === 'SCHEDULE_NOT_EDITABLE_IN_CURRENT_STATUS') {
      return NextResponse.json({ error: 'Only a schedule still being drafted can be deleted.' }, { status: 409 });
    }
    console.error('Error deleting schedule:', error);
    return NextResponse.json({ error: 'Failed to delete schedule.' }, { status: 500 });
  }
}
