'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { generatePaymentBatch } from '@/app/actions/paymentBatchActions';
import { createFundingRequest } from '@/app/actions/fundingActions';

export default function BatchGeneratorClient({ periods, accounts }: { periods: any[], accounts: any[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    periodId: '',
    paymentMethodType: 'GCASH',
    accountId: ''
  });

  const [shortageAmount, setShortageAmount] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setShortageAmount(null);
    
    const res = await generatePaymentBatch(
      formData.periodId, 
      formData.paymentMethodType, 
      formData.accountId, 
      'admin-user' // Hardcoded for demo
    );
    
    setLoading(false);
    
    if (res.success) {
      alert('Payment Batch generated successfully!');
      router.push(`/finance/payment-batches/${res.batchId}`);
    } else {
      if (res.shortage) {
        setShortageAmount(res.shortage);
      } else {
        alert('Error: ' + res.error);
      }
    }
  };

  const handleRequestFunding = async () => {
    if (!shortageAmount || !formData.accountId) return;
    setLoading(true);
    const res = await createFundingRequest(
      formData.accountId,
      shortageAmount,
      `Insufficient funds for ${formData.paymentMethodType} batch`,
      'admin-user',
      formData.periodId
    );
    setLoading(false);
    if (res.success) {
      alert('Funding Request generated successfully! Please approve it in the Payroll Bank Account dashboard.');
      router.push(`/finance/payroll-accounts/${formData.accountId}`);
    } else {
      alert(res.error);
    }
  };

  return (
    <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '30px', border: '1px solid var(--glass-border)' }}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Locked Payroll Period</label>
          <select 
            required 
            value={formData.periodId} 
            onChange={e => setFormData({...formData, periodId: e.target.value})}
            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
          >
            <option value="">Select a period...</option>
            {periods.map(p => (
              <option key={p.id} value={p.id}>
                {new Date(p.startDate).toLocaleDateString()} to {new Date(p.endDate).toLocaleDateString()} (Batch: {p.payrollBatchNumber})
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Target Payment Method</label>
          <select 
            required 
            value={formData.paymentMethodType} 
            onChange={e => setFormData({...formData, paymentMethodType: e.target.value})}
            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
          >
            <option value="GCASH">GCash</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
          </select>
        </div>

        <div style={{ marginBottom: '30px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Funding Account</label>
          <select 
            required 
            value={formData.accountId} 
            onChange={e => setFormData({...formData, accountId: e.target.value})}
            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
          >
            <option value="">Select a funding account...</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.bankName} - {a.accountNumber} (Available: ₱{a.currentAvailableBalance.toLocaleString()})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
          <button 
            type="button" 
            onClick={() => router.back()} 
            style={{ padding: '12px 24px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'transparent', color: '#fff', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={loading}
            style={{ padding: '12px 24px', borderRadius: '8px', border: 'none', background: 'var(--accent-color)', color: '#000', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Processing...' : 'Generate Batch'}
          </button>
        </div>
      </form>

      {shortageAmount !== null && (
        <div style={{ marginTop: '20px', padding: '20px', background: 'rgba(231, 76, 60, 0.1)', border: '1px solid #e74c3c', borderRadius: '8px' }}>
          <h3 style={{ color: '#e74c3c', marginTop: 0 }}>Insufficient Funds</h3>
          <p>The selected account does not have enough available balance to cover this payroll batch.</p>
          <p style={{ fontWeight: 'bold', fontSize: '1.2rem', margin: '15px 0' }}>Shortage Amount: ₱ {shortageAmount.toLocaleString()}</p>
          <button 
            onClick={handleRequestFunding}
            disabled={loading}
            style={{ background: '#e74c3c', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Create Funding Request for ₱ {shortageAmount.toLocaleString()}
          </button>
        </div>
      )}
    </div>
  );
}
