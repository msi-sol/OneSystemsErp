'use client';

import { useState, useTransition } from 'react';
import { updateMRStatus, runMRFAIValidation } from '@/app/actions/mutations';
import AiThinking, { AI_THINKING_MESSAGES } from '@/components/ai/AiThinking';

interface Props {
  mrId: string;
  status: string;
  capabilities: Record<string, boolean>;
  currentUser: { id: string; name: string | null; role: string } | null;
}

export default function MRWorkflowButtons({ mrId, status, currentUser, capabilities }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);

  const role = currentUser?.role || '';
  if (role === 'GUEST_USER') return null;


  function handleAIValidation() {
    setAiRunning(true);
    startTransition(async () => {
      setError('');
      try { await runMRFAIValidation(mrId); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The request could not be checked.'); }
      finally { setAiRunning(false); }
    });
  }

  function handleStatusUpdate(newStatus: string) {
    if (!currentUser?.id) return;
    startTransition(async () => {
      setError('');
      try { await updateMRStatus(mrId, newStatus); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The request status could not be changed.'); }
    });
  }

  return (
    <div style={{ marginTop: '10px' }}>
      {error && <p role="alert" style={{ color: '#fca5a5', marginBottom: 12 }}>{error}</p>}
      {/* Submit only appears after the check, so say so instead of leaving the draft looking stuck. */}
      {status === 'DRAFT' && <p style={{ color: 'var(--text-secondary)', margin: '0 0 10px', fontSize: '0.9rem' }}>Next: run the AI check. The “Submit for Review” button appears once it finishes.</p>}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        
        {/* Preparation Phase - Materials Engineer */}
        {status === 'DRAFT' && (
          <button onClick={handleAIValidation} disabled={isPending || !(capabilities.canEditDraft || capabilities.canSubmit)} className="btn-ai" title="Requires configured material-request preparation permission">
            {aiRunning ? 'Checking…' : '🤖 Run AI Check'}
          </button>
        )}

        {(status === 'AI_CHECKING' || status === 'RETURNED') && (
          <>
            <button onClick={handleAIValidation} disabled={isPending || !(capabilities.canEditDraft || capabilities.canSubmit)} className="btn-ai" title="Requires configured material-request preparation permission">
              {aiRunning ? 'Checking…' : '🤖 Re-run AI Check'}
            </button>
            <button onClick={() => handleStatusUpdate('SUBMITTED')} disabled={isPending || !capabilities.canSubmit} className="btn-primary" title="Requires configured material-request preparation permission">
              {isPending && !aiRunning ? 'Submitting...' : '📤 Submit for Review'}
            </button>
          </>
        )}

        {/* Checking Phase - Cost Control */}
        {status === 'SUBMITTED' && (
          <>
            <button onClick={() => handleStatusUpdate('FOR_REVIEW')} disabled={isPending || !capabilities.canReview} className="btn-primary" title="Requires configured material-request review permission">
              {isPending ? 'Processing...' : '🔍 Mark as Checked (Cost Control)'}
            </button>
            <button onClick={() => handleStatusUpdate('RETURNED')} disabled={isPending || !capabilities.canReturnForCorrection} className="btn-danger" title="Requires configured material-request review permission">
              {isPending ? 'Processing...' : '↩️ Return to Preparer'}
            </button>
          </>
        )}

        {/* Approval Phase - Project Manager */}
        {status === 'FOR_REVIEW' && (
          <>
            <button onClick={() => handleStatusUpdate('APPROVED')} disabled={isPending || !capabilities.canApprove} className="btn-success" title="Requires configured material-request approval permission">
              {isPending ? 'Approving...' : '✅ Approve MRF'}
            </button>
            <button onClick={() => handleStatusUpdate('REJECTED')} disabled={isPending || !capabilities.canReject} className="btn-danger" title="Requires configured material-request approval permission">
              {isPending ? 'Rejecting...' : '❌ Reject MRF'}
            </button>
          </>
        )}
        {/* Cancelling is final (it releases the reserved allowance), so it takes a second click. */}
        {capabilities.canCancel && ['DRAFT','AI_CHECKING','SUBMITTED','FOR_REVIEW','RETURNED','APPROVED'].includes(status) && <>
          <button className="btn-danger" disabled={isPending} onClick={() => { if (confirmCancel) { setConfirmCancel(false); handleStatusUpdate('CANCELLED'); } else setConfirmCancel(true); }}>{confirmCancel ? 'Confirm: cancel this request' : 'Cancel request'}</button>
          {confirmCancel && <button type="button" disabled={isPending} onClick={() => setConfirmCancel(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>Keep request</button>}
        </>}
      </div>
      {aiRunning && <AiThinking messages={AI_THINKING_MESSAGES.materialRequest} />}

      <style>{`
        .btn-ai {
          background: linear-gradient(135deg, #8b5cf6, #a855f7);
          color: white; border: none; padding: 10px 20px;
          border-radius: 8px; font-weight: bold; cursor: pointer;
          box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);
          transition: all 0.2s;
        }
        .btn-ai:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(139, 92, 246, 0.6); }
        .btn-ai:disabled { opacity: 0.7; cursor: not-allowed; }

        .btn-primary {
          background-color: var(--accent-color);
          color: #000; border: none; padding: 10px 20px;
          border-radius: 8px; font-weight: bold; cursor: pointer;
          box-shadow: 0 4px 15px rgba(0, 255, 163, 0.3);
          transition: all 0.2s;
        }
        .btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0, 255, 163, 0.5); }
        .btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }

        .btn-success {
          background-color: #22c55e;
          color: white; border: none; padding: 10px 20px;
          border-radius: 8px; font-weight: bold; cursor: pointer;
          box-shadow: 0 4px 15px rgba(34, 197, 94, 0.3);
          transition: all 0.2s;
        }
        .btn-success:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(34, 197, 94, 0.5); }
        .btn-success:disabled { opacity: 0.7; cursor: not-allowed; }

        .btn-danger {
          background-color: transparent;
          border: 1px solid #ef4444; color: #ef4444;
          padding: 10px 20px; border-radius: 8px; font-weight: bold; cursor: pointer;
          transition: all 0.2s;
        }
        .btn-danger:hover:not(:disabled) { background-color: rgba(239, 68, 68, 0.1); }
        .btn-danger:disabled { opacity: 0.7; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
