'use client';

import { useState, useTransition } from 'react';
import { createUser } from '@/app/actions/user';
import styles from './page.module.css';

export default function AddUserModal({ onClose, roles = [] }: { onClose: () => void, roles?: string[] }) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('PROJECT_ENGINEER');
  const [customRole, setCustomRole] = useState('');
  const [error, setError] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    startTransition(async () => {
      try {
        const finalRole = role === 'OTHER' ? customRole.trim().toUpperCase().replace(/ /g, '_') : role;
        if (role === 'OTHER' && !finalRole) {
          setError('Please specify a custom role.');
          return;
        }
        const res = await createUser({ name, email, role: finalRole });
        if (res && !res.success) {
          setError(res.error || 'Failed to create user.');
          return;
        }
        setTemporaryPassword(res.temporaryPassword || '');
      } catch (err: any) {
        setError(err.message || 'An error occurred.');
      }
    });
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'var(--bg-secondary)', padding: '30px', borderRadius: '16px',
        border: '1px solid var(--glass-border)', width: '100%', maxWidth: '400px'
      }}>
        {temporaryPassword ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>User Created</h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              Give this temporary password to {email} directly. It is shown only once, and they must change it at first sign-in.
            </p>
            <code style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--accent-glow)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', wordBreak: 'break-all', userSelect: 'all' }}>
              {temporaryPassword}
            </code>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} className={styles.primaryButton}>Done</button>
            </div>
          </div>
        ) : (<>
        <h2 style={{ margin: '0 0 20px 0', color: 'var(--text-primary)' }}>Add New User</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Full Name</label>
            <input 
              type="text" required value={name} onChange={e => setName(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Email</label>
            <input 
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>System Role</label>
            <select 
              value={role} 
              onChange={e => setRole(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}
            >
              {roles.map((r, i) => (
                <option key={i} value={r}>{r}</option>
              ))}
              <option value="OTHER" style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>+ Add New Role...</option>
            </select>
            {role === 'OTHER' && (
              <input 
                type="text" 
                required 
                placeholder="Type new role (e.g. SAFETY_OFFICER)" 
                value={customRole} 
                onChange={e => setCustomRole(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--accent-glow)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', marginTop: '8px' }}
              />
            )}
          </div>
          
          {error && <div style={{ color: '#ef4444', fontSize: '0.9rem' }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button type="button" onClick={onClose} disabled={isPending}
              style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={isPending} className={styles.primaryButton} style={{ opacity: isPending ? 0.7 : 1 }}>
              {isPending ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
        </>)}
      </div>
    </div>
  );
}
