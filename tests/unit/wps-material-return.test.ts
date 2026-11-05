jest.mock('../../apps/aws-backend/src/lib/prisma',()=>({prisma:{$transaction:jest.fn()}}));
import{prisma}from'../../apps/aws-backend/src/lib/prisma';
import{processWpsMaterialReturn}from'../../apps/aws-backend/src/lib/wps-material-return';
function fixture(quantity:number){
 const record={id:'return',projectId:'project',issuanceId:'issue',status:'PENDING',items:[{issuanceItemId:'item',consolidatedBoqItemId:'material',returnedQty:quantity,condition:'GOOD'}],issuance:{projectId:'project',items:[{id:'item',consolidatedBoqItemId:'material',releasedQty:100}],returns:[{items:[{consolidatedBoqItemId:'material',returnedQty:10}]}]}};
 const tx={materialReturn:{findUnique:jest.fn().mockResolvedValue(record),updateMany:jest.fn().mockResolvedValue({count:1})},materialIssuance:{update:jest.fn()},consolidatedBOQItem:{updateMany:jest.fn().mockResolvedValue({count:1})},auditLog:{findMany:jest.fn().mockResolvedValue([{newValue:JSON.stringify({materialId:'material',quantity:'70'})}]),create:jest.fn()}};
 (prisma.$transaction as jest.Mock).mockImplementation(callback=>callback(tx));return tx;
}
describe('WPS installation-aware native material return',()=>{
 it('refuses return of material already installed or previously returned before stock writes',async()=>{const tx=fixture(21);await expect(processWpsMaterialReturn('return','warehouseman')).rejects.toThrow('Return exceeds');expect(tx.consolidatedBOQItem.updateMany).not.toHaveBeenCalled();expect(tx.materialReturn.updateMany).not.toHaveBeenCalled();});
 it('allows only remaining released material and receives it atomically',async()=>{const tx=fixture(20);await processWpsMaterialReturn('return','warehouseman');expect(tx.consolidatedBOQItem.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:{consumedQty:{decrement:20}}}));expect(tx.materialReturn.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{id:'return',status:'PENDING'}}));expect(tx.auditLog.create).toHaveBeenCalledTimes(1);});
});
