import{Prisma}from'@prisma/client';
import{prisma}from'./prisma';

/** Protect the WPS installation evidence when the existing ERP receives a material return. */
export async function processWpsMaterialReturn(returnId:string,warehousemanId:string){
 return prisma.$transaction(async tx=>{
  const record=await tx.materialReturn.findUnique({where:{id:returnId},include:{items:true,issuance:{include:{items:true,returns:{where:{status:'COMPLETED'},include:{items:true}}}}}});
  if(!record||record.status!=='PENDING'||record.projectId!==record.issuance.projectId)throw Error('Return slip is not an open package return.');
  const events=await tx.auditLog.findMany({where:{actionType:'WPS_MATERIAL_INSTALLED',newValue:{contains:`"issuanceId":"${record.issuanceId}"`}},select:{newValue:true}});
  const totals=new Map<string,Prisma.Decimal>();
  for(const item of record.items){if(!(item.returnedQty>0)||!record.issuance.items.some(row=>row.id===item.issuanceItemId&&row.consolidatedBoqItemId===item.consolidatedBoqItemId))throw Error('Return material does not match the released issuance.');totals.set(item.consolidatedBoqItemId,(totals.get(item.consolidatedBoqItemId)||new Prisma.Decimal(0)).plus(String(item.returnedQty)));}
  for(const[materialId,quantity]of totals){
   const released=record.issuance.items.filter(row=>row.consolidatedBoqItemId===materialId).reduce((sum,row)=>sum.plus(String(row.releasedQty)),new Prisma.Decimal(0));
   const returned=record.issuance.returns.flatMap(row=>row.items).filter(row=>row.consolidatedBoqItemId===materialId).reduce((sum,row)=>sum.plus(String(row.returnedQty)),new Prisma.Decimal(0));
   const installed=events.reduce((sum,row)=>{const event=JSON.parse(row.newValue||'{}');return event.materialId===materialId?sum.plus(String(event.quantity)):sum;},new Prisma.Decimal(0));
   if(returned.plus(installed).plus(quantity).gt(released))throw Error('Return exceeds the released material remaining after recorded installations and prior returns.');
  }
  for(const item of record.items.filter(row=>row.condition==='GOOD')){
   const result=await tx.consolidatedBOQItem.updateMany({where:{id:item.consolidatedBoqItemId,projectId:record.projectId,consumedQty:{gte:item.returnedQty}},data:{consumedQty:{decrement:item.returnedQty}}});if(result.count!==1)throw Error('Material consumption changed; reconcile stock before receiving this return.');
  }
  const updated=await tx.materialReturn.updateMany({where:{id:returnId,status:'PENDING'},data:{status:'COMPLETED',warehousemanId,receiveDate:new Date()}});if(updated.count!==1)throw Error('Return already processed.');
  await tx.materialIssuance.update({where:{id:record.issuanceId},data:{status:'COMPLETED'}});
  await tx.auditLog.create({data:{moduleName:'PROJECT_SCHEDULING',actionType:'WPS_MATERIAL_RETURN_RECEIVED',transactionId:returnId,userId:warehousemanId,newValue:JSON.stringify({projectId:record.projectId,issuanceId:record.issuanceId,items:record.items})}});
  return tx.materialReturn.findUnique({where:{id:returnId}});
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
}
