import { prisma } from '@/lib/prisma';
import { Prisma, ProjectScheduleWorkflowStatus } from '@prisma/client';
import { toMoney } from '@/lib/scheduling/moneyUtils';
import crypto from 'crypto';

// ---------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------

export const IMMUTABLE_STATUSES: ProjectScheduleWorkflowStatus[] = [
  ProjectScheduleWorkflowStatus.ACTIVE_BASELINE,
  ProjectScheduleWorkflowStatus.SUPERSEDED_BASELINE,
  ProjectScheduleWorkflowStatus.ARCHIVED_BASELINE
];

export const EDITABLE_STATUSES: ProjectScheduleWorkflowStatus[] = [
  ProjectScheduleWorkflowStatus.AI_GENERATED_DRAFT,
  ProjectScheduleWorkflowStatus.INVALID_GENERATED_DRAFT,
  ProjectScheduleWorkflowStatus.TECHNICAL_REVISIONS_REQUIRED
];

export const VALID_WORKFLOW_TRANSITIONS: Record<string, string[]> = {
  [ProjectScheduleWorkflowStatus.AI_GENERATED_DRAFT]: [
    ProjectScheduleWorkflowStatus.READY_FOR_REVIEW,
    ProjectScheduleWorkflowStatus.INVALID_GENERATED_DRAFT
  ],
  [ProjectScheduleWorkflowStatus.INVALID_GENERATED_DRAFT]: [
    ProjectScheduleWorkflowStatus.READY_FOR_REVIEW,
    ProjectScheduleWorkflowStatus.INVALID_GENERATED_DRAFT
  ],
  [ProjectScheduleWorkflowStatus.TECHNICAL_REVISIONS_REQUIRED]: [
    ProjectScheduleWorkflowStatus.READY_FOR_REVIEW,
    ProjectScheduleWorkflowStatus.INVALID_GENERATED_DRAFT,
    ProjectScheduleWorkflowStatus.AI_GENERATED_DRAFT
  ],
  [ProjectScheduleWorkflowStatus.READY_FOR_REVIEW]: [
    ProjectScheduleWorkflowStatus.UNDER_TECHNICAL_REVIEW
  ],
  [ProjectScheduleWorkflowStatus.UNDER_TECHNICAL_REVIEW]: [
    ProjectScheduleWorkflowStatus.TECHNICALLY_APPROVED,
    ProjectScheduleWorkflowStatus.TECHNICAL_REVISIONS_REQUIRED,
    ProjectScheduleWorkflowStatus.REJECTED
  ],
  [ProjectScheduleWorkflowStatus.TECHNICALLY_APPROVED]: [
    ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL,
    ProjectScheduleWorkflowStatus.REJECTED
  ],
  [ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL]: [
    ProjectScheduleWorkflowStatus.ACTIVE_BASELINE,
    ProjectScheduleWorkflowStatus.REJECTED
  ]
};

// ---------------------------------------------------------
// GUARDS
// ---------------------------------------------------------

export function assertScheduleMutable(schedule: { workflowStatus: string }) {
  if (IMMUTABLE_STATUSES.includes(schedule.workflowStatus as ProjectScheduleWorkflowStatus)) {
    throw new Error('ACTIVE_BASELINE_IS_IMMUTABLE');
  }
}

export function assertScheduleEditable(schedule: { workflowStatus: string }) {
  if (!EDITABLE_STATUSES.includes(schedule.workflowStatus as ProjectScheduleWorkflowStatus)) {
    throw new Error('SCHEDULE_NOT_EDITABLE_IN_CURRENT_STATUS');
  }
}

export function assertValidTransition(currentStatus: string, targetStatus: string) {
  const allowed = VALID_WORKFLOW_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    throw new Error(`INVALID_WORKFLOW_TRANSITION: Cannot transition from ${currentStatus} to ${targetStatus}`);
  }
}

export function hasApprovedLockedBOQPin(
  projectIsLocked: boolean,
  schedule: { lockedBOQVersionId?: string | null; lockedBOQChecksum?: string | null },
  version: { id: string; status: string; checksum?: string | null } | null,
): boolean {
  return Boolean(
    projectIsLocked &&
    version &&
    schedule.lockedBOQVersionId === version.id &&
    ['APPROVED', 'LOCKED'].includes(version.status) &&
    version.checksum &&
    version.checksum === schedule.lockedBOQChecksum,
  );
}

// ---------------------------------------------------------
// SNAPSHOTS
// ---------------------------------------------------------

export function createCanonicalScheduleSnapshot(schedule: any, wbsNodes: any[], phases: any[], activities: any[], dependencies: any[], allocations: any[]) {
  // Sort deterministically
  const sortedWbs = [...wbsNodes].sort((a, b) => a.id.localeCompare(b.id));
  const sortedActivities = [...activities].sort((a, b) => a.id.localeCompare(b.id));
  const sortedDependencies = [...dependencies].sort((a, b) => a.id.localeCompare(b.id));
  const sortedAllocations = [...allocations].sort((a, b) => a.id.localeCompare(b.id));

  return {
    version: '1.0',
    scheduleId: schedule.id,
    projectId: schedule.projectId,
    reviewRound: schedule.reviewRound,
    projectStartDate: schedule.projectStartDate?.toISOString(),
    projectCompletionDate: schedule.projectCompletionDate?.toISOString(),
    lockedBOQVersionId: schedule.lockedBOQVersionId,
    lockedBOQChecksum: schedule.lockedBOQChecksum,
    awardedContractAmount: schedule.awardedContractAmount?.toString(),
    scheduledAmount: schedule.scheduledAmount?.toString(),
    differenceAmount: schedule.differenceAmount?.toString(),
    wbsNodes: sortedWbs.map(w => ({ id: w.id, code: w.code, level: w.level, parentId: w.parentId })),
    activities: sortedActivities.map(a => ({
      id: a.id, wbsId: a.wbsId, code: a.activityCode,
      plannedStartDate: a.plannedStartDate?.toISOString(),
      plannedFinishDate: a.plannedFinishDate?.toISOString(),
      plannedDuration: a.plannedDuration,
      plannedQuantity: a.plannedQuantity,
      plannedWeight: a.plannedWeight
    })),
    dependencies: sortedDependencies.map(d => ({
      id: d.id, predecessorId: d.predecessorId, successorId: d.successorId, type: d.dependencyType
    })),
    allocations: sortedAllocations.map(a => ({
      id: a.id, activityId: a.activityId, boqLineId: a.boqLineId, quantity: a.allocatedQuantity
    }))
  };
}

export function calculateScheduleSnapshotHash(snapshot: any): string {
  const jsonStr = JSON.stringify(snapshot);
  return crypto.createHash('sha256').update(jsonStr).digest('hex');
}

// ---------------------------------------------------------
// VALIDATION LOGIC
// ---------------------------------------------------------

export async function validateScheduleForReview({
  projectId,
  scheduleId,
  actorId,
  expectedRowVersion,
  tx = prisma // Allows running inside a transaction
}: {
  projectId: string;
  scheduleId: string;
  actorId: string;
  expectedRowVersion: number;
  tx?: any;
}) {
  const schedule = await tx.projectSchedule.findUnique({
    where: {
      id_projectId: {
        id: scheduleId,
        projectId
      }
    },
    include: {
      activities: {
        include: { boqAllocations: true }
      },
      wbsNodes: true,
      dependencies: true
    }
  });

  if (!schedule || schedule.rowVersion !== expectedRowVersion) throw new Error('SCHEDULE_VERSION_CONFLICT');

  // We are evaluating all components to see if they pass.
  const errors: string[] = [];
  const warnings: string[] = [];

  let awarded = new Prisma.Decimal(0);
  let scheduled = new Prisma.Decimal(0);
  let difference = new Prisma.Decimal(0);

  try { awarded = toMoney(schedule.awardedContractAmount || 0); } catch(e: any) { errors.push(`FINANCIAL: Schedule awardedContractAmount ${schedule.id}: ${e.message}`); }
  try { scheduled = toMoney(schedule.scheduledAmount || 0); } catch(e: any) { errors.push(`FINANCIAL: Schedule scheduledAmount ${schedule.id}: ${e.message}`); }
  try { difference = toMoney(schedule.differenceAmount || 0); } catch(e: any) { errors.push(`FINANCIAL: Schedule differenceAmount ${schedule.id}: ${e.message}`); }

  if (errors.length === 0) {
    if (awarded.isZero()) errors.push('FINANCIAL: Contract amount is zero.');
    if (scheduled.isZero()) errors.push('FINANCIAL: Scheduled amount is zero.');
    if (!difference.isZero()) errors.push('FINANCIAL: Difference amount is not 0.00.');
    if (!awarded.equals(scheduled)) errors.push('FINANCIAL: Awarded contract amount does not equal scheduled amount.');
  }

  // BOQ
  const projectBOQState = await tx.project.findUnique({
    where: { id: projectId },
    select: { boqLocked: true },
  });
  const approvedBOQVersion = schedule.lockedBOQVersionId
    ? await tx.projectBOQVersion.findFirst({
        where: { id: schedule.lockedBOQVersionId, projectId },
        select: { id: true, status: true, checksum: true },
      })
    : null;
  if (!hasApprovedLockedBOQPin(Boolean(projectBOQState?.boqLocked), schedule, approvedBOQVersion)) {
    errors.push('BOQ: An approved and locked BOQ version matching this schedule is required before review.');
  }

  const pricedLines = await tx.awardedBOQItem.count({
    where: { projectId, totalCost: { gt: 0 } }
  });
  if (pricedLines === 0) errors.push('BOQ: No priced BOQ lines found.');

  // Fetch all allocations to check coverage
  const allocations = await tx.scheduleBOQAllocation.findMany({
    where: { scheduleId },
    select: {
      id: true,
      awardedBoqItemId: true,
      allocatedQuantity: true,
      mappedQuantity: true
    }
  });
  
  if (allocations.length === 0) errors.push('BOQ: No BOQ allocations found.');

  // Aggregate allocations by awardedBoqItemId
  const allocatedQuantities = new Map<string, Prisma.Decimal>();
  for (const alloc of allocations) {
    const prev = allocatedQuantities.get(alloc.awardedBoqItemId) || new Prisma.Decimal(0);
    try {
      const allocQty = toMoney(alloc.allocatedQuantity ?? alloc.mappedQuantity);
      allocatedQuantities.set(alloc.awardedBoqItemId, prev.add(allocQty));
    } catch(e: any) {
      errors.push(`BOQ: ScheduleBOQAllocation allocatedQuantity ${alloc.id}: ${e.message}`);
    }
  }

  const boqItems = await tx.awardedBOQItem.findMany({
    where: { projectId, totalCost: { gt: 0 } },
    select: {
      id: true,
      itemCode: true,
      quantity: true
    }
  });

  for (const item of boqItems) {
    const allocated = allocatedQuantities.get(item.id) || new Prisma.Decimal(0);
    try {
      const itemQty = toMoney(item.quantity);
      if (allocated.isZero()) {
        errors.push(`BOQ: Item ${item.itemCode} is unallocated.`);
      } else if (!allocated.equals(itemQty)) {
        errors.push(`BOQ: Item ${item.itemCode} allocation (${allocated.toString()}) does not match BOQ quantity (${itemQty.toString()}).`);
      }
    } catch(e: any) {
      errors.push(`BOQ: AwardedBOQItem quantity ${item.id}: ${e.message}`);
    }
  }

  // Structure
  if (schedule.wbsNodes.length === 0) errors.push('STRUCTURE: WBS root missing.');
  if (schedule.activities.length === 0) errors.push('STRUCTURE: Zero activities found.');
  if (schedule.activities.length > 1 && schedule.dependencies.length === 0) {
    errors.push('STRUCTURE: Multiple activities exist but no dependencies defined.');
  }

  // Dates
  if (!schedule.projectStartDate || !schedule.projectCompletionDate) {
    errors.push('DATES: Project start or completion dates missing.');
  } else {
    for (const act of schedule.activities) {
      if (!act.plannedStartDate || !act.plannedFinishDate) {
        errors.push(`DATES: Activity ${act.activityCode || act.name} is missing dates.`);
        continue;
      }
      if (act.plannedStartDate < schedule.projectStartDate) {
        errors.push(`DATES: Activity ${act.activityCode || act.name} starts before project start.`);
      }
      if (act.plannedFinishDate > schedule.projectCompletionDate) {
        errors.push(`DATES: Activity ${act.activityCode || act.name} finishes after project completion.`);
      }
    }
  }

  // Phases
  const phaseNames = schedule.wbsNodes.map((w: any) => w.name.toLowerCase());
  const hasTesting = phaseNames.some((n: string) => n.includes('testing') || n.includes('commissioning') || n.includes('inspection'));
  const hasAcceptance = phaseNames.some((n: string) => n.includes('acceptance') || n.includes('demobilization'));
  
  if (!hasTesting) errors.push('PHASES: Testing and Commissioning phase is missing.');
  if (!hasAcceptance) errors.push('PHASES: Project Acceptance and Demobilization phase is missing.');

  // CPM
  const hasCritical = schedule.activities.some((a: any) => a.criticalPath === true || a.totalFloat === 0); 
  if (!hasCritical) errors.push('CPM: No critical activity found.');

  const isValid = errors.length === 0;

  const resultStatus = isValid ? ProjectScheduleWorkflowStatus.READY_FOR_REVIEW : ProjectScheduleWorkflowStatus.INVALID_GENERATED_DRAFT;

  const snapshot = createCanonicalScheduleSnapshot(schedule, schedule.wbsNodes, [], schedule.activities, schedule.dependencies, allocations);
  const hash = calculateScheduleSnapshotHash(snapshot);

  return { isValid, errors, warnings, schedule, hash };
}

// ---------------------------------------------------------
// REVIEW TRANSITIONS
// ---------------------------------------------------------

export async function startScheduleReview({
  projectId,
  scheduleId,
  actorId,
  expectedRowVersion
}: {
  projectId: string;
  scheduleId: string;
  actorId: string;
  expectedRowVersion: number;
}) {
  const schedule = await prisma.projectSchedule.findUnique({
    where: { id: scheduleId, projectId }
  });
  if (!schedule || schedule.rowVersion !== expectedRowVersion) throw new Error('SCHEDULE_VERSION_CONFLICT');
  assertValidTransition(schedule.workflowStatus, ProjectScheduleWorkflowStatus.UNDER_TECHNICAL_REVIEW);

  return prisma.projectSchedule.update({
    where: { id: scheduleId },
    data: {
      workflowStatus: ProjectScheduleWorkflowStatus.UNDER_TECHNICAL_REVIEW,
      rowVersion: { increment: 1 }
    }
  });
}

export async function approveTechnicalReview({
  projectId,
  scheduleId,
  actorId,
  comments,
  expectedRowVersion
}: {
  projectId: string;
  scheduleId: string;
  actorId: string;
  comments: string;
  expectedRowVersion: number;
}) {
  if (!comments || comments.trim() === '') throw new Error('COMMENTS_REQUIRED');
  
  return prisma.$transaction(async (tx) => {
    const schedule = await tx.projectSchedule.findUnique({
      where: { id: scheduleId, projectId }
    });
    if (!schedule || schedule.rowVersion !== expectedRowVersion) throw new Error('SCHEDULE_VERSION_CONFLICT');
    assertValidTransition(schedule.workflowStatus, ProjectScheduleWorkflowStatus.TECHNICALLY_APPROVED);

    // Re-validate and snapshot
    const valResult = await validateScheduleForReview({ projectId, scheduleId, actorId, expectedRowVersion, tx });
    if (!valResult.isValid) throw new Error('VALIDATION_FAILED_DURING_APPROVAL');

    const user = await tx.user.findUnique({ where: { id: actorId } });

    await tx.scheduleApproval.create({
      data: {
        schedule: { connect: { id: scheduleId } },
        approvalStage: 'TECHNICAL',
        decision: 'APPROVE',
        reviewRound: schedule.reviewRound,
        reviewer: { connect: { id: actorId } },
        reviewerNameSnapshot: user?.name || 'Unknown',
        reviewerRoleSnapshot: user?.role || 'Unknown',
        comments,
        validationSnapshot: valResult.errors.length === 0 ? 'PASS' : 'FAIL',
        snapshotVersion: '1.0',
        scheduleSnapshotHash: valResult.hash,
        lockedBOQChecksum: schedule.lockedBOQChecksum || 'NONE'
      }
    });

    return tx.projectSchedule.update({
      where: { id: scheduleId },
      data: {
        workflowStatus: ProjectScheduleWorkflowStatus.TECHNICALLY_APPROVED,
        // validation incremented rowVersion, so we increment again. 
        rowVersion: { increment: 1 }
      }
    });
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 50000,
    timeout: 50000
  });
}

export async function submitForBaselineApproval({
  projectId,
  scheduleId,
  actorId,
  expectedRowVersion
}: {
  projectId: string;
  scheduleId: string;
  actorId: string;
  expectedRowVersion: number;
}) {
  const schedule = await prisma.projectSchedule.findUnique({
    where: { id: scheduleId, projectId }
  });
  if (!schedule || schedule.rowVersion !== expectedRowVersion) throw new Error('SCHEDULE_VERSION_CONFLICT');
  assertValidTransition(schedule.workflowStatus, ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL);

  return prisma.projectSchedule.update({
    where: { id: scheduleId },
    data: {
      workflowStatus: ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL,
      rowVersion: { increment: 1 }
    }
  });
}

export async function returnScheduleForRevision({
  projectId,
  scheduleId,
  actorId,
  reason,
  expectedRowVersion
}: {
  projectId: string;
  scheduleId: string;
  actorId: string;
  reason: string;
  expectedRowVersion: number;
}) {
  if (!reason || reason.trim() === '') throw new Error('REASON_REQUIRED');

  return prisma.$transaction(async (tx) => {
    const schedule = await tx.projectSchedule.findUnique({
      where: { id: scheduleId, projectId }
    });
    if (!schedule || schedule.rowVersion !== expectedRowVersion) throw new Error('SCHEDULE_VERSION_CONFLICT');
    assertValidTransition(schedule.workflowStatus, ProjectScheduleWorkflowStatus.TECHNICAL_REVISIONS_REQUIRED);

    const user = await tx.user.findUnique({ where: { id: actorId } });

    await tx.scheduleApproval.create({
      data: {
        schedule: { connect: { id: scheduleId } },
        approvalStage: 'TECHNICAL',
        decision: 'RETURN_FOR_REVISION',
        reviewRound: schedule.reviewRound,
        reviewer: { connect: { id: actorId } },
        reviewerNameSnapshot: user?.name || 'Unknown',
        reviewerRoleSnapshot: user?.role || 'Unknown',
        comments: reason,
        validationSnapshot: 'N/A',
        snapshotVersion: '1.0'
      }
    });

    return tx.projectSchedule.update({
      where: { id: scheduleId },
      data: {
        workflowStatus: ProjectScheduleWorkflowStatus.AI_GENERATED_DRAFT,
        reviewRound: { increment: 1 },
        rowVersion: { increment: 1 },
        activationSnapshotHash: null
      }
    });
  });
}

export async function rejectSchedule({
  projectId,
  scheduleId,
  actorId,
  reason,
  expectedRowVersion
}: {
  projectId: string;
  scheduleId: string;
  actorId: string;
  reason: string;
  expectedRowVersion: number;
}) {
  if (!reason || reason.trim() === '') throw new Error('REASON_REQUIRED');

  return prisma.$transaction(async (tx) => {
    const schedule = await tx.projectSchedule.findUnique({
      where: { id: scheduleId, projectId }
    });
    if (!schedule || schedule.rowVersion !== expectedRowVersion) throw new Error('SCHEDULE_VERSION_CONFLICT');
    assertValidTransition(schedule.workflowStatus, ProjectScheduleWorkflowStatus.REJECTED);

    const user = await tx.user.findUnique({ where: { id: actorId } });

    await tx.scheduleApproval.create({
      data: {
        schedule: { connect: { id: scheduleId } },
        approvalStage: 'TECHNICAL',
        decision: 'REJECT',
        reviewRound: schedule.reviewRound,
        reviewer: { connect: { id: actorId } },
        reviewerNameSnapshot: user?.name || 'Unknown',
        reviewerRoleSnapshot: user?.role || 'Unknown',
        comments: reason,
        validationSnapshot: 'N/A',
        snapshotVersion: '1.0'
      }
    });

    return tx.projectSchedule.update({
      where: { id: scheduleId },
      data: {
        workflowStatus: ProjectScheduleWorkflowStatus.REJECTED,
        rowVersion: { increment: 1 }
      }
    });
  });
}

// ---------------------------------------------------------
// BASELINE ACTIVATION
// ---------------------------------------------------------

export async function activateScheduleBaseline({
  projectId,
  scheduleId,
  actorId,
  expectedRowVersion,
  idempotencyKey,
  requestFingerprint
}: {
  projectId: string;
  scheduleId: string;
  actorId: string;
  expectedRowVersion: number;
  idempotencyKey: string;
  requestFingerprint: string;
}) {
  return prisma.$transaction(async (tx) => {
    // 1. Idempotency Check
    const existingActivation = await tx.baselineActivation.findUnique({
      where: { idempotencyKey }
    });

    if (existingActivation) {
      if (existingActivation.requestId !== requestFingerprint) {
        throw new Error('IDEMPOTENCY_KEY_CONFLICT');
      }
      if (!existingActivation.isAuthoritative || existingActivation.invalidatedAt) {
         throw new Error('IDEMPOTENCY_KEY_CONFLICT');
      }
      const existingSchedule = await tx.projectSchedule.findUnique({ where: { id: scheduleId } });
      if (existingSchedule?.workflowStatus !== ProjectScheduleWorkflowStatus.ACTIVE_BASELINE || !existingSchedule.baselineCode) {
         throw new Error('IDEMPOTENCY_KEY_CONFLICT');
      }
      return existingSchedule;
    }

    // 2. Verify and read - STATE GUARD
    const schedule = await tx.projectSchedule.findUnique({
      where: { id: scheduleId, projectId }
    });

    if (!schedule) throw new Error('SCHEDULE_NOT_FOUND');
    
    if (schedule.workflowStatus === ProjectScheduleWorkflowStatus.ACTIVE_BASELINE) {
      throw new Error('SCHEDULE_ALREADY_ACTIVE');
    }
    if (schedule.workflowStatus !== ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL) {
      throw new Error(`INVALID_WORKFLOW_TRANSITION: Cannot transition from ${schedule.workflowStatus} to ACTIVE_BASELINE`);
    }
    if (schedule.rowVersion !== expectedRowVersion) {
      throw new Error('SCHEDULE_VERSION_CONFLICT');
    }

    // 3. Verify no authoritative activation exists for this schedule
    const existingAuth = await tx.baselineActivation.findFirst({
      where: { scheduleId, isAuthoritative: true, invalidatedAt: null }
    });
    if (existingAuth) {
      throw new Error('AUTHORITATIVE_ACTIVATION_ALREADY_EXISTS');
    }

    // 4. Rerun deterministic validation
    const valResult = await validateScheduleForReview({ projectId, scheduleId, actorId, expectedRowVersion: schedule.rowVersion, tx });
    if (!valResult.isValid) throw new Error('VALIDATION_FAILED_DURING_ACTIVATION: ' + valResult.errors.join(', '));

    // 5. Verify technical approval belongs to the current review round
    const techApproval = await tx.scheduleApproval.findFirst({
      where: { scheduleId, approvalStage: 'TECHNICAL', decision: 'APPROVE', reviewRound: schedule.reviewRound },
      orderBy: { createdAt: 'desc' }
    });
    if (!techApproval) throw new Error('MISSING_TECHNICAL_APPROVAL_FOR_CURRENT_ROUND');

    // 6. Verify hash matches
    if (techApproval.scheduleSnapshotHash !== valResult.hash) throw new Error('SNAPSHOT_HASH_MISMATCH');

    // 7. Determine baseline number safely
    const existingActive = await tx.projectSchedule.findFirst({
      where: { projectId, workflowStatus: ProjectScheduleWorkflowStatus.ACTIVE_BASELINE }
    });

    // Count existing baselines for code generation
    const validBaselinesCount = await tx.projectSchedule.count({
      where: {
        projectId,
        baselineCode: { not: null }
      }
    });

    const highestRevision = await tx.projectSchedule.aggregate({
      where: { projectId },
      _max: { revisionNumber: true }
    });

    const nextRevNum = (highestRevision._max.revisionNumber || 0) + 1;
    const nextBaselineNum = validBaselinesCount + 1;
    const nextRevCode = `REV-${nextRevNum.toString().padStart(3, '0')}`;
    const nextBaselineCode = `BL-${nextBaselineNum.toString().padStart(3, '0')}`;

    // 8. Supersede current active baseline
    if (existingActive) {
      await tx.projectSchedule.update({
        where: { id: existingActive.id },
        data: {
          workflowStatus: ProjectScheduleWorkflowStatus.SUPERSEDED_BASELINE,
          status: 'REVISED', // legacy compatibility
          rowVersion: { increment: 1 }
        }
      });
    }

    const user = await tx.user.findUnique({ where: { id: actorId } });
    const now = new Date();

    // 9. Update activities to set baseline dates
    const activities = await tx.scheduleActivity.findMany({ where: { scheduleId } });
    for (const act of activities) {
      if (act.plannedStartDate && act.plannedFinishDate) {
        await tx.scheduleActivity.update({
          where: { id: act.id },
          data: {
            baselineStartDate: act.plannedStartDate,
            baselineFinishDate: act.plannedFinishDate
          }
        });
      }
    }

    // 10. Create ScheduleApproval
    await tx.scheduleApproval.create({
      data: {
        schedule: { connect: { id: scheduleId } },
        approvalStage: 'FINAL_ACTIVATION',
        decision: 'APPROVE',
        reviewRound: schedule.reviewRound,
        reviewer: { connect: { id: actorId } },
        reviewerNameSnapshot: user?.name || 'Unknown',
        reviewerRoleSnapshot: user?.role || 'Unknown',
        comments: 'Final Activation',
        validationSnapshot: 'PASS',
        snapshotVersion: '1.0',
        scheduleSnapshotHash: valResult.hash,
        lockedBOQChecksum: schedule.lockedBOQChecksum || 'NONE',
        idempotencyKey,
        requestId: requestFingerprint
      }
    });

    // 11. Create BaselineActivation
    await tx.baselineActivation.create({
      data: {
        schedule: { connect: { id: scheduleId } },
        activatedBy: { connect: { id: actorId } },
        revisionCode: nextRevCode,
        reviewRound: schedule.reviewRound,
        validationSnapshot: valResult.errors,
        snapshotVersion: "1.0",
        scheduleSnapshotHash: valResult.hash,
        activatedByNameSnapshot: user?.name || 'Unknown',
        activatedByRoleSnapshot: user?.role || 'Unknown',
        previousBaselineId: existingActive?.id,
        idempotencyKey,
        requestId: requestFingerprint,
        isAuthoritative: true
      }
    });

    // 12. Set ACTIVE_BASELINE (All-or-nothing completion)
    return tx.projectSchedule.update({
      where: { id: scheduleId },
      data: {
        workflowStatus: ProjectScheduleWorkflowStatus.ACTIVE_BASELINE,
        status: 'BASELINE', // legacy compatibility
        revisionNumber: nextRevNum,
        revisionCode: nextRevCode,
        baselineCode: nextBaselineCode,
        activatedById: actorId,
        activatedAt: now,
        activationSnapshotHash: valResult.hash,
        baselineStartDate: schedule.projectStartDate,
        baselineFinishDate: schedule.projectCompletionDate,
        rowVersion: { increment: 1 } // validation already incremented rowVersion in valResult, so we increment from original expectedRowVersion + 1, wait, update increments from DB value.
      }
    });

  }, { 
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 50000,
    timeout: 50000
  });
}
