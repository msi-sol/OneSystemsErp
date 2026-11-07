'use client';
import { materialStock } from '@/lib/procurement/material-values';
import styles from './issuance.module.css';
import { returnableMaterials } from '@/lib/procurement/material-returns';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { processIssuanceSlip, approveIssuanceSlip, rejectIssuanceSlip } from '../actions/issuanceActions';
import CreateReturnModal from './CreateReturnModal';

export default function IssuanceDetailsModal({ issuance, users, onClose }: { issuance: any, users: any[], onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  
  // Track quantities entered by warehouseman
  const [items, setItems] = useState(issuance.items.map((i: any) => ({
    ...i,
    releasedQty: issuance.status === 'PENDING' ? (i.releasedQty || i.requestedQty) : (i.releasedQty ?? 0)
  })));

  const updateItemQty = (index: number, value: number) => {
    const newItems = [...items];
    newItems[index].releasedQty = value;
    setItems(newItems);
  };

  const handleProcess = async () => {
    // Simulated logged in user logic (In real app, get from session)
    // Here we just pick the first warehouseman or use a dummy
    const warehouseman = users.find(u => u.role === 'WAREHOUSEMAN' || u.role === 'STOCKMAN') || users[0];
    
    // Validate
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const available = materialStock(item.consolidatedBoqItem);
      if (item.releasedQty > available) {
        setError(`Cannot process: ${item.consolidatedBoqItem.description} has only ${available} available.`);
        return;
      }
      if (item.releasedQty < 0) {
        setError('Released quantity cannot be negative.');
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      const res = await processIssuanceSlip(issuance.id, warehouseman.id, items);
      if (res.success) { router.refresh(); onClose(); }
      else setError(res.error || 'Failed to process');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to process');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    // Simulated accountant
    const accountant = users.find(u => u.role === 'PROJECT_ACCOUNTANT' || u.role === 'ACCOUNTANT') || users[0];
    
    setLoading(true);
    setError('');

    try {
      const res = await approveIssuanceSlip(issuance.id, accountant.id);
      if (res.success) { router.refresh(); onClose(); }
      else setError(res.error || 'Failed to approve');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to approve');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await rejectIssuanceSlip(issuance.id, users[0].id);
      if (res.success) { router.refresh(); onClose(); }
      else setError(res.error || 'Failed to reject');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to reject');
    } finally {
      setLoading(false);
    }
  };

  const isPending = issuance.status === 'PENDING';
  const isProcessed = issuance.status === 'PROCESSED';

  return (
    <div className={styles.overlay} style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(10, 15, 26, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Material Issuance Details" style={{
        background: 'var(--bg-secondary)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '1200px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div className={styles.dialogHeader} style={{
          padding: '25px 35px',
          borderBottom: '1px solid var(--glass-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(0,0,0,0.2)'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.8rem', color: '#fff', fontWeight: '700', letterSpacing: '-0.02em' }}>
              Material Issuance Details: {issuance.misNumber}
            </h2>
            <div style={{ marginTop: '10px' }}>
              <span style={{ 
                padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold',
                background: ['RELEASED', 'COMPLETED'].includes(issuance.status) ? 'rgba(0,255,163,0.1)' : 'rgba(255,255,255,0.05)',
                color: ['RELEASED', 'COMPLETED'].includes(issuance.status) ? '#00ffa3' : '#fff',
                border: ['RELEASED', 'COMPLETED'].includes(issuance.status) ? '1px solid rgba(0,255,163,0.2)' : '1px solid var(--glass-border)'
              }}>
                {issuance.status}
              </span>
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '5px',
              transition: 'color 0.2s'
            }}
            onMouseOver={e => e.currentTarget.style.color = '#fff'}
            onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            ✕
          </button>
        </div>

        <div className={styles.dialogBody} style={{ padding: '35px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
          {error && (
            <div style={{ 
              background: 'rgba(255, 107, 107, 0.1)', 
              borderLeft: '4px solid #ff6b6b', 
              color: '#ff6b6b', 
              padding: '15px 20px', 
              borderRadius: '0 8px 8px 0',
              fontWeight: '500'
            }}>
              {error}
            </div>
          )}

          <div className={styles.facts} style={{ background: 'rgba(0,0,0,0.15)', padding: '25px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <div>
              <p style={{ margin: '0 0 5px', color: 'var(--accent-color)', fontSize: '0.85rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Project</p>
              <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem', color: '#fff' }}>{issuance.project.name}</p>
            </div>
            <div>
              <p style={{ margin: '0 0 5px', color: 'var(--accent-color)', fontSize: '0.85rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Requested By</p>
              <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem', color: '#fff' }}>{issuance.foreman?.name || 'Unknown'}</p>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <p style={{ margin: '0 0 5px', color: 'var(--accent-color)', fontSize: '0.85rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activity / Purpose</p>
              <p style={{ margin: 0, color: '#fff', fontSize: '1.05rem', background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.1)' }}>{issuance.activity}</p>
            </div>
          </div>

          <div>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '1.3rem', color: '#fff', fontWeight: '600', borderBottom: '2px solid var(--glass-border)', paddingBottom: '10px' }}>Requested Materials</h3>
            <div className={styles.tableScroll} role="region" aria-label="Requested materials" tabIndex={0} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '15px' }}>Material</th>
                    <th style={{ padding: '15px' }}>Unit</th>
                    <th style={{ padding: '15px' }}>Available</th>
                    <th style={{ padding: '15px' }}>Requested</th>
                    <th style={{ padding: '15px' }}>To Release</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any, index: number) => {
                    const boq = item.consolidatedBoqItem;
                    const available = materialStock(boq);
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '15px' }}>{boq.category ? `[${boq.category}] ` : ''}{boq.description}</td>
                        <td style={{ padding: '15px', color: 'var(--text-secondary)' }}>{boq.unit}</td>
                        <td style={{ padding: '15px', color: available < item.requestedQty ? '#ff6b6b' : '#00ffa3', fontWeight: 'bold' }}>{available}</td>
                        <td style={{ padding: '15px', fontWeight: 'bold' }}>{item.requestedQty}</td>
                        <td style={{ padding: '15px' }}>
                          {isPending ? (
                            <input 
                              type="number" 
                              step="any"
                              value={item.releasedQty} 
                              onChange={(e) => updateItemQty(index, parseFloat(e.target.value) || 0)}
                              style={{ 
                                width: '100px', 
                                padding: '10px 15px', 
                                borderRadius: '6px', 
                                background: 'rgba(0,0,0,0.3)', 
                                border: '1px solid var(--glass-border)', 
                                color: '#fff', 
                                outline: 'none',
                                fontWeight: 'bold'
                              }}
                            />
                          ) : (
                            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{item.releasedQty}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Workflow Info */}
          {(issuance.warehouseman || issuance.accountant) && (
            <div style={{ display: 'flex', gap: '30px', fontSize: '0.9rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.2)', padding: '15px 20px', borderRadius: '8px', borderLeft: '3px solid var(--accent-color)' }}>
              {issuance.warehouseman && (
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Processed By</span>
                  <strong style={{ color: '#fff' }}>{issuance.warehouseman.name}</strong>
                </div>
              )}
              {issuance.accountant && (
                <div>
                  <span style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Approved By</span>
                  <strong style={{ color: '#fff' }}>{issuance.accountant.name}</strong>
                </div>
              )}
            </div>
          )}

          <div className={styles.actions} style={{
            marginTop: '10px',
            paddingTop: '25px',
            borderTop: '1px solid var(--glass-border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '15px'
          }}>
            <button 
              type="button" 
              onClick={onClose} 
              disabled={loading}
              style={{
                padding: '12px 25px',
                borderRadius: '8px',
                background: 'transparent',
                border: '1px solid var(--text-secondary)',
                color: 'var(--text-secondary)',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={e => {
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.borderColor = '#fff';
              }}
              onMouseOut={e => {
                e.currentTarget.style.color = 'var(--text-secondary)';
                e.currentTarget.style.borderColor = 'var(--text-secondary)';
              }}
            >
              Close
            </button>
          
          {/* Warehouseman Actions */}
          {isPending && (
            <>
              <button 
                type="button" 
                onClick={handleReject} 
                style={{ background: 'rgba(255, 107, 107, 0.1)', color: '#ff6b6b', border: '1px solid rgba(255, 107, 107, 0.3)', padding: '12px 25px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', transition: 'all 0.2s' }} 
                disabled={loading}
                onMouseOver={e => {
                  e.currentTarget.style.background = '#ff6b6b';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'rgba(255, 107, 107, 0.1)';
                  e.currentTarget.style.color = '#ff6b6b';
                }}
              >
                Reject Request
              </button>
              <button 
                type="button" 
                onClick={handleProcess} 
                style={{ background: '#3498db', color: '#fff', border: 'none', padding: '12px 35px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', boxShadow: '0 4px 14px rgba(52, 152, 219, 0.4)', transition: 'transform 0.1s' }} 
                disabled={loading}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                {loading ? 'Processing...' : 'Process & Prepare Materials'}
              </button>
            </>
          )}

          {/* Accountant Actions */}
          {isProcessed && (
            <button 
              type="button" 
              onClick={handleApprove} 
              style={{ background: '#9b59b6', color: '#fff', border: 'none', padding: '12px 35px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', boxShadow: '0 4px 14px rgba(155, 89, 182, 0.4)', transition: 'transform 0.1s' }} 
              disabled={loading}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              {loading ? 'Approving...' : 'Approve & Release Slip'}
            </button>
          )}

          {/* Return Action for RELEASED/COMPLETED Slips */}
          {['RELEASED', 'COMPLETED'].includes(issuance.status) && (
            (() => {
              const hasProcessedReturn = returnableMaterials(issuance).length === 0;
              return (
                <button 
                  type="button" 
                  onClick={() => setIsReturnModalOpen(true)} 
                  style={{ 
                    background: hasProcessedReturn ? 'rgba(255,255,255,0.1)' : '#f39c12', 
                    color: hasProcessedReturn ? 'var(--text-secondary)' : '#fff', 
                    border: 'none', padding: '12px 25px', borderRadius: '8px', cursor: hasProcessedReturn ? 'not-allowed' : 'pointer', fontWeight: '700', 
                    boxShadow: hasProcessedReturn ? 'none' : '0 4px 14px rgba(243, 156, 18, 0.4)', transition: 'transform 0.1s' 
                  }} 
                  disabled={loading || hasProcessedReturn}
                  onMouseDown={e => { if (!hasProcessedReturn) e.currentTarget.style.transform = 'scale(0.95)' }}
                  onMouseUp={e => { if (!hasProcessedReturn) e.currentTarget.style.transform = 'scale(1)' }}
                  onMouseLeave={e => { if (!hasProcessedReturn) e.currentTarget.style.transform = 'scale(1)' }}
                  title={hasProcessedReturn ? 'All released quantities have been returned or are pending return.' : ''}
                >
                  {hasProcessedReturn ? 'No Materials Remaining to Return' : 'Return Unutilized Materials'}
                </button>
              );
            })()
          )}
          </div>
        </div>
      </div>
      
      {isReturnModalOpen && (
        <CreateReturnModal 
          issuance={issuance} 
          onClose={() => {
            setIsReturnModalOpen(false);
            onClose(); // Optional: Close details modal too after return is created
          }} 
        />
      )}
    </div>
  );
}
