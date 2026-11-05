import WorkPackagesModulePage from '../page';
export const dynamic='force-dynamic';
export default function LookAheadPage({params}:{params:Promise<{id:string}>}){
  return WorkPackagesModulePage({params,searchParams:Promise.resolve({view:'look-ahead'})});
}
