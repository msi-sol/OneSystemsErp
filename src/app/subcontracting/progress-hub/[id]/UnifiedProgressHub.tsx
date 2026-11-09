'use client';
// Force HMR refresh

import React, { useState, useEffect } from 'react';
import { createAccomplishment, createBilling, approveAccomplishment, submitBillingToPM, endorseBillingToPD, approvePaymentRequest } from '@/app/actions/progressActions';
import { useRouter } from 'next/navigation';
import { readItemPercentages } from '@/lib/subcontracting/progress-report-percent';

export default function UnifiedProgressHub({ packageData }: { packageData: any }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'accomplishments' | 'billings' | 'payments'>('accomplishments');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Accomplishment State
  const [accDesc, setAccDesc] = useState('');
  const [simulatedFile, setSimulatedFile] = useState<File | null>(null);
  const [isSimulatingAI, setIsSimulatingAI] = useState(false);
  const [aiAnalysisDone, setAiAnalysisDone] = useState(false);
  const [boqBreakdown, setBoqBreakdown] = useState<any[]>([]);
  const [calculatedOverallPercent, setCalculatedOverallPercent] = useState(0);

  const latestCumulative = packageData.accomplishments?.[0]?.cumulativePercent || 0;
  const assignedBoqItems = packageData.subcontractor?.subcontractorBOQItems || [];

  // Billing State
  const [billingGross, setBillingGross] = useState(0);
  const previousBilled = packageData.billings?.reduce((sum: number, b: any) => sum + (b.currentGross || 0), 0) || 0;
  
  // Strict Flow Logic: Max billeable is based ONLY on APPROVED Accomplishment %
  const approvedAccomplishments = packageData.accomplishments?.filter((a: any) => a.status === 'APPROVED') || [];
  const totalApprovedPercent = approvedAccomplishments.reduce((sum: number, a: any) => sum + a.currentPercent, 0);
  const accomplishedValue = (totalApprovedPercent / 100) * packageData.contractAmount;
  const maxBilleable = accomplishedValue - previousBilled;

  // Workflow protection rule: accomplishments & billings are only enabled once approved
  const isApproved = !['DRAFT', 'FOR_REVIEW', 'FOR_BUDGET_VALIDATION', 'FOR_TECHNICAL_APPROVAL', 'FOR_FINAL_APPROVAL'].includes(packageData.status);

  useEffect(() => {
    if (maxBilleable > 0) {
      setBillingGross(maxBilleable);
    }
  }, [maxBilleable]);

  // Weighted overall % of the package from each item's percentage for this period.
  const overallFrom = (breakdown: any[]) => {
    const total = breakdown.reduce((sum: number, item: any) => sum + (item.totalCost || 0) * ((Number(item.thisPeriodPercent) || 0) / 100), 0);
    return packageData.contractAmount > 0 ? (total / packageData.contractAmount) * 100 : 0;
  };

  // Reads each item's percentage from a text report. This used to be a fake "AI evaluation": it never read the
  // file and assigned hardcoded percentages by keyword (e.g. any "Mobilization" item = 100%), others 0%.
  const handleSimulateAI = async () => {
    if (!simulatedFile) {
      setError("Please upload a file first.");
      return;
    }
    setIsSimulatingAI(true);
    setError('');
    const isText = simulatedFile.type.startsWith('text/') || /\.txt$/i.test(simulatedFile.name);
    const text = isText ? await simulatedFile.text().catch(() => '') : '';
    const found = readItemPercentages(text, assignedBoqItems.map((item: any) => ({ id: item.id, description: item.awardedBoqItem.description })));
    const breakdown = assignedBoqItems.map((item: any) => ({ ...item, thisPeriodPercent: found[item.id] ?? 0 }));
    const foundCount = Object.values(found).filter(value => value !== null).length;
    setBoqBreakdown(breakdown);
    setCalculatedOverallPercent(overallFrom(breakdown));
    setIsSimulatingAI(false);
    setAiAnalysisDone(true);
    setSuccessMsg(!isText
      ? "PDF reports are not read automatically yet. Enter each item's percentage for this period below."
      : foundCount > 0
        ? `Read ${foundCount} of ${breakdown.length} item percentage${breakdown.length === 1 ? '' : 's'} from the report. Check each one before submitting.`
        : "No item percentages were found in the report. Enter each item's percentage for this period below.");
  };

  const setItemPercent = (id: string, value: string) => {
    const percent = Math.min(100, Math.max(0, Number(value) || 0));
    const breakdown = boqBreakdown.map((item: any) => item.id === id ? { ...item, thisPeriodPercent: percent } : item);
    setBoqBreakdown(breakdown);
    setCalculatedOverallPercent(overallFrom(breakdown));
  };

  const handleCreateAccomplishment = async () => {
    setLoading(true); setError(''); setSuccessMsg('');
    const newCumulative = latestCumulative + calculatedOverallPercent;
    if (newCumulative > 100) {
      setError('Cumulative percent cannot exceed 100%');
      setLoading(false);
      return;
    }
    const formData = new FormData();
    formData.append('packageId', packageData.id);
    formData.append('workDescription', accDesc || `Progress report: ${simulatedFile?.name || 'Uploaded File'}`);
    formData.append('prevPercent', latestCumulative.toString());
    formData.append('currentPercent', calculatedOverallPercent.toString());
    formData.append('cumulativePercent', newCumulative.toString());
    formData.append('itemBreakdown', JSON.stringify(boqBreakdown.map((b: any) => ({
      id: b.id,
      itemCode: b.awardedBoqItem.itemCode,
      percent: b.thisPeriodPercent
    }))));

    if (simulatedFile) {
      formData.append('file', simulatedFile);
    }

    const res = await createAccomplishment(formData);
    if (res.success) {
      router.refresh();
      setSuccessMsg('Accomplishment report submitted successfully.');
      setCalculatedOverallPercent(0);
      setAccDesc('');
      setSimulatedFile(null);
      setAiAnalysisDone(false);
      setBoqBreakdown([]);
    } else {
      setError(res.error || 'Failed to submit accomplishment');
    }
    setLoading(false);
  };

  const handleCreateBilling = async () => {
    setLoading(true); setError(''); setSuccessMsg('');
    if (billingGross <= 0) {
      setError('Gross amount must be greater than 0');
      setLoading(false);
      return;
    }
    const totalGross = previousBilled + billingGross;
    const remaining = packageData.contractAmount - totalGross;
    
    // Auto calculate 10% retention for demo purposes
    const retention = billingGross * 0.10;
    const netPayable = billingGross - retention;

    const res = await createBilling({
      projectId: packageData.projectId,
      subcontractorId: packageData.subcontractorId,
      packageId: packageData.id,
      contractAmount: packageData.contractAmount,
      previousGross: previousBilled,
      currentGross: billingGross,
      totalGross: totalGross,
      remainingBalance: remaining,
      netPayable: netPayable,
      retentionDeduction: retention
    });

    if (res.success) {
      router.refresh();
      setSuccessMsg('Billing created successfully.');
      setBillingGross(0);
    } else {
      setError(res.error || 'Failed to create billing');
    }
    setLoading(false);
  };

  const handleApprovePayment = async (billingId: string) => {
    setLoading(true); setError(''); setSuccessMsg('');
    const res = await approvePaymentRequest(billingId, packageData.id);
    if (res.success) {
      router.refresh();
      setSuccessMsg('Payment request approved successfully.');
    } else {
      setError(res.error || 'Failed to approve payment request');
    }
    setLoading(false);
  };

  const handleApprove = async (id: string) => {
    setLoading(true); setError(''); setSuccessMsg('');
    const res = await approveAccomplishment(id, packageData.id);
    if (res.success) {
      router.refresh();
      setSuccessMsg('Accomplishment approved successfully. It is now eligible for billing.');
    } else {
      setError(res.error || 'Failed to approve accomplishment');
    }
    setLoading(false);
  };

  const handleSubmitToPM = async (id: string) => {
    setLoading(true); setError(''); setSuccessMsg('');
    const res = await submitBillingToPM(id, packageData.id);
    if (res.success) {
      router.refresh();
      setSuccessMsg('Billing successfully submitted to Project Manager.');
    } else {
      setError(res.error || 'Failed to submit billing');
    }
    setLoading(false);
  };

  const handleEndorseToPD = async (id: string) => {
    setLoading(true); setError(''); setSuccessMsg('');
    const res = await endorseBillingToPD(id, packageData.id);
    if (res.success) {
      router.refresh();
      setSuccessMsg('Billing successfully endorsed to Project Director.');
    } else {
      setError(res.error || 'Failed to endorse billing');
    }
    setLoading(false);
  };

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
      {/* TABS */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
        <button 
          onClick={() => { setActiveTab('accomplishments'); setError(''); setSuccessMsg(''); }}
          style={{ flex: 1, padding: '16px', fontWeight: 'bold', fontSize: '1rem', border: 'none', backgroundColor: activeTab === 'accomplishments' ? '#fff' : 'transparent', color: activeTab === 'accomplishments' ? '#3b82f6' : '#6b7280', borderBottom: activeTab === 'accomplishments' ? '3px solid #3b82f6' : '3px solid transparent', cursor: 'pointer' }}
        >
          1. Accomplishments
        </button>
        <button 
          onClick={() => { setActiveTab('billings'); setError(''); setSuccessMsg(''); }}
          style={{ flex: 1, padding: '16px', fontWeight: 'bold', fontSize: '1rem', border: 'none', backgroundColor: activeTab === 'billings' ? '#fff' : 'transparent', color: activeTab === 'billings' ? '#10b981' : '#6b7280', borderBottom: activeTab === 'billings' ? '3px solid #10b981' : '3px solid transparent', cursor: 'pointer' }}
        >
          2. Billings
        </button>
        <button 
          onClick={() => { setActiveTab('payments'); setError(''); setSuccessMsg(''); }}
          style={{ flex: 1, padding: '16px', fontWeight: 'bold', fontSize: '1rem', border: 'none', backgroundColor: activeTab === 'payments' ? '#fff' : 'transparent', color: activeTab === 'payments' ? '#f59e0b' : '#6b7280', borderBottom: activeTab === 'payments' ? '3px solid #f59e0b' : '3px solid transparent', cursor: 'pointer' }}
        >
          3. Payment Requests
        </button>
      </div>

      <div style={{ padding: '24px' }}>
        {error && <div style={{ padding: '12px', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: '6px', marginBottom: '16px' }}>{error}</div>}
        {successMsg && <div style={{ padding: '12px', backgroundColor: '#d1fae5', color: '#065f46', borderRadius: '6px', marginBottom: '16px' }}>{successMsg}</div>}

        {/* TAB 1: ACCOMPLISHMENTS */}
        {activeTab === 'accomplishments' && (
          <div>
            <h3 style={{ marginTop: 0, color: '#111827' }}>Log New Accomplishment</h3>
            {!isApproved ? (
              <div style={{
                backgroundColor: 'rgba(245, 158, 11, 0.05)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '24px',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}>
                <span style={{ fontSize: '2rem' }}>⚠️</span>
                <div>
                  <strong style={{ display: 'block', marginBottom: '6px', fontSize: '1.05rem', color: '#b45309' }}>Subcontract Package Not Approved</strong>
                  This package is currently in <strong style={{ color: '#b45309' }}>{packageData.status}</strong> status. Accomplishments can only be recorded once the package is approved by the Project Director.
                </div>
              </div>
            ) : (
              <div style={{ backgroundColor: '#f3f4f6', padding: '20px', borderRadius: '8px', marginBottom: '24px' }}>
                
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', marginBottom: '20px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#4b5563', marginBottom: '4px' }}>Upload Progress Report (PDF/TXT)</label>
                    <input 
                      type="file" 
                      onChange={(e) => setSimulatedFile(e.target.files?.[0] || null)}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px dashed #9ca3af', backgroundColor: '#ffffff', color: '#111827' }}
                    />
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '4px 0 0 0' }}>Download <a href="/Accomplishment_Report_Seed.pdf" download style={{ color: '#3b82f6', textDecoration: 'underline' }}>Sample Report</a> for simulation.</p>
                  </div>
                  <div>
                    <button 
                      onClick={handleSimulateAI} 
                      disabled={isSimulatingAI || !simulatedFile || aiAnalysisDone}
                      style={{ padding: '8px 24px', backgroundColor: '#8b5cf6', color: '#fff', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: isSimulatingAI || !simulatedFile || aiAnalysisDone ? 'not-allowed' : 'pointer', opacity: isSimulatingAI || !simulatedFile || aiAnalysisDone ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      {isSimulatingAI ? 'Reading report…' : '📄 Read report'}
                    </button>
                  </div>
                </div>

                {aiAnalysisDone && (
                  <div style={{ backgroundColor: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
                    <div style={{ padding: '12px 16px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontWeight: 'bold', color: '#111827' }}>
                      Itemized Breakdown (this period)
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ color: '#6b7280', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                          <th style={{ padding: '12px 16px' }}>BOQ Item</th>
                          <th style={{ padding: '12px 16px' }}>Total Cost</th>
                          <th style={{ padding: '12px 16px' }}>This Period %</th>
                          <th style={{ padding: '12px 16px' }}>Accomplished Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {boqBreakdown.map((item: any) => (
                          <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '12px 16px', color: '#111827' }}>{item.awardedBoqItem.description}</td>
                            <td style={{ padding: '12px 16px', color: '#111827' }}>₱{(item.totalCost || 0).toLocaleString()}</td>
                            <td style={{ padding: '12px 16px' }}>
                              <input type="number" min={0} max={100} step="0.01" aria-label={`This period percent for ${item.awardedBoqItem.description}`} value={item.thisPeriodPercent}
                                onChange={(e) => setItemPercent(item.id, e.target.value)}
                                style={{ width: '90px', padding: '6px', borderRadius: '6px', border: '1px solid #d1d5db', color: '#111827', fontWeight: 'bold' }} /> %
                            </td>
                            <td style={{ padding: '12px 16px', color: '#059669', fontWeight: 'bold' }}>₱{((item.totalCost || 0) * (item.thisPeriodPercent / 100)).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: '2px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                          <td colSpan={3} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', color: '#374151' }}>Weighted Overall %:</td>
                          <td style={{ padding: '12px 16px', color: '#8b5cf6', fontWeight: 'bold', fontSize: '1.1rem' }}>{calculatedOverallPercent.toFixed(2)}%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {aiAnalysisDone && (
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: '#4b5563', marginBottom: '4px' }}>Work Description (Optional)</label>
                      <input 
                        type="text" 
                        value={accDesc} 
                        onChange={(e) => setAccDesc(e.target.value)}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#111827' }}
                        placeholder="e.g. June Progress Claim"
                      />
                    </div>
                    <div>
                      <button 
                        onClick={handleCreateAccomplishment} 
                        disabled={loading || calculatedOverallPercent <= 0}
                        style={{ padding: '8px 24px', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: loading || calculatedOverallPercent <= 0 ? 'not-allowed' : 'pointer', opacity: loading || calculatedOverallPercent <= 0 ? 0.5 : 1 }}
                      >
                        Submit Report
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <h3 style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '8px', color: '#111827' }}>Accomplishment History</h3>
            {packageData.accomplishments.length === 0 ? (
              <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No accomplishments recorded yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '12px 8px' }}>Date</th>
                    <th style={{ padding: '12px 8px' }}>Description</th>
                    <th style={{ padding: '12px 8px' }}>File</th>
                    <th style={{ padding: '12px 8px' }}>This Period</th>
                    <th style={{ padding: '12px 8px' }}>Cumulative</th>
                    <th style={{ padding: '12px 8px' }}>Status / Action</th>
                  </tr>
                </thead>
                <tbody>
                  {packageData.accomplishments.map((acc: any) => (
                    <tr key={acc.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px 8px', color: '#111827' }}>{new Date(acc.createdAt).toLocaleDateString()}</td>
                      <td style={{ padding: '12px 8px', color: '#111827' }}>{acc.workDescription}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <a href={`/subcontracting/progress-hub/report-viewer?id=${acc.id}`} style={{ color: '#8b5cf6', textDecoration: 'underline', fontSize: '0.9rem', fontWeight: 'bold' }}>
                          View AI Validation
                        </a>
                      </td>
                      <td style={{ padding: '12px 8px', color: '#3b82f6', fontWeight: 'bold' }}>+{acc.currentPercent.toFixed(2)}%</td>
                      <td style={{ padding: '12px 8px', fontWeight: 'bold', color: '#111827' }}>{acc.cumulativePercent.toFixed(2)}%</td>
                      <td style={{ padding: '12px 8px' }}>
                        {acc.status === 'APPROVED' ? (
                          <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: '#d1fae5', color: '#065f46', fontWeight: 'bold' }}>APPROVED</span>
                        ) : (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: '#fef3c7', color: '#92400e', fontWeight: 'bold' }}>{acc.status || 'FOR_REVIEW'}</span>
                            <button 
                              onClick={() => handleApprove(acc.id)} 
                              disabled={loading}
                              style={{ padding: '4px 12px', backgroundColor: '#10b981', color: '#fff', borderRadius: '4px', border: 'none', fontSize: '0.8rem', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                            >
                              Approve
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 2: BILLINGS */}
        {activeTab === 'billings' && (
          <div>
            <h3 style={{ marginTop: 0, color: '#111827' }}>Create New Billing</h3>
            <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '16px' }}>
              Billings are strictly generated from recorded Accomplishments.
            </p>
            {!isApproved ? (
              <div style={{
                backgroundColor: 'rgba(245, 158, 11, 0.05)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '24px',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}>
                <span style={{ fontSize: '2rem' }}>⚠️</span>
                <div>
                  <strong style={{ display: 'block', marginBottom: '6px', fontSize: '1.05rem', color: '#b45309' }}>Subcontract Package Not Approved</strong>
                  This package is currently in <strong style={{ color: '#b45309' }}>{packageData.status}</strong> status. Billings can only be generated once the package is approved by the Project Director.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', backgroundColor: '#ecfdf5', padding: '20px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #d1fae5' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#065f46', marginBottom: '4px' }}>Gross Amount to Bill (₱)</label>
                  <input 
                    type="number" 
                    value={billingGross} 
                    onChange={(e) => setBillingGross(parseFloat(e.target.value) || 0)}
                    style={{ width: '200px', padding: '8px', borderRadius: '6px', border: '1px solid #a7f3d0', backgroundColor: '#ffffff', color: '#111827' }}
                    max={maxBilleable > 0 ? maxBilleable : 0}
                    disabled={maxBilleable <= 0}
                  />
                </div>
                <div style={{ flex: 1, color: '#065f46', fontSize: '0.9rem' }}>
                  <div><strong>Max Available from Progress:</strong> ₱{maxBilleable > 0 ? maxBilleable.toLocaleString() : '0'}</div>
                  <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>(Based on {totalApprovedPercent.toFixed(2)}% APPROVED cumulative accomplishment)</div>
                </div>
                <div>
                  <button 
                    onClick={handleCreateBilling} 
                    disabled={loading || billingGross <= 0 || billingGross > maxBilleable}
                    style={{ padding: '8px 24px', backgroundColor: '#10b981', color: '#fff', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: loading || billingGross <= 0 || billingGross > maxBilleable ? 'not-allowed' : 'pointer', opacity: loading || billingGross <= 0 || billingGross > maxBilleable ? 0.5 : 1 }}
                  >
                    Generate Billing
                  </button>
                </div>
              </div>
            )}

            <h3 style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '8px', color: '#111827' }}>Billing History</h3>
            {packageData.billings.length === 0 ? (
              <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No billings generated yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '12px 8px' }}>Invoice No.</th>
                    <th style={{ padding: '12px 8px' }}>Date</th>
                    <th style={{ padding: '12px 8px' }}>Gross Amount</th>
                    <th style={{ padding: '12px 8px' }}>Retention (10%)</th>
                    <th style={{ padding: '12px 8px' }}>Net Payable</th>
                    <th style={{ padding: '12px 8px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {packageData.billings.map((bill: any) => (
                    <tr key={bill.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px 8px', fontWeight: 'bold', color: '#111827' }}>{bill.billingNumber}</td>
                      <td style={{ padding: '12px 8px', color: '#111827' }}>{new Date(bill.createdAt).toLocaleDateString()}</td>
                      <td style={{ padding: '12px 8px', color: '#111827' }}>₱{bill.currentGross?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '12px 8px', color: '#ef4444' }}>-₱{bill.retentionDeduction?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '12px 8px', color: '#059669', fontWeight: 'bold' }}>₱{bill.netPayable?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '12px 8px' }}>
                        {bill.status === 'APPROVED_FOR_PAYMENT' || bill.status === 'APPROVED' || bill.paymentStatus === 'PAID' ? (
                          <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: '#d1fae5', color: '#065f46', fontWeight: 'bold' }}>APPROVED</span>
                        ) : bill.status === 'FOR_VALIDATION' ? (
                          <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: '#d1fae5', color: '#065f46', fontWeight: 'bold' }}>ENDORSED TO PD</span>
                        ) : (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: '#fef3c7', color: '#92400e', fontWeight: 'bold' }}>{bill.status || 'DRAFT'}</span>
                            {bill.status === 'DRAFT' && (
                              <button 
                                onClick={() => handleSubmitToPM(bill.id)} 
                                disabled={loading}
                                style={{ padding: '4px 12px', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '4px', border: 'none', fontSize: '0.8rem', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                              >
                                Submit to PM
                              </button>
                            )}
                            {bill.status === 'SUBMITTED' && (
                              <button 
                                onClick={() => handleEndorseToPD(bill.id)} 
                                disabled={loading}
                                style={{ padding: '4px 12px', backgroundColor: '#10b981', color: '#fff', borderRadius: '4px', border: 'none', fontSize: '0.8rem', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                              >
                                Endorse to PD
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 3: PAYMENTS */}
        {activeTab === 'payments' && (
          <div>
            <h3 style={{ marginTop: 0, color: '#111827' }}>Pending Payment Requests</h3>
            <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '16px' }}>Process check payment or bank transfer for endorsed billings.</p>
            
            {packageData.billings.filter((b: any) => b.paymentStatus !== 'PAID' && (b.status === 'FOR_VALIDATION' || b.status === 'APPROVED_FOR_PAYMENT')).length === 0 ? (
              <p style={{ color: '#6b7280', fontStyle: 'italic', padding: '24px', backgroundColor: '#f9fafb', borderRadius: '8px', textAlign: 'center' }}>No endorsed billings waiting for payment.</p>
            ) : (
              <div style={{ display: 'grid', gap: '16px' }}>
                {packageData.billings.filter((b: any) => b.paymentStatus !== 'PAID' && (b.status === 'FOR_VALIDATION' || b.status === 'APPROVED_FOR_PAYMENT')).map((bill: any) => (
                  <div key={bill.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', border: '1px solid #fcd34d', borderRadius: '8px', backgroundColor: '#fffbeb' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#92400e' }}>Invoice: {bill.billingNumber}</div>
                      <div style={{ color: '#b45309', fontSize: '0.9rem', marginTop: '4px' }}>Net Payable: <strong>₱{bill.netPayable?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                    </div>
                    <div>
                      {bill.status === 'APPROVED_FOR_PAYMENT' ? (
                        <div style={{ textAlign: 'center' }}>
                          <button disabled style={{ padding: '10px 24px', backgroundColor: '#d1d5db', color: '#6b7280', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'not-allowed' }}>
                            Approve for Payment
                          </button>
                          <div style={{ color: '#059669', fontWeight: 'bold', fontSize: '0.85rem', marginTop: '4px' }}>✓ Completed</div>
                        </div>
                      ) : (
                        <button 
                          onClick={() => handleApprovePayment(bill.id)} 
                          disabled={loading}
                          style={{ padding: '10px 24px', backgroundColor: '#f59e0b', color: '#fff', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                        >
                          Approve for Payment
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h3 style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '8px', marginTop: '32px', color: '#111827' }}>Payment History</h3>
            {packageData.billings.filter((b: any) => b.paymentStatus === 'PAID').length === 0 ? (
              <p style={{ color: '#6b7280', fontStyle: 'italic' }}>No completed payments.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '12px 8px' }}>Invoice No.</th>
                    <th style={{ padding: '12px 8px' }}>Amount Paid</th>
                    <th style={{ padding: '12px 8px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {packageData.billings.filter((b: any) => b.paymentStatus === 'PAID').map((bill: any) => (
                    <tr key={bill.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px 8px', fontWeight: 'bold', color: '#111827' }}>{bill.billingNumber}</td>
                      <td style={{ padding: '12px 8px', color: '#059669', fontWeight: 'bold' }}>₱{bill.netPayable?.toLocaleString()}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', backgroundColor: '#d1fae5', color: '#065f46' }}>
                          PAID
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
