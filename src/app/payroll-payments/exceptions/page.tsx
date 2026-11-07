import React from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import PayrollSubNav from '@/components/PayrollSubNav';

export const dynamic = 'force-dynamic';

// Previously a static mockup with invented workers, errors and counts. This reads real PaymentException rows.

const peso = (value: number | null | undefined) =>
  value == null ? '—' : `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  OPEN: { bg: 'rgba(231, 76, 60, 0.2)', fg: '#e74c3c' },
  IN_PROGRESS: { bg: 'rgba(243, 156, 18, 0.2)', fg: '#f39c12' },
  RESOLVED: { bg: 'rgba(0, 255, 163, 0.15)', fg: '#00ffa3' },
};

export default async function PaymentExceptionsQueue() {
  const [exceptions, statusCounts] = await Promise.all([
    prisma.paymentException.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.paymentException.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const workerIds = [...new Set(exceptions.map((e) => e.workerId))];
  const workers = workerIds.length
    ? await prisma.worker.findMany({ where: { id: { in: workerIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const workerName = new Map(workers.map((w) => [w.id, `${w.lastName}, ${w.firstName}`]));

  const countFor = (status: string) => statusCounts.find((s) => s.status === status)?._count._all ?? 0;
  const open = countFor('OPEN');
  const resolved = countFor('RESOLVED');
  const total = statusCounts.reduce((sum, s) => sum + s._count._all, 0);
  const openAmount = exceptions.filter((e) => e.status === 'OPEN').reduce((sum, e) => sum + (e.amount || 0), 0);

  const cards = [
    { label: 'Open Exceptions', value: open.toLocaleString(), color: '#ff6b6b' },
    { label: 'Open Amount', value: peso(openAmount), color: '#f1c40f' },
    { label: 'Resolved', value: resolved.toLocaleString(), color: '#00ffa3' },
    { label: 'All Exceptions', value: total.toLocaleString(), color: '#fff' },
  ];

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '1200px', margin: '0 auto' }}>
      <PayrollSubNav />
      <div style={{ marginBottom: '30px' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', textShadow: '0 0 10px var(--accent-glow)' }}>Payment Exceptions</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '5px' }}>
          Failed payments and validation errors raised during payroll disbursement.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        {cards.map((card) => (
          <div key={card.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '20px', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold', margin: 0 }}>{card.label}</h3>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', color: card.color, margin: '10px 0 0' }}>{card.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--glass-border)', overflowX: 'auto' }}>
        {exceptions.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No payment exceptions have been recorded.{' '}
            <Link href="/finance/payment-batches" style={{ color: 'var(--accent-color)' }}>View payment batches</Link>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(0,0,0,0.2)' }}>
                <th style={{ padding: '15px 20px' }}>Worker / Payslip</th>
                <th style={{ padding: '15px 20px' }}>Error Details</th>
                <th style={{ padding: '15px 20px' }}>Amount</th>
                <th style={{ padding: '15px 20px' }}>Status</th>
                <th style={{ padding: '15px 20px' }}>Raised</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map((e) => {
                const style = STATUS_STYLE[e.status] || { bg: 'rgba(255,255,255,0.1)', fg: '#fff' };
                const code = [e.unionBankResponseCode, e.unionBankResponseMessage].filter(Boolean).join(': ');
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                    <td style={{ padding: '15px 20px' }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{workerName.get(e.workerId) || 'Unknown worker'}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{e.payslipNumber || e.payrollBatchId || '—'}</div>
                    </td>
                    <td style={{ padding: '15px 20px' }}>
                      <div style={{ fontSize: '0.9rem', color: '#ff6b6b', fontWeight: 'bold' }}>{e.exceptionReason}</div>
                      {(code || e.correctiveAction) && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          {code}{code && e.correctiveAction ? ' · ' : ''}{e.correctiveAction}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '15px 20px', fontWeight: 'bold' }}>{peso(e.amount)}</td>
                    <td style={{ padding: '15px 20px' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', background: style.bg, color: style.fg, border: `1px solid ${style.fg}66` }}>
                        {e.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '15px 20px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      {new Date(e.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
