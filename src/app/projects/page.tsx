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
import { groupProjectsByAction } from '@/lib/projects/project-action-groups';

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

  const projectIds = projects.map(project => project.id);
  const [boqVersions, schedules] = await Promise.all([
    projectIds.length ? prisma.projectBOQVersion.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, projectId: true, status: true, checksum: true, sourceProvenance: true },
    }) : Promise.resolve([]),
    projectIds.length ? prisma.projectSchedule.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        projectId: true, name: true, workflowStatus: true, lockedBOQVersionId: true, lockedBOQChecksum: true,
        baselineCode: true, revisionCode: true, _count: { select: { activities: true } },
        baselineActivations: {
          where: { isAuthoritative: true, invalidatedAt: null },
          orderBy: { activatedAt: 'desc' }, take: 2, select: { lockedBOQChecksum: true },
        },
      },
    }) : Promise.resolve([]),
  ]);

  const latestBoqByProject = new Map<string, (typeof boqVersions)[number]>();
  for (const version of boqVersions) if (!latestBoqByProject.has(version.projectId)) latestBoqByProject.set(version.projectId, version);
  const latestScheduleByProject = new Map<string, (typeof schedules)[number]>();
  for (const schedule of schedules) if (!latestScheduleByProject.has(schedule.projectId)) latestScheduleByProject.set(schedule.projectId, schedule);
  const projectActionGroups = groupProjectsByAction(projects.map(project => {
    const version = latestBoqByProject.get(project.id);
    const schedule = latestScheduleByProject.get(project.id);
    return {
      id: project.id,
      status: project.status,
      boqLocked: project.boqLocked,
      latestBoqVersion: version ? { id: version.id, status: version.status, checksum: version.checksum, sourceProvenance: version.sourceProvenance } : null,
      latestSchedule: schedule ? {
        workflowStatus: schedule.workflowStatus,
        lockedBOQVersionId: schedule.lockedBOQVersionId,
        lockedBOQChecksum: schedule.lockedBOQChecksum,
        authoritativeActivationChecksums: schedule.baselineActivations.map(activation => activation.lockedBOQChecksum ?? ''),
      } : null,
      record: project,
      scheduleRecord: schedule ?? null,
    };
  }));

  const canAssignManager = permissions?.PROJECT_MANAGEMENT?.canUpdate || false;
  let users: { id: string; name: string; role: string }[] = [];
  if (canAssignManager || permissions?.PROJECT_MANAGEMENT?.canCreate) {
    users = (await prisma.user.findMany({
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' }
    })).map(user => ({ ...user, name: user.name ?? user.id }));
  }

  return (
    <div className={`${styles.container} ${styles.projectList}`}>
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

      <section className={styles.actionBoard} aria-labelledby="project-action-heading">
        <div className={styles.actionIntro}>
          <div>
            <h2 id="project-action-heading">Project actions</h2>
            <p>Open each project at the BOQ or WPS stage recorded for it.</p>
          </div>
          <span className={styles.actionCount}>{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span>
        </div>

        {projects.length === 0 ? <p className={styles.actionEmpty}>No projects found.</p> : <div className={styles.actionGroups}>
          {([
            ['boq', 'Needs BOQ decision', 'No approved and locked BOQ baseline is recorded. Review the BOQ module for the current version and its status.'],
            ['wps', 'Needs WPS decision', 'An approved BOQ is recorded, but the latest schedule has no verified active baseline. Review its actual workflow status in WPS.'],
            ['other', 'Everything else', 'Projects with a verified active WPS baseline or archived projects.'],
          ] as const).map(([group, title, description]) => {
            const entries = projectActionGroups[group];
            if (!entries.length) return null;
            return <section className={styles.actionGroup} key={group} aria-labelledby={`project-group-${group}`}>
              <header className={styles.actionGroupHeader}>
                <div><h3 id={`project-group-${group}`}>{title}</h3><p>{description}</p></div>
                <span className={styles.actionCount}>{entries.length}</span>
              </header>
              <ul className={styles.actionList}>
                {entries.map(entry => {
                  const project = entry.project.record;
                  const schedule = entry.project.scheduleRecord;
                  return <li className={styles.actionCard} key={project.id}>
                    <div className={styles.actionCardTop}>
                      <div className={styles.actionProjectText}>
                        <h4>{project.name}</h4>
                        <p>{project.location || 'No location specified'}</p>
                      </div>
                      <span className={`${styles.badge} ${styles['status-' + project.status.toLowerCase()] || styles.badgeDefault}`}>{project.status.replaceAll('_', ' ')}</span>
                    </div>
                    <dl className={styles.actionFacts}>
                      <div><dt>BOQ status</dt><dd>{entry.boqLabel}</dd></div>
                      <div><dt>WPS status</dt><dd>{entry.wpsLabel}{schedule ? ` · ${schedule._count.activities} ${schedule._count.activities === 1 ? 'package' : 'packages'}` : ''}</dd></div>
                    </dl>
                    {schedule && <p className={styles.scheduleName}>{schedule.name}{schedule.baselineCode ? ` · ${schedule.baselineCode}` : schedule.revisionCode ? ` · ${schedule.revisionCode}` : ''}</p>}
                    <div className={styles.actionCardLinks}>
                      <Link className={styles.primaryProjectAction} href={entry.nextHref}>{entry.nextLabel}</Link>
                      <nav aria-label={`Project modules for ${project.name}`} className={styles.moduleLinks}>
                        <Link href={`/projects/${project.id}/boq`}>BOQ module</Link>
                        <Link href={entry.wpsHref}>WPS module</Link>
                      </nav>
                    </div>
                  </li>;
                })}
              </ul>
            </section>;
          })}
        </div>}
      </section>

      <details className={styles.registerDetails}>
        <summary>Full project register · {projects.length}</summary>
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
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}><strong>Materials:</strong> ₱ {consolidatedCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </td>
                <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
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
      </details>
    </div>
  );
}
