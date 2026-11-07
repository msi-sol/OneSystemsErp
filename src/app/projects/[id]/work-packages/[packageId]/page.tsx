import WorkPackagesModulePage from '../page';
export const dynamic = 'force-dynamic';
export default async function PackagePage({params,searchParams}:{params:Promise<{id:string;packageId:string}>;searchParams:Promise<{tab?:string}>}) {
  const {id,packageId}=await params;
  const {tab}=await searchParams;
  return WorkPackagesModulePage({params:Promise.resolve({id}),searchParams:Promise.resolve({view:'package',package:packageId,tab})});
}
