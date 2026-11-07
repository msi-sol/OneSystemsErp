'use client';

import { useState } from 'react';
import { login } from '@/app/actions/auth';

/** defaultEmail/defaultPassword come from page.tsx: always on the dev server, elsewhere only when explicitly enabled. */
export default function LoginForm({ defaultEmail = '', defaultPassword = '' }: { defaultEmail?: string; defaultPassword?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const formData = new FormData(e.currentTarget);
      const result = await login(formData);
      
      if (result?.error) {
        setError(result.error);
        setLoading(false);
      } else if (result?.redirect) {
        window.location.href = result.redirect;
      }
    } catch (err: any) {
      if (err.message === 'NEXT_REDIRECT') throw err;
      setError(err.message || 'An unexpected error occurred during authentication.');
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: '#1e293b', padding: '40px', borderRadius: '12px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{ color: '#f8fafc', margin: '0 0 10px 0', fontSize: '24px' }}>JEJORS CONSTRUCTION</h1>
          <p style={{ color: '#94a3b8', margin: 0, fontSize: '14px' }}>Project Management System</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {error && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '10px', borderRadius: '6px', fontSize: '14px', border: '1px solid rgba(239, 68, 68, 0.3)', textAlign: 'center' }}>
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" style={{ display: 'block', marginBottom: '8px', color: '#cbd5e1', fontSize: '14px' }}>Email Address</label>
            <input 
              id="email" 
              name="email" 
              type="email"
              required
              defaultValue={defaultEmail}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#f8fafc' }}
              placeholder="user@jejors.com"
            />
          </div>

          <div>
            <label htmlFor="password" style={{ display: 'block', marginBottom: '8px', color: '#cbd5e1', fontSize: '14px' }}>Password</label>
            <input 
              id="password" 
              name="password" 
              type="password"
              required
              defaultValue={defaultPassword}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: '#f8fafc' }}
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            style={{ 
              marginTop: '10px', width: '100%', padding: '12px', borderRadius: '8px', border: 'none', 
              backgroundColor: '#00ffa3', color: '#000', fontWeight: 'bold', fontSize: '16px', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
        
        <div style={{ textAlign: 'center', marginTop: '25px', color: '#64748b', fontSize: '12px' }}>
          Secure Portal &copy; {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}
