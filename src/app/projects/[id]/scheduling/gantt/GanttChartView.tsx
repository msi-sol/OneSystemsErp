'use client';

import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GanttActivity {
  id: string;
  activityCode: string | null;
  name: string;
  plannedStartDate: string | null;
  plannedFinishDate: string | null;
  plannedDuration: number;
  actualProgressPercent: number;
  status: string;
  criticalPath: boolean;
  totalFloat: number;
  wbs?: { code: string; name: string; orderIndex?: number } | null;
  predecessors?: any[];
  successors?: any[];
}

interface GanttDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: string;
  lagDays: number;
}

type ViewMode = 'DAY' | 'WEEK' | 'MONTH';

interface GanttChartViewProps {
  projectId: string;
  activities: GanttActivity[];
  dependencies: GanttDependency[];
  projectStartDate: string;
  projectFinishDate: string | null;
  scheduleStatus: string;
  rowVersion: number;
  onRefresh: () => void;
}

// ─── Utility Functions ────────────────────────────────────────────────────────

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function GanttChartView({
  projectId,
  activities,
  dependencies,
  projectStartDate,
  projectFinishDate,
  scheduleStatus,
  rowVersion,
  onRefresh
}: GanttChartViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('WEEK');
  const [isRunningCPM, setIsRunningCPM] = useState(false);
  const [isLockingBaseline, setIsLockingBaseline] = useState(false);
  const [dragActivity, setDragActivity] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragOriginalStart, setDragOriginalStart] = useState<Date | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // ── Compute timeline range ──
  const { timelineStart, timelineEnd, totalDays, columnWidth } = useMemo(() => {
    const pStart = parseDate(projectStartDate) || new Date();
    let minDate = new Date(pStart);
    let maxDate = parseDate(projectFinishDate) || addDays(pStart, 180);

    for (const act of activities) {
      const s = parseDate(act.plannedStartDate);
      const f = parseDate(act.plannedFinishDate);
      if (s && s < minDate) minDate = new Date(s);
      if (f && f > maxDate) maxDate = new Date(f);
    }

    // Add buffer
    minDate = addDays(minDate, -7);
    maxDate = addDays(maxDate, 14);

    const totalDays = Math.max(daysBetween(minDate, maxDate), 30);
    const colWidth = viewMode === 'DAY' ? 40 : viewMode === 'WEEK' ? 20 : 8;

    return { timelineStart: minDate, timelineEnd: maxDate, totalDays, columnWidth: colWidth };
  }, [activities, projectStartDate, projectFinishDate, viewMode]);

  // ── Row height and header ──
  const rowHeight = 36;
  const headerHeight = 50;
  const labelWidth = 300;

  // ── Get position for a date on the timeline ──
  const getXForDate = useCallback((date: Date): number => {
    const days = daysBetween(timelineStart, date);
    return days * columnWidth;
  }, [timelineStart, columnWidth]);

  // ── Today line ──
  const todayX = getXForDate(new Date());

  // ── Generate header labels ──
  const headerLabels = useMemo(() => {
    const labels: { text: string; x: number; width: number }[] = [];
    const current = new Date(timelineStart);

    if (viewMode === 'DAY') {
      while (current <= timelineEnd) {
        labels.push({
          text: formatDate(current),
          x: getXForDate(current),
          width: columnWidth
        });
        current.setDate(current.getDate() + 1);
      }
    } else if (viewMode === 'WEEK') {
      // Find first Monday
      while (current.getDay() !== 1) current.setDate(current.getDate() + 1);
      while (current <= timelineEnd) {
        labels.push({
          text: formatDate(current),
          x: getXForDate(current),
          width: columnWidth * 7
        });
        current.setDate(current.getDate() + 7);
      }
    } else {
      // Month view
      current.setDate(1);
      while (current <= timelineEnd) {
        const monthName = current.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
        labels.push({
          text: monthName,
          x: getXForDate(current),
          width: columnWidth * daysInMonth
        });
        current.setMonth(current.getMonth() + 1);
      }
    }

    return labels;
  }, [timelineStart, timelineEnd, viewMode, columnWidth, getXForDate]);

  // ── Run CPM ──
  const runCPM = async () => {
    setIsRunningCPM(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/scheduling/cpm`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotification(`CPM Complete: ${data.criticalPathCount} critical activities, ${data.projectDuration} working day project duration.`);
      onRefresh();
    } catch (err: any) {
      setNotification(`CPM Error: ${err.message}`);
    } finally {
      setIsRunningCPM(false);
    }
  };

  // ── Lock Baseline ──
  const lockBaseline = async () => {
    if (!confirm('Lock the current schedule as the official Baseline? This action captures the current planned dates.')) return;
    setIsLockingBaseline(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/scheduling/baseline`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotification('Baseline locked successfully!');
      onRefresh();
    } catch (err: any) {
      setNotification(`Baseline Error: ${err.message}`);
    } finally {
      setIsLockingBaseline(false);
    }
  };

  // ── Drag Handlers for bar repositioning ──
  const handleBarMouseDown = (e: React.MouseEvent, actId: string, startDate: Date) => {
    e.preventDefault();
    setDragActivity(actId);
    setDragStartX(e.clientX);
    setDragOriginalStart(startDate);
  };

  useEffect(() => {
    if (!dragActivity) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Visual feedback during drag (handled by CSS transform)
    };

    const handleMouseUp = async (e: MouseEvent) => {
      if (!dragActivity || !dragOriginalStart) return;

      const dx = e.clientX - dragStartX;
      const daysMoved = Math.round(dx / columnWidth);

      if (daysMoved !== 0) {
        const act = activities.find(a => a.id === dragActivity);
        if (act) {
          const newStart = addDays(dragOriginalStart, daysMoved);
          const origFinish = parseDate(act.plannedFinishDate);
          const newFinish = origFinish ? addDays(origFinish, daysMoved) : addDays(newStart, act.plannedDuration);

          try {
            const response = await fetch(`/api/projects/${projectId}/scheduling/activities/${dragActivity}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                expectedRowVersion: rowVersion,
                plannedStartDate: formatDateISO(newStart),
                plannedFinishDate: formatDateISO(newFinish)
              })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Could not save activity dates.');
            onRefresh();
          } catch (err) {
            setNotification(err instanceof Error ? err.message : 'Could not save activity dates.');
          }
        }
      }

      setDragActivity(null);
      setDragStartX(0);
      setDragOriginalStart(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragActivity, dragStartX, dragOriginalStart, columnWidth, activities, projectId, rowVersion, onRefresh]);

  // ── Auto-dismiss notification ──
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const displayRows = useMemo(() => {
    const grouped = activities.reduce((acc, act) => {
      const groupName = act.wbs?.name || 'Unassigned';
      if (!acc[groupName]) acc[groupName] = [];
      acc[groupName].push(act);
      return acc;
    }, {} as Record<string, GanttActivity[]>);

    const wbsOrderMap: Record<string, number> = {};
    const wbsCodeMap: Record<string, string> = {};
    activities.forEach(act => {
      const name = act.wbs?.name || 'Unassigned';
      if (!(name in wbsOrderMap)) {
        wbsOrderMap[name] = act.wbs?.orderIndex ?? 999;
        wbsCodeMap[name] = act.wbs?.code || 'N/A';
      }
    });

    const sortedGroups = Object.keys(grouped).sort((a, b) => {
      const orderDiff = (wbsOrderMap[a] || 999) - (wbsOrderMap[b] || 999);
      if (orderDiff !== 0) return orderDiff;
      return a.localeCompare(b);
    });

    const rows: any[] = [];
    for (const g of sortedGroups) {
      rows.push({ isHeader: true, name: `[${wbsCodeMap[g]}] ${g}`, id: `header-${g}` });
      
      const groupActivities = [...grouped[g]].sort((a, b) => {
        const startA = a.plannedStartDate ? new Date(a.plannedStartDate).getTime() : 0;
        const startB = b.plannedStartDate ? new Date(b.plannedStartDate).getTime() : 0;
        if (startA !== startB) return startA - startB;
        return (a.name || '').localeCompare(b.name || '');
      });

      for (const a of groupActivities) {
        rows.push({ isHeader: false, act: a, id: a.id });
      }
    }
    return rows;
  }, [activities]);

  const timelineWidth = totalDays * columnWidth;
  const chartHeight = displayRows.length * rowHeight + headerHeight + 20;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '20px' }}>
      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 'bold' }}>VIEW:</span>
          {(['DAY', 'WEEK', 'MONTH'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '6px 14px',
                borderRadius: '4px',
                border: viewMode === mode ? '1px solid var(--accent-color)' : '1px solid var(--glass-border)',
                backgroundColor: viewMode === mode ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
                color: viewMode === mode ? 'var(--accent-color)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                transition: 'all 0.2s'
              }}
            >
              {mode}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {scheduleStatus !== 'ACTIVE_BASELINE' && (
            <button
              onClick={runCPM}
              disabled={isRunningCPM}
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                border: '1px solid rgba(16, 185, 129, 0.5)',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                cursor: isRunningCPM ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '0.85rem',
                transition: 'all 0.2s'
              }}
            >
              {isRunningCPM ? '⏳ Computing...' : '🧮 Run CPM'}
            </button>
          )}
          
          <button
            onClick={lockBaseline}
            disabled={isLockingBaseline || scheduleStatus === 'BASELINE' || scheduleStatus === 'ACTIVE_BASELINE'}
            style={{
              padding: '8px 18px',
              borderRadius: '6px',
              border: '1px solid rgba(245, 158, 11, 0.5)',
              backgroundColor: (scheduleStatus === 'BASELINE' || scheduleStatus === 'ACTIVE_BASELINE') ? 'rgba(245, 158, 11, 0.05)' : 'rgba(245, 158, 11, 0.15)',
              color: (scheduleStatus === 'BASELINE' || scheduleStatus === 'ACTIVE_BASELINE') ? 'var(--text-secondary)' : '#f59e0b',
              cursor: (isLockingBaseline || scheduleStatus === 'BASELINE' || scheduleStatus === 'ACTIVE_BASELINE') ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '0.85rem',
              transition: 'all 0.2s'
            }}
          >
            {scheduleStatus === 'BASELINE' || scheduleStatus === 'ACTIVE_BASELINE' ? '✅ Baselined' : (isLockingBaseline ? '⏳ Locking...' : '🔒 Lock Baseline')}
          </button>
        </div>
      </div>

      {/* ── Notification ── */}
      {notification && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: notification.includes('Error') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
          border: `1px solid ${notification.includes('Error') ? '#ef4444' : '#10b981'}`,
          color: notification.includes('Error') ? '#ef4444' : '#10b981',
          borderRadius: '6px',
          fontSize: '0.85rem'
        }}>
          {notification}
        </div>
      )}

      {/* ── Legend ── */}
      <div style={{ display: 'flex', gap: '20px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <span><span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#ef4444', borderRadius: '2px', marginRight: '4px', verticalAlign: 'middle' }} /> Critical Path</span>
        <span><span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: 'var(--accent-color)', borderRadius: '2px', marginRight: '4px', verticalAlign: 'middle' }} /> Normal</span>
        <span><span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#10b981', borderRadius: '2px', marginRight: '4px', verticalAlign: 'middle' }} /> Progress</span>
        <span style={{ borderLeft: '2px dashed #f59e0b', paddingLeft: '6px' }}>Today</span>
      </div>

      {/* ── Gantt Chart Container ── */}
      <div style={{ display: 'flex', border: '1px solid var(--glass-border)', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.2)' }}>
        {/* ── Left: Activity Labels ── */}
        <div style={{ width: `${labelWidth}px`, flexShrink: 0, borderRight: '1px solid var(--glass-border)', zIndex: 2 }}>
          {/* Header */}
          <div style={{ height: `${headerHeight}px`, display: 'flex', alignItems: 'center', padding: '0 10px', borderBottom: '1px solid var(--glass-border)', backgroundColor: 'rgba(0,0,0,0.3)', fontWeight: 'bold', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
            Activity Name
          </div>
          {/* Activity rows */}
          {displayRows.map((row, i) => {
            if (row.isHeader) {
              return (
                <div
                  key={row.id}
                  style={{
                    height: `${rowHeight}px`,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 10px',
                    backgroundColor: 'rgba(0, 240, 255, 0.1)',
                    borderBottom: '1px solid var(--glass-border)',
                    fontWeight: 'bold',
                    color: 'var(--accent-color)',
                    fontSize: '0.85rem'
                  }}
                >
                  📁 {row.name}
                </div>
              );
            }
            
            const act = row.act;
            return (
              <div
                key={row.id}
                style={{
                  height: `${rowHeight}px`,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 10px 0 20px',
                  gap: '6px',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                  cursor: 'default'
                }}
              >
                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', minWidth: '40px', fontFamily: 'monospace' }}>
                  {act.activityCode || '-'}
                </span>
                <span style={{
                  fontSize: '0.8rem',
                  color: act.criticalPath ? '#ef4444' : 'var(--text-primary)',
                  fontWeight: act.criticalPath ? 'bold' : 'normal',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {act.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Right: Timeline Chart ── */}
        <div ref={scrollContainerRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}>
          <div style={{ width: `${timelineWidth}px`, minHeight: `${chartHeight}px`, position: 'relative' }}>
            {/* Timeline header */}
            <div style={{ height: `${headerHeight}px`, borderBottom: '1px solid var(--glass-border)', backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', position: 'sticky', top: 0, zIndex: 1 }}>
              {headerLabels.map((label, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${label.x}px`,
                    width: `${label.width}px`,
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    color: 'var(--text-secondary)',
                    borderRight: '1px solid rgba(255,255,255,0.05)',
                    userSelect: 'none'
                  }}
                >
                  {label.text}
                </div>
              ))}
            </div>

            {/* Grid lines */}
            {headerLabels.map((label, i) => (
              <div
                key={`grid-${i}`}
                style={{
                  position: 'absolute',
                  left: `${label.x}px`,
                  top: `${headerHeight}px`,
                  bottom: 0,
                  width: '1px',
                  backgroundColor: 'rgba(255,255,255,0.03)'
                }}
              />
            ))}

            {/* Today line */}
            {todayX > 0 && todayX < timelineWidth && (
              <div style={{
                position: 'absolute',
                left: `${todayX}px`,
                top: `${headerHeight}px`,
                bottom: 0,
                width: '2px',
                backgroundColor: '#f59e0b',
                zIndex: 3,
                opacity: 0.7
              }}>
                <div style={{
                  position: 'absolute',
                  top: '-2px',
                  left: '-12px',
                  fontSize: '0.6rem',
                  color: '#f59e0b',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap'
                }}>
                  TODAY
                </div>
              </div>
            )}

            {/* Activity Bars */}
            {displayRows.map((row, i) => {
              if (row.isHeader) {
                // Return an empty row block for headers on the timeline side
                return (
                  <div
                    key={row.id}
                    style={{
                      position: 'absolute',
                      top: `${headerHeight + i * rowHeight}px`,
                      left: 0,
                      right: 0,
                      height: `${rowHeight}px`,
                      backgroundColor: 'rgba(0, 240, 255, 0.05)',
                      borderBottom: '1px solid var(--glass-border)',
                      pointerEvents: 'none',
                      zIndex: 0
                    }}
                  />
                );
              }

              const act = row.act;
              const startDate = parseDate(act.plannedStartDate);
              const finishDate = parseDate(act.plannedFinishDate);

              if (!startDate || !finishDate) {
                // No dates — render placeholder
                return (
                  <div
                    key={act.id}
                    style={{
                      position: 'absolute',
                      top: `${headerHeight + i * rowHeight + 8}px`,
                      left: '10px',
                      height: `${rowHeight - 16}px`,
                      display: 'flex',
                      alignItems: 'center',
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)',
                      fontStyle: 'italic'
                    }}
                  >
                    No dates assigned — Run CPM
                  </div>
                );
              }

              const barX = getXForDate(startDate);
              const barWidth = Math.max(getXForDate(finishDate) - barX, 4);
              const progressWidth = (act.actualProgressPercent / 100) * barWidth;
              const isCritical = act.criticalPath;

              return (
                <div
                  key={act.id}
                  onMouseDown={(e) => handleBarMouseDown(e, act.id, startDate)}
                  style={{
                    position: 'absolute',
                    top: `${headerHeight + i * rowHeight + 8}px`,
                    left: `${barX}px`,
                    width: `${barWidth}px`,
                    height: `${rowHeight - 16}px`,
                    backgroundColor: isCritical ? 'rgba(239, 68, 68, 0.4)' : 'rgba(0, 240, 255, 0.3)',
                    border: `1px solid ${isCritical ? '#ef4444' : 'var(--accent-color)'}`,
                    borderRadius: '3px',
                    cursor: dragActivity === act.id ? 'grabbing' : 'grab',
                    transition: dragActivity === act.id ? 'none' : 'all 0.1s',
                    display: 'flex',
                    alignItems: 'center',
                    overflow: 'hidden',
                    zIndex: 2
                  }}
                  title={`${act.name}\n${formatDate(startDate)} — ${formatDate(finishDate)}\nDuration: ${act.plannedDuration}d | Float: ${act.totalFloat}d\nProgress: ${act.actualProgressPercent}%`}
                >
                  {/* Progress overlay */}
                  {progressWidth > 0 && (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${progressWidth}px`,
                      backgroundColor: '#10b981',
                      opacity: 0.6,
                      borderRadius: '2px 0 0 2px'
                    }} />
                  )}
                  {/* Bar label */}
                  {barWidth > 60 && (
                    <span style={{
                      position: 'relative',
                      zIndex: 1,
                      fontSize: '0.65rem',
                      color: '#fff',
                      padding: '0 4px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                    }}>
                      {act.name}
                    </span>
                  )}
                </div>
              );
            })}

            {/* Dependency Arrows (SVG overlay) */}
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
              <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                  <polygon points="0 0, 6 2, 0 4" fill="rgba(255,255,255,0.4)" />
                </marker>
              </defs>
              {dependencies.map(dep => {
                const predIdx = displayRows.findIndex(r => !r.isHeader && r.act.id === dep.predecessorId);
                const succIdx = displayRows.findIndex(r => !r.isHeader && r.act.id === dep.successorId);
                if (predIdx === -1 || succIdx === -1) return null;

                const predAct = displayRows[predIdx].act;
                const succAct = displayRows[succIdx].act;
                const predFinish = parseDate(predAct.plannedFinishDate);
                const succStart = parseDate(succAct.plannedStartDate);
                if (!predFinish || !succStart) return null;

                const x1 = getXForDate(predFinish);
                const y1 = headerHeight + predIdx * rowHeight + rowHeight / 2;
                const x2 = getXForDate(succStart);
                const y2 = headerHeight + succIdx * rowHeight + rowHeight / 2;

                // Draw L-shaped connector
                const midX = x1 + 10;

                return (
                  <g key={dep.id}>
                    <path
                      d={`M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`}
                      fill="none"
                      stroke="rgba(255,255,255,0.3)"
                      strokeWidth="1.5"
                      markerEnd="url(#arrowhead)"
                    />
                  </g>
                );
              })}
            </svg>

            {/* Row stripe backgrounds */}
            {displayRows.map((row, i) => {
              if (row.isHeader) return null; // headers already have background
              return (
                <div
                  key={`stripe-${i}`}
                  style={{
                    position: 'absolute',
                    top: `${headerHeight + i * rowHeight}px`,
                    left: 0,
                    right: 0,
                    height: `${rowHeight}px`,
                    backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    pointerEvents: 'none'
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {activities.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <p style={{ fontSize: '1.1rem' }}>No activities in the schedule yet.</p>
          <p>Go to the <strong>WBS & Activities</strong> tab to create activities, then return here to visualize the Gantt chart.</p>
        </div>
      )}
    </div>
  );
}
