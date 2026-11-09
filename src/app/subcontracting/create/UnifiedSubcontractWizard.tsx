// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAwardedBoqItemsByProjectId, createFullSubcontractPackage, updateFullSubcontractPackage } from '@/app/actions/subcontractingActions';
import { subcontractorTrade } from '@/lib/subcontracting/subcontractor-trade';

export default function UnifiedSubcontractWizard({ 
  projects, 
  subcontractors, 
  initialData, 
  isEdit = false 
}: { 
  projects: any[], 
  subcontractors: any[],
  initialData?: any,
  isEdit?: boolean
}) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOneLot, setIsOneLot] = useState(false);
  const [lotPriceStr, setLotPriceStr] = useState(initialData?.contractAmount ? initialData.contractAmount.toString() : '');

  // --- STATE: Step 1 (Package Details) ---
  const [packageData, setPackageData] = useState({
    projectId: initialData?.projectId || '',
    subcontractorId: initialData?.subcontractorId || '',
    workCategory: initialData?.workCategory || '',
    contractType: initialData?.contractType || 'SUPPLY_INSTALL',
    scopeOfWork: initialData?.scopeOfWork || '',
    location: initialData?.location || '',
    quantity: initialData?.quantity || 1,
    unit: initialData?.unit || 'LOT',
    unitCost: initialData?.unitCost || 0,
    contractAmount: initialData?.contractAmount || 0,
    costType: initialData?.costType || 'DIRECT',
    paymentTerms: initialData?.paymentTerms || 'PROGRESS',
    startDate: initialData?.startDate ? new Date(initialData.startDate).toISOString().split('T')[0] : '',
    targetCompletion: initialData?.targetCompletion ? new Date(initialData.targetCompletion).toISOString().split('T')[0] : ''
  });

  // --- STATE: Step 2 (BOQ Items) ---
  const [awardedBoqItems, setAwardedBoqItems] = useState<any[]>([]);
  const [selectedBoqItems, setSelectedBoqItems] = useState<any[]>([]);

  // Fetch BOQ Items when Project changes, and map initial selected BOQs
  useEffect(() => {
    async function fetchBoq() {
      if (packageData.projectId) {
        const res = await getAwardedBoqItemsByProjectId(packageData.projectId);
        if (res.success && res.items) {
          setAwardedBoqItems(res.items);
          
          if (isEdit && initialData?.subcontractor?.subcontractorBOQItems) {
            // Map the initial selected items back into state
            const existingBoqs = initialData.subcontractor.subcontractorBOQItems.map((sbi: any) => ({
              id: sbi.awardedBoqItemId,
              subcontractorQuantity: sbi.quantity,
              subcontractorUnitCost: sbi.unitCost
            }));
            setSelectedBoqItems(existingBoqs);
            
            // Check if one lot
            const sumCosts = existingBoqs.reduce((s: number, b: any) => s + b.subcontractorUnitCost, 0);
            if (sumCosts === 0 && initialData.contractAmount > 0 && existingBoqs.length > 0) {
              setIsOneLot(true);
            }
          }
        } else {
          setAwardedBoqItems([]);
        }
      } else {
        setAwardedBoqItems([]);
      }
    }
    fetchBoq();
  }, [packageData.projectId, isEdit]);

  const handleBoqSelection = (item: any, isSelected: boolean) => {
    if (isSelected) {
      setSelectedBoqItems(prev => [...prev, { ...item, subcontractorQuantity: item.quantity, subcontractorUnitCost: item.combinedUnitCost }]);
    } else {
      setSelectedBoqItems(prev => prev.filter(i => i.id !== item.id));
    }
  };

  const updateSelectedBoqValue = (id: string, field: string, value: string) => {
    setSelectedBoqItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  // --- STATE: Step 3 (Program of Works) ---
  const powInitial = initialData?.programOfWorks?.[0] || {};
  const [powData, setPowData] = useState({
    title: powInitial.title || 'Initial Program of Works',
    description: powInitial.description || '',
    startDate: powInitial.startDate ? new Date(powInitial.startDate).toISOString().split('T')[0] : '',
    endDate: powInitial.endDate ? new Date(powInitial.endDate).toISOString().split('T')[0] : ''
  });

  // Keep POW dates synced with Package dates if user hasn't touched them
  useEffect(() => {
    setPowData(prev => ({
      ...prev,
      startDate: packageData.startDate,
      endDate: packageData.targetCompletion
    }));
  }, [packageData.startDate, packageData.targetCompletion]);


  // --- HANDLERS ---
  const handlePackageChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setPackageData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
  };

  const handlePowChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setPowData(prev => ({ ...prev, [name]: value }));
  };

  const calculateTotalContractAmount = () => {
    if (isOneLot) return packageData.contractAmount;
    if (selectedBoqItems.length > 0) {
      return selectedBoqItems.reduce((sum, item) => sum + ((parseFloat(item.subcontractorQuantity) || 0) * (parseFloat(item.subcontractorUnitCost) || 0)), 0);
    }
    return packageData.contractAmount; // Fallback to manual entry if no BOQ selected
  };

  // Compute proportional allocations for One Lot pricing
  const getAllocatedCosts = () => {
    if (!isOneLot || selectedBoqItems.length === 0) return {};
    
    let grandMasterTotal = 0;
    const masterTotals: Record<string, number> = {};
    
    selectedBoqItems.forEach(sel => {
      const masterItem = awardedBoqItems.find(a => a.id === sel.id);
      if (masterItem) {
        const cost = (parseFloat(masterItem.quantity) || 0) * (parseFloat(masterItem.combinedUnitCost) || 0);
        masterTotals[sel.id] = cost;
        grandMasterTotal += cost;
      }
    });

    const allocations: Record<string, { total: number, unit: number, percentage: number }> = {};
    
    selectedBoqItems.forEach(sel => {
      const masterCost = masterTotals[sel.id] || 0;
      const percentage = grandMasterTotal > 0 ? (masterCost / grandMasterTotal) : 0;
      const allocatedTotal = (packageData.contractAmount || 0) * percentage;
      const subQty = parseFloat(sel.subcontractorQuantity) || 1;
      
      allocations[sel.id] = {
        total: allocatedTotal,
        unit: allocatedTotal / subQty,
        percentage: percentage * 100
      };
    });
    
    return allocations;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    // Override contract amount if BOQ items are selected
    const finalAmount = calculateTotalContractAmount();
    const finalPackageData = { ...packageData, contractAmount: finalAmount };
    
    const allocations = getAllocatedCosts();
    const finalBoqItems = isOneLot ? selectedBoqItems.map(b => {
      const alloc = allocations[b.id];
      return { ...b, subcontractorUnitCost: alloc ? alloc.unit : 0 };
    }) : selectedBoqItems;

    let res;
    if (isEdit && initialData?.id) {
      res = await updateFullSubcontractPackage(initialData.id, finalPackageData, finalBoqItems, powData);
    } else {
      res = await createFullSubcontractPackage(finalPackageData, finalBoqItems, powData);
    }
    
    if (res.success) {
      router.push('/subcontracting/dashboard');
    } else {
      setError(res.error || `Failed to ${isEdit ? 'update' : 'create'} Subcontract Package.`);
      setLoading(false);
    }
  };


  // --- RENDERERS ---
  const renderStepIndicator = () => (
    <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
      {['1. Details', '2. BOQ Assignment', '3. Schedule (POW)', '4. Review'].map((label, index) => {
        const step = index + 1;
        const isActive = currentStep === step;
        const isCompleted = currentStep > step;
        return (
          <div 
            key={step} 
            onClick={() => setCurrentStep(step)}
            style={{ 
            flex: 1, 
            padding: '12px', 
            textAlign: 'center', 
            borderRadius: '8px', 
            backgroundColor: isActive ? '#3b82f6' : (isCompleted ? '#dbeafe' : '#f3f4f6'),
            color: isActive ? '#fff' : (isCompleted ? '#1d4ed8' : '#9ca3af'),
            fontWeight: 'bold',
            border: isActive ? 'none' : '1px solid #e5e7eb',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}>
            {label}
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
      {renderStepIndicator()}

      {error && <div style={{ padding: '12px', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: '6px', marginBottom: '20px' }}>{error}</div>}

      {/* STEP 1: Details */}
      {currentStep === 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>Project</label>
            <select name="projectId" value={packageData.projectId} onChange={handlePackageChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#111827' }}>
              <option value="">Select Project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.contractNumber} - {p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>Subcontractor</label>
            <select name="subcontractorId" value={packageData.subcontractorId} onChange={handlePackageChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#111827' }}>
              <option value="">Select Subcontractor</option>
              {subcontractors.map(s => <option key={s.id} value={s.id}>{s.name}{subcontractorTrade(s) ? ` (${subcontractorTrade(s)})` : ''}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>Scope of Work</label>
            <textarea name="scopeOfWork" value={packageData.scopeOfWork} onChange={handlePackageChange} rows={3} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#111827' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>Work Category</label>
            <input type="text" name="workCategory" value={packageData.workCategory} onChange={handlePackageChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#111827' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>Contract Type</label>
            <select name="contractType" value={packageData.contractType} onChange={handlePackageChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#111827' }}>
              <option value="SUPPLY_INSTALL">Supply and Install</option>
              <option value="LABOR_ONLY">Labor Only</option>
              <option value="LUMP_SUM">Lump Sum</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>Target Start Date</label>
            <input type="date" name="startDate" value={packageData.startDate} onChange={handlePackageChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#111827' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>Target Completion</label>
            <input type="date" name="targetCompletion" value={packageData.targetCompletion} onChange={handlePackageChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#111827' }} />
          </div>
        </div>
      )}

      {/* STEP 2: BOQ Assignment */}
      {currentStep === 2 && (
        <div>
          <h3 style={{ marginTop: 0, color: '#111827' }}>Assign Awarded BOQ Items to Subcontractor</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <p style={{ color: '#6b7280', margin: 0 }}>Select the specific items from the Master BOQ that this subcontractor will execute. You can adjust their specific quantity and unit cost.</p>
            {packageData.projectId && awardedBoqItems.length > 0 && (
              <button 
                type="button"
                onClick={() => {
                  const container = document.getElementById('boq-list-container');
                  if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                }}
                style={{ padding: '6px 12px', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', color: '#374151', whiteSpace: 'nowrap' }}
              >
                ↓ Scroll to Bottom
              </button>
            )}
          </div>
          
          {packageData.projectId ? (
            awardedBoqItems.length === 0 ? (
              <div style={{ padding: '20px', backgroundColor: '#f9fafb', textAlign: 'center', borderRadius: '8px' }}>No Awarded BOQ items found for this project.</div>
            ) : (
              <>
                <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', cursor: 'pointer', color: '#1e3a8a' }}>
                    <input type="checkbox" checked={isOneLot} onChange={(e) => setIsOneLot(e.target.checked)} style={{ width: '18px', height: '18px' }} />
                    Price selected items as One Lot (Lump Sum)
                  </label>
                  {isOneLot && (
                    <div style={{ marginTop: '16px' }}>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: '#1e40af', marginBottom: '4px' }}>Total Subcontracting Lot Price (₱)</label>
                      <input 
                        type="text" 
                        value={lotPriceStr ? lotPriceStr.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (lotPriceStr.includes('.') ? '.' + lotPriceStr.split('.')[1] : '') : ''} 
                        onChange={(e) => {
                          let val = e.target.value.replace(/,/g, '');
                          val = val.replace(/[^0-9.]/g, '');
                          const parts = val.split('.');
                          if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
                          setLotPriceStr(val);
                          setPackageData(prev => ({...prev, contractAmount: parseFloat(val) || 0}));
                        }}
                        style={{ width: '100%', maxWidth: '300px', padding: '10px', borderRadius: '6px', border: '1px solid #93c5fd', backgroundColor: '#ffffff', color: '#111827', fontWeight: 'bold' }}
                      />
                    </div>
                  )}
                </div>
                <div id="boq-list-container" style={{ display: 'grid', gap: '12px', maxHeight: '500px', overflowY: 'auto', paddingRight: '8px' }}>
                {awardedBoqItems.map(item => {
                  const isSelected = selectedBoqItems.some(i => i.id === item.id);
                  const selectedItem = selectedBoqItems.find(i => i.id === item.id);
                  
                  const allocations = getAllocatedCosts();
                  const alloc = allocations[item.id];
                  
                  const displayUnitCost = isOneLot ? (alloc?.unit || 0) : (selectedItem?.subcontractorUnitCost || 0);
                  const displayTotal = isOneLot ? (alloc?.total || 0) : ((parseFloat(selectedItem?.subcontractorQuantity) || 0) * (parseFloat(selectedItem?.subcontractorUnitCost) || 0));
                  
                  return (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', border: `1px solid ${isSelected ? '#3b82f6' : '#e5e7eb'}`, borderRadius: '8px', backgroundColor: isSelected ? '#eff6ff' : '#fff', transition: 'all 0.2s' }}>
                      <input 
                        type="checkbox" 
                        checked={isSelected} 
                        onChange={(e) => handleBoqSelection(item, e.target.checked)} 
                        style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        {/* BOQs without item codes store the section name as the code; show it once. */}
                        <div style={{ fontWeight: 'bold', color: '#111827' }}>{item.category ? `[${item.category}] ` : ''}{item.itemCode && item.itemCode !== item.category && item.itemCode !== item.description ? item.itemCode : ''}</div>
                        <div style={{ color: '#4b5563', fontSize: '0.9rem' }}>{item.description}</div>
                        <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '4px' }}>Master BOQ: {item.quantity} {item.unit} @ ₱{item.combinedUnitCost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                      
                      {isSelected && (
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px' }}>SubQty</label>
                            <input 
                              type="number" 
                              value={selectedItem.subcontractorQuantity} 
                              onChange={(e) => updateSelectedBoqValue(item.id, 'subcontractorQuantity', e.target.value)}
                              disabled={isOneLot && alloc}
                              style={{ width: '80px', padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: (isOneLot && alloc) ? '#f3f4f6' : '#ffffff', color: '#111827' }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px' }}>SubCost</label>
                            <input 
                              type="number" 
                              value={isOneLot ? displayUnitCost.toFixed(2) : selectedItem.subcontractorUnitCost} 
                              onChange={(e) => updateSelectedBoqValue(item.id, 'subcontractorUnitCost', e.target.value)}
                              disabled={isOneLot}
                              style={{ width: '100px', padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db', backgroundColor: isOneLot ? '#f3f4f6' : '#ffffff', color: '#111827' }}
                            />
                          </div>
                          <div style={{ width: '120px', textAlign: 'right' }}>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px' }}>
                              Total {isOneLot && alloc ? `(${alloc.percentage.toFixed(2)}%)` : ''}
                            </label>
                            <strong style={{ color: '#059669' }}>
                              ₱{displayTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </strong>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
            )
          ) : (
            <div style={{ padding: '20px', backgroundColor: '#fef3c7', color: '#d97706', textAlign: 'center', borderRadius: '8px' }}>Please select a Project in Step 1 first.</div>
          )}
        </div>
      )}

      {/* STEP 3: Program of Works */}
      {currentStep === 3 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <h3 style={{ marginTop: 0, color: '#111827' }}>Establish Program of Works</h3>
            <p style={{ color: '#6b7280', marginBottom: '20px' }}>Define the high-level schedule and milestones for this subcontract package.</p>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>Schedule Title</label>
            <input type="text" name="title" value={powData.title} onChange={handlePowChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#111827' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>POW Start Date</label>
            <input type="date" name="startDate" value={powData.startDate} onChange={handlePowChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#111827' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>POW End Date</label>
            <input type="date" name="endDate" value={powData.endDate} onChange={handlePowChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#111827' }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>Milestones / Description</label>
            <textarea name="description" value={powData.description} onChange={handlePowChange} rows={4} placeholder="Describe key milestones or paste schedule summary here..." style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#111827' }} />
          </div>
        </div>
      )}

      {/* STEP 4: Review */}
      {currentStep === 4 && (
        <div>
          <h3 style={{ marginTop: 0, color: '#111827' }}>Review Package Summary</h3>
          <div style={{ backgroundColor: '#f9fafb', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb', color: '#111827' }}>
            <h4 style={{ margin: '0 0 12px 0', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>Package Details</h4>
            <p><strong>Work Category:</strong> {packageData.workCategory}</p>
            <p><strong>Contract Type:</strong> {packageData.contractType}</p>
            <p><strong>Scope:</strong> {packageData.scopeOfWork}</p>
            
            <h4 style={{ margin: '24px 0 12px 0', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>Assigned BOQ ({selectedBoqItems.length} items)</h4>
            {selectedBoqItems.map(i => {
              const allocations = getAllocatedCosts();
              const alloc = allocations[i.id];
              const displayTotal = isOneLot ? (alloc?.total || 0) : ((parseFloat(i.subcontractorQuantity) || 0) * (parseFloat(i.subcontractorUnitCost) || 0));
              return (
                <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed #e5e7eb' }}>
                  <span>{i.itemCode} - {i.description} {isOneLot && alloc ? `(${alloc.percentage.toFixed(2)}%)` : ''}</span>
                  <strong>₱{displayTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
              );
            })}
            <div style={{ textAlign: 'right', marginTop: '12px', fontSize: '1.2rem' }}>
              <strong>Total Contract Amount: </strong>
              <span style={{ color: '#059669' }}>₱{calculateTotalContractAmount().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            <h4 style={{ margin: '24px 0 12px 0', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>Program of Works</h4>
            <p><strong>Schedule:</strong> {powData.startDate} to {powData.endDate}</p>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #e5e7eb' }}>
        <button 
          onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
          disabled={currentStep === 1 || loading}
          style={{ padding: '10px 24px', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontWeight: 'bold', cursor: (currentStep === 1 || loading) ? 'not-allowed' : 'pointer', opacity: currentStep === 1 ? 0.5 : 1 }}
        >
          Back
        </button>
        
        {currentStep < 4 ? (
          <button 
            onClick={() => setCurrentStep(prev => Math.min(4, prev + 1))}
            style={{ padding: '10px 24px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Next Step
          </button>
        ) : (
          <button 
            onClick={handleSubmit}
            disabled={loading}
            style={{ padding: '10px 32px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? (isEdit ? 'Updating Package...' : 'Creating Package...') : (isEdit ? 'Save Changes' : 'Confirm & Create Subcontract')}
          </button>
        )}
      </div>
    </div>
  );
}
