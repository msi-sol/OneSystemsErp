'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { approveDelivery, rejectDelivery } from '@/app/actions/deliveryActions';
import styles from '../../projects/page.module.css';
import PermissionGuard from '@/components/PermissionGuard';

export default function DeliveryWorkflowButtons({ 
  deliveryId, 
  status, 
  permissions 
}: { 
  deliveryId: string; 
  status: string; 
  permissions: Record<string, unknown>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  // In-page two-step confirmation (like the other approval screens) instead of a browser confirm() pop-up.
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const handleReject = () => {
    if (!rejecting) { setRejecting(true); setConfirming(false); return; }
    if (rejectReason.trim().length < 5) { setError('Give a reason of at least 5 characters for rejecting this delivery.'); return; }
    setError('');
    startTransition(async () => {
      const res = await rejectDelivery(deliveryId, rejectReason.trim());
      if (res.success) { setRejecting(false); router.refresh(); } else setError(res.error || 'Failed to reject delivery.');
    });
  };

  const handleApprove = () => {
    if (!confirming) { setConfirming(true); return; }
    setConfirming(false);
    setError('');
    startTransition(async () => {
      try {
        const res = await approveDelivery(deliveryId) as { success?: boolean; error?: string };
        if (res.success) {
          router.refresh();
        } else {
          setError(res.error || 'Failed to approve delivery.');
        }
      } catch (err: unknown) {
        setError(err instanceof Error && err.message ? err.message : 'Failed to approve delivery.');
      }
    });
  };

  if (status !== 'FOR_ACCOUNTANT_APPROVAL') return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
      <PermissionGuard permissions={permissions} moduleName="DELIVERY_RECEIVING" action="canApprove">
        <button 
          onClick={handleApprove}
          disabled={isPending}
          className={styles.primaryButton}
          style={{ 
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            opacity: isPending ? 0.7 : 1 
          }}
        >
          {isPending ? 'Approving...' : confirming ? '✓ Confirm approval' : '✓ Approve Delivery'}
        </button>
        {confirming && <button type="button" onClick={() => setConfirming(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>}
        <button type="button" onClick={handleReject} disabled={isPending} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '8px 16px', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>
          {rejecting ? 'Confirm rejection' : 'Reject delivery'}
        </button>
        {rejecting && <>
          <label htmlFor="delivery-reject-reason" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Reason (e.g. wrong quantity encoded)</label>
          <textarea id="delivery-reject-reason" value={rejectReason} onChange={event => setRejectReason(event.target.value)} rows={2} maxLength={500} style={{ width: 320, padding: 8, borderRadius: 8, background: 'rgba(0,0,0,0.3)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }} />
          <button type="button" onClick={() => { setRejecting(false); setRejectReason(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>Keep delivery</button>
        </>}
      </PermissionGuard>
      {confirming && <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: 360, textAlign: 'right' }}>Approving officially records the delivered quantities.</div>}
      {error && <div style={{ color: '#ef4444', fontSize: '0.9rem' }}>{error}</div>}
    </div>
  );
}
