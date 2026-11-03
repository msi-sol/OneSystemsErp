'use client';

import React, { useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import ScheduleSetupWizard from './wizard/ScheduleSetupWizard';
import WBSActivityList from './wbs/WBSActivityList';
import GanttChartView from './gantt/GanttChartView';
import SchedulingDashboard from './dashboard/SchedulingDashboard';
import DelayAndRecoveryTab from './delays/DelayAndRecoveryTab';
import PERTNetworkDiagram from './pert/PERTNetworkDiagram';
import AIScheduleIntelligence from './ai/AIScheduleIntelligence';
import PhaseSummaryView from './PhaseSummaryView';
import ScheduleReviewPanel from './review/ScheduleReviewPanel';
import WorkPackageWorkspace from './WorkPackageWorkspace';
import { buildWorkPackageSummary, type WorkPackageSummaryResult } from '@/lib/scheduling/work-package-summary';

export default function SchedulingHubClient({ 
  project, 
  initialSchedule, 
  awardedBoq,
  actor,
  workPackageSummary,
  canEditDraft = false,
}: { 
  project: any; 
  initialSchedule: any; 
  awardedBoq: any;
  actor?: any;
  workPackageSummary?: WorkPackageSummaryResult;
  canEditDraft?: boolean;
}) {
  const router = useRouter();
  const [schedule, setSchedule] = useState(initialSchedule);
  const [activeTab, setActiveTab] = useState('WORK_PACKAGES');
  const [isDeleting, startTransition] = useTransition();

  const handleDeleteSchedule = () => {
    if (confirm('Are you sure you want to delete this schedule? This will permanently remove all WBS nodes, activities, dependencies, and BOQ allocations.')) {
      startTransition(async () => {
        try {
          const res = await fetch(`/api/projects/${project.id}/scheduling/delete`, { method: 'DELETE' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to delete schedule');
          setSchedule(null);
          router.refresh();
        } catch (err: any) {
          alert(err.message || 'Error deleting schedule');
        }
      });
    }
  };

  const handleRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  React.useEffect(() => {
    setSchedule(initialSchedule);
  }, [initialSchedule]);

  const hasValidSchedule = 
    schedule !== null &&
    schedule !== undefined &&
    schedule.id !== null &&
    schedule.id !== undefined &&
    schedule.name?.trim().length > 0 &&
    schedule.status !== null &&
    schedule.status !== undefined &&
    (schedule.phases?.length || schedule.wbsNodes?.length || 0) > 0 &&
    (schedule.activities?.length || 0) > 0 &&
    Number(schedule.awardedContractAmount || 0) > 0 &&
    Number(schedule.scheduledAmount || 0) > 0;

  if (!schedule) {
    return (
      <ScheduleSetupWizard 
        project={project} 
        awardedBoq={awardedBoq} 
        onScheduleCreated={(newSchedule: any) => {
          setSchedule(newSchedule);
          router.refresh();
        }} 
      />
    );
  }

  if (!hasValidSchedule && activeTab !== 'WORK_PACKAGES') {
    return (
      <div style={{ maxWidth: '800px', margin: '40px auto', padding: '30px', textAlign: 'center' }} className="glass-panel">
        <h2 style={{ color: 'var(--accent-color)' }}>NO VALID PROJECT SCHEDULE</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
          No complete project schedule is currently available for this project.
        </p>
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '15px', borderRadius: '6px', textAlign: 'left', marginBottom: '20px' }}>
          <h4 style={{ color: '#ef4444', margin: '0 0 10px 0' }}>Generation Failed or Incomplete</h4>
          <p style={{ margin: '0 0 5px 0' }}>The schedule data structure is incomplete or generation failed.</p>
        </div>
        <button 
          onClick={() => {
            setSchedule(null);
            router.refresh();
          }}
          className="btn btn-primary"
          style={{ padding: '10px 20px', cursor: 'pointer' }}
        >
          Retry Generation
        </button>
      </div>
    );
  }

  const tabs = [
    { key: 'WORK_PACKAGES', label: 'Work Packages', icon: '' },
    { key: 'PHASE_SUMMARY', label: '📑 Phase Summary', icon: '' },
    { key: 'GANTT', label: '📊 Gantt Chart', icon: '' },
    { key: 'WBS', label: '📋 WBS & Activities', icon: '' },
    { key: 'DASHBOARD', label: '📈 Dashboard', icon: '' },
    { key: 'DELAYS', label: '⚠️ Delays & Recovery', icon: '' },
    { key: 'PERT', label: '🔀 PERT/CPM', icon: '' },
    { key: 'AI', label: '🤖 AI Intelligence', icon: '' },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'WORK_PACKAGES':
        return <WorkPackageWorkspace
          projectId={project.id}
          summary={workPackageSummary ?? buildWorkPackageSummary(schedule, awardedBoq ?? [])}
          workflowStatus={schedule.workflowStatus || schedule.status}
          baselineCode={schedule.baselineCode}
          boqLocked={Boolean(project.boqLocked)}
          onPlan={() => setActiveTab('WBS')}
          canEditDraft={canEditDraft}
          rowVersion={schedule.rowVersion}
          onRefresh={handleRefresh}
        />;
      case 'PHASE_SUMMARY':
        return <PhaseSummaryView schedule={schedule} />;
      case 'GANTT':
        return (
          <GanttChartView
            projectId={project.id}
            activities={schedule.activities || []}
            dependencies={schedule.dependencies || []}
            projectStartDate={schedule.currentStartDate || schedule.baselineStartDate || project.startDate || new Date().toISOString()}
            projectFinishDate={schedule.currentFinishDate || null}
            scheduleStatus={schedule.status}
            rowVersion={schedule.rowVersion}
            onRefresh={handleRefresh}
          />
        );
      case 'WBS':
        return (
          <WBSActivityList
            projectId={project.id}
            schedule={schedule}
            onRefresh={handleRefresh}
            canEditDraft={canEditDraft}
          />
        );
      case 'DASHBOARD':
        return <SchedulingDashboard projectId={project.id} />;
      case 'DELAYS':
        return <DelayAndRecoveryTab projectId={project.id} activities={schedule.activities || []} />;
      case 'PERT':
        return <PERTNetworkDiagram schedule={schedule} />;
      case 'AI':
        return <AIScheduleIntelligence projectId={project.id} />;
      default:
        return null;
    }
  };

  // Summary stats
  const totalActivities = schedule.activities?.length || 0;
  const criticalCount = schedule.activities?.filter((a: any) => a.criticalPath)?.length || 0;
  const completedCount = schedule.activities?.filter((a: any) => a.status === 'COMPLETED')?.length || 0;
  const avgProgress = totalActivities > 0 
    ? Math.round(schedule.activities.reduce((sum: number, a: any) => sum + (a.actualProgressPercent || 0), 0) / totalActivities) 
    : 0;
    
  let validationMetrics = null;
  try {
    if (schedule.validationMetrics) {
      validationMetrics = typeof schedule.validationMetrics === 'string' ? JSON.parse(schedule.validationMetrics) : schedule.validationMetrics;
    }
  } catch (e) {
    console.warn("Failed to parse validationMetrics");
  }

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ color: 'var(--accent-color)', margin: '0 0 4px 0', fontSize: '1.5rem' }}>📅 Project Scheduling: {project.name}</h1>
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Schedule: <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{schedule.name}</span></span>
            <span style={{ color: 'var(--text-secondary)' }}>Status: <span style={{ 
              color: schedule.workflowStatus === 'ACTIVE_BASELINE' ? '#10b981' : schedule.workflowStatus === 'DRAFT' ? '#f59e0b' : 'var(--accent-color)', 
              fontWeight: 'bold' 
            }}>{schedule.workflowStatus || schedule.status}</span></span>
            
            {schedule.workflowStatus === 'ACTIVE_BASELINE' && (
              <span style={{ 
                color: '#10b981', 
                backgroundColor: 'rgba(16, 185, 129, 0.1)', 
                padding: '2px 8px', 
                borderRadius: '12px', 
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                🔒 Authoritative Active Baseline | Row Version {schedule.rowVersion}
              </span>
            )}
            
            {schedule.workflowStatus !== 'ACTIVE_BASELINE' && (
              <button
                onClick={handleDeleteSchedule}
                disabled={isDeleting}
                  style={{
                    background: 'transparent',
                    border: '1px solid #ef4444',
                    color: '#ef4444',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    cursor: isDeleting ? 'not-allowed' : 'pointer',
                    opacity: isDeleting ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                {isDeleting ? '⏳ Deleting...' : '🗑️ Delete Schedule'}
              </button>
            )}
          </div>
          
          {validationMetrics && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
               {Object.entries(validationMetrics).map(([key, val]) => (
                 <span key={key} style={{ 
                   fontSize: '0.7rem', padding: '3px 6px', borderRadius: '4px',
                   backgroundColor: val === 'INVALID' || val === 'INFEASIBLE' || val === 'MISSING_TESTING' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                   color: val === 'INVALID' || val === 'INFEASIBLE' || val === 'MISSING_TESTING' ? '#ef4444' : '#10b981',
                   border: `1px solid ${val === 'INVALID' || val === 'INFEASIBLE' || val === 'MISSING_TESTING' ? '#ef4444' : '#10b981'}`
                 }}>
                   {key}: <strong>{String(val)}</strong>
                 </span>
               ))}
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div style={{ display: 'flex', gap: '12px' }}>
          {[
            { label: 'Activities', value: totalActivities, color: 'var(--accent-color)' },
            { label: 'Critical', value: criticalCount, color: '#ef4444' },
            { label: 'Done', value: completedCount, color: '#10b981' },
            { label: 'Avg Progress', value: `${avgProgress}%`, color: '#3b82f6' },
          ].map(stat => (
            <div key={stat.label} style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid var(--glass-border)',
              backgroundColor: 'rgba(0,0,0,0.2)',
              textAlign: 'center',
              minWidth: '70px'
            }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Financial Reconciliation Banner */}
      <div style={{
        padding: '12px 20px',
        borderRadius: '8px',
        marginBottom: '15px',
        border: `1px solid ${!hasValidSchedule ? '#f59e0b' : Number(schedule.differenceAmount || 0) === 0 ? '#10b981' : '#ef4444'}`,
        backgroundColor: !hasValidSchedule ? 'rgba(245, 158, 11, 0.1)' : Number(schedule.differenceAmount || 0) === 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.5rem' }}>{!hasValidSchedule ? '⚠️' : Number(schedule.differenceAmount || 0) === 0 ? '✅' : '❌'}</span>
          <div>
            <div style={{ fontWeight: 'bold', color: !hasValidSchedule ? '#f59e0b' : Number(schedule.differenceAmount || 0) === 0 ? '#10b981' : '#ef4444' }}>
              {!hasValidSchedule ? 'INCOMPLETE SCHEDULE (NOT CALCULATED)' : Number(schedule.differenceAmount || 0) === 0 ? 'Financially Reconciled' : 'Financial Mismatch Detected'}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Awarded Contract: ₱{Number(schedule.awardedContractAmount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})} | Scheduled Amount: ₱{Number(schedule.scheduledAmount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
            </div>
          </div>
        </div>
        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: !hasValidSchedule ? '#f59e0b' : Number(schedule.differenceAmount || 0) === 0 ? '#10b981' : '#ef4444' }}>
          Diff: ₱{Number(schedule.differenceAmount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
        </div>
      </div>

      {/* Schedule Review Panel */}
      <div id="schedule-review" tabIndex={-1}>
        <ScheduleReviewPanel schedule={schedule} projectId={project.id} actor={actor} boqLocked={Boolean(project.boqLocked)} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '15px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px', overflowX: 'auto' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px',
              backgroundColor: activeTab === tab.key ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
              color: activeTab === tab.key ? 'var(--accent-color)' : 'var(--text-secondary)',
              border: activeTab === tab.key ? '1px solid rgba(0, 240, 255, 0.3)' : '1px solid transparent',
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              fontWeight: activeTab === tab.key ? 'bold' : 'normal',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              fontSize: '0.85rem'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="glass-panel" style={{ borderRadius: '0 8px 8px 8px', minHeight: '500px' }}>
        {renderTabContent()}
      </div>
    </div>
  );
}
