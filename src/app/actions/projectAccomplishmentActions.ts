'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/dal/auth';
import { hasPermission } from '@/lib/permissions';
import { checkSchedulingAccess } from '@/lib/scheduling/authUtils';

// Project accomplishment -> review -> progress billing flow.
// Quantities, unit costs and project billing settings are always re-read from the database;
// values sent by the browser are only the claimed quantities.

type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string };

const QTY_EPSILON = 1e-9;

async function authorize(projectId: string, module: string, actions: string[]) {
  const actor = await verifySession();
  if (!actor) return { ok: false as const, error: 'Unauthorized: No session found.' };
  if (actor.mustChangePassword) return { ok: false as const, error: 'Please change your password before continuing.' };

  const access = await checkSchedulingAccess(actor.id, actor.role, projectId, 'canView');
  if (!access.allowed) return { ok: false as const, error: 'Unauthorized: You do not have access to this project.' };

  for (const action of actions) {
    if (await hasPermission(actor.id, module, action)) return { ok: true as const, actor };
  }
  return { ok: false as const, error: `Unauthorized: You do not have permission for this ${module.toLowerCase()} action.` };
}

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/accomplishments');
  revalidatePath('/progress-billings');
  revalidatePath(`/progress-billings/${projectId}/generate`);
  revalidatePath('/collections');
}

export async function submitProjectAccomplishment(input: {
  projectId: string;
  billingPeriod: string;
  accomplishmentDate: string;
  claims: { boqItemId: string; quantity: number }[];
}): Promise<ActionResult<{ id: string }>> {
  try {
    const projectId = input?.projectId;
    if (!projectId) return { success: false, error: 'Project is required.' };
    const billingPeriod = (input.billingPeriod || '').trim();
    if (!billingPeriod) return { success: false, error: 'Please enter a billing period.' };
    const accomplishmentDate = new Date(`${input.accomplishmentDate}T00:00:00`);
    if (isNaN(accomplishmentDate.getTime())) return { success: false, error: 'Please enter a valid accomplishment date.' };

    const claims = (input.claims || []).filter((c) => c && c.boqItemId && Number(c.quantity) !== 0);
    if (claims.length === 0) return { success: false, error: 'Enter a quantity for at least one BOQ item.' };
    if (claims.some((c) => !Number.isFinite(Number(c.quantity)) || Number(c.quantity) < 0)) {
      return { success: false, error: 'Claimed quantities must be zero or positive numbers.' };
    }
    if (new Set(claims.map((c) => c.boqItemId)).size !== claims.length) {
      return { success: false, error: 'Each BOQ item can only be claimed once per accomplishment.' };
    }

    const authz = await authorize(projectId, 'ACCOMPLISHMENTS', ['canCreate', 'canSubmit']);
    if (!authz.ok) return { success: false, error: authz.error };

    const created = await prisma.$transaction(async (tx) => {
      const boqItems = await tx.awardedBOQItem.findMany({
        where: { projectId, id: { in: claims.map((c) => c.boqItemId) } },
      });
      if (boqItems.length !== claims.length) throw new Error('One or more BOQ items do not belong to this project.');
      const byId = new Map(boqItems.map((b) => [b.id, b]));

      const items = claims.map((claim) => {
        const boq = byId.get(claim.boqItemId)!;
        const contractQuantity = boq.revisedContractQuantity || boq.quantity || 0;
        const previousQuantity = boq.totalQuantityAccomplished || 0;
        const current = Number(claim.quantity);
        const totalToDate = previousQuantity + current;
        if (contractQuantity <= 0) throw new Error(`BOQ item ${boq.itemCode} has no contract quantity to accomplish.`);
        if (totalToDate > contractQuantity + QTY_EPSILON) {
          throw new Error(`Cannot exceed 100% completion for BOQ item ${boq.itemCode}.`);
        }
        const unitCost = boq.revisedContractUnitPrice || boq.combinedUnitCost || 0;
        return {
          boq,
          data: {
            boqItemId: boq.id,
            workCategory: boq.category,
            descriptionOfWork: boq.description,
            previousQuantity,
            currentQuantityClaimed: current,
            totalQuantityToDate: totalToDate,
            contractQuantity,
            remainingQuantity: contractQuantity - totalToDate,
            unitCost,
            currentAccomplishmentAmount: current * unitCost,
            totalAccomplishmentAmount: totalToDate * unitCost,
            percentageAccomplished: (totalToDate / contractQuantity) * 100,
          },
        };
      });

      const accomplishment = await tx.accomplishment.create({
        data: {
          projectId,
          billingPeriod,
          accomplishmentDate,
          status: 'FOR_REVIEW',
          preparedById: authz.actor.id,
          items: { create: items.map((i) => i.data) },
        },
        select: { id: true },
      });

      // Reserve the claimed quantities on the BOQ so later claims cannot exceed 100%; rejection releases them.
      for (const { boq, data } of items) {
        await tx.awardedBOQItem.update({
          where: { id: boq.id },
          data: {
            previousQuantityAccomplished: data.previousQuantity,
            currentQuantityAccomplished: data.currentQuantityClaimed,
            totalQuantityAccomplished: data.totalQuantityToDate,
            remainingQuantity: data.remainingQuantity,
            percentageAccomplished: data.percentageAccomplished,
            amountAccomplished: data.totalAccomplishmentAmount,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: authz.actor.id,
          userRole: authz.actor.role,
          moduleName: 'ACCOMPLISHMENTS',
          transactionId: accomplishment.id,
          actionType: 'ACCOMPLISHMENT_SUBMITTED',
          newValue: JSON.stringify({ projectId, billingPeriod, items: items.length }),
        },
      });

      return accomplishment;
    });

    revalidateProject(projectId);
    return { success: true, data: { id: created.id } };
  } catch (error: any) {
    console.error('submitProjectAccomplishment error:', error);
    return { success: false, error: error?.message || 'Failed to save the accomplishment.' };
  }
}

export async function reviewProjectAccomplishment(
  accomplishmentId: string,
  decision: 'APPROVE' | 'REJECT',
  remarks?: string,
): Promise<ActionResult> {
  try {
    if (!accomplishmentId || (decision !== 'APPROVE' && decision !== 'REJECT')) {
      return { success: false, error: 'Invalid review request.' };
    }
    const existing = await prisma.accomplishment.findUnique({
      where: { id: accomplishmentId },
      select: { projectId: true, status: true },
    });
    if (!existing) return { success: false, error: 'Accomplishment not found.' };

    const authz = await authorize(existing.projectId, 'ACCOMPLISHMENTS', decision === 'APPROVE' ? ['canApprove'] : ['canReject', 'canApprove']);
    if (!authz.ok) return { success: false, error: authz.error };

    await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction so two reviewers cannot both act on the same record.
      const acc = await tx.accomplishment.findUnique({ where: { id: accomplishmentId }, include: { items: true } });
      if (!acc || acc.status !== 'FOR_REVIEW') throw new Error('Only accomplishments that are for review can be approved or rejected.');

      if (decision === 'APPROVE') {
        const approvedAmount = acc.items.reduce((sum, i) => sum + (i.currentAccomplishmentAmount || 0), 0);
        await tx.accomplishmentItem.updateMany({
          where: { accomplishmentId },
          data: { approvalStatus: 'APPROVED' },
        });
        for (const item of acc.items) {
          await tx.accomplishmentItem.update({ where: { id: item.id }, data: { approvedQuantity: item.currentQuantityClaimed } });
        }
        await tx.accomplishment.update({
          where: { id: accomplishmentId },
          data: { status: 'APPROVED', approvedAmount, remarks: remarks?.trim() || acc.remarks },
        });
      } else {
        // Release the quantities this accomplishment reserved on the BOQ.
        for (const item of acc.items) {
          const boq = await tx.awardedBOQItem.findUnique({ where: { id: item.boqItemId } });
          if (!boq) continue;
          const contractQuantity = boq.revisedContractQuantity || boq.quantity || 0;
          const unitCost = boq.revisedContractUnitPrice || boq.combinedUnitCost || 0;
          const total = Math.max((boq.totalQuantityAccomplished || 0) - item.currentQuantityClaimed, 0);
          await tx.awardedBOQItem.update({
            where: { id: boq.id },
            data: {
              totalQuantityAccomplished: total,
              currentQuantityAccomplished: 0,
              remainingQuantity: Math.max(contractQuantity - total, 0),
              percentageAccomplished: contractQuantity > 0 ? (total / contractQuantity) * 100 : 0,
              amountAccomplished: total * unitCost,
            },
          });
        }
        await tx.accomplishmentItem.updateMany({ where: { accomplishmentId }, data: { approvalStatus: 'REJECTED' } });
        await tx.accomplishment.update({
          where: { id: accomplishmentId },
          data: { status: 'REJECTED', approvedAmount: null, remarks: remarks?.trim() || acc.remarks },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: authz.actor.id,
          userRole: authz.actor.role,
          moduleName: 'ACCOMPLISHMENTS',
          transactionId: accomplishmentId,
          actionType: decision === 'APPROVE' ? 'ACCOMPLISHMENT_APPROVED' : 'ACCOMPLISHMENT_REJECTED',
          oldValue: acc.status,
          newValue: JSON.stringify({ projectId: acc.projectId, status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED' }),
          remarks: remarks?.trim() || null,
        },
      });
    });

    revalidateProject(existing.projectId);
    return { success: true };
  } catch (error: any) {
    console.error('reviewProjectAccomplishment error:', error);
    return { success: false, error: error?.message || 'Failed to review the accomplishment.' };
  }
}

export async function generateProjectProgressBilling(
  projectId: string,
  accomplishmentIds: string[],
): Promise<ActionResult<{ id: string; billingNumber: string }>> {
  try {
    const ids = Array.from(new Set((accomplishmentIds || []).filter(Boolean)));
    if (!projectId || ids.length === 0) return { success: false, error: 'Select at least one approved accomplishment to bill.' };

    const authz = await authorize(projectId, 'FINANCE', ['canCreate']);
    const authzAlt = authz.ok ? authz : await authorize(projectId, 'ACCOMPLISHMENTS', ['canApprove']);
    if (!authzAlt.ok) return { success: false, error: authzAlt.error };
    const actor = authzAlt.actor;

    const billing = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project) throw new Error('Project not found.');

      const accomplishments = await tx.accomplishment.findMany({
        where: { id: { in: ids }, projectId },
        include: { items: true },
      });
      if (accomplishments.length !== ids.length) throw new Error('One or more accomplishments were not found for this project.');
      if (accomplishments.some((a) => a.status !== 'APPROVED')) {
        throw new Error('Only approved accomplishments that have not been billed can be included.');
      }

      const gross = accomplishments.reduce(
        (sum, a) => sum + (a.approvedAmount ?? a.items.reduce((s, i) => s + (i.currentAccomplishmentAmount || 0), 0)),
        0,
      );
      if (gross <= 0) throw new Error('The selected accomplishments have no billable amount.');

      const pastBillings = await tx.billing.findMany({ where: { projectId }, select: { currentBillingAmount: true } });
      const totalPreviousBilling = pastBillings.reduce((sum, b) => sum + (b.currentBillingAmount || 0), 0);

      // Use the project's configured rates as-is: a deliberate 0% must stay 0% (previously `|| 10` / `|| 2`).
      // Every amount is rounded to centavos; unrounded values showed as e.g. ₱22,765.681 in Collections and
      // pre-filled a payment that could never clear the balance exactly.
      const cents = (value: number) => Math.round(value * 100) / 100;
      const vatRate = (project.vatRate ?? 12) / 100;
      const vatExclusiveBase = project.contractAmountVATInclusive ? gross / (1 + vatRate) : gross;
      const vat = cents(project.contractAmountVATInclusive ? gross - vatExclusiveBase : gross * vatRate);
      const retention = cents(gross * ((project.retentionPercentage ?? 0) / 100));
      // EWT is withheld on the VAT-exclusive amount.
      const withholdingTax = cents(vatExclusiveBase * ((project.withholdingTaxPercentage ?? 0) / 100));
      const mobilizationAdvanceAmount = project.mobilizationAdvanceAmount || 0;
      const mobilizationAdvanceRecoupment = cents(project.contractAmount > 0
        ? Math.min((gross / project.contractAmount) * mobilizationAdvanceAmount, mobilizationAdvanceAmount)
        : 0);
      // A VAT-exclusive contract bills VAT on top of the gross.
      const billedAmount = project.contractAmountVATInclusive ? gross : gross + vat;
      const netAmountDue = cents(billedAmount - retention - withholdingTax - mobilizationAdvanceRecoupment);
      // The revised contract includes approved variation orders (as on the project summary).
      const approvedVOs = await tx.variationOrder.findMany({ where: { projectId, currentStatus: 'APPROVED' }, select: { additionalAmount: true, deductiveAmount: true } });
      const revisedContractAmount = project.contractAmount + approvedVOs.reduce((sum, vo) => sum + (vo.additionalAmount || 0) - (vo.deductiveAmount || 0), 0);

      const dates = accomplishments.map((a) => a.accomplishmentDate.getTime());
      const sequence = pastBillings.length + 1;
      const billingNumber = `PB-${projectId.slice(-6).toUpperCase()}-${String(sequence).padStart(3, '0')}-${Date.now().toString(36).toUpperCase()}`;

      const created = await tx.billing.create({
        data: {
          billingNumber,
          billingPeriodFrom: new Date(Math.min(...dates)),
          billingPeriodTo: new Date(Math.max(...dates)),
          billingDate: new Date(),
          billingType: 'PROGRESS',
          contractAmount: project.contractAmount,
          revisedContractAmount,
          totalPreviousBilling,
          currentBillingAmount: gross,
          totalBillingToDate: totalPreviousBilling + gross,
          balanceContractAmount: revisedContractAmount - (totalPreviousBilling + gross),
          status: 'SUBMITTED',
          preparedById: actor.id,
          projectId,
          deductions: {
            create: { grossBilling: gross, retention, withholdingTax, vat, mobilizationAdvanceRecoupment, netAmountDue },
          },
        },
        select: { id: true, billingNumber: true },
      });

      // Mark the accomplishments as billed so they cannot be billed twice.
      const marked = await tx.accomplishment.updateMany({
        where: { id: { in: ids }, status: 'APPROVED' },
        data: { status: 'BILLED' },
      });
      if (marked.count !== ids.length) throw new Error('Some accomplishments were billed by someone else. Please refresh and try again.');

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userRole: actor.role,
          moduleName: 'BILLING',
          transactionId: created.id,
          actionType: 'PROGRESS_BILLING_GENERATED',
          newValue: JSON.stringify({ projectId, billingNumber, accomplishmentIds: ids, gross, netAmountDue }),
        },
      });

      return created;
    });

    revalidateProject(projectId);
    return { success: true, data: billing };
  } catch (error: any) {
    console.error('generateProjectProgressBilling error:', error);
    return { success: false, error: error?.message || 'Failed to generate the progress billing.' };
  }
}
