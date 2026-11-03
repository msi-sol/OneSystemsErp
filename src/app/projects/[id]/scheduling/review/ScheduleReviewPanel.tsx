'use client';

import React, { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function ScheduleReviewPanel({ schedule, projectId, actor, boqLocked = true }: { schedule: any, projectId: string, actor?: any, boqLocked?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [comments, setComments] = useState('');
  const idempotencyKeyRef = useRef<string | null>(null);

  const status = schedule.workflowStatus || schedule.status;

  const approvals = schedule.approvals || [];
  const currentRoundApprovals = approvals.filter((a: any) => a.reviewRound === schedule.reviewRound);
  const hasTechnicalApproval = currentRoundApprovals.some((a: any) => a.approvalStage === 'TECHNICAL');
  const hasFinanceApproval = currentRoundApprovals.some((a: any) => a.approvalStage === 'FINANCE');

  const isCanonicalDirector = actor?.role === 'DIRECTORS' || actor?.role === 'PROJECT_DIRECTOR';
  const isFinanceOfficer = actor?.role === 'FINANCE_OFFICER';

  const handleAction = async (actionUrl: string, bodyData: any = {}) => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/scheduling/${schedule.id}/${actionUrl}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedRowVersion: schedule.rowVersion, ...bodyData })
        });
        const data = await res.json();
        if (!res.ok) {
          if (actionUrl === 'baseline/activate' && [400, 403].includes(res.status)) {
            idempotencyKeyRef.current = null;
          }
          const errMsg = data.errors && data.errors.length > 0 
            ? `${data.error}: ${data.errors.join(', ')}`
            : data.error || 'Action failed';
          throw new Error(errMsg);
        }
        if (actionUrl === 'baseline/activate') {
          idempotencyKeyRef.current = null;
        }
        router.refresh();
      } catch (err: any) {
        alert(err.message);
      }
    });
  };

  const renderActions = () => {
    switch (status) {
      case 'AI_GENERATED_DRAFT':
      case 'TECHNICAL_REVISIONS_REQUIRED':
      case 'INVALID_GENERATED_DRAFT':
      case 'DRAFT':
        return (
          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button 
              onClick={() => handleAction('review/validate')}
              disabled={isPending || !boqLocked}
              className="btn btn-primary"
            >
              Validate & Request Review
            </button>
          </div>
        );

      case 'READY_FOR_REVIEW':
        return (
          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button 
              onClick={() => handleAction('review/start')}
              disabled={isPending}
              className="btn btn-primary"
            >
              Start Technical Review
            </button>
          </div>
        );

      case 'UNDER_TECHNICAL_REVIEW':
        return (
          <div style={{ marginTop: '15px' }}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <button 
                onClick={() => handleAction('review/comments')}
                disabled={isPending}
                className="btn btn-primary"
              >
                Add Required Review Comments
              </button>
              <button 
                onClick={() => handleAction('review/finance')}
                disabled={isPending}
                className="btn btn-info"
              >
                Add Financial Review Comment
              </button>
            </div>
            <textarea 
              value={comments} 
              onChange={e => setComments(e.target.value)} 
              placeholder="Review comments / reasons"
              style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '4px', background: 'rgba(0,0,0,0.2)', color: 'white', border: '1px solid var(--glass-border)' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => handleAction('review/approve', { comments })}
                disabled={isPending || !comments}
                className="btn btn-success"
              >
                Approve Technically
              </button>
              <button 
                onClick={() => handleAction('review/return', { reason: comments })}
                disabled={isPending || !comments}
                className="btn btn-warning"
              >
                Return for Revision
              </button>
              <button 
                onClick={() => handleAction('review/reject', { reason: comments })}
                disabled={isPending || !comments}
                className="btn btn-danger"
              >
                Reject Schedule
              </button>
            </div>
          </div>
        );

      case 'TECHNICALLY_APPROVED':
        return (
          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            {hasTechnicalApproval && !hasFinanceApproval && isFinanceOfficer && (
              <button 
                onClick={() => handleAction('review/finance-approve')}
                disabled={isPending}
                className="btn btn-info"
              >
                Approve Financially
              </button>
            )}
            
            {isCanonicalDirector && hasTechnicalApproval && hasFinanceApproval && (
              <button 
                onClick={() => handleAction('baseline/submit')}
                disabled={isPending}
                className="btn btn-primary"
              >
                Submit for Baseline Approval
              </button>
            )}
          </div>
        );

      case 'PENDING_BASELINE_APPROVAL':
        return (
          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button 
              onClick={() => {
                if (!idempotencyKeyRef.current) {
                  idempotencyKeyRef.current = crypto.randomUUID();
                }
                handleAction('baseline/activate', { idempotencyKey: idempotencyKeyRef.current });
              }}
              disabled={isPending}
              className="btn btn-success"
            >
              Activate Baseline
            </button>
          </div>
        );

      case 'ACTIVE_BASELINE':
        return (
          <div style={{ marginTop: '15px' }}>
            <div style={{ color: '#10b981', fontWeight: 'bold', marginBottom: '15px' }}>
              This schedule is an active, immutable baseline. No further mutations are permitted.
            </div>
          </div>
        );

      default:
        return <div>Current status: {status}</div>;
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', margin: '20px 0', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
      <h3 style={{ color: 'var(--accent-color)', marginTop: 0 }}>Workflow Actions</h3>
      {!boqLocked && <p>Approve and lock the BOQ in <a href={`/projects/${projectId}?tab=awarded-boq`} style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}>Contract Value &amp; BOQ</a> before submitting this plan for review.</p>}
      <div style={{ fontSize: '0.9rem', marginBottom: '10px', color: 'var(--text-secondary)' }}>
        Row Version: {schedule.rowVersion} | Revision: {schedule.revisionCode || 'N/A'} | Review Round: {schedule.reviewRound}
      </div>
      {renderActions()}
    </div>
  );
}
