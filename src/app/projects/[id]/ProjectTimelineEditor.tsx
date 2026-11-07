'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Edit2, X, AlertCircle } from 'lucide-react';
import { updateProjectDates } from '@/app/actions/project';

interface ProjectTimelineEditorProps {
  projectId: string;
  initialStartDate: string | null;
  initialDuration: number | null;
}

export default function ProjectTimelineEditor({ projectId, initialStartDate, initialDuration }: ProjectTimelineEditorProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [startDate, setStartDate] = useState(initialStartDate ? initialStartDate.split('T')[0] : '');
  const [duration, setDuration] = useState<number | ''>(initialDuration || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiMessage, setAiMessage] = useState('');

  const targetDate = React.useMemo(() => {
    if (!startDate || !duration) return null;
    const start = new Date(startDate);
    start.setDate(start.getDate() + Number(duration));
    return start.toLocaleDateString();
  }, [startDate, duration]);

  const handleSave = async () => {
    if (!startDate) {
      setError('Start date is required.');
      return;
    }
    if (!duration || Number(duration) <= 0) {
      setError('A valid duration (in days) is required.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await updateProjectDates(projectId, startDate, Number(duration));
      
      if (!res.success) {
        throw new Error(res.error || 'Failed to update dates');
      }

      if (res.hasSchedule) {
        setAiMessage('Updating dates... triggering AI schedule resimulation. Please wait.');
        // Trigger AI regeneration
        const aiRes = await fetch(`/api/projects/${projectId}/scheduling/simulate`, {
          method: 'POST',
        });
        
        const aiData = await aiRes.json();
        if (!aiRes.ok) {
          throw new Error(aiData.error || 'Failed to resimulate schedule');
        }
      }

      setIsOpen(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
      setAiMessage('');
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          background: 'rgba(167, 139, 250, 0.1)',
          border: '1px solid rgba(167, 139, 250, 0.3)',
          color: '#a855f7',
          padding: '6px 12px',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          fontSize: '0.85rem',
          fontWeight: 'bold',
          transition: 'all 0.2s',
          marginLeft: 'auto',
          whiteSpace: 'nowrap',
          flexShrink: 0
        }}
      >
        <Edit2 size={14} /> Edit Timeline
      </button>

      {isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '500px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden'
          }}>
            <div style={{ 
              padding: '20px', 
              borderBottom: '1px solid var(--glass-border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>Edit Project Timeline</h2>
              <button 
                onClick={() => !isLoading && setIsOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                disabled={isLoading}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              {error && (
                <div style={{
                  padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444',
                  borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: '0.9rem'
                }}>
                  <AlertCircle size={16} /> {error}
                </div>
              )}
              
              {aiMessage && (
                <div style={{
                  padding: '12px', background: 'rgba(167, 139, 250, 0.1)', color: '#a855f7',
                  borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px',
                  fontSize: '0.9rem', fontWeight: 'bold'
                }}>
                  <div className="spinner" style={{ width: '16px', height: '16px', border: '2px solid rgba(167, 139, 250, 0.3)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                  {aiMessage}
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isLoading}
                  style={{
                    width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--glass-border)', borderRadius: '6px', color: 'white'
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  Project Duration (Calendar Days)
                </label>
                <input
                  type="number"
                  min="1"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value === '' ? '' : Number(e.target.value))}
                  disabled={isLoading}
                  placeholder="e.g. 180"
                  style={{
                    width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--glass-border)', borderRadius: '6px', color: 'white'
                  }}
                />
              </div>

              <div style={{ 
                padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', 
                border: '1px dashed rgba(255,255,255,0.1)'
              }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Computed Target Completion</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: targetDate ? 'var(--accent-color)' : 'var(--text-secondary)' }}>
                  {targetDate || 'Awaiting inputs...'}
                </div>
              </div>

              <div style={{ marginTop: '20px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                <strong>Note:</strong> Modifying the project timeline will automatically trigger the AI Assistant to realign all scheduled activities within the new date boundaries.
              </div>
            </div>

            <div style={{ 
              padding: '16px 20px', 
              borderTop: '1px solid var(--glass-border)',
              display: 'flex', justifyContent: 'flex-end', gap: '12px',
              background: 'rgba(0,0,0,0.2)'
            }}>
              <button 
                onClick={() => setIsOpen(false)}
                disabled={isLoading}
                style={{
                  padding: '8px 16px', background: 'transparent', border: '1px solid var(--glass-border)',
                  color: 'white', borderRadius: '6px', cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.5 : 1
                }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                disabled={isLoading}
                style={{
                  padding: '8px 24px', background: 'var(--accent-color)', border: 'none',
                  color: 'black', fontWeight: 'bold', borderRadius: '6px', cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.5 : 1
                }}
              >
                {isLoading ? 'Saving...' : 'Save & Update AI Schedule'}
              </button>
            </div>
          </div>
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes spin { 100% { transform: rotate(360deg); } }
          `}} />
        </div>
      )}
    </>
  );
}
