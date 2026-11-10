import PendingLabel from '@/components/ui/PendingLabel';
import { verifySession } from '@/lib/dal/auth';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import styles from '../projects/page.module.css';
import { processPayment } from '@/app/actions/progressActions';

export const dynamic = 'force-dynamic';

export default async function UnifiedPayablesPage() {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  const activeProjectId = cookieStore.get('activeProjectId')?.value || null;

  if (!activeProjectId) {
    return (
      <div className={styles.container} style={{ maxWidth: '1400px', margin: '0 auto', padding: '100px 20px', textAlign: 'center' }}>
        <h2>No Active Project Selected</h2>
        <p>Please select an Active Project from the top navigation bar to view its Payables.</p>
      </div>
    );
  }

  const user = sessionId ? await prisma.user.findUnique({ where: { id: sessionId } }) : null;

  const payableFilter: any = { 
    status: { not: 'PAID' },
    po: { mr: { projectId: activeProjectId } }
  };

  const billFilter: any = { 
    paymentStatus: 'PENDING', 
    status: 'APPROVED_FOR_PAYMENT', 
    packageId: { not: null },
    projectId: activeProjectId
  };

  const joBillFilter: any = { 
    paymentStatus: 'PENDING', 
    status: 'APPROVED_FOR_PAYMENT', 
    jobOrderId: { not: null },
    projectId: activeProjectId
  };

  const payables = await prisma.accountsPayable.findMany({
    where: payableFilter,
    include: {
      delivery: true,
      po: { include: { supplier: true } }
    },
    orderBy: { dueDate: 'asc' }
  });

  const subconBillings = await prisma.subcontractBilling.findMany({
    where: billFilter,
    include: {
      subcontractor: true,
      package: true,
      project: true
    },
    orderBy: { createdAt: 'asc' }
  });

  const jobOrderBillings = await prisma.subcontractBilling.findMany({
    where: joBillFilter,
    include: {
      subcontractor: true,
      jobOrder: true,
      project: true
    },
    orderBy: { createdAt: 'asc' }
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fiveDaysFromNow = new Date(today);
  fiveDaysFromNow.setDate(today.getDate() + 5);

  const maturingPayables = payables.filter(p => {
    const dueDate = new Date(p.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate >= today && dueDate <= fiveDaysFromNow;
  });

  const totalActionable = payables.length + subconBillings.length + jobOrderBillings.length;

  return (
    <div className={styles.container} style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '60px' }}>
      <header className={styles.header}>
        <div>
          <Link href="/finance" style={{ color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '10px', display: 'inline-block' }}>
            ← Back to Finance Hub
          </Link>
          <h1>Unified Finance Payables</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '5px' }}>Track and process outstanding balances for Suppliers, Subcontractors, and Job Orders.</p>
        </div>
      </header>

      {(maturingPayables.length > 0 || totalActionable > 0) && (
        <div style={{
          marginBottom: '30px',
          padding: '20px',
          background: 'rgba(0, 240, 255, 0.05)',
          border: '1px solid var(--accent-color)',
          borderRadius: '12px',
          display: 'flex',
          gap: '15px',
          alignItems: 'flex-start',
          boxShadow: '0 4px 15px rgba(0, 240, 255, 0.1)'
        }}>
          <div style={{ fontSize: '2rem' }}>🤖</div>
          <div>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--accent-color)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--accent-color)', borderRadius: '50%', boxShadow: '0 0 10px var(--accent-color)' }}></span>
              AI Finance Assistant
            </h3>
            <p style={{ margin: 0, color: 'var(--text-primary)', lineHeight: '1.5' }}>
              Hello Finance Officer. You have <strong>{payables.length}</strong> supplier payables, <strong>{subconBillings.length}</strong> subcontract billings, and <strong>{jobOrderBillings.length}</strong> job order billings waiting for payment.
              {maturingPayables.length > 0 && ` Note that ${maturingPayables.length} supplier payable(s) are maturing within the next 5 days.`}
            </p>
          </div>
        </div>
      )}

      {/* SUPPLIER PAYABLES SECTION */}
      <h2 style={{ color: 'var(--text-primary)', borderBottom: '1px solid #333', paddingBottom: '10px', marginTop: '40px' }}>1. Supplier Material Payables</h2>
      <div className={styles.tableContainer} style={{ overflowX: 'auto', marginBottom: '40px' }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Supplier Name</th>
              <th>PO Number</th>
              <th>DR / Invoice No</th>
              <th>Delivery Date</th>
              <th>Amount Due (₱)</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {payables.map(payable => {
              const isOverdue = new Date(payable.dueDate) < new Date() && payable.status !== 'PAID';
              return (
                <tr key={payable.id}>
                  <td style={{ fontWeight: 'bold' }}>{payable.po.supplier.name}</td>
                  <td>{payable.po.poNumber}</td>
                  <td>{payable.delivery.receiptNumber || 'N/A'}</td>
                  <td>{new Date(payable.delivery.createdAt).toLocaleDateString()}</td>
                  <td style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>
                    {/* Amount still due: partial payments reduce the balance (matches the detail page). */}
                    {Math.max((payable.amount || 0) - (payable.paidAmount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ color: isOverdue ? '#ef4444' : 'inherit', fontWeight: isOverdue ? 'bold' : 'normal' }}>
                    {new Date(payable.dueDate).toLocaleDateString()}
                    {isOverdue && ' (OVERDUE)'}
                  </td>
                  <td>
                    <span style={{
                      padding: '4px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold',
                      backgroundColor: payable.status === 'PENDING' ? 'rgba(234, 179, 8, 0.2)' : payable.status === 'ACCRUED' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                      color: payable.status === 'PENDING' ? '#eab308' : payable.status === 'ACCRUED' ? '#a855f7' : '#3b82f6'
                    }}>
                      {payable.status === 'ACCRUED' ? 'PDC ISSUED' : payable.status}
                    </span>
                  </td>
                  <td>
                    <Link href={`/supplier-payables/${payable.id}`} style={{ padding: '6px 12px', background: 'var(--accent-color)', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', display: 'inline-block', textDecoration: 'none' }}><PendingLabel>{payable.status === 'ACCRUED' ? 'Clear Payment' : 'Issue Payment'}</PendingLabel></Link>
                  </td>
                </tr>
              );
            })}
            {payables.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>No supplier payables found.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* SUBCONTRACT PAYABLES SECTION */}
      <h2 style={{ color: 'var(--text-primary)', borderBottom: '1px solid #333', paddingBottom: '10px' }}>2. Subcontractor Payables</h2>
      <div className={styles.tableContainer} style={{ overflowX: 'auto', marginBottom: '40px' }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Subcontractor</th>
              <th>Project</th>
              <th>Package / Invoice</th>
              <th>Gross Billed</th>
              <th>Retention (10%)</th>
              <th>Net Payable (₱)</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {subconBillings.map(bill => (
              <tr key={bill.id}>
                <td style={{ fontWeight: 'bold' }}>{bill.subcontractor?.name || 'Unknown'}</td>
                <td>{bill.project?.name || 'N/A'}</td>
                <td>
                  <div>
                    <Link href={`/subcontracting/invoice/${bill.id}`} style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}>
                      {bill.package?.packageNumber || 'N/A'}
                    </Link>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Inv: {bill.billingNumber}</div>
                </td>
                <td>₱{bill.currentGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td style={{ color: '#ef4444' }}>-₱{(bill.retentionDeduction || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>
                  ₱{bill.netPayable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td>
                  <Link href={`/supplier-payables/subcontract/${bill.id}`} style={{
                      padding: '6px 12px',
                      background: (bill as any).endorsedForPayment ? 'rgba(245, 158, 11, 0.15)' : 'var(--accent-color)',
                      color: (bill as any).endorsedForPayment ? '#fbbf24' : '#000',
                      border: (bill as any).endorsedForPayment ? '1px solid rgba(245, 158, 11, 0.3)' : 'none',
                      borderRadius: '4px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'inline-block',
                      textDecoration: 'none'
                    }}><PendingLabel>{(bill as any).endorsedForPayment ? 'Review Endorsement' : 'Issue Payment'}</PendingLabel></Link>
                </td>
              </tr>
            ))}
            {subconBillings.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>No pending subcontract billings.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* JOB ORDER PAYABLES SECTION */}
      <h2 style={{ color: 'var(--text-primary)', borderBottom: '1px solid #333', paddingBottom: '10px' }}>3. Job Order Payables</h2>
      <div className={styles.tableContainer} style={{ overflowX: 'auto' }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Subcontractor</th>
              <th>Project</th>
              <th>Job Order / Invoice</th>
              <th>Gross Billed</th>
              <th>Net Payable (₱)</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {jobOrderBillings.map(bill => (
              <tr key={bill.id}>
                <td style={{ fontWeight: 'bold' }}>{bill.subcontractor?.name || 'Unknown'}</td>
                <td>{bill.project?.name || 'N/A'}</td>
                <td>
                  <div>
                    <Link href={`/subcontracting/invoice/${bill.id}`} style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}>
                      {bill.jobOrder?.jobNumber || 'N/A'}
                    </Link>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Inv: {bill.billingNumber}</div>
                </td>
                <td>₱{bill.currentGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>
                  ₱{bill.netPayable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td>
                  <Link href={`/supplier-payables/subcontract/${bill.id}`} style={{
                      padding: '6px 12px',
                      background: (bill as any).endorsedForPayment ? 'rgba(245, 158, 11, 0.15)' : 'var(--accent-color)',
                      color: (bill as any).endorsedForPayment ? '#fbbf24' : '#000',
                      border: (bill as any).endorsedForPayment ? '1px solid rgba(245, 158, 11, 0.3)' : 'none',
                      borderRadius: '4px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'inline-block',
                      textDecoration: 'none'
                    }}><PendingLabel>{(bill as any).endorsedForPayment ? 'Review Endorsement' : 'Issue Payment'}</PendingLabel></Link>
                </td>
              </tr>
            ))}
            {jobOrderBillings.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>No pending job order billings.</td></tr>}
          </tbody>
        </table>
      </div>

    </div>
  );
}
