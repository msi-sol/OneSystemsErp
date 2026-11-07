import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionActor, checkSchedulingAccess } from '@/lib/scheduling/authUtils';
import { hasPermission } from '@/lib/permissions';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; voId: string }> }
) {
  try {
    const { id: projectId, voId } = await params;

    // Final VO approval changes the contract amount and BOQ, so it must be an authorized approver.
    const actor = await getSessionActor().catch(() => null);
    if (!actor) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    const [canApprove, projectAccess] = await Promise.all([
      hasPermission(actor.id, 'VARIATION_ORDERS', 'canApprove'),
      checkSchedulingAccess(actor.id, actor.role, projectId, 'canView'),
    ]);
    if (!canApprove || !projectAccess.allowed) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    // Fetch the VO with its items
    const variationOrder = await prisma.variationOrder.findUnique({
      where: { id: voId },
      include: { items: true },
    });

    if (!variationOrder) {
      return NextResponse.json({ error: 'Variation Order not found' }, { status: 404 });
    }

    if (variationOrder.currentStatus === 'APPROVED') {
      return NextResponse.json({ message: 'Variation Order is already approved' });
    }

    if (variationOrder.projectId !== projectId) {
      return NextResponse.json({ error: 'Variation Order does not belong to this project' }, { status: 400 });
    }

    if (variationOrder.currentStatus !== 'FOR_PD_APPROVAL') {
      return NextResponse.json({ error: 'Variation Order must complete all review stages before final approval' }, { status: 409 });
    }

    // Begin a transaction to update VO, BOQ Items, and Project
    await prisma.$transaction(async (tx) => {
      // 1. Mark VO as approved
      await tx.variationOrder.update({
        where: { id: voId },
        data: {
          currentStatus: 'APPROVED',
          approvedForImplementation: true,
          approvedForProcurement: true,
          approvedForBilling: true,
        },
      });

      // 2. Process each Variation Order Item
      for (const item of variationOrder.items) {
        if (item.originalBoqItemId) {
          // It's a modification (additive/deductive) to an existing item
          const isAdditive = item.itemClassification === 'ADDITIVE';
          const isDeductive = item.itemClassification === 'DEDUCTIVE';
          const qtyDelta = isDeductive ? -item.currentProposedQuantity : item.currentProposedQuantity;

          // A. Update AwardedBOQItem
          await tx.awardedBOQItem.update({
            where: { id: item.originalBoqItemId },
            data: {
              approvedClientVoQuantity: { increment: qtyDelta },
              revisedContractQuantity: { increment: qtyDelta },
              revisedContractAmount: { increment: item.netAmount },
            },
          });

          // B. Fetch corresponding ConsolidatedBOQItem mapping
          const mapping = await tx.bOQMapping.findFirst({
            where: { awardedBoqItemId: item.originalBoqItemId },
            include: { consolidatedBoqItem: true }
          });

          if (mapping && mapping.consolidatedBoqItemId) {
            await tx.consolidatedBOQItem.update({
              where: { id: mapping.consolidatedBoqItemId },
              data: {
                voAdditiveQty: isAdditive ? { increment: item.currentProposedQuantity } : undefined,
                voDeductiveQty: isDeductive ? { increment: item.currentProposedQuantity } : undefined,
                revisedQuantity: { increment: qtyDelta },
                voAdditiveCost: isAdditive ? { increment: item.additionalAmount } : undefined,
                voDeductiveCost: isDeductive ? { increment: item.deductiveAmount } : undefined,
                revisedTotalCost: { increment: item.netAmount },
              },
            });
          }
        } else {
          // It's a brand new item (Additional Works)
          const newAwardedItem = await tx.awardedBOQItem.create({
            data: {
              projectId: projectId,
              itemCode: item.voItemNumber,
              description: item.description + ' (VO)',
              unit: item.unit,
              quantity: item.currentProposedQuantity,
              totalCost: item.netAmount,
              revisedContractQuantity: item.currentProposedQuantity,
              revisedContractAmount: item.netAmount,
              status: 'APPROVED',
              processingType: 'MATERIAL_EQUIPMENT', // Default
            },
          });

          const newConsolidatedItem = await tx.consolidatedBOQItem.create({
            data: {
              projectId: projectId,
              itemCode: item.voItemNumber,
              description: item.description + ' (VO)',
              unit: item.unit,
              quantity: item.currentProposedQuantity,
              unitCost: item.proposedUnitCost,
              totalCost: item.netAmount,
              revisedQuantity: item.currentProposedQuantity,
              revisedTotalCost: item.netAmount,
              isVariationItem: true,
              sourceVoNumber: variationOrder.voNumber,
              status: 'APPROVED',
            },
          });

          await tx.bOQMapping.create({
            data: {
              mappingType: '1-to-1',
              status: 'APPROVED',
              awardedBoqItemId: newAwardedItem.id,
              consolidatedBoqItemId: newConsolidatedItem.id,
            },
          });
        }

        // Mark VO item as approved
        await tx.variationOrderItem.update({
          where: { id: item.id },
          data: {
            approvalStatus: 'APPROVED',
            procurementStatus: 'APPROVED',
            accomplishmentStatus: 'APPROVED',
          },
        });
      }

      // 3. Update Project: the contract amount always changes; dates only when days were requested
      // and there is an end date to extend (previously a null endDate also skipped the amount).
      const projectUpdate: Record<string, unknown> = {
        contractAmount: { increment: variationOrder.netVariationAmount },
      };
      if (variationOrder.additionalCalendarDaysRequested > 0) {
        const project = await tx.project.findUnique({ where: { id: projectId } });
        if (project && project.endDate) {
          const newEndDate = new Date(project.endDate);
          newEndDate.setDate(newEndDate.getDate() + variationOrder.additionalCalendarDaysRequested);
          projectUpdate.revisedCompletionDate = newEndDate;
          projectUpdate.endDate = newEndDate; // Update endDate as well for scheduling logic
        }
      }
      await tx.project.update({ where: { id: projectId }, data: projectUpdate });
    }, {
      maxWait: 5000,
      timeout: 30000
    });

    return NextResponse.json({ message: 'Variation Order successfully integrated into BOQ and Project Schedule.' });
  } catch (error) {
    console.error('Error approving VO:', error);
    return NextResponse.json({ error: 'Failed to approve Variation Order' }, { status: 500 });
  }
}
