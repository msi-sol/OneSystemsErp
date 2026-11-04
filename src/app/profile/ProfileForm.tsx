'use client';

import { useState } from 'react';
import Link from 'next/link';
import { updateProfile } from '@/app/actions/profile';

export default function ProfileForm({ initialName, initialEmail }: { initialName: string, initialEmail: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setMessage('');
    setError('');
    
    const res = await updateProfile(formData);
    
    if (res.success) {
      setMessage(res.message || 'Profile updated');
    } else {
      setError(res.error || 'Failed to update profile');
    }
    
    setLoading(false);
  }

  return (
    <form action={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h2 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', marginBottom: '5px' }}>Personal Information</h2>
      
      {message && <div style={{ padding: '10px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#10b981', borderRadius: '6px' }}>{message}</div>}
      {error && <div style={{ padding: '10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '6px' }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label htmlFor="name" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Full Name</label>
        <input 
          type="text" 
          id="name" 
          name="name" 
          defaultValue={initialName} 
          required 
          style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid var(--glass-border)',
            background: 'rgba(0, 0, 0, 0.2)',
            color: 'var(--text-primary)',
            fontSize: '1rem',
            outline: 'none'
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label htmlFor="email" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Email Address</label>
        <input 
          type="email" 
          id="email" 
          name="email" 
          defaultValue={initialEmail} 
          required 
          style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid var(--glass-border)',
            background: 'rgba(0, 0, 0, 0.2)',
            color: 'var(--text-primary)',
            fontSize: '1rem',
            outline: 'none'
          }}
        />
      </div>

      <div style={{ marginTop: '20px', borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
        <h2 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', marginBottom: '15px' }}>Change Password</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Passwords are changed on a separate page that asks for your current password.{' '}
          <Link href="/change-password" style={{ color: 'var(--accent-color)' }}>Change Password</Link>
        </p>
      </div>

      <div style={{ marginTop: '20px' }}>
        <button 
          type="submit" 
          disabled={loading}
          style={{
            padding: '12px 24px',
            backgroundColor: 'var(--accent-color)',
            color: '#000',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
            transition: 'opacity 0.2s'
          }}
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
