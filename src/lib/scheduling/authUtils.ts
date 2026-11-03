import { verifySession } from '@/lib/dal/auth';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { hasPermission } from '@/lib/permissions';

export async function getSessionActor() {
  const cookieStore = await cookies();
  const __session = await verifySession();
  const userId = __session?.id || '';
  
  if (!userId || __session?.mustChangePassword) {
    throw new Error('UNAUTHORIZED: No active session');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.mustChangePassword) {
    throw new Error('UNAUTHORIZED: User not found');
  }

  return { id: user.id, role: user.role, name: user.name, email: user.email };
}

export async function checkSchedulingAccess(actorId: string, actorRole: string, projectId: string, action: string = 'canView') {
  // Use real PBAC permission check
  const hasGlobalAccess = await hasPermission(actorId, 'PROJECT_MANAGEMENT', action);
  if (hasGlobalAccess) {
    return { allowed: true, projectRole: actorRole };
  }

  const assignment = await prisma.projectUserAssignment.findUnique({
    where: { userId_projectId: { userId: actorId, projectId } }
  });

  if (!assignment) {
    return { allowed: false };
  }

  // Check PBAC for the project-level role
  const { getPermissionsForRole } = require('@/lib/permissions');
  const projectRolePerms = await getPermissionsForRole(assignment.projectRole);
  
  if (projectRolePerms['PROJECT_MANAGEMENT'] && projectRolePerms['PROJECT_MANAGEMENT'][action]) {
    return { 
      allowed: true, 
      projectRole: assignment.projectRole 
    };
  }

  return { allowed: false, projectRole: assignment.projectRole };
}
