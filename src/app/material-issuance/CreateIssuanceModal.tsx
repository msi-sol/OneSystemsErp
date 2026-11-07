'use client';
import { materialStock } from '@/lib/procurement/material-values';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getConsolidatedItemsForIssuance, createIssuanceSlip } from '../actions/issuanceActions';
import { submitAIOverrideRequest } from '../actions/aiOverrideActions';
import styles from './issuance.module.css';

export default function CreateIssuanceModal({ projects, users, onClose }: { projects: any[], users: any[], onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState('');
  // With a single project (the header's active project) there is nothing to choose, so preselect it.
  const [projectId, setProjectId] = useState(projects.length === 1 ? projects[0].id : '');
  const [foremanId, setForemanId] = useState('');
  const [activity, setActivity] = useState('');
  const [items, setItems] = useState<any[]>([{ consolidatedBoqItemId: '', requestedQty: 1 }]);
  const [boqItems, setBoqItems] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [validationLogId, setValidationLogId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSuccess, setOverrideSuccess] = useState(false);

  // Fetch BOQ Items when project changes
  useEffect(() => {
    let active = true;
    setBoqItems([]);
    setItems([{ consolidatedBoqItemId: '', requestedQty: 1 }]);
    setInventoryError('');
    setValidationLogId(null);
    setOverrideSuccess(false);
    if (projectId) {
      setInventoryLoading(true);
      getConsolidatedItemsForIssuance(projectId).then(res => {
        if (!active) return;
        if (!res.success || !Array.isArray(res.data)) throw new Error(res.error || 'Could not load project stock.');
        setBoqItems(res.data);
      }).catch(caught => {
        if (active) setInventoryError(caught instanceof Error ? caught.message : 'Could not load project stock.');
      }).finally(() => { if (active) setInventoryLoading(false); });
    } else {
      setInventoryLoading(false);
    }
    return () => { active = false; };
  }, [projectId]);

  const addItem = () => {
    setItems([...items, { consolidatedBoqItemId: '', requestedQty: 1 }]);
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const getAvailableQty = (boqItemId: string) => {
    const boq = boqItems.find(b => b.id === boqItemId);
    if (!boq) return 0;
    return materialStock(boq);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inventoryLoading || inventoryError) return;
    if (!projectId || !foremanId || !activity || items.length === 0) {
      setError('Please fill all required fields and add at least one item.');
      return;
    }

    // Validate quantities
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.consolidatedBoqItemId) {
        setError(`Item #${i + 1} is missing a material selection.`);
        return;
      }
      if (item.requestedQty <= 0) {
        setError(`Item #${i + 1} quantity must be greater than 0.`);
        return;
      }
      
      const available = getAvailableQty(item.consolidatedBoqItemId);
      if (item.requestedQty > available) {
        setError(`Item #${i + 1} requested quantity (${item.requestedQty}) exceeds available inventory (${available}).`);
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      const res = await createIssuanceSlip({ projectId, foremanId, activity, items });
      if (res.success) {
        router.refresh();
        onClose();
      } else {
        setError(res.error || 'Failed to create slip');
        setValidationLogId(res.validationLogId || null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to create slip.');
    } finally {
      setLoading(false);
    }
  };

  const handleOverride = async () => {
    if (!validationLogId || !overrideReason) return;
    setLoading(true);
    const res = await submitAIOverrideRequest({
      validationLogId,
      transactionId: 'PENDING_OVERRIDE',
      moduleName: 'Material Issuance',
      overriddenBy: foremanId || 'user-stub', // Use actual session later
      overriddenByRole: 'WAREHOUSE_CUSTODIAN',
      overrideReason
    });
    
    if (res.success) {
      setOverrideSuccess(true);
      setError('Override Request Submitted! A Project Director must approve it before this material can be issued.');
      setValidationLogId(null);
    } else {
      setError(res.error || 'Failed to submit override');
    }
    setLoading(false);
  };

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
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Material Issuance Slip" style={{
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
        
        {/* Header */}
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
              Material Issuance Slip
            </h2>
            <p style={{ margin: '5px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Create a formal request to withdraw materials from the site inventory.
            </p>
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

        <form className={styles.dialogBody} onSubmit={handleSubmit} style={{ padding: '35px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {error && (
            <div style={{ 
              background: 'rgba(255, 107, 107, 0.1)', 
              borderLeft: '4px solid #ff6b6b', 
              color: '#ff6b6b', 
              padding: '15px 20px', 
              borderRadius: '0 8px 8px 0',
              fontWeight: '500'
            }}>
              <div style={{ marginBottom: '5px' }}>{error}</div>
              
              {validationLogId && !overrideSuccess && (
                <div style={{ marginTop: '15px', padding: '15px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                  <div style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '10px' }}>Apply for AI Exception Override:</div>
                  <textarea 
                    value={overrideReason} 
                    onChange={e => setOverrideReason(e.target.value)} 
                    placeholder="Justification for bypassing policy (e.g. emergency repair)..."
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#111', color: '#fff', border: '1px solid #444', marginBottom: '10px' }}
                  />
                  <button 
                    type="button"
                    onClick={handleOverride}
                    disabled={loading || !overrideReason}
                    style={{ padding: '8px 16px', background: '#ffd43b', color: '#000', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Submit Override to Director
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Section 1: General Info */}
          <div className={styles.facts}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--accent-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Project Reference
              </label>
              <select 
                value={projectId} 
                onChange={(e) => setProjectId(e.target.value)} 
                required
                style={{
                  padding: '12px 15px',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--glass-border)',
                  color: '#fff',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
              >
                <option value="" disabled>Select the target project...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--accent-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Requested By
              </label>
              <select 
                value={foremanId} 
                onChange={(e) => setForemanId(e.target.value)} 
                required
                style={{
                  padding: '12px 15px',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--glass-border)',
                  color: '#fff',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
              >
                <option value="" disabled>Select requesting personnel...</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role.replace('_', ' ')})</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--accent-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Activity / Purpose
              </label>
              <input 
                type="text" 
                value={activity} 
                onChange={(e) => setActivity(e.target.value)} 
                placeholder="Briefly describe the purpose of this material withdrawal (e.g., Concrete Pouring at Sector A)" 
                required 
                style={{
                  padding: '12px 15px',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--glass-border)',
                  color: '#fff',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
              />
            </div>
          </div>

          {/* Section 2: Items Table */}
          <div>
            <div className={styles.sectionHeading} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid var(--glass-border)', paddingBottom: '15px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#fff', fontWeight: '600' }}>Item Requisition List</h3>
                <p style={{ margin: '5px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Select materials that are currently available in the site inventory.
                </p>
              </div>
              <button 
                type="button" 
                onClick={addItem} 
                disabled={!projectId} 
                style={{ 
                  background: projectId ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)', 
                  color: projectId ? '#000' : '#666', 
                  border: 'none', 
                  padding: '10px 20px', 
                  borderRadius: '8px', 
                  cursor: projectId ? 'pointer' : 'not-allowed', 
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'transform 0.1s, opacity 0.2s'
                }}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                <span style={{ fontSize: '1.2rem' }}>+</span> Add Row
              </button>
            </div>

            {!projectId && (
              <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--glass-border)', color: 'var(--text-secondary)' }}>
                Please select a Project Reference above to load available inventory items.
              </div>
            )}

            {projectId && (
              <>
              {inventoryLoading && <p role="status">Loading available project stock…</p>}
              {inventoryError && <p role="alert">{inventoryError}</p>}
              {!inventoryLoading && !inventoryError && boqItems.length === 0 && <p>No available stock for this project. Receive and approve deliveries, or transfer stock to this project, before issuing materials.</p>}
              <div className={styles.itemScroll} role="region" aria-label="Issuance materials" tabIndex={0} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {/* Headers */}
                <div className={styles.itemGrid} style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 4fr) 1.5fr 1fr 80px', gap: '20px', padding: '0 15px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <div>Material Specification</div>
                  <div>Available Stock</div>
                  <div>Req. Qty</div>
                  <div style={{ textAlign: 'center' }}>Action</div>
                </div>

                {/* Rows */}
                {items.map((item, index) => {
                  const boqItem = boqItems.find(b => b.id === item.consolidatedBoqItemId);
                  const available = boqItem ? materialStock(boqItem) : 0;
                  const unit = boqItem ? boqItem.unit : '';

                  return (
                    <div key={index} className={styles.itemGrid} style={{
                      display: 'grid', 
                      gridTemplateColumns: 'minmax(400px, 4fr) 1.5fr 1fr 80px', 
                      gap: '20px', 
                      alignItems: 'center', 
                      background: 'rgba(255,255,255,0.03)', 
                      padding: '15px', 
                      borderRadius: '12px', 
                      border: '1px solid rgba(255,255,255,0.05)',
                      transition: 'background 0.2s'
                    }}
                    onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                    >
                      <select
                        aria-label={`Material for row ${index + 1}`}
                        value={item.consolidatedBoqItemId}
                        onChange={(e) => updateItem(index, 'consolidatedBoqItemId', e.target.value)}
                        required
                        style={{
                          padding: '12px 15px',
                          borderRadius: '8px',
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid var(--glass-border)',
                          color: '#fff',
                          fontSize: '0.95rem',
                          outline: 'none',
                          width: '100%',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="" disabled>Select from available inventory...</option>
                        {boqItems.map(b => {
                          const stock = materialStock(b);
                          const isSelectedElsewhere = items.some((it, i) => i !== index && it.consolidatedBoqItemId === b.id);
                          return (
                            <option key={b.id} value={b.id} disabled={isSelectedElsewhere}>
                              {/* Category prefix only when there is one (no "[N/A]" noise), plus stock so users can pick without guessing. */}
                              {b.category ? `[${b.category}] ` : ''}{b.description} · {stock.toLocaleString()} {b.unit} in stock {isSelectedElsewhere ? '(Already Added)' : ''}
                            </option>
                          );
                        })}
                      </select>
                      
                      <div style={{
                        padding: '12px 15px',
                        borderRadius: '8px',
                        background: 'rgba(0, 0, 0, 0.1)',
                        border: '1px solid transparent',
                        color: 'var(--text-secondary)',
                        fontSize: '0.95rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <span style={{ fontWeight: '600', color: available > 0 ? '#00ffa3' : 'inherit' }}>
                          {item.consolidatedBoqItemId ? available.toLocaleString() : '-'}
                        </span>
                        <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{unit}</span>
                      </div>

                      <div style={{ position: 'relative' }}>
                        <input
                          type="number"
                          aria-label={`Requested quantity for row ${index + 1}`}
                          min="0"
                          max={item.consolidatedBoqItemId ? available : undefined}
                          step="any"
                          value={item.requestedQty}
                          onChange={(e) => updateItem(index, 'requestedQty', parseFloat(e.target.value) || 0)} 
                          required 
                          style={{
                            padding: '12px 15px',
                            borderRadius: '8px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid var(--glass-border)',
                            color: '#fff',
                            fontSize: '0.95rem',
                            outline: 'none',
                            width: '100%',
                            fontWeight: 'bold',
                            textAlign: 'right'
                          }}
                        />
                      </div>

                      <button 
                        type="button" 
                        onClick={() => removeItem(index)}
                        style={{ 
                          background: 'rgba(255, 107, 107, 0.1)', 
                          color: '#ff6b6b', 
                          border: '1px solid rgba(255, 107, 107, 0.2)', 
                          borderRadius: '8px', 
                          cursor: 'pointer', 
                          height: '42px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                          width: '100%'
                        }}
                        title="Remove Item"
                        onMouseOver={e => {
                          e.currentTarget.style.background = '#ff6b6b';
                          e.currentTarget.style.color = '#fff';
                        }}
                        onMouseOut={e => {
                          e.currentTarget.style.background = 'rgba(255, 107, 107, 0.1)';
                          e.currentTarget.style.color = '#ff6b6b';
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </div>

          {/* Footer Actions */}
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
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading || !projectId || inventoryLoading || !!inventoryError || boqItems.length === 0}
              style={{
                padding: '12px 35px',
                borderRadius: '8px',
                background: 'var(--accent-color)',
                border: 'none',
                color: '#000',
                fontSize: '1rem',
                fontWeight: '700',
                cursor: (loading || !projectId) ? 'not-allowed' : 'pointer',
                opacity: (loading || !projectId) ? 0.7 : 1,
                boxShadow: '0 4px 14px rgba(0, 240, 255, 0.4)',
                transition: 'transform 0.1s'
              }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              {loading ? 'Processing...' : 'Submit Issuance Slip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
