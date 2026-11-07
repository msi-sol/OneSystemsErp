import React from 'react';
import Link from 'next/link';
import PayrollSubNav from '@/components/PayrollSubNav';
import { prisma } from '@/lib/prisma';

export default async function PayrollPaymentDashboard() {
  const bankAccounts = await prisma.payrollBankAccount.aggregate({
    _sum: { currentAvailableBalance: true }
  });
  const totalBalance = bankAccounts._sum.currentAvailableBalance || 0;

  const approvedPayslipsCount = await prisma.payroll.count({
    where: { 
      payrollPeriod: { isLocked: true },
      paymentStatus: 'PENDING'
    }
  });

  const processingBatchesCount = await prisma.paymentBatch.count({
    where: { status: 'PROCESSING' }
  });

  const paymentExceptionsCount = await prisma.paymentException.count({
    where: { status: 'OPEN' }
  });

  const recentBatches = await prisma.paymentBatch.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '1200px', margin: '0 auto' }}>
      <PayrollSubNav />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', textShadow: '0 0 10px var(--accent-glow)' }}>
          Payroll Payment Automation
        </h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link href="/payroll-payments/queue" style={{ 
            background: 'var(--accent-color)', color: '#000', padding: '10px 20px', 
            borderRadius: '8px', fontWeight: 'bold', textDecoration: 'none', 
            boxShadow: '0 4px 12px rgba(0, 255, 163, 0.2)', transition: 'all 0.2s' 
          }}>
            Payment Queue
          </Link>
          <Link href="/payroll-payments/providers" style={{ 
            background: 'transparent', border: '1px solid var(--glass-border)', color: '#fff', 
            padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', textDecoration: 'none',
            transition: 'all 0.2s' 
          }}>
            Provider Setup
          </Link>
        </div>
      </div>

      {/* High-Level Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Payroll Bank Balance</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fff', marginTop: '10px' }}>
            ₱{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '5px' }}>Sufficient for pending batches</p>
        </div>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Approved Payslips</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3498db', marginTop: '10px', textShadow: '0 0 10px rgba(52, 152, 219, 0.5)' }}>
            {approvedPayslipsCount}
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '5px' }}>Pending Payment</p>
        </div>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Processing Batches</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f39c12', marginTop: '10px', textShadow: '0 0 10px rgba(243, 156, 18, 0.5)' }}>
            {processingBatchesCount}
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '5px' }}>Awaiting Settlement</p>
        </div>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '24px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Payment Exceptions</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-secondary)', marginTop: '10px' }}>
            {paymentExceptionsCount}
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '5px' }}>
            {paymentExceptionsCount === 0 ? 'No Action Required' : 'Requires Attention'}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        {/* Recent Batches */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--glass-border)', overflow: 'hidden' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>Recent API Batches</h2>
            <Link href="/finance/payment-batches" style={{ fontSize: '0.9rem', color: '#3498db', textDecoration: 'none', fontWeight: 'bold' }}>View All</Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '15px 20px' }}>Batch ID</th>
                  <th style={{ padding: '15px 20px' }}>Rail</th>
                  <th style={{ padding: '15px 20px' }}>Amount</th>
                  <th style={{ padding: '15px 20px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentBatches.length > 0 ? (
                  recentBatches.map(batch => (
                    <tr key={batch.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                      <td style={{ padding: '15px 20px' }}>{batch.batchNumber}</td>
                      <td style={{ padding: '15px 20px' }}>{batch.transferRail || 'Manual'}</td>
                      <td style={{ padding: '15px 20px' }}>₱ {batch.totalAmount.toLocaleString()}</td>
                      <td style={{ padding: '15px 20px' }}>{batch.status}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No recent payment batches found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI Risk Alerts */}
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--glass-border)', overflow: 'hidden' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.2rem' }}>🤖</span>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>AI Validation Alerts</h2>
          </div>
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <p style={{ color: 'var(--text-secondary)' }}>No pending validation alerts.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
