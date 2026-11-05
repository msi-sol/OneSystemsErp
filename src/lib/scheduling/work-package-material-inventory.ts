import {randomUUID} from 'node:crypto';
import {Prisma} from '@prisma/client';

type Tx=Prisma.TransactionClient;
export type MaterialInventoryDocument={
 version:1;
 warehouses:{id:string;name:string;active:boolean}[];
 catalog:{id:string;code:string;description:string;unit:string}[];
 bindings:{projectId:string;materialId:string;catalogId:string}[];
 balances:{warehouseId:string;catalogId:string;quantity:string}[];
 reservations:{id:string;projectId:string;sourcePackageId:string;materialId:string;catalogId:string;warehouseId:string|null;quantity:string;createdAt:string;releasedReason?:string}[];
 transfers:{id:string;projectId:string;sourcePackageId:string|null;materialId:string;catalogId:string;warehouseId:string;quantity:string;status:'DRAFT'|'DISPATCHED'|'RECEIVED'|'CANCELLED';reference:string;createdAt:string;dispatchedAt?:string;receivedAt?:string}[];
 adjustments:{id:string;warehouseId:string;catalogId:string;delta:string;reason:string;reference:string;status:'PENDING'|'APPROVED'|'REJECTED';preparedBy:string;approvedBy?:string;createdAt:string}[];
};
const empty=():MaterialInventoryDocument=>({version:1,warehouses:[],catalog:[],bindings:[],balances:[],reservations:[],transfers:[],adjustments:[]});
const d=(value:string|number)=>new Prisma.Decimal(value);
function quantity(value:unknown,signed=false){let result:Prisma.Decimal;try{result=d(String(value));}catch{throw Error('INVALID_MATERIAL_QUANTITY');}if(!result.isFinite()||(!signed&&result.lte(0))||(signed&&result.isZero())||result.abs().gt(1_000_000_000)||result.decimalPlaces()>4)throw Error('INVALID_MATERIAL_QUANTITY');return result;}
function text(value:unknown,code:string,min=1,max=500){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw Error(code);return value.trim();}
export async function loadMaterialInventory(tx:Tx){
 const row=await tx.workPackageMaterialInventoryState.findUnique({where:{id:'global'}});
 const doc:MaterialInventoryDocument=row?JSON.parse(row.dataJson):empty();
 if(doc.version!==1||!['warehouses','catalog','bindings','balances','reservations','transfers','adjustments'].every(key=>Array.isArray(doc[key as keyof MaterialInventoryDocument])))throw Error('MATERIAL_INVENTORY_DOCUMENT_INVALID');
 return{row,doc};
}
async function save(tx:Tx,state:Awaited<ReturnType<typeof loadMaterialInventory>>){
 const dataJson=JSON.stringify(state.doc);
 if(state.row){const saved=await tx.workPackageMaterialInventoryState.updateMany({where:{id:'global',rowVersion:state.row.rowVersion},data:{dataJson,rowVersion:{increment:1}}});if(saved.count!==1)throw Error('MATERIAL_INVENTORY_CHANGED');}
 else await tx.workPackageMaterialInventoryState.create({data:{id:'global',dataJson,rowVersion:1}});
}
function sumReservations(doc:MaterialInventoryDocument,filter:(row:MaterialInventoryDocument['reservations'][number])=>boolean){return doc.reservations.filter(filter).reduce((sum,row)=>sum.plus(row.quantity),d(0));}
export function materialInventoryAvailability(doc:MaterialInventoryDocument,projectId:string,materialId:string,sourcePackageId:string,projectStock:string|number){
 const binding=doc.bindings.find(row=>row.projectId===projectId&&row.materialId===materialId);
 const reservedForPackage=sumReservations(doc,row=>row.projectId===projectId&&row.materialId===materialId&&row.sourcePackageId===sourcePackageId);
 const projectReserved=sumReservations(doc,row=>row.projectId===projectId&&row.materialId===materialId&&!row.warehouseId);
 const warehouses=binding?doc.warehouses.filter(row=>row.active).map(warehouse=>{
  const total=d(doc.balances.find(row=>row.warehouseId===warehouse.id&&row.catalogId===binding.catalogId)?.quantity||0);
  const reserved=sumReservations(doc,row=>row.warehouseId===warehouse.id&&row.catalogId===binding.catalogId);
  return{warehouseId:warehouse.id,name:warehouse.name,onHand:total.toString(),reserved:reserved.toString(),available:Prisma.Decimal.max(0,total.minus(reserved)).toString()};
 }):[];
 const incomingTransfers=doc.transfers.filter(row=>row.projectId===projectId&&row.materialId===materialId&&row.sourcePackageId===sourcePackageId&&row.status==='DISPATCHED').reduce((sum,row)=>sum.plus(row.quantity),d(0));
 return{catalogId:binding?.catalogId||null,reservedForPackage:reservedForPackage.toString(),projectUnreserved:Prisma.Decimal.max(0,d(projectStock).minus(projectReserved)).toString(),warehouseUnreserved:warehouses.reduce((sum,row)=>sum.plus(row.available),d(0)).toString(),incomingTransfers:incomingTransfers.toString(),warehouses};
}

/** Native issuance and WPS reservations share the same transaction and project stock. */
export async function consumeMaterialReservations(tx:Tx,input:{projectId:string;materialId:string;quantity:string|number;projectStock:string|number;sourcePackageId:string|null}){
 const state=await loadMaterialInventory(tx),qty=quantity(input.quantity);
 const others=sumReservations(state.doc,row=>row.projectId===input.projectId&&row.materialId===input.materialId&&!row.warehouseId&&row.sourcePackageId!==input.sourcePackageId);
 if(qty.gt(d(input.projectStock).minus(others)))throw Error('PROJECT_STOCK_RESERVED_FOR_ANOTHER_PACKAGE');
 let remaining=qty;
 for(const reservation of state.doc.reservations.filter(row=>row.projectId===input.projectId&&row.materialId===input.materialId&&!row.warehouseId&&row.sourcePackageId===input.sourcePackageId)){
  const used=Prisma.Decimal.min(remaining,reservation.quantity);reservation.quantity=d(reservation.quantity).minus(used).toString();remaining=remaining.minus(used);
 }
 if(!remaining.eq(qty))await save(tx,state);
}

export async function runMaterialInventoryCommand(tx:Tx,input:{projectId:string;sourcePackageId:string;actorId:string;canApprove:boolean;body:Record<string,unknown>}){
 const {body}=input,state=await loadMaterialInventory(tx),doc=state.doc;
 if(body.expectedRowVersion!==(state.row?.rowVersion||0))throw Error('MATERIAL_INVENTORY_CHANGED');
 const id=randomUUID(),at=new Date().toISOString(),action=String(body.action);
 const warehouse=(id:unknown)=>{const row=doc.warehouses.find(row=>row.id===id&&row.active);if(!row)throw Error('ACTIVE_WAREHOUSE_REQUIRED');return row;};
 const material=async(id:unknown)=>{const row=await tx.consolidatedBOQItem.findFirst({where:{id:String(id),projectId:input.projectId}});if(!row)throw Error('PROJECT_MATERIAL_REQUIRED');return row;};
 if(action==='create-warehouse'){
  const name=text(body.name,'WAREHOUSE_NAME_REQUIRED',2,180);if(doc.warehouses.some(row=>row.name.toLowerCase()===name.toLowerCase()))throw Error('WAREHOUSE_NAME_EXISTS');doc.warehouses.push({id,name,active:true});
 }else if(action==='bind-material'){
  const item=await material(body.materialId);if(doc.bindings.some(row=>row.projectId===input.projectId&&row.materialId===item.id))throw Error('MATERIAL_CATALOG_ALREADY_LINKED');
  let catalog=doc.catalog.find(row=>row.id===body.catalogId);
  if(!catalog){if(body.catalogId)throw Error('CATALOG_MATERIAL_NOT_FOUND');catalog={id,code:item.itemCode,description:item.description,unit:item.unit};doc.catalog.push(catalog);}
  if(catalog.unit.trim().toLowerCase()!==item.unit.trim().toLowerCase())throw Error('MATERIAL_UNIT_MISMATCH');
  doc.bindings.push({projectId:input.projectId,materialId:item.id,catalogId:catalog.id});
 }else if(action==='propose-adjustment'){
  const site=warehouse(body.warehouseId),catalog=doc.catalog.find(row=>row.id===body.catalogId);if(!catalog)throw Error('CATALOG_MATERIAL_REQUIRED');
  doc.adjustments.push({id,warehouseId:site.id,catalogId:catalog.id,delta:quantity(body.delta,true).toString(),reason:text(body.reason,'ADJUSTMENT_REASON_REQUIRED',5),reference:text(body.reference,'STOCK_EVIDENCE_REFERENCE_REQUIRED',3),status:'PENDING',preparedBy:input.actorId,createdAt:at});
 }else if(action==='approve-adjustment'||action==='reject-adjustment'){
  if(!input.canApprove)throw Error('INVENTORY_APPROVAL_PERMISSION_REQUIRED');
  const adjustment=doc.adjustments.find(row=>row.id===body.adjustmentId&&row.status==='PENDING');if(!adjustment)throw Error('PENDING_ADJUSTMENT_REQUIRED');
  if(action==='approve-adjustment'){
   warehouse(adjustment.warehouseId);let balance=doc.balances.find(row=>row.warehouseId===adjustment.warehouseId&&row.catalogId===adjustment.catalogId);if(!balance){balance={warehouseId:adjustment.warehouseId,catalogId:adjustment.catalogId,quantity:'0'};doc.balances.push(balance);}
   const next=d(balance.quantity).plus(adjustment.delta),reserved=sumReservations(doc,row=>row.warehouseId===adjustment.warehouseId&&row.catalogId===adjustment.catalogId);if(next.lt(reserved)||next.lt(0))throw Error('ADJUSTMENT_WOULD_CONSUME_RESERVED_STOCK');balance.quantity=next.toString();
  }
  adjustment.status=action==='approve-adjustment'?'APPROVED':'REJECTED';adjustment.approvedBy=input.actorId;
 }else if(action==='reserve'){
  const item=await material(body.materialId),binding=doc.bindings.find(row=>row.projectId===input.projectId&&row.materialId===item.id);if(!binding)throw Error('LINK_MATERIAL_CATALOG_FIRST');
  const qty=quantity(body.quantity),siteId=body.warehouseId?warehouse(body.warehouseId).id:null;
  const total=siteId?d(doc.balances.find(row=>row.warehouseId===siteId&&row.catalogId===binding.catalogId)?.quantity||0):Prisma.Decimal.max(0,d(item.deliveredQty).minus(item.consumedQty));
  const reserved=sumReservations(doc,row=>siteId?row.warehouseId===siteId&&row.catalogId===binding.catalogId:!row.warehouseId&&row.projectId===input.projectId&&row.materialId===item.id);
  if(qty.gt(total.minus(reserved)))throw Error('INSUFFICIENT_UNRESERVED_STOCK');
  doc.reservations.push({id,projectId:input.projectId,sourcePackageId:input.sourcePackageId,materialId:item.id,catalogId:binding.catalogId,warehouseId:siteId,quantity:qty.toString(),createdAt:at});
 }else if(action==='release-reservation'){
  const reservation=doc.reservations.find(row=>row.id===body.reservationId&&row.projectId===input.projectId&&row.sourcePackageId===input.sourcePackageId);if(!reservation||d(reservation.quantity).lte(0))throw Error('PACKAGE_RESERVATION_REQUIRED');reservation.releasedReason=text(body.reason,'RELEASE_REASON_REQUIRED',3);reservation.quantity='0';
 }else if(action==='create-transfer'){
  const item=await material(body.materialId),binding=doc.bindings.find(row=>row.projectId===input.projectId&&row.materialId===item.id);if(!binding)throw Error('LINK_MATERIAL_CATALOG_FIRST');
  doc.transfers.push({id,projectId:input.projectId,sourcePackageId:input.sourcePackageId,materialId:item.id,catalogId:binding.catalogId,warehouseId:warehouse(body.warehouseId).id,quantity:quantity(body.quantity).toString(),status:'DRAFT',reference:text(body.reference,'TRANSFER_REFERENCE_REQUIRED',3),createdAt:at});
 }else if(['dispatch-transfer','receive-transfer','cancel-transfer'].includes(action)){
  const transfer=doc.transfers.find(row=>row.id===body.transferId&&row.projectId===input.projectId&&row.sourcePackageId===input.sourcePackageId);if(!transfer)throw Error('PACKAGE_TRANSFER_REQUIRED');
  if(action==='cancel-transfer'){if(transfer.status!=='DRAFT')throw Error('ONLY_DRAFT_TRANSFER_CAN_BE_CANCELLED');transfer.status='CANCELLED';}
  else if(action==='dispatch-transfer'){
   if(transfer.status!=='DRAFT')throw Error('TRANSFER_ALREADY_DISPATCHED');warehouse(transfer.warehouseId);
   const balance=doc.balances.find(row=>row.warehouseId===transfer.warehouseId&&row.catalogId===transfer.catalogId),otherReserved=sumReservations(doc,row=>row.warehouseId===transfer.warehouseId&&row.catalogId===transfer.catalogId&&!(row.projectId===input.projectId&&row.sourcePackageId===input.sourcePackageId&&row.materialId===transfer.materialId));
   if(!balance||d(transfer.quantity).gt(d(balance.quantity).minus(otherReserved)))throw Error('INSUFFICIENT_UNRESERVED_WAREHOUSE_STOCK');
   balance.quantity=d(balance.quantity).minus(transfer.quantity).toString();let consume=d(transfer.quantity);
   for(const reservation of doc.reservations.filter(row=>row.warehouseId===transfer.warehouseId&&row.catalogId===transfer.catalogId&&row.projectId===input.projectId&&row.sourcePackageId===input.sourcePackageId&&row.materialId===transfer.materialId)){const used=Prisma.Decimal.min(consume,reservation.quantity);reservation.quantity=d(reservation.quantity).minus(used).toString();consume=consume.minus(used);}
   transfer.status='DISPATCHED';transfer.dispatchedAt=at;
  }else{
   if(transfer.status!=='DISPATCHED')throw Error('DISPATCHED_TRANSFER_REQUIRED');await material(transfer.materialId);
   await tx.consolidatedBOQItem.update({where:{id:transfer.materialId},data:{deliveredQty:{increment:Number(transfer.quantity)}}});
   doc.reservations.push({id:randomUUID(),projectId:input.projectId,sourcePackageId:input.sourcePackageId,materialId:transfer.materialId,catalogId:transfer.catalogId,warehouseId:null,quantity:transfer.quantity,createdAt:at});
   transfer.status='RECEIVED';transfer.receivedAt=at;
  }
 }else throw Error('UNKNOWN_INVENTORY_ACTION');
 await save(tx,state);
 await tx.auditLog.create({data:{userId:input.actorId,moduleName:'PROJECT_SCHEDULING',transactionId:id,actionType:`WPS_INVENTORY_${action.replaceAll('-','_').toUpperCase()}`,newValue:JSON.stringify({projectId:input.projectId,sourcePackageId:input.sourcePackageId,...body,actorId:input.actorId,at})}});
 return{success:true,rowVersion:(state.row?.rowVersion||0)+1,id};
}
