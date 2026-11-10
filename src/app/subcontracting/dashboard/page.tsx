import { verifySession } from '@/lib/dal/auth';
import React from 'react';
import Link from 'next/link';
import styles from '../../page.module.css';
import DashboardClient from './DashboardClient';
import SubcontractListClient from './SubcontractListClient';
import { getSubcontractPackages } from '@/app/actions/subcontractingActions';
import { getJobOrders } from '@/app/actions/jobOrderActions';
import { getAllSubcontractorVariationOrders } from '@/app/actions/variationOrderActions';
import { billedAmount } from '@/lib/subcontracting/billed-amount';
import type { SubcontractBillingLike } from '@/lib/finance/payables';

const subModules = [
  { name: 'Dashboard', href: '/subcontracting/dashboard', icon: '📊', description: 'Overview and KPIs' },
  { name: 'Subcontractors & Accreditation', href: '/subcontracting/subcontractors', icon: '🏢', description: 'Manage and accredit subcontractors' },
  { name: 'Create Subcontract Hub', href: '/subcontracting/create', icon: '📝', description: 'Unified wizard for Package, POW & BOQ' },
  { name: 'Progress & Payments Hub', href: '/subcontracting/progress-hub', icon: '📈', description: 'Unified Accomplishments, Billings & Payments' },
  { name: 'Variations', href: '/subcontracting/variations', icon: '🔄', description: 'Variation orders' },
];

const joModules = [
  { name: 'Job Orders Dashboard', href: '/job-orders/dashboard', icon: '📊', description: 'Master list and KPIs' },
  { name: 'Create Job Order', href: '/job-orders/create', icon: '⚡', description: 'New short-form JO' },
  { name: 'Progress & Payments Hub', href: '/job-orders/progress-hub', icon: '📈', description: 'Unified Accomplishments, Billings & Payments for JOs' },
];

import { cookies } from 'next/headers';
import { getUserPermissions } from '@/lib/permissions';

export default async function SubcontractingDashboard() {
  const cookieStore = await cookies();
  const activeProjectId = cookieStore.get('activeProjectId')?.value || undefined;
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  const permissions = await getUserPermissions(sessionId);

  if (!activeProjectId && !permissions.IS_ADMIN) {
    return (
      <div className={styles.dashboardContainer} style={{ maxWidth: '1400px', textAlign: 'center', padding: '100px 20px' }}>
        <h2>No Active Project Selected</h2>
        <p>Please select an Active Project from the top navigation bar to view the Subcontracting Hub.</p>
      </div>
    );
  }

  let packages = await getSubcontractPackages(activeProjectId);
  let jobOrders = await getJobOrders(activeProjectId);
  let variationOrders = await getAllSubcontractorVariationOrders(activeProjectId);
  // Drafts and closed packages are not active (same statuses as the project's Subcontracting tab).
  const ACTIVE_PACKAGE_STATUSES = ['APPROVED', 'AGREEMENT_ISSUED', 'JOB_ORDER_ISSUED', 'ONGOING', 'FOR_INSPECTION', 'PARTIALLY_ACCOMPLISHED'];
  const activePackages = (packages ?? []).filter((p: any) => ACTIVE_PACKAGE_STATUSES.includes(p.status));
  const draftPackages = (packages ?? []).filter((p: any) => p.status === 'DRAFT').length;
  type BillingRow = SubcontractBillingLike & { packageId?: string | null };
  type WithBillings = { billings?: BillingRow[]; subcontractBillings?: BillingRow[] };
  // Approved subcontract billings, plus job-order billings not already counted under a package.
  const subcontractBilled = ((packages ?? []) as WithBillings[]).reduce((sum, p) => sum + billedAmount(p.billings), 0)
    + ((jobOrders ?? []) as WithBillings[]).reduce((sum, jo) => sum + billedAmount((jo.subcontractBillings ?? []).filter(b => !b.packageId)), 0);

  return (
    <div className={styles.dashboardContainer} style={{ maxWidth: '1400px' }}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>Subcontracting & Job Order Hub</h1>
          <p>Centralized management for all subcontracting workflows, job orders, and AI validation.</p>
        </div>
      </header>

      {/* KPI Stats Section */}
      <div className={styles.statsGrid} style={{ marginBottom: '40px' }}>
        <div className={styles.statCard}>
          <h3>Active Subcontracts</h3>
          <div className={styles.statValue}>{activePackages.length}</div>
          {draftPackages > 0 && <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{draftPackages} draft{draftPackages === 1 ? '' : 's'} not yet approved</p>}
        </div>
        <div className={styles.statCard}>
          <h3>Active Job Orders</h3>
          <div className={styles.statValue}>{jobOrders?.length ?? 0}</div>
        </div>
        <div className={styles.statCard}>
          <h3>Total Billed Amount</h3>
          <div className={styles.statValue}>₱{subcontractBilled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div className={styles.statCard}>
          <h3>Total Payable</h3>
          <div className={styles.statValue}>₱{(packages?.reduce((sum: number, p: any) => sum + (Number(p.totalPayable) || 0), 0) ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div className={styles.statCard}>
          <h3>AI Flags</h3>
          <div className={styles.statValue} style={{ color: '#ef4444' }}>0</div>
        </div>
      </div>

      {/* Modules Grid & Master List */}
      <DashboardClient subModules={subModules} joModules={joModules} packages={packages} jobOrders={jobOrders} variationOrders={variationOrders} />
    </div>
  );
}
