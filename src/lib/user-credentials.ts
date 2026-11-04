import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { validatePasswordPolicy } from './passwordPolicy';

const BCRYPT_ROUNDS = 12;
// bcrypt ignores everything after this many bytes.
const BCRYPT_MAX_BYTES = 72;

const USER_ADMIN_ROLES = new Set(['SUPER_ADMIN', 'SYSTEM_ADMIN', 'PROJECT_DIRECTOR']);
const PRIVILEGED_ROLES = new Set(['SUPER_ADMIN', 'SYSTEM_ADMIN', 'ADMIN']);

export interface CredentialActor {
  id: string;
  role: string;
}

export function normalizeRoleName(roleName: string) {
  return roleName.toUpperCase().replace(/\s+/g, '_').trim();
}

export function canAdministerUsers(actorRole: string) {
  return USER_ADMIN_ROLES.has(actorRole);
}

// Setting a credential on an account lets the actor sign in as it, so only a
// SUPER_ADMIN may touch accounts that hold administrator roles.
export function canManageAccountRole(actorRole: string, accountRole: string) {
  if (!canAdministerUsers(actorRole)) return false;
  return actorRole === 'SUPER_ADMIN' || !PRIVILEGED_ROLES.has(normalizeRoleName(accountRole));
}

export function generateTemporaryPassword() {
  return randomBytes(18).toString('base64url');
}

export function validateNewPassword(newPassword: string, email: string): { valid: boolean; error?: string } {
  if (Buffer.byteLength(newPassword || '', 'utf8') > BCRYPT_MAX_BYTES) {
    return { valid: false, error: `Password is too long. Choose a shorter password (up to ${BCRYPT_MAX_BYTES} bytes).` };
  }
  return validatePasswordPolicy(newPassword, email);
}

// The returned password exists nowhere else, so callers must only hand it out
// after the surrounding transaction has committed.
export async function createUserWithTemporaryPassword(
  tx: Prisma.TransactionClient,
  actor: CredentialActor,
  user: { name: string; email: string; role: string },
) {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

  const created = await tx.user.create({
    data: { ...user, passwordHash, mustChangePassword: true },
  });

  await tx.auditLog.create({
    data: {
      userId: actor.id,
      userRole: actor.role,
      moduleName: 'USER_MANAGEMENT',
      transactionId: created.id,
      actionType: 'USER_CREATED',
      remarks: `User ${user.email} created with a temporary password that must be changed at first sign-in`,
    },
  });

  return temporaryPassword;
}

// Callers validate newPassword first so a rejected password never opens a transaction.
export async function resetPasswordForUser(
  tx: Prisma.TransactionClient,
  actor: CredentialActor,
  target: { id: string; email: string | null },
  newPassword: string,
) {
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await tx.user.update({
    where: { id: target.id },
    data: {
      passwordHash,
      password: null,
      mustChangePassword: true,
      failedLoginAttempts: 0,
      sessionVersion: { increment: 1 },
    },
  });

  // A recovery link issued before the reset must not be able to replace the new password.
  await tx.passwordRecoveryToken.updateMany({
    where: { userId: target.id, consumedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await tx.auditLog.create({
    data: {
      userId: actor.id,
      userRole: actor.role,
      moduleName: 'USER_MANAGEMENT',
      transactionId: target.id,
      actionType: 'PASSWORD_RESET_COMPLETED',
      remarks: `Password reset initiated and completed for user ${target.email}`,
    },
  });

  await tx.auditLog.create({
    data: {
      userId: actor.id,
      userRole: actor.role,
      moduleName: 'USER_MANAGEMENT',
      transactionId: target.id,
      actionType: 'USER_SESSIONS_REVOKED',
      remarks: `Sessions revoked for user ${target.email} via sessionVersion increment`,
    },
  });
}
