// @ts-nocheck
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { encodeDeliveryWithFile } from '@/app/actions/deliveryActions';
import { submitAIOverrideRequest } from '@/app/actions/aiOverrideActions';
import { calculatePoReceiptProgress } from '@/lib/procurement/po-receipt-progress';
import { groupPoReceivingItems } from '@/lib/procurement/po-receipt-cost';
import styles from '../../projects/page.module.css';

export default function LogDeliveryForm({ purchaseOrders, initialPoId = '' }: { purchaseOrders: any[]; initialPoId?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Preselected when opened from a PO's "Receive delivery" link.
  const [selectedPoId, setSelectedPoId] = useState(initialPoId);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [drFile, setDrFile] = useState<File | null>(null);
  const [isNoFile, setIsNoFile] = useState(false);
  const [noFileReason, setNoFileReason] = useState('');
  
  const [drQuantities, setDrQuantities] = useState<Record<string, number>>({});
  const [actualQuantities, setActualQuantities] = useState<Record<string, number>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  
  const [error, setError] = useState('');
  const [validationLogId, setValidationLogId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSuccess, setOverrideSuccess] = useState(false);

  const selectedPo = purchaseOrders.find(po => po.id === selectedPoId);
  const receivingItems = selectedPo ? groupPoReceivingItems(selectedPo.items) : [];
  const receiptProgress = selectedPo
    ? calculatePoReceiptProgress(receivingItems, selectedPo.deliveries || [])
    : null;

  const handleDrQtyChange = (itemId: string, val: string) => {
    setDrQuantities(prev => ({ ...prev, [itemId]: parseFloat(val) || 0 }));
  };

  const handleActualQtyChange = (itemId: string, val: string) => {
    setActualQuantities(prev => ({ ...prev, [itemId]: parseFloat(val) || 0 }));
  };

  const handleRemarksChange = (itemId: string, val: string) => {
    setRemarks(prev => ({ ...prev, [itemId]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPoId) return setError('Please select a Purchase Order.');
    if (!receiptNumber) return setError('Please enter the Delivery Receipt number.');

    const itemsToDeliver: any[] = [];
    let hasValidationError = false;

    // Every line with a DR or an actual quantity (typing only "Actual" used to skip the line).
    [...new Set([...Object.keys(drQuantities), ...Object.keys(actualQuantities)])].forEach((id) => {
      const drQty = drQuantities[id] || 0;
      const actualQty = actualQuantities[id] || 0;
      const remark = remarks[id] || '';

      if (drQty > 0 || actualQty > 0) {
        if (drQty !== actualQty && !remark.trim()) {
          setError('Please provide a remark for items where DR Qty does not match Actual Qty.');
          hasValidationError = true;
          return;
        }
        itemsToDeliver.push({
          consolidatedBoqItemId: id,
          drQuantity: drQty,
          quantity: actualQty,
          remarks: remark
        });
      }
    });

    if (hasValidationError) return;

    if (itemsToDeliver.length === 0) {
      return setError('Please enter quantity for at least one item.');
    }

    if (!isNoFile && !drFile) {
      return setError('Please upload a DR document or check the box to provide a reason.');
    }
    if (isNoFile && !noFileReason.trim()) {
      return setError('Please provide a reason why documents cannot be uploaded.');
    }

    setError('');
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append('poId', selectedPoId);
        formData.append('receiptNumber', receiptNumber);
        formData.append('items', JSON.stringify(itemsToDeliver));
        
        if (!isNoFile && drFile) {
          formData.append('file', drFile);
        }
        if (isNoFile) {
          formData.append('noFileReason', noFileReason);
        }

        const res = await encodeDeliveryWithFile(formData);
        if (res.success) {
          router.push(`/deliveries/${res.deliveryId}`);
        } else {
          setError(res.error || 'Failed to log delivery');
          setValidationLogId(res.validationLogId || null);
        }
      } catch (err: any) {
        setError(err.message || 'An error occurred while logging the delivery.');
      }
    });
  };

  const handleOverride = async () => {
    if (!validationLogId || !overrideReason) return;
    const res = await submitAIOverrideRequest({
      validationLogId,
      transactionId: 'PENDING_DELIVERY',
      moduleName: 'Delivery Receiving',
      overriddenBy: '', // The server will automatically use your active session cookie
      overriddenByRole: 'STOCKMAN',
      overrideReason
    });
    
    if (res.success) {
      setOverrideSuccess(true);
      setError('Override Request Submitted! A Project Director must approve it before this delivery is encoded.');
      setValidationLogId(null);
    } else {
      setError(res.error || 'Failed to submit override');
    }
  };

  return (
    <div style={{ background: 'var(--bg-secondary)', padding: '30px', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Select Purchase Order</label>
            <select 
              value={selectedPoId} 
              onChange={e => { 
                setSelectedPoId(e.target.value); 
                setDrQuantities({}); 
                setActualQuantities({});
                setRemarks({});
              }}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-dark)', color: 'white' }}
              required
            >
              <option value="">-- Select PO --</option>
              {purchaseOrders.map(po => (
                <option key={po.id} value={po.id}>{po.poNumber} ({po.supplier.name}) - {po.mr.project.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Delivery Receipt (DR) Number</label>
            <input 
              type="text" 
              value={receiptNumber} 
              onChange={e => setReceiptNumber(e.target.value)}
              placeholder="e.g. DR-2026-001"
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-dark)', color: 'white' }}
              required
            />
          </div>
        </div>

        <div style={{ marginTop: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ color: 'var(--text-secondary)' }}>Upload DR Document (For AI Validation)</label>
            <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
              <input type="checkbox" checked={isNoFile} onChange={e => { setIsNoFile(e.target.checked); setDrFile(null); }} />
              Cannot upload document right now
            </label>
          </div>
          
          {!isNoFile ? (
            <>
              <input 
                type="file" 
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={e => setDrFile(e.target.files?.[0] || null)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-dark)', color: 'white' }}
                required={!isNoFile}
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '5px' }}>
                The AI engine will perform OCR on this document to cross-reference encoded quantities with the physical receipt.
              </p>
            </>
          ) : (
            <textarea 
              value={noFileReason}
              onChange={e => setNoFileReason(e.target.value)}
              placeholder="Please provide a valid reason why the DR document cannot be uploaded (e.g. Scanner broken, will upload later)..."
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-dark)', color: 'white', minHeight: '80px', resize: 'vertical' }}
              required={isNoFile}
            />
          )}
        </div>

        {selectedPo && (
          <div style={{ marginTop: '20px' }}>
            <h3 style={{ marginBottom: '15px' }}>Items in this PO</h3>
            <div className={styles.tableContainer} style={{ overflowX: 'auto' }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Item Description</th>
                    <th>Ordered Qty</th>
                    <th>Remaining</th>
                    <th>DR Qty</th>
                    <th>Actual Qty</th>
                    <th>Remarks (If lacking)</th>
                  </tr>
                </thead>
                <tbody>
                  {receivingItems.map((item: any) => {
                    const ordered = item.quantity;
                    const remaining = receiptProgress?.remainingByOrderItemId.get(item.id) || 0;
                    const isDone = remaining === 0;

                    const drQty = drQuantities[item.consolidatedBoqItem.id] || 0;
                    const actualQty = actualQuantities[item.consolidatedBoqItem.id] || 0;
                    const mismatch = drQty !== actualQty;

                    return (
                      <tr key={item.consolidatedBoqItem.id}>
                        <td>{item.consolidatedBoqItem.category}</td>
                        <td>{item.consolidatedBoqItem.description}</td>
                        <td>{ordered}</td>
                        <td>
                          {isDone ? <span style={{ color: 'var(--accent-color)' }}>Fully Delivered</span> : remaining}
                        </td>
                        <td>
                          <input 
                            type="number"
                            min="0"
                            step="any"
                            disabled={isDone}
                            value={drQuantities[item.consolidatedBoqItem.id] || ''}
                            onChange={e => handleDrQtyChange(item.consolidatedBoqItem.id, e.target.value)}
                            placeholder="On DR"
                            style={{ width: '80px', padding: '8px', borderRadius: '4px', border: '1px solid var(--glass-border)', background: 'var(--bg-dark)', color: 'white' }}
                          />
                        </td>
                        <td>
                          <input 
                            type="number"
                            min="0"
                            step="any"
                            disabled={isDone}
                            value={actualQuantities[item.consolidatedBoqItem.id] || ''}
                            onChange={e => handleActualQtyChange(item.consolidatedBoqItem.id, e.target.value)}
                            placeholder="Actual"
                            style={{ width: '80px', padding: '8px', borderRadius: '4px', border: mismatch ? '1px solid #ef4444' : '1px solid var(--glass-border)', background: mismatch ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-dark)', color: 'white' }}
                          />
                        </td>
                        <td>
                          <input 
                            type="text"
                            disabled={isDone}
                            value={remarks[item.consolidatedBoqItem.id] || ''}
                            onChange={e => handleRemarksChange(item.consolidatedBoqItem.id, e.target.value)}
                            placeholder={mismatch ? "Required: reason for lacking qty" : "Optional remarks"}
                            style={{ width: '100%', minWidth: '150px', padding: '8px', borderRadius: '4px', border: mismatch && !remarks[item.consolidatedBoqItem.id] ? '1px solid #ef4444' : '1px solid var(--glass-border)', background: 'var(--bg-dark)', color: 'white' }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(255, 107, 107, 0.1)', color: '#ff6b6b', padding: '15px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem', border: '1px solid rgba(255, 107, 107, 0.3)' }}>
            <div style={{ fontWeight: 600, marginBottom: '5px' }}>{error}</div>
            
            {validationLogId && !overrideSuccess && (
              <div style={{ marginTop: '15px', padding: '15px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                <div style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '10px' }}>Apply for AI Exception Override:</div>
                <textarea 
                  value={overrideReason} 
                  onChange={e => setOverrideReason(e.target.value)} 
                  placeholder="Justification for bypassing policy (e.g. Supplier will deliver missing items tomorrow)..."
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#111', color: '#fff', border: '1px solid #444', marginBottom: '10px' }}
                />
                <button 
                  type="button"
                  onClick={handleOverride}
                  disabled={isPending || !overrideReason}
                  style={{ padding: '8px 16px', background: '#ffd43b', color: '#000', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Submit Override to Director
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '20px' }}>
          <button 
            type="button" 
            onClick={() => router.back()}
            style={{ padding: '12px 24px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'transparent', color: 'white', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={isPending || !selectedPoId}
            className={styles.primaryButton}
            style={{ opacity: (isPending || !selectedPoId) ? 0.7 : 1 }}
          >
            {isPending ? 'Submitting...' : 'Receive Delivery'}
          </button>
        </div>
      </form>
    </div>
  );
}
