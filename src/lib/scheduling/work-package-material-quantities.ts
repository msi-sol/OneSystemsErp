import Decimal from'decimal.js';
/** Purchase headroom is exact: zero shortage never authorizes a tiny purchase. */
export function confirmedMaterialRequestLines(items:unknown,requirements:{materialId:string;shortage:string}[]){
 if(!Array.isArray(items)||!items.length||items.length>200)throw Error('SELECT_MATERIAL_REQUIREMENTS');
 const totals=new Map<string,Decimal>();
 for(const row of items){if(!row||typeof row!=='object'||typeof row.materialId!=='string')throw Error('INVALID_MATERIAL_QUANTITY');let qty:Decimal;try{qty=new Decimal(String(row.quantity));}catch{throw Error('INVALID_MATERIAL_QUANTITY');}if(!qty.isFinite()||qty.lte(0)||qty.gt(1_000_000_000)||qty.decimalPlaces()>4)throw Error('INVALID_MATERIAL_QUANTITY');totals.set(row.materialId,(totals.get(row.materialId)||new Decimal(0)).plus(qty));}
 return [...totals].map(([materialId,quantity])=>{const requirement=requirements.find(row=>row.materialId===materialId);if(!requirement||quantity.gt(requirement.shortage))throw Error('REQUEST_EXCEEDS_CONFIRMED_MATERIAL_SHORTAGE');return{materialId,quantity:quantity.toNumber()};});
}
/** Issued physical material cannot be both returned and confirmed installed. */
export function installationRemaining(input:{released:string|number;returned:string|number;installed:string|number}){
 return Decimal.max(0,new Decimal(input.released).minus(input.returned).minus(input.installed)).toString();
}
export function canInstallMaterial(input:{released:string|number;returned:string|number;installed:string|number;proposed:string|number;logDate:string;installationDate:string;sameBaseline:boolean;samePackage:boolean}){
 let proposed:Decimal;try{proposed=new Decimal(input.proposed);}catch{return false;}
 return proposed.isFinite()&&proposed.gt(0)&&input.sameBaseline&&input.samePackage&&input.logDate===input.installationDate&&proposed.lte(installationRemaining(input));
}
