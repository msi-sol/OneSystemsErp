'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { reviewDirectExpense } from '@/app/actions/financeActions';
import { askConfirm, askText } from '@/lib/ui/dialogs';

/** Approve or reject a logged expense. Approval counts it as project cost (actual-cost ledger). */
export default function ExpenseReviewButtons({ expenseId }: { expenseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const review = async (decision: 'APPROVE' | 'REJECT') => {
    let remarks: string | undefined;
    if (decision === 'REJECT') {
      const reason = await askText('Reason for rejecting this expense:', { required: true, confirmLabel: 'Reject', danger: true });
      if (reason === null) return;
      remarks = reason;
    } else if (!(await askConfirm('Approve this expense? It will be counted as project actual cost.', { confirmLabel: 'Approve' }))) {
      return;
    }
    setBusy(true); setError('');
    const res = await reviewDirectExpense(expenseId, decision, remarks);
    setBusy(false);
    if (!res.success) { setError(res.error || 'The expense could not be reviewed.'); return; }
    router.refresh();
  };

  return <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
    <button type="button" disabled={busy} onClick={() => void review('APPROVE')} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>{busy ? 'Saving…' : 'Approve expense'}</button>
    <button type="button" disabled={busy} onClick={() => void review('REJECT')} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.12)', color: '#f87171', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>Reject</button>
    {error && <span role="alert" style={{ color: '#fca5a5', fontSize: '0.9rem' }}>{error}</span>}
  </div>;
}
