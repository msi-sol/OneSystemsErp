import WorkPackagesModulePage from '../page';
export const dynamic = 'force-dynamic';
export default function PlanRevisionPage({params}:{params:Promise<{id:string}>}) {
  return WorkPackagesModulePage({params,searchParams:Promise.resolve({view:'review'})});
}
