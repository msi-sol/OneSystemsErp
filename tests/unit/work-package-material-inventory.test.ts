import{Prisma}from'@prisma/client';
import{consumeMaterialReservations,materialInventoryAvailability,runMaterialInventoryCommand,type MaterialInventoryDocument}from'@/lib/scheduling/work-package-material-inventory';
function document():MaterialInventoryDocument{return{version:1,warehouses:[{id:'wh',name:'Main warehouse',active:true}],catalog:[{id:'cat',code:'C',description:'Cement',unit:'bag'}],bindings:[{projectId:'p',materialId:'cement',catalogId:'cat'}],balances:[{warehouseId:'wh',catalogId:'cat',quantity:'100'}],reservations:[{id:'mine',projectId:'p',sourcePackageId:'wp',materialId:'cement',catalogId:'cat',warehouseId:null,quantity:'20',createdAt:'2026-11-05'},{id:'other',projectId:'p',sourcePackageId:'another',materialId:'cement',catalogId:'cat',warehouseId:null,quantity:'30',createdAt:'2026-11-05'},{id:'warehouse-other',projectId:'another-project',sourcePackageId:'another',materialId:'another-cement',catalogId:'cat',warehouseId:'wh',quantity:'40',createdAt:'2026-11-05'}],transfers:[],adjustments:[]};}
function setup(doc=document()){
 let row={id:'global',rowVersion:3,dataJson:JSON.stringify(doc)};
 const item={id:'cement',itemCode:'C',description:'Cement',unit:'bag',deliveredQty:100,consumedQty:0};
 const tx={workPackageMaterialInventoryState:{findUnique:jest.fn().mockImplementation(async()=>row),updateMany:jest.fn().mockImplementation(async({data})=>{row={...row,dataJson:data.dataJson,rowVersion:row.rowVersion+1};return{count:1};}),create:jest.fn()},consolidatedBOQItem:{findFirst:jest.fn().mockResolvedValue(item),update:jest.fn()},auditLog:{create:jest.fn()}};
 return{tx,client:tx as unknown as Prisma.TransactionClient,read:()=>JSON.parse(row.dataJson)as MaterialInventoryDocument,item};
}
const input=(body:Record<string,unknown>)=>({projectId:'p',sourcePackageId:'wp',actorId:'operator',canApprove:true,body:{expectedRowVersion:3,...body}});
describe('shared warehouses and reservations in package material decisions',()=>{
 it('subtracts every project reservation and every warehouse reservation while showing this package held stock',()=>{
  const view=materialInventoryAvailability(document(),'p','cement','wp','100');
  expect(view).toMatchObject({reservedForPackage:'20',projectUnreserved:'50',warehouseUnreserved:'60',incomingTransfers:'0'});
 });
 it('rejects over-reservation without changing native stock or history',async()=>{
  const f=setup();await expect(runMaterialInventoryCommand(f.client,input({action:'reserve',materialId:'cement',quantity:'51'}))).rejects.toThrow('INSUFFICIENT_UNRESERVED_STOCK');expect(f.tx.consolidatedBOQItem.update).not.toHaveBeenCalled();expect(f.tx.auditLog.create).not.toHaveBeenCalled();
 });
 it('rejects a stale inventory edit before recording a movement',async()=>{const f=setup();await expect(runMaterialInventoryCommand(f.client,input({action:'reserve',expectedRowVersion:2,materialId:'cement',quantity:'1'}))).rejects.toThrow('MATERIAL_INVENTORY_CHANGED');expect(f.tx.workPackageMaterialInventoryState.updateMany).not.toHaveBeenCalled();});
 it('protects another package reservation when a native issuance is released',async()=>{
  const f=setup();await expect(consumeMaterialReservations(f.client,{projectId:'p',materialId:'cement',quantity:71,projectStock:100,sourcePackageId:'wp'})).rejects.toThrow('PROJECT_STOCK_RESERVED_FOR_ANOTHER_PACKAGE');
  await consumeMaterialReservations(f.client,{projectId:'p',materialId:'cement',quantity:25,projectStock:100,sourcePackageId:'wp'});expect(f.read().reservations.find(row=>row.id==='mine')?.quantity).toBe('0');expect(f.read().reservations.find(row=>row.id==='other')?.quantity).toBe('30');
 });
 it('keeps an unlinked native issuance from consuming any package reservation',async()=>{const f=setup();await expect(consumeMaterialReservations(f.client,{projectId:'p',materialId:'cement',quantity:51,projectStock:100,sourcePackageId:null})).rejects.toThrow('PROJECT_STOCK_RESERVED_FOR_ANOTHER_PACKAGE');});
 it('requires dispatch before project receipt and conserves quantities through both stages',async()=>{
  const doc=document();doc.transfers=[{id:'transfer',projectId:'p',sourcePackageId:'wp',materialId:'cement',catalogId:'cat',warehouseId:'wh',quantity:'50',status:'DRAFT',reference:'TR-1',createdAt:'2026-11-05'}];
  const f=setup(doc);await expect(runMaterialInventoryCommand(f.client,input({action:'receive-transfer',transferId:'transfer'}))).rejects.toThrow('DISPATCHED_TRANSFER_REQUIRED');
  await runMaterialInventoryCommand(f.client,input({action:'dispatch-transfer',transferId:'transfer'}));expect(f.read().balances[0].quantity).toBe('50');expect(f.tx.consolidatedBOQItem.update).not.toHaveBeenCalled();
  await runMaterialInventoryCommand(f.client,input({action:'receive-transfer',transferId:'transfer',expectedRowVersion:4}));expect(f.tx.consolidatedBOQItem.update).toHaveBeenCalledWith({where:{id:'cement'},data:{deliveredQty:{increment:50}}});expect(f.read().transfers[0].status).toBe('RECEIVED');expect(f.read().reservations.at(-1)).toMatchObject({warehouseId:null,quantity:'50'});
  await expect(runMaterialInventoryCommand(f.client,input({action:'receive-transfer',transferId:'transfer',expectedRowVersion:5}))).rejects.toThrow('DISPATCHED_TRANSFER_REQUIRED');
 });
 it('requires approval for adjustments and forbids corrections consuming reserved warehouse stock',async()=>{
  const doc=document();doc.adjustments=[{id:'adjust',warehouseId:'wh',catalogId:'cat',delta:'-61',status:'PENDING',reason:'Count correction',reference:'COUNT-1',preparedBy:'clerk',createdAt:'2026-11-05'}];const f=setup(doc);
  await expect(runMaterialInventoryCommand(f.client,{...input({action:'approve-adjustment',adjustmentId:'adjust'}),canApprove:false})).rejects.toThrow('INVENTORY_APPROVAL_PERMISSION_REQUIRED');
  await expect(runMaterialInventoryCommand(f.client,input({action:'approve-adjustment',adjustmentId:'adjust'}))).rejects.toThrow('ADJUSTMENT_WOULD_CONSUME_RESERVED_STOCK');
 });
 it('does not infer shared material identity from its description or accept incompatible units',async()=>{
  const f=setup();f.item.id='other-material';f.item.unit='kg';await expect(runMaterialInventoryCommand(f.client,input({action:'bind-material',materialId:'other-material',catalogId:'cat'}))).rejects.toThrow('MATERIAL_UNIT_MISMATCH');expect(f.tx.workPackageMaterialInventoryState.updateMany).not.toHaveBeenCalled();
 });
});
