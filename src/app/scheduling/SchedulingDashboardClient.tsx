'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SchedulingDashboardClient({ projects }: { projects: any[] }) {
  const router = useRouter();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');

  // projectSchedule is a one-to-many relation (array), latest first.
  const latestSchedule = (p: any) => (Array.isArray(p.projectSchedule) ? p.projectSchedule[0] : p.projectSchedule) || null;
  const projectsWithoutSchedule = projects.filter(p => !latestSchedule(p));

  const handleCreateSchedule = () => {
    if (selectedProjectId) {
      router.push(`/projects/${selectedProjectId}/scheduling`);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ color: 'var(--accent-color)', margin: 0 }}>Project Scheduling Master Dashboard</h1>
        <button 
          onClick={() => setShowAddModal(true)}
          className="btn-primary" 
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <span>➕</span> Add Project Schedule
        </button>
      </div>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>
        Select a project below to manage its official schedule, WBS, Gantt Chart, and AI Intelligence.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {projects.map(project => (
          <Link key={project.id} href={`/projects/${project.id}/scheduling`} style={{ textDecoration: 'none' }}>
            <div className="glass-panel hover-effect" style={{ padding: '20px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
              <h3 style={{ margin: '0 0 10px 0', color: 'var(--text-primary)' }}>{project.name}</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Status:</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>{project.status}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Schedule Status:</span>
                <span style={{ 
                  fontSize: '0.85rem', 
                  fontWeight: 'bold',
                  color: latestSchedule(project) ? 'var(--accent-color)' : '#f59e0b'
                }}>
                  {latestSchedule(project)?.status || 'NO SCHEDULE'}
                </span>
              </div>
            </div>
          </Link>
        ))}
        {projects.length === 0 && (
          <div style={{ color: 'var(--text-secondary)' }}>No active projects found.</div>
        )}
      </div>

      {/* Add Project Schedule Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="glass-panel" style={{ padding: '30px', borderRadius: '12px', width: '100%', maxWidth: '500px' }}>
            <h2 style={{ marginTop: 0, color: 'var(--accent-color)' }}>Select Project</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Choose an active project that does not have a schedule yet.
            </p>
            
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-primary)' }}>Target Project</label>
              <select 
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="form-control"
                style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: '6px' }}
              >
                <option value="">-- Select a Project --</option>
                {projectsWithoutSchedule.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {projectsWithoutSchedule.length === 0 && (
                <p style={{ color: '#f59e0b', fontSize: '0.85rem', marginTop: '8px' }}>
                  All your active projects already have a schedule.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
              <button 
                className="btn-secondary"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn-primary"
                disabled={!selectedProjectId}
                onClick={handleCreateSchedule}
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
