import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { buildWorkPackageSummary } from '@/lib/scheduling/work-package-summary';
import { createWorkPackageSnapshot, hashWorkPackageSnapshot } from '@/lib/scheduling/work-package-review';
import { readWorkPackagePlanDetails } from '@/lib/scheduling/work-package-details-types';
import { getWorkPackageExecutionData,WorkPackageExecutionError } from '@/lib/scheduling/work-package-execution';
import PlanningModuleShell from '../planning/PlanningModuleShell';
import WorkPackageModuleClient from './WorkPackageModuleClient';
import type { ModuleSchedule, WorkPackageModuleProps } from './module-types';

export const dynamic = 'force-dynamic';
const editable = new Set<string>(['AI_GENERATED_DRAFT','INVALID_GENERATED_DRAFT','TECHNICAL_REVISIONS_REQUIRED']);

export default async function WorkPackagesModulePage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{view?:string;package?:string;activity?:string;baseline?:string}>}) {
  const {id}=await params, query=await searchParams;
  const actor=await getSessionActor().catch(()=>null);
  if(!actor)redirect('/login');
  const capacity=await planningCapacity(actor,id);
  if(!capacity.canView)notFound();
  const [project,version,schedules]=await Promise.all([
    prisma.project.findUnique({where:{id},select:{id:true,name:true,status:true,contractAmount:true,boqLocked:true,startDate:true,
      awardedBoqItems:{orderBy:{createdAt:'asc'},select:{id:true,itemCode:true,description:true,unit:true,quantity:true,totalCost:true}},
      userAssignments:{where:{assignmentStatus:'active'},select:{user:{select:{id:true,name:true}}}},
    }}),
    prisma.projectBOQVersion.findFirst({where:{projectId:id},orderBy:{versionNumber:'desc'},select:{status:true}}),
    prisma.projectSchedule.findMany({where:{projectId:id},orderBy:[{createdAt:'desc'},{id:'desc'}],include:{
      activities:{orderBy:{createdAt:'asc'},include:{wbs:true,boqAllocations:{include:{awardedBoqItem:{select:{id:true,itemCode:true,description:true,unit:true,quantity:true,totalCost:true}}}}}},
      wbsNodes:{orderBy:{orderIndex:'asc'}},dependencies:true,approvals:{orderBy:{decidedAt:'desc'}},
    }}),
  ]);
  if(!project)notFound();
  const activeBaseline=schedules.find(schedule=>schedule.workflowStatus==='ACTIVE_BASELINE'),draft=schedules.find(schedule=>editable.has(schedule.workflowStatus));
  const selected=(query.baseline==='active'||query.package&&activeBaseline?.activities.some(row=>row.id===query.package)?activeBaseline:undefined)||draft||activeBaseline||null;
  if(query.activity&&!activeBaseline?.activities.some(row=>row.id===query.activity))notFound();
  if(query.package && !selected?.activities.some(activity=>activity.id===query.package))notFound();
  const summary=selected?buildWorkPackageSummary(selected,project.awardedBoqItems):null;
  let executionWarning='';
  if(summary&&selected){
    if(selected.workflowStatus==='ACTIVE_BASELINE'){
      try{const execution=await getWorkPackageExecutionData(id);
      for(const pkg of summary.packages){
        const measured=execution.packages.find(row=>row.activityId===pkg.id);
        const total=measured?.allocations.reduce((sum,row)=>sum+Number(row.allocatedAmount),0)||0;
        const earned=measured?.allocations.reduce((sum,row)=>sum+Number(row.allocatedAmount)*(Number(row.allocatedQuantity)>0?Math.min(1,Number(row.measuredToDate)/Number(row.allocatedQuantity)):0),0)||0;
        pkg.recordedProgressPercent=total>0?Number((earned/total*100).toFixed(4)):0;
      }
      }catch(error){if(!(error instanceof WorkPackageExecutionError))throw error;executionWarning='This existing baseline does not carry the verified activation required for measured execution. Start a plan revision, prepare its scope and resources, then complete Engineer review and PM approval to enable daily logs and weekly commitments.';for(const pkg of summary.packages)pkg.recordedProgressPercent=null;}
    }else for(const pkg of summary.packages)pkg.recordedProgressPercent=null;
  }
  let schedule:ModuleSchedule|null=null;
  const revisionComparison:NonNullable<WorkPackageModuleProps['revisionComparison']>=[];
  if(selected){
    const hash=hashWorkPackageSnapshot(createWorkPackageSnapshot(selected,selected.wbsNodes,selected.activities,selected.dependencies));
    const review=selected.approvals.find(record=>record.approvalStage==='TECHNICAL'&&record.decision==='APPROVE'&&record.snapshotVersion==='BOQ_WPS_WORKSPACE_V1');
    schedule={id:selected.id,name:selected.name,workflowStatus:selected.workflowStatus,generationRulesVersion:selected.generationRulesVersion,rowVersion:selected.rowVersion,baselineCode:selected.baselineCode,previousBaselineId:selected.previousBaselineId,parentScheduleId:selected.parentScheduleId,revisionCode:selected.revisionCode,activatedAt:selected.activatedAt?.toISOString()||null,
      activities:selected.activities.map(activity=>({id:activity.id,activityCode:activity.activityCode,name:activity.name,description:activity.description,plannedStartDate:activity.plannedStartDate?.toISOString()||null,plannedFinishDate:activity.plannedFinishDate?.toISOString()||null,plannedDuration:activity.plannedDuration,plannedWeight:activity.plannedWeight,status:activity.status,actualProgressPercent:activity.actualProgressPercent,allocatedAmount:activity.allocatedAmount.toString()})),
      allocations:selected.activities.flatMap(activity=>activity.boqAllocations.map(row=>({id:row.id,activityId:row.activityId,awardedBoqItemId:row.awardedBoqItemId,allocatedQuantity:row.allocatedQuantity?.toString()||null,allocatedAmount:row.allocatedAmount?.toString()||null}))),
      dependencies:selected.dependencies.map(row=>({id:row.id,predecessorId:row.predecessorId,successorId:row.successorId,type:row.type,lagDays:row.lagDays})),
      details:readWorkPackagePlanDetails(selected.description),
      review:review?{current:review.scheduleSnapshotHash===hash,reviewerName:review.reviewerNameSnapshot,comments:review.comments||'',decidedAt:review.decidedAt.toISOString()}:null,
    };
    if(selected.previousBaselineId&&editable.has(selected.workflowStatus)){
      const baseline=schedules.find(record=>record.id===selected.previousBaselineId);
      if(baseline){
        const code=(activity:typeof selected.activities[number])=>activity.activityCode||activity.name;
        const facts=(activity:typeof selected.activities[number])=>`${activity.name}; ${activity.plannedStartDate?.toISOString().slice(0,10)||'No start'} – ${activity.plannedFinishDate?.toISOString().slice(0,10)||'No finish'}; weight ${Number((activity.plannedWeight*100).toFixed(4))}%; scope ${activity.boqAllocations.map(row=>`${row.awardedBoqItem.itemCode}: ${row.allocatedQuantity} ${row.awardedBoqItem.unit}`).sort().join(', ')||'none'}`;
        const before=new Map(baseline.activities.map(activity=>[code(activity),activity]));
        for(const activity of selected.activities){const previous=before.get(code(activity));const old=previous?facts(previous):'New package';const next=facts(activity);if(old!==next)revisionComparison.push({name:code(activity),before:old,after:next});before.delete(code(activity));}
        for(const activity of before.values())revisionComparison.push({name:code(activity),before:facts(activity),after:'Removed from revision proposal'});
        if(baseline.description!==selected.description)revisionComparison.push({name:'Planning assumptions',before:'Approved location, constraint and resource record',after:'Draft location, constraint or resource details changed'});
      }
    }
  }
  return <PlanningModuleShell project={project} active="work-packages"><WorkPackageModuleClient key={`${selected?.id||'empty'}:${query.package||query.view||'schedule'}:${query.activity||''}`} projectId={id} projectStartDate={project.startDate?.toISOString()||null}
    approvedBOQ={project.boqLocked&&!!version&&['APPROVED','LOCKED'].includes(version.status)} boqItems={project.awardedBoqItems} schedule={schedule} summary={summary} capacity={{canEdit:capacity.canEditPlan,canEngineerReview:capacity.canReviewPlan,canApprove:capacity.canApprovePlan,canRecordSiteLogs:capacity.canRecordSiteLogs,canManageWeekly:capacity.canManageWeekly}}
    members={project.userAssignments.map(assignment=>({id:assignment.user.id,name:assignment.user.name||'Project member'}))} initialView={query.view} initialPackage={query.package} revisionComparison={revisionComparison} executionWarning={executionWarning} executionActivityId={query.activity} hasOpenDraft={!!draft}/></PlanningModuleShell>;
}
