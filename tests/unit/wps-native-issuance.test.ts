jest.mock('../../apps/aws-backend/src/lib/prisma',()=>({prisma:{$transaction:jest.fn()}}));
jest.mock('../../apps/aws-backend/src/lib/aiValidation',()=>({validateTransactionWithAI:jest.fn()}));
jest.mock('@/lib/scheduling/work-package-material-inventory',()=>({consumeMaterialReservations:jest.fn()}));
import router from '../../apps/aws-backend/src/routes/issuance';
import{prisma}from'../../apps/aws-backend/src/lib/prisma';
import{consumeMaterialReservations}from'@/lib/scheduling/work-package-material-inventory';
type Handler=(req:unknown,res:unknown)=>Promise<unknown>;
const approve=(router as unknown as{stack:{route?:{path:string;stack:{handle:Handler}[]}}[]}).stack.find(row=>row.route?.path==='/:id/approve')!.route!.stack[0].handle;
function fixture(projectId='project'){
 const tx={materialIssuance:{findUnique:jest.fn().mockResolvedValue({id:'issue',projectId:'project',status:'PROCESSED',items:[{consolidatedBoqItemId:'cement',releasedQty:10}]}),update:jest.fn()},auditLog:{findFirst:jest.fn().mockResolvedValue({newValue:JSON.stringify({sourcePackageId:'package'})})},consolidatedBOQItem:{findUnique:jest.fn().mockResolvedValue({id:'cement',projectId,description:'Cement',deliveredQty:100,consumedQty:0}),update:jest.fn()}};
 (prisma.$transaction as jest.Mock).mockImplementation(callback=>callback(tx));const res={status:jest.fn(),json:jest.fn()};res.status.mockReturnValue(res);return{tx,res};
}
describe('native issuance respects WPS project stock and reservations',()=>{
 beforeEach(()=>{jest.clearAllMocks();jest.spyOn(console,'error').mockImplementation(()=>{});});afterEach(()=>jest.restoreAllMocks());
 it('refuses a foreign project material before consuming stock or reservations',async()=>{const f=fixture('another-project');await approve({params:{id:'issue'},body:{accountantId:'accountant'}},f.res);expect(f.res.status).toHaveBeenCalledWith(500);expect(consumeMaterialReservations).not.toHaveBeenCalled();expect(f.tx.consolidatedBOQItem.update).not.toHaveBeenCalled();});
 it('consumes package reservation inside the same release transaction before releasing native stock',async()=>{const f=fixture();await approve({params:{id:'issue'},body:{accountantId:'accountant'}},f.res);expect(consumeMaterialReservations).toHaveBeenCalledWith(f.tx,{projectId:'project',materialId:'cement',quantity:10,projectStock:100,sourcePackageId:'package'});expect(f.tx.materialIssuance.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'RELEASED'})}));expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'Serializable'});});
});
