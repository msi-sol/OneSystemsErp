'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CreatePeriodModal from './CreatePeriodModal';
import WorkerFormModal from './WorkerFormModal';
import AIPayrollAssistant from './AIPayrollAssistant';
import { deletePayrollPeriod } from '../actions/payrollEngine';
import ApplicableRulesPanel from '@/components/ApplicableRulesPanel';
import PermissionGuard from '@/components/PermissionGuard';

export default function PayrollClient({ periods, workers, projects, currentUserId, permissions }: { periods: any[], workers: any[], projects: any[], currentUserId: string, permissions?: any }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('PERIODS');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<any>(null);

  const handleDeletePeriod = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this payroll period? All associated DTRs will be removed. This action cannot be undone.')) {
      try {
        const res = await deletePayrollPeriod(id);
        if (res.success) {
          router.refresh();
        } else {
          alert(res.error || 'Failed to delete period');
        }
      } catch (err: any) {
        alert(err.message || 'An error occurred');
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'rgba(255,255,255,0.1)';
      case 'FOR_REVIEW': return 'rgba(243,156,18,0.2)'; // Orange
      case 'APPROVED': return 'rgba(155,89,182,0.2)'; // Purple
      case 'RELEASED': return 'rgba(0,255,163,0.2)'; // Green
      case 'LOCKED': return 'rgba(255,107,107,0.2)'; // Red
      default: return 'rgba(255,255,255,0.1)';
    }
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return '#fff';
      case 'FOR_REVIEW': return '#f39c12';
      case 'APPROVED': return '#9b59b6';
      case 'RELEASED': return '#00ffa3';
      case 'LOCKED': return '#ff6b6b';
      default: return '#fff';
    }
  };

  const downloadWorkersCSV = () => {
    const headers = ['ID / EMP NO', 'FIRST NAME', 'LAST NAME', 'DESIGNATION', 'TYPE', 'PAYMENT BASIS', 'DAILY RATE', 'TIN', 'SSS', 'PHILHEALTH', 'PAGIBIG'];
    
    const rows = workers.map(w => [
      w.workerId || 'N/A',
      w.firstName || '',
      w.lastName || '',
      w.designation || '',
      w.workerType || '',
      w.paymentBasis || '',
      w.dailyRate || 0,
      w.tinNumber || '',
      w.sssNumber || '',
      w.philHealthNumber || '',
      w.pagIbigNumber || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Workers_Database_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      <ApplicableRulesPanel moduleName="Payroll" />
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px', background: 'rgba(0,0,0,0.2)', padding: '5px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <button 
            onClick={() => setActiveTab('PERIODS')}
            style={{ 
              background: activeTab === 'PERIODS' ? 'var(--accent-color)' : 'transparent', 
              color: activeTab === 'PERIODS' ? '#000' : 'var(--text-secondary)', 
              border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer',
              fontWeight: activeTab === 'PERIODS' ? 'bold' : 'normal',
              transition: 'all 0.2s', whiteSpace: 'nowrap'
            }}
          >
            Payroll Periods
          </button>
          <button 
            onClick={() => setActiveTab('WORKERS')}
            style={{ 
              background: activeTab === 'WORKERS' ? 'var(--accent-color)' : 'transparent', 
              color: activeTab === 'WORKERS' ? '#000' : 'var(--text-secondary)', 
              border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer',
              fontWeight: activeTab === 'WORKERS' ? 'bold' : 'normal',
              transition: 'all 0.2s', whiteSpace: 'nowrap'
            }}
          >
            Workers Database
          </button>
        </div>
        
        <div style={{ marginLeft: 'auto' }}>
          {activeTab === 'PERIODS' && (
            <PermissionGuard permissions={permissions} moduleName="PAYROLL" action="canCreate">
              <button 
                onClick={() => setIsCreateOpen(true)}
                style={{ background: 'var(--accent-color)', color: '#000', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(0, 255, 163, 0.2)', transition: 'transform 0.2s' }} 
                onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'} 
                onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</span> Open New Period
              </button>
            </PermissionGuard>
          )}
          {activeTab === 'WORKERS' && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <PermissionGuard permissions={permissions} moduleName="WORKER_DATABASE" action="canExport">
                <button 
                  onClick={downloadWorkersCSV}
                  style={{ background: '#27ae60', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(39, 174, 96, 0.3)', transition: 'transform 0.2s' }} 
                  onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'} 
                  onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>⬇️</span> Export CSV
                </button>
              </PermissionGuard>
              <PermissionGuard permissions={permissions} moduleName="WORKER_DATABASE" action="canCreate">
                <button 
                  onClick={() => { setEditingWorker(null); setIsWorkerModalOpen(true); }}
                  style={{ background: '#3498db', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(52, 152, 219, 0.3)', transition: 'transform 0.2s' }} 
                  onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'} 
                  onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</span> Add New Worker
                </button>
              </PermissionGuard>
            </div>
          )}
        </div>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
        <button 
          onClick={() => router.push('/payroll/settings')}
          style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }} 
          onMouseOver={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'var(--text-primary)'; }} 
          onMouseOut={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--glass-border)'; }}
        >
          <span>⚙️</span> Configure Payroll Settings
        </button>
      </div>

      <div style={{ overflowX: 'auto', background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
        {activeTab === 'PERIODS' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(0,0,0,0.2)' }}>
              <th style={{ padding: '15px 20px' }}>Period</th>
              <th style={{ padding: '15px 20px' }}>Start Date</th>
              <th style={{ padding: '15px 20px' }}>Payroll Date</th>
              <th style={{ padding: '15px 20px', textAlign: 'center' }}>Total Records</th>
              <th style={{ padding: '15px 20px' }}>Status</th>
              <th style={{ padding: '15px 20px', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {periods.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No payroll periods found. Open a new period to get started.
                </td>
              </tr>
            ) : periods.map(period => (
              <tr 
                key={period.id} 
                style={{ borderBottom: '1px solid var(--glass-border)', cursor: 'pointer', transition: 'background 0.2s' }} 
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} 
                onMouseOut={e => e.currentTarget.style.background = 'transparent'} 
                onClick={() => router.push(`/payroll/${period.id}`)}
              >
                <td style={{ padding: '15px 20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px', borderRadius: '8px', fontSize: '1.2rem', lineHeight: 1 }}>
                    📅
                  </div>
                  <div>
                    {period.month}/{period.year} - {period.periodType === 'FIRST_HALF' ? '1st Half'
                      : period.periodType === 'SECOND_HALF' ? '2nd Half'
                      : period.periodType === 'FULL_MONTH' ? 'Full Month'
                      : /^WEEK_\d+$/.test(period.periodType || '') ? `Week ${period.periodType.replace('WEEK_', '')}`
                      : String(period.periodType || 'Custom').replace(/_/g, ' ')}
                  </div>
                </td>
                <td style={{ padding: '15px 20px' }}>{new Date(period.startDate).toLocaleDateString()}</td>
                <td style={{ padding: '15px 20px' }}>{new Date(period.payrollDate).toLocaleDateString()}</td>
                <td style={{ padding: '15px 20px', textAlign: 'center', fontWeight: 'bold' }}>
                  {period._count.payrolls} / {period._count.dtrs}
                </td>
                <td style={{ padding: '15px 20px' }}>
                  <span style={{ 
                    padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold',
                    background: getStatusColor(period.status),
                    color: getStatusTextColor(period.status),
                    border: `1px solid ${getStatusColor(period.status).replace('0.2', '0.4')}`
                  }}>
                    {period.status}
                  </span>
                </td>
                <td style={{ padding: '15px 20px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button 
                      onClick={(e) => { e.stopPropagation(); router.push(`/payroll/${period.id}`); }} 
                      style={{ background: 'transparent', border: '1px solid var(--accent-color)', color: 'var(--accent-color)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                      onMouseOver={e => { e.currentTarget.style.background = 'var(--accent-color)'; e.currentTarget.style.color = '#000'; }}
                      onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--accent-color)'; }}
                    >
                      Manage
                    </button>
                    {period.status === 'DRAFT' && (
                      <button 
                        onClick={(e) => handleDeletePeriod(e, period.id)} 
                        style={{ background: 'transparent', border: '1px solid #e74c3c', color: '#e74c3c', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                        onMouseOver={e => { e.currentTarget.style.background = '#e74c3c'; e.currentTarget.style.color = '#fff'; }}
                        onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#e74c3c'; }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(0,0,0,0.2)' }}>
                <th style={{ padding: '15px 20px' }}>ID / Emp No</th>
                <th style={{ padding: '15px 20px' }}>Name</th>
                <th style={{ padding: '15px 20px' }}>Designation</th>
                <th style={{ padding: '15px 20px' }}>Type</th>
                <th style={{ padding: '15px 20px' }}>Daily Rate</th>
                <th style={{ padding: '15px 20px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {workers?.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No workers found in the database. Add a new worker to get started.
                  </td>
                </tr>
              ) : workers?.map(worker => (
                <tr key={worker.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '15px 20px', fontWeight: 'bold' }}>{worker.workerId || 'N/A'}</td>
                  <td style={{ padding: '15px 20px' }}>{worker.lastName}, {worker.firstName} {worker.middleName || ''}</td>
                  <td style={{ padding: '15px 20px' }}>{worker.designation}</td>
                  <td style={{ padding: '15px 20px' }}>
                    <span style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', border: '1px solid var(--glass-border)' }}>
                      {worker.employmentType.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '15px 20px' }}>
                    {permissions?.IS_GUEST_USER ? '****' : `₱${worker.dailyRate?.toLocaleString() || 0}`}
                  </td>
                  <td style={{ padding: '15px 20px', textAlign: 'right' }}>
                    {!permissions?.IS_GUEST_USER && (
                      <button 
                        onClick={() => router.push(`/workers/${worker.id}/edit`)}
                        style={{ background: 'transparent', border: '1px solid #3498db', color: '#3498db', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {isCreateOpen && (
        <CreatePeriodModal 
          onClose={() => setIsCreateOpen(false)} 
          currentUserId={currentUserId}
          projects={projects}
        />
      )}
      
      {isWorkerModalOpen && (
        <WorkerFormModal 
          worker={editingWorker}
          onClose={() => { setIsWorkerModalOpen(false); setEditingWorker(null); }}
        />
      )}

      <AIPayrollAssistant />
    </div>
  );
}
