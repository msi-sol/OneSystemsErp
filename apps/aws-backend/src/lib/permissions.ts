import { prisma } from './prisma';
import { PrismaClient } from '@prisma/client';

const MASTER_ADMIN_MODULES = [
  'DASHBOARD', 'PROJECT_MANAGEMENT', 'AI_COMMAND_CENTER', 'PROCUREMENT', 'INVENTORY',
  'MATERIAL_ISSUANCE', 'FINANCE', 'SUBCONTRACTING', 'ACCOMPLISHMENTS', 'PAYROLL',
  'EQUIPMENT', 'VARIATION_ORDERS', 'REPORTS', 'DOCUMENTS', 'KNOWLEDGE_CENTER',
  'SYSTEM_ROLES', 'SYSTEM_SETTINGS',
  'WORKER_DATABASE', 'DELIVERY_RECEIVING', 'PURCHASE_ORDER', 'PAYMENT_ISSUANCE',
];

export async function getUserPermissions(userId: string, simulatedRole?: string) {
  let [user, userRoles] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            rolePermissions: true
          }
        }
      }
    })
  ]);

  if (!user) {
    const demoUser = await prisma.user.findFirst({
      where: { email: 'J.BURNS2372@GMAIL.COM' },
      select: { id: true, role: true }
    });
    if (demoUser) {
      user = demoUser;
      userRoles = await prisma.userRole.findMany({
        where: { userId: demoUser.id },
        include: {
          role: {
            include: {
              rolePermissions: true
            }
          }
        }
      });
    }
  }

  const isActualAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'SYSTEM_ADMIN' || user?.role === 'ADMIN' || user?.role === 'PROJECT_DIRECTOR' || user?.role === 'DIRECTORS';

  if (simulatedRole && isActualAdmin) {
    return getPermissionsForRole(simulatedRole);
  }

  const aggregatedPermissions: Record<string, any> = {};

  if (user?.role) {
    const primaryRole = await prisma.role.findFirst({
      where: {
        OR: [
          { roleName: user.role },
          { roleCode: user.role }
        ]
      },
      include: { rolePermissions: true }
    });

    if (primaryRole) {
      primaryRole.rolePermissions.forEach(rp => {
        aggregatedPermissions[rp.moduleName] = { ...rp };
      });
    }
  }

  userRoles.forEach(ur => {
    if (!ur.role.isActive) return;

    ur.role.rolePermissions.forEach(rp => {
      if (!aggregatedPermissions[rp.moduleName]) {
        aggregatedPermissions[rp.moduleName] = { ...rp };
      } else {
        Object.keys(rp).forEach(key => {
          if (typeof (rp as any)[key] === 'boolean') {
            aggregatedPermissions[rp.moduleName][key] = aggregatedPermissions[rp.moduleName][key] || (rp as any)[key];
          }
        });
      }
    });
  });

  if (user?.role === 'SUPER_ADMIN' || user?.role === 'SYSTEM_ADMIN') {
    aggregatedPermissions['IS_ADMIN'] = true;
    MASTER_ADMIN_MODULES.forEach(mod => {
      if (!aggregatedPermissions[mod]) aggregatedPermissions[mod] = {};
      const actions = ['canView', 'canCreate', 'canEdit', 'canDelete', 'canApprove', 'canSubmit', 'canLock', 'canExport', 'canEditDraft'];
      actions.forEach(action => {
        aggregatedPermissions[mod][action] = true;
      });
    });
  }

  const isGuestUser = user?.role === 'GUEST_USER' || user?.role === 'GUEST USER' || 
                      userRoles.some(ur => ur.role.roleCode === 'GUEST_USER' || ur.role.roleName === 'GUEST USER');

  if (isGuestUser) {
    aggregatedPermissions['IS_ADMIN'] = false;
    aggregatedPermissions['IS_GUEST_USER'] = true;
    
    const ALL_MODULES = [
      ...MASTER_ADMIN_MODULES,
      'BOQ', 'MATERIALS_REQUEST', 'PURCHASE_ORDER', 'EXPENSES', 'PETTY_CASH',
      'JOB_ORDERS', 'BILLING', 'WORKER_DATABASE', 'EXECUTIVE_DASHBOARD', 'AI_VALIDATION'
    ];

    ALL_MODULES.forEach(mod => {
      if (['SYSTEM_ROLES', 'SYSTEM_SETTINGS', 'USERS'].includes(mod)) {
        aggregatedPermissions[mod] = { canView: false };
      } else {
        aggregatedPermissions[mod] = {
          canView: true,
          canCreate: false,
          canEdit: false,
          canUpdate: false,
          canDelete: false,
          canSubmit: false,
          canApprove: false,
          canReject: false,
          canCancel: false,
          canUpload: false,
          canDownload: false,
          canExport: false,
          canPrint: false,
          canImport: false,
          canGenerate: false,
          canProcess: false,
          canPost: false,
          canPay: false,
          canRelease: false,
          canLock: false,
          canUnlock: false,
          canConfigure: false,
          canManageUsers: false,
          canManageRoles: false,
          canResetData: false,
          canBackupRestore: false,
          canRunWriteAIAction: false,
          canOverrideAIValidation: false,
          canEditDraft: false,
          canVoidRecord: false,
          canViewAuditLogs: true,
          canUploadAttachment: false,
          canDownloadAttachment: false,
          canReturnForCorrection: false,
          canRevise: false,
          canUnlockWithAuthorization: false,
          canReleasePayment: false,
          canMarkAsPaid: false,
          canDeleteDraft: false
        };
      }
    });
  }

  return aggregatedPermissions;
}

export async function getPermissionsForRole(roleCode: string) {
  const aggregatedPermissions: Record<string, any> = {};

  const effectiveRoleCode = roleCode === 'SYSTEM_ADMIN' ? 'SUPER_ADMIN' : roleCode;

  const roleRecord = await prisma.role.findFirst({
    where: { OR: [{ roleName: effectiveRoleCode }, { roleCode: effectiveRoleCode }] },
    include: { rolePermissions: true }
  });

  if (roleRecord) {
    roleRecord.rolePermissions.forEach(rp => {
      aggregatedPermissions[rp.moduleName] = { ...rp };
    });
  }

  if (effectiveRoleCode === 'SUPER_ADMIN' || effectiveRoleCode === 'SYSTEM_ADMIN') {
    aggregatedPermissions['IS_ADMIN'] = true;
    MASTER_ADMIN_MODULES.forEach(mod => {
      if (!aggregatedPermissions[mod]) aggregatedPermissions[mod] = {};
      const actions = ['canView', 'canCreate', 'canEdit', 'canDelete', 'canApprove', 'canSubmit', 'canLock', 'canExport', 'canEditDraft'];
      actions.forEach(action => {
        aggregatedPermissions[mod][action] = true;
      });
    });
  }

  if (effectiveRoleCode === 'GUEST_USER' || effectiveRoleCode === 'GUEST USER') {
    aggregatedPermissions['IS_ADMIN'] = false;
    aggregatedPermissions['IS_GUEST_USER'] = true;
    
    const ALL_MODULES = [
      ...MASTER_ADMIN_MODULES,
      'BOQ', 'MATERIALS_REQUEST', 'PURCHASE_ORDER', 'EXPENSES', 'PETTY_CASH',
      'JOB_ORDERS', 'BILLING', 'WORKER_DATABASE', 'EXECUTIVE_DASHBOARD', 'AI_VALIDATION'
    ];

    ALL_MODULES.forEach(mod => {
      if (['SYSTEM_ROLES', 'SYSTEM_SETTINGS', 'USERS'].includes(mod)) {
        aggregatedPermissions[mod] = { canView: false };
      } else {
        aggregatedPermissions[mod] = {
          canView: true,
          canCreate: false,
          canEdit: false,
          canUpdate: false,
          canDelete: false,
          canSubmit: false,
          canApprove: false,
          canReject: false,
          canCancel: false,
          canUpload: false,
          canDownload: false,
          canExport: false,
          canPrint: false,
          canImport: false,
          canGenerate: false,
          canProcess: false,
          canPost: false,
          canPay: false,
          canRelease: false,
          canLock: false,
          canUnlock: false,
          canConfigure: false,
          canManageUsers: false,
          canManageRoles: false,
          canResetData: false,
          canBackupRestore: false,
          canRunWriteAIAction: false,
          canOverrideAIValidation: false,
          canEditDraft: false,
          canVoidRecord: false,
          canViewAuditLogs: true,
          canUploadAttachment: false,
          canDownloadAttachment: false,
          canReturnForCorrection: false,
          canRevise: false,
          canUnlockWithAuthorization: false,
          canReleasePayment: false,
          canMarkAsPaid: false,
          canDeleteDraft: false
        };
      }
    });
  }

  return aggregatedPermissions;
}

export async function hasPermission(userId: string, moduleName: string, action: string, simulatedRole?: string): Promise<boolean> {
  const permissions = await getUserPermissions(userId, simulatedRole);
  if (permissions.IS_ADMIN) return true;
  const modulePerms = permissions[moduleName];
  if (!modulePerms) return false;
  
  return !!modulePerms[action];
}

export async function requirePermission(userId: string, moduleName: string, action: string, simulatedRole?: string) {
  const authorized = await hasPermission(userId, moduleName, action, simulatedRole);
  if (!authorized) {
    throw new Error(`Unauthorized Action: You do not have permission to ${action.replace('can', '')} in the ${moduleName} module.`);
  }
}
