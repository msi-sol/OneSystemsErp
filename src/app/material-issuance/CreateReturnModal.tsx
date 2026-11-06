'use client';

import { useState, useEffect } from 'react';
import { createMaterialReturn } from '../actions/returnActions';
import { useRouter } from 'next/navigation';
import styles from './issuance.module.css';
import { returnableMaterials } from '@/lib/procurement/material-returns';

export default function CreateReturnModal({ issuance, releasedIssuances, onClose }: { issuance?: any, releasedIssuances?: any[], onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [selectedIssuanceId, setSelectedIssuanceId] = useState<string>(issuance ? issuance.id : '');
  const [returnItems, setReturnItems] = useState<any[]>([]);

  // Update return items when selected issuance changes
  useEffect(() => {
    let currentIssuance = issuance;
    if (!currentIssuance && releasedIssuances && selectedIssuanceId) {
      currentIssuance = releasedIssuances.find(i => i.id === selectedIssuanceId);
    }

    if (currentIssuance) {
      setReturnItems(
        returnableMaterials(currentIssuance)
      );
    } else {
      setReturnItems([]);
    }
  }, [issuance, selectedIssuanceId, releasedIssuances]);

  const handleUpdateItem = (index: number, field: string, value: any) => {
    const updated = [...returnItems];
    if (field === 'returnedQty') {
      const val = parseFloat(value) || 0;
      updated[index][field] = Math.min(Math.max(0, val), updated[index].maxQty);
    } else {
      updated[index][field] = value;
    }
    setReturnItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    let currentIssuance = issuance;
    if (!currentIssuance && releasedIssuances && selectedIssuanceId) {
      currentIssuance = releasedIssuances.find(i => i.id === selectedIssuanceId);
    }

    if (!currentIssuance) {
      setError('Please select an issuance slip to return materials from.');
      setLoading(false);
      return;
    }

    const itemsToReturn = returnItems.filter(i => i.returnedQty > 0);
    if (itemsToReturn.length === 0) {
      setError('Please specify at least one item to return with a quantity greater than 0.');
      setLoading(false);
      return;
    }

    const payload = {
      issuanceId: currentIssuance.id,
      projectId: currentIssuance.projectId,
      foremanId: currentIssuance.foremanId,
      items: itemsToReturn
    };

    try {
      const res = await createMaterialReturn(payload);
      if (res.success) { router.refresh(); onClose(); }
      else setError(res.error || 'Failed to submit return');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to submit return');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(10, 15, 26, 0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2000, padding: '20px'
    }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Return Unutilized Materials" style={{
        background: 'var(--bg-secondary)', borderRadius: '16px', width: '100%', maxWidth: '900px',
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05)',
        display: 'flex', flexDirection: 'column'
      }}>
        <div className={styles.dialogHeader} style={{ padding: '25px 35px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#fff', fontWeight: '700' }}>Return Unutilized Materials</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
        </div>

        <form className={styles.dialogBody} onSubmit={handleSubmit} style={{ padding: '35px', display: 'flex', flexDirection: 'column', gap: '25px' }}>
          {error && <div style={{ padding: '15px', background: 'rgba(255, 107, 107, 0.1)', color: '#ff6b6b', borderRadius: '8px', borderLeft: '4px solid #ff6b6b' }}>{error}</div>}

          {!issuance && releasedIssuances && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--accent-color)', fontWeight: 'bold' }}>Select Material Issuance Slip</label>
              <select 
                value={selectedIssuanceId}
                onChange={(e) => setSelectedIssuanceId(e.target.value)}
                required
                style={{
                  width: '100%', padding: '12px 15px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)',
                  border: '1px solid var(--glass-border)', color: '#fff', fontSize: '0.95rem', outline: 'none'
                }}
              >
                <option value="" disabled>Select a released issuance slip...</option>
                {releasedIssuances.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.misNumber} (Project: {i.project.name})
                  </option>
                ))}
              </select>
            </div>
          )}

          {returnItems.length > 0 && (
            <div className={styles.tableScroll} role="region" aria-label="Materials to return" tabIndex={0} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    <th style={{ padding: '15px' }}>Category</th>
                    <th style={{ padding: '15px' }}>Material</th>
                    <th style={{ padding: '15px' }}>Issued Qty</th>
                    <th style={{ padding: '15px' }}>Return Qty</th>
                    <th style={{ padding: '15px' }}>Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {returnItems.map((item, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '15px', color: 'var(--text-secondary)' }}>{item.category}</td>
                      <td style={{ padding: '15px' }}>{item.description}</td>
                      <td style={{ padding: '15px', color: 'var(--text-secondary)' }}>{item.maxQty} {item.unit}</td>
                      <td style={{ padding: '15px' }}>
                        <input 
                          type="number" 
                          step="any"
                          min="0"
                          max={item.maxQty}
                          value={item.returnedQty || ''}
                          onChange={(e) => handleUpdateItem(index, 'returnedQty', e.target.value)}
                          style={{ width: '100px', padding: '8px 12px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }}
                        />
                      </td>
                      <td style={{ padding: '15px' }}>
                        <select 
                          value={item.condition}
                          onChange={(e) => handleUpdateItem(index, 'condition', e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }}
                        >
                          <option value="GOOD">Good (Restock)</option>
                          <option value="DAMAGED">Damaged</option>
                          <option value="SCRAP">Scrap</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.actions} style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', paddingTop: '20px', borderTop: '1px solid var(--glass-border)' }}>
            <button type="button" onClick={onClose} disabled={loading} style={{ padding: '12px 25px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--text-secondary)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={loading || returnItems.length === 0} style={{ background: 'var(--accent-color)', color: '#000', border: 'none', padding: '12px 35px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              {loading ? 'Submitting...' : 'Submit Return Slip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
