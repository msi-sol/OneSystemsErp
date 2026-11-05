export type ExecutionStatus = 'DRAFT' | 'COMMITTED' | 'CLOSED' | 'DISCARDED';
export type OperationalConstraintStatus = 'OPEN' | 'RESOLVED';
export type PlanLocation = { id: string; name: string; parentId: string | null; code?: string; type?: string; isActive?: boolean };

export type ExecutionWorkEntry = {
  id: string;
  allocationId: string;
  sourcePackageId: string;
  boqItemId: string;
  locationId: string;
  quantity: string;
  unit: string;
  recordedAt: string;
  recordedById: string;
  correctionOfId: string | null;
  correctionReason: string | null;
};
export type ExecutionLaborEntry = {
  id: string;
  trade: string;
  headcount: number;
  hoursPerWorker: string;
  hourlyRate: string;
  subcontractor: string | null;
  recordedAt: string;
  recordedById: string;
};
export type ExecutionSiteLog = {
  id: string;
  activityId: string;
  baselineScheduleId: string;
  sourcePackageId: string;
  logDate: string;
  workDescription: string;
  weather: string | null;
  equipmentHours: string | null;
  blockedAcknowledged: boolean;
  workEntries: ExecutionWorkEntry[];
  laborEntries: ExecutionLaborEntry[];
  createdAt: string;
  createdById: string;
};
export type ExecutionWeeklyTarget = {
  id: string;
  activityId: string;
  sourcePackageId: string;
  allocationId: string;
  boqItemId: string;
  locationId: string;
  unit: string;
  quantity: string;
  blockedAcknowledged: boolean;
  reason: string | null;
  createdAt: string;
  createdById: string;
};
export type ExecutionWeeklyPlan = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: ExecutionStatus;
  baselineScheduleId: string;
  targets: ExecutionWeeklyTarget[];
  closedAt: string | null;
  closedById: string | null;
  closeSnapshot: unknown | null;
  discardedAt: string | null;
  discardedById: string | null;
  discardReason: string | null;
};
export type ExecutionConstraint = {
  id: string;
  source: 'BASELINE' | 'OPERATIONAL';
  activityId: string | null;
  sourcePackageId: string | null;
  type: string;
  title: string;
  description: string;
  ownerId: string | null;
  neededBy: string | null;
  status: OperationalConstraintStatus;
  blocking: boolean;
  resolution: string | null;
  createdAt: string;
  createdById: string;
  resolvedAt: string | null;
  resolvedById: string | null;
  history: Array<{ action: string; actorId: string; at: string; before: unknown; after: unknown }>;
};
export type ExecutionAuditEntry = {
  id: string;
  action: string;
  actorId: string;
  at: string;
  entityId: string;
  before: unknown;
  after: unknown;
};
export type WorkPackageExecutionDocument = {
  version: 1;
  weeklyPlans: ExecutionWeeklyPlan[];
  siteLogs: ExecutionSiteLog[];
  constraints: ExecutionConstraint[];
  audit: ExecutionAuditEntry[];
  locations?: PlanLocation[];
};

export const emptyExecutionDocument = (): WorkPackageExecutionDocument => ({ version: 1, weeklyPlans: [], siteLogs: [], constraints: [], audit: [], locations: [] });

export type ExecutionAllocationView = {
  allocationId: string;
  activityId: string;
  sourcePackageId: string;
  boqItemId: string;
  itemCode: string;
  description: string;
  unit: string;
  locationId: string | null;
  approvedQuantity: string;
  allocatedQuantity: string | null;
  allocatedAmount: string;
};

export type ExecutionPackageView = {
  activityId: string;
  sourcePackageId: string;
  code: string;
  name: string;
  startDate: string | null;
  finishDate: string | null;
  weight: number;
  allocations: Array<ExecutionAllocationView & { measuredToDate: string; remainingQuantity: string | null }>;
};

export type WorkPackageExecutionData = {
  success: true;
  projectId: string;
  rowVersion: number;
  baseline: { scheduleId: string; baselineCode: string | null; revisionCode: string | null; approvedAt: string | null; boqVersionId: string; boqChecksum: string | null };
  packages: ExecutionPackageView[];
  locations: Array<{ id: string; name: string; parentId: string | null; code?: string; type?: string; isActive?: boolean }>;
  weeklyPlans: Array<ExecutionWeeklyPlan & { actualByTarget: Array<{ targetId: string; actual: string; achievementPercent: number; remaining: string; shortfall: string }> }>;
  siteLogs: ExecutionSiteLog[];
  constraints: ExecutionConstraint[];
  lookAhead: {
    horizonDays: number;
    late: Array<ExecutionPackageView & { physicalStatus: 'not-started' | 'in-progress' | 'complete'; lane: 'late' | 'underway' | 'upcoming' | null }>;
    underway: Array<ExecutionPackageView & { physicalStatus: 'not-started' | 'in-progress' | 'complete'; lane: 'late' | 'underway' | 'upcoming' | null }>;
    upcoming: Array<ExecutionPackageView & { physicalStatus: 'not-started' | 'in-progress' | 'complete'; lane: 'late' | 'underway' | 'upcoming' | null }>;
    attention: {
      undated: Array<ExecutionPackageView & { physicalStatus: 'not-started' | 'in-progress' | 'complete'; lane: 'late' | 'underway' | 'upcoming' | null }>;
      openConstraints: ExecutionConstraint[];
      constraintStanding: Array<{ constraintId: string; sourcePackageId: string | null; standing: 'overdue' | 'conflicts-with-start' | 'approaching'; neededBy: string; plannedStartDate: string | null }>;
    };
  };
};
