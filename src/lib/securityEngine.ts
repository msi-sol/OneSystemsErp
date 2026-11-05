import { prisma } from '@/lib/prisma';
import { getUserPermissions } from '@/lib/permissions';

export type ActionType = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'submit' | 'lock' | 'export' | 'read' | 'write' | 'upload' | 'download';

export interface SecurityContext {
  userId: string;
  projectId?: string;
  module: string;
  action: ActionType;
  resourceId?: string;
  resourceType?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestPath?: string;
}

const ACTION_RIGHTS: Record<ActionType, string> = {
  view: 'canView',
  read: 'canView',
  create: 'canCreate',
  edit: 'canEditDraft',
  write: 'canEditDraft',
  delete: 'canDeleteDraft',
  approve: 'canApprove',
  submit: 'canSubmit',
  lock: 'canLock',
  export: 'canExport',
  upload: 'canUploadAttachment',
  download: 'canDownloadAttachment',
};

export async function canAccess(context: SecurityContext): Promise<boolean> {
  const { userId, projectId, module, action } = context;

  if (!userId) {
    await logSecurityEvent({ ...context, status: 'BLOCKED', threatType: 'UNAUTHENTICATED_ACCESS', severity: 'HIGH', message: 'User is not authenticated' });
    return false;
  }

  // 1. Get user details
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { userRoles: { include: { role: true } } } });
  if (!user || user.status !== 'ACTIVE') {
    await logSecurityEvent({ ...context, status: 'BLOCKED', threatType: 'INACTIVE_USER_ACCESS', severity: 'HIGH', message: 'User is inactive or deleted' });
    return false;
  }

  // 2. Check Module-Level RBAC Permissions
  const permissions = await getUserPermissions(userId);
  if (!permissions.IS_ADMIN) {
    const modulePerms = permissions[module];
    if (!modulePerms) {
      await logSecurityEvent({ ...context, status: 'BLOCKED', threatType: 'UNAUTHORIZED_MODULE_ACCESS', severity: 'MEDIUM', message: `No access to module ${module}` });
      return false;
    }
    
    if (!modulePerms[ACTION_RIGHTS[action]]) {
      await logSecurityEvent({ ...context, status: 'BLOCKED', threatType: 'UNAUTHORIZED_ACTION', severity: 'MEDIUM', message: `No permission to ${action} in ${module}` });
      return false;
    }

    // Explicit check for sensitive modules
    if (module === 'PAYROLL' && !modulePerms.canView) {
        await logSecurityEvent({ ...context, status: 'BLOCKED', threatType: 'UNAUTHORIZED_PAYROLL_ACCESS', severity: 'HIGH', message: `Attempt to access payroll without explicit permission` });
        return false;
    }

    if (module === 'FINANCE' && !modulePerms.canView) {
        await logSecurityEvent({ ...context, status: 'BLOCKED', threatType: 'UNAUTHORIZED_FINANCIAL_ACCESS', severity: 'HIGH', message: `Attempt to access financial data without explicit permission` });
        return false;
    }
  }

  // Guest User Override Check
  if (permissions.IS_GUEST_USER && ['create', 'edit', 'delete', 'approve', 'submit', 'lock', 'upload'].includes(action)) {
    await logSecurityEvent({ ...context, status: 'BLOCKED', threatType: 'GUEST_WRITE_ATTEMPT', severity: 'MEDIUM', message: `Guest user attempted a write action: ${action}` });
    return false;
  }

  // 3. Check Project-Level PBAC (If project context is provided)
  if (projectId) {
    if (!permissions.IS_ADMIN) { // Admins have global access
      const assignment = await prisma.projectUserAssignment.findUnique({
        where: {
          userId_projectId: {
            userId: userId,
            projectId: projectId
          }
        }
      });

      if (!assignment || assignment.assignmentStatus !== 'active') {
        await logSecurityEvent({ ...context, status: 'BLOCKED', threatType: 'CROSS_PROJECT_ACCESS_ATTEMPT', severity: 'CRITICAL', message: `User attempted to access unassigned project ${projectId}` });
        return false;
      }
    }
  }

  // If we reach here, log success if it's a sensitive action
  if (['approve', 'delete', 'export'].includes(action) || ['PAYROLL', 'FINANCE', 'SYSTEM_SETTINGS'].includes(module)) {
    await logSecurityEvent({ ...context, status: 'ALLOWED', threatType: 'NONE', severity: 'INFO', message: `Sensitive action ${action} performed in ${module}` });
  }

  return true;
}

import { logFullSecurityEvent } from './securityLogger';

export async function logSecurityEvent(data: Partial<SecurityContext> & { status: string, threatType: string, message: string, severity?: string }) {
  try {
    const category = getCategoryForModule(data.module || '');
    
    await logFullSecurityEvent({
      userId: data.userId,
      projectId: data.projectId,
      module: data.module,
      actionAttempted: data.action,
      resourceId: data.resourceId,
      resourceType: data.resourceType,
      sourceIp: data.ipAddress,
      userAgent: data.userAgent,
      sessionId: data.sessionId,
      endpoint: data.requestPath,
      status: data.status,
      threatType: data.threatType,
      message: data.message,
      severity: (data.severity as any) || (data.status === 'BLOCKED' ? 'HIGH' : 'INFO'),
      category: category,
      threatDetected: data.threatType,
      systemResponse: data.status === 'BLOCKED' ? 'Blocked Request' : 'Logged Request',
      result: data.status === 'BLOCKED' ? 'Blocked' : 'Allowed',
      dataExposure: data.status === 'BLOCKED' ? 'None' : 'Possible',
      simulated: false,
    });
  } catch (e) {
    console.error('Failed to log security event:', e);
  }
}

function getCategoryForModule(moduleName: string) {
  if (['AUTHENTICATION', 'AUTHORIZATION', 'SYSTEM_ROLES', 'USERS'].includes(moduleName)) return 'AUTHENTICATION';
  if (['DOCUMENTS', 'FILE_MANAGEMENT'].includes(moduleName)) return 'FILE';
  if (['AI_COMMAND_CENTER', 'KNOWLEDGE_CENTER'].includes(moduleName)) return 'AI';
  if (['PAYROLL', 'FINANCE'].includes(moduleName)) return 'SENSITIVE_DATA';
  return 'AUTHORIZATION';
}
