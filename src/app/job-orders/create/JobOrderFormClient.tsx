// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import { createJobOrder, updateJobOrder, getConsolidatedBoqItemsByProjectId } from '@/app/actions/jobOrderActions';
import { useRouter } from 'next/navigation';
import { subcontractorTrade } from '@/lib/subcontracting/subcontractor-trade';

interface SelectedBoqItem {
  id: string;
  joCost: number; // user-entered JO cost for this item (used in individual mode)
}

export default function JobOrderFormClient({ projects, subcontractors, initialData }: { projects: any[], subcontractors: any[], initialData?: any }) {
  const router = useRouter();
  
  const defaultFormState = {
    projectId: '',
    subcontractorId: '',
    jobNumber: '',
    boqReferenceIds: [] as string[],
    description: '',
    jobOrderType: 'LABOR_ONLY',
    location: '',
    contractAmount: 0,
    paymentBasis: 'MILESTONE',
    materialResponsibility: 'COMPANY_SUPPLIED',
    startDate: '',
    durationDays: '',
    completionDate: ''
  };

  const [formData, setFormData] = useState(() => {
    if (initialData) {
      const start = initialData.startDate ? new Date(initialData.startDate) : null;
      const end = initialData.completionDate ? new Date(initialData.completionDate) : null;
      
      let duration = '';
      if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const diffTime = Math.abs(end.getTime() - start.getTime());
        duration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)).toString();
      }

      return {
        ...defaultFormState,
        ...initialData,
        boqReferenceIds: initialData.boqReferenceIds || [],
        startDate: start && !isNaN(start.getTime()) ? start.toISOString().split('T')[0] : '',
        completionDate: end && !isNaN(end.getTime()) ? end.toISOString().split('T')[0] : '',
        durationDays: duration
      };
    }
    return defaultFormState;
  });

  const [isBoqModalOpen, setIsBoqModalOpen] = useState(false);
  const [isOneLot, setIsOneLot] = useState(() => {
    // If editing and '1_LOT' was in the refs, start in lump sum mode
    return initialData?.boqReferenceIds?.includes('1_LOT') || false;
  });
  const [lumpSumValue, setLumpSumValue] = useState(initialData?.contractAmount || 0);
  const [selectedBoqItems, setSelectedBoqItems] = useState<SelectedBoqItem[]>([]);

  // Auto-generate job number on mount if creating
  useEffect(() => {
    if (!initialData) {
      setFormData(prev => ({ ...prev, jobNumber: `JO-${Math.floor(Date.now() / 1000)}` }));
    }
  }, [initialData]);

  // Auto-calculate completion date based on start date and duration days
  useEffect(() => {
    if (formData.startDate && formData.durationDays) {
      const start = new Date(formData.startDate);
      if (!isNaN(start.getTime())) {
        const duration = parseInt(formData.durationDays.toString(), 10);
        if (!isNaN(duration) && duration > 0) {
          const completion = new Date(start);
          completion.setDate(completion.getDate() + duration);
          
          const yyyy = completion.getFullYear();
          const mm = String(completion.getMonth() + 1).padStart(2, '0');
          const dd = String(completion.getDate()).padStart(2, '0');
          
          setFormData(prev => ({
            ...prev,
            completionDate: `${yyyy}-${mm}-${dd}`
          }));
        }
      }
    }
  }, [formData.startDate, formData.durationDays]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [boqItems, setBoqItems] = useState<any[]>([]);
  
  const JOB_ORDER_THRESHOLD = 250000;

  // Fetch BOQ Items when Project changes
  useEffect(() => {
    async function fetchBoqItems() {
      if (formData.projectId) {
        const res = await getConsolidatedBoqItemsByProjectId(formData.projectId);
        if (res.success && res.items) {
          setBoqItems(res.items);
        } else {
          setBoqItems([]);
        }
      } else {
        setBoqItems([]);
      }
    }
    fetchBoqItems();
  }, [formData.projectId]);

  // Sync contractAmount from individual item totals or lump sum
  useEffect(() => {
    if (isOneLot) {
      setFormData(prev => ({ ...prev, contractAmount: lumpSumValue }));
    } else if (selectedBoqItems.length > 0) {
      const total = selectedBoqItems.reduce((sum, item) => sum + (item.joCost || 0), 0);
      setFormData(prev => ({ ...prev, contractAmount: total }));
    }
  }, [selectedBoqItems, isOneLot, lumpSumValue]);

  // Auto-deduplicate selected items in case of hot-reload or fast clicking
  useEffect(() => {
    const uniqueIds = new Set();
    const deduped = selectedBoqItems.filter(item => {
      if (uniqueIds.has(item.id)) return false;
      uniqueIds.add(item.id);
      return true;
    });
    if (deduped.length !== selectedBoqItems.length) {
      setSelectedBoqItems(deduped);
    }
  }, [selectedBoqItems]);

  // Sync boqReferenceIds from selectedBoqItems
  useEffect(() => {
    const ids = selectedBoqItems.map(s => s.id);
    if (isOneLot) {
      setFormData(prev => ({ ...prev, boqReferenceIds: ['1_LOT', ...Array.from(new Set(ids))] }));
    } else if (ids.length > 0) {
      setFormData(prev => ({ ...prev, boqReferenceIds: Array.from(new Set(ids)) }));
    } else {
      setFormData(prev => ({ ...prev, boqReferenceIds: [] }));
    }
  }, [selectedBoqItems, isOneLot]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'contractAmount' ? parseFloat(value) || 0 : value
    }));
  };

  const handleToggleBoqItem = (itemId: string, checked: boolean) => {
    if (checked) {
      const masterItem = boqItems.find(b => b.id === itemId);
      const masterCost = masterItem ? (parseFloat(masterItem.quantity) || 0) * (parseFloat(masterItem.combinedUnitCost) || 0) : 0;
      
      setSelectedBoqItems(prev => {
        // Guard inside functional updater to prevent simultaneous event duplicates
        if (prev.some(s => s.id === itemId)) return prev;
        return [...prev, { id: itemId, joCost: masterCost }];
      });
    } else {
      setSelectedBoqItems(prev => prev.filter(s => s.id !== itemId));
    }
  };

  const handleJoCostChange = (itemId: string, value: number) => {
    setSelectedBoqItems(prev => prev.map(s => s.id === itemId ? { ...s, joCost: value } : s));
  };

  // Compute proportional allocations for 1 Lot mode
  const getAllocatedCosts = () => {
    if (!isOneLot || selectedBoqItems.length === 0 || lumpSumValue <= 0) return {};

    let grandMasterTotal = 0;
    const masterTotals: Record<string, number> = {};
    
    selectedBoqItems.forEach(sel => {
      const masterItem = boqItems.find(a => a.id === sel.id);
      if (masterItem) {
        const cost = (parseFloat(masterItem.quantity) || 0) * (parseFloat(masterItem.combinedUnitCost) || 0);
        masterTotals[sel.id] = cost;
        grandMasterTotal += cost;
      }
    });

    // lumpSumPercentage: how much % of the grand total the lump sum represents
    const lumpSumPercentage = grandMasterTotal > 0 ? (lumpSumValue / grandMasterTotal) * 100 : 0;

    const allocations: Record<string, { total: number, percentage: number, shareOfLumpSum: number }> = {};
    
    selectedBoqItems.forEach(sel => {
      const masterCost = masterTotals[sel.id] || 0;
      const percentage = grandMasterTotal > 0 ? (masterCost / grandMasterTotal) : 0;
      const allocatedTotal = lumpSumValue * percentage;
      // This item's share percentage of the lump sum value itself
      const shareOfLumpSum = lumpSumValue > 0 ? (allocatedTotal / lumpSumValue) * 100 : 0;
      
      allocations[sel.id] = {
        total: allocatedTotal,
        percentage: percentage * 100,
        shareOfLumpSum
      };
    });
    
    return { allocations, grandMasterTotal, lumpSumPercentage };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    let res;
    if (initialData?.id) {
      res = await updateJobOrder(initialData.id, formData);
    } else {
      res = await createJobOrder(formData);
    }
    
    if (res.success) {
      router.push('/job-orders/dashboard');
    } else {
      setError(res.error || `Failed to ${initialData ? 'update' : 'create'} Job Order`);
    }
    setLoading(false);
  };

  // Helper: get item label for display
  const getItemLabel = (id: string) => {
    if (id === '1_LOT') return '1 Lot (Lump Sum Works)';
    if (id === 'ADDITIONAL_WORKS') return 'Management Approved Additional Works';
    const found = boqItems.find(item => item.id === id);
    return found ? (found.itemCode ? `${found.itemCode} - ${found.description}` : found.description) : id;
  };

  const allocData = getAllocatedCosts();
  const allocations = allocData && 'allocations' in allocData ? allocData.allocations : {};
  const grandMasterTotal = allocData && 'grandMasterTotal' in allocData ? allocData.grandMasterTotal : 0;
  const lumpSumPercentage = allocData && 'lumpSumPercentage' in allocData ? allocData.lumpSumPercentage : 0;

  return (
    <form className="form-wrapper" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px', color: '#111827' }}>
      <style>{`
        .form-wrapper input:not([type="checkbox"]),
        .form-wrapper select,
        .form-wrapper textarea {
          background-color: #ffffff !important;
          color: #111827 !important;
          border: 1px solid #d1d5db !important;
          box-sizing: border-box !important;
          width: 100% !important;
        }
        .form-wrapper input:not([type="checkbox"]):focus,
        .form-wrapper select:focus,
        .form-wrapper textarea:focus {
          border-color: #3b82f6 !important;
          outline: none !important;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2) !important;
        }
        .form-wrapper label {
          color: #374151 !important;
        }
        .boq-item-row:hover {
          border-color: #3b82f6 !important;
        }
      `}</style>
      
      {error && <div style={{ padding: '12px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px' }}>{error}</div>}
      
      {formData.contractAmount > JOB_ORDER_THRESHOLD && (
        <div style={{ padding: '16px', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '4px', borderLeft: '4px solid #f59e0b' }}>
          <strong>⚠️ Threshold Exceeded:</strong> The Job Order amount (₱{formData.contractAmount.toLocaleString()}) exceeds the standard limit of ₱{JOB_ORDER_THRESHOLD.toLocaleString()}. It is highly recommended to convert this to a full subcontract package.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontWeight: '500' }}>Job Order Number</label>
        <input type="text" name="jobNumber" value={formData.jobNumber} readOnly style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#f3f4f6 !important', color: '#6b7280 !important', cursor: 'not-allowed' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: '500' }}>Project</label>
          <select name="projectId" value={formData.projectId} onChange={handleChange} required style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#f9fafb' }}>
            <option value="">Select Project</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.contractNumber} - {p.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: '500' }}>Subcontractor</label>
          <select name="subcontractorId" value={formData.subcontractorId} onChange={handleChange} required style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#f9fafb' }}>
            <option value="">Select Subcontractor</option>
            {subcontractors.map(s => (
              <option key={s.id} value={s.id}>{s.name}{subcontractorTrade(s) ? ` (${subcontractorTrade(s)})` : ''}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: '500' }}>Job Order Type</label>
          <select name="jobOrderType" value={formData.jobOrderType} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#f9fafb' }}>
            <option value="LABOR_ONLY">Labor Only</option>
            <option value="LABOR_AND_MATERIALS">Labor &amp; Materials</option>
            <option value="EQUIPMENT_RENTAL">Equipment Rental</option>
            <option value="RECTIFICATION_WORKS">Rectification / Punchlist</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: '500' }}>Material Responsibility</label>
          <select name="materialResponsibility" value={formData.materialResponsibility} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#f9fafb' }}>
            <option value="COMPANY_SUPPLIED">Company Supplied</option>
            <option value="CONTRACTOR_SUPPLIED">Contractor Supplied</option>
            <option value="MIXED">Mixed</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: '500' }}>Specific Location / Area</label>
          <input type="text" name="location" value={formData.location} onChange={handleChange} required placeholder="e.g. Ground Floor, Zone 1" style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#f9fafb' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: '500' }}>Start Date</label>
          <input type="date" name="startDate" value={formData.startDate} onChange={handleChange} required style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#f9fafb' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: '500' }}>Duration (Calendar Days)</label>
          <input type="number" name="durationDays" value={formData.durationDays} onChange={handleChange} min="1" placeholder="e.g. 30" style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#f9fafb' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: '500' }}>Target Completion</label>
          <input type="date" name="completionDate" value={formData.completionDate} onChange={handleChange} required style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#f9fafb' }} />
        </div>
      </div>

      {/* ================= BOQ / SCOPE REFERENCE SECTION ================= */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ backgroundColor: '#f9fafb', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#111827' }}>BOQ / Scope Reference</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
            Select BOQ items and enter the Job Order cost for each, or use 1 Lot (Lump Sum) to distribute a single value across selected items.
          </p>
        </div>

        <div style={{ padding: '20px' }}>
          {/* Pricing Mode Toggle */}
          <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold', cursor: 'pointer', color: '#1e3a8a' }}>
              <input 
                type="checkbox" 
                checked={isOneLot} 
                onChange={(e) => {
                  setIsOneLot(e.target.checked);
                  if (!e.target.checked) {
                    // Switching back to individual mode: reset joCosts to master costs
                    setSelectedBoqItems(prev => prev.map(s => {
                      const masterItem = boqItems.find(b => b.id === s.id);
                      const masterCost = masterItem ? (parseFloat(masterItem.quantity) || 0) * (parseFloat(masterItem.combinedUnitCost) || 0) : 0;
                      return { ...s, joCost: masterCost };
                    }));
                  }
                }} 
                style={{ width: '18px', height: '18px' }} 
              />
              Price as 1 Lot (Lump Sum Works)
            </label>
            <p style={{ margin: '6px 0 0 28px', fontSize: '0.85rem', color: '#3b82f6' }}>
              {isOneLot 
                ? 'Enter a lump sum value below. It will be proportionally distributed to all selected items based on their master BOQ weights.' 
                : 'Each selected item will have its own Job Order cost entered individually.'}
            </p>

            {isOneLot && (
              <div style={{ marginTop: '16px', marginLeft: '28px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#1e40af', marginBottom: '4px', fontWeight: '600' }}>Lump Sum Value (₱)</label>
                <input 
                  type="number" 
                  value={lumpSumValue} 
                  onChange={(e) => setLumpSumValue(parseFloat(e.target.value) || 0)}
                  min="0"
                  step="0.01"
                  placeholder="e.g. 50000"
                  style={{ maxWidth: '300px', padding: '10px', borderRadius: '6px', border: '1px solid #93c5fd', backgroundColor: '#ffffff', color: '#111827', fontWeight: 'bold', fontSize: '1.1rem' }}
                />
              </div>
            )}
          </div>

          {/* Selected Items Counter */}
          {selectedBoqItems.length > 0 && (
            <div style={{ marginBottom: '16px', padding: '12px 16px', backgroundColor: '#dbeafe', borderRadius: '8px', border: '1px solid #93c5fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: '600', color: '#1e40af' }}>
                ✅ {selectedBoqItems.length} item{selectedBoqItems.length !== 1 ? 's' : ''} selected
                {isOneLot && ` — Lump Sum: ₱${lumpSumValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
              <button 
                type="button" 
                onClick={() => setSelectedBoqItems([])} 
                style={{ padding: '4px 12px', backgroundColor: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}
              >
                Clear All
              </button>
            </div>
          )}

          {/* BOQ Items List */}
          {formData.projectId ? (
            boqItems.length === 0 ? (
              <div style={{ padding: '20px', backgroundColor: '#f9fafb', textAlign: 'center', borderRadius: '8px', color: '#6b7280' }}>No Awarded BOQ items found for this project.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '500px', overflowY: 'auto', paddingRight: '4px' }}>
                {boqItems.map(item => {
                  const isSelected = selectedBoqItems.some(s => s.id === item.id);
                  const selectedItem = selectedBoqItems.find(s => s.id === item.id);
                  const masterCost = (parseFloat(item.quantity) || 0) * (parseFloat(item.combinedUnitCost) || 0);
                  const alloc = allocations?.[item.id];

                  return (
                    <div 
                      key={item.id} 
                      className="boq-item-row"
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '14px', 
                        padding: '14px 16px', 
                        border: `1px solid ${isSelected ? '#3b82f6' : '#e5e7eb'}`, 
                        borderRadius: '8px', 
                        backgroundColor: isSelected ? '#eff6ff' : '#fff', 
                        transition: 'all 0.2s',
                        cursor: 'pointer'
                      }}
                      onClick={() => handleToggleBoqItem(item.id, !isSelected)}
                    >
                      <input 
                        type="checkbox" 
                        checked={isSelected} 
                        onChange={(e) => {
                          e.stopPropagation();
                          handleToggleBoqItem(item.id, e.target.checked);
                        }} 
                        style={{ width: '20px', height: '20px', cursor: 'pointer', flexShrink: 0 }}
                      />
                      
                      {/* Item Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <span style={{ fontWeight: '600', color: '#111827' }}>{item.itemCode}</span>
                          <span style={{ color: '#6b7280', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                            Master: ₱{masterCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                          {item.category && (
                            <span style={{ backgroundColor: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: '600', flexShrink: 0 }}>
                              {item.category}
                            </span>
                          )}
                          <span style={{ color: '#4b5563', fontSize: '0.85rem', lineHeight: '1.3' }}>{item.description}</span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '2px' }}>
                          {item.quantity} {item.unit} @ ₱{item.combinedUnitCost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>

                      {/* Right side: JO Cost or Allocated Cost */}
                      {isSelected && (
                        <div style={{ flexShrink: 0, textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          {isOneLot ? (
                            // LUMP SUM MODE: show computed allocation
                            <div>
                              <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: '2px' }}>
                                Share: {alloc ? alloc.percentage.toFixed(2) : '0.00'}%
                              </div>
                              <div style={{ fontWeight: 'bold', color: '#059669', fontSize: '1rem' }}>
                                ₱{alloc ? alloc.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                              </div>
                            </div>
                          ) : (
                            // INDIVIDUAL MODE: editable JO cost
                            <div>
                              <label style={{ display: 'block', fontSize: '0.72rem', color: '#6b7280', marginBottom: '2px' }}>JO Cost (₱)</label>
                              <input 
                                type="number"
                                value={selectedItem?.joCost || 0}
                                onChange={(e) => handleJoCostChange(item.id, parseFloat(e.target.value) || 0)}
                                min="0"
                                step="0.01"
                                style={{ width: '130px', padding: '6px 8px', borderRadius: '4px', border: '1px solid #93c5fd', backgroundColor: '#fff', color: '#111827', fontWeight: '600', textAlign: 'right' }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div style={{ padding: '20px', backgroundColor: '#fef3c7', color: '#d97706', textAlign: 'center', borderRadius: '8px' }}>Please select a Project first to load BOQ items.</div>
          )}
        </div>

        {/* Summary Footer */}
        {selectedBoqItems.length > 0 && (
          <div style={{ padding: '16px 20px', backgroundColor: '#f0fdf4', borderTop: '1px solid #bbf7d0' }}>
            {isOneLot && grandMasterTotal > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#166534', fontSize: '0.95rem' }}>Lump Sum Distribution Breakdown</h4>
                {/* Per-item breakdown table */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', padding: '6px 10px', backgroundColor: '#dcfce7', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700', color: '#166534' }}>
                    <span style={{ flex: 1 }}>Item</span>
                    <span style={{ width: '130px', textAlign: 'right' }}>Master BOQ Value</span>
                    <span style={{ width: '80px', textAlign: 'right' }}>Share %</span>
                    <span style={{ width: '120px', textAlign: 'right' }}>Allocated (₱)</span>
                  </div>
                  {selectedBoqItems.map((sel, index) => {
                    const masterItem = boqItems.find(b => b.id === sel.id);
                    const alloc = allocations?.[sel.id];
                    const masterCost = masterItem ? (parseFloat(masterItem.quantity) || 0) * (parseFloat(masterItem.combinedUnitCost) || 0) : 0;
                    return (
                      <div key={`${sel.id}-${index}`} style={{ display: 'flex', padding: '6px 10px', backgroundColor: '#fff', borderRadius: '4px', border: '1px solid #dcfce7', fontSize: '0.82rem', color: '#374151' }}>
                        <span style={{ flex: 1, fontWeight: '600' }}>{masterItem?.itemCode || sel.id}</span>
                        <span style={{ width: '130px', textAlign: 'right' }}>₱{masterCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span style={{ width: '80px', textAlign: 'right', color: '#1e40af', fontWeight: '600' }}>{alloc ? alloc.percentage.toFixed(2) : '0.00'}%</span>
                        <span style={{ width: '120px', textAlign: 'right', fontWeight: 'bold', color: '#059669' }}>₱{alloc ? alloc.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</span>
                      </div>
                    );
                  })}
                  {/* Totals row */}
                  <div style={{ display: 'flex', padding: '8px 10px', backgroundColor: '#dcfce7', borderRadius: '4px', fontSize: '0.85rem', fontWeight: '700', color: '#166534', borderTop: '2px solid #86efac' }}>
                    <span style={{ flex: 1 }}>TOTALS ({selectedBoqItems.length} items)</span>
                    <span style={{ width: '130px', textAlign: 'right' }}>₱{grandMasterTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span style={{ width: '80px', textAlign: 'right' }}>100.00%</span>
                    <span style={{ width: '120px', textAlign: 'right' }}>₱{lumpSumValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#1e40af', padding: '4px 0' }}>
                  <span>Lump Sum ₱{lumpSumValue.toLocaleString()} as % of Grand Total ₱{grandMasterTotal.toLocaleString()}:</span>
                  <strong>{lumpSumPercentage.toFixed(2)}%</strong>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.1rem', padding: '8px 0 0 0', borderTop: '1px solid #86efac' }}>
              <span style={{ fontWeight: '600', color: '#166534' }}>
                Job Order Contract Amount
              </span>
              <strong style={{ color: '#059669', fontSize: '1.25rem' }}>
                ₱{formData.contractAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontWeight: '500' }}>Scope of Work / Description</label>
        <textarea name="description" value={formData.description} onChange={handleChange} required rows={4} placeholder="Detailed description of the short-duration works..." style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: '#f9fafb', resize: 'vertical' }}></textarea>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
        <button type="submit" disabled={loading} style={{ padding: '10px 24px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Saving...' : (initialData ? 'Update Job Order' : 'Create Job Order')}
        </button>
      </div>
    </form>
  );
}
