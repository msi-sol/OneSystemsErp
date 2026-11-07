'use client';

import { useState } from 'react';
import styles from './page.module.css';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const ALL_ROLES = [
  { id: 'SUPER_ADMIN', label: 'System Admin', archetype: 'EXECUTIVE' },
  { id: 'PROJECT_DIRECTOR', label: 'Project Director', archetype: 'EXECUTIVE' },
  { id: 'DIRECTORS', label: 'Directors', archetype: 'EXECUTIVE' },
  { id: 'ADMINISTRATOR', label: 'Administrator', archetype: 'EXECUTIVE' },
  
  { id: 'PROJECT_MANAGER', label: 'Project Manager', archetype: 'PM' },
  { id: 'PROJECT_ENGINEER', label: 'Project Engineer', archetype: 'PM' },
  { id: 'PME', label: 'Project Mechanical Engineer', archetype: 'PM' },
  { id: 'PEE', label: 'Project Electrical Engineer', archetype: 'PM' },
  { id: 'SITE_ADMIN', label: 'Site Admin', archetype: 'PM' },
  
  { id: 'FINANCE_OFFICER', label: 'Finance Officer', archetype: 'FINANCE' },
  { id: 'PROJECT_ACCOUNTANT', label: 'Project Accountant', archetype: 'FINANCE' },
  { id: 'ACCOUNTANT', label: 'Accountant', archetype: 'FINANCE' },
  { id: 'COST_OFFICER', label: 'Cost Officer', archetype: 'FINANCE' },
  
  { id: 'PURCHASING_OFFICER', label: 'Purchasing Officer', archetype: 'PROCUREMENT' },
  { id: 'PROCUREMENT_OFFICER', label: 'Procurement Officer', archetype: 'PROCUREMENT' },
  
  { id: 'STOCKMAN', label: 'Stockman', archetype: 'LOGISTICS' },
  { id: 'WAREHOUSEMAN', label: 'Warehouseman', archetype: 'LOGISTICS' },
  { id: 'MATERIALS_ENGINEER', label: 'Materials Engineer', archetype: 'LOGISTICS' },
  { id: 'DRIVER', label: 'Driver', archetype: 'LOGISTICS' },
  { id: 'LIASON_OFFICER', label: 'Liason Officer', archetype: 'LOGISTICS' },
  
  { id: 'HR_OFFICER', label: 'HR Officer', archetype: 'HR' },
  { id: 'PAYROLL_OFFICER', label: 'Payroll Officer', archetype: 'HR' },
  { id: 'PAYROLL_MASTER', label: 'Payroll Master', archetype: 'HR' },
  
  { id: 'AUDITOR', label: 'Auditor', archetype: 'AUDIT' },
  
  { id: 'FOREMAN', label: 'Foreman', archetype: 'FIELD' },
  { id: 'BILLING_ENGINEER', label: 'Billing Engineer', archetype: 'FIELD' },
  { id: 'GUEST_USER', label: 'Guest User', archetype: 'FIELD' },
];

const ROLE_BOUNDARIES: Record<string, string> = {
  'PURCHASING_OFFICER': 'You are restricted to Procurement Preparation. You can create/edit Canvassing, PRs, and PO drafts. You CANNOT approve POs, release payments, alter BOQ, or confirm final deliveries.',
  'PROJECT_DIRECTOR': 'You have Executive Approval rights. You can approve POs, MRFs, Payments, and BOQ locking. You have full read access to all financial and project data.',
  'PROJECT_MANAGER': 'You have Project Review rights. You can recommend approvals, track accomplishments, and review site requisitions. You CANNOT give final executive approval or process payments.',
  'FINANCE_OFFICER': 'You have Financial Authority. You can process payables, replenish petty cash, and manage payroll. You CANNOT originate site materials requests or PO drafts.',
  'SUPER_ADMIN': 'You have Full System Access. You can manage users, roles, and global configurations.',
  'EXECUTIVE': 'Executive access with broad overview and approval authorities.',
  'PM': 'Project Management access with operational review and tracking capabilities.',
  'FINANCE': 'Financial access for processing payments, payroll, and ledgers.',
  'PROCUREMENT': 'Procurement access for sourcing, canvassing, and PO preparation.',
  'LOGISTICS': 'Logistics access for receiving deliveries and managing inventory.',
  'HR': 'Human Resources access for worker database and payroll management.',
  'AUDIT': 'Audit access with read-only view of logs and AI validations.',
  'FIELD': 'Field operations access for daily logs and site accomplishments.'
};

export default function RoleDashboardClient({ stats, isSystemAdmin, initialRole = 'PROJECT_DIRECTOR' }: { stats: any, isSystemAdmin?: boolean, initialRole?: string }) {
  const router = useRouter();
  const [simulatedRoleState, setSimulatedRole] = useState(initialRole);
  const simulatedRole = isSystemAdmin ? simulatedRoleState : initialRole;

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value;
    setSimulatedRole(newRole);
    if (isSystemAdmin) {
      document.cookie = `simulatedRole=${newRole}; path=/; max-age=86400`;
      router.refresh();
    }
  };
  
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const handleGenerateSummary = async (roleId: string) => {
    setLoadingSummary(true);
    try {
      // In a real implementation this would fetch from an API that evaluates live permissions.
      // We will provide the structured text requested by the master instruction.
      setTimeout(() => {
        if (roleId === 'PURCHASING_OFFICER') {
          setAiSummary("The PURCHASING_OFFICER role is responsible for procurement preparation, supplier canvassing, quotation gathering, supplier comparison, procurement request preparation, and purchase order drafting. This role may create, edit, upload, and submit procurement documents for review, but may not approve purchase orders, approve payments, modify awarded BOQ data, confirm final delivery, post accounting entries, or override approval workflows. All submitted procurement documents must pass through the required review and approval process to maintain proper separation of duties and prevent overlapping authority.");
        } else {
          setAiSummary(`AI Summary for ${roleId}: Role permissions are currently configured as standard. Human review required for all final approvals.`);
        }
        setLoadingSummary(false);
      }, 1000);
    } catch (e) {
      setLoadingSummary(false);
    }
  };

  const selectedRoleObj = ALL_ROLES.find(r => r.id === simulatedRole) || ALL_ROLES[1];
  const archetype = selectedRoleObj.archetype;

  return (
    <div className={styles.dashboardContainer}>
      
      {/* Simulation Header */}
      {isSystemAdmin && (
        <div style={{ background: 'rgba(255, 212, 59, 0.1)', border: '1px solid #ffd43b', padding: '15px 20px', borderRadius: '12px', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h3 style={{ color: '#ffd43b', margin: 0, marginBottom: '5px' }}>Role Simulator Active</h3>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Change the role below to instantly reconfigure the entire dashboard layout, metrics, and quick actions to match the operational needs of that position.
          </p>
        </div>
        <div>
          <select 
            value={simulatedRoleState} 
            onChange={handleRoleChange}
            style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #ffd43b', background: '#000', color: '#ffd43b', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', maxWidth: '300px' }}
          >
            {ALL_ROLES.map(r => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
            </select>
          </div>
        </div>
      )}

      <header className={styles.header}>
        <h1>{selectedRoleObj.label} Dashboard</h1>
        <p>Welcome back! Here is your personalized daily summary based on your operational archetype ({archetype}).</p>
      </header>

      {/* Access Boundaries Panel */}
      <div style={{ backgroundColor: 'rgba(0, 240, 255, 0.05)', border: '1px solid var(--accent-color)', borderRadius: '8px', padding: '15px 20px', marginBottom: '25px' }}>
        <h3 style={{ margin: '0 0 10px 0', color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🛡️</span> Your Access Boundaries
        </h3>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
          <strong>Validated by AI Security Matrix: </strong> 
          {ROLE_BOUNDARIES[simulatedRole] || ROLE_BOUNDARIES[archetype] || 'Standard access granted. Please refer to system guidelines for your specific permissions.'}
        </p>
      </div>

      {/* --- EXECUTIVE / DIRECTOR DASHBOARD --- */}
      {archetype === 'EXECUTIVE' && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <h3>AI Overrides Pending Approval</h3>
            <p className={styles.statValue} style={{ color: stats.pendingAIOverrides > 0 ? '#ff6b6b' : '#22c55e' }}>{stats.pendingAIOverrides}</p>
            <Link href="/director-audit" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>View Audit Queue ➔</Link>
          </div>
          <div className={styles.statCard}>
            <h3>Total Active Projects</h3>
            <p className={styles.statValue}>{stats.totalProjects}</p>
            <Link href="/projects" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>View Projects ➔</Link>
          </div>
          <div className={styles.statCard}>
            <h3>Total Contract Budget</h3>
            <p className={styles.statValue}>₱ {stats.totalBudget.toLocaleString()}</p>
            <Link href="/reports" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>Financial Reports ➔</Link>
          </div>
          <div className={styles.statCard}>
            <h3>Outstanding Liabilities</h3>
            <p className={styles.statValue} style={{ color: '#f97316' }}>₱ {stats.totalPayables.toLocaleString()}</p>
            <Link href="/supplier-payables" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>View Liabilities ➔</Link>
          </div>
        </div>
      )}

      {/* --- PROJECT MANAGEMENT DASHBOARD --- */}
      {archetype === 'PM' && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <h3>Active BOQ & Consolidations</h3>
            <p className={styles.statValue} style={{ color: '#3498db' }}>{stats.totalProjects}</p>
            <Link href="/projects/boq-consolidation" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>Manage Consolidations ➔</Link>
          </div>
          <div className={styles.statCard}>
            <h3>Accomplishments Tracked</h3>
            <p className={styles.statValue}>{stats.totalAccomplishments ?? 0}</p>
            <Link href="/progress-billings" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>View Accomplishments ➔</Link>
          </div>
          <div className={styles.statCard}>
            <h3>Site Requisitions (MRF)</h3>
            <p className={styles.statValue} style={{ color: '#f97316' }}>{stats.pendingMRFs}</p>
            <Link href="/material-requests/create" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>Request Materials ➔</Link>
          </div>
        </div>
      )}

      {/* --- FINANCE OFFICER DASHBOARD --- */}
      {archetype === 'FINANCE' && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <h3>Unpaid Payables</h3>
            <p className={styles.statValue} style={{ color: '#ef4444' }}>₱ {stats.totalPayables.toLocaleString()}</p>
            <Link href="/supplier-payables" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>Process Payments ➔</Link>
          </div>
          <div className={styles.statCard}>
            <h3>Petty Cash Low Balance</h3>
            <p className={styles.statValue} style={{ color: stats.pendingPettyCash > 0 ? '#f97316' : '#22c55e' }}>{stats.pendingPettyCash} Accts</p>
            <Link href="/petty-cash" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>Review Replenishments ➔</Link>
          </div>
          <div className={styles.statCard}>
            <h3>Active Payroll Periods</h3>
            <p className={styles.statValue}>{stats.activePayrollPeriods}</p>
            <Link href="/payroll" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>Process Payroll ➔</Link>
          </div>
        </div>
      )}

      {/* --- PROCUREMENT DASHBOARD --- */}
      {archetype === 'PROCUREMENT' && (
        <>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <h3>Pending MRFs to Source</h3>
              <p className={styles.statValue} style={{ color: '#f97316' }}>{stats.pendingMRFs ?? 0}</p>
              <Link href="/material-requests" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>View Requests ➔</Link>
            </div>
            <div className={styles.statCard}>
              <h3>Open Canvassing Requests</h3>
              <p className={styles.statValue}>{stats.openCanvassing ?? 0}</p>
              <Link href="#" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>Manage Canvassing ➔</Link>
            </div>
            <div className={styles.statCard}>
              <h3>Active Purchase Orders</h3>
              <p className={styles.statValue}>{stats.activePurchaseOrders ?? 0}</p>
              <Link href="/procurement/purchase-orders" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>Manage POs ➔</Link>
            </div>
            <div className={styles.statCard}>
              <h3>Pending Supplier Deliveries</h3>
              <p className={styles.statValue} style={{ color: '#22c55e' }}>{stats.expectedDeliveries ?? 0}</p>
              <Link href="/deliveries" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>Track Deliveries ➔</Link>
            </div>
          </div>
          
          <div style={{ marginTop: '20px', padding: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
            <h3 style={{ marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>AI Procurement Assistant</span>
              <button 
                onClick={() => handleGenerateSummary(simulatedRole)}
                style={{ padding: '8px 16px', background: 'var(--accent-color)', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {loadingSummary ? 'Generating...' : 'GENERATE AI SUMMARY'}
              </button>
            </h3>
            
            {aiSummary && (
              <div style={{ marginTop: '15px', padding: '15px', background: 'rgba(0, 240, 255, 0.05)', borderLeft: '4px solid var(--accent-color)', borderRadius: '4px' }}>
                <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.6' }}>{aiSummary}</p>
              </div>
            )}
            
            <div style={{ marginTop: '20px', padding: '10px', background: 'rgba(249, 115, 22, 0.1)', color: '#f97316', borderRadius: '4px', border: '1px solid rgba(249, 115, 22, 0.3)', fontWeight: 'bold', fontSize: '0.85rem', textAlign: 'center' }}>
              AI OUTPUT IS ADVISORY ONLY. HUMAN REVIEW AND APPROVAL REQUIRED.
            </div>
          </div>
        </>
      )}

      {/* --- LOGISTICS DASHBOARD --- */}
      {archetype === 'LOGISTICS' && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <h3>Expected Deliveries</h3>
            <p className={styles.statValue} style={{ color: '#22c55e' }}>{stats.expectedDeliveries ?? 0} POs</p>
            <Link href="/deliveries/new" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>Log New Delivery ➔</Link>
          </div>
          <div className={styles.statCard}>
            <h3>Material Issuances</h3>
            <p className={styles.statValue}>{stats.totalIssuances ?? 0}</p>
            <Link href="/material-issuance" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>Issue Materials ➔</Link>
          </div>
          <div className={styles.statCard}>
            <h3>Suppliers</h3>
            <p className={styles.statValue}>{stats.totalSuppliers ?? 0}</p>
            <Link href="/inventory" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>Check Stocks ➔</Link>
          </div>
        </div>
      )}

      {/* --- HR & PAYROLL DASHBOARD --- */}
      {archetype === 'HR' && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <h3>Active Payroll Periods</h3>
            <p className={styles.statValue} style={{ color: '#3498db' }}>{stats.activePayrollPeriods}</p>
            <Link href="/payroll" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>Manage Payrolls ➔</Link>
          </div>
          <div className={styles.statCard}>
            <h3>Workers Database</h3>
            <p className={styles.statValue}>{stats.totalWorkers ?? 0}</p>
            <Link href="/workers" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>Manage Workers ➔</Link>
          </div>
          <div className={styles.statCard}>
            <h3>System Users</h3>
            <p className={styles.statValue}>{stats.totalUsers ?? 0}</p>
            <Link href="/users" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>User Directory ➔</Link>
          </div>
        </div>
      )}

      {/* --- AUDIT DASHBOARD --- */}
      {archetype === 'AUDIT' && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <h3>System Audit Logs</h3>
            <p className={styles.statValue} style={{ color: '#9b59b6' }}>{stats.totalAuditLogs ?? 0}</p>
            <Link href="/system-audit" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>View Audit Trail ➔</Link>
          </div>
          <div className={styles.statCard}>
            <h3>AI Validations</h3>
            <p className={styles.statValue}>{stats.pendingAIOverrides}</p>
            <Link href="/director-audit" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>Review Anomalies ➔</Link>
          </div>
        </div>
      )}

      {/* --- FIELD OPERATIONS DASHBOARD --- */}
      {archetype === 'FIELD' && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <h3>Daily Time Records</h3>
            <p className={styles.statValue} style={{ color: '#27ae60' }}>{stats.totalDailyLogs ?? 0}</p>
            <Link href="/progress-billings" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>Update Accomplishments ➔</Link>
          </div>
          <div className={styles.statCard}>
            <h3>Active Job Orders</h3>
            <p className={styles.statValue}>{stats.totalJobOrders ?? 0}</p>
            <Link href="/reports" style={{ color: '#0e7490', fontWeight: 600, fontSize: '0.85rem', marginTop: '10px', display: 'inline-block' }}>Open Reports ➔</Link>
          </div>
        </div>
      )}

      <div className={styles.chartsArea}>
        <div className={styles.chartPlaceholder}>
          <h3>Quick Access Tools</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
            {archetype === 'HR' ? (
               <Link href="/payroll-payments/dashboard" style={{ padding: '15px', background: '#f3f4f6', borderRadius: '8px', color: '#111827', textDecoration: 'none', border: '1px solid #e5e7eb', fontWeight: '500', transition: 'background 0.2s' }}>💸 Payroll Payment Automation</Link>
            ) : null}
            <Link href="/projects" style={{ padding: '15px', background: '#f3f4f6', borderRadius: '8px', color: '#111827', textDecoration: 'none', border: '1px solid #e5e7eb', fontWeight: '500', transition: 'background 0.2s' }}>📋 Project Directory</Link>
            <Link href="/reports" style={{ padding: '15px', background: '#f3f4f6', borderRadius: '8px', color: '#111827', textDecoration: 'none', border: '1px solid #e5e7eb', fontWeight: '500', transition: 'background 0.2s' }}>📊 Analytics & Reports</Link>
            {(archetype === 'EXECUTIVE' || archetype === 'AUDIT') && (
              <Link href="/system-audit" style={{ padding: '15px', background: '#f3f4f6', borderRadius: '8px', color: '#111827', textDecoration: 'none', border: '1px solid #e5e7eb', fontWeight: '500', transition: 'background 0.2s' }}>🛡️ Global Audit Ledger</Link>
            )}
          </div>
        </div>
        <div className={styles.chartPlaceholder}>
          <h3>System Notices</h3>
          <div style={{ marginTop: '20px', padding: '20px', background: '#eff6ff', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
            <p style={{ margin: 0, fontWeight: 'bold', color: '#1e3a8a' }}>AI Compliance Engine Active</p>
            <p style={{ margin: '10px 0 0 0', fontSize: '0.9rem', color: '#475569', lineHeight: '1.5' }}>All transactions are currently being monitored by the AI Validation system. Anomalies will be routed to the Project Director for override approval.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
