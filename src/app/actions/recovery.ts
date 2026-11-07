'use server';

import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { PasswordRecoveryMailer } from '@/lib/services/PasswordRecoveryMailer';
import { validatePasswordPolicy } from '@/lib/passwordPolicy';

// Rate limits: 5 attempts per 15 minutes
const RATE_LIMIT_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export async function requestPasswordReset(email: string) {
  // Normalize email
  const normalizedEmail = email.toLowerCase().trim();
  
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') || '127.0.0.1';
  const userAgent = headersList.get('user-agent') || 'unknown';

  // Create privacy-preserving identifiers
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
  const uaHash = crypto.createHash('sha256').update(userAgent).digest('hex');
  const identifierHash = crypto.createHash('sha256').update(`${ipHash}:${normalizedEmail}`).digest('hex');

  const genericResponse = { success: true, message: 'If an eligible account exists, password-recovery instructions have been sent.' };

  try {
    // 1. Rate Limiting Check
    const rateLimit = await prisma.passwordRecoveryRateLimit.findFirst({
      where: { identifierHash }
    });

    const now = new Date();
    if (rateLimit) {
      if (rateLimit.blockedUntil && rateLimit.blockedUntil > now) {
        // Still blocked
        return genericResponse;
      }
      
      const timeSinceLast = now.getTime() - rateLimit.lastAttemptAt.getTime();
      if (timeSinceLast > RATE_LIMIT_WINDOW_MS) {
        // Reset window
        await prisma.passwordRecoveryRateLimit.update({
          where: { id: rateLimit.id },
          data: { attempts: 1, lastAttemptAt: now, blockedUntil: null }
        });
      } else {
        const newAttempts = rateLimit.attempts + 1;
        let blockedUntil = null;
        if (newAttempts >= RATE_LIMIT_ATTEMPTS) {
          blockedUntil = new Date(now.getTime() + RATE_LIMIT_WINDOW_MS);
        }
        await prisma.passwordRecoveryRateLimit.update({
          where: { id: rateLimit.id },
          data: { attempts: newAttempts, lastAttemptAt: now, blockedUntil }
        });
        
        if (newAttempts > RATE_LIMIT_ATTEMPTS) {
           return genericResponse;
        }
      }
    } else {
      await prisma.passwordRecoveryRateLimit.create({
        data: {
          identifierHash,
          attempts: 1,
          lastAttemptAt: now
        }
      });
    }

    // 2. Fetch User
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user || user.status !== 'ACTIVE') {
      return genericResponse;
    }

    // 3. Verify Email Delivery is Configured
    if (!PasswordRecoveryMailer.isConfigured()) {
      await prisma.auditLog.create({
         data: {
             userId: user.id,
             userRole: user.role,
             moduleName: 'SECURITY',
             actionType: 'PASSWORD_RECOVERY_EMAIL_CONFIGURATION_MISSING',
             remarks: 'Failed to generate token because email provider is not configured.',
         }
      });
      // Same response as for unknown emails, so the form cannot be used to discover which accounts exist.
      // Operators see the problem in the audit log and server log instead.
      console.error('Password recovery requested but the email provider is not configured (PASSWORD_RECOVERY_EMAIL_CONFIGURATION_MISSING).');
      return genericResponse;
    }

    // 4. Revoke existing tokens
    await prisma.passwordRecoveryToken.updateMany({
      where: { userId: user.id, purpose: 'PASSWORD_RESET', consumedAt: null, revokedAt: null },
      data: { revokedAt: now }
    });

    // 5. Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 mins expiry

    await prisma.passwordRecoveryToken.create({
      data: {
        userId: user.id,
        tokenHash,
        purpose: 'PASSWORD_RESET',
        expiresAt,
        requestedIpHash: ipHash,
        requestedUserAgentHash: uaHash
      }
    });

    // 6. Audit Log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        userRole: user.role,
        moduleName: 'SECURITY',
        actionType: 'PASSWORD_RECOVERY_REQUESTED',
        remarks: `Password recovery requested for ${normalizedEmail}`
      }
    });

    // 7. Send Email
    await PasswordRecoveryMailer.sendResetLink(normalizedEmail, token);

    return genericResponse;

  } catch (error) {
    console.error('Error in requestPasswordReset:', error);
    return genericResponse; // fail closed
  }
}

export async function executePasswordReset(token: string, newPasswordRaw: string) {
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date();

    // 1. Transactional reset
    return await prisma.$transaction(async (tx) => {
      // Find token and lock
      const recoveryToken = await tx.passwordRecoveryToken.findUnique({
        where: { tokenHash }
      });

      if (!recoveryToken) {
        return { success: false, error: 'Invalid or expired token.' };
      }

      if (recoveryToken.purpose !== 'PASSWORD_RESET') {
        return { success: false, error: 'Invalid token purpose.' };
      }

      if (recoveryToken.expiresAt < now) {
        return { success: false, error: 'Token has expired.' };
      }

      if (recoveryToken.consumedAt || recoveryToken.revokedAt) {
        return { success: false, error: 'Token is already consumed or revoked.' };
      }

      const user = await tx.user.findUnique({
        where: { id: recoveryToken.userId }
      });

      if (!user || user.status !== 'ACTIVE') {
        return { success: false, error: 'Account is not active.' };
      }

      // Validate Policy
      const policyResult = validatePasswordPolicy(newPasswordRaw, user.email || '');
      if (!policyResult.valid) {
        return { success: false, error: policyResult.error };
      }

      const bcrypt = require('bcryptjs');
      const newPasswordHash = await bcrypt.hash(newPasswordRaw, 10);

      // Update User
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          password: null, // ensure plain text password is gone
          passwordChangedAt: now,
          mustChangePassword: false,
          sessionVersion: { increment: 1 },
          failedLoginAttempts: 0,
          lockedUntil: null
        }
      });

      // Consume Token
      await tx.passwordRecoveryToken.update({
        where: { id: recoveryToken.id },
        data: { consumedAt: now }
      });

      // Revoke other active tokens
      await tx.passwordRecoveryToken.updateMany({
        where: {
          userId: user.id,
          id: { not: recoveryToken.id },
          consumedAt: null,
          revokedAt: null
        },
        data: { revokedAt: now }
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: user.id,
          userRole: user.role,
          moduleName: 'SECURITY',
          actionType: 'PASSWORD_RECOVERY_COMPLETED',
          remarks: `Password recovery completed using secure token for ${user.email}`
        }
      });

      return { success: true };
    });
  } catch (error) {
    console.error('Password reset transaction failed:', error);
    return { success: false, error: 'An error occurred during password reset.' };
  }
}
