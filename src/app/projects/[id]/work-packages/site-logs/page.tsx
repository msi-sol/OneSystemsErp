import WorkPackagesModulePage from '../page';
export const dynamic='force-dynamic';
export default function SiteLogsPage({params}:{params:Promise<{id:string}>}){
  return WorkPackagesModulePage({params,searchParams:Promise.resolve({view:'site-logs'})});
}
