'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { validateWorkerProfileWithAI, saveWorkerProfile } from '@/app/actions/workerActions';

export default function NewWorkerForm({ initialData, projects = [] }: { initialData?: any; projects?: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('BASIC_INFO');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  // Shown on the page; alert() pop-ups are suppressed in embedded browsers, so saves looked silent.
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  
  const [formData, setFormData] = useState({
    id: undefined as string | undefined,
    workerId: '',
    firstName: '',
    lastName: '',
    middleName: '',
    designation: '',
    workerCategory: 'SKILLED',
    employmentType: 'PROJECT_BASED',
    employmentStatus: 'ACTIVE',
    // Site assignment: counted in the project's "Active Site Workers" and charged with the worker's payroll.
    projectId: '',
    rateType: 'DAILY_RATE',
    dailyRate: 0,
    basicMonthlySalary: 0,
    hourlyRate: 0,
    pieceRate: 0,
    contractAmount: 0,
    professionalFee: 0,
    
    tinNumber: '',
    sssNumber: '',
    philHealthNumber: '',
    pagIbigNumber: '',
    
    withholdingTaxEnabled: false,
    sssDeductionEnabled: false,
    philHealthDeductionEnabled: false,
    pagibigDeductionEnabled: false,
    
    payrollCategory: 'Weekly Salaried',
    allowedPaymentMethod: 'GCash Only',
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: '',
    gcashNumber: '',
    ...(initialData ? Object.fromEntries(Object.entries(initialData).map(([k, v]) => [k, v === null ? '' : v])) : {})
  });

  const [aiValidationLogs, setAiValidationLogs] = useState<any[]>([]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    let updates: any = { [name]: type === 'checkbox' ? checked : value };
    
    // Auto-enforce payment method based on payroll category
    if (name === 'payrollCategory') {
      if (value === 'Weekly Salaried') {
        updates.allowedPaymentMethod = 'GCash Only';
      } else {
        updates.allowedPaymentMethod = 'Bank Transfer Only';
      }
    }

    // Auto-enforce payroll category based on rate type
    if (name === 'rateType') {
      if (value === 'MONTHLY_SALARY') {
        updates.payrollCategory = 'Semi-Monthly';
        updates.allowedPaymentMethod = 'Bank Transfer Only';
      }
    }
    
    setFormData(prev => ({
      ...prev,
      ...updates
    }));
  };

  const handleValidate = async () => {
    setIsValidating(true);
    setAiValidationLogs([]);
    const res = await validateWorkerProfileWithAI(formData);
    setIsValidating(false);
    
    if (res.success && res.results) {
      setAiValidationLogs(res.results);
      setActiveTab('AI_VALIDATION');
    } else {
      setNotice({ kind: 'error', text: 'Validation failed or could not be completed.' });
    }
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    
    // Check for critical errors before saving
    const criticalLogs = aiValidationLogs.filter(log => log.severity === 'CRITICAL');
    if (criticalLogs.length > 0) {
      setNotice({ kind: 'error', text: 'Cannot save: critical errors exist. Resolve them first.' });
      setIsSubmitting(false);
      return;
    }
    
    const res = await saveWorkerProfile(formData, aiValidationLogs);
    setIsSubmitting(false);
    
    if (res.success) {
      setNotice({ kind: 'success', text: 'Worker saved.' });
      router.push(`/workers/${res.workerId || formData.id}`);
    } else {
      setNotice({ kind: 'error', text: `Failed to save worker: ${res.error || 'unknown error'}` });
    }
  };

  const tabs = [
    { id: 'BASIC_INFO', label: '1. Basic Information' },
    { id: 'EMPLOYMENT', label: '2. Employment Details' },
    { id: 'COMPENSATION', label: '3. Rate & Compensation' },
    { id: 'GOVERNMENT', label: '4. Government & Taxes' },
    { id: 'PAYMENT', label: '5. Payment Details' },
    { id: 'AI_VALIDATION', label: '6. AI Validation Summary' }
  ];

  return (
    <div style={{ display: 'flex', gap: '20px' }}>
      {/* Sidebar Tabs */}
      <div style={{ width: '250px', flexShrink: 0 }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                width: '100%',
                padding: '15px 20px',
                textAlign: 'left',
                background: activeTab === tab.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--glass-border)',
                color: activeTab === tab.id ? 'var(--accent-color)' : 'var(--text-primary)',
                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                cursor: 'pointer'
              }}
            >
              {tab.label}
              {tab.id === 'AI_VALIDATION' && aiValidationLogs.length > 0 && (
                <span style={{ 
                  background: 'var(--danger-color)', 
                  color: '#fff', 
                  fontSize: '0.7rem', 
                  padding: '2px 6px', 
                  borderRadius: '10px', 
                  marginLeft: '10px' 
                }}>
                  {aiValidationLogs.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Form Content Area */}
      <div style={{ flex: 1, background: 'var(--card-bg)', borderRadius: '12px', padding: '30px', border: '1px solid var(--glass-border)' }}>
        
        {activeTab === 'BASIC_INFO' && (
          <div>
            <h2 style={{ marginTop: 0 }}>Basic Information</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {initialData && <input type="hidden" name="id" value={formData.id} />}
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>Worker ID (Emp No.)</label>
                <input name="workerId" value={formData.workerId} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>Position</label>
                <select name="workerCategory" value={formData.workerCategory} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#333', border: '1px solid var(--glass-border)', color: '#fff' }}>
                  <optgroup label="Management & Engineering" style={{ background: 'var(--bg-secondary)' }}>
                    <option value="Project Director">Project Director</option>
                    <option value="Project Manager">Project Manager</option>
                    <option value="Project Engineer - Civil">Project Engineer - Civil</option>
                    <option value="Project Engineer - Electrical">Project Engineer - Electrical</option>
                    <option value="Project Engineer - Mechanical">Project Engineer - Mechanical</option>
                    <option value="Project Engineer - Plumbing Sanitary">Project Engineer - Plumbing Sanitary</option>
                    <option value="Fire Protection Engineer">Fire Protection Engineer</option>
                    <option value="Cost Engineer">Cost Engineer</option>
                    <option value="Materials Engineer">Materials Engineer</option>
                    <option value="Safety Officer">Safety Officer</option>
                    <option value="Surveyor">Surveyor</option>
                  </optgroup>
                  <optgroup label="Finance & Admin" style={{ background: 'var(--bg-secondary)' }}>
                    <option value="Project Accountant">Project Accountant</option>
                    <option value="Project Auditor">Project Auditor</option>
                    <option value="Finance Officer">Finance Officer</option>
                    <option value="Accounting Clerk">Accounting Clerk</option>
                    <option value="Purchasing Officer">Purchasing Officer</option>
                    <option value="Purchasing Clerk">Purchasing Clerk</option>
                    <option value="Stockman">Stockman</option>
                    <option value="Site Nurse">Site Nurse</option>
                    <option value="Security Guard">Security Guard</option>
                  </optgroup>
                  <optgroup label="Field Workers" style={{ background: 'var(--bg-secondary)' }}>
                    <option value="Foreman">Foreman</option>
                    <option value="Skilled Worker">Skilled Worker</option>
                    <option value="Heavy Equipment Operator">Heavy Equipment Operator</option>
                    <option value="Driver">Driver</option>
                    <option value="Electrician">Electrician</option>
                    <option value="Plumber">Plumber</option>
                    <option value="Mason">Mason</option>
                    <option value="Carpenter">Carpenter</option>
                    <option value="Welder">Welder</option>
                    <option value="Painter">Painter</option>
                    <option value="Steelman">Steelman</option>
                    <option value="Helper">Helper</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>First Name</label>
                <input name="firstName" value={formData.firstName} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>Last Name</label>
                <input name="lastName" value={formData.lastName} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff' }} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'EMPLOYMENT' && (
          <div>
            <h2 style={{ marginTop: 0 }}>Employment / Engagement Type</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>Engagement Type</label>
                <select name="employmentType" value={formData.employmentType} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#333', border: '1px solid var(--glass-border)', color: '#fff' }}>
                  <option value="REGULAR">Regular Employee</option>
                  <option value="PROJECT_BASED">Project-Based Employee</option>
                  <option value="DAILY_WORKER">Daily Worker</option>
                  <option value="MONTHLY_EMPLOYEE">Monthly Employee</option>
                  <option value="HOURLY_WORKER">Hourly Worker</option>
                  <option value="ONE_LOT_WORKER">One-Lot / Lump Sum Worker</option>
                  <option value="FREELANCE_CONSULTANT">Freelance Consultant</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>Status</label>
                <select name="employmentStatus" value={formData.employmentStatus} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#333', border: '1px solid var(--glass-border)', color: '#fff' }}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>Assigned Project / Site</label>
                <select name="projectId" value={formData.projectId || ''} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#333', border: '1px solid var(--glass-border)', color: '#fff' }}>
                  <option value="">Not assigned (office / pool)</option>
                  {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'COMPENSATION' && (
          <div>
            <h2 style={{ marginTop: 0 }}>Rate & Compensation</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>Rate Type</label>
                <select name="rateType" value={formData.rateType} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#333', border: '1px solid var(--glass-border)', color: '#fff' }}>
                  <option value="DAILY_RATE">Daily Rate</option>
                  <option value="MONTHLY_SALARY">Monthly Salary</option>
                  <option value="HOURLY_RATE">Hourly Rate</option>
                  <option value="ONE_LOT">One-Lot / Lump Sum</option>
                  <option value="PROFESSIONAL_FEE">Professional Fee</option>
                </select>
              </div>
            </div>

            {formData.rateType === 'DAILY_RATE' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px' }}>Daily Rate (₱)</label>
                  <input type="number" name="dailyRate" value={formData.dailyRate} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff' }} />
                </div>
              </div>
            )}
            
            {formData.rateType === 'MONTHLY_SALARY' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px' }}>Monthly Salary (₱)</label>
                  <input type="number" name="basicMonthlySalary" value={formData.basicMonthlySalary} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff' }} />
                </div>
              </div>
            )}

            {(formData.rateType === 'ONE_LOT' || formData.rateType === 'PROFESSIONAL_FEE') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px' }}>{formData.rateType === 'ONE_LOT' ? 'Contract Amount' : 'Professional Fee'} (₱)</label>
                  <input type="number" name={formData.rateType === 'ONE_LOT' ? 'contractAmount' : 'professionalFee'} value={formData.rateType === 'ONE_LOT' ? formData.contractAmount : formData.professionalFee} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff' }} />
                </div>
              </div>
            )}
            
            {/* Real-time Preview Area */}
            <div style={{ marginTop: '30px', padding: '20px', background: 'rgba(52, 152, 219, 0.1)', border: '1px solid rgba(52, 152, 219, 0.3)', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#3498db' }}>Computation Preview</h3>
              {formData.rateType === 'DAILY_RATE' && <p>Estimated Pay (6 Days): ₱{((formData.dailyRate || 0) * 6).toLocaleString()}</p>}
              {formData.rateType === 'MONTHLY_SALARY' && <p>Semi-Monthly Estimate: ₱{((formData.basicMonthlySalary || 0) / 2).toLocaleString()}</p>}
              {formData.rateType === 'PROFESSIONAL_FEE' && <p>Gross Professional Fee: ₱{(formData.professionalFee || 0).toLocaleString()}</p>}
              {formData.rateType === 'ONE_LOT' && <p>Gross Contract Amount: ₱{(formData.contractAmount || 0).toLocaleString()}</p>}
            </div>
          </div>
        )}

        {activeTab === 'GOVERNMENT' && (
          <div>
            <h2 style={{ marginTop: 0 }}>Government IDs & Taxes</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>TIN Number</label>
                <input name="tinNumber" value={formData.tinNumber} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>SSS Number</label>
                <input name="sssNumber" value={formData.sssNumber} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>PhilHealth Number</label>
                <input name="philHealthNumber" value={formData.philHealthNumber} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>Pag-IBIG Number</label>
                <input name="pagIbigNumber" value={formData.pagIbigNumber} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff' }} />
              </div>
            </div>

            <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>Payroll Deductions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="checkbox" name="withholdingTaxEnabled" checked={formData.withholdingTaxEnabled} onChange={handleInputChange} />
                Withholding Tax Enabled
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="checkbox" name="sssDeductionEnabled" checked={formData.sssDeductionEnabled} onChange={handleInputChange} />
                SSS Deduction Enabled
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="checkbox" name="philHealthDeductionEnabled" checked={formData.philHealthDeductionEnabled} onChange={handleInputChange} />
                PhilHealth Deduction Enabled
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="checkbox" name="pagibigDeductionEnabled" checked={formData.pagibigDeductionEnabled} onChange={handleInputChange} />
                Pag-IBIG Deduction Enabled
              </label>
            </div>
          </div>
        )}

        {activeTab === 'PAYMENT' && (
          <div>
            <h2 style={{ marginTop: 0 }}>Payment Details & Profile</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>Payroll Category</label>
                <select name="payrollCategory" value={formData.payrollCategory} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: '#333', border: '1px solid var(--glass-border)', color: '#fff' }}>
                  <option value="Weekly Salaried">Weekly Salaried</option>
                  <option value="Semi-Monthly">Semi-Monthly</option>
                  <option value="Monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px' }}>Allowed Payment Method (Auto-Enforced)</label>
                <input name="allowedPaymentMethod" value={formData.allowedPaymentMethod} disabled style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.1)', border: '1px solid var(--glass-border)', color: '#aaa', cursor: 'not-allowed' }} />
              </div>
            </div>

            {formData.allowedPaymentMethod === 'Bank Transfer Only' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', background: 'rgba(52, 152, 219, 0.1)', padding: '20px', borderRadius: '8px', border: '1px solid rgba(52, 152, 219, 0.3)' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px' }}>Bank Name</label>
                  <input name="bankName" value={formData.bankName} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px' }}>Bank Account Number</label>
                  <input name="bankAccountNumber" value={formData.bankAccountNumber} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px' }}>Bank Account Name</label>
                  <input name="bankAccountName" value={formData.bankAccountName} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff' }} />
                </div>
              </div>
            )}
            
            {formData.allowedPaymentMethod === 'GCash Only' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', background: 'rgba(46, 204, 113, 0.1)', padding: '20px', borderRadius: '8px', border: '1px solid rgba(46, 204, 113, 0.3)' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px' }}>GCash Number</label>
                  <input name="gcashNumber" value={formData.gcashNumber} onChange={handleInputChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px' }}>GCash Account Name</label>
                  <input name="bankAccountName" value={formData.bankAccountName} onChange={handleInputChange} placeholder="Must match GCash registered name" style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff' }} />
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'AI_VALIDATION' && (
          <div>
            <h2 style={{ marginTop: 0 }}>AI Validation Summary</h2>
            
            {aiValidationLogs.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', background: 'rgba(46, 204, 113, 0.1)', border: '1px solid #2ecc71', borderRadius: '8px', color: '#2ecc71' }}>
                <h3 style={{ margin: '0 0 10px 0' }}>All Good!</h3>
                <p style={{ margin: 0 }}>No validation issues found. The profile is ready to save.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {aiValidationLogs.map((log, index) => (
                  <div key={index} style={{ 
                    padding: '15px', 
                    background: log.severity === 'CRITICAL' ? 'rgba(231, 76, 60, 0.1)' : log.severity === 'HIGH' ? 'rgba(230, 126, 34, 0.1)' : 'rgba(241, 196, 15, 0.1)',
                    borderLeft: `4px solid ${log.severity === 'CRITICAL' ? '#e74c3c' : log.severity === 'HIGH' ? '#e67e22' : '#f1c40f'}`,
                    borderRadius: '4px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <strong style={{ color: log.severity === 'CRITICAL' ? '#e74c3c' : log.severity === 'HIGH' ? '#e67e22' : '#f1c40f' }}>{log.category} Issue ({log.severity})</strong>
                      {log.fieldRef && <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Field: {log.fieldRef}</span>}
                    </div>
                    <p style={{ margin: '0 0 10px 0' }}>{log.message}</p>
                    <div style={{ fontSize: '0.9rem', color: '#fff', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '4px' }}>
                      <strong>Recommended Fix:</strong> {log.recommendedCorrection}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Sidebar */}
      <div style={{ width: '250px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <button 
          onClick={handleValidate} 
          disabled={isValidating}
          style={{ 
            background: 'rgba(155, 89, 182, 0.2)', 
            color: '#9b59b6', 
            border: '1px solid #9b59b6', 
            padding: '15px', 
            borderRadius: '8px', 
            cursor: isValidating ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          {isValidating ? 'Validating...' : '✨ Validate with AI'}
        </button>
        <button 
          onClick={handleSave} 
          disabled={isSubmitting}
          style={{ 
            background: 'var(--accent-color)', 
            color: '#000', 
            border: 'none', 
            padding: '15px', 
            borderRadius: '8px', 
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          {isSubmitting ? 'Saving...' : 'Save Worker Profile'}
        </button>
        {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} style={{ margin: 0, fontSize: '0.9rem', color: notice.kind === 'error' ? '#fca5a5' : '#6ee7b7' }}>{notice.text}</p>}
        <button 
          onClick={() => router.push('/workers')} 
          style={{ 
            background: 'transparent', 
            color: 'var(--text-primary)', 
            border: '1px solid var(--glass-border)', 
            padding: '15px', 
            borderRadius: '8px', 
            cursor: 'pointer' 
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
