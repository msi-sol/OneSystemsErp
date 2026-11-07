import { verifySession } from '@/lib/dal/auth';
import styles from '../page.module.css';
import { prisma } from '@/lib/prisma';
import DirectorAuditClient from './DirectorAuditClient';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DirectorAuditPage() {
  const cookieStore = await cookies();
  const __session = await verifySession();
  if (!__session) redirect('/login');
  // Only directors/administrators decide AI overrides (the server actions enforce the same rule).
  if (!['PROJECT_DIRECTOR', 'DIRECTORS', 'SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(__session.role)) redirect('/');
  const sessionId = __session.id;
  const currentUserId = sessionId;

  const pendingOverrides = await prisma.aIValidationOverride.findMany({
    where: {
      approvedBy: null
    },
    include: {
      validationResult: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  const recentLogs = await prisma.aITransactionValidation.findMany({
    take: 20,
    orderBy: {
      createdAt: 'desc'
    }
  });

  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>Director's Audit & Override Dashboard</h1>
        </div>
      </header>
      
      <div style={{ padding: '20px' }}>
        <DirectorAuditClient 
          pendingOverrides={pendingOverrides} 
          recentLogs={recentLogs} 
          currentUserId={currentUserId} 
        />
      </div>
    </div>
  );
}
