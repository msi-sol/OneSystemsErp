import styles from '../page.module.css';
import { prisma } from '@/lib/prisma';
import SystemAuditClient from './SystemAuditClient';
import { redirect } from 'next/navigation';
import { getAuditViewer } from '@/lib/audit-access';

export default async function SystemAuditPage() {
  if (!(await getAuditViewer())) redirect('/');

  const auditLogs = await prisma.auditLog.findMany({
    take: 200,
    orderBy: {
      createdAt: 'desc'
    },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          role: true
        }
      }
    }
  });

  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>System-Wide Audit Ledger</h1>
        </div>
      </header>
      
      <div style={{ padding: '20px' }}>
        <SystemAuditClient initialLogs={auditLogs} />
      </div>
    </div>
  );
}
