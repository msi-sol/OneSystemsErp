import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';

type Context = { params: Promise<{id:string}> };
const capacities = ['PLANNER','PROJECT_ENGINEER','PROJECT_MANAGER'];

export async function GET(_request:Request,{params}:Context){
  const {id:projectId}=await params;
  const actor=await getSessionActor().catch(()=>null);
  if(!actor)return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
  const access=await planningCapacity(actor,projectId);
  if(!access.canView)return NextResponse.json({error:'PROJECT_ACCESS_DENIED'},{status:403});
  const [grants,members]=await Promise.all([
    prisma.workPackageCapacityGrant.findMany({where:{projectId,revokedAt:null},select:{id:true,userId:true,capacity:true,createdAt:true}}),
    prisma.projectUserAssignment.findMany({where:{projectId,assignmentStatus:'active'},select:{projectRole:true,user:{select:{id:true,name:true}}}}),
  ]);
  return NextResponse.json({grants,members,held:access.capacities,canManage:access.canManageCapacities});
}

export async function POST(request:Request,{params}:Context){
  try{
    const {id:projectId}=await params;
    const actor=await getSessionActor().catch(()=>null);
    if(!actor)return NextResponse.json({error:'UNAUTHORIZED'},{status:401});
    const access=await planningCapacity(actor,projectId);
    if(!access.canManageCapacities)return NextResponse.json({error:'CAPACITY_MANAGEMENT_PERMISSION_REQUIRED'},{status:403});
    const body=await request.json();
    if(!capacities.includes(body.capacity)||typeof body.userId!=='string'||!['grant','revoke'].includes(body.action))return NextResponse.json({error:'INVALID_CAPACITY_REQUEST'},{status:400});
    const member=await prisma.projectUserAssignment.findUnique({where:{userId_projectId:{userId:body.userId,projectId}},select:{assignmentStatus:true}});
    if(member?.assignmentStatus!=='active')return NextResponse.json({error:'ACTIVE_PROJECT_MEMBERSHIP_REQUIRED'},{status:400});
    await prisma.$transaction(async tx=>{
      const key={projectId,userId:body.userId,capacity:body.capacity};
      const existing=await tx.workPackageCapacityGrant.findUnique({where:{projectId_userId_capacity:key}});
      if(body.action==='revoke'&&(!existing||existing.revokedAt))throw Error('CAPACITY_NOT_GRANTED');
      const grant=await tx.workPackageCapacityGrant.upsert({where:{projectId_userId_capacity:key},create:{...key,grantedBy:actor.id},update:{revokedAt:body.action==='revoke'?new Date():null,grantedBy:actor.id}});
      await tx.auditLog.create({data:{userId:actor.id,userRole:actor.role,moduleName:'PROJECT_SCHEDULING',transactionId:grant.id,actionType:body.action==='grant'?'WPS_CAPACITY_GRANTED':'WPS_CAPACITY_REVOKED',oldValue:JSON.stringify(existing),newValue:JSON.stringify({...key,action:body.action})}});
    });
    return NextResponse.json({success:true});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'CAPACITY_REQUEST_FAILED'},{status:400});}
}
