import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { requirePermission } from '../lib/permissions';
import { PrismaClient } from '@prisma/client';
import {
  VariationOrder,
  VariationOrderItem,
  SubcontractPackage,
  ConsolidatedBOQItem,
  MaterialRequest,
  AwardedBOQItem,
  ScheduleWBS,
  ProjectSchedule,
  ScheduleActivity,
  ScheduleBOQAllocation,
  CommitmentLedger
} from '@prisma/client';

const router = Router();

async function recalculateVariationOrderTotals(voId: string) {
  try {
    const vo = await prisma.variationOrder.findUnique({
      where: { id: voId },
      include: { items: true, project: true }
    });
    if (!vo) return;

    let totalAdditional = 0;
    let totalDeductive = 0;

    vo.items.forEach((item: VariationOrderItem) => {
      totalAdditional += item.additionalAmount;
      totalDeductive += item.deductiveAmount;
    });

    const netAmount = totalAdditional - totalDeductive;

    const approvedVosWhere: any = {
      projectId: vo.projectId,
      currentStatus: 'APPROVED'
    };
    if (vo.variationCategory === 'SUBCONTRACTOR' && vo.subcontractPackageId) {
      approvedVosWhere.subcontractPackageId = vo.subcontractPackageId;
    } else {
      approvedVosWhere.variationCategory = { not: 'SUBCONTRACTOR' };
    }

    const approvedVos = await prisma.variationOrder.findMany({
      where: approvedVosWhere
    });

    let prevAdditive = 0;
    let prevDeductive = 0;
    approvedVos.forEach((v) => {
      prevAdditive += v.additionalAmount;
      prevDeductive += v.deductiveAmount;
    });

    const revisedContractAmount = vo.originalContractAmount + prevAdditive - prevDeductive + netAmount;
    const percentageImpact = vo.originalContractAmount > 0 ? (netAmount / vo.originalContractAmount) * 100 : 0;

    await prisma.variationOrder.update({
      where: { id: voId },
      data: {
        additionalAmount: totalAdditional,
        deductiveAmount: totalDeductive,
        netVariationAmount: netAmount,
        totalPreviouslyApprovedAdditive: prevAdditive,
        totalPreviouslyApprovedDeductive: prevDeductive,
        currentRevisedContractAmount: revisedContractAmount,
        percentageImpact
      }
    });
  } catch (error: any) {
    console.error('Failed to recalculate VO totals:', error.message);
    throw new Error('Failed to recalculate VO totals: ' + error.message);
  }
}

async function applyVariationOrderToSubcontractPackage(voId: string) {
  try {
    const vo = await prisma.variationOrder.findUnique({
      where: { id: voId }
    });
    if (!vo || !vo.subcontractPackageId) return;

    const pkg = await prisma.subcontractPackage.findUnique({
      where: { id: vo.subcontractPackageId }
    });
    if (!pkg) return;

    const newContractAmount = pkg.contractAmount + (vo.netVariationAmount || 0);

    await prisma.subcontractPackage.update({
      where: { id: vo.subcontractPackageId },
      data: {
        contractAmount: newContractAmount
      }
    });

    if (pkg.consolidatedBoqItemId && (vo.netVariationAmount || 0) !== 0) {
      await prisma.commitmentLedger.create({
        data: {
          projectId: vo.projectId,
          consolidatedBoqItemId: pkg.consolidatedBoqItemId,
          commitmentType: 'SUBCONTRACT',
          approvedAmount: vo.netVariationAmount || 0,
          remainingCommitment: vo.netVariationAmount || 0,
          status: 'ACTIVE'
        }
      });

      await prisma.consolidatedBOQItem.update({
        where: { id: pkg.consolidatedBoqItemId },
        data: {
          committedCost: { increment: vo.netVariationAmount || 0 }
        }
      });
    }
  } catch (error: any) {
    console.error('Failed to apply VO to Subcontract Package:', error.message);
    throw new Error('Failed to apply VO to Subcontract Package: ' + error.message);
  }
}

async function applyVariationOrderToConsolidatedBOQ(voId: string) {
  try {
    const vo = await prisma.variationOrder.findUnique({
      where: { id: voId },
      include: { items: true, project: true }
    });
    if (!vo) return;

    for (const item of vo.items) {
      if (item.itemClassification === 'ADDITIONAL_WORK' || item.itemClassification === 'NEW_ITEM') {
        const itemCount = await prisma.consolidatedBOQItem.count({ where: { projectId: vo.projectId } });
        const newItemCode = `VO-${String(itemCount + 1).padStart(3, '0')}`;

        await prisma.consolidatedBOQItem.create({
          data: {
            itemCode: newItemCode,
            category: item.workCategory || 'Variation Order',
            description: item.description,
            unit: item.unit,
            quantity: 0,
            unitCost: item.approvedUnitCost,
            totalCost: 0,
            voAdditiveQty: item.revisedQuantity,
            voDeductiveQty: 0,
            revisedQuantity: item.revisedQuantity,
            voAdditiveCost: item.additionalAmount,
            voDeductiveCost: 0,
            revisedTotalCost: item.additionalAmount,
            isVariationItem: true,
            sourceVoNumber: vo.voNumber,
            status: 'PENDING',
            projectId: vo.projectId
          }
        });
      } else {
        const matchingItem = await prisma.consolidatedBOQItem.findFirst({
          where: {
            projectId: vo.projectId,
            description: { contains: item.description.trim().substring(0, 30) }
          }
        });

        if (matchingItem) {
          const addQty = item.additionalAmount > 0 ? (item.revisedQuantity - item.originalQuantity) : 0;
          const dedQty = item.deductiveAmount > 0 ? (item.originalQuantity - item.revisedQuantity) : 0;

          const newAdditiveQty = matchingItem.voAdditiveQty + Math.max(0, addQty);
          const newDeductiveQty = matchingItem.voDeductiveQty + Math.max(0, dedQty);
          const revisedQty = matchingItem.quantity + newAdditiveQty - newDeductiveQty;
          const revisedCost = revisedQty * matchingItem.unitCost;

          await prisma.consolidatedBOQItem.update({
            where: { id: matchingItem.id },
            data: {
              voAdditiveQty: newAdditiveQty,
              voDeductiveQty: newDeductiveQty,
              revisedQuantity: revisedQty,
              voAdditiveCost: matchingItem.voAdditiveCost + Math.max(0, item.additionalAmount),
              voDeductiveCost: matchingItem.voDeductiveCost + Math.max(0, item.deductiveAmount),
              revisedTotalCost: revisedCost,
              sourceVoNumber: matchingItem.sourceVoNumber
                ? `${matchingItem.sourceVoNumber}, ${vo.voNumber}`
                : vo.voNumber
            }
          });
        } else {
          const itemCount = await prisma.consolidatedBOQItem.count({ where: { projectId: vo.projectId } });
          const newItemCode = `VO-${String(itemCount + 1).padStart(3, '0')}`;

          const addQty = Math.max(0, item.revisedQuantity - item.originalQuantity);
          const dedQty = Math.max(0, item.originalQuantity - item.revisedQuantity);

          await prisma.consolidatedBOQItem.create({
            data: {
              itemCode: newItemCode,
              category: item.workCategory || 'Variation Order',
              description: item.description,
              unit: item.unit,
              quantity: item.originalQuantity,
              unitCost: item.approvedUnitCost,
              totalCost: item.originalAmount,
              voAdditiveQty: addQty,
              voDeductiveQty: dedQty,
              revisedQuantity: item.revisedQuantity,
              voAdditiveCost: item.additionalAmount,
              voDeductiveCost: item.deductiveAmount,
              revisedTotalCost: item.netAmount,
              isVariationItem: true,
              sourceVoNumber: vo.voNumber,
              status: 'PENDING',
              projectId: vo.projectId
            }
          });
        }
      }
    }
  } catch (error: any) {
    console.error('Failed to apply VO to Consolidated BOQ:', error.message);
    throw new Error('Failed to apply VO to Consolidated BOQ: ' + error.message);
  }
}

async function applyVariationOrderToSchedule(voId: string) {
  try {
    const vo = await prisma.variationOrder.findUnique({
      where: { id: voId },
      include: { items: true }
    });
    if (!vo) return;

    const schedules = await prisma.projectSchedule.findMany({
      where: { projectId: vo.projectId },
      take: 2,
    });
    if (schedules.length > 1) throw new Error('CHOOSE_SCHEDULE: This project has multiple schedule revisions. Apply the variation through the selected schedule workflow.');
    const schedule = schedules[0];
    if (!schedule) return;

    let voWbs = await prisma.scheduleWBS.findFirst({
      where: { scheduleId: schedule.id, name: 'Client Variation Orders' }
    });

    if (!voWbs) {
      const constPhase = await prisma.scheduleWBS.findFirst({
        where: { scheduleId: schedule.id, code: 'CONST' }
      });

      const wbsCount = await prisma.scheduleWBS.count({ where: { scheduleId: schedule.id, parentId: constPhase?.id || null } });
      voWbs = await prisma.scheduleWBS.create({
        data: {
          scheduleId: schedule.id,
          parentId: constPhase?.id || null,
          code: `VO-PHASE`,
          name: 'Client Variation Orders',
          level: constPhase ? constPhase.level + 1 : 1,
          orderIndex: wbsCount + 1
        }
      });
    }

    for (const item of vo.items) {
      if (item.itemClassification === 'ADDITIONAL_WORK' || item.itemClassification === 'NEW_ITEM') {
        const newActivity = await prisma.scheduleActivity.create({
          data: {
            scheduleId: schedule.id,
            wbsId: voWbs.id,
            activityCode: `VO-${item.voItemNumber}`,
            name: item.description.substring(0, 100),
            description: item.description,
            plannedQuantity: item.revisedQuantity,
            unit: item.unit,
            status: 'NOT_STARTED'
          }
        });

        const newAwardedBoqItem = await prisma.awardedBOQItem.findFirst({
          where: {
            itemCode: `VO-${item.voItemNumber}`,
          }
        });

        if (newAwardedBoqItem) {
          await prisma.scheduleBOQAllocation.create({
            data: {
              activityId: newActivity.id,
              awardedBoqItemId: newAwardedBoqItem.id,
              mappedQuantity: item.revisedQuantity,
              mappedWeight: 0
            }
          });
        }
      } else {
        const matchingActivity = await prisma.scheduleActivity.findFirst({
          where: {
            scheduleId: schedule.id,
            name: { contains: item.description.trim().substring(0, 30) }
          }
        });

        if (matchingActivity) {
          const addQty = item.additionalAmount > 0 ? (item.revisedQuantity - item.originalQuantity) : 0;
          const dedQty = item.deductiveAmount > 0 ? (item.originalQuantity - item.revisedQuantity) : 0;
          const newPlannedQty = Math.max(0, matchingActivity.plannedQuantity + addQty - dedQty);

          await prisma.scheduleActivity.update({
            where: { id: matchingActivity.id },
            data: {
              plannedQuantity: newPlannedQty
            }
          });
        }
      }
    }
  } catch (error: any) {
    console.error('Failed to apply VO to Schedule:', error.message);
    throw new Error('Failed to apply VO to Schedule: ' + error.message);
  }
}

async function applyVariationOrderToAwardedBOQ(voId: string) {
  try {
    const vo = await prisma.variationOrder.findUnique({
      where: { id: voId },
      include: { items: true, project: true }
    });
    if (!vo) return;

    for (const item of vo.items) {
      if (item.itemClassification === 'ADDITIONAL_WORK' || item.itemClassification === 'NEW_ITEM') {
        await prisma.awardedBOQItem.create({
          data: {
            itemCode: `VO-${item.voItemNumber}`,
            category: item.workCategory || 'Variation Order',
            description: `${item.description} (VO)`,
            unit: item.unit || 'lot',
            quantity: 0,
            directCost: 0,
            indirectCost: 0,
            combinedUnitCost: item.approvedUnitCost,
            totalCost: 0,
            revisedContractQuantity: item.revisedQuantity,
            revisedContractUnitPrice: item.approvedUnitCost,
            revisedContractAmount: item.additionalAmount,
            approvedClientVoQuantity: item.revisedQuantity,
            projectId: vo.projectId
          }
        });
      } else {
        const matchingItem = await prisma.awardedBOQItem.findFirst({
          where: {
            projectId: vo.projectId,
            description: { contains: item.description.trim().substring(0, 30) }
          }
        });

        if (matchingItem) {
          const addQty = item.additionalAmount > 0 ? (item.revisedQuantity - item.originalQuantity) : 0;
          const dedQty = item.deductiveAmount > 0 ? (item.originalQuantity - item.revisedQuantity) : 0;

          const netVoQty = addQty - dedQty;
          const newApprovedVoQty = matchingItem.approvedClientVoQuantity + netVoQty;

          const revisedQty = matchingItem.quantity + newApprovedVoQty;
          const revisedAmount = revisedQty * (matchingItem.combinedUnitCost > 0 ? matchingItem.combinedUnitCost : item.approvedUnitCost);

          await prisma.awardedBOQItem.update({
            where: { id: matchingItem.id },
            data: {
              approvedClientVoQuantity: newApprovedVoQty,
              revisedContractQuantity: revisedQty,
              revisedContractAmount: revisedAmount,
              revisedContractUnitPrice: matchingItem.combinedUnitCost > 0 ? matchingItem.combinedUnitCost : item.approvedUnitCost
            }
          });
        }
      }
    }
  } catch (error: any) {
    console.error('Failed to apply VO to Awarded BOQ:', error.message);
    throw new Error('Failed to apply VO to Awarded BOQ: ' + error.message);
  }
}

router.post('/getAllVariationOrders', async (req, res) => {
  try {
    const vos = await prisma.variationOrder.findMany({
      include: {
        items: true,
        project: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: vos });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getAllClientVariationOrders', async (req, res) => {
  try {
    const { activeProjectId } = req.body;
    const vos = await prisma.variationOrder.findMany({
      where: {
        ...(activeProjectId ? { projectId: activeProjectId } : {}),
        OR: [
          { variationCategory: null },
          { variationCategory: '' },
          { variationCategory: 'MAIN_CONTRACT' },
          { variationCategory: 'CLIENT' }
        ]
      },
      include: {
        items: true,
        project: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: vos });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getAllSubcontractorVariationOrders', async (req, res) => {
  try {
    const { projectId, activeProjectId } = req.body;
    const vos = await prisma.variationOrder.findMany({
      where: {
        variationCategory: 'SUBCONTRACTOR',
        ...((projectId || activeProjectId) ? { projectId: projectId || activeProjectId } : {})
      },
      include: {
        items: true,
        project: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: vos });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getVariationOrders', async (req, res) => {
  try {
    const { projectId } = req.body;
    const vos = await prisma.variationOrder.findMany({
      where: { projectId },
      include: {
        items: true,
        documents: true,
        approvals: true,
        aiValidations: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: vos });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getVariationOrderById', async (req, res) => {
  try {
    const { id } = req.body;
    const vo = await prisma.variationOrder.findUnique({
      where: { id },
      include: {
        items: true,
        documents: true,
        approvals: true,
        aiValidations: true,
        project: true
      }
    });
    res.json({ success: true, data: vo });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/getProjectAwardedBOQItems', async (req, res) => {
  try {
    const { projectId } = req.body;
    const items = await prisma.awardedBOQItem.findMany({
      where: { projectId },
      orderBy: { itemCode: 'asc' }
    });
    res.json({ success: true, data: items });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/createVariationOrder', async (req, res) => {
  try {
    const { data } = req.body;
    if (data.variationCategory === 'SUBCONTRACTOR' && data.subcontractPackageId) {
       const existingActiveVO = await prisma.variationOrder.findFirst({
         where: {
           subcontractPackageId: data.subcontractPackageId,
           currentStatus: { notIn: ['APPROVED', 'REJECTED'] }
         }
       });
       if (existingActiveVO) {
         throw new Error(`Package already has an active variation order (${existingActiveVO.voNumber}) that is currently ${existingActiveVO.currentStatus}. Please finalize it before creating a new one.`);
       }
    }

    const count = await prisma.variationOrder.count({
      where: { projectId: data.projectId, createdAt: { gte: new Date(new Date().getFullYear(), 0, 1) } }
    });

    const project = await prisma.project.findUnique({ where: { id: data.projectId } });
    if (!project) throw new Error('Project not found');

    let originalContractAmount = project.contractAmount || 0;
    if (data.variationCategory === 'SUBCONTRACTOR' && data.subcontractPackageId) {
      const pkg = await prisma.subcontractPackage.findUnique({ where: { id: data.subcontractPackageId } });
      if (pkg) originalContractAmount = pkg.contractAmount;
    }

    const year = new Date().getFullYear();
    const sequence = String(count + 1).padStart(4, '0');
    let prefix = 'VO';

    switch(data.variationType) {
      case 'Change Order': prefix = 'CO'; break;
      case 'Extra Work Order': prefix = 'EWO'; break;
      case 'Deductive Variation': prefix = 'DVO'; break;
      case 'Emergency Variation': prefix = 'EVO'; break;
      case 'Internal Cost Variation': prefix = 'ICV'; break;
    }

    const voNumber = `${prefix}-${project.contractNumber || 'PROJ'}-${year}-${sequence}`;

    const newVo = await prisma.variationOrder.create({
      data: {
        ...data,
        subcontractPackageId: data.subcontractPackageId || null,
        voNumber,
        originalContractAmount,
      }
    });
    res.json({ success: true, data: newVo });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/addVariationOrderItem', async (req, res) => {
  try {
    const { voId, data } = req.body;
    const item = await prisma.variationOrderItem.create({
      data: {
        ...data,
        variationOrderId: voId
      }
    });
    await recalculateVariationOrderTotals(voId);
    res.json({ success: true, data: item });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/deleteVariationOrderItem', async (req, res) => {
  try {
    const { itemId, voId } = req.body;
    await prisma.variationOrderItem.delete({
      where: { id: itemId }
    });
    await recalculateVariationOrderTotals(voId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/recalculateVariationOrderTotals', async (req, res) => {
  try {
    const { voId } = req.body;
    await recalculateVariationOrderTotals(voId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/submitVariationOrder', async (req, res) => {
  try {
    const { id } = req.body;
    const updated = await prisma.variationOrder.update({
      where: { id },
      data: { currentStatus: 'SUBMITTED' }
    });
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/approveVariationOrderStage', async (req, res) => {
  try {
    const { voId, stage, action, remarks } = req.body;
    // Acting user comes from the verified backend token (auth middleware), never from the client body.
    const userId = req.body.sessionId as string;

    // Each stage may only act on a VO that is currently at that stage, and needs the matching permission.
    const STAGE_REQUIRES_STATUS: Record<string, string> = {
      TECHNICAL_REVIEW: 'SUBMITTED',
      COST_REVIEW: 'FOR_COSTING',
      PM_REVIEW: 'FOR_PM_REVIEW',
      FINANCE_REVIEW: 'FOR_FINANCE_REVIEW',
      PD_APPROVAL: 'FOR_PD_APPROVAL',
    };
    const ACTION_PERMISSION: Record<string, string> = {
      APPROVED: 'canApprove',
      REJECTED: 'canReject',
      RETURNED: 'canReturnForCorrection',
    };
    if (!STAGE_REQUIRES_STATUS[stage] || !ACTION_PERMISSION[action]) {
      return res.status(400).json({ success: false, error: 'Invalid approval stage or action.' });
    }
    await requirePermission(userId, 'VARIATION_ORDERS', ACTION_PERMISSION[action], req.body.simulatedRole);
    const current = await prisma.variationOrder.findUnique({ where: { id: voId }, select: { currentStatus: true } });
    if (!current) return res.status(404).json({ success: false, error: 'Variation Order not found.' });
    if (current.currentStatus !== STAGE_REQUIRES_STATUS[stage]) {
      return res.status(409).json({ success: false, error: `This Variation Order is ${current.currentStatus}, not awaiting ${stage.replace(/_/g, ' ').toLowerCase()}.` });
    }

    await prisma.variationOrderApproval.create({
      data: {
        variationOrderId: voId,
        stage,
        action,
        actionById: userId,
        remarks
      }
    });

    let nextStatus = 'PENDING';
    if (stage === 'TECHNICAL_REVIEW' && action === 'APPROVED') nextStatus = 'FOR_COSTING';
    if (stage === 'COST_REVIEW' && action === 'APPROVED') nextStatus = 'FOR_PM_REVIEW';
    if (stage === 'PM_REVIEW' && action === 'APPROVED') nextStatus = 'FOR_FINANCE_REVIEW';
    if (stage === 'FINANCE_REVIEW' && action === 'APPROVED') nextStatus = 'FOR_PD_APPROVAL';
    if (stage === 'PD_APPROVAL' && action === 'APPROVED') nextStatus = 'APPROVED';
    if (action === 'REJECTED') nextStatus = 'REJECTED';
    if (action === 'RETURNED') nextStatus = 'FOR_REVISION';

    const updateData: any = { currentStatus: nextStatus };
    if (nextStatus === 'APPROVED') {
      updateData.approvedForImplementation = true;
      updateData.approvedForProcurement = true;
      updateData.approvedForSubcontracting = true;
      updateData.approvedForJobOrder = true;
      updateData.approvedForBilling = true;
    }

    const updated = await prisma.variationOrder.update({
      where: { id: voId },
      data: updateData
    });

    if (nextStatus === 'APPROVED') {
       await recalculateVariationOrderTotals(voId);
       const vo = await prisma.variationOrder.findUnique({ where: { id: voId } });
       if (vo?.variationCategory === 'SUBCONTRACTOR') {
         await applyVariationOrderToSubcontractPackage(voId);
         await applyVariationOrderToConsolidatedBOQ(voId);
       } else {
         await applyVariationOrderToConsolidatedBOQ(voId);
         await applyVariationOrderToAwardedBOQ(voId);
         await applyVariationOrderToSchedule(voId);
       }
    }
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/createMRFFromVO', async (req, res) => {
  try {
    const { voId, itemIds } = req.body;
    // Acting user comes from the verified backend token (auth middleware), never from the client body.
    const userId = req.body.sessionId as string;
    const vo = await prisma.variationOrder.findUnique({
      where: { id: voId },
      include: { items: true, project: true }
    });
    if (!vo) throw new Error('VO not found');
    if (!vo.approvedForProcurement) throw new Error('VO is not approved for procurement');

    const count = await prisma.materialRequest.count();
    const mrNumber = `MRF-${vo.project.contractNumber || 'PROJ'}-${String(count + 1).padStart(4, '0')}`;

    const mr = await prisma.materialRequest.create({
      data: {
        mrNumber,
        projectId: vo.projectId,
        requesterId: userId,
        purpose: `Materials for Variation Order: ${vo.voNumber}`,
        remarks: 'Auto-generated from Approved Variation Order',
        items: {
          create: vo.items.filter(i => itemIds.includes(i.id)).map(item => ({
            quantity: item.revisedQuantity,
            consolidatedBoqItemId: item.originalBoqItemId || ''
          }))
        }
      }
    });
    res.json({ success: true, data: mr });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/createSubcontractFromVO', async (req, res) => {
  try {
    const { voId, itemIds } = req.body;
    const vo = await prisma.variationOrder.findUnique({
      where: { id: voId },
      include: { items: true, project: true }
    });
    if (!vo) throw new Error('VO not found');
    if (!vo.approvedForSubcontracting) throw new Error('VO is not approved for subcontracting');

    const pkg = await prisma.subcontractPackage.create({
      data: {
        packageNumber: `VO-${vo.voNumber}`,
        projectId: vo.projectId,
        contractAmount: vo.items.filter(i => itemIds.includes(i.id)).reduce((acc, i) => acc + i.subcontractCost, 0),
        status: 'DRAFT',
        scopeOfWork: 'Auto-generated from Variation Order'
      } as any
    });
    res.json({ success: true, data: pkg });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/deleteVariationOrder', async (req, res) => {
  try {
    const { id } = req.body;
    const vo = await prisma.variationOrder.findUnique({
      where: { id },
      include: { items: true }
    });
    if (!vo) throw new Error('Variation Order not found');

    if (vo.currentStatus === 'APPROVED') {
      if (vo.variationCategory === 'SUBCONTRACTOR' && vo.subcontractPackageId) {
        const pkg = await prisma.subcontractPackage.findUnique({ where: { id: vo.subcontractPackageId } });
        if (pkg) {
          await prisma.subcontractPackage.update({
            where: { id: pkg.id },
            data: { contractAmount: pkg.contractAmount - (vo.netVariationAmount || 0) }
          });
        }
      } else {
        const relatedBoqItems = await prisma.consolidatedBOQItem.findMany({
          where: {
            projectId: vo.projectId,
            sourceVoNumber: { contains: vo.voNumber }
          }
        });

        for (const boqItem of relatedBoqItems) {
          if (boqItem.isVariationItem && boqItem.sourceVoNumber === vo.voNumber) {
            await prisma.consolidatedBOQItem.delete({ where: { id: boqItem.id } });
          } else {
            const matchingVoItem = vo.items.find((i: any) =>
               boqItem.description.includes(i.description.trim().substring(0, 30))
            );

            if (matchingVoItem) {
              const addQty = matchingVoItem.additionalAmount > 0 ? (matchingVoItem.revisedQuantity - matchingVoItem.originalQuantity) : 0;
              const dedQty = matchingVoItem.deductiveAmount > 0 ? (matchingVoItem.originalQuantity - matchingVoItem.revisedQuantity) : 0;

              const revertedAdditiveQty = Math.max(0, boqItem.voAdditiveQty - addQty);
              const revertedDeductiveQty = Math.max(0, boqItem.voDeductiveQty - dedQty);
              const revertedRevisedQty = boqItem.quantity + revertedAdditiveQty - revertedDeductiveQty;
              const revertedRevisedCost = revertedRevisedQty * boqItem.unitCost;

              const cleanSource = boqItem.sourceVoNumber?.split(', ').filter((s: string) => s !== vo.voNumber).join(', ') || null;

              await prisma.consolidatedBOQItem.update({
                where: { id: boqItem.id },
                data: {
                  voAdditiveQty: revertedAdditiveQty,
                  voDeductiveQty: revertedDeductiveQty,
                  revisedQuantity: revertedRevisedQty,
                  voAdditiveCost: Math.max(0, boqItem.voAdditiveCost - matchingVoItem.additionalAmount),
                  voDeductiveCost: Math.max(0, boqItem.voDeductiveCost - matchingVoItem.deductiveAmount),
                  revisedTotalCost: revertedRevisedCost,
                  sourceVoNumber: cleanSource
                }
              });
            }
          }
        }
      }
    }

    await prisma.variationOrderItem.deleteMany({ where: { variationOrderId: id } });
    try { await prisma.variationOrderApproval.deleteMany({ where: { variationOrderId: id } }); } catch (e) {}
    try { await prisma.variationOrderDocument.deleteMany({ where: { variationOrderId: id } }); } catch (e) {}
    try { await (prisma as any).aIValidationResult?.deleteMany({ where: { variationOrderId: id } }); } catch (e) {}

    await prisma.variationOrder.delete({
      where: { id }
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/updateVariationOrderDetails', async (req, res) => {
  try {
    const { id, data } = req.body;
    const updated = await prisma.variationOrder.update({
      where: { id },
      data
    });
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
