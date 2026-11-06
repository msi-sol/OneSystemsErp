'use client';

import { useTransition, useState } from 'react';
import { updatePOStatus } from '@/app/actions/poUpdates';
import { approvePurchaseOrder, submitPOForApproval } from '@/app/actions/poActions';
import PermissionGuard from '@/components/PermissionGuard';

interface Props {
  poId: string;
  status: string;
  currentUser: { id: string; name: string | null; role: string } | null;
  permissions: Record<string, any>;
}

export default function POWorkflowButtons({ poId, status, currentUser, permissions }: Props) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleStatusUpdate(newStatus: string) {
    if (!currentUser?.id) return;
    setErrorMsg(null);
    startTransition(async () => {
      await updatePOStatus(poId, newStatus);
    });
  }

  function handleApprove() {
    if (!currentUser?.id) return;
    setErrorMsg(null);
    startTransition(async () => {
      try {
        const res = await approvePurchaseOrder(poId) as any;
        if (!res.success && res.error) {
           setErrorMsg(res.error);
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Workflow Engine Blocked Action');
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
      </div>
    </div>
  );
}
