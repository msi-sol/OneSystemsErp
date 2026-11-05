import {Prisma} from '@prisma/client';
import {emptyWorkPackagePlanDetails} from '@/lib/scheduling/work-package-details-types';
import {emptyExecutionDocument,type ExecutionConstraint} from '@/lib/scheduling/work-package-execution-types';
import {mergeLiveConstraints,synchronizeDraftConstraints,recordDraftConstraint} from '@/lib/scheduling/work-package-constraint-sync';

const constraint:ExecutionConstraint={id:'access',activityId:'old',sourcePackageId:'stable',type:'OTHER',title:'Access',description:'Open site access',ownerId:'engineer',neededBy:'2026-11-09',blocking:true,status:'OPEN',resolution:null,resolvedAt:null,resolvedById:null,source:'OPERATIONAL',createdAt:'2026-11-05',createdById:'engineer',history:[]};
describe('live constraints across immutable WPS baselines and proposals',()=>{
 it('remaps stable identity to the proposed activity, preserving unrelated draft constraints',()=>{
  const details=emptyWorkPackagePlanDetails();details.packageIdentities={new:'stable'};details.constraints=[{...constraint,id:'draft-only',activityId:'new'}];
  expect(mergeLiveConstraints(details,['new'],[constraint,{...constraint,id:'other',sourcePackageId:'absent'}])).toEqual([details.constraints[0],expect.objectContaining({id:'access',activityId:'new'})]);
 });
 it('queries only editable native drafts and changes their fingerprint with an optimistic version',async()=>{
  const details=emptyWorkPackagePlanDetails();details.packageIdentities={new:'stable'};
  const tx={projectSchedule:{findMany:jest.fn().mockResolvedValue([{id:'draft',rowVersion:3,description:JSON.stringify(details),activities:[{id:'new'}]}]),updateMany:jest.fn().mockResolvedValue({count:1})}};
  await synchronizeDraftConstraints(tx as unknown as Prisma.TransactionClient,'project',[constraint],'baseline');
  expect(tx.projectSchedule.findMany.mock.calls[0][0].where.workflowStatus.in).not.toContain('ACTIVE_BASELINE');
  expect(tx.projectSchedule.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{id:'draft',rowVersion:3},data:expect.objectContaining({rowVersion:{increment:1}})}));
  expect(JSON.parse(tx.projectSchedule.updateMany.mock.calls[0][0].data.description).constraints[0].activityId).toBe('new');
 });
 it('rejects a stale draft without silently retaining a current engineering review',async()=>{
  const tx={projectSchedule:{findMany:jest.fn().mockResolvedValue([{id:'draft',rowVersion:3,description:JSON.stringify(emptyWorkPackagePlanDetails()),activities:[{id:'old'}]}]),updateMany:jest.fn().mockResolvedValue({count:0})}};
  await expect(synchronizeDraftConstraints(tx as unknown as Prisma.TransactionClient,'project',[{...constraint,sourcePackageId:'old'}])).rejects.toThrow('SCHEDULE_VERSION_CONFLICT');
 });
 it('refuses reopening a resolved operational constraint before any writes',async()=>{
  const doc=emptyExecutionDocument();doc.constraints=[{...constraint,status:'RESOLVED',resolution:'Access given'}];
  const tx={workPackageExecutionState:{findUnique:jest.fn().mockResolvedValue({id:'execution',rowVersion:1,dataJson:JSON.stringify(doc)}),updateMany:jest.fn()}};
  await expect(recordDraftConstraint(tx as unknown as Prisma.TransactionClient,{projectId:'project',scheduleId:'draft',constraint,sourcePackageId:'stable',actorId:'engineer'})).rejects.toThrow('RESOLVED_CONSTRAINT_IS_IMMUTABLE');
  expect(tx.workPackageExecutionState.updateMany).not.toHaveBeenCalled();
 });
});
