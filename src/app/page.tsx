import { verifySession } from '@/lib/dal/auth';
// @ts-nocheck
import styles from './page.module.css';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

import { getDashboardStats } from '@/app/actions/project';
import RoleDashboardClient from './RoleDashboardClient';
import { redirect } from 'next/navigation';

export default async function Home() {
  const stats = await getDashboardStats();

  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  
  let currentUser = null;
  if (sessionId) {
    currentUser = await prisma.user.findUnique({
      where: { id: sessionId },
      include: { userRoles: { include: { role: true } } }
    });
  } 
  
  

  let isSystemAdmin = false;
  let primaryRole = 'PROJECT_DIRECTOR';

  if (currentUser) {
    primaryRole = currentUser.role || 'PROJECT_DIRECTOR';
    isSystemAdmin = primaryRole === 'SUPER_ADMIN' || primaryRole === 'SYSTEM_ADMIN' || (currentUser.userRoles && currentUser.userRoles.some((ur: any) => ur.role.roleCode === 'SUPER_ADMIN' || ur.role.roleCode === 'SYSTEM_ADMIN'));
  }

  // Respect simulated role
  const simulatedRole = cookieStore.get('simulatedRole')?.value;
  // Same simulation rule as getUserPermissions (lib/permissions.ts), so the dashboard matches the sidebar and permissions.
  const effectiveRole = (simulatedRole && (primaryRole === 'SUPER_ADMIN' || primaryRole === 'SYSTEM_ADMIN' || primaryRole === 'ADMIN' || primaryRole === 'PROJECT_DIRECTOR' || primaryRole === 'DIRECTORS'))
    ? simulatedRole
    : primaryRole;
  // The dashboard's role list has no SYSTEM_ADMIN entry; it shares the System Admin view.
  const dashboardRole = effectiveRole === 'SYSTEM_ADMIN' ? 'SUPER_ADMIN' : effectiveRole;

  if (primaryRole === 'DIRECTORS' && !simulatedRole) {
    redirect('/executive/home');
  }


  return (
    <RoleDashboardClient stats={stats} isSystemAdmin={isSystemAdmin} initialRole={dashboardRole} />
  );
}
