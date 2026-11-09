import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import WorkerDeleteButton from './WorkerDeleteButton';
import ExportWorkersButton from './ExportWorkersButton';
import PermissionGuard from '@/components/PermissionGuard';
import { getUserPermissions } from '@/lib/permissions';
import { verifySession } from '@/lib/dal/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function WorkersDirectoryPage() {
  // Use the signed-in user's permissions (previously the first user in the DB, usually the admin).
  const session = await verifySession();
  if (!session) redirect('/login');
  const permissions = await getUserPermissions(session.id);

  const workers = await prisma.worker.findMany({
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem' }}>Worker Directory</h1>
          <p style={{ margin: '5px 0 0 0', color: 'var(--text-secondary)' }}>Manage all regular employees, daily workers, and consultants.</p>
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <PermissionGuard permissions={permissions} moduleName="WORKER_DATABASE" action="canExport">
            <ExportWorkersButton workers={workers} />
          </PermissionGuard>
          
          <PermissionGuard permissions={permissions} moduleName="WORKER_DATABASE" action="canCreate">
            <Link href="/workers/new" style={{
              background: 'var(--accent-color)', 
              color: '#000', 
              padding: '10px 20px', 
              borderRadius: '8px', 
              textDecoration: 'none', 
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add New Worker
            </Link>
          </PermissionGuard>
        </div>
      </div>

      <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--glass-border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--glass-border)' }}>
            <tr>
              <th style={{ padding: '15px' }}>Worker ID</th>
              <th style={{ padding: '15px' }}>Name</th>
              <th style={{ padding: '15px' }}>Type</th>
              <th style={{ padding: '15px' }}>Designation</th>
              <th style={{ padding: '15px' }}>Status</th>
              <th style={{ padding: '15px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {workers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No workers found. Click "+ Add New Worker" to register.
                </td>
              </tr>
            ) : workers.map(worker => (
              <tr key={worker.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '15px' }}>{worker.workerId || '-'}</td>
                <td style={{ padding: '15px', fontWeight: 'bold' }}>{worker.lastName}, {worker.firstName} {worker.middleName || ''}</td>
                <td style={{ padding: '15px' }}>
                  <span style={{ 
                    background: 'rgba(52, 152, 219, 0.2)', 
                    color: '#3498db', 
                    padding: '4px 8px', 
                    borderRadius: '4px', 
                    fontSize: '0.8rem' 
                  }}>
                    {worker.employmentType.replace(/_/g, ' ')}
                  </span>
                </td>
                <td style={{ padding: '15px' }}>{worker.designation || worker.workerCategory || 'N/A'}</td>
                <td style={{ padding: '15px' }}>
                  <span style={{ 
                    background: worker.employmentStatus === 'ACTIVE' ? 'rgba(46, 204, 113, 0.2)' : 'rgba(231, 76, 60, 0.2)', 
                    color: worker.employmentStatus === 'ACTIVE' ? '#2ecc71' : '#e74c3c', 
                    padding: '4px 8px', 
                    borderRadius: '4px', 
                    fontSize: '0.8rem' 
                  }}>
                    {worker.employmentStatus}
                  </span>
                </td>
                <td style={{ padding: '15px' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <Link href={`/workers/${worker.id}`} style={{ color: 'var(--accent-color)', textDecoration: 'none', padding: '5px 10px', background: 'rgba(241, 196, 15, 0.1)', borderRadius: '6px', border: '1px solid rgba(241, 196, 15, 0.3)' }}>
                      View
                    </Link>
                    
                    <PermissionGuard permissions={permissions} moduleName="WORKER_DATABASE" action="canEditDraft">
                      <Link href={`/workers/${worker.id}/edit`} style={{ color: '#3498db', textDecoration: 'none', padding: '5px 10px', background: 'rgba(52, 152, 219, 0.1)', borderRadius: '6px', border: '1px solid rgba(52, 152, 219, 0.3)' }}>
                        Edit
                      </Link>
                    </PermissionGuard>

                    <PermissionGuard permissions={permissions} moduleName="WORKER_DATABASE" action="canDeleteDraft">
                      <WorkerDeleteButton workerId={worker.id} />
                    </PermissionGuard>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
