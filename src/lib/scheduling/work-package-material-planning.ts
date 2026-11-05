import{Prisma}from'@prisma/client';
import{loadMaterialInventory,materialInventoryAvailability}from'./work-package-material-inventory';
export const WPS_MATERIAL_LINK='WPS_PROCUREMENT_RECORD_LINKED';
export const WPS_REQUIREMENT='WPS_MATERIAL_REQUIREMENT_SET';
type Event={id:string;actionType:string;newValue:string|null};
export async function readPackageMaterialPlanning(tx:Prisma.TransactionClient,projectId:string,sourcePackageId:string){
 const [events,items,requests,issuances]=await Promise.all([
  tx.auditLog.findMany({where:{moduleName:'PROJECT_SCHEDULING',actionType:{in:[WPS_MATERIAL_LINK,WPS_REQUIREMENT,'WPS_MATERIAL_INSTALLED']}},orderBy:[{createdAt:'asc'},{id:'asc'}],select:{id:true,actionType:true,newValue:true}}),
  tx.consolidatedBOQItem.findMany({where:{projectId},select:{id:true,description:true,unit:true,deliveredQty:true,consumedQty:true}}),
  tx.materialRequest.findMany({where:{projectId},include:{items:true,purchaseOrders:{include:{items:true,deliveries:{include:{items:true}}}}}}),
  tx.materialIssuance.findMany({where:{projectId,status:{in:['RELEASED','COMPLETED']}},include:{items:true,returns:{where:{status:'COMPLETED'},include:{items:true}}}}),
 ]);
 const payload=(event:Event)=>{try{const value=JSON.parse(event.newValue||'{}');return value.projectId===projectId&&value.sourcePackageId===sourcePackageId?value:null;}catch{return null;}};
 const links=events.filter(event=>event.actionType===WPS_MATERIAL_LINK).flatMap(event=>payload(event)?[payload(event)]:[]);
 const ownedRequests=requests.filter(row=>links.some(link=>link.recordType==='REQUEST'&&link.recordId===row.id));
 const ownedIssuances=issuances.filter(row=>links.some(link=>link.recordType==='ISSUANCE'&&link.recordId===row.id));
 const inventory=await loadMaterialInventory(tx);
 const latest=new Map<string,{eventId:string;materialId:string;requiredQuantity:string;note:string}>();
 for(const event of events.filter(row=>row.actionType===WPS_REQUIREMENT)){const value=payload(event);if(value)latest.set(value.materialId,{eventId:event.id,materialId:value.materialId,requiredQuantity:String(value.requiredQuantity),note:value.note||''});}
 return [...latest.values()].map(requirement=>{
  const material=items.find(row=>row.id===requirement.materialId);if(!material)throw Error('MATERIAL_REQUIREMENT_REFERENCE_INVALID');
  const issued=ownedIssuances.reduce((total,record)=>total.plus(record.items.filter(item=>item.consolidatedBoqItemId===material.id).reduce((sum,item)=>sum.plus(String(item.releasedQty)),new Prisma.Decimal(0))).minus(record.returns.flatMap(row=>row.items).filter(item=>item.consolidatedBoqItemId===material.id).reduce((sum,item)=>sum.plus(String(item.returnedQty)),new Prisma.Decimal(0))),new Prisma.Decimal(0));
  const installed=events.filter(event=>event.actionType==='WPS_MATERIAL_INSTALLED').reduce((sum,event)=>{const value=payload(event);return value?.materialId===material.id?sum.plus(String(value.quantity)):sum;},new Prisma.Decimal(0));
  let pending=new Prisma.Decimal(0),openPurchaseOrders=new Prisma.Decimal(0);
  for(const record of ownedRequests){
   const requested=['CANCELLED','REJECTED'].includes(record.status)?new Prisma.Decimal(0):record.items.filter(row=>row.consolidatedBoqItemId===material.id).reduce((total,row)=>total.plus(String(row.approvedQuantity??row.quantity)),new Prisma.Decimal(0));
   const orders=record.purchaseOrders.filter(row=>['APPROVED','ISSUED','PARTIALLY_DELIVERED','DELIVERED','COMPLETED'].includes(row.status));
   const ordered=orders.flatMap(order=>order.items).filter(row=>row.consolidatedBoqItemId===material.id).reduce((total,row)=>total.plus(String(row.quantity)),new Prisma.Decimal(0));
   const delivered=orders.flatMap(order=>order.deliveries).filter(delivery=>['APPROVED','COMPLETED'].includes(delivery.status)).flatMap(delivery=>delivery.items).filter(row=>row.consolidatedBoqItemId===material.id).reduce((total,row)=>total.plus(String(row.quantity)),new Prisma.Decimal(0));
   pending=pending.plus(Prisma.Decimal.max(0,requested.minus(ordered).minus(Prisma.Decimal.max(0,delivered.minus(ordered)))));
   openPurchaseOrders=openPurchaseOrders.plus(Prisma.Decimal.max(0,ordered.minus(delivered)));
  }
  const stock=Prisma.Decimal.max(0,new Prisma.Decimal(String(material.deliveredQty)).minus(String(material.consumedQty)));
  const availability=materialInventoryAvailability(inventory.doc,projectId,material.id,sourcePackageId,stock.toString());
  const shortage=Prisma.Decimal.max(0,new Prisma.Decimal(requirement.requiredQuantity).minus(issued).minus(pending).minus(openPurchaseOrders).minus(availability.projectUnreserved).minus(availability.reservedForPackage).minus(availability.warehouseUnreserved).minus(availability.incomingTransfers));
  return{...requirement,description:material.description,unit:material.unit,issued:issued.toString(),installed:installed.toString(),held:Prisma.Decimal.max(0,issued.minus(installed)).toString(),pendingRequests:pending.toString(),openPurchaseOrders:openPurchaseOrders.toString(),projectStock:stock.toString(),...availability,shortage:shortage.toString()};
 });
}
