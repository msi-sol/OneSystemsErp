import { verifySession } from '@/lib/dal/auth';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { logout } from '@/app/actions/auth';
import ActiveProjectSelector from './ActiveProjectSelector';

import PageTitle from './PageTitle';
import styles from './topbar.module.css';

export default async function Topbar() {
  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  const activeProjectId = cookieStore.get('activeProjectId')?.value || null;
  const simulatedRole = cookieStore.get('simulatedRole')?.value || null;
  
  let user: any = null;
  let assignments: any[] = [];
  
  if (sessionId) {
    user = await prisma.user.findUnique({ where: { id: sessionId } });
    if (user) {
      if (['SUPER_ADMIN', 'SYSTEM_ADMIN', 'EXECUTIVE'].includes(user.role)) {
        const allProjects = await prisma.project.findMany({
          orderBy: { name: 'asc' },
          select: { id: true, name: true, contractAmount: true, originalContractDuration: true }
        });
        assignments = allProjects.map(p => ({
          projectId: p.id,
          project: p,
          projectRole: user.role,
          accessLevel: 'FULL'
        }));
      } else {
        assignments = await prisma.projectUserAssignment.findMany({
          where: { userId: user.id, assignmentStatus: 'active' },
          include: { project: { select: { name: true, contractAmount: true, originalContractDuration: true } } },
          orderBy: { project: { name: 'asc' } }
        });
      }
      // Duration fallback for the header: when no contract duration was recorded, show the approved work-package
      // plan's span (first planned start to last planned finish, inclusive) instead of "Not set".
      const projectIds = assignments.map(row => row.projectId as string).filter(Boolean);
      if (projectIds.length) {
        const baselines = await prisma.projectSchedule.findMany({ where: { projectId: { in: projectIds }, workflowStatus: 'ACTIVE_BASELINE' }, select: { id: true, projectId: true } });
        const spans = baselines.length ? await prisma.scheduleActivity.groupBy({ by: ['scheduleId'], where: { scheduleId: { in: baselines.map(row => row.id) } }, _min: { plannedStartDate: true }, _max: { plannedFinishDate: true } }) : [];
        const planned = new Map<string, { days: number; start: string; finish: string }>();
        for (const span of spans) {
          const projectId = baselines.find(row => row.id === span.scheduleId)?.projectId;
          const start = span._min.plannedStartDate, finish = span._max.plannedFinishDate;
          if (!projectId || !start || !finish || finish < start) continue;
          planned.set(projectId, { days: Math.round((finish.getTime() - start.getTime()) / 86_400_000) + 1, start: start.toISOString().slice(0, 10), finish: finish.toISOString().slice(0, 10) });
        }
        assignments = assignments.map(row => ({ ...row, project: { ...row.project, plannedSpan: planned.get(row.projectId) ?? null } }));
      }
    }
  }

  return (
    <header className={styles.topbar}>
      <PageTitle />
      <div className={styles.actions}>
        
        {user && (
          <div className={styles.userControls}>
            
            <ActiveProjectSelector 
              assignments={assignments} 
              activeProjectId={activeProjectId} 
            />

            <div className={styles.identity}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{user.name}</div>
                <div style={{ fontSize: '0.75rem', color: simulatedRole ? '#ff4d4d' : 'var(--accent-color)', fontWeight: simulatedRole ? 'bold' : 'normal' }}>
                  {simulatedRole ? `SIMULATING: ${simulatedRole.replace(/_/g, ' ')}` : user.role.replace(/_/g, ' ')}
                </div>
              </div>
              
              <form action={logout}>
                <button 
                  type="submit"
                  className="allow-guest"
                  style={{
                    background: 'none', border: '1px solid var(--glass-border)', padding: '6px 12px',
                    borderRadius: '6px', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem',
                    fontWeight: 'bold', transition: 'all 0.2s'
                  }}
                >
                  Sign Off
                </button>
              </form>
            </div>
          </div>
        )}

      </div>
    </header>
  );
}
