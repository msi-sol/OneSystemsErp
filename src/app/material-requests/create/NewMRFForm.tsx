'use client';

import React, { useState, useTransition } from 'react';
import { generateMRFFromConsolidated } from '@/app/actions/mutations';
import { useRouter } from 'next/navigation';
import { materialQuantity } from '@/lib/procurement/material-values';

interface ConsolidatedItem {
  id: string;
  itemCode: string;
  category: string | null;
  description: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  deliveredQty: number;
  isVariationItem?: boolean;
  sourceVoNumber?: string | null;
  revisedQuantity?: number;
  voAdditiveQty?: number;
  voDeductiveQty?: number;
}

interface Props {
  projectId: string;
  items: ConsolidatedItem[];
  users: { id: string; name: string | null }[];
}

export default function NewMRFForm({ projectId, items, users }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number | string>>({});

  const [purpose, setPurpose] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [locationOfUse, setLocationOfUse] = useState('');
  
  // Default to today
  const [dateNeeded, setDateNeeded] = useState(() => new Date().toISOString().split('T')[0]);
  
  const [requesterId, setRequesterId] = useState(users[0]?.id || '');
  const [error, setError] = useState('');
  
  // Dropdown states
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Items are already filtered in page.tsx, but just to be safe
  const validBOQItems = items.filter(item => !(item.unit?.toLowerCase().includes('lot') || false));

  // Filter for the dropdown search
  const filteredDropdownItems = validBOQItems.filter(item => 
    !selectedItems.has(item.id) &&
    (item.itemCode?.toLowerCase().includes(searchQuery.toLowerCase()) || 
     item.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     item.category?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  function handleQuantityChange(itemId: string, value: string) {
    if (value === '') {
      setQuantities(prev => ({ ...prev, [itemId]: '' }));
    } else {
      const num = parseFloat(value) || 0;
      setQuantities(prev => ({ ...prev, [itemId]: num }));
    }
  }

  function handleItemSelect(itemId: string) {
    if (!itemId) return;
    
    // Auto-add to selected items
    const newSet = new Set(selectedItems);
    newSet.add(itemId);
    setSelectedItems(newSet);
  }

  function handleRemoveItem(itemId: string) {
    const newSet = new Set(selectedItems);
    newSet.delete(itemId);
    setSelectedItems(newSet);
    
    // Also clear qty
    setQuantities(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }

  function handleSubmit() {
    setError('');
    
    const validItemsToSubmit = items
      .filter(item => selectedItems.has(item.id))
      .map(item => ({
        consolidatedBoqItemId: item.id,
        quantity: typeof quantities[item.id] === 'number' ? quantities[item.id] as number : 0,
      }))
      .filter(req => req.quantity > 0);

    if (validItemsToSubmit.length === 0) {
      setError('Please add at least one item and specify a quantity greater than 0.');
      return;
    }

    if (!requesterId) {
      setError('Please select a requester.');
      return;
    }

    startTransition(async () => {
      try {
        const mrId = await generateMRFFromConsolidated({
          projectId,
          requesterId,
          purpose,
          priority,
          locationOfUse,
          dateNeeded,
          remarks: '',
          items: validItemsToSubmit,
        });
        router.push(`/material-requests/${mrId}`);
      } catch (err: any) {
        setError(err.message || 'Failed to generate MRF.');
      }
    });
  }

  // Get full object of selected items to render
  const selectedItemsList = validBOQItems.filter(item => selectedItems.has(item.id));

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '30px' }}>
      
      {/* SECTION 1: REQUEST DETAILS */}
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        padding: '30px',
        borderRadius: '16px',
        border: '1px solid var(--glass-border)',
      }}>
        <h2 style={{ margin: '0 0 20px 0', color: 'var(--text-primary)', fontSize: '1.2rem' }}>Request Details</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>
              Requested By *
            </label>
            <select
              value={requesterId}
              onChange={e => setRequesterId(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)',
                color: 'var(--text-primary)', fontSize: '0.9rem',
              }}
            >
              <option value="">-- Select --</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>
              Priority
            </label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)',
                color: 'var(--text-primary)', fontSize: '0.9rem',
              }}
            >
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>
              Date Needed
            </label>
            <input
              type="date"
              value={dateNeeded}
              onChange={e => setDateNeeded(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)',
                color: 'var(--text-primary)', fontSize: '0.9rem',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>
              Location of Use
            </label>
            <input
              type="text"
              value={locationOfUse}
              onChange={e => setLocationOfUse(e.target.value)}
              placeholder="e.g., 3rd Floor OR"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)',
                color: 'var(--text-primary)', fontSize: '0.9rem',
              }}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>
              Purpose
            </label>
            <input
              type="text"
              value={purpose}
              onChange={e => setPurpose(e.target.value)}
              placeholder="Brief reason for request..."
              style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)',
                color: 'var(--text-primary)', fontSize: '0.9rem',
              }}
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: ADD BOQ ITEMS */}
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        padding: '30px',
        borderRadius: '16px',
        border: '1px solid var(--glass-border)',
      }}>
        <h2 style={{ margin: '0 0 20px 0', color: 'var(--text-primary)', fontSize: '1.2rem' }}>Material Selection</h2>

        <div style={{ marginBottom: '20px', position: 'relative' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search by Code, Category, or Description to select material..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              style={{
                width: '100%', padding: '12px 15px', borderRadius: '8px', border: '1px solid var(--glass-border)',
                backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.95rem'
              }}
            />
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              style={{ 
                padding: '12px 15px', borderRadius: '8px', border: '1px solid var(--glass-border)',
                backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap'
              }}
            >
              {isDropdownOpen ? 'Close List' : 'Browse All'}
            </button>
          </div>

          {isDropdownOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '8px',
              backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: '8px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 50,
              maxHeight: '400px', overflowY: 'auto'
            }}>
              {filteredDropdownItems.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No matching items available.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: '#1a1a2e', zIndex: 51 }}>
                    <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                      <th style={{ padding: '10px 15px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Code</th>
                      <th style={{ padding: '10px 15px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Category</th>
                      <th style={{ padding: '10px 15px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Description</th>
                      <th style={{ padding: '10px 15px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Awarded Qty</th>
                      <th style={{ padding: '10px 15px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Unit</th>
                      <th style={{ padding: '10px 15px', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDropdownItems.map(item => {
                      const effectiveQty = materialQuantity(item);
                      const isVO = item.isVariationItem;
                      return (
                        <tr 
                          key={item.id} 
                          onClick={() => {
                            handleItemSelect(item.id);
                            setIsDropdownOpen(false);
                            setSearchQuery('');
                          }}
                          style={{ 
                            borderBottom: '1px solid rgba(255,255,255,0.05)', 
                            cursor: 'pointer',
                            backgroundColor: isVO ? 'rgba(0,200,83,0.05)' : 'transparent',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isVO ? 'rgba(0,200,83,0.1)' : 'rgba(255,255,255,0.05)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isVO ? 'rgba(0,200,83,0.05)' : 'transparent'}
                        >
                          <td style={{ padding: '12px 15px', color: 'var(--text-primary)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                            {isVO && <span style={{ marginRight: '6px', fontSize: '0.65rem', background: 'rgba(0,200,83,0.2)', color: '#00c853', padding: '2px 6px', borderRadius: '8px' }}>VO</span>}
                            {item.itemCode}
                          </td>
                          <td style={{ padding: '12px 15px', color: 'var(--text-secondary)' }}>{item.category || '-'}</td>
                          <td style={{ padding: '12px 15px', color: 'var(--text-primary)' }}>{item.description}</td>
                          <td style={{ padding: '12px 15px', color: 'var(--text-primary)', textAlign: 'center', fontWeight: 'bold' }}>{effectiveQty}</td>
                          <td style={{ padding: '12px 15px', color: 'var(--text-secondary)', textAlign: 'center' }}>{item.unit || '-'}</td>
                          <td style={{ padding: '12px 15px', textAlign: 'center' }}>
                            <button 
                              style={{ 
                                padding: '4px 10px', borderRadius: '4px', border: '1px solid var(--accent-color)', 
                                backgroundColor: 'transparent', color: 'var(--accent-color)', cursor: 'pointer',
                                fontSize: '0.75rem', fontWeight: 'bold'
                              }}
                            >
                              + Add
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* SELECTED ITEMS TABLE */}
        {selectedItemsList.length > 0 ? (
          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(0,255,163,0.08)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', borderBottom: '1px solid var(--glass-border)' }}>Code</th>
                  <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-secondary)', borderBottom: '1px solid var(--glass-border)' }}>Description</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)', borderBottom: '1px solid var(--glass-border)' }}>Unit</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: 'var(--text-secondary)', borderBottom: '1px solid var(--glass-border)' }}>Benchmark Balance</th>
                  <th style={{ padding: '12px', textAlign: 'right', color: 'var(--accent-color)', borderBottom: '1px solid var(--glass-border)', fontWeight: 'bold', width: '120px' }}>Request Qty</th>
                  <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)', borderBottom: '1px solid var(--glass-border)', width: '60px' }}></th>
                </tr>
              </thead>
              <tbody>
                {selectedItemsList.map(item => {
                  const effectiveQty = materialQuantity(item);
                  const balance = Math.max(0, effectiveQty - item.deliveredQty);
                  const isOverRequest = typeof quantities[item.id] === 'number' && (quantities[item.id] as number) > balance;
                  const isVO = item.isVariationItem;

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: isVO ? 'rgba(0,200,83,0.05)' : undefined }}>
                      <td style={{ padding: '12px', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                        {item.itemCode}
                        {isVO && (
                          <span style={{ marginLeft: '6px', fontSize: '0.65rem', background: 'rgba(0,200,83,0.2)', color: '#00c853', padding: '2px 6px', borderRadius: '8px', fontWeight: 'bold' }}>VO</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{item.description}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)' }}>{item.unit || '-'}</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                        {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={quantities[item.id] !== undefined ? quantities[item.id] : ''}
                          onChange={e => handleQuantityChange(item.id, e.target.value)}
                          style={{
                            width: '100%', padding: '6px 8px', borderRadius: '6px', textAlign: 'right',
                            border: isOverRequest ? '2px solid #ef4444' : '1px solid var(--glass-border)',
                            backgroundColor: 'var(--bg-dark)',
                            color: isOverRequest ? '#ef4444' : 'var(--text-primary)',
                            fontSize: '0.9rem', fontWeight: 'bold',
                          }}
                        />
                        {isOverRequest && (
                          <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '4px', textAlign: 'right' }}>
                            Exceeds balance
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <button 
                          onClick={() => handleRemoveItem(item.id)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem' }}
                          title="Remove item"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)', border: '1px dashed var(--glass-border)', borderRadius: '8px' }}>
            No items added yet. Search and select items from the dropdown above.
          </div>
        )}

        {error && (
          <div style={{ padding: '15px', marginTop: '20px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={isPending || selectedItemsList.length === 0}
          style={{
            marginTop: '20px', padding: '15px', borderRadius: '8px', border: 'none',
            background: 'linear-gradient(135deg, #00ffa3, #00cc82)',
            color: '#000', cursor: (isPending || selectedItemsList.length === 0) ? 'not-allowed' : 'pointer',
            fontSize: '1.1rem', fontWeight: 'bold',
            opacity: (isPending || selectedItemsList.length === 0) ? 0.7 : 1,
            boxShadow: '0 4px 15px rgba(0,255,163,0.3)',
            width: '100%'
          }}
        >
          {isPending ? 'Generating MRF...' : `Submit Material Request (${selectedItemsList.length} items)`}
        </button>
      </div>

    </div>
  );
}
