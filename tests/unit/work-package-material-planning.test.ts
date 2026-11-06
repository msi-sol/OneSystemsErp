import {Prisma}from'@prisma/client';
import{readPackageMaterialPlanning,WPS_REQUIREMENT,WPS_MATERIAL_LINK}from'@/lib/scheduling/work-package-material-planning';
function setup(){
 const payload=(value:object)=>JSON.stringify({projectId:'project',sourcePackageId:'package',...value});
 const events=[{id:'old',actionType:WPS_REQUIREMENT,newValue:payload({materialId:'cement',requiredQuantity:'100',note:'Old'})},{id:'current',actionType:WPS_REQUIREMENT,newValue:payload({materialId:'cement',requiredQuantity:'200',note:'Confirmed quantities'})},{id:'request-link',actionType:WPS_MATERIAL_LINK,newValue:payload({recordType:'REQUEST',recordId:'mr'})},{id:'issue-link',actionType:WPS_MATERIAL_LINK,newValue:payload({recordType:'ISSUANCE',recordId:'issue'})},{id:'installed',actionType:'WPS_MATERIAL_INSTALLED',newValue:payload({materialId:'cement',quantity:'30'})}];
 const tx={workPackageMaterialInventoryState:{findUnique:jest.fn().mockResolvedValue(null)},auditLog:{findMany:jest.fn().mockResolvedValue(events)},consolidatedBOQItem:{findMany:jest.fn().mockResolvedValue([{id:'cement',description:'Cement',unit:'bag',deliveredQty:100,consumedQty:80}])},materialRequest:{findMany:jest.fn().mockResolvedValue([{id:'mr',status:'APPROVED',items:[{consolidatedBoqItemId:'cement',quantity:100,approvedQuantity:80}],purchaseOrders:[{status:'APPROVED',items:[{consolidatedBoqItemId:'cement',quantity:80}],deliveries:[{status:'APPROVED',items:[{consolidatedBoqItemId:'cement',quantity:20}]},{status:'DRAFT',items:[{consolidatedBoqItemId:'cement',quantity:50}]}]}]},{id:'another-package',status:'APPROVED',items:[{consolidatedBoqItemId:'cement',quantity:999}],purchaseOrders:[]}])},materialIssuance:{findMany:jest.fn().mockResolvedValue([{id:'issue',items:[{consolidatedBoqItemId:'cement',releasedQty:80}],returns:[{items:[{consolidatedBoqItemId:'cement',returnedQty:10}]}]}])}};
 return tx;
}
describe('real package material demand and purchase headroom',()=>{
 it('uses latest confirmed demand and subtracts net issues, confirmed stock and undelivered request once',async()=>{
  const tx=setup();const [row]=await readPackageMaterialPlanning(tx as unknown as Prisma.TransactionClient,'project','package');
  expect(row).toMatchObject({eventId:'current',requiredQuantity:'200',issued:'70',installed:'30',held:'40',projectStock:'20',pendingRequests:'0',openPurchaseOrders:'60',shortage:'50'});
 });
 it('never shows negative shortage or stock, and excludes cancelled requests',async()=>{
  const tx=setup();tx.materialRequest.findMany.mockResolvedValue([{id:'mr',status:'CANCELLED',items:[{consolidatedBoqItemId:'cement',quantity:100,approvedQuantity:80}],purchaseOrders:[]}]);
  tx.consolidatedBOQItem.findMany.mockResolvedValue([{id:'cement',description:'Cement',unit:'bag',deliveredQty:500,consumedQty:80}]);
  const [row]=await readPackageMaterialPlanning(tx as unknown as Prisma.TransactionClient,'project','package');expect(row.shortage).toBe('0');expect(row.pendingRequests).toBe('0');
 });
 it.each(['DRAFT','AI_CHECKING'])('does not reserve demand for an unsubmitted %s request',async(status)=>{
  const tx=setup();tx.materialRequest.findMany.mockResolvedValue([{id:'mr',status,items:[{consolidatedBoqItemId:'cement',quantity:100,approvedQuantity:80}],purchaseOrders:[]}]);
  const [row]=await readPackageMaterialPlanning(tx as unknown as Prisma.TransactionClient,'project','package');expect(row.pendingRequests).toBe('0');expect(row.shortage).toBe('110');
 });
});
