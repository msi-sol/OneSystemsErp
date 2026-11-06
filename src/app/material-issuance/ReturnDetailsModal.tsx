'use client';

import { useState } from 'react';
import { processMaterialReturn } from '../actions/returnActions';
import { useRouter } from 'next/navigation';
import styles from './issuance.module.css';

export default function ReturnDetailsModal({ materialReturn, users, onClose }: { materialReturn: any, users: any[], onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleProcess = async () => {
    setLoading(true);
    setError('');
    
    const warehouseman = users?.find(u => u.role === 'WAREHOUSEMAN' || u.role === 'STOCKMAN') || users?.[0];
    if (!warehouseman) {
      setError('No valid user found to process return.');
      setLoading(false);
      return;
    }

    try {
      const res = await processMaterialReturn(materialReturn.id, warehouseman.id);
      if (res.success) { router.refresh(); onClose(); }
      else setError(res.error || 'Failed to process return');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to process return');
    } finally {
      setLoading(false);
    }
  };

  const isPending = materialReturn.status === 'PENDING';

  return (
    <div className={styles.overlay} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(10, 15, 26, 0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '20px'
    }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Return Details" style={{
        background: 'var(--bg-secondary)', borderRadius: '16px', width: '100%', maxWidth: '900px',
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05)',
        display: 'flex', flexDirection: 'column'
      }}>
        <div className={styles.dialogHeader} style={{ padding: '25px 35px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.8rem', color: '#fff', fontWeight: '700' }}>
              Return Details: {materialReturn.mrsNumber}
            </h2>
            <div style={{ marginTop: '10px' }}>
              <span style={{ 
                padding: '6px 12px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold',
                background: materialReturn.status === 'COMPLETED' ? 'rgba(0,255,163,0.1)' : 'rgba(255,165,0,0.1)',
                color: materialReturn.status === 'COMPLETED' ? '#00ffa3' : '#ffa500',
                border: materialReturn.status === 'COMPLETED' ? '1px solid rgba(0,255,163,0.2)' : '1px solid rgba(255,165,0,0.2)'
              }}>
                {materialReturn.status}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
        </div>

        <div className={styles.dialogBody} style={{ padding: '35px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
          {error && <div style={{ padding: '15px', background: 'rgba(255, 107, 107, 0.1)', color: '#ff6b6b', borderRadius: '8px', borderLeft: '4px solid #ff6b6b' }}>{error}</div>}

          <div className={styles.facts} style={{ background: 'rgba(0,0,0,0.15)', padding: '25px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <div>
              <p style={{ margin: '0 0 5px', color: 'var(--accent-color)', fontSize: '0.85rem', fontWeight: '600' }}>Project</p>
              <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem', color: '#fff' }}>{materialReturn.project.name}</p>
            </div>
            <div>
              <p style={{ margin: '0 0 5px', color: 'var(--accent-color)', fontSize: '0.85rem', fontWeight: '600' }}>Returned By</p>
              <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem', color: '#fff' }}>{materialReturn.foreman?.name || 'Unknown'}</p>
            </div>
            <div>
              <p style={{ margin: '0 0 5px', color: 'var(--accent-color)', fontSize: '0.85rem', fontWeight: '600' }}>Linked Issuance</p>
              <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem', color: '#fff' }}>{materialReturn.issuance.misNumber}</p>
            </div>
          </div>

          <div>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '1.3rem', color: '#fff', fontWeight: '600' }}>Returned Items</h3>
            <div className={styles.tableScroll} role="region" aria-label="Returned items" tabIndex={0} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    <th style={{ padding: '15px' }}>Category</th>
                    <th style={{ padding: '15px' }}>Material</th>
                    <th style={{ padding: '15px' }}>Condition</th>
                    <th style={{ padding: '15px' }}>Returned Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {materialReturn.items.map((item: any) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '15px', color: 'var(--text-secondary)' }}>{item.consolidatedBoqItem.category || 'N/A'}</td>
                      <td style={{ padding: '15px' }}>{item.consolidatedBoqItem.description}</td>
                      <td style={{ padding: '15px' }}>
                        <span style={{
                          padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold',
                          background: item.condition === 'GOOD' ? 'rgba(0,255,163,0.1)' : 'rgba(255,107,107,0.1)',
                          color: item.condition === 'GOOD' ? '#00ffa3' : '#ff6b6b'
                        }}>
                          {item.condition}
                        </span>
                      </td>
                      <td style={{ padding: '15px', fontWeight: 'bold', fontSize: '1.1rem' }}>{item.returnedQty} {item.consolidatedBoqItem.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: '10px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              * Only items in "GOOD" condition will be restocked to the inventory.
            </p>
          </div>

          <div className={styles.actions} style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', paddingTop: '25px', borderTop: '1px solid var(--glass-border)' }}>
            <button type="button" onClick={onClose} disabled={loading} style={{ padding: '12px 25px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--text-secondary)', color: 'var(--text-secondary)' }}>Close</button>
            
            {isPending && (
              <button 
                type="button" 
                onClick={handleProcess} 
                style={{ background: '#3498db', color: '#fff', border: 'none', padding: '12px 35px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }} 
                disabled={loading}
              >
                {loading ? 'Processing...' : 'Receive & Restock Materials'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
