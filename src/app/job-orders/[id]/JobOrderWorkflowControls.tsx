// @ts-nocheck
'use client';

import React, { useState } from 'react';
import { updateJobOrderStatus, unlockJobOrder } from '@/app/actions/jobOrderActions';

interface JobOrderWorkflowControlsProps {
  jobOrderId: string;
  currentStatus: string;
  isLocked: boolean;
  canUnlock: boolean;
}

export default function JobOrderWorkflowControls({ jobOrderId, currentStatus, isLocked, canUnlock }: JobOrderWorkflowControlsProps) {
  const [status, setStatus] = useState(currentStatus);
  const [locked, setLocked] = useState(isLocked);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleUpdateStatus = async (newStatus: string) => {
    setLoading(true);
    setError('');
    const res = await updateJobOrderStatus(jobOrderId, newStatus);
    if (res.success) {
      setStatus(newStatus);
      if (newStatus === 'APPROVED') {
        setLocked(true);
      }
    } else {
      setError(res.error || 'Failed to update Job Order status');
    }
    setLoading(false);
  };

  const handleUnlock = async () => {
    setLoading(true);
    setError('');
    const res = await unlockJobOrder(jobOrderId);
    if (res.success) {
      setLocked(false);
      setStatus(res.data.status);
    } else {
      setError(res.error || 'Failed to unlock Job Order');
    }
    setLoading(false);
  };

  const steps = [
    { key: 'DRAFT', label: 'Draft', desc: 'Creation Stage' },
    { key: 'FOR_REVIEW', label: 'Checking', desc: 'Project Manager Review' },
    { key: 'FOR_FINANCIAL_REVIEW', label: 'Endorsement', desc: 'Project Director Approval' },
    { key: 'APPROVED', label: 'Approved', desc: 'Ready for Billings' }
  ];

  const getStepIndex = (s: string) => {
    if (s === 'DRAFT') return 0;
    if (s === 'FOR_REVIEW') return 1;
    if (s === 'FOR_FINANCIAL_REVIEW' || s === 'FOR_TECHNICAL_REVIEW') return 2;
    if (s === 'APPROVED' || s === 'ISSUED' || s === 'CANCELLED') return 3;
    return 0; // fallback
  };

  const currentStepIndex = getStepIndex(status);

  return (
    <div style={{
      backgroundColor: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '16px',
      padding: '24px',
      marginBottom: '24px',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.3)',
      color: '#f8fafc'
    }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: '700', letterSpacing: '-0.025em', color: '#38bdf8' }}>
        Job Order Approval Workflow
      </h3>
      <p style={{ margin: '0 0 24px 0', fontSize: '0.875rem', color: '#94a3b8' }}>
        Track and transition the approval state of this Job Order. Billings and accomplishments are only enabled once approved.
      </p>

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', borderRadius: '8px', fontSize: '0.875rem', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {/* TIMELINE VISUAL */}
      <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', marginBottom: '32px', padding: '0 10px' }}>
        {/* Timeline connecting line */}
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '40px',
          right: '40px',
          height: '4px',
          backgroundColor: '#334155',
          zIndex: 1
        }} />
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '40px',
          width: `${(currentStepIndex / 3) * 100}%`,
          maxRight: '40px',
          height: '4px',
          backgroundColor: '#0284c7',
          transition: 'all 0.5s ease',
          zIndex: 1
        }} />

        {steps.map((step, idx) => {
          const isCompleted = currentStepIndex > idx;
          const isActive = currentStepIndex === idx;
          
          return (
            <div key={step.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 2, flex: 1 }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: isCompleted ? '#0284c7' : (isActive ? '#0f172a' : '#1e293b'),
                border: `3px solid ${isCompleted || isActive ? '#38bdf8' : '#334155'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isCompleted ? '#fff' : (isActive ? '#38bdf8' : '#94a3b8'),
                fontWeight: 'bold',
                fontSize: '1rem',
                boxShadow: isActive ? '0 0 15px rgba(56, 189, 248, 0.4)' : 'none',
                transition: 'all 0.3s ease'
              }}>
                {isCompleted ? '✓' : idx + 1}
              </div>
              <div style={{ marginTop: '12px', fontWeight: isActive ? '700' : '500', fontSize: '0.875rem', color: isActive ? '#38bdf8' : (isCompleted ? '#cbd5e1' : '#64748b'), textAlign: 'center' }}>
                {step.label}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center', marginTop: '2px', maxWidth: '120px' }}>
                {step.desc}
              </div>
            </div>
          );
        })}
      </div>

      {/* ACTIONS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #334155', paddingTop: '20px' }}>
        <div>
          <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Current Status: </span>
          <strong style={{
            fontSize: '0.9rem',
            padding: '6px 14px',
            borderRadius: '999px',
            backgroundColor: currentStepIndex === 3 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
            color: currentStepIndex === 3 ? '#34d399' : '#fbbf24',
            border: currentStepIndex === 3 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
            marginLeft: '8px'
          }}>
            {status}
          </strong>

          {locked && (
            <strong style={{
              fontSize: '0.9rem',
              padding: '6px 14px',
              borderRadius: '999px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              marginLeft: '8px'
            }}>
              🔒 Locked
            </strong>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          {/* Locked / Unlock Controls */}
          {locked ? (
            canUnlock ? (
              <button
                onClick={handleUnlock}
                disabled={loading}
                style={{
                  padding: '10px 24px',
                  backgroundColor: '#ea580c',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '0.875rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
                  transition: 'all 0.2s'
                }}
              >
                {loading ? 'Unlocking...' : '🔓 Unlock Job Order (Authorized)'}
              </button>
            ) : (
              <span style={{
                fontSize: '0.85rem',
                color: '#94a3b8',
                padding: '10px 20px',
                backgroundColor: 'rgba(51, 65, 85, 0.5)',
                borderRadius: '8px',
                border: '1px solid #334155'
              }}>
                🔒 Locked: PM / PD authorization required to edit
              </span>
            )
          ) : (
            <>
              {/* Simulation bypass button */}
              {currentStepIndex < 3 && (
                <button
                  onClick={() => handleUpdateStatus('APPROVED')}
                  disabled={loading}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    color: '#38bdf8',
                    border: '1px dashed #38bdf8',
                    borderRadius: '8px',
                    fontWeight: '600',
                    fontSize: '0.875rem',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    opacity: loading ? 0.7 : 1
                  }}
                >
                  ⚡ Fast Approve (Simulate)
                </button>
              )}

              {/* Regular Workflow Action Buttons */}
              {status === 'DRAFT' && (
                <button
                  onClick={() => handleUpdateStatus('FOR_REVIEW')}
                  disabled={loading}
                  style={{
                    padding: '10px 24px',
                    backgroundColor: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '600',
                    fontSize: '0.875rem',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
                    transition: 'all 0.2s'
                  }}
                >
                  {loading ? 'Processing...' : 'Endorse to PM for Checking ➔'}
                </button>
              )}

              {status === 'FOR_REVIEW' && (
                <button
                  onClick={() => handleUpdateStatus('FOR_FINANCIAL_REVIEW')}
                  disabled={loading}
                  style={{
                    padding: '10px 24px',
                    backgroundColor: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '600',
                    fontSize: '0.875rem',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
                    transition: 'all 0.2s'
                  }}
                >
                  {loading ? 'Processing...' : 'Endorse to PD for Final Approval ➔'}
                </button>
              )}

              {status === 'FOR_FINANCIAL_REVIEW' && (
                <button
                  onClick={() => handleUpdateStatus('APPROVED')}
                  disabled={loading}
                  style={{
                    padding: '10px 24px',
                    backgroundColor: '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '600',
                    fontSize: '0.875rem',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
                    transition: 'all 0.2s'
                  }}
                >
                  {loading ? 'Processing...' : 'Grant Final Approval ✓'}
                </button>
              )}

              {currentStepIndex === 3 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#34d399',
                  fontWeight: '600',
                  fontSize: '0.875rem',
                  padding: '10px 20px',
                  backgroundColor: 'rgba(52, 211, 153, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid rgba(52, 211, 153, 0.2)'
                }}>
                  <span>✓ Unlocked: Job Order is editable</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
