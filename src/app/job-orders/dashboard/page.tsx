import { verifySession } from '@/lib/dal/auth';
import React from 'react';
import Link from 'next/link';
import styles from '../../page.module.css';
import { getJobOrders } from '@/app/actions/jobOrderActions';
import JobOrderListClient from './JobOrderListClient';

const joModules = [
  { name: 'Dashboard', href: '/job-orders/dashboard', icon: '📊', description: 'Overview and KPIs' },
  { name: 'Create Job Order', href: '/job-orders/create', icon: '⚡', description: 'New short-form JO' },
  { name: 'Progress & Payments Hub', href: '/job-orders/progress-hub', icon: '📈', description: 'Unified Accomplishments, Billings & Payments for JOs' },
  // "Reports" and "Settings" tiles removed: /job-orders/reports and /job-orders/settings have no pages
  // (they matched /job-orders/[id] and showed "Job Order Not Found").
];

import { cookies } from 'next/headers';

export default async function JobOrderDashboard() {
  const cookieStore = await cookies();
  const activeProjectId = cookieStore.get('activeProjectId')?.value || undefined;
  const __session = await verifySession();
  const sessionId = __session?.id || '';

  const { prisma } = await import('@/lib/prisma');
  const user = await prisma.user.findUnique({ where: { id: sessionId } });
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'SYSTEM_ADMIN';

  if (!activeProjectId) {
    return (
      <div className={styles.dashboardContainer} style={{ maxWidth: '1400px', textAlign: 'center', padding: '100px 20px' }}>
        <h2>No Active Project Selected</h2>
        <p>Please select an Active Project from the top navigation bar to view its Job Orders.</p>
      </div>
    );
  }

  const jobOrdersResult: any = await getJobOrders(activeProjectId);
  // On a backend error the action returns { success: false } instead of an array.
  const jobOrders: any[] = Array.isArray(jobOrdersResult) ? jobOrdersResult : [];

  // Basic KPI calculations
  const activeCount = jobOrders.length;
  const totalPayable = jobOrders.reduce((sum: number, jo: { contractAmount?: number | null }) => sum + (jo.contractAmount || 0), 0);

  return (
    <div className={styles.dashboardContainer} style={{ maxWidth: '1400px' }}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>Job Orders Hub</h1>
          <p>Centralized management for short-form subcontracts and limited work packages.</p>
        </div>
      </header>

      {/* KPI Stats Section */}
      <div className={styles.statsGrid} style={{ marginBottom: '40px' }}>
        <div className={styles.statCard}>
          <h3>Active Job Orders</h3>
          <div className={styles.statValue}>{activeCount}</div>
        </div>
        <div className={styles.statCard}>
          <h3>Pending Approvals</h3>
          <div className={styles.statValue}>{jobOrders.filter((jo: any) => typeof jo.status === 'string' && jo.status.startsWith('FOR_')).length}</div>
        </div>
        <div className={styles.statCard}>
          <h3>Total Billed Amount</h3>
          <div className={styles.statValue}>₱{jobOrders.reduce((sum: number, jo: any) => sum + (jo.totalBilledAmount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div className={styles.statCard}>
          <h3>Total Payable</h3>
          <div className={styles.statValue}>₱{totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      </div>

      {/* Modules Grid */}
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '20px', color: 'var(--text-primary)' }}>
        Job Order Modules
      </h2>
      <style>{`
        .module-card {
          background-color: var(--bg-secondary, #ffffff);
          border-radius: 12px;
          padding: 20px;
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 10px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.05);
          border: 1px solid var(--glass-border, #e5e7eb);
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          cursor: pointer;
        }
        .module-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 10px 15px rgba(0,0,0,0.1);
          border-color: var(--accent-color, #f59e0b);
        }
      `}</style>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
        gap: '20px' 
      }}>
        {joModules.map((module) => (
          <Link 
            key={module.name} 
            href={module.href}
            style={{ textDecoration: 'none' }}
          >
            <div className="module-card">
              <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>
                {module.icon}
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary, #111827)', margin: 0 }}>
                {module.name}
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #6b7280)', margin: 0, lineHeight: 1.4 }}>
                {module.description}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <JobOrderListClient jobOrders={jobOrders} />
    </div>
  );
}
