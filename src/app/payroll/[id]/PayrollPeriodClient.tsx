'use client';

import { useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import UploadBiometricsModal from './UploadBiometricsModal';
import ManualDtrModal from './ManualDtrModal';
import { computePayrollForPeriod } from '../../actions/payrollEngine';
import { approveAndLockPayroll } from '../../actions/payrollAiValidator';
import ValidationModal from './ValidationModal';
import PayslipModal from './PayslipModal';
import AIPayrollAssistant from '../AIPayrollAssistant';
import { createFundingRequest, approveFundingRequest } from '../../actions/payrollFundingActions';
import { generatePaymentBatch } from '../../actions/paymentBatchActions';
import FileViewerModal from './FileViewerModal';

export default function PayrollPeriodClient({ period, workers, boqItems = [], bankAccounts = [] }: { period: any, workers: any[], boqItems?: any[], bankAccounts?: any[] }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('DTR');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [editingDtr, setEditingDtr] = useState<any>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [isValidationOpen, setIsValidationOpen] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState<any>(null);
  const [expandedWorkerId, setExpandedWorkerId] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [selectedBoqId, setSelectedBoqId] = useState<string>('');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');

  const totalRequiredFunding = period.payrolls?.reduce((sum: number, p: any) => sum + p.netPay, 0) || 0;

  const uploadedFiles = Array.from(new Set(
    (period.dtrs || [])
      .map((dtr: any) => dtr.sourceFile)
      .filter((file: string) => file && file !== 'MANUAL_ENTRY')
  )) as string[];

  const handleComputePayroll = async () => {
    setIsComputing(true);
    try {
      const res = await computePayrollForPeriod(period.id);
      if (res.success) {
        alert(`Successfully computed payroll for ${res.count} workers.`);
        router.refresh(); // <-- FORCE UI REFRESH
      } else {
        alert(res.error || 'Failed to compute payroll');
      }
    } catch (err: any) {
      alert(err.message || 'An error occurred during computation');
    } finally {
      setIsComputing(false);
    }
  };

  const handleApproveAndLock = async () => {
    if (!confirm('Are you sure you want to approve and lock this payroll? This action cannot be easily undone.')) return;
    
    try {
      const res = await approveAndLockPayroll(period.id);
      if (res.success) {
        alert('Payroll has been approved and locked successfully!');
      } else {
        alert(res.error || 'Failed to approve payroll');
      }
    } catch (err: any) {
      alert(err.message || 'An error occurred');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px', background: 'rgba(0,0,0,0.2)', padding: '5px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <button 
            onClick={() => setActiveTab('DTR')}
            style={{ 
              background: activeTab === 'DTR' ? 'var(--accent-color)' : 'transparent', 
              color: activeTab === 'DTR' ? '#000' : 'var(--text-secondary)', 
              border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer',
              fontWeight: activeTab === 'DTR' ? 'bold' : 'normal',
              transition: 'all 0.2s', whiteSpace: 'nowrap'
            }}
          >
            DTR Management
          </button>
          <button 
            onClick={() => setActiveTab('PAYROLL')}
            style={{ 
              background: activeTab === 'PAYROLL' ? 'var(--accent-color)' : 'transparent', 
              color: activeTab === 'PAYROLL' ? '#000' : 'var(--text-secondary)', 
              border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer',
              fontWeight: activeTab === 'PAYROLL' ? 'bold' : 'normal',
              transition: 'all 0.2s', whiteSpace: 'nowrap'
            }}
          >
            Payroll Processing
          </button>
          {period.isLocked && (
            <button 
              onClick={() => setActiveTab('FUNDING')}
              style={{ 
                background: activeTab === 'FUNDING' ? 'var(--accent-color)' : 'transparent', 
                color: activeTab === 'FUNDING' ? '#000' : 'var(--text-secondary)', 
                border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer',
                fontWeight: activeTab === 'FUNDING' ? 'bold' : 'normal',
                transition: 'all 0.2s', whiteSpace: 'nowrap'
              }}
            >
              Funding & Payments
            </button>
          )}
        </div>
        
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
          {activeTab === 'DTR' && !period.isLocked && (
            <>
              {uploadedFiles.map(fileName => (
                <div 
                  key={fileName} 
                  onClick={() => setViewingFile(fileName)}
                  style={{ background: 'rgba(52, 152, 219, 0.1)', border: '1px solid rgba(52, 152, 219, 0.3)', color: '#3498db', padding: '8px 16px', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(52, 152, 219, 0.2)'}
                  onMouseOut={e => e.currentTarget.style.background = 'rgba(52, 152, 219, 0.1)'}
                >
                  <span>📄</span> {fileName}
                </div>
              ))}
              <button 
                onClick={() => {
                  setEditingDtr(null);
                  setIsManualOpen(true);
                }} 
                style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', transition: 'all 0.2s' }} 
                onMouseOver={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'var(--text-primary)'; }} 
                onMouseOut={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--glass-border)'; }}
              >
                + Manual Entry
              </button>
              <button 
                onClick={() => setIsUploadOpen(true)} 
                style={{ background: '#3498db', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(52, 152, 219, 0.3)', transition: 'transform 0.2s' }} 
                onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'} 
                onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <span style={{ fontSize: '1.2rem' }}>⬆️</span> Upload Biometrics
              </button>
            </>
          )}
          
          {activeTab === 'PAYROLL' && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={handleComputePayroll} 
                disabled={isComputing || period.isLocked}
                style={{ background: 'var(--accent-color)', color: '#000', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: (isComputing || period.isLocked) ? 'not-allowed' : 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0, 255, 163, 0.2)', transition: 'transform 0.2s', opacity: (isComputing || period.isLocked) ? 0.7 : 1 }} 
                onMouseOver={e => !isComputing && !period.isLocked && (e.currentTarget.style.transform = 'translateY(-2px)')} 
                onMouseOut={e => !isComputing && !period.isLocked && (e.currentTarget.style.transform = 'translateY(0)')}
              >
                {isComputing ? 'Computing...' : 'Generate Payroll'}
              </button>

              {!period.isLocked && period.payrolls?.length > 0 && (
                <button 
                  onClick={() => setIsValidationOpen(true)}
                  style={{ background: '#3498db', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(52, 152, 219, 0.3)', transition: 'transform 0.2s' }} 
                  onMouseOver={e => (e.currentTarget.style.transform = 'translateY(-2px)')} 
                  onMouseOut={e => (e.currentTarget.style.transform = 'translateY(0)')}
                >
                  <span>🤖</span> AI Validate & Submit
                </button>
              )}
              {!period.isLocked && period.status === 'FOR_REVIEW' && (
                <button 
                  onClick={handleApproveAndLock}
                  style={{ background: '#2ecc71', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(46, 204, 113, 0.3)', transition: 'transform 0.2s' }} 
                  onMouseOver={e => (e.currentTarget.style.transform = 'translateY(-2px)')} 
                  onMouseOut={e => (e.currentTarget.style.transform = 'translateY(0)')}
                >
                  <span>🔒</span> Lock & Approve Payroll
                </button>
              )}
              {period.isLocked && (
                <>
                  <button 
                    onClick={() => window.print()}
                    style={{ background: 'var(--text-secondary)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', transition: 'transform 0.2s' }} 
                    onMouseOver={e => (e.currentTarget.style.transform = 'translateY(-2px)')} 
                    onMouseOut={e => (e.currentTarget.style.transform = 'translateY(0)')}
                  >
                    <span>🖨️</span> Print Payroll
                  </button>
                  <button 
                    onClick={async () => {
                      const accountId = prompt('Enter the Source Payroll Bank Account ID for this GCash Batch:');
                      if (!accountId) return;
                      const validPayslips = period.payrolls.filter((p:any) => p.worker?.allowedPaymentMethod === 'GCash Only' && (p.paymentStatus === 'PENDING' || p.paymentStatus === 'UNPAID'));
                      if (validPayslips.length === 0) return alert('No valid unpaid GCash payslips found.');
                      
                      const res = await generatePaymentBatch(period.id, 'GCASH', accountId, 'clxw8xxvj0000vwu4xxw8xxvj');
                      if (!res.success) return alert(res.error);
                      
                      const csvContent = "data:text/csv;charset=utf-8,Worker,GCash Number,Amount\n" + validPayslips.map((p:any) => `${p.worker?.firstName} ${p.worker?.lastName},${p.worker?.gcashNumber},${p.netPay}`).join("\n");
                      const link = document.createElement("a");
                      link.setAttribute("href", encodeURI(csvContent));
                      link.setAttribute("download", `gcash_batch_${res.batchId}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      router.refresh();
                    }}
                    style={{ background: '#3498db', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(52, 152, 219, 0.3)', transition: 'transform 0.2s' }} 
                    onMouseOver={e => (e.currentTarget.style.transform = 'translateY(-2px)')} 
                    onMouseOut={e => (e.currentTarget.style.transform = 'translateY(0)')}
                  >
                    <span>📱</span> GCash Batch
                  </button>
                  <button 
                    onClick={async () => {
                      const accountId = prompt('Enter the Source Payroll Bank Account ID for this Bank Batch:');
                      if (!accountId) return;
                      const validPayslips = period.payrolls.filter((p:any) => p.worker?.allowedPaymentMethod === 'Bank Transfer Only' && (p.paymentStatus === 'PENDING' || p.paymentStatus === 'UNPAID'));
                      if (validPayslips.length === 0) return alert('No valid unpaid Bank Transfer payslips found.');
                      
                      const res = await generatePaymentBatch(period.id, 'BANK', accountId, 'clxw8xxvj0000vwu4xxw8xxvj');
                      if (!res.success) return alert(res.error);
                      
                      const csvContent = "data:text/csv;charset=utf-8,Worker,Bank Name,Account Number,Amount\n" + validPayslips.map((p:any) => `${p.worker?.firstName} ${p.worker?.lastName},${p.worker?.bankName},${p.worker?.bankAccountNumber},${p.netPay}`).join("\n");
                      const link = document.createElement("a");
                      link.setAttribute("href", encodeURI(csvContent));
                      link.setAttribute("download", `bank_batch_${res.batchId}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      router.refresh();
                    }}
                    style={{ background: '#9b59b6', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(155, 89, 182, 0.3)', transition: 'transform 0.2s' }} 
                    onMouseOver={e => (e.currentTarget.style.transform = 'translateY(-2px)')} 
                    onMouseOut={e => (e.currentTarget.style.transform = 'translateY(0)')}
                  >
                    <span>🏦</span> Bank Batch
                  </button>
                </>
              )}
              {period.payrolls?.length > 0 && (
                <>
                  <button 
                    onClick={() => window.open(`/payroll/${period.id}/print?type=summary`, '_blank')}
                    style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', transition: 'all 0.2s' }} 
                    onMouseOver={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'var(--text-primary)'; }} 
                    onMouseOut={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--glass-border)'; }}
                  >
                    🖨️ Print Summary
                  </button>
                  <button 
                    onClick={() => window.open(`/payroll/${period.id}/print?type=payslips`, '_blank')}
                    style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', transition: 'all 0.2s' }} 
                    onMouseOver={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'var(--text-primary)'; }} 
                    onMouseOut={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--glass-border)'; }}
                  >
                    🖨️ Print All Payslips
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ overflowX: 'auto', background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
        {activeTab === 'DTR' ? (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(0,0,0,0.2)' }}>
                <th style={{ padding: '15px 20px' }}>Worker Name</th>
                <th style={{ padding: '15px 20px' }}>Date</th>
                <th style={{ padding: '15px 20px' }}>Reg Hours</th>
                <th style={{ padding: '15px 20px' }}>OT Hours</th>
                <th style={{ padding: '15px 20px' }}>Status / Flags</th>
                <th style={{ padding: '15px 20px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {period.dtrs?.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No Daily Time Records encoded yet. Upload biometrics or encode manually.
                  </td>
                </tr>
              ) : (() => {
                const groupedDtrs = (period.dtrs || []).reduce((acc: any, dtr: any) => {
                  if (!acc[dtr.workerId]) {
                    acc[dtr.workerId] = {
                      workerId: dtr.workerId,
                      worker: dtr.worker,
                      totalReg: 0,
                      totalOt: 0,
                      hasFlag: false,
                      records: []
                    };
                  }
                  acc[dtr.workerId].totalReg += (dtr.regularHours || 0);
                  acc[dtr.workerId].totalOt += (dtr.overtimeHours || 0);
                  if (dtr.aiFlagged) acc[dtr.workerId].hasFlag = true;
                  acc[dtr.workerId].records.push(dtr);
                  return acc;
                }, {});

                const groupedDtrArray = Object.values(groupedDtrs).sort((a: any, b: any) => {
                  const nameA = `${a.worker?.lastName || ''} ${a.worker?.firstName || ''}`.trim().toLowerCase();
                  const nameB = `${b.worker?.lastName || ''} ${b.worker?.firstName || ''}`.trim().toLowerCase();
                  return nameA.localeCompare(nameB);
                });

                return groupedDtrArray.map((group: any) => (
                  <Fragment key={group.workerId}>
                    <tr 
                      onClick={() => setExpandedWorkerId(expandedWorkerId === group.workerId ? null : group.workerId)}
                      style={{ borderBottom: '1px solid var(--glass-border)', cursor: 'pointer', background: expandedWorkerId === group.workerId ? 'rgba(255,255,255,0.05)' : 'transparent', transition: 'background 0.2s' }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseOut={e => e.currentTarget.style.background = expandedWorkerId === group.workerId ? 'rgba(255,255,255,0.05)' : 'transparent'}
                    >
                      <td style={{ padding: '15px 20px', fontWeight: 'bold' }}>
                        <span style={{ display: 'inline-block', width: '20px', color: 'var(--text-secondary)' }}>{expandedWorkerId === group.workerId ? '▼' : '▶'}</span>
                        {group.worker ? `${group.worker.lastName}, ${group.worker.firstName}` : 'Unknown'}
                      </td>
                      <td style={{ padding: '15px 20px', color: 'var(--text-secondary)' }}>{group.records.length} Days Recorded</td>
                      <td style={{ padding: '15px 20px', fontWeight: 'bold' }}>{group.totalReg}</td>
                      <td style={{ padding: '15px 20px', fontWeight: 'bold' }}>{group.totalOt}</td>
                      <td style={{ padding: '15px 20px' }}>
                        {group.hasFlag ? (
                          <span style={{ background: 'rgba(255,107,107,0.1)', color: '#ff6b6b', border: '1px solid rgba(255,107,107,0.3)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                            ⚠️ AI FLAGGED
                          </span>
                        ) : (
                          <span style={{ color: period.isLocked ? '#2ecc71' : 'var(--text-secondary)', fontWeight: period.isLocked ? 'bold' : 'normal' }}>
                            {period.isLocked ? 'COMPLETED' : 'OK'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '15px 20px', textAlign: 'right' }}>
                        <span style={{ color: 'var(--accent-color)', fontSize: '0.85rem' }}>Click to view details</span>
                      </td>
                    </tr>
                    {expandedWorkerId === group.workerId && (
                      <tr>
                        <td colSpan={6} style={{ padding: 0, borderBottom: '2px solid var(--accent-color)' }}>
                          <div style={{ padding: '20px', background: 'rgba(0,0,0,0.3)' }}>
                            <h4 style={{ margin: '0 0 15px 0', color: 'var(--text-secondary)' }}>Daily Breakdown</h4>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
                                  <th style={{ padding: '8px', textAlign: 'left' }}>Date</th>
                                  <th style={{ padding: '8px', textAlign: 'left' }}>Reg Hours</th>
                                  <th style={{ padding: '8px', textAlign: 'left' }}>OT Hours</th>
                                  <th style={{ padding: '8px', textAlign: 'left' }}>Status / Flags</th>
                                  <th style={{ padding: '8px', textAlign: 'right' }}>Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.records.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((dtr: any) => (
                                  <tr key={dtr.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '10px 8px' }}>{new Date(dtr.date).toLocaleDateString()}</td>
                                    <td style={{ padding: '10px 8px' }}>{dtr.regularHours}</td>
                                    <td style={{ padding: '10px 8px' }}>{dtr.overtimeHours}</td>
                                    <td style={{ padding: '10px 8px' }}>
                                      {dtr.aiFlagged ? (
                                        <span style={{ color: '#ff6b6b', fontWeight: 'bold' }}>⚠️ AI FLAGGED</span>
                                      ) : (
                                        <span style={{ color: 'var(--text-secondary)' }}>OK</span>
                                      )}
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                                      {!period.isLocked && (
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingDtr(dtr);
                                            setIsManualOpen(true);
                                          }}
                                          style={{ background: 'transparent', border: '1px solid var(--text-secondary)', color: 'var(--text-secondary)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                                        >
                                          Edit
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ));
              })()}
            </tbody>
          </table>
          </>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(0,0,0,0.2)' }}>
                <th style={{ padding: '15px 20px' }}>Worker Name</th>
                <th style={{ padding: '15px 20px' }}>Gross Pay</th>
                <th style={{ padding: '15px 20px' }}>Deductions (Gov + Loans)</th>
                <th style={{ padding: '15px 20px' }}>Net Pay</th>
                <th style={{ padding: '15px 20px' }}>Payment Status</th>
                <th style={{ padding: '15px 20px', textAlign: 'right' }}>Payslip</th>
              </tr>
            </thead>
            <tbody>
              {period.payrolls?.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No payroll entries generated. Click "Generate Payroll" to compute.
                  </td>
                </tr>
              ) : (
                [...(period.payrolls || [])].sort((a: any, b: any) => {
                  const nameA = `${a.worker?.lastName || ''} ${a.worker?.firstName || ''}`.trim().toLowerCase();
                  const nameB = `${b.worker?.lastName || ''} ${b.worker?.firstName || ''}`.trim().toLowerCase();
                  return nameA.localeCompare(nameB);
                }).map((p: any) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--glass-border)', background: 'transparent', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '15px 20px', fontWeight: 'bold' }}>
                      {p.worker?.lastName}, {p.worker?.firstName}
                      <br/>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>
                        {p.worker?.payrollCategory || 'Uncategorized'} | {p.paymentMethod || 'Manual Hold'}
                      </span>
                    </td>
                    <td style={{ padding: '15px 20px' }}>₱{p.grossPay.toLocaleString()}</td>
                    <td style={{ padding: '15px 20px', color: '#ff6b6b' }}>- ₱{p.totalDeductions.toLocaleString()}</td>
                    <td style={{ padding: '15px 20px', fontWeight: 'bold', fontSize: '1.1rem', color: '#00ffa3' }}>₱{p.netPay.toLocaleString()}</td>
                    <td style={{ padding: '15px 20px' }}>
                      {p.paymentStatus === 'EXCEPTION' ? (
                        <span style={{ background: 'rgba(255,107,107,0.1)', color: '#ff6b6b', border: '1px solid rgba(255,107,107,0.3)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', display: 'inline-block', lineHeight: 1.2 }}>
                          🚫 Exception
                          <br/><span style={{ fontSize: '0.65rem', fontWeight: 'normal' }}>{p.paymentHoldReason}</span>
                        </span>
                      ) : p.paymentStatus === 'ON_HOLD' ? (
                        <span style={{ background: 'rgba(241,196,15,0.1)', color: '#f1c40f', border: '1px solid rgba(241,196,15,0.3)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', display: 'inline-block', lineHeight: 1.2 }}>
                          ⚠️ On Hold
                          <br/><span style={{ fontSize: '0.65rem', fontWeight: 'normal' }}>{p.paymentHoldReason}</span>
                        </span>
                      ) : p.paymentStatus === 'PAID' ? (
                        <span style={{ background: 'rgba(46,204,113,0.1)', color: '#2ecc71', border: '1px solid rgba(46,204,113,0.3)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                          ✅ Paid
                        </span>
                      ) : (
                        <span style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                          ⏳ Pending
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '15px 20px', textAlign: 'right' }}>
                      <button 
                        onClick={() => {
                          setSelectedPayroll(p);
                        }}
                        style={{ background: 'transparent', border: '1px solid var(--accent-color)', color: 'var(--accent-color)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', transition: 'all 0.2s' }}
                        onMouseOver={e => { e.currentTarget.style.background = 'var(--accent-color)'; e.currentTarget.style.color = '#000'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--accent-color)'; }}
                      >
                        View Payslip
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {period.payrolls?.length > 0 && (
              <tfoot>
                <tr style={{ background: 'rgba(0,0,0,0.3)', borderTop: '2px solid var(--glass-border)', fontWeight: 'bold' }}>
                  <td style={{ padding: '15px 20px', color: 'var(--text-secondary)', textAlign: 'right' }}>TOTAL:</td>
                  <td style={{ padding: '15px 20px', color: '#fff' }}>₱{period.payrolls.reduce((sum: number, p: any) => sum + p.grossPay, 0).toLocaleString()}</td>
                  <td style={{ padding: '15px 20px', color: '#ff6b6b' }}>- ₱{period.payrolls.reduce((sum: number, p: any) => sum + p.totalDeductions, 0).toLocaleString()}</td>
                  <td style={{ padding: '15px 20px', color: '#00ffa3', fontSize: '1.2rem' }}>₱{period.payrolls.reduce((sum: number, p: any) => sum + p.netPay, 0).toLocaleString()}</td>
                  <td colSpan={2} style={{ padding: '15px 20px' }}></td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
        
        {activeTab === 'FUNDING' && period.isLocked && (
          <div style={{ background: 'var(--card-bg)', padding: '30px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <h2>Funding Requests</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Funding requests manage the transfer of funds into the dedicated Payroll Bank Account.</p>
            
            {(!period.fundingRequests || period.fundingRequests.length === 0) ? (
              <div style={{ marginTop: '20px' }}>
                <div style={{ padding: '20px', background: 'rgba(230, 126, 34, 0.1)', color: '#e67e22', borderRadius: '8px', border: '1px solid #e67e22', marginBottom: '20px' }}>
                  <strong>⚠️ No Funding Request Found</strong>
                  <p style={{ margin: '5px 0 0 0' }}>This payroll is locked but hasn't been funded yet. You must create a funding request before payments can be released.</p>
                </div>
                
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Funding Source Account</label>
                  <select
                    value={selectedBankAccountId}
                    onChange={(e) => setSelectedBankAccountId(e.target.value)}
                    style={{ padding: '12px', width: '100%', maxWidth: '400px', borderRadius: '8px', background: 'var(--input-bg)', color: '#fff', border: '1px solid var(--glass-border)' }}
                  >
                    <option value="">-- Select Source Account --</option>
                    {bankAccounts.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>{acc.bankName} - {acc.accountName} ({acc.accountNumber})</option>
                    ))}
                  </select>
                </div>

                {boqItems.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Charge Payroll to BOQ Item in Awarded Contract (Optional)</label>
                    <select
                      value={selectedBoqId}
                      onChange={(e) => setSelectedBoqId(e.target.value)}
                      style={{ padding: '12px', width: '100%', maxWidth: '400px', borderRadius: '8px', background: 'var(--input-bg)', color: '#fff', border: '1px solid var(--glass-border)' }}
                    >
                      <option value="">-- Do not allocate to BOQ --</option>
                      {boqItems.map(item => (
                        <option key={item.id} value={item.id}>{item.description} (Awarded: ₱{item.totalCost?.toLocaleString()})</option>
                      ))}
                    </select>
                    {selectedBoqId && (() => {
                      const selectedBoq = boqItems.find(i => i.id === selectedBoqId);
                      if (selectedBoq && totalRequiredFunding > selectedBoq.totalCost) {
                        return (
                          <div style={{ marginTop: '10px', padding: '12px', background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', borderRadius: '8px', border: '1px solid #e74c3c', fontSize: '0.9rem' }}>
                            <strong>⚠️ Overbudget Warning:</strong> The required funding (₱ {totalRequiredFunding.toLocaleString()}) exceeds the awarded amount for this BOQ item (₱ {selectedBoq.totalCost?.toLocaleString()}). Proceeding will require explicit approval from the Project Director.
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                <button 
                  onClick={async () => {
                    if (!selectedBankAccountId) {
                      alert('Please select a Funding Source Account.');
                      return;
                    }
                    
                    const res = await createFundingRequest(period.id, selectedBankAccountId, 'clxw8xxvj0000vwu4xxw8xxvj', selectedBoqId || undefined);
                    if (res.success) {
                      alert('Funding Request Created!');
                      router.refresh();
                    } else {
                      alert('Failed to create funding request: ' + res.error);
                    }
                  }}
                  style={{ background: 'var(--accent-color)', color: '#000', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Create Funding Request
                </button>
              </div>
            ) : (
              <div>
                {period.fundingRequests.map((fr: any) => (
                  <div key={fr.id} style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '8px', border: '1px solid var(--glass-border)', marginBottom: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <h3 style={{ margin: 0 }}>Request: {fr.fundingRequestNumber}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {fr.fundingStatus === 'PENDING' && (
                          <button
                            onClick={async () => {
                              if (!confirm('Are you sure you want to approve this funding request?')) return;
                              const res = await approveFundingRequest(fr.id, 'clxw8xxvj0000vwu4xxw8xxvj');
                              if (res.success) {
                                alert('Funding Request Approved!');
                                router.refresh();
                              } else {
                                alert('Failed to approve: ' + res.error);
                              }
                            }}
                            style={{ background: '#2ecc71', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                          >
                            Approve
                          </button>
                        )}
                        <span style={{ 
                          background: fr.fundingStatus === 'FUNDED' ? 'rgba(46, 204, 113, 0.2)' : 'rgba(241, 196, 15, 0.2)', 
                          color: fr.fundingStatus === 'FUNDED' ? '#2ecc71' : '#f1c40f', 
                          padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold' 
                        }}>
                          {fr.fundingStatus}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      <div>
                        <p style={{ margin: '0 0 5px 0', color: 'var(--text-secondary)' }}>Total Required</p>
                        <strong style={{ fontSize: '1.2rem' }}>₱ {fr.totalRequiredFunding.toLocaleString()}</strong>
                      </div>
                      <div>
                        <p style={{ margin: '0 0 5px 0', color: 'var(--text-secondary)' }}>Funding Shortage</p>
                        <strong style={{ fontSize: '1.2rem', color: fr.fundingShortage > 0 ? '#e74c3c' : '#2ecc71' }}>₱ {fr.fundingShortage.toLocaleString()}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: '40px', borderTop: '1px solid var(--glass-border)', paddingTop: '30px' }}>
              <h2>Batch Reconciliation</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>Upload the CSV report from GCash or your Bank to automatically mark payslips as Paid or Failed.</p>
              
              <button 
                onClick={() => {
                  const batchId = prompt('Enter the Payment Batch ID to reconcile:');
                  if (!batchId) return;
                  
                  // Mock reconciliation
                  alert(`Simulating reconciliation for batch ${batchId}... (In production, a file picker would open here). Payslips will be marked as PAID.`);
                }}
                style={{ background: '#2ecc71', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <span>✅</span> Upload Reconciliation CSV
              </button>
            </div>
          </div>
        )}

      </div>      {isUploadOpen && <UploadBiometricsModal period={period} onClose={() => setIsUploadOpen(false)} />}
      {isManualOpen && (
        <ManualDtrModal 
          period={period} 
          workers={workers} 
          editingDtr={editingDtr}
          onClose={() => {
            setIsManualOpen(false);
            setEditingDtr(null);
          }} 
        />
      )}
      {isValidationOpen && (
        <ValidationModal 
          periodId={period.id} 
          onClose={() => setIsValidationOpen(false)} 
          onSuccess={() => {
            setIsValidationOpen(false);
            alert('Payroll submitted successfully for review!');
            router.refresh();
          }} 
        />
      )}
      {selectedPayroll && (
        <PayslipModal 
          payroll={selectedPayroll} 
          dtrs={period.dtrs}
          onClose={() => setSelectedPayroll(null)} 
        />
      )}
      {viewingFile && (
        <FileViewerModal 
          filename={viewingFile}
          onClose={() => setViewingFile(null)}
        />
      )}
      
      <AIPayrollAssistant />
    </div>
  );
}
