import Decimal from 'decimal.js';
import { readWorkPackagePlanDetails, type WorkPackagePlanDetails } from './work-package-details-types';
import { wpsAllowancesRequired } from './wps-capacity-mode';

export type ReadinessActivity = { id:string; activityCode?:string|null; name:string; plannedStartDate:Date|string|null; plannedFinishDate:Date|string|null; plannedWeight:number; boqAllocations:{id:string;allocatedQuantity:unknown}[] };
export type ReadinessCondition = {key:string;label:string;passed:boolean;detail:string};
export type PackageStanding = {id:string;state:'ready'|'attention'|'blocked';reasons:string[]};
const day = (value:Date|string|null) => value ? new Date(value).getTime() : null;

/** Source WPS scope/preparation checks shared by display, engineering review and PM approval. */
export function deriveWorkPackageReadiness(input:{activities:ReadinessActivity[];dependencies:{predecessorId:string;successorId:string;type?:string;lagDays?:number}[];description?:string|null;details?:WorkPackagePlanDetails;contractAmount:string|number;scopeReconciled:boolean}) {
  const details=input.details||readWorkPackagePlanDetails(input.description);
  const activities=input.activities;
  const codes=(rows:ReadinessActivity[])=>rows.map(row=>row.activityCode||row.name).join(', ');
  const missingDates=activities.filter(row=>!row.plannedStartDate||!row.plannedFinishDate);
  const impossible=activities.filter(row=>{const start=day(row.plannedStartDate),finish=day(row.plannedFinishDate);return start!==null&&finish!==null&&(!Number.isFinite(start)||!Number.isFinite(finish)||start>finish);});
  const missingScope=activities.filter(row=>!row.boqAllocations.length||row.boqAllocations.some(allocation=>allocation.allocatedQuantity==null));
  const unlocated=activities.filter(row=>row.boqAllocations.length&&!row.boqAllocations.some(allocation=>details.allocationLocations[allocation.id]));
  // Allowances are optional unless that rule is switched on: then every package needs all three kinds, confirmed.
  const allowancesRequired=wpsAllowancesRequired();
  const missingResources=allowancesRequired?activities.filter(row=>!['MATERIAL','LABOR','EQUIPMENT'].every(kind=>details.resources.some(resource=>resource.activityId===row.id&&resource.kind===kind))):[];
  const unreviewed=!allowancesRequired?[]:activities.filter(row=>details.resources.some(resource=>resource.activityId===row.id&&resource.isSystemSuggested)||details.resourcesReviewNeeded?.[row.id]);
  const unaccountable=details.constraints.filter(row=>row.status==='OPEN'&&(!row.ownerId||!row.neededBy));
  const weight=activities.reduce((sum,row)=>sum.plus(String(row.plannedWeight)),new Decimal(0));
  const directCost=details.resources.reduce((sum,row)=>sum.plus(row.amount),new Decimal(0));

  const outgoing=new Map<string,string[]>();for(const link of input.dependencies)outgoing.set(link.predecessorId,[...(outgoing.get(link.predecessorId)||[]),link.successorId]);
  const visiting=new Set<string>(),done=new Set<string>();
  function cyclic(id:string):boolean{if(visiting.has(id))return true;if(done.has(id))return false;visiting.add(id);if((outgoing.get(id)||[]).some(cyclic))return true;visiting.delete(id);done.add(id);return false;}
  const cycle=activities.some(row=>cyclic(row.id));
  const conflicts=input.dependencies.filter(link=>{
    const before=activities.find(row=>row.id===link.predecessorId),after=activities.find(row=>row.id===link.successorId);if(!before||!after)return true;
    const type=link.type||'FS',from=day(type.startsWith('F')?before.plannedFinishDate:before.plannedStartDate),to=day(type.endsWith('F')?after.plannedFinishDate:after.plannedStartDate);
    return from!==null&&to!==null&&to<from+(link.lagDays||0)*86400000;
  });
  const check=(key:string,label:string,passed:boolean,detail=''):ReadinessCondition=>({key,label,passed,detail});
  const checks=[
    check('scope_checks','BOQ quantities and stated values reconcile',input.scopeReconciled),
    check('scope_present','Every package carries stated BOQ scope',activities.length>0&&!missingScope.length,codes(missingScope)),
    check('weights','Completion weights total 100%',activities.length>0&&weight.minus(1).abs().lt('0.000001'),`${weight.times(100).toDecimalPlaces(4)}% entered`),
    check('resources',allowancesRequired?'Materials, labor and equipment allowances are set':'Allowances (optional)',activities.length>0&&!missingResources.length,codes(missingResources)),
    check('resource_review',allowancesRequired?'Resource allowances have been reviewed':'Allowance review (optional)',!unreviewed.length,codes(unreviewed)),
    // Only the overall total matters: all allowances together may not exceed the BOQ value (equal is fine).
    check('direct_cost','Total allowances do not exceed the BOQ value',activities.length>0&&directCost.lte(String(input.contractAmount)),`${directCost.toFixed(2)} direct cost`),
    check('dates','Every package has planner-entered start and finish dates',activities.length>0&&!missingDates.length,codes(missingDates)),
    check('windows','No planned finish precedes its start',!impossible.length,codes(impossible)),
    check('acyclic','Sequence links contain no cycle',!cycle),
    check('sequence','Planned dates respect recorded sequence links',!conflicts.length,conflicts.map(link=>`${link.predecessorId} → ${link.successorId}`).join(', ')),
    check('locations','Every package states where its work happens',!unlocated.length,codes(unlocated)),
    check('constraints','Every open constraint has an owner and needed-by date',!unaccountable.length,unaccountable.map(row=>row.title||row.description).join(', ')),
  ];
  const packages:PackageStanding[]=activities.map(row=>{
    const blocked:string[]=[],attention:string[]=[];
    if(missingScope.includes(row))blocked.push('BOQ scope is not stated.');
    if(missingResources.includes(row))blocked.push('Materials, labor and equipment are not all planned.');
    const open=details.constraints.filter(constraint=>constraint.status==='OPEN'&&(!constraint.activityId||constraint.activityId===row.id));
    if(open.length)blocked.push(...open.map(constraint=>constraint.title||constraint.description));
    if(unreviewed.includes(row))attention.push('Review resource allowances.');
    if(row.boqAllocations.some(allocation=>!details.allocationLocations[allocation.id]))attention.push('Some scope has no location.');
    if(missingDates.includes(row))attention.push('Set planned start and finish.');
    return{id:row.id,state:blocked.length?'blocked':attention.length?'attention':'ready',reasons:[...blocked,...attention]};
  });
  return{checks,ready:checks.every(row=>row.passed),packages,directCost:directCost.toFixed(2)};
}
