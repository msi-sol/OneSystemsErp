'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { lockProjectBOQ, deleteProject } from '@/app/actions/mutations';

export default function BOQActions({ projectId, isLocked, hasBOQ, usesDraftApproval = false }: { projectId: string, isLocked: boolean, hasBOQ: boolean, usesDraftApproval?: boolean }) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  if (!hasBOQ) return null;

  const handleLock = async () => {
    if (confirm('Are you sure you want to LOCK this Bill of Quantities? This action cannot be undone, and you will not be able to delete the project after locking.')) {
      setIsLoading(true);
      await lockProjectBOQ(projectId);
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (confirm('DANGER: Are you sure you want to completely DELETE this Project and its Bill of Quantities? This will wipe all data. This cannot be undone.')) {
      setIsLoading(true);
      await deleteProject(projectId);
      router.push('/projects');
    }
  };

  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
      {isLocked ? (
        <span style={{ 
          backgroundColor: 'rgba(0, 255, 128, 0.1)', 
          color: '#00ff80', 
          padding: '6px 12px', 
          borderRadius: '4px',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          border: '1px solid rgba(0, 255, 128, 0.3)'
        }}>
          🔒 BOQ Locked
        </span>
      ) : (
        <>
          {!usesDraftApproval && <button
            onClick={handleLock} 
            disabled={isLoading}
            className="btn-primary" 
            style={{ backgroundColor: '#00cc66', borderColor: '#00cc66' }}
          >
            {isLoading ? 'Processing...' : 'Lock BOQ for Consolidation'}
          </button>}
          
          <button 
            onClick={handleDelete} 
            disabled={isLoading}
            className="btn-secondary" 
            style={{ color: '#ff4d4d', borderColor: '#ff4d4d' }}
          >
            Delete Project
          </button>
        </>
      )}
    </div>
  );
}
