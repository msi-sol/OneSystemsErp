'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPOFromMRF } from '@/app/actions/poActions';
import { submitAIOverrideRequest } from '@/app/actions/aiOverrideActions';

export default function GeneratePOForm({ mr, suppliers }: { mr: any, suppliers: any[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [validationLogId, setValidationLogId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSuccess, setOverrideSuccess] = useState(false);
  
  const [items, setItems] = useState(
    mr.items.map((item: any) => ({
      id: item.id,
      consolidatedBoqItemId: item.consolidatedBoqItemId,
      itemCode: item.consolidatedBoqItem.itemCode,
      category: item.consolidatedBoqItem.category || 'Uncategorized',
      description: item.consolidatedBoqItem.description,
      quantity: item.quantity,
      unit: item.consolidatedBoqItem.unit || '',
      // The approved benchmark (budget) rate for this material, shown as a guide; 0 when unknown.
      budgetRate: Number(item.consolidatedBoqItem.revisedBenchmarkUnitCost) > 0 ? Number(item.consolidatedBoqItem.revisedBenchmarkUnitCost) : Number(item.consolidatedBoqItem.unitCost) || 0,
      unitCostInput: '', // Blank initially as requested
      supplierId: ''
    }))
  );

  const parseCost = (val: string) => parseFloat(val.replace(/,/g, '')) || 0;
  const peso = (value: number) => `₱ ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const selectedBudget = items.reduce((acc: number, item: any) => item.supplierId && item.budgetRate ? acc + item.quantity * item.budgetRate : acc, 0);

  const handleCostChange = (id: string, val: string) => {
    if (!/^[0-9.,]*$/.test(val)) return;
    setItems(items.map((i: any) => i.id === id ? { ...i, unitCostInput: val } : i));
  };

  const handleCostBlur = (id: string, val: string) => {
    if (!val) return;
    const num = parseCost(val);
    const formatted = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setItems(items.map((i: any) => i.id === id ? { ...i, unitCostInput: formatted } : i));
  };

  const handleSupplierChange = (id: string, supplierId: string) => {
    setItems(items.map((i: any) => i.id === id ? { ...i, supplierId } : i));
  };

  const totalAmount = items.reduce((acc: number, item: any) => {
    return item.supplierId ? acc + (item.quantity * parseCost(item.unitCostInput)) : acc;
  }, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Messages are shown on the page: browser alert() popups do not appear in every browser (e.g. the app's built-in one).
    const itemsToProcure = items.filter((i: any) => i.supplierId !== '');
    if (itemsToProcure.length === 0) {
      setError('Select a supplier for at least one item to generate a PO.');
      return;
    }
    if (itemsToProcure.some((i: any) => parseCost(i.unitCostInput) <= 0)) {
      setError('Enter the supplier’s unit cost for every item with a supplier.');
      return;
    }

    startTransition(async () => {
      setError('');
      try {
        const res = await createPOFromMRF(mr.id, itemsToProcure.map((i: any) => ({
          consolidatedBoqItemId: i.consolidatedBoqItemId,
          quantity: i.quantity,
          unitCost: parseCost(i.unitCostInput),
          supplierId: i.supplierId
        })));
        
        if (res.success && res.createdPOIds) {
          if (res.createdPOIds.length === 1) {
            router.push(`/procurement/${res.createdPOIds[0]}`);
          } else {
            router.push(`/procurement/purchase-orders`);
          }
        } else {
          setError(res.error || 'Failed to generate PO');
          setValidationLogId(res.validationLogId || null);
        }
      } catch (err: any) {
        setError('Failed to generate PO: ' + err.message);
      }
    });
  };

  const handleOverride = async () => {
    if (!validationLogId || !overrideReason) return;
    const res = await submitAIOverrideRequest({
      validationLogId,
      transactionId: 'PENDING_PO_GEN',
      moduleName: 'Purchase Order Generation',
      overriddenBy: 'user-stub', // Use actual session later
      overriddenByRole: 'PURCHASING_OFFICER',
      overrideReason
    });
    
    if (res.success) {
      setOverrideSuccess(true);
      setError('Override Request Submitted! A Project Director must approve it before this PO is created.');
      setValidationLogId(null);
    } else {
      setError(res.error || 'Failed to submit override');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ backgroundColor: 'var(--bg-secondary)', padding: '30px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
      
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ color: 'var(--text-primary)', marginBottom: '5px' }}>Purchase Order Items</h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>Assign a supplier for each item. Items with different suppliers will automatically be split into separate Purchase Orders.</p>
        {suppliers.length === 0 && <p role="status" style={{ margin: '12px 0 0', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(250, 204, 21, 0.35)', background: 'rgba(161, 98, 7, 0.12)', color: '#fde68a', fontSize: '0.9rem' }}>No suppliers are set up yet, so there is nobody to order from. <a href="/procurement/suppliers/new" style={{ color: 'var(--accent-color)', fontWeight: 600 }}>Add a supplier</a>, then come back to this page.</p>}
        <p style={{ color: 'var(--text-secondary)', margin: '6px 0 0', fontSize: '0.85rem' }}>The budget price under each item comes from the approved procurement benchmark. Need supplier quotes first? Use <a href="/procurement/canvassing" style={{ color: 'var(--accent-color)' }}>Supplier Canvassing</a>, where quotes are compared with the budget.</p>
      </div>

      {error && (
        <div style={{ background: 'rgba(255, 107, 107, 0.1)', color: '#ff6b6b', padding: '15px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem', border: '1px solid rgba(255, 107, 107, 0.3)' }}>
          <div style={{ fontWeight: 600, marginBottom: '5px' }}>{error}</div>
          
          {validationLogId && !overrideSuccess && (
            <div style={{ marginTop: '15px', padding: '15px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
              <div style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '10px' }}>Apply for AI Exception Override:</div>
              <textarea 
                value={overrideReason} 
                onChange={e => setOverrideReason(e.target.value)} 
                placeholder="Justification for bypassing policy (e.g. Director requested specific supplier)..."
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

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left' }}>
            <th style={{ padding: '10px' }}>Item Code</th>
            <th style={{ padding: '10px' }}>Description</th>
            <th style={{ padding: '10px', textAlign: 'right' }}>Qty</th>
            <th style={{ padding: '10px', width: '250px' }}>Supplier</th>
            <th style={{ padding: '10px', width: '150px' }}>Unit Cost (₱)</th>
            <th style={{ padding: '10px', textAlign: 'right' }}>Total Cost</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => (
            <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: item.supplierId ? 1 : 0.6, transition: 'opacity 0.2s' }}>
              <td style={{ padding: '10px' }}>
                <div style={{ fontWeight: 'bold' }}>{item.itemCode}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.category}</div>
              </td>
              <td style={{ padding: '10px' }}>{item.description}</td>
              <td style={{ padding: '10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{item.quantity}{item.unit ? <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}> {item.unit}</span> : null}</td>
              <td style={{ padding: '10px' }}>
                <select 
                  value={item.supplierId} 
                  onChange={e => handleSupplierChange(item.id, e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}
                >
                  <option value="">-- Do Not Order Yet --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </td>
              <td style={{ padding: '10px' }}>
                <input 
                  type="text" 
                  required={item.supplierId !== ''}
                  disabled={item.supplierId === ''}
                  value={item.unitCostInput}
                  onChange={e => handleCostChange(item.id, e.target.value)}
                  onBlur={e => handleCostBlur(item.id, e.target.value)}
                  placeholder={item.supplierId ? 'Supplier price' : 'Choose a supplier'}
                  aria-label={`Unit cost for ${item.itemCode}`}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', opacity: item.supplierId ? 1 : 0.5 }}
                />
                {(() => {
                  // Budget guide, and how the typed price compares with it.
                  if (!item.budgetRate) return <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>No budget price</div>;
                  const cost = parseCost(item.unitCostInput);
                  const diff = cost - item.budgetRate;
                  return <div style={{ fontSize: '0.75rem', marginTop: '4px', color: 'var(--text-secondary)' }}>
                    Budget: {peso(item.budgetRate)}{item.unit ? ` / ${item.unit}` : ''}
                    {item.supplierId && cost > 0 && Math.abs(diff) >= 0.005 && <div style={{ color: diff > 0 ? '#fca5a5' : '#86efac', fontWeight: 600 }}>{peso(Math.abs(diff))} {diff > 0 ? 'above' : 'under'} budget ({diff > 0 ? '+' : '−'}{Math.abs((diff / item.budgetRate) * 100).toFixed(1)}%)</div>}
                  </div>;
                })()}
              </td>
              <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: 'var(--accent-color)', whiteSpace: 'nowrap' }}>
                {/* "₱ 0.00" read as a zero-value item; "—" means not priced yet. */}
                {item.supplierId && parseCost(item.unitCostInput) > 0
                  ? peso(item.quantity * parseCost(item.unitCostInput))
                  : <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>—{item.supplierId ? <span style={{ display: 'block', fontSize: '0.75rem' }}>Enter unit cost</span> : null}</span>}
                {item.budgetRate > 0 && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>Budget {peso(item.quantity * item.budgetRate)}</div>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} style={{ padding: '15px 10px', textAlign: 'right', fontWeight: 'bold', fontSize: '1.2rem' }}>Grand Total (Selected Items):</td>
            <td style={{ padding: '15px 10px', textAlign: 'right', fontWeight: 'bold', fontSize: '1.2rem', color: '#00ffa3', whiteSpace: 'nowrap' }}>
              {totalAmount > 0 ? peso(totalAmount) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
              {totalAmount > 0 || selectedBudget > 0 ? null : <div style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>Choose suppliers and prices</div>}
              {selectedBudget > 0 && <div style={{ fontSize: '0.8rem', fontWeight: 400, color: totalAmount > selectedBudget ? '#fca5a5' : 'var(--text-secondary)' }}>Budget {peso(selectedBudget)}{totalAmount > selectedBudget ? ' · above budget' : ''}</div>}
            </td>
          </tr>
        </tfoot>
      </table>

      <div style={{ textAlign: 'right' }}>
        <button 
          type="submit" 
          disabled={isPending}
          style={{
            backgroundColor: '#00ffa3', color: '#000', padding: '12px 24px', borderRadius: '8px', 
            border: 'none', fontWeight: 'bold', fontSize: '1.1rem', cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.7 : 1
          }}
        >
          {isPending ? 'Generating PO(s)...' : 'Generate & Submit Purchase Order(s)'}
        </button>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px' }}>This will submit the PO(s) for the Project Director's approval.</p>
      </div>
    </form>
  );
}
