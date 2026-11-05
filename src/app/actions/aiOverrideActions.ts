'use server';
import { verifySession } from '@/lib/dal/auth';

import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/workflow';


export async function submitAIOverrideRequest(data: {
  validationLogId: string;
  transactionId: string;
  moduleName: string;
  overriddenBy?: string;
  overriddenByRole?: string;
  overrideReason: string;
}) {
  try {
    const cookieStore = await cookies();
    const __session = await verifySession();
  const sessionId = __session?.id || '';
    if (!sessionId) throw new Error('Unauthorized');
    const user = await prisma.user.findUnique({ where: { id: sessionId } });
    if (!user) throw new Error('User not found');

    const overriddenBy = user.id;
    const overriddenByRole = user.role || 'USER';

    const override = await prisma.aIValidationOverride.create({
      data: {
        validationResultId: data.validationLogId,
        transactionId: data.transactionId,
        moduleName: data.moduleName,
        overriddenBy: overriddenBy,
        overriddenByRole: overriddenByRole,
        overrideReason: data.overrideReason,
      }
    });

    // Optionally update the validation log status to 'OVERRIDE PENDING'
    // but the schema doesn't have an override status field, so we just link it.
    
    await logAudit(
      overriddenBy,
      overriddenByRole,
      data.moduleName,
      data.transactionId,
      'SUBMIT_AI_OVERRIDE',
      undefined,
      'PENDING_DIRECTOR_APPROVAL',
      data.overrideReason
    );
    
    revalidatePath('/ai-audit');
    return { success: true, override };
  } catch (error: any) {
    console.error('Error submitting AI Override:', error);
    return { success: false, error: error.message };
  }
}

export async function approveAIOverride(overrideId: string, approvedBy: string, approvedByRole: string) {
  try {
    const override = await prisma.aIValidationOverride.update({
      where: { id: overrideId },
      data: {
        approvedBy,
        approvedByRole
      }
    });

    // Here we would normally trigger the actual original transaction to save
    // or flag it as approved. This depends on the specific module workflow.

    await logAudit(
      approvedBy,
      approvedByRole,
      override.moduleName,
      override.transactionId,
      'APPROVE_AI_OVERRIDE',
      'PENDING_DIRECTOR_APPROVAL',
      'APPROVED_OVERRIDE',
      `Director approved exception for validation ${override.validationResultId}`
    );

    revalidatePath('/director-audit');
    return { success: true, override };
  } catch (error: any) {
    console.error('Error approving AI Override:', error);
    return { success: false, error: error.message };
  }
}

export async function rejectAIOverride(overrideId: string, rejectedBy: string, rejectedByRole: string) {
  try {
    const override = await prisma.aIValidationOverride.update({
      where: { id: overrideId },
      data: {
        approvedBy: rejectedBy,
        approvedByRole: `REJECTED_BY_${rejectedByRole}`
      }
    });

    await logAudit(
      rejectedBy,
      rejectedByRole,
      override.moduleName,
      override.transactionId,
      'REJECT_AI_OVERRIDE',
      'PENDING_DIRECTOR_APPROVAL',
      'REJECTED_OVERRIDE',
      `Director rejected exception for validation ${override.validationResultId}`
    );

    revalidatePath('/director-audit');
    return { success: true, override };
  } catch (error: any) {
    console.error('Error rejecting AI Override:', error);
    return { success: false, error: error.message };
  }
}
