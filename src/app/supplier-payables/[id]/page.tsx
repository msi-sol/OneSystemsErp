import { verifySession } from '@/lib/dal/auth';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import IssuePaymentForm from './IssuePaymentForm';
import styles from '../../projects/page.module.css';
import { getUserPermissions } from '@/lib/permissions';

export default async function PayableDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ origin?: string }> }) {
  const { origin } = await searchParams;
  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  let userRole = 'GUEST';
  
  if (sessionId) {
    const user = await prisma.user.findUnique({ where: { id: sessionId } });
    if (user) userRole = user.role;
  }

  const permissions = await getUserPermissions(sessionId || '');
  const canIssue = permissions?.PAYMENT_ISSUANCE?.canCreate || false;

  const { id } = await params;

  const payable = await prisma.accountsPayable.findUnique({
    where: { id },
    include: {
      po: { include: { supplier: true } },
      delivery: true
    }
  });

  if (!payable) return notFound();



  return (
    <div className={styles.container} style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <header className={styles.header} style={{ marginBottom: '30px' }}>
        <div>
          <Link href={origin === 'expenses' ? '/expenses' : '/supplier-payables'} style={{ color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '10px', display: 'inline-block' }}>
            ← {origin === 'expenses' ? 'Back to Expenses' : 'Back to Payables'}
          </Link>
          <h1>Payment Voucher</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '5px' }}>Process and record payment for Supplier Delivery.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        {/* Left Side: Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Supplier Information</h3>
            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '10px 0', color: 'var(--text-primary)' }}>
              {payable.po.supplier.name}
            </p>
            {payable.po.supplier.contactPerson && <p style={{ margin: '5px 0', color: 'var(--text-secondary)' }}>Contact: {payable.po.supplier.contactPerson}</p>}
            {payable.po.supplier.paymentTerms && <p style={{ margin: '5px 0', color: 'var(--text-secondary)' }}>Terms: {payable.po.supplier.paymentTerms}</p>}
            
            {payable.voucherNumber && (
              <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--glass-border)' }}>
                <p style={{ margin: '0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Voucher Number</p>
                <p style={{ margin: '5px 0 0 0', fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--accent-color)' }}>
                  {payable.voucherNumber}
                </p>
              </div>
            )}
          </div>

          <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Transaction Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px' }}>
              <div>
                <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>PO Number</span>
                <span style={{ fontWeight: 'bold' }}>{payable.po.poNumber}</span>
              </div>
              <div>
                <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>DR / Invoice No</span>
                <span style={{ fontWeight: 'bold' }}>{payable.delivery.receiptNumber || 'N/A'}</span>
              </div>
              <div>
                <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Delivery Date</span>
                <span style={{ fontWeight: 'bold' }}>{new Date(payable.delivery.createdAt).toLocaleDateString()}</span>
              </div>
              <div>
                <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Due Date</span>
                <span style={{ fontWeight: 'bold', color: new Date(payable.dueDate) < new Date() && payable.status !== 'PAID' ? '#ef4444' : 'inherit' }}>
                  {new Date(payable.dueDate).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <div style={{ background: 'rgba(0, 240, 255, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid var(--accent-color)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--accent-color)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Account Summary</h3>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', paddingBottom: '5px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total Amount</span>
              <span style={{ fontWeight: 'bold' }}>₱ {payable.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>

            {(payable.vatAmount > 0 || payable.netAmount > 0) && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', paddingBottom: '5px', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>↳ Net Amount</span>
                  <span>₱ {payable.netAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>↳ 12% VAT Input</span>
                  <span>₱ {payable.vatAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
              </>
            )}
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Paid Amount</span>
              <span style={{ fontWeight: 'bold', color: '#10b981' }}>₱ {payable.paidAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', fontSize: '1.2rem' }}>
              <span style={{ fontWeight: 'bold' }}>Remaining Balance</span>
              <span style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>
                ₱ {(payable.amount - payable.paidAmount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </span>
            </div>
          </div>

        </div>

        {/* Right Side: Form */}
        <div>
          <IssuePaymentForm payable={payable} userRole={userRole} canIssue={canIssue} />
        </div>
      </div>
    </div>
  );
}
