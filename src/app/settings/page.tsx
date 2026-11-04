'use client';

import styles from '../projects/page.module.css';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { resetTransactionData, getCurrentUserRole } from '@/app/actions/systemResetActions';

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUserRole().then(role => setUserRole(role));
  }, []);

  const handleSave = () => {
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      toast.success('System settings saved successfully.');
      setLoading(false);
    }, 600);
  };

  const handleReset = async () => {
    if (resetConfirmation !== 'RESET TRANSACTION DATA ONLY') {
      toast.error('Invalid confirmation text.');
      return;
    }
    
    setResetLoading(true);
    const result = await resetTransactionData(resetConfirmation);
    
    if (result.success) {
      toast.success('Transactional data has been successfully cleared. Users, roles, permissions, database structure, and system settings were preserved.', { duration: 10000 });
      setIsResetModalOpen(false);
      setResetConfirmation('');
      // Force refresh to clear any cached layout data
      setTimeout(() => window.location.reload(), 2000);
    } else {
      toast.error(result.error || 'Failed to reset transaction data.');
    }
    setResetLoading(false);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>System Settings</h1>
          <p>Configure application parameters and global variables.</p>
        </div>
        <button 
          className={styles.primaryButton} 
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </header>

      <div className={styles.tableContainer} style={{ padding: '2rem', color: 'var(--text-secondary)' }}>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: '1.5rem' }}>General Configuration</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '600px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Company Name</label>
            <input type="text" defaultValue="JEJORS CONSTRUCTION CORPORATION" style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }} />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>Default Currency</label>
            <select style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
              <option value="PHP">PHP (₱)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>System Theme</label>
            <select style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
              <option value="dark">High-Tech Dark</option>
              <option value="light">Corporate Light (Coming Soon)</option>
            </select>
          </div>
        </div>

        {/* STANDARD OPERATIONS - MASTER RESET */}
        <div style={{ padding: '1rem', color: 'gray', fontSize: '0.8rem' }}>
          Diagnostic: Detected Role is [{userRole}]
        </div>
        {userRole === 'SUPER_ADMIN' && (
        <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid var(--glass-border)', maxWidth: '700px' }}>
          <h2 style={{ color: '#ef4444', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>⚠️</span> Standard Operations — Master Reset
          </h2>
          <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '1.5rem', borderRadius: '8px' }}>
            <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.75rem' }}>🔄 Master Data Reset</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: '1.6' }}>
              This standard operation <strong>completely erases ALL operational data</strong> across every module so the system starts from absolute zero. Use this when you need a clean slate for a new project cycle or fresh simulation.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              {/* WILL BE CLEARED */}
              <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '6px', padding: '1rem' }}>
                <h4 style={{ color: '#ef4444', margin: '0 0 0.5rem 0', fontSize: '0.85rem', letterSpacing: '0.5px' }}>🗑️ WILL BE CLEARED</h4>
                <ul style={{ margin: 0, padding: '0 0 0 1.2rem', color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.8' }}>
                  <li>All Projects & BOQ Data</li>
                  <li>All Procurement (MRFs, POs, Canvassing)</li>
                  <li>All Inventory & Deliveries</li>
                  <li>All Material Issuances & Returns</li>
                  <li>All Expenses & Petty Cash</li>
                  <li>All Subcontracts & Job Orders</li>
                  <li>All Payroll, DTRs & Workers (except 5 reference samples)</li>
                  <li>All Accomplishments & Billings</li>
                  <li>All Variation Orders</li>
                  <li>All Documents & Evidence Files</li>
                  <li>All Suppliers & Subcontractors (except 5 reference samples)</li>
                  <li>All AI Logs & Audit Trails</li>
                  <li>All Uploaded Files</li>
                </ul>
              </div>

              {/* WILL BE PRESERVED */}
              <div style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.15)', borderRadius: '6px', padding: '1rem' }}>
                <h4 style={{ color: '#22c55e', margin: '0 0 0.5rem 0', fontSize: '0.85rem', letterSpacing: '0.5px' }}>🛡️ WILL BE PRESERVED</h4>
                <ul style={{ margin: 0, padding: '0 0 0 1.2rem', color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: '1.8' }}>
                  <li>System Users & Accounts (plus 5 key role templates)</li>
                  <li>System Roles (all 31 roles)</li>
                  <li>Access Rights Matrix (359 rules)</li>
                  <li>Modules & Workflow Templates</li>
                  <li>Knowledge Center & AI Rules</li>
                  <li>Document Templates</li>
                  <li>Government Tax Tables (SSS, BIR)</li>
                  <li>Bank Accounts & Payment Providers</li>
                  <li>5 Reference Templates (Workers, Suppliers, Subcon)</li>
                </ul>
              </div>
            </div>

            <p style={{ color: '#f97316', fontSize: '0.85rem', fontWeight: '600', marginBottom: '1rem', background: 'rgba(249, 115, 22, 0.1)', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid rgba(249, 115, 22, 0.2)' }}>
              ⚡ A database backup is created before the reset. If the backup fails, nothing is deleted.
            </p>
            
            <button 
              onClick={() => setIsResetModalOpen(true)}
              style={{
                background: '#ef4444',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '6px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background 0.2s',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.95rem'
              }}
            >
              🔄 Execute Master Reset
            </button>
          </div>
        </div>
        )}
      </div>

      {/* RESET CONFIRMATION MODAL */}
      {isResetModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: 'var(--bg-primary)',
            border: '2px solid #ef4444',
            padding: '2rem',
            borderRadius: '12px',
            maxWidth: '520px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(239, 68, 68, 0.3)'
          }}>
            <h2 style={{ color: '#ef4444', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ⚠️ Confirm Master Reset
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: '1.6', fontSize: '0.95rem' }}>
              This will <strong style={{ color: '#ef4444' }}>permanently erase ALL data</strong> across every module — projects, procurement, payroll, subcontracting, inventory, accomplishments, and more. 
            </p>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: '1.6', fontSize: '0.95rem' }}>
              Only <strong style={{ color: '#22c55e' }}>System Users, System Roles, and the Access Rights Matrix</strong> will be preserved. Everything else goes to zero.
            </p>
            <p style={{ color: 'var(--text-primary)', marginBottom: '1rem', fontWeight: '600' }}>
              To confirm, type exactly: <span style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontFamily: 'monospace' }}>RESET TRANSACTION DATA ONLY</span>
            </p>
            
            <input 
              type="text" 
              value={resetConfirmation}
              onChange={(e) => setResetConfirmation(e.target.value)}
              placeholder="Type confirmation here..."
              style={{ 
                width: '100%', 
                padding: '0.75rem', 
                borderRadius: '6px', 
                border: resetConfirmation === 'RESET TRANSACTION DATA ONLY' ? '2px solid #ef4444' : '1px solid var(--glass-border)', 
                background: 'var(--bg-secondary)', 
                color: 'var(--text-primary)',
                marginBottom: '1.5rem',
                fontSize: '1rem',
                fontFamily: 'monospace',
                letterSpacing: '0.5px',
                boxSizing: 'border-box'
              }} 
            />

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => {
                  setIsResetModalOpen(false);
                  setResetConfirmation('');
                }}
                disabled={resetLoading}
                style={{
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--glass-border)',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '6px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button 
                onClick={handleReset}
                disabled={resetLoading || resetConfirmation !== 'RESET TRANSACTION DATA ONLY'}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '6px',
                  fontWeight: '600',
                  cursor: (resetLoading || resetConfirmation !== 'RESET TRANSACTION DATA ONLY') ? 'not-allowed' : 'pointer',
                  opacity: (resetLoading || resetConfirmation !== 'RESET TRANSACTION DATA ONLY') ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                {resetLoading ? '⏳ Clearing All Data...' : '🔄 Confirm Master Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
