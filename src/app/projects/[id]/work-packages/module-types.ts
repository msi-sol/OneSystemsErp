import type { WorkPackageSummaryResult } from '@/lib/scheduling/work-package-summary';
import type { PlanDetails } from '@/lib/scheduling/work-package-details-types';

export type ModuleActivity = { id: string; activityCode: string | null; name: string; description: string | null; plannedStartDate: string | null; plannedFinishDate: string | null; plannedDuration: number; plannedWeight: number; status: string; actualProgressPercent: number; allocatedAmount: string };
export type ModuleAllocation = { id: string; activityId: string; awardedBoqItemId: string; allocatedQuantity: string | null; allocatedAmount: string | null };
export type ModuleSchedule = { id: string; name: string; workflowStatus: string; generationRulesVersion: string | null; rowVersion: number; baselineCode: string | null; previousBaselineId: string | null; parentScheduleId: string | null; revisionCode: string | null; activatedAt: string | null; activities: ModuleActivity[]; allocations: ModuleAllocation[]; dependencies: {id:string;predecessorId:string;successorId:string;type:string;lagDays:number}[]; details: PlanDetails; review: {current:boolean;reviewerName:string;comments:string;decidedAt:string}|null };
export type WorkPackageModuleProps = {
  projectId: string; projectStartDate: string | null; approvedBOQ: boolean;
  /** Where the work happens by default (the project's recorded location, else "Project site"); pre-fills the one-location setup. */
  projectSite?: string;
  boqItems: { id: string; itemCode: string; description: string; unit: string; quantity: number; totalCost: number }[];
  schedule: ModuleSchedule | null; summary: WorkPackageSummaryResult | null;
  capacity: {canEdit:boolean;canEngineerReview:boolean;canApprove:boolean;canRecordSiteLogs:boolean;canManageWeekly:boolean};
  members:{id:string;name:string}[];
  initialView?:string; initialPackage?:string; initialPackageTab?:string; revisionComparison?:{name:string;before:string;after:string}[];
  executionWarning?:string;
  executionActivityId?:string;hasOpenDraft?:boolean;
};
