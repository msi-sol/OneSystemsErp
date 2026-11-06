import { verifySession } from '@/lib/dal/auth';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { cookies } from 'next/headers';
import DeleteCanvassButton from './DeleteCanvassButton';
import styles from './canvassing.module.css';

export default async function CanvassingDashboard() {
  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  const simulatedRole = cookieStore.get('simulatedRole')?.value;
  
  let isSuperAdmin = false;
  if (sessionId) {
    const user = await prisma.user.findUnique({ where: { id: sessionId } });
    if (user) {
      const role = simulatedRole || user.role;
      isSuperAdmin = role === 'SUPER_ADMIN';
    }
  }
  let activeProjectId = cookieStore.get('activeProjectId')?.value || null;
  if (activeProjectId) {
    const projExists = await prisma.project.findUnique({ where: { id: activeProjectId } });
    if (!projExists) {
      activeProjectId = null;
    }
  }

  const baseProjectFilter: any = {};
  if (!isSuperAdmin) {
    baseProjectFilter.userAssignments = {
      some: { userId: sessionId, assignmentStatus: 'active' }
    };
  }

  const mrFilter: any = { status: 'APPROVED' };
  if (!isSuperAdmin) mrFilter.project = baseProjectFilter;
  if (activeProjectId) mrFilter.projectId = activeProjectId;

  const canvassFilter: any = {};
  if (!isSuperAdmin || activeProjectId) {
    canvassFilter.mr = { ...(!isSuperAdmin ? { project: baseProjectFilter } : {}) };
    if (activeProjectId) canvassFilter.mr.projectId = activeProjectId;
  }

  const mrfForCanvass = await prisma.materialRequest.findMany({
    where: mrFilter,
    include: { project: true, items: true, canvassForms: true }
  });

  const activeCanvassForms = await prisma.canvassForm.findMany({
    where: canvassFilter,
    orderBy: { createdAt: 'desc' },
    include: {
      mr: true,
      quotations: true
    }
  });

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <Link href="/procurement" className={styles.backLink}>← Back to Procurement</Link>
          <h1 style={{ color: 'var(--accent-color)', margin: '10px 0 0', textShadow: '0 0 10px var(--accent-glow)' }}>
          Canvassing & Supplier Comparison
          </h1>
        </div>
      </div>

      <div className={styles.grid}>
        
        {/* Approved MRFs */}
        <section className={`glass-card ${styles.panel}`}>
          <h3 style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
            📋 Approved Material Requests
          </h3>
          {mrfForCanvass.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No approved MRFs are available for canvassing in this project.</p>
              <Link href="/material-requests">View Material Requests →</Link>
            </div>
          ) : (
            <div className={styles.tableScroller}>
            <table className={styles.table}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '8px' }}>MRF Number</th>
                  <th style={{ padding: '8px' }}>Project</th>
                  <th style={{ padding: '8px' }}>Items</th>
                  <th style={{ padding: '8px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {mrfForCanvass.map((mr: any) => (
                  <tr key={mr.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px 8px', color: '#fff' }}>{mr.mrNumber}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>{mr.project.name}</td>
                    <td style={{ padding: '12px 8px' }}>{mr.items.length}</td>
                    <td style={{ padding: '12px 8px' }}>
                      {mr.canvassForms && mr.canvassForms.length > 0 ? (
                        <Link className={styles.actionLink} href={`/procurement/canvassing/${mr.canvassForms[0].id}`}>
                          Canvass Created · View
                        </Link>
                      ) : (
                        <Link href={`/procurement/canvassing/new?mrId=${mr.id}`}>
                          <button style={{
                            background: 'rgba(0, 240, 255, 0.1)',
                            border: '1px solid var(--accent-color)',
                            color: 'var(--accent-color)',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}>Start Canvass</button>
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </section>

        {/* Active Canvass Forms */}
        <section className={`glass-card ${styles.panel}`}>
          <h3 style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
            🔍 Active Canvass Forms
          </h3>
          {activeCanvassForms.length === 0 ? (
            <p className={styles.emptyState}>No canvass forms have been created yet.</p>
          ) : (
            <div className={styles.tableScroller}>
            <table className={styles.table}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '8px' }}>Canvass No.</th>
                  <th style={{ padding: '8px' }}>MRF No.</th>
                  <th style={{ padding: '8px' }}>Quotations</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {activeCanvassForms.map(cf => (
                  <tr key={cf.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '12px 8px', color: '#fff', fontWeight: 'bold' }}>{cf.canvassNumber}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>{cf.mr?.mrNumber}</td>
                    <td style={{ padding: '12px 8px' }}>{cf.quotations.length}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        backgroundColor: cf.status === 'COMPLETED' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                        color: cf.status === 'COMPLETED' ? '#4ade80' : '#facc15'
                      }}>
                        {cf.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <Link className={styles.actionLink} href={`/procurement/canvassing/${cf.id}`}>
                        View Details
                      </Link>
                      {isSuperAdmin && (
                        <DeleteCanvassButton canvassId={cf.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
