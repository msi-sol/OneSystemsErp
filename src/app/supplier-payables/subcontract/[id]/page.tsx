import { verifySession } from '@/lib/dal/auth';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import SubcontractPaymentForm from './SubcontractPaymentForm';
import styles from '../../../projects/page.module.css';
import { getUserPermissions } from '@/lib/permissions';

export default async function SubcontractPayableDetailsPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>,
  searchParams: Promise<{ origin?: string }>
}) {
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

  const billing = await prisma.subcontractBilling.findUnique({
    where: { id },
    include: {
      subcontractor: true,
      package: true,
      jobOrder: true,
      project: true
    }
  });

  if (!billing) return notFound();

  const isJobOrder = !!billing.jobOrderId;
  const refNo = isJobOrder
    ? billing.jobOrder?.jobNumber || 'JO-N/A'
    : billing.package?.packageNumber || 'SP-N/A';

  const refLabel = isJobOrder ? 'Job Order Number' : 'Subcontract Package';

  return (
    <div className={styles.container} style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '60px' }}>
      <header className={styles.header} style={{ marginBottom: '30px' }}>
        <div>
          <Link href="/supplier-payables" style={{ color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '10px', display: 'inline-block' }}>
            ← Back to Payables
          </Link>
          <h1>Subcontract Payment Voucher</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '5px' }}>
            Process and endorse check issuance or bank transfer for subcontractor accomplishments.
          </p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        {/* Left Side: Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Subcontractor Information</h3>
            <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '10px 0', color: 'var(--text-primary)' }}>
              {billing.subcontractor?.name || 'Unknown Subcontractor'}
            </p>
            {(billing.subcontractor as any)?.tradeCategory && <p style={{ margin: '5px 0', color: 'var(--text-secondary)' }}>Category: {(billing.subcontractor as any).tradeCategory}</p>}
            {(billing.subcontractor as any)?.vatStatus && <p style={{ margin: '5px 0', color: 'var(--text-secondary)' }}>VAT Status: {(billing.subcontractor as any).vatStatus}</p>}
          </div>

          <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Transaction Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px' }}>
              <div>
                <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{refLabel}</span>
                <span style={{ fontWeight: 'bold' }}>{refNo}</span>
              </div>
              <div>
                <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Invoice Number</span>
                <span style={{ fontWeight: 'bold' }}>{billing.billingNumber}</span>
              </div>
              <div>
                <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Billing Period</span>
                <span style={{ fontWeight: 'bold' }}>{billing.billingPeriod || 'Progress Billing'}</span>
              </div>
              <div>
                <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Project</span>
                <span style={{ fontWeight: 'bold', fontSize: '0.8rem', lineHeight: '1.3' }}>{billing.project?.name || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div style={{ background: 'rgba(0, 240, 255, 0.05)', padding: '20px', borderRadius: '12px', border: '1px solid var(--accent-color)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--accent-color)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Account Summary</h3>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', paddingBottom: '5px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Gross Billed</span>
              <span style={{ fontWeight: 'bold' }}>₱{billing.currentGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>

            {billing.retentionDeduction && billing.retentionDeduction > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>↳ Retention Deducted</span>
                <span style={{ color: '#ef4444' }}>-₱{billing.retentionDeduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', fontSize: '1.2rem' }}>
              <span style={{ fontWeight: 'bold' }}>Net Payable Amount</span>
              <span style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>
                ₱{billing.netPayable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

        </div>

        {/* Right Side: Form */}
        <div>
          <SubcontractPaymentForm billing={billing} userRole={userRole} canIssue={canIssue} />
        </div>
      </div>
    </div>
  );
}
