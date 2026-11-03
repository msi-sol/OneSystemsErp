'use server';

import bcrypt from 'bcryptjs';
import { auth, signOut } from '@/auth';
import { prismaBase as prisma } from '@/lib/prisma-base';
import { validatePasswordPolicy } from '@/lib/passwordPolicy';

export type PasswordChangeState = { error: string };

export async function changePassword(
  _previousState: PasswordChangeState,
  formData: FormData,
): Promise<PasswordChangeState> {
  try {
    const session = await auth();
    if (!session?.user?.id || !Number.isSafeInteger(session.user.sessionVersion)) {
      return { error: 'Your session expired. Sign in again to change your password.' };
    }
    const currentPassword = formData.get('currentPassword');
    const newPassword = formData.get('newPassword');
    const confirmation = formData.get('confirmation');
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' ||
        typeof confirmation !== 'string' || !currentPassword || !newPassword || !confirmation) {
      return { error: 'Enter your current password, a new password, and its confirmation.' };
    }
    if (Buffer.byteLength(currentPassword, 'utf8') > 1024 || Buffer.byteLength(newPassword, 'utf8') > 72) {
      return { error: 'Password is too long. Choose a shorter password (up to 72 bytes).' };
    }
    if (newPassword !== confirmation) return { error: 'New password and confirmation do not match.' };
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, role: true, status: true, sessionVersion: true, passwordHash: true, lockedUntil: true },
    });
    if (!user || user.status !== 'ACTIVE' || user.sessionVersion !== session.user.sessionVersion ||
        (user.lockedUntil && user.lockedUntil > new Date())) {
      return { error: 'Your session is no longer valid. Sign in again.' };
    }
    const policy = validatePasswordPolicy(newPassword, user.email || undefined);
    if (!policy.valid) return { error: policy.error || 'Choose a stronger new password.' };
    if (!user.passwordHash || !await bcrypt.compare(currentPassword, user.passwordHash)) {
      return { error: 'Current password is incorrect.' };
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return { error: 'Choose a new password that differs from your current password.' };
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const now = new Date();
    await prisma.$transaction(async tx => {
      // Compare the checked hash/version again so a concurrent reset cannot be overwritten.
      const updated = await tx.user.updateMany({
        where: {
          id: user.id, status: 'ACTIVE', sessionVersion: user.sessionVersion, passwordHash: user.passwordHash,
          OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
        },
        data: {
          passwordHash, password: null, mustChangePassword: false, passwordChangedAt: now,
          sessionVersion: { increment: 1 }, failedLoginAttempts: 0,
        },
      });
      if (updated.count !== 1) throw new Error('Password changed concurrently');
      await tx.passwordRecoveryToken.updateMany({
        where: { userId: user.id, consumedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id, userRole: user.role, moduleName: 'SECURITY', actionType: 'PASSWORD_CHANGED',
          remarks: 'User changed their password; existing sessions and recovery tokens were revoked.',
        },
      });
    });
  } catch {
    return { error: 'Password could not be changed. Try again, or sign in again if your session expired.' };
  }
  // Auth.js clears the session cookie and redirects; keep its redirect outside the catch.
  await signOut({ redirectTo: '/login' });
  return { error: '' };
}
