import { verifySession } from '@/lib/dal/auth';
import styles from './page.module.css';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { cookies } from 'next/headers';
import PermissionGuard from '@/components/PermissionGuard';
import { getUserPermissions } from '@/lib/permissions';
import NewProjectButton from './NewProjectButton';
import ManagerAssigner from './ManagerAssigner';
import DeleteProjectButton from './DeleteProjectButton';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const cookieStore = await cookies();
  const __session = await verifySession();
  const userId = __session?.id || '';
  const permissions = await getUserPermissions(userId);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const simulatedRole = cookieStore.get('simulatedRole')?.value;
  const effectiveRole = (simulatedRole && user && (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.role === 'PROJECT_DIRECTOR' || user.role === 'DIRECTORS'))
    ? simulatedRole
    : (user?.role || 'GUEST_USER');
  const isSuperAdmin = effectiveRole === 'SUPER_ADMIN' || effectiveRole === 'SYSTEM_ADMIN';

  console.log('--- PROJECTS PAGE DEBUG ---');
  console.log('userId:', userId);
  console.log('user.role:', user?.role);
  console.log('simulatedRole:', simulatedRole);
  console.log('effectiveRole:', effectiveRole);
  console.log('isSuperAdmin:', isSuperAdmin);


  const projects = await prisma.project.findMany({
    where: isSuperAdmin ? {} : {
      userAssignments: {
        some: {
          userId: userId,
          assignmentStatus: 'active'
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    include: { 
      manager: true,
      consolidatedBoqItems: { select: { totalCost: true } }
    }
  });

  const canAssignManager = permissions?.PROJECT_MANAGEMENT?.canUpdate || false;
  let users: { id: string; name: string; role: string }[] = [];
  if (canAssignManager || permissions?.PROJECT_MANAGEMENT?.canCreate) {
    users = (await prisma.user.findMany({
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' }
    })).map(user => ({ ...user, name: user.name ?? user.id }));
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Projects</h1>
          <p>Manage and monitor all active construction projects.</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <Link
            href="/boq"
            style={{ 
              padding: '10px 18px', 
              borderRadius: '8px', 
              background: 'rgba(0, 240, 255, 0.1)', 
              color: 'var(--accent-color)', 
              textDecoration: 'none', 
              fontWeight: 'bold',
              fontSize: '0.9rem', 
              border: '1px solid rgba(0, 240, 255, 0.3)',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap'
            }}
          >
            BOQ Workspace
          </Link>
          <PermissionGuard permissions={permissions} moduleName="PROJECT_MANAGEMENT" action="canCreate">
            <Link href="/boq?mode=new" style={{padding: '10px 18px', borderRadius: 8, background: 'var(--accent-color)', color: 'var(--bg-primary)', fontWeight: 700}}>New project from BOQ</Link>
            <details><summary>Other project formats</summary><NewProjectButton users={users} /></details>
          </PermissionGuard>
        </div>
      </header>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Project Name</th>
              <th>Status</th>
              <th>Contract Amounts</th>
              <th>Timeline</th>
              <th>Manager</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.emptyState}>No projects found.</td>
              </tr>
            ) : projects.map(project => {
              const formatDate = (d: Date | string | null) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBA';
              const consolidatedCost = project.consolidatedBoqItems?.reduce((sum, i) => sum + (i.totalCost || 0), 0) || 0;
              return (
              <tr key={project.id}>
                <td>
                  <div className={styles.projectName}>{project.name}</div>
                  <div className={styles.projectLocation}>{project.location || 'No location specified'}</div>
                </td>
                <td>
                  <span className={`${styles.badge} ${styles['status-' + project.status.toLowerCase()] || styles.badgeDefault}`}>
                    {project.status}
                  </span>
                </td>
                <td className={styles.amount}>
                  <div><strong>Awarded:</strong> ₱ {project.contractAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '4px' }}><strong>Materials:</strong> ₱ {consolidatedCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </td>
                <td style={{ fontSize: '0.85rem', color: '#4b5563', whiteSpace: 'nowrap' }}>
                  <div><strong>Start:</strong> {formatDate(project.startDate)}</div>
                  <div style={{ marginTop: '4px' }}><strong>Target:</strong> {formatDate(project.revisedCompletionDate || project.originalCompletionDate)}</div>
                </td>
                <td>
                  <ManagerAssigner 
                    projectId={project.id} 
                    currentManager={project.manager} 
                    users={users} 
                    canEdit={canAssignManager} 
                  />
                </td>
                <td>
                  <div className={styles.rowActions}>
                    <Link href={`/projects/${project.id}`} className={styles.actionLink}>View Details</Link>
                    <PermissionGuard permissions={permissions} moduleName="PROJECT_MANAGEMENT" action="canDelete">
                      <DeleteProjectButton projectId={project.id} />
                    </PermissionGuard>
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>
    </div>
  );
}
