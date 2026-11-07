'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { validatePasswordPolicy } from '@/lib/passwordPolicy';
import { hasPermission } from '@/lib/permissions';
import { verifySession } from '@/lib/dal/auth';
import { signOut } from '@/auth';

const USER_ADMIN_ROLES = ['SUPER_ADMIN', 'SYSTEM_ADMIN', 'PROJECT_DIRECTOR'];
const PRIVILEGED_ROLES = ['SUPER_ADMIN', 'SYSTEM_ADMIN'];
// Default first-login password for accounts created from the Users screen (same default as systemResetActions);
// the user is forced to change it on first login.
const DEFAULT_NEW_USER_PASSWORD = 'admin001';

type UserAdminAction = 'canCreate' | 'canEditDraft' | 'canDeleteDraft';

// User and role management must be restricted to administrators; the proxy only checks that a session exists.
async function authorizeUserAdmin(action: UserAdminAction, requestedRole?: string) {
  const actor = await verifySession();
  if (!actor) return { ok: false as const, error: 'Unauthorized: No session found.' };
  const allowed = USER_ADMIN_ROLES.includes(actor.role) || await hasPermission(actor.id, 'SYSTEM_ROLES', action);
  if (!allowed) return { ok: false as const, error: 'Unauthorized: You do not have permission to manage users or roles.' };
  const normalizedRole = requestedRole?.toUpperCase().replace(/\s+/g, '_').trim();
  if (normalizedRole && PRIVILEGED_ROLES.includes(normalizedRole) && !PRIVILEGED_ROLES.includes(actor.role)) {
    return { ok: false as const, error: 'Unauthorized: Only system administrators can assign administrator roles.' };
  }
  return { ok: true as const, actor };
}

// Internal helper to avoid code duplication
async function _internalCreateSystemRole(roleName: string) {
  const normalized = roleName.toUpperCase().replace(/\s+/g, '_').trim();
  const existing = await prisma.systemRole.findUnique({
    where: { name: normalized }
  });
  if (!existing) {
    await prisma.systemRole.create({
      data: { name: normalized }
    });
  }

  // Ensure RBAC Role also exists
  const existingRbac = await prisma.role.findFirst({
    where: {
      OR: [
        { roleName: normalized },
        { roleCode: normalized }
      ]
    }
  });
  if (!existingRbac) {
    await prisma.role.create({
      data: {
        roleName: normalized,
        roleCode: normalized,
        description: normalized
      }
    });
  }
  return { success: true, name: normalized };
}

export async function getSystemRoles() {
  try {
    const roles = await prisma.systemRole.findMany({
      orderBy: { name: 'asc' }
    });

    // Auto-sync legacy system roles to the RBAC Role table
    for (const r of roles) {
      const normalized = r.name.toUpperCase().trim();
      const existingRbac = await prisma.role.findFirst({
        where: {
          OR: [
            { roleName: normalized },
            { roleCode: r.name }
          ]
        }
      });
      if (!existingRbac) {
        await prisma.role.create({
          data: {
            roleName: normalized,
            roleCode: r.name,
            description: normalized
          }
        });
      }
    }
    return roles.map(r => r.name);
  } catch (err: any) {
    console.error('Error in getSystemRoles:', err);
    return [];
  }
}

export async function deleteSystemRole(roleName: string) {
  try {
    if (!roleName) return { success: false, error: 'roleName is required.' };
    const authz = await authorizeUserAdmin('canDeleteDraft', roleName);
    if (!authz.ok) return { success: false, error: authz.error };

    await prisma.systemRole.delete({
      where: { name: roleName }
    });
    
    const rbac = await prisma.role.findFirst({
      where: {
        OR: [
          { roleName },
          { roleCode: roleName }
        ]
      }
    });
    if (rbac) {
      await prisma.role.delete({ where: { id: rbac.id } });
    }
    
    revalidatePath('/users');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete role.' };
  }
}

export async function updateSystemRole(oldName: string, newName: string) {
  try {
    if (!oldName || !newName) return { success: false, error: 'oldName and newName are required.' };
    const authz = await authorizeUserAdmin('canEditDraft', oldName);
    if (!authz.ok) return { success: false, error: authz.error };

    const normalizedNew = newName.toUpperCase().trim();
    if (!normalizedNew) return { success: false, error: "Role name cannot be empty" };

    const existing = await prisma.systemRole.findUnique({
      where: { name: normalizedNew }
    });
    if (existing) return { success: false, error: "A role with this name already exists" };

    await prisma.systemRole.update({
      where: { name: oldName },
      data: { name: normalizedNew }
    });
    
    const rbac = await prisma.role.findFirst({
      where: {
        OR: [
          { roleName: oldName },
          { roleCode: oldName }
        ]
      }
    });
    if (rbac) {
      await prisma.role.update({
        where: { id: rbac.id },
        data: { roleName: normalizedNew, roleCode: normalizedNew }
      });
    }
    
    revalidatePath('/users');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'An error occurred while updating the role.' };
  }
}

export async function createSystemRole(roleName: string) {
  try {
    if (!roleName) return { success: false, error: 'roleName is required.' };
    const authz = await authorizeUserAdmin('canCreate', roleName);
    if (!authz.ok) return { success: false, error: authz.error };

    const result = await _internalCreateSystemRole(roleName);
    revalidatePath('/users');
    return { success: result.success, name: result.name };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create role.' };
  }
}

export async function createUser(data: { name: string, email: string, role: string }) {
  try {
    if (!data.name || !data.email || !data.role) {
      return { success: false, error: 'All fields are required.' };
    }
    const authz = await authorizeUserAdmin('canCreate', data.role);
    if (!authz.ok) return { success: false, error: authz.error };

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });
    if (existingUser) {
      return { success: false, error: 'A user with this email already exists.' };
    }

    const finalRole = await _internalCreateSystemRole(data.role);
    if (!finalRole || !finalRole.success) {
      return { success: false, error: 'Failed to resolve system role.' };
    }

    await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: finalRole.name!,
        // Login only checks passwordHash, so the default must be hashed (a plaintext value could never log in).
        passwordHash: await bcrypt.hash(DEFAULT_NEW_USER_PASSWORD, 10),
        password: null,
        mustChangePassword: true,
      }
    });

    revalidatePath('/users');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'An unexpected database error occurred.' };
  }
}

export async function updateUser(id: string, data: { name: string, email: string, role: string, password?: string }) {
  try {
    if (!id || !data || !data.name || !data.email || !data.role) {
      return { success: false, error: 'User ID, Name, Email, and Role are required.' };
    }
    const authz = await authorizeUserAdmin('canEditDraft', data.role);
    if (!authz.ok) return { success: false, error: authz.error };
    const targetUser = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (targetUser && PRIVILEGED_ROLES.includes(targetUser.role) && !PRIVILEGED_ROLES.includes(authz.actor.role)) {
      return { success: false, error: 'Unauthorized: Only system administrators can modify administrator accounts.' };
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });
    if (existingUser && existingUser.id !== id) {
      return { success: false, error: 'A different user with this email already exists.' };
    }

    const finalRole = await _internalCreateSystemRole(data.role);
    if (!finalRole || !finalRole.success) {
      return { success: false, error: 'Failed to resolve system role.' };
    }

    const updateData: any = {
      name: data.name,
      email: data.email,
      role: finalRole.name!,
    };

    if (data.password && data.password.trim() !== '') {
      // Store a bcrypt hash (login compares passwordHash only) and never keep the plaintext.
      const policyResult = validatePasswordPolicy(data.password, data.email);
      if (!policyResult.valid) {
        return { success: false, error: policyResult.error };
      }
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
      updateData.password = null;
      updateData.mustChangePassword = true;
      updateData.sessionVersion = { increment: 1 };
    }

    await prisma.user.update({
      where: { id },
      data: updateData
    });

    revalidatePath('/users');
    revalidatePath(`/users/${id}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'An unexpected database error occurred.' };
  }
}

export async function deleteUser(id: string) {
  try {
    if (!id) return { success: false, error: 'User ID is required' };
    const authz = await authorizeUserAdmin('canDeleteDraft');
    if (!authz.ok) return { success: false, error: authz.error };
    if (authz.actor.id === id) return { success: false, error: 'You cannot delete your own account.' };
    const targetUser = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (targetUser && PRIVILEGED_ROLES.includes(targetUser.role) && !PRIVILEGED_ROLES.includes(authz.actor.role)) {
      return { success: false, error: 'Unauthorized: Only system administrators can delete administrator accounts.' };
    }

    await prisma.user.delete({
      where: { id }
    });
    
    revalidatePath('/users');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'An unexpected database error occurred.' };
  }
}

export async function resetUserPassword(targetUserId: string, newPasswordRaw: string) {
  try {
    const actorSession = await verifySession();
    if (!actorSession) {
      return { success: false, error: 'Unauthorized: No session found.' };
    }
    
    const actorUserId = actorSession.id;
    const actorRole = actorSession.role;
    
    if (actorRole !== 'SUPER_ADMIN' && actorRole !== 'SYSTEM_ADMIN' && actorRole !== 'PROJECT_DIRECTOR') {
       return { success: false, error: 'Unauthorized: You do not have permission to reset passwords.' };
    }

    if (!targetUserId || !newPasswordRaw) {
      return { success: false, error: 'Target user ID and new password are required.' };
    }

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return { success: false, error: 'Target user not found.' };
    }

    const policyResult = validatePasswordPolicy(newPasswordRaw, targetUser.email || '');
    if (!policyResult.valid) {
      return { success: false, error: policyResult.error };
    }

    const passwordHash = await bcrypt.hash(newPasswordRaw, 10);

    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        passwordHash,
        password: null,
        mustChangePassword: true,
        sessionVersion: { increment: 1 }
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: actorUserId,
        userRole: actorRole,
        moduleName: 'USER_MANAGEMENT',
        actionType: 'PASSWORD_RESET_COMPLETED',
        remarks: `Password reset initiated and completed for user ${targetUser.email}`,
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: actorUserId,
        userRole: actorRole,
        moduleName: 'USER_MANAGEMENT',
        actionType: 'USER_SESSIONS_REVOKED',
        remarks: `Sessions revoked for user ${targetUser.email} via sessionVersion increment`,
      }
    });

    revalidatePath('/users');
    return { success: true };
  } catch (err: any) {
    console.error('Password reset error:', err);
    return { success: false, error: 'An error occurred during password reset.' };
  }
}

export async function changePersonalPassword(oldPasswordRaw: string, newPasswordRaw: string, confirmationRaw: string) {
  try {
    const actorSession = await verifySession();
    if (!actorSession) {
      return { success: false, error: 'Unauthorized: No session found.' };
    }
    
    if (newPasswordRaw !== confirmationRaw) {
      return { success: false, error: 'New password and confirmation do not match.' };
    }

    const dbUser = await prisma.user.findUnique({ where: { id: actorSession.id } });
    if (!dbUser) {
      return { success: false, error: 'User not found.' };
    }

    const policyResult = validatePasswordPolicy(newPasswordRaw, dbUser.email || '');
    if (!policyResult.valid) {
      return { success: false, error: policyResult.error };
    }

    const isOldValid = await bcrypt.compare(oldPasswordRaw, dbUser.passwordHash || '');
    if (!isOldValid) {
      return { success: false, error: 'Current password is incorrect.' };
    }

    if (newPasswordRaw.toLowerCase() === dbUser.email?.toLowerCase()) {
      return { success: false, error: 'Password cannot be equal to the email address.' };
    }

    const isSameAsOld = await bcrypt.compare(newPasswordRaw, dbUser.passwordHash || '');
    if (isSameAsOld) {
      return { success: false, error: 'New password cannot be the same as the old password.' };
    }

    const passwordHash = await bcrypt.hash(newPasswordRaw, 10);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: dbUser.id },
        data: {
          passwordHash,
          password: null,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          sessionVersion: { increment: 1 }
        }
      });

      await tx.auditLog.create({
        data: {
          userId: dbUser.id,
          userRole: dbUser.role,
          moduleName: 'SECURITY',
          actionType: 'PASSWORD_CHANGED',
          remarks: `User changed their personal password successfully.`,
        }
      });

      await tx.auditLog.create({
        data: {
          userId: dbUser.id,
          userRole: dbUser.role,
          moduleName: 'SECURITY',
          actionType: 'USER_SESSIONS_REVOKED',
          remarks: `All existing sessions for this user have been revoked via sessionVersion increment.`,
        }
      });
    });

  } catch (err: any) {
    console.error('Password change error:', err);
    return { success: false, error: 'An error occurred during password change.' };
  }
  
  // Call signOut OUTSIDE of the try-catch because it throws NEXT_REDIRECT
  await signOut({ redirectTo: '/login' });
}
