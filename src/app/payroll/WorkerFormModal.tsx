'use client';

import { useState, useEffect } from 'react';
import { saveWorkerProfile, deleteWorker } from '@/app/actions/workerActions';
import { useRouter } from 'next/navigation';

export default function WorkerFormModal({ worker, projects = [], onClose }: { worker: any, projects?: Array<{ id: string; name: string }>, onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    workerId: '',
    firstName: '',
    lastName: '',
    middleName: '',
    designation: '',
    dailyRate: 0,
    workerCategory: 'SKILLED',
    employmentType: 'PROJECT_BASED',
    payrollCategory: 'Semi-Monthly',
    allowedPaymentMethod: 'Bank Transfer Only',
    gcashNumber: '',
    gcashAccountName: '',
    bankName: '',
    bankAccountNumber: '',
    bankAccountName: '',
    rateType: 'DAILY_RATE',
    basicMonthlySalary: 0,
    hourlyRate: 0,
    // The site the worker is assigned to: counted under the project's "Active Site Workers" and charged with
    // their payroll. No form set it before, so every project showed 0 site workers.
    projectId: ''
  });

  const handlePayrollCategoryChange = (val: string) => {
    let allowed = formData.allowedPaymentMethod;
    let newRateType = formData.rateType;
    if (val === 'Weekly Salaried') {
      allowed = 'GCash Only';
      newRateType = 'DAILY_RATE';
    }
    else if (['Semi-Monthly', 'Monthly'].includes(val)) {
      allowed = 'Bank Transfer Only';
      newRateType = 'MONTHLY_SALARY';
    }
    
    setFormData({ ...formData, payrollCategory: val, allowedPaymentMethod: allowed, rateType: newRateType });
  };

  useEffect(() => {
    if (worker) {
      setFormData({
        workerId: worker.workerId || '',
        firstName: worker.firstName || '',
        lastName: worker.lastName || '',
        middleName: worker.middleName || '',
        designation: worker.designation || '',
        dailyRate: worker.dailyRate || 0,
        workerCategory: worker.workerCategory || 'SKILLED',
        employmentType: worker.employmentType || 'PROJECT_BASED',
        payrollCategory: worker.payrollCategory || 'Semi-Monthly',
        allowedPaymentMethod: worker.allowedPaymentMethod || 'Bank Transfer Only',
        gcashNumber: worker.gcashNumber || '',
        gcashAccountName: worker.gcashAccountName || '',
        bankName: worker.bankName || '',
        bankAccountNumber: worker.bankAccountNumber || '',
        bankAccountName: worker.bankAccountName || '',
        rateType: worker.rateType || 'DAILY_RATE',
        basicMonthlySalary: worker.basicMonthlySalary || 0,
        hourlyRate: worker.hourlyRate || 0,
        projectId: worker.projectId || ''
      });
    } else {
      // Pre-assign unique employee number for new workers
      setFormData(prev => ({ ...prev, workerId: `EMP-${Math.floor(Date.now() / 1000)}` }));
    }
  }, [worker]);

  // Auto-sync computed rates whenever primary rates or category change
  useEffect(() => {
    if (['Semi-Monthly', 'Monthly'].includes(formData.payrollCategory)) {
      const computedDaily = (formData.basicMonthlySalary * 12) / 313;
      if (Math.abs(formData.dailyRate - computedDaily) > 0.01) {
        setFormData(prev => ({ ...prev, dailyRate: Number(computedDaily.toFixed(2)) }));
      }
    } else if (formData.payrollCategory === 'Weekly Salaried') {
      const computedHourly = formData.dailyRate / 8;
      if (Math.abs(formData.hourlyRate - computedHourly) > 0.01) {
        setFormData(prev => ({ ...prev, hourlyRate: Number(computedHourly.toFixed(2)) }));
      }
    }
  }, [formData.basicMonthlySalary, formData.dailyRate, formData.payrollCategory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const payload = worker ? { id: worker.id, ...formData } : formData;
    const res = await saveWorkerProfile(payload, []);

    if (res.success) {
      onClose();
    } else {
      setError(res.error || 'Failed to save worker');
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this worker?')) return;
    setLoading(true);
    const res = await deleteWorker(worker.id);
    if (res.success) {
      onClose();
    } else {
      setError(res.error || 'Failed to delete worker');
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10, 15, 26, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div style={{ background: 'var(--bg-secondary)', borderRadius: '16px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05)' }}>
        <div style={{ padding: '25px 35px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#fff', fontWeight: '700' }}>{worker ? 'Edit Worker' : 'Add New Worker'}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '35px' }}>
          {error && <div style={{ background: 'rgba(255, 107, 107, 0.1)', color: '#ff6b6b', padding: '15px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem', border: '1px solid rgba(255, 107, 107, 0.3)' }}>{error}</div>}

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Assigned Project / Site</label>
            <select value={formData.projectId} onChange={(e) => setFormData({...formData, projectId: e.target.value})} style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }}>
              <option value="">Not assigned (office / pool)</option>
              {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Employee No / ID</label>
              <input type="text" value={formData.workerId} onChange={(e) => setFormData({...formData, workerId: e.target.value})} style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }} required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Position</label>
              <select value={formData.workerCategory} onChange={(e) => setFormData({...formData, workerCategory: e.target.value, designation: e.target.value})} style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }}>
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
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>First Name</label>
              <input type="text" value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }} required />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Middle Name</label>
              <input type="text" value={formData.middleName} onChange={(e) => setFormData({...formData, middleName: e.target.value})} style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Last Name</label>
              <input type="text" value={formData.lastName} onChange={(e) => setFormData({...formData, lastName: e.target.value})} style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }} required />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Emp. Type</label>
              <select value={formData.employmentType} onChange={(e) => setFormData({...formData, employmentType: e.target.value})} style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }}>
                <option value="PROJECT_BASED" style={{ background: 'var(--bg-secondary)' }}>Project Based</option>
                <option value="REGULAR" style={{ background: 'var(--bg-secondary)' }}>Regular</option>
                <option value="CONTRACTUAL" style={{ background: 'var(--bg-secondary)' }}>Contractual</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Payroll Category</label>
              <select value={formData.payrollCategory} onChange={(e) => handlePayrollCategoryChange(e.target.value)} style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }}>
                <option value="Weekly Salaried" style={{ background: 'var(--bg-secondary)' }}>Weekly Salaried</option>
                <option value="Semi-Monthly" style={{ background: 'var(--bg-secondary)' }}>Semi-Monthly</option>
                <option value="Monthly" style={{ background: 'var(--bg-secondary)' }}>Monthly</option>
              </select>
            </div>

            {['Semi-Monthly', 'Monthly'].includes(formData.payrollCategory) ? (
              <>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Monthly Rate (₱)</label>
                  <input type="number" step="0.01" value={formData.basicMonthlySalary} onChange={(e) => {
                    setFormData({...formData, basicMonthlySalary: Number(e.target.value)});
                  }} style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }} required />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Computed Daily Rate (₱)</label>
                  <div style={{ padding: '12px 15px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: '#aaa', fontSize: '0.9rem' }}>
                    {formData.dailyRate.toLocaleString(undefined, {minimumFractionDigits: 2})} <span style={{fontSize: '0.75rem', marginLeft: '5px'}}>(313 days/yr)</span>
                  </div>
                </div>
              </>
            ) : formData.payrollCategory === 'Weekly Salaried' ? (
              <>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Daily Rate (₱)</label>
                  <input type="number" step="0.01" value={formData.dailyRate} onChange={(e) => {
                    setFormData({...formData, dailyRate: Number(e.target.value)});
                  }} style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }} required />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Computed Hourly Rate (₱)</label>
                  <div style={{ padding: '12px 15px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: '#aaa', fontSize: '0.9rem' }}>
                    {formData.hourlyRate.toLocaleString(undefined, {minimumFractionDigits: 2})} <span style={{fontSize: '0.75rem', marginLeft: '5px'}}>(8 hrs/day)</span>
                  </div>
                </div>
              </>
            ) : (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Daily Rate (₱)</label>
                <input type="number" step="0.01" value={formData.dailyRate} onChange={(e) => setFormData({...formData, dailyRate: Number(e.target.value)})} style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }} required />
              </div>
            )}
          </div>

          <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px', marginBottom: '20px', color: '#fff', fontSize: '1.1rem' }}>Payment Information</h3>

          {formData.allowedPaymentMethod === 'GCash Only' && (
            <div style={{ background: 'rgba(52, 152, 219, 0.1)', border: '1px solid rgba(52, 152, 219, 0.3)', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
              <div style={{ color: '#3498db', fontWeight: 'bold', marginBottom: '15px' }}>ℹ️ Weekly salaried workers are payable through GCash only.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>GCash Mobile Number</label>
                  <input type="text" value={formData.gcashNumber} onChange={(e) => setFormData({...formData, gcashNumber: e.target.value})} style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }} required />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>GCash Account Name</label>
                  <input type="text" value={formData.gcashAccountName} onChange={(e) => setFormData({...formData, gcashAccountName: e.target.value})} style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }} required />
                </div>
              </div>
            </div>
          )}

          {formData.allowedPaymentMethod === 'Bank Transfer Only' && (
            <div style={{ background: 'rgba(155, 89, 182, 0.1)', border: '1px solid rgba(155, 89, 182, 0.3)', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
              <div style={{ color: '#9b59b6', fontWeight: 'bold', marginBottom: '15px' }}>ℹ️ This worker category is payable through nominated bank account only.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Bank Name</label>
                  <input type="text" value={formData.bankName} onChange={(e) => setFormData({...formData, bankName: e.target.value})} style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }} required />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Bank Account Number</label>
                  <input type="text" value={formData.bankAccountNumber} onChange={(e) => setFormData({...formData, bankAccountNumber: e.target.value})} style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }} required />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: '600' }}>Account Name</label>
                  <input type="text" value={formData.bankAccountName} onChange={(e) => setFormData({...formData, bankAccountName: e.target.value})} style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', outline: 'none' }} required />
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              {worker ? (
                <button type="button" onClick={handleDelete} disabled={loading} style={{ background: 'rgba(255,107,107,0.1)', color: '#ff6b6b', border: '1px solid rgba(255,107,107,0.3)', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Delete Worker</button>
              ) : <div />}
              <button 
                type="button" 
                onClick={() => {
                  onClose();
                  if (worker) {
                    router.push(`/workers/${worker.id}/edit`);
                  } else {
                    const q = new URLSearchParams();
                    if (formData.workerId) q.set('workerId', formData.workerId);
                    if (formData.firstName) q.set('firstName', formData.firstName);
                    if (formData.middleName) q.set('middleName', formData.middleName);
                    if (formData.lastName) q.set('lastName', formData.lastName);
                    if (formData.workerCategory) q.set('workerCategory', formData.workerCategory);
                    if (formData.employmentType) q.set('employmentType', formData.employmentType);
                    if (formData.payrollCategory) q.set('payrollCategory', formData.payrollCategory);
                    if (formData.dailyRate) q.set('dailyRate', formData.dailyRate.toString());
                    router.push(`/workers/new?${q.toString()}`);
                  }
                }} 
                style={{ background: 'rgba(52, 152, 219, 0.1)', color: '#3498db', border: '1px solid rgba(52, 152, 219, 0.3)', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', textDecoration: 'none' }}
              >
                Open Full Form
              </button>
            </div>
            <div style={{ display: 'flex', gap: '15px' }}>
              <button type="button" onClick={onClose} style={{ padding: '12px 25px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--text-secondary)', color: 'var(--text-secondary)', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={loading} style={{ background: 'var(--accent-color)', color: '#000', border: 'none', padding: '12px 25px', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}>
                {loading ? 'Saving...' : 'Save Quick Worker'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
