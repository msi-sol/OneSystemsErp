'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { returnPOToCanvassing, updatePOStatus } from '@/app/actions/poUpdates';
import { approvePurchaseOrder, submitPOForApproval } from '@/app/actions/poActions';
import PermissionGuard from '@/components/PermissionGuard';

interface Props {
  poId: string;
  status: string;
  currentUser: { id: string; name: string | null; role: string } | null;
  permissions: Record<string, unknown>;
  /** The PO came from a canvass, so it can be sent back for further canvassing while still a draft or under review. */
  canvassFormId?: string | null;
}

export default function POWorkflowButtons({ poId, status, currentUser, permissions, canvassFormId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [returnReason, setReturnReason] = useState('');

  function handleStatusUpdate(newStatus: string) {
    if (!currentUser?.id) return;
    setErrorMsg(null);
    startTransition(async () => {
      try { await updatePOStatus(poId, newStatus); router.refresh(); }
      catch (cause) { setErrorMsg(cause instanceof Error ? cause.message : 'The purchase order status could not be changed.'); }
    });
  }

  function handleReturnToCanvassing() {
    if (!currentUser?.id) return;
    if (returnReason.trim().length < 5) { setErrorMsg('Give a reason of at least 5 characters for returning this order to canvassing.'); return; }
    setErrorMsg(null);
    startTransition(async () => {
      const result = await returnPOToCanvassing(poId, returnReason.trim());
      if (!result.success) { setErrorMsg(result.error || 'The order could not be returned to canvassing.'); return; }
      router.push(result.canvassFormId ? `/procurement/canvassing/${result.canvassFormId}` : '/procurement/canvassing');
    });
  }

  function handleApprove() {
    if (!currentUser?.id) return;
    setErrorMsg(null);
    startTransition(async () => {
      try {
        const res = await approvePurchaseOrder(poId) as { success?: boolean; error?: string };
        if (!res.success && res.error) {
           setErrorMsg(res.error);
        }
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error && err.message ? err.message : 'Workflow Engine Blocked Action');
      }
    });
  }

  function handleSubmit() {
    if (!currentUser?.id) return;
    setErrorMsg(null);
    startTransition(async () => {
      try {
        const result = await submitPOForApproval(poId);
        if (!result.success) setErrorMsg(result.error || 'The purchase order could not be submitted.');
      } catch (cause) { setErrorMsg(cause instanceof Error ? cause.message : 'The purchase order could not be submitted.'); }
    });
  }

  return (
    <div style={{ marginTop: '10px' }}>
      {errorMsg && (
        <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '8px' }}>
          <strong>Action Blocked:</strong> {errorMsg}
        </div>
      )}
      
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        
        {/* Approval Phase */}
        {status === 'DRAFT' && <PermissionGuard permissions={permissions} moduleName="PURCHASE_ORDER" action="canSubmit">
          <button onClick={handleSubmit} disabled={isPending} style={{ backgroundColor: 'var(--accent-color)', color: '#000', padding: '10px 20px', border: 0, borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            {isPending ? 'Submitting…' : 'Submit PO for Review'}
          </button>
        </PermissionGuard>}
        {status === 'FOR_REVIEW' && (
          <>
            <PermissionGuard permissions={permissions} moduleName="PURCHASE_ORDER" action="canApprove">
              <button onClick={handleApprove} disabled={isPending} style={{ backgroundColor: '#00ffa3', color: '#000', padding: '10px 20px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', opacity: isPending ? 0.5 : 1 }} title="Requires canApprove Permission">
                {isPending ? 'Processing...' : '✅ Approve PO'}
              </button>
            </PermissionGuard>

            <PermissionGuard permissions={permissions} moduleName="PURCHASE_ORDER" action="canApprove">
              <button onClick={() => handleStatusUpdate('DRAFT')} disabled={isPending} style={{ backgroundColor: '#ef4444', color: '#fff', padding: '10px 20px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', opacity: isPending ? 0.5 : 1 }} title="Requires canApprove Permission">
                {isPending ? 'Rejecting...' : '❌ Reject PO'}
              </button>
            </PermissionGuard>
          </>
        )}

        {/* Proceed, or send back for further canvassing (e.g. a quote is over budget or a better supplier is expected). */}
        {canvassFormId && (status === 'DRAFT' || status === 'FOR_REVIEW') && (
          <PermissionGuard permissions={permissions} moduleName="PURCHASE_ORDER" action="canApprove">
            <button onClick={() => (returning ? handleReturnToCanvassing() : setReturning(true))} disabled={isPending} style={{ background: 'transparent', color: '#f59e0b', border: '1px solid #f59e0b', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', opacity: isPending ? 0.5 : 1 }} title="Requires canApprove Permission">
              {isPending && returning ? 'Returning…' : returning ? '↩ Confirm return to canvassing' : '↩ Return to canvassing'}
            </button>
          </PermissionGuard>
        )}
      </div>
      {returning && (
        <div style={{ marginTop: 12, display: 'grid', gap: 8, maxWidth: 520, marginLeft: 'auto' }}>
          <label htmlFor="po-return-reason" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Reason for further canvassing (kept in the audit trail)</label>
          <textarea id="po-return-reason" value={returnReason} onChange={event => setReturnReason(event.target.value)} rows={2} maxLength={500} placeholder="e.g. Quoted rate is above the benchmark; get more supplier quotes" style={{ padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.3)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }} />
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>This order is set aside and the canvass reopens so quotations can be added or corrected and a new recommendation approved.</p>
          <button type="button" onClick={() => { setReturning(false); setReturnReason(''); }} style={{ justifySelf: 'end', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
        </div>
      )}
    </div>
  );
}
