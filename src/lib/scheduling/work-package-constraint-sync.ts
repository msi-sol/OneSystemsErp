import{Prisma}from'@prisma/client';
import{randomUUID}from'node:crypto';
import{readWorkPackagePlanDetails,type PlanConstraint,type WorkPackagePlanDetails}from'./work-package-details-types';
import{emptyExecutionDocument,type ExecutionConstraint,type WorkPackageExecutionDocument}from'./work-package-execution-types';

export function mergeLiveConstraints(details:WorkPackagePlanDetails,activityIds:string[],constraints:ExecutionConstraint[]):PlanConstraint[]{
 const byStable=new Map(activityIds.map(id=>[details.packageIdentities?.[id]||id,id]));
 const merged=new Map(details.constraints.map(row=>[row.id,row]));
 for(const row of constraints){
  const activityId=row.sourcePackageId?byStable.get(row.sourcePackageId):null;
  if(row.sourcePackageId&&!activityId)continue;
  merged.set(row.id,{id:row.id,activityId:activityId||null,type:row.type,title:row.title,description:row.description,ownerId:row.ownerId,neededBy:row.neededBy,blocking:row.blocking,status:row.status,resolution:row.resolution,resolvedAt:row.resolvedAt,resolvedById:row.resolvedById});
 }
 return [...merged.values()];
}

/** Live constraints are independent of the frozen baseline; draft fingerprints must still see them. */
export async function synchronizeDraftConstraints(tx:Prisma.TransactionClient,projectId:string,constraints:ExecutionConstraint[],excludeScheduleId?:string){
 const drafts=await tx.projectSchedule.findMany({where:{projectId,generationRulesVersion:'BOQ_WPS_WORKSPACE_V1',workflowStatus:{in:['AI_GENERATED_DRAFT','INVALID_GENERATED_DRAFT','TECHNICAL_REVISIONS_REQUIRED']},...(excludeScheduleId?{id:{not:excludeScheduleId}}:{})},include:{activities:{select:{id:true}}}});
 for(const schedule of drafts){const details=readWorkPackagePlanDetails(schedule.description),next=mergeLiveConstraints(details,schedule.activities.map(row=>row.id),constraints);if(JSON.stringify(next)===JSON.stringify(details.constraints))continue;details.constraints=next;const saved=await tx.projectSchedule.updateMany({where:{id:schedule.id,rowVersion:schedule.rowVersion},data:{description:JSON.stringify(details),rowVersion:{increment:1}}});if(saved.count!==1)throw Error('SCHEDULE_VERSION_CONFLICT');}
}

export async function recordDraftConstraint(tx:Prisma.TransactionClient,input:{projectId:string;scheduleId:string;constraint:PlanConstraint;sourcePackageId:string|null;actorId:string}){
 const row=await tx.workPackageExecutionState.findUnique({where:{projectId:input.projectId}});
 const doc:WorkPackageExecutionDocument=row?JSON.parse(row.dataJson):emptyExecutionDocument();
 if(doc.version!==1||!Array.isArray(doc.constraints)||!Array.isArray(doc.audit))throw Error('EXECUTION_DOCUMENT_INVALID');
 const previous=doc.constraints.find(value=>value.id===input.constraint.id);
 const before=previous?{...previous,history:undefined}:null;
 if(previous?.status==='RESOLVED')throw Error('RESOLVED_CONSTRAINT_IS_IMMUTABLE');
 const at=new Date().toISOString(),value:ExecutionConstraint={...input.constraint,type:input.constraint.type||'OTHER',title:input.constraint.title||input.constraint.description,source:'OPERATIONAL',sourcePackageId:input.sourcePackageId,createdAt:previous?.createdAt||at,createdById:previous?.createdById||input.actorId,resolvedAt:input.constraint.resolvedAt||null,resolvedById:input.constraint.resolvedById||null,history:[...(previous?.history||[]),{action:input.constraint.status==='RESOLVED'?'resolved':previous?'updated':'opened',actorId:input.actorId,at,before,after:input.constraint}]};
 if(previous)doc.constraints=doc.constraints.map(row=>row.id===input.constraint.id?value:row);else doc.constraints.push(value);
 doc.audit.push({id:randomUUID(),action:'WPS_DRAFT_CONSTRAINT_RECORDED',actorId:input.actorId,at,entityId:value.id,before,after:{...value,history:undefined}});
 if(row){const saved=await tx.workPackageExecutionState.updateMany({where:{id:row.id,rowVersion:row.rowVersion},data:{dataJson:JSON.stringify(doc),rowVersion:{increment:1}}});if(saved.count!==1)throw Error('EXECUTION_VERSION_CONFLICT');}else await tx.workPackageExecutionState.create({data:{projectId:input.projectId,dataJson:JSON.stringify(doc),rowVersion:1}});
 await synchronizeDraftConstraints(tx,input.projectId,doc.constraints,input.scheduleId);
 return doc.constraints;
}
