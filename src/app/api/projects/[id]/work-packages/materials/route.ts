import {NextResponse}from'next/server';
import{randomUUID}from'node:crypto';
import{Prisma}from'@prisma/client';
import{prisma}from'@/lib/prisma';
import{getSessionActor}from'@/lib/scheduling/authUtils';
import{planningCapacity}from'@/lib/scheduling/planning-capacity';
import{hasPermission}from'@/lib/permissions';
import{readWorkPackagePlanDetails}from'@/lib/scheduling/work-package-details-types';
import type{WorkPackageExecutionDocument}from'@/lib/scheduling/work-package-execution-types';
import{canInstallMaterial,confirmedMaterialRequestLines}from'@/lib/scheduling/work-package-material-quantities';
import{readPackageMaterialPlanning,WPS_REQUIREMENT}from'@/lib/scheduling/work-package-material-planning';
import{loadMaterialInventory,runMaterialInventoryCommand}from'@/lib/scheduling/work-package-material-inventory';
type Context={params:Promise<{id:string}>};
const ACTION='WPS_PROCUREMENT_RECORD_LINKED';
async function context(projectId:string,activityId:string){
 const schedule=await prisma.projectSchedule.findFirst({where:{projectId,workflowStatus:'ACTIVE_BASELINE'},include:{activities:{include:{boqAllocations:true}}}});
 const activity=schedule?.activities.find(row=>row.id===activityId);if(!schedule||!activity)throw Error('ACTIVE_BASELINE_PACKAGE_REQUIRED');
 const details=readWorkPackagePlanDetails(schedule.description);return{schedule,activity,sourcePackageId:details.packageIdentities?.[activity.id]||activity.id,details};
}
export async function GET(request:Request,{params}:Context){
 try{
  const{id:projectId}=await params;const actor=await getSessionActor();const access=await planningCapacity(actor,projectId);
  if(!access.canView||!await hasPermission(actor.id,'PROCUREMENT','canView'))return NextResponse.json({error:'PROCUREMENT_ACCESS_REQUIRED'},{status:403});
  const activityId=new URL(request.url).searchParams.get('activityId')||'';const current=await context(projectId,activityId);
  const [audits,requests,issuances,consumption,items,execution]=await Promise.all([
   prisma.auditLog.findMany({where:{moduleName:'PROJECT_SCHEDULING',actionType:{in:[ACTION,'WPS_MATERIAL_INSTALLED']}},select:{transactionId:true,newValue:true,actionType:true,createdAt:true},orderBy:{createdAt:'asc'}}),
   prisma.materialRequest.findMany({where:{projectId},include:{items:{include:{consolidatedBoqItem:true}},purchaseOrders:{include:{deliveries:true}}},orderBy:{createdAt:'desc'}}),
   prisma.materialIssuance.findMany({where:{projectId},include:{items:{include:{consolidatedBoqItem:true}},returns:{include:{items:true}}},orderBy:{createdAt:'desc'}}),
   prisma.consumptionLog.findMany({where:{projectId},include:{items:{include:{consolidatedBoqItem:true}}},orderBy:{date:'desc'}}),
   prisma.consolidatedBOQItem.findMany({where:{projectId},select:{id:true,itemCode:true,description:true,unit:true,unitCost:true,quantity:true}}),
   prisma.workPackageExecutionState.findUnique({where:{projectId},select:{dataJson:true}}),
  ]);
  const links=audits.filter(row=>row.actionType===ACTION).flatMap(row=>{try{const value=JSON.parse(row.newValue||'{}');return value.projectId===projectId?[value as{recordType:string;recordId:string;sourcePackageId:string}]:[];}catch{return[];}});
  const installations=audits.filter(row=>row.actionType==='WPS_MATERIAL_INSTALLED').flatMap(row=>{try{const value=JSON.parse(row.newValue||'{}');return value.projectId===projectId&&value.sourcePackageId===current.sourcePackageId?[{id:row.transactionId,...value,recordedAt:row.createdAt}]:[];}catch{return[];}});
  const siteLogs=execution?(JSON.parse(execution.dataJson)as WorkPackageExecutionDocument).siteLogs.filter(row=>row.sourcePackageId===current.sourcePackageId&&row.baselineScheduleId===current.schedule.id).map(row=>({id:row.id,logDate:row.logDate})):[];
  const requirements=await readPackageMaterialPlanning(prisma as unknown as Prisma.TransactionClient,projectId,current.sourcePackageId);
  const inventory=await loadMaterialInventory(prisma as unknown as Prisma.TransactionClient);
  const inventoryView={rowVersion:inventory.row?.rowVersion||0,warehouses:inventory.doc.warehouses,catalog:inventory.doc.catalog,bindings:inventory.doc.bindings.filter(row=>row.projectId===projectId),reservations:inventory.doc.reservations.filter(row=>row.projectId===projectId&&row.sourcePackageId===current.sourcePackageId),transfers:inventory.doc.transfers.filter(row=>row.projectId===projectId&&row.sourcePackageId===current.sourcePackageId),adjustments:inventory.doc.adjustments};
  const mine=(recordType:string,id:string)=>links.some(row=>row.recordType===recordType&&row.recordId===id&&row.sourcePackageId===current.sourcePackageId);
  return NextResponse.json({items,requests,issuances,consumption,installations,siteLogs,requirements,inventory:inventoryView,canOperateInventory:await hasPermission(actor.id,'INVENTORY','canEditDraft'),canApproveInventory:await hasPermission(actor.id,'INVENTORY','canApprove'),canInstall:access.canRecordSiteLogs,canPlanMaterials:await hasPermission(actor.id,'INVENTORY','canEditDraft'),linked:{requestIds:requests.filter(row=>mine('REQUEST',row.id)).map(row=>row.id),issuanceIds:issuances.filter(row=>mine('ISSUANCE',row.id)).map(row=>row.id),consumptionIds:consumption.filter(row=>mine('CONSUMPTION',row.id)).map(row=>row.id)},plannedMaterialAllowance:current.details.resources.filter(row=>row.activityId===activityId&&row.kind==='MATERIAL').reduce((sum,row)=>sum.plus(row.amount),new Prisma.Decimal(0)).toFixed(2),canCreate:access.canView&&await hasPermission(actor.id,'PROCUREMENT','canCreate')});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'MATERIALS_UNAVAILABLE'},{status:400});}
}
export async function POST(request:Request,{params}:Context){
 try{
  const{id:projectId}=await params;const actor=await getSessionActor();const access=await planningCapacity(actor,projectId);
  const body=await request.json();
  const inventoryAction=['create-warehouse','bind-material','propose-adjustment','approve-adjustment','reject-adjustment','reserve','release-reservation','create-transfer','dispatch-transfer','receive-transfer','cancel-transfer'].includes(body.action);
  if(inventoryAction||body.action==='set-requirement'?!access.canView||!await hasPermission(actor.id,'INVENTORY','canEditDraft'):body.action==='record-installation'?!access.canRecordSiteLogs:!access.canView||!await hasPermission(actor.id,'PROCUREMENT','canCreate'))return NextResponse.json({error:'PROCUREMENT_CREATE_PERMISSION_REQUIRED'},{status:403});
  const current=await context(projectId,String(body.activityId));
  const result=await prisma.$transaction(async rawTx=>{
   const tx=rawTx as unknown as Prisma.TransactionClient;
   if(!await tx.project.findFirst({where:{id:projectId,status:{not:'ARCHIVED'}},select:{id:true}}))throw Error('PROJECT_NOT_OPEN_FOR_CHANGES');
   if(!await tx.projectSchedule.findFirst({where:{id:current.schedule.id,projectId,workflowStatus:'ACTIVE_BASELINE'},select:{id:true}}))throw Error('ACTIVE_BASELINE_CHANGED');
   if(inventoryAction)return runMaterialInventoryCommand(tx,{projectId,sourcePackageId:current.sourcePackageId,actorId:actor.id,canApprove:await hasPermission(actor.id,'INVENTORY','canApprove'),body});
   let recordId=String(body.recordId||''),recordType=String(body.recordType||'');
   if(body.action==='set-requirement'){
     const material=await tx.consolidatedBOQItem.findFirst({where:{id:String(body.materialId),projectId}});if(!material)throw Error('PROJECT_MATERIAL_REQUIRED');
     const quantity=new Prisma.Decimal(String(body.requiredQuantity));if(!quantity.isFinite()||quantity.lt(0)||quantity.gt(Number.MAX_SAFE_INTEGER))throw Error('INVALID_MATERIAL_REQUIREMENT');
     const existing=(await readPackageMaterialPlanning(tx,projectId,current.sourcePackageId)).find(row=>row.materialId===material.id);
     if((existing?.eventId||null)!==(body.expectedEventId||null))throw Error('MATERIAL_REQUIREMENT_CHANGED');
     if(existing&&quantity.lt(existing.installed))throw Error('REQUIREMENT_BELOW_INSTALLED_MATERIAL');
     if(typeof body.note!=='string'||body.note.trim().length<3)throw Error('MATERIAL_REQUIREMENT_REASON_REQUIRED');
     const id=randomUUID();await tx.auditLog.create({data:{userId:actor.id,userRole:actor.role,moduleName:'PROJECT_SCHEDULING',transactionId:id,actionType:WPS_REQUIREMENT,newValue:JSON.stringify({projectId,sourcePackageId:current.sourcePackageId,materialId:material.id,requiredQuantity:quantity.toString(),note:body.note.trim()})}});
     return{recordId:id,recordType:'REQUIREMENT'};
   }else if(body.action==='record-installation'){
     const issuance=await tx.materialIssuance.findFirst({where:{id:String(body.issuanceId),projectId},include:{items:true,returns:{include:{items:true}}}});
     const linked=issuance&&await tx.auditLog.findFirst({where:{transactionId:issuance.id,actionType:ACTION,newValue:{contains:'"sourcePackageId":"'+current.sourcePackageId+'"'}}});
     if(!issuance||!linked||!['RELEASED','COMPLETED'].includes(issuance.status)||!issuance.releaseDate)throw Error('RELEASED_PACKAGE_ISSUANCE_REQUIRED');
     const execution=await tx.workPackageExecutionState.findUnique({where:{projectId}});
     const log=execution?(JSON.parse(execution.dataJson)as WorkPackageExecutionDocument).siteLogs.find(row=>row.id===body.siteLogId):null;
     if(!log||log.sourcePackageId!==current.sourcePackageId||log.baselineScheduleId!==current.schedule.id||log.logDate!==body.installationDate)throw Error('INSTALLATION_REQUIRES_SAME_BASELINE_PACKAGE_AND_SITE_LOG_DATE');
     const materialId=String(body.materialId),quantity=new Prisma.Decimal(String(body.quantity));
     if(!await tx.consolidatedBOQItem.findFirst({where:{id:materialId,projectId},select:{id:true}}))throw Error('PROJECT_MATERIAL_REQUIRED');
     if(!quantity.isFinite()||quantity.lte(0))throw Error('POSITIVE_INSTALLATION_QUANTITY_REQUIRED');
     const released=issuance.items.filter(row=>row.consolidatedBoqItemId===materialId).reduce((sum,row)=>sum.plus(String(row.releasedQty)),new Prisma.Decimal(0));
     const returned=issuance.returns.filter(row=>row.status==='COMPLETED').flatMap(row=>row.items).filter(row=>row.consolidatedBoqItemId===materialId).reduce((sum,row)=>sum.plus(String(row.returnedQty)),new Prisma.Decimal(0));
     const events=await tx.auditLog.findMany({where:{actionType:'WPS_MATERIAL_INSTALLED',newValue:{contains:'"issuanceId":"'+issuance.id+'"'}},select:{newValue:true}});
     const installed=events.reduce((sum,row)=>{const value=JSON.parse(row.newValue||'{}');return value.materialId===materialId?sum.plus(String(value.quantity)):sum;},new Prisma.Decimal(0));
     if(!canInstallMaterial({released:released.toString(),returned:returned.toString(),installed:installed.toString(),proposed:quantity.toString(),logDate:log.logDate,installationDate:body.installationDate,sameBaseline:log.baselineScheduleId===current.schedule.id,samePackage:log.sourcePackageId===current.sourcePackageId}))throw Error('INSTALLATION_EXCEEDS_NET_ISSUED_QUANTITY');
     const id=randomUUID();await tx.auditLog.create({data:{userId:actor.id,userRole:actor.role,moduleName:'PROJECT_SCHEDULING',transactionId:id,actionType:'WPS_MATERIAL_INSTALLED',newValue:JSON.stringify({projectId,scheduleId:current.schedule.id,sourcePackageId:current.sourcePackageId,siteLogId:log.id,installationDate:log.logDate,issuanceId:issuance.id,materialId,quantity:quantity.toString(),recordedById:actor.id})}});
     return{recordId:id,recordType:'INSTALLATION'};
   }else if(body.action==='create-request'){
    if(!Array.isArray(body.items)||!body.items.length||body.items.length>200)throw Error('SELECT_MATERIAL_REQUIREMENTS');
    const rows=[];
    const requirements=await readPackageMaterialPlanning(tx,projectId,current.sourcePackageId);
    const confirmed=confirmedMaterialRequestLines(body.items,requirements);
    for(const entry of confirmed){if(!await tx.consolidatedBOQItem.findFirst({where:{id:entry.materialId,projectId},select:{id:true}}))throw Error('PROJECT_MATERIAL_REQUIRED');rows.push({consolidatedBoqItemId:entry.materialId,quantity:entry.quantity});}
    if(typeof body.purpose!=='string'||body.purpose.trim().length<3)throw Error('REQUEST_PURPOSE_REQUIRED');
    const mr=await tx.materialRequest.create({data:{mrNumber:`DRAFT-WPS-${Date.now()}-${randomUUID().slice(0,8)}`,projectId,requesterId:actor.id,status:'DRAFT',purpose:body.purpose.trim(),locationOfUse:typeof body.locationOfUse==='string'?body.locationOfUse:'',dateNeeded:body.dateNeeded?new Date(body.dateNeeded):null,items:{create:rows}}});
    recordId=mr.id;recordType='REQUEST';
   }else if(body.action==='link-record'){
    const record=recordType==='REQUEST'?await tx.materialRequest.findFirst({where:{id:recordId,projectId}}):recordType==='ISSUANCE'?await tx.materialIssuance.findFirst({where:{id:recordId,projectId}}):recordType==='CONSUMPTION'?await tx.consumptionLog.findFirst({where:{id:recordId,projectId}}):null;
    if(!record)throw Error('PROJECT_MATERIAL_RECORD_NOT_FOUND');
   }else throw Error('UNKNOWN_MATERIAL_ACTION');
   const prior=await tx.auditLog.findMany({where:{transactionId:recordId,actionType:ACTION},select:{newValue:true}});
   for(const row of prior){const value=JSON.parse(row.newValue||'{}');if(value.recordType===recordType)throw Error(value.sourcePackageId===current.sourcePackageId?'RECORD_ALREADY_LINKED':'RECORD_LINKED_TO_ANOTHER_PACKAGE');}
   await tx.auditLog.create({data:{userId:actor.id,userRole:actor.role,moduleName:'PROJECT_SCHEDULING',transactionId:recordId,actionType:ACTION,newValue:JSON.stringify({projectId,sourcePackageId:current.sourcePackageId,scheduleId:current.schedule.id,recordId,recordType})}});
   return{recordId,recordType};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  return NextResponse.json({success:true,...result});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'MATERIAL_ACTION_FAILED'},{status:400});}
}
