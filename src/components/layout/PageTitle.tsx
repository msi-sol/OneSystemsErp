'use client';

import { usePathname } from 'next/navigation';

// Header title per section. Most specific prefixes first; names match the sidebar.
// Previously only a few modules were listed and everything else (Payroll, Finance, Equipment, Users, ...)
// showed "Overview".
const TITLES: [prefix: string, title: string][] = [
  ['/procurement/canvassing', 'Supplier Canvassing'],
  ['/procurement/purchase-orders', 'Purchase Orders'],
  ['/procurement/suppliers', 'Vendors & Suppliers'],
  ['/procurement', 'Procurement'],
  ['/material-requests', 'Material Requests'],
  ['/material-issuance', 'Material Issuance'],
  ['/inventory', 'Inventory Management'],
  ['/deliveries', 'Deliveries'],
  ['/boq-template', 'BOQ Workspace'],
  ['/boq', 'BOQ Workspace'],
  ['/projects', 'Projects'],
  ['/scheduling', 'Project Scheduling'],
  ['/accomplishments', 'Accomplishments'],
  ['/progress-billings', 'Progress Billings'],
  ['/collections', 'Collections'],
  ['/variation-orders', 'Variation Orders'],
  ['/subcontracting', 'Subcontracting'],
  ['/job-orders', 'Job Orders'],
  ['/supplier-payables', 'Supplier Payables'],
  ['/expenses', 'Expenses'],
  ['/petty-cash', 'Petty Cash'],
  ['/finance/payment-batches', 'Payment Batches'],
  ['/finance/approved-payslips', 'Approved Payslips'],
  ['/finance/payroll-accounts', 'Payroll Bank Accounts'],
  ['/finance', 'Finance'],
  ['/payroll-payments', 'Payroll Payments'],
  ['/payroll', 'Payroll'],
  ['/hr', 'HR & Payroll'],
  ['/workers', 'Worker Directory'],
  ['/equipment', 'Equipment'],
  ['/executive', 'Executive'],
  ['/reports', 'Reports'],
  ['/documents', 'Documents'],
  ['/knowledge-center', 'Knowledge Center'],
  ['/ai-notebook', 'AI Notebook'],
  ['/ai-audit', 'AI Audit'],
  ['/director-audit', "Director's Audit"],
  ['/system-audit', 'System Audit'],
  ['/users', 'Users'],
  ['/admin/security', 'Security (SOC)'],
  ['/admin', 'Administration'],
  ['/settings', 'Settings'],
  ['/profile', 'My Profile'],
  ['/change-password', 'Change Password'],
];

export function titleForPath(pathname: string) {
  if (pathname === '/' || pathname === '') return 'Dashboard';
  const match = TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return match ? match[1] : 'Overview';
}

export default function PageTitle() {
  const pathname = usePathname() || '/';
  return <h2 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 'normal' }}>{titleForPath(pathname)}</h2>;
}
