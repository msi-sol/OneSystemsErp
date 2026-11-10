import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { cookies } from 'next/headers';
import { wpsCapacitiesRequired } from './wps-capacity-mode';

export async function planningCapacity(actor: { id: string; role: string }, projectId: string) {
  const [assignment, project, view, edit, grants, sourceUpload] = await Promise.all([
    prisma.projectUserAssignment.findUnique({ where: { userId_projectId: { userId: actor.id, projectId } }, select: { projectRole: true, assignmentStatus: true } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { status: true } }),
    hasPermission(actor.id, 'PROJECT_MANAGEMENT', 'canView'),
    hasPermission(actor.id, 'PROJECT_MANAGEMENT', 'canEditDraft'),
    prisma.workPackageCapacityGrant.findMany({ where: { projectId, userId: actor.id, revokedAt: null }, select: { capacity: true } }),
    prisma.uploadedWorkbookFile.findFirst({
      where: { projectId, templateCode: 'BOQ_WORKSPACE', templateName: 'BOQ Workspace Import' },
      orderBy: [{ uploadedAt: 'asc' }, { id: 'asc' }],
      select: { uploadedBy: true },
    }),
  ]);
  const activeAssignment = assignment?.assignmentStatus === 'active';
  const simulatedRole = (await cookies()).get('simulatedRole')?.value;
  const simulation = simulatedRole && ['SUPER_ADMIN', 'SYSTEM_ADMIN', 'ADMIN', 'DIRECTORS', 'PROJECT_DIRECTOR'].includes(actor.role) ? simulatedRole : null;
  const roles = new Set([simulation || actor.role, ...(activeAssignment && !simulation ? [assignment.projectRole] : [])]);
  const admin = roles.has('SUPER_ADMIN') || roles.has('SYSTEM_ADMIN') || roles.has('ADMIN');
  const canView = !!project && (view || activeAssignment || admin);
  const open = canView && project?.status !== 'ARCHIVED';
  const sourceUploaderAccess = open && actor.role === 'SUPER_ADMIN' && !simulation && sourceUpload?.uploadedBy === actor.id;
  const held = new Set(grants.map(grant=>grant.capacity));
  if(simulation) { held.clear(); if(['PLANNER','ESTIMATOR'].includes(simulation))held.add('PLANNER'); if(['PROJECT_ENGINEER','SITE_ENGINEER'].includes(simulation))held.add('PROJECT_ENGINEER'); if(simulation==='PROJECT_MANAGER')held.add('PROJECT_MANAGER'); }
  else if (sourceUploaderAccess) {
    held.add('PLANNER');
    held.add('PROJECT_ENGINEER');
    held.add('PROJECT_MANAGER');
  }
  const canEdit = open && (edit || admin || (activeAssignment && ['PLANNER', 'PROJECT_ENGINEER', 'SITE_ENGINEER'].includes(assignment.projectRole)));
  const canEngineerReview = open && (admin || roles.has('PROJECT_ENGINEER') || roles.has('SITE_ENGINEER'));
  const canApprove = open && (admin || roles.has('PROJECT_MANAGER'));
  // With capacity rules off, the plan follows the same role rules as the BOQ steps; no capacity grants are needed.
  const strict = wpsCapacitiesRequired();
  return {
    canView,
    canEdit,
    canEngineerReview,
    canApprove,
    capacities: [...held],
    sourceUploaderAccess,
    canEditPlan: strict ? open && (held.has('PLANNER') || held.has('PROJECT_ENGINEER')) : canEdit,
    canReviewPlan: strict ? open && held.has('PROJECT_ENGINEER') : canEngineerReview,
    canApprovePlan: strict ? open && held.has('PROJECT_MANAGER') : canApprove,
    canManageCapacities: strict && open && admin,
    canRecordSiteLogs: open && (admin || ['PROJECT_MANAGER','PROJECT_ENGINEER','SITE_ENGINEER'].some(role=>roles.has(role))),
    canManageWeekly: open && (admin || ['PROJECT_MANAGER','PLANNER','ESTIMATOR'].some(role=>roles.has(role))),
  };
}
