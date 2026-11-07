'use client';

import { useState } from 'react';
import { holdPayslip, resolvePayslipException } from '@/app/actions/payslipQueueActions';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ApprovedPayslipsClient({ payslips }: { payslips: any[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [showHoldModal, setShowHoldModal] = useState<string | null>(null);
  const [holdReason, setHoldReason] = useState('');

  const handleHold = async (id: string) => {
    if (!holdReason) return alert('Please enter a reason');
    setLoadingId(id);
    const res = await holdPayslip(id, holdReason);
    setLoadingId(null);
    if (res.success) {
      setShowHoldModal(null);
      setHoldReason('');
    } else {
      alert(res.error);
    }
  };

  const handleResolve = async (id: string) => {
    setLoadingId(id);
    const res = await resolvePayslipException(id);
    setLoadingId(null);
    if (!res.success) alert(res.error);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <button 
          onClick={() => router.push('/finance/payroll-accounts')}
          style={{ background: '#3498db', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}
        >
          Generate GCash/Bank Batch
        </button>
      </div>

      <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--glass-border)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '1000px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <th style={{ padding: '12px 8px', color: '#888' }}>Payslip #</th>
              <th style={{ padding: '12px 8px', color: '#888' }}>Batch ID</th>
              <th style={{ padding: '12px 8px', color: '#888' }}>Worker</th>
              <th style={{ padding: '12px 8px', color: '#888' }}>Category</th>
              <th style={{ padding: '12px 8px', color: '#888' }}>Payment Method</th>
              <th style={{ padding: '12px 8px', color: '#888' }}>Net Pay</th>
              <th style={{ padding: '12px 8px', color: '#888' }}>Status</th>
              <th style={{ padding: '12px 8px', color: '#888' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {payslips.map(ps => {
              const w = ps.worker;
              
              let readinessStatus = 'Ready';
              let riskLevel = 'Low';
              let rowColor = '';
              let statusColor = '#2ecc71';

              if (ps.paymentStatus === 'ON_HOLD') {
                readinessStatus = 'Payment On Hold';
                statusColor = '#f1c40f';
                rowColor = 'rgba(241, 196, 15, 0.05)';
              } else if (w.paymentProfileStatus !== 'Verified') {
                readinessStatus = 'Payment On Hold (Profile Unverified)';
                statusColor = '#f1c40f';
              } else if (w.allowedPaymentMethod === 'GCash Only') {
                readinessStatus = 'Ready for GCash';
              } else if (w.allowedPaymentMethod === 'Bank Transfer Only') {
                readinessStatus = 'Ready for Bank';
              } else {
                readinessStatus = 'Blocked (Unknown Method)';
                statusColor = '#e74c3c';
                riskLevel = 'High';
              }

              return (
                <tr key={ps.id} style={{ borderBottom: '1px solid var(--glass-border)', background: rowColor }}>
                  <td style={{ padding: '12px 8px' }}>{ps.payslipNumber || ps.id.substring(0,8)}</td>
                  <td style={{ padding: '12px 8px' }}>{ps.payrollPeriod?.payrollBatchNumber || 'N/A'}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <Link href={`/workers/${w.id}`} style={{ color: '#3498db', textDecoration: 'none' }}>
                      {w.firstName} {w.lastName}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 8px' }}>{w.payrollCategory}</td>
                  <td style={{ padding: '12px 8px' }}>{w.allowedPaymentMethod}</td>
                  <td style={{ padding: '12px 8px', fontWeight: 'bold' }}>₱{ps.netPay.toLocaleString()}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <span style={{ color: statusColor, fontWeight: 'bold' }}>{readinessStatus}</span>
                    {ps.paymentRemarks && <div style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '4px' }}>{ps.paymentRemarks}</div>}
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    {ps.paymentStatus === 'ON_HOLD' ? (
                      <button 
                        onClick={() => handleResolve(ps.id)}
                        disabled={loadingId === ps.id}
                        style={{ background: '#2ecc71', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Resolve Exception
                      </button>
                    ) : (
                      <button 
                        onClick={() => setShowHoldModal(ps.id)}
                        disabled={loadingId === ps.id}
                        style={{ background: '#e74c3c', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        Place on Hold
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {payslips.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                  No approved and locked payslips pending payment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showHoldModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1a1a1a', padding: '20px', borderRadius: '12px', width: '400px', border: '1px solid #333' }}>
            <h3>Hold Payslip Payment</h3>
            <p style={{ color: '#888' }}>Please provide a reason for holding this payment.</p>
            <input 
              type="text" 
              value={holdReason}
              onChange={e => setHoldReason(e.target.value)}
              placeholder="e.g. Disputed attendance, pending clearance"
              style={{ width: '100%', padding: '10px', background: '#000', color: '#fff', border: '1px solid #444', borderRadius: '6px', marginBottom: '15px' }}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => { setShowHoldModal(null); setHoldReason(''); }}
                style={{ background: 'transparent', color: '#fff', border: '1px solid #444', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={() => handleHold(showHoldModal)}
                style={{ background: '#e74c3c', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
              >
                Confirm Hold
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
