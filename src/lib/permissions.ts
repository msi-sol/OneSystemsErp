import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

const MASTER_ADMIN_MODULES = [
  // Sidebar module keys
  'DASHBOARD', 'PROJECT_MANAGEMENT', 'AI_COMMAND_CENTER', 'PROCUREMENT', 'INVENTORY',
  'MATERIAL_ISSUANCE', 'FINANCE', 'SUBCONTRACTING', 'ACCOMPLISHMENTS', 'PAYROLL',
  'EQUIPMENT', 'VARIATION_ORDERS', 'REPORTS', 'DOCUMENTS', 'KNOWLEDGE_CENTER',
  'SYSTEM_ROLES', 'SYSTEM_SETTINGS',
  // Functional modules
  'WORKER_DATABASE', 'DELIVERY_RECEIVING', 'PURCHASE_ORDER', 'PAYMENT_ISSUANCE',
];

export async function getUserPermissions(userId: string) {
  let simulatedRole;
  try {
    const cookieStore = await cookies();
    simulatedRole = cookieStore.get('simulatedRole')?.value;
  } catch (err) {
    // Expected when running in background CLI scripts outside Next.js request scope
  }

  let user = null;
  let userRoles = [];
  try {
    const results = await Promise.all([
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
    user = results[0];
    userRoles = results[1] as any;
  } catch (error) {
    console.error("Database connection failed in getUserPermissions:", error);
  }

  // Fallback to demo user if session is invalid or missing
  if (!user) {
    return { IS_GUEST_USER: true };
  }

  const isActualAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'SYSTEM_ADMIN' || user?.role === 'ADMIN' || user?.role === 'PROJECT_DIRECTOR' || user?.role === 'DIRECTORS';

  if (simulatedRole && isActualAdmin) {
    return getPermissionsForRole(simulatedRole);
  }

  // Aggregate permissions across all assigned roles
  // If a user has multiple roles, we grant them the union of permissions (OR logic).
  const aggregatedPermissions: Record<string, any> = {};

  // First, get permissions from the primary string role
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

  // Then aggregate from userRoles relationship if it exists
  userRoles.forEach((ur: { role: { isActive: boolean; rolePermissions: any[]; roleCode?: string; roleName?: string } }) => {
    if (!ur.role.isActive) return;

    ur.role.rolePermissions.forEach((rp: { moduleName: string; [key: string]: any }) => {
      if (!aggregatedPermissions[rp.moduleName]) {
        aggregatedPermissions[rp.moduleName] = { ...rp };
      } else {
        // Apply OR logic for boolean permissions
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

    // Auto-populate commonly checked modules to bypass manual checks in frontend
    MASTER_ADMIN_MODULES.forEach(mod => {
      if (!aggregatedPermissions[mod]) aggregatedPermissions[mod] = {};
      const actions = ['canView', 'canCreate', 'canEditDraft', 'canDeleteDraft', 'canApprove', 'canSubmit', 'canLock', 'canExport'];
      actions.forEach(action => {
        aggregatedPermissions[mod][action] = true;
      });
    });
  }

  // >>> GUEST USER OVERRIDE <<<
  // The Prompt requires a universal READ-ONLY / VIEW-ONLY system role.
  const isGuestUser = user?.role === 'GUEST_USER' || user?.role === 'GUEST USER' || 
                      userRoles.some((ur: { role: { roleCode?: string; roleName?: string } }) => ur.role.roleCode === 'GUEST_USER' || ur.role.roleName === 'GUEST USER');

  if (isGuestUser) {
    aggregatedPermissions['IS_ADMIN'] = false;
    aggregatedPermissions['IS_GUEST_USER'] = true;
    
    // Give canView true for all standard modules, but false for System Admin settings
    const ALL_MODULES = [
      ...MASTER_ADMIN_MODULES,
      'BOQ', 'MATERIALS_REQUEST', 'PURCHASE_ORDER', 'EXPENSES', 'PETTY_CASH',
      'JOB_ORDERS', 'BILLING', 'WORKER_DATABASE', 'EXECUTIVE_DASHBOARD', 'AI_VALIDATION'
    ];

    ALL_MODULES.forEach(mod => {
      // Block access to System Admin modules
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

  // Handle legacy SYSTEM_ADMIN cookie mapped to SUPER_ADMIN
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
      const actions = ['canView', 'canCreate', 'canEditDraft', 'canDeleteDraft', 'canApprove', 'canSubmit', 'canLock', 'canExport'];
      actions.forEach(action => {
        aggregatedPermissions[mod][action] = true;
      });
    });
  }

  // >>> GUEST USER OVERRIDE <<<
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

export async function hasPermission(userId: string, moduleName: string, action: string): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  if (permissions.IS_ADMIN) return true;
  const modulePerms = permissions[moduleName];
  if (!modulePerms) return false;
  
  return !!modulePerms[action];
}

// Security Helper to run inside Server Actions
export async function requirePermission(userId: string, moduleName: string, action: string) {
  const authorized = await hasPermission(userId, moduleName, action);
  if (!authorized) {
    throw new Error(`Unauthorized Action: You do not have permission to ${action.replace('can', '')} in the ${moduleName} module.`);
  }
}
