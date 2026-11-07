'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { setActiveProjectCookie } from '@/app/actions/activeProject';

export default function ActiveProjectSelector({ 
  assignments, 
  activeProjectId 
}: { 
  assignments: { projectId: string; project: { name: string; contractAmount?: number; originalContractDuration?: number | null }; projectRole: string; accessLevel: string }[];
  activeProjectId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [contextError, setContextError] = useState('');
  const routeProjectId = /^\/projects\/([^/]+)(?:\/|$)/.exec(pathname ?? '')?.[1];
  const authorizedRouteProjectId = assignments.some(row => row.projectId === routeProjectId) ? routeProjectId : null;
  const displayedProjectId = authorizedRouteProjectId || activeProjectId;

  useEffect(() => {
    if (!authorizedRouteProjectId || authorizedRouteProjectId === activeProjectId) return;
    let active = true;
    setActiveProjectCookie(authorizedRouteProjectId).then(() => { if (active) router.refresh(); })
      .catch(() => { if (active) setContextError('The project context could not be updated. Select the project again.'); });
    return () => { active = false; };
  }, [authorizedRouteProjectId, activeProjectId, router]);

  const handleProjectChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProjectId = e.target.value;
    
    // We can show a warning here if there is unsaved work, but for now we proceed
    startTransition(async () => {
      try {
        setContextError('');
        await setActiveProjectCookie(newProjectId || null);
        if (authorizedRouteProjectId && newProjectId !== authorizedRouteProjectId) router.push(newProjectId ? `/projects/${encodeURIComponent(newProjectId)}` : '/projects');
        else router.refresh();
      } catch { setContextError('The project context could not be updated. Select the project again.'); }
    });
  };

  if (assignments.length === 0) {
    return (
      <div style={{ padding: '6px 12px', fontSize: '0.8rem', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
        No Project Assignments
      </div>
    );
  }

  const currentAssignment = assignments.find(a => a.projectId === displayedProjectId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginRight: '20px' }}>
      <label style={{ fontSize: '0.7rem', color: 'var(--accent-color)', fontWeight: 'bold', textTransform: 'uppercase' }}>
        Active Project Workspace
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <select
          value={displayedProjectId || ''}
          aria-label="Active Project Workspace"
          title={currentAssignment?.project.name}
          onChange={handleProjectChange}
          disabled={isPending}
          style={{
            padding: '6px 10px',
            borderRadius: '6px',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            color: 'var(--text-primary)',
            border: '1px solid var(--glass-border)',
            fontWeight: 'bold',
            outline: 'none',
            cursor: isPending ? 'wait' : 'pointer',
            opacity: isPending ? 0.5 : 1,
            width: '250px'
          }}
        >
          <option value="">-- Select Active Project --</option>
          {assignments.map(a => (
            <option key={a.projectId} value={a.projectId}>
              {a.project.name}
            </option>
          ))}
        </select>
        
        {currentAssignment && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Role: {currentAssignment.projectRole.replace(/_/g, ' ')}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Access: {currentAssignment.accessLevel.replace(/_/g, ' ').toUpperCase()}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, borderLeft: '1px solid var(--glass-border)', paddingLeft: '15px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>
                Cost: ₱{(currentAssignment.project.contractAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>
                {/* An unset duration is "not set", not a zero-day contract. */}
                Duration: {currentAssignment.project.originalContractDuration
                  ? `${currentAssignment.project.originalContractDuration} ${currentAssignment.project.originalContractDuration === 1 ? 'Day' : 'Days'}`
                  : 'Not set'}
              </span>
            </div>
          </div>
        )}
      </div>
      {contextError && <p role="alert" style={{ color: '#fca5a5', fontSize: '.8rem' }}>{contextError}</p>}
    </div>
  );
}
