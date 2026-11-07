import styles from '../projects/page.module.css';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function HRPage() {
  const payrolls = await prisma.payroll.findMany({
    orderBy: { createdAt: 'desc' },
    include: { worker: true, payrollPeriod: true }
  });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>HR & Payroll</h1>
          <p>Manage worker records, DTRs, and payroll generation.</p>
        </div>
        <button className={styles.primaryButton}>+ Generate Payroll</button>
      </header>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Period Start</th>
              <th>Period End</th>
              <th>Worker</th>
              <th>Project</th>
              <th>Net Pay</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {payrolls.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.emptyState}>No payroll records found.</td>
              </tr>
            ) : payrolls.map(payroll => (
              <tr key={payroll.id}>
                <td>{new Date(payroll.payrollPeriod.startDate).toLocaleDateString()}</td>
                <td>{new Date(payroll.payrollPeriod.endDate).toLocaleDateString()}</td>
                <td>
                  <div className={styles.projectName}>{payroll.worker.firstName} {payroll.worker.lastName}</div>
                  <div className={styles.projectLocation}>{payroll.worker.designation || 'Worker'}</div>
                </td>
                <td>{payroll.worker.projectId || 'Various'}</td>
                <td className={styles.amount}>
                  ₱ {payroll.netPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td>
                  <span className={`${styles.badge} ${styles.badgeDefault}`}>
                    {payroll.payrollPeriod.status}
                  </span>
                </td>
                <td>
                  <Link href={`/payroll/${payroll.payrollPeriodId}`} className={styles.actionLink}>View Payslip</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
