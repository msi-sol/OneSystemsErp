import{confirmedMaterialRequestLines,canInstallMaterial,installationRemaining}from'@/lib/scheduling/work-package-material-quantities';
describe('package material installation evidence',()=>{
 const input={released:'100',returned:'10',installed:'30',proposed:'60',logDate:'2026-11-05',installationDate:'2026-11-05',sameBaseline:true,samePackage:true};
 it('caps installation to net actually released material',()=>{expect(installationRemaining(input)).toBe('60');expect(canInstallMaterial(input)).toBe(true);expect(canInstallMaterial({...input,proposed:'60.0001'})).toBe(false);});
 it('requires a matching baseline, package and calendar-day site log',()=>{expect(canInstallMaterial({...input,sameBaseline:false})).toBe(false);expect(canInstallMaterial({...input,samePackage:false})).toBe(false);expect(canInstallMaterial({...input,installationDate:'2026-11-06'})).toBe(false);});
 it('does not permit zero, negative or nonfinite installation quantities',()=>{for(const proposed of ['0','-1','NaN','Infinity'])expect(canInstallMaterial({...input,proposed})).toBe(false);});
});

describe('exact confirmed shortage purchase headroom',()=>{
 it('does not permit a tiny request above zero shortage',()=>expect(()=>confirmedMaterialRequestLines([{materialId:'cement',quantity:'0.0001'}],[{materialId:'cement',shortage:'0'}])).toThrow('REQUEST_EXCEEDS_CONFIRMED_MATERIAL_SHORTAGE'));
 it('compares repeated material lines as exact decimal totals',()=>{expect(confirmedMaterialRequestLines([{materialId:'cement',quantity:'0.1'},{materialId:'cement',quantity:'0.2'}],[{materialId:'cement',shortage:'0.3'}])).toEqual([{materialId:'cement',quantity:0.3}]);expect(()=>confirmedMaterialRequestLines([{materialId:'cement',quantity:'0.2'},{materialId:'cement',quantity:'0.2'}],[{materialId:'cement',shortage:'0.3'}])).toThrow('REQUEST_EXCEEDS_CONFIRMED_MATERIAL_SHORTAGE');});
 it('refuses unsupported precision and malformed quantity',()=>{for(const quantity of ['0.00001','NaN','Infinity','-1'])expect(()=>confirmedMaterialRequestLines([{materialId:'cement',quantity}],[{materialId:'cement',shortage:'100'}])).toThrow('INVALID_MATERIAL_QUANTITY');});
});
