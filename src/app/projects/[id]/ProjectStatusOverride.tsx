'use client';

import React, { useState } from 'react';
import { Edit2, Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ProjectStatusOverride({ projectId, currentStatus }: { projectId: string, currentStatus: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'The project status could not be changed.');
      }
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      // Shown beside the control; alert() pop-ups were easy to miss.
      setError(error instanceof Error ? error.message : 'The project status could not be changed.');
    } finally {
      setLoading(false);
    }
  };

  const statusColors: Record<string, string> = {
    'PLANNING': '#64748b',
    'ACTIVE': '#10b981',
    'ON_HOLD': '#f59e0b',
    'COMPLETED': '#3b82f6',
    'CANCELLED': '#ef4444'
  };

  if (isEditing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
        Status: 
        <select 
          value={status} 
          onChange={(e) => setStatus(e.target.value)}
          disabled={loading}
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid var(--glass-border)',
            background: 'var(--glass-panel)',
            color: 'var(--text-primary)',
            fontSize: '0.85rem'
          }}
        >
          <option value="PLANNING">PLANNING</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="ON_HOLD">ON_HOLD</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>
        <button onClick={handleSave} disabled={loading} style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', padding: '4px' }}>
          <Check size={16} />
        </button>
        <button onClick={() => { setIsEditing(false); setStatus(currentStatus); }} disabled={loading} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}>
          <X size={16} />
        </button>
        {error && <span role="alert" style={{ color: '#fca5a5', fontSize: '0.8rem' }}>{error}</span>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
      Status: 
      <span style={{ 
        fontWeight: 'bold', 
        color: statusColors[currentStatus] || '#fff',
        background: `${statusColors[currentStatus] || '#fff'}22`,
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '0.85rem'
      }}>
        {currentStatus}
      </span>
      <button 
        onClick={() => setIsEditing(true)}
        title="Manually override project status"
        style={{ 
          background: 'none', 
          border: 'none', 
          color: 'var(--text-secondary)', 
          cursor: 'pointer', 
          padding: '4px',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <Edit2 size={14} />
      </button>
    </div>
  );
}
