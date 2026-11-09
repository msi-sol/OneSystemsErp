'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { reviewProjectAccomplishment } from '@/app/actions/projectAccomplishmentActions';
import { askConfirm, askText } from '@/lib/ui/dialogs';

export default function AccomplishmentReviewButtons({ accomplishmentId }: { accomplishmentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'APPROVE' | 'REJECT' | null>(null);

  const review = async (decision: 'APPROVE' | 'REJECT') => {
    let remarks: string | undefined;
    if (decision === 'REJECT') {
      const reason = await askText('Reason for rejecting this accomplishment:', { required: true, confirmLabel: 'Reject', danger: true });
      if (reason === null) return;
      remarks = reason;
    } else if (!(await askConfirm('Approve this accomplishment? Approved accomplishments become available for progress billing.', { confirmLabel: 'Approve' }))) {
      return;
    }

    setBusy(decision);
    try {
      const res = await reviewProjectAccomplishment(accomplishmentId, decision, remarks);
      if (!res.success) throw new Error(res.error);
      toast.success(decision === 'APPROVE' ? 'Accomplishment approved.' : 'Accomplishment rejected.');
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || 'Review failed.');
    } finally {
      setBusy(null);
    }
  };

  const base = { border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 } as const;
  return (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
      <button type="button" disabled={!!busy} onClick={() => review('APPROVE')} style={{ ...base, background: '#10b981', color: '#fff' }}>
        {busy === 'APPROVE' ? 'Approving…' : 'Approve'}
      </button>
      <button type="button" disabled={!!busy} onClick={() => review('REJECT')} style={{ ...base, background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)' }}>
        {busy === 'REJECT' ? 'Rejecting…' : 'Reject'}
      </button>
    </div>
  );
}
