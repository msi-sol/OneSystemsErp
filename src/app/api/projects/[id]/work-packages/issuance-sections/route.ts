import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { readWorkPackagePlanDetails } from '@/lib/scheduling/work-package-details-types';
import { readPackageMaterialPlanning } from '@/lib/scheduling/work-package-material-planning';

/**
 * Work packages (sections) a material issuance can be charged to, with each package's material allocation where one
 * is set (required vs already issued). Used by the Material Issuance form so a slip names its section and quantities
 * above that section's allocation are flagged (minutes 2026-11-09, issuance by section).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params;
    const actor = await getSessionActor();
    const access = await planningCapacity(actor, projectId);
    if (!access.canView) return NextResponse.json({ error: 'PROJECT_ACCESS_REQUIRED' }, { status: 403 });
    const schedule = await prisma.projectSchedule.findFirst({
      where: { projectId, workflowStatus: 'ACTIVE_BASELINE' },
      include: { activities: { select: { id: true, activityCode: true, name: true }, orderBy: { activityCode: 'asc' } } },
    });
    if (!schedule) return NextResponse.json({ sections: [] });
    const details = readWorkPackagePlanDetails(schedule.description);
    const tx = prisma as unknown as Prisma.TransactionClient;
    const sections = [];
    for (const activity of schedule.activities) {
      const sourcePackageId = details.packageIdentities?.[activity.id] || activity.id;
      const requirements = await readPackageMaterialPlanning(tx, projectId, sourcePackageId);
      sections.push({
        activityId: activity.id, code: activity.activityCode, name: activity.name,
        materials: Object.fromEntries(requirements.map(row => [row.materialId, { required: Number(row.requiredQuantity), issued: Number(row.issued) }])),
      });
    }
    return NextResponse.json({ sections });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'SECTIONS_UNAVAILABLE' }, { status: 400 });
  }
}
