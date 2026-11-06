import { verifySession } from '@/lib/dal/auth';
import styles from '../projects/page.module.css';
import { prisma } from '@/lib/prisma';
import MaterialIssuanceClient from './MaterialIssuanceClient';
import { getUserPermissions } from '@/lib/permissions';
import { cookies } from 'next/headers';

export default async function MaterialIssuancePage() {
  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  let permissions: Record<string, any> = {};
  
  if (sessionId) {
    permissions = await getUserPermissions(sessionId);
  }
  const activeProjectId = cookieStore.get('activeProjectId')?.value || undefined;

  const user = await prisma.user.findUnique({ where: { id: sessionId } });
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'SYSTEM_ADMIN';

  const baseFilter: any = {};
  if (!isSuperAdmin) {
    baseFilter.project = {
      userAssignments: {
        some: { userId: sessionId, assignmentStatus: 'active' }
      }
    };
  }

  const issuancesFilter = { ...baseFilter };
  if (activeProjectId) issuancesFilter.projectId = activeProjectId;

  const returnsFilter = { ...baseFilter };
  if (activeProjectId) returnsFilter.projectId = activeProjectId;

  const issuances = await prisma.materialIssuance.findMany({
    where: issuancesFilter,
    include: {
      project: true,
      foreman: true,
      warehouseman: true,
      accountant: true,
      releasedBy: true,
      returns: { include: { items: true } },
      items: {
        include: {
          consolidatedBoqItem: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const projects = await prisma.project.findMany({
    where: activeProjectId ? { id: activeProjectId } : (permissions.IS_ADMIN ? {} : { consolidatedBOQLocked: true }),
    select: { id: true, name: true, location: true }
  });

  const returns = await prisma.materialReturn.findMany({
    where: returnsFilter,
    include: {
      project: true,
      foreman: true,
      warehouseman: true,
      issuance: true,
      items: {
        include: {
          consolidatedBoqItem: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  const users = await prisma.user.findMany({
    select: { id: true, name: true, role: true }
  });

  return (
    <div className={styles.pageContainer}>
      <MaterialIssuanceClient issuances={issuances} projects={projects} users={users} returns={returns} permissions={permissions} />
    </div>
  );
}
