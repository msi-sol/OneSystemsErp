import WorkPackagesModulePage from '../page';
export const dynamic = 'force-dynamic';
export default async function PackagePage({params}:{params:Promise<{id:string;packageId:string}>}) {
  const {id,packageId}=await params;
  return WorkPackagesModulePage({params:Promise.resolve({id}),searchParams:Promise.resolve({view:'package',package:packageId})});
}
