import { verifySession } from '@/lib/dal/auth';
import styles from '../projects/page.module.css';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import LogExpenseClient from './LogExpenseClient';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function ExpensesPage() {
  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  const activeProjectId = cookieStore.get('activeProjectId')?.value || null;

  const user = await prisma.user.findUnique({ where: { id: sessionId } });
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'SYSTEM_ADMIN';

  const baseProjectFilter: any = {};
  if (!isSuperAdmin) {
    baseProjectFilter.userAssignments = {
      some: { userId: sessionId, assignmentStatus: 'active' }
    };
  }

  const expenseFilter: any = {};
  if (!isSuperAdmin) expenseFilter.project = baseProjectFilter;
  if (activeProjectId) expenseFilter.projectId = activeProjectId;

  const expenses = await prisma.expense.findMany({
    where: expenseFilter,
    orderBy: { date: 'desc' },
    include: { project: true, loggedBy: true, breakdownItems: true }
  });

  const projectsFilter: any = {};
  if (!isSuperAdmin) {
    projectsFilter.userAssignments = {
      some: { userId: sessionId, assignmentStatus: 'active' }
    };
  }

  const projects = await prisma.project.findMany({
    where: projectsFilter,
    select: { id: true, name: true } 
  });
  const users = await prisma.user.findMany({ select: { id: true, name: true } });

  // Fetch corresponding payables to get the due date
  const receiptRefs = expenses.map(e => e.receiptRef).filter(Boolean) as string[];
  let payables: any[] = [];
  if (receiptRefs.length > 0) {
    payables = await prisma.accountsPayable.findMany({
      where: {
        voucherNumber: { in: receiptRefs }
      },
      select: {
        voucherNumber: true,
        dueDate: true
      }
    });
  }
  const payableMap = new Map(payables.map(p => [p.voucherNumber, p]));

  const totalNetAmount = expenses.reduce((sum, e) => sum + e.netAmount, 0);
  const totalVatInput = expenses.reduce((sum, e) => sum + e.vatAmount, 0);
  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Expenses</h1>
          <p>Monitor project expenditures and operational costs.</p>
        </div>
        <LogExpenseClient projects={projects} users={users} />
      </header>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Voucher No.</th>
              <th>Date Due</th>
              <th>Supplier / Vendor</th>
              <th>Issued By</th>
              <th>Net Amount</th>
              <th>VAT Input</th>
              <th>Total Amount</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={9} className={styles.emptyState}>No expenses recorded.</td>
              </tr>
            ) : expenses.map(expense => {
              const payable = expense.receiptRef ? payableMap.get(expense.receiptRef) : null;
              const dateToDisplay = payable?.dueDate ? new Date(payable.dueDate) : new Date(expense.date);
              
              return (
              <tr key={expense.id} style={{ opacity: expense.isAccrued ? 0.8 : 1 }}>
                <td style={{ fontWeight: 'bold' }}>
                  {expense.receiptRef || 'N/A'}
                  {expense.isAccrued && (
                    <span style={{ 
                      marginLeft: '8px', 
                      padding: '2px 6px', 
                      background: 'rgba(168, 85, 247, 0.2)', 
                      color: '#a855f7', 
                      borderRadius: '4px', 
                      fontSize: '0.7rem' 
                    }}>
                      ACCRUED
                    </span>
                  )}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{dateToDisplay.toLocaleDateString()}</td>
                <td>{expense.supplierName || 'N/A'}</td>
                <td>{expense.loggedBy?.name || 'Unknown'}</td>
                <td className={styles.amount} style={{ whiteSpace: 'nowrap' }}>
                  ₱ {expense.netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className={styles.amount} style={{ whiteSpace: 'nowrap' }}>
                  ₱ {expense.vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className={styles.amount} style={{ whiteSpace: 'nowrap', fontWeight: 'bold', color: 'var(--accent-color)' }}>
                  ₱ {expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                {/* LOGGED expenses await approval; only APPROVED ones count as project cost. */}
                <td style={{ whiteSpace: 'nowrap', fontWeight: 600, fontSize: '0.8rem', color: expense.status === 'APPROVED' ? '#4ade80' : expense.status === 'REJECTED' ? '#f87171' : '#fbbf24' }}>
                  {expense.status === 'LOGGED' ? 'For approval' : expense.status.replaceAll('_', ' ')}
                </td>
                <td>
                  <Link href={`/expenses/${expense.id}`} className={styles.actionLink}>View Details</Link>
                </td>
              </tr>
              );
            })}
          </tbody>
          {expenses.length > 0 && (
            <tfoot>
              <tr style={{ background: 'rgba(0,0,0,0.4)', fontWeight: 'bold', borderTop: '2px solid var(--glass-border)' }}>
                <td colSpan={4} style={{ textAlign: 'right', paddingRight: '20px', color: '#fff' }}>GRAND TOTAL</td>
                <td className={styles.amount} style={{ whiteSpace: 'nowrap', color: '#fff' }}>
                  ₱ {totalNetAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className={styles.amount} style={{ whiteSpace: 'nowrap', color: '#fff' }}>
                  ₱ {totalVatInput.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className={styles.amount} style={{ whiteSpace: 'nowrap', color: 'var(--accent-color)' }}>
                  ₱ {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
