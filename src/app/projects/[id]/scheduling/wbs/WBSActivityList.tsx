'use client';

import React, { useState, useEffect } from 'react';

interface Activity {
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
  freeFloat: number;
  unit: string | null;
  plannedQuantity: number;
  wbs?: { id: string; code: string; name: string; orderIndex?: number } | null;
  boqAllocations?: any[];
  predecessors?: any[];
  successors?: any[];
}

interface WBSActivityListProps {
  projectId: string;
  schedule: any;
  onRefresh: () => void;
  canEditDraft?: boolean;
}

export default function WBSActivityList({ projectId, schedule, onRefresh, canEditDraft = false }: WBSActivityListProps) {
  const activities: Activity[] = schedule?.activities || [];
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New activity form state
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newDuration, setNewDuration] = useState(1);
  const [newUnit, setNewUnit] = useState('');
  const [newQty, setNewQty] = useState(0);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editDuration, setEditDuration] = useState(0);
  const [editStatus, setEditStatus] = useState('');
  const [editProgress, setEditProgress] = useState(0);
  const [editStart, setEditStart] = useState('');
  const [editFinish, setEditFinish] = useState('');

  // Dependency modal
  const [showDepModal, setShowDepModal] = useState(false);
  const [depSuccessorId, setDepSuccessorId] = useState('');
  const [depPredecessorId, setDepPredecessorId] = useState('');
  const [depType, setDepType] = useState('FS');
  const [depLag, setDepLag] = useState(0);

  // BOQ Expansion state
  const [expandedBoqPhases, setExpandedBoqPhases] = useState<Record<string, boolean>>({});

  const toggleBoqPhase = (phase: string) => {
    setExpandedBoqPhases(prev => ({ ...prev, [phase]: !prev[phase] }));
  };

  const dismissMessages = () => {
    setTimeout(() => { setError(''); setSuccess(''); }, 4000);
  };

  const handleSimulate = async () => {
    if (!confirm('This will overwrite all existing durations, start dates, and dependencies to simulate a sequential schedule matching your project target dates. Proceed?')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/scheduling/simulate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(data.message);
      dismissMessages();
      onRefresh();
    } catch (err: any) {
      setError(err.message);
      dismissMessages();
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) { setError('Activity name is required'); dismissMessages(); return; }
    try {
      const res = await fetch(`/api/projects/${projectId}/scheduling/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          expectedRowVersion: schedule.rowVersion,
          activityCode: newCode || null,
          plannedDuration: newDuration,
          unit: newUnit || null,
          plannedQuantity: newQty,
          wbsId: schedule?.wbsNodes?.[0]?.id || null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIsAdding(false);
      setNewName(''); setNewCode(''); setNewDuration(1); setNewUnit(''); setNewQty(0);
      setSuccess('Activity created successfully');
      dismissMessages();
      onRefresh();
    } catch (err: any) {
      setError(err.message);
      dismissMessages();
    }
  };

  const startEdit = (act: Activity) => {
    setEditingId(act.id);
    setEditName(act.name);
    setEditCode(act.activityCode || '');
    setEditDuration(act.plannedDuration);
    setEditStatus(act.status);
    setEditProgress(act.actualProgressPercent);
    
    // Safely parse dates which might come from Prisma as Date objects or strings
    const safeDateString = (d: any) => {
      if (!d) return '';
      if (typeof d === 'string') return d.split('T')[0];
      if (d instanceof Date) return d.toISOString().split('T')[0];
      return '';
    };

    setEditStart(safeDateString(act.plannedStartDate));
    setEditFinish(safeDateString(act.plannedFinishDate));
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/scheduling/activities/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          expectedRowVersion: schedule.rowVersion,
          activityCode: editCode || null,
          plannedDuration: editDuration,
          status: editStatus,
          actualProgressPercent: editProgress,
          plannedStartDate: editStart || null,
          plannedFinishDate: editFinish || null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditingId(null);
      setSuccess('Activity updated');
      dismissMessages();
      onRefresh();
    } catch (err: any) {
      setError(err.message);
      dismissMessages();
    }
  };

  const handleDelete = async (actId: string) => {
    if (!confirm('Delete this activity? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/scheduling/activities/${actId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRowVersion: schedule.rowVersion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Activity deleted');
      dismissMessages();
      onRefresh();
    } catch (err: any) {
      setError(err.message);
      dismissMessages();
    }
  };

  const handleAddDependency = async () => {
    if (!depPredecessorId || !depSuccessorId) { setError('Both predecessor and successor are required'); dismissMessages(); return; }
    try {
      const res = await fetch(`/api/projects/${projectId}/scheduling/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          predecessorId: depPredecessorId,
          successorId: depSuccessorId,
          type: depType,
          lagDays: depLag
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowDepModal(false);
      setSuccess('Dependency added');
      dismissMessages();
      onRefresh();
    } catch (err: any) {
      setError(err.message);
      dismissMessages();
    }
  };

  const inputStyle: React.CSSProperties = {
    padding: '6px 8px',
    borderRadius: '4px',
    border: '1px solid var(--glass-border)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    color: 'white',
    fontSize: '0.8rem',
    width: '100%'
  };

  const statusColors: Record<string, string> = {
    NOT_STARTED: '#6b7280',
    IN_PROGRESS: '#3b82f6',
    COMPLETED: '#10b981',
    DELAYED: '#ef4444'
  };

  const isImmutable = !canEditDraft || !['AI_GENERATED_DRAFT', 'INVALID_GENERATED_DRAFT', 'TECHNICAL_REVISIONS_REQUIRED'].includes(schedule?.workflowStatus);

  return (
    <div style={{ padding: '20px' }}>
      {/* Messages */}
      {error && <div style={{ padding: '10px', marginBottom: '15px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '6px', fontSize: '0.85rem' }}>{error}</div>}
      {success && <div style={{ padding: '10px', marginBottom: '15px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#10b981', borderRadius: '6px', fontSize: '0.85rem' }}>{success}</div>}

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', gap: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>WBS & Activity List ({activities.length} activities)</h3>
        {!isImmutable && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleSimulate}
              style={{ padding: '8px 14px', backgroundColor: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.5)', color: '#f59e0b', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
            >
              ⚡ Auto-Simulate Schedule
            </button>
            <button
              onClick={() => setShowDepModal(true)}
              style={{ padding: '8px 14px', backgroundColor: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.5)', color: '#8b5cf6', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
            >
              🔗 Add Dependency
            </button>
            <button
              onClick={() => setIsAdding(true)}
              style={{ padding: '8px 14px', backgroundColor: 'rgba(0, 240, 255, 0.15)', border: '1px solid var(--accent-color)', color: 'var(--accent-color)', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
            >
              + Add Activity
            </button>
          </div>
        )}
      </div>

      {/* Data Grid */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
              <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--text-secondary)', width: '60px' }}>Code</th>
              <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--text-secondary)' }}>Activity Name</th>
              <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-secondary)', width: '80px' }}>Status</th>
              <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-secondary)', width: '70px' }}>Duration</th>
              <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-secondary)', width: '90px' }}>Start</th>
              <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-secondary)', width: '90px' }}>Finish</th>
              <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-secondary)', width: '60px' }}>Float</th>
              <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-secondary)', width: '70px' }}>Progress</th>
              <th style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)', width: '100px' }}>Total Cost</th>
              <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-secondary)', width: '50px' }}>CP</th>
              <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-secondary)', width: '90px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* Add Row */}
            {isAdding && (
              <tr style={{ borderBottom: '1px solid var(--glass-border)', backgroundColor: 'rgba(0, 240, 255, 0.05)' }}>
                <td style={{ padding: '6px 8px' }}><input style={inputStyle} value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="Code" /></td>
                <td style={{ padding: '6px 8px' }}><input style={inputStyle} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Activity Name" /></td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>—</td>
                <td style={{ padding: '6px 8px' }}><input style={{...inputStyle, textAlign: 'center'}} type="number" value={newDuration} onChange={e => setNewDuration(Number(e.target.value))} /></td>
                <td colSpan={2} style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Run CPM after adding</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>—</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>—</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>—</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>—</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                  <button onClick={handleCreate} style={{ padding: '4px 8px', backgroundColor: '#10b981', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginRight: '4px' }}>✓</button>
                  <button onClick={() => setIsAdding(false)} style={{ padding: '4px 8px', backgroundColor: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '4px', cursor: 'pointer' }}>✗</button>
                </td>
              </tr>
            )}

            {/* Render grouped activities */}
            {(() => {
              // Group activities by WBS Name
              const grouped = activities.reduce((acc, act) => {
                const groupName = act.wbs?.name || 'Unassigned';
                if (!acc[groupName]) acc[groupName] = [];
                acc[groupName].push(act);
                return acc;
              }, {} as Record<string, Activity[]>);

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

              let globalIndex = 0;

              return sortedGroups.map(groupName => {
                const phaseBoqs = new Map<string, { code: string; desc: string; unit: string; qty: number; cost: number }>();
                grouped[groupName].forEach(act => {
                  (act.boqAllocations || []).forEach((mapping: any) => {
                    const item = mapping.awardedBoqItem;
                    if (!item) return;
                    
                    let oldItemCode = item.itemCode || 'N/A';
                    if (oldItemCode === 'N/A' || oldItemCode.trim() === '') {
                      oldItemCode = item.description.trim();
                    }
                    const normalizedDesc = item.description.trim().toLowerCase();
                    const normalizedUnit = (item.unit || '').trim().toLowerCase();
                    const key = `${oldItemCode.toLowerCase()}||${normalizedDesc}||${normalizedUnit}`;
                    
                    if (!phaseBoqs.has(key)) {
                      phaseBoqs.set(key, { code: oldItemCode, desc: item.description, unit: item.unit || 'lot', qty: 0, cost: 0 });
                    } else {
                      const existing = phaseBoqs.get(key)!;
                      if (oldItemCode !== 'N/A' && existing.code !== 'N/A' && !existing.code.includes(oldItemCode)) {
                        existing.code += `, ${oldItemCode}`;
                      } else if (existing.code === 'N/A' && oldItemCode !== 'N/A') {
                        existing.code = oldItemCode;
                      }
                    }
                    
                    const proportionalCost = item.quantity > 0 ? (item.totalCost || 0) * (mapping.allocatedQuantity / item.quantity) : 0;
                    phaseBoqs.get(key)!.qty += mapping.allocatedQuantity;
                    phaseBoqs.get(key)!.cost += proportionalCost;
                  });
                });
                const boqList = Array.from(phaseBoqs.values()).filter(b => b.cost > 0);
                const phaseGrandTotalCost = boqList.reduce((sum, b) => sum + b.cost, 0);

                  let phaseStart: Date | null = null;
                  let phaseFinish: Date | null = null;
                  let totalProgressSum = 0;

                  for (const act of grouped[groupName]) {
                    const s = act.plannedStartDate ? new Date(act.plannedStartDate) : null;
                    const f = act.plannedFinishDate ? new Date(act.plannedFinishDate) : null;
                    
                    if (s && (!phaseStart || s < phaseStart)) phaseStart = s;
                    if (f && (!phaseFinish || f > phaseFinish)) phaseFinish = f;
                    
                    totalProgressSum += act.actualProgressPercent || 0;
                  }

                  let phaseDuration = 0;
                  if (phaseStart && phaseFinish) {
                    phaseDuration = Math.ceil((phaseFinish.getTime() - phaseStart.getTime()) / (1000 * 60 * 60 * 24));
                  }
                  const avgProgress = grouped[groupName].length > 0 ? Math.round(totalProgressSum / grouped[groupName].length) : 0;

                return (
                <React.Fragment key={groupName}>
                  <tr style={{ backgroundColor: 'rgba(0, 240, 255, 0.1)', borderBottom: '1px solid var(--glass-border)', fontWeight: 'bold', color: 'var(--accent-color)' }}>
                    <td style={{ padding: '8px 12px' }}>—</td>
                    <td style={{ padding: '8px 12px', fontSize: '0.9rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>📁 Phase Summary: [{wbsCodeMap[groupName]}] {groupName}</span>
                        {boqList.length > 0 && (
                          <button
                            onClick={() => toggleBoqPhase(groupName)}
                            style={{
                              padding: '4px 10px',
                              backgroundColor: expandedBoqPhases[groupName] ? 'rgba(0, 240, 255, 0.2)' : 'transparent',
                              border: '1px solid var(--accent-color)',
                              color: 'var(--accent-color)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 'bold'
                            }}
                          >
                            {expandedBoqPhases[groupName] ? '▲ Hide BOQ' : '📦 View BOQ Breakdown'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>—</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-primary)' }}>{phaseDuration}d</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-primary)', fontSize: '0.75rem' }}>
                      {phaseStart ? phaseStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-primary)', fontSize: '0.75rem' }}>
                      {phaseFinish ? phaseFinish.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>—</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                        <div style={{ width: '40px', height: '6px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${avgProgress}%`, height: '100%', backgroundColor: 'var(--accent-color)', borderRadius: '3px' }} />
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--accent-color)' }}>{avgProgress}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981', fontWeight: 'bold' }}>
                      ₱ {phaseGrandTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>—</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>—</td>
                  </tr>
                  {/* BOQ Breakdown Table */}
                  {expandedBoqPhases[groupName] && boqList.length > 0 && (
                    <tr style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--glass-border)' }}>
                      <td colSpan={11} style={{ padding: '15px' }}>
                        <div style={{ padding: '10px', border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: '8px', backgroundColor: 'rgba(0, 240, 255, 0.05)' }}>
                          <h4 style={{ margin: '0 0 10px 0', color: 'var(--text-primary)', fontSize: '0.85rem' }}>Bill of Quantities Requirement</h4>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                            <thead>
                              <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold' }}>Item Code</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold' }}>Description</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold' }}>Unit</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold' }}>Phase Quantity</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold' }}>Unit Cost</th>
                                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 'bold' }}>Total Cost Allocated</th>
                              </tr>
                            </thead>
                            <tbody>
                              {boqList.map((boq, i) => {
                                const displayUnitCost = boq.qty > 0 ? boq.cost / boq.qty : 0;
                                return (
                                  <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                                    <td style={{ padding: '6px 12px' }}>{boq.code}</td>
                                    <td style={{ padding: '6px 12px' }}>{boq.desc}</td>
                                    <td style={{ padding: '6px 12px' }}>{boq.unit}</td>
                                    <td style={{ padding: '6px 12px' }}>{boq.qty.toLocaleString()}</td>
                                    <td style={{ padding: '6px 12px' }}>₱ {displayUnitCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td style={{ padding: '6px 12px' }}>₱ {boq.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan={5} style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Phase Grand Total:</td>
                                <td style={{ padding: '10px 6px', textAlign: 'left', fontWeight: 'bold', color: '#10b981', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                  ₱{phaseGrandTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                  {(() => {
                    const groupActivities = [...grouped[groupName]].sort((a, b) => {
                      const startA = a.plannedStartDate ? new Date(a.plannedStartDate).getTime() : 0;
                      const startB = b.plannedStartDate ? new Date(b.plannedStartDate).getTime() : 0;
                      if (startA !== startB) return startA - startB;
                      // Fallback to alphabetical if dates are exactly the same
                      return (a.name || '').localeCompare(b.name || '');
                    });
                    
                    return groupActivities.map((act) => {
                    const i = globalIndex++;

                    const activityTotalCost = (act.boqAllocations || []).reduce((sum: number, mapping: any) => {
                      const item = mapping.awardedBoqItem;
                      if (!item) return sum;
                      const proportionalCost = item.quantity > 0 ? (item.totalCost || 0) * (mapping.allocatedQuantity / item.quantity) : 0;
                      return sum + proportionalCost;
                    }, 0);
                    const formattedActivityCost = `₱ ${activityTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                    return editingId === act.id ? (
                /* Edit Row */
                <tr key={act.id} style={{ borderBottom: '1px solid var(--glass-border)', backgroundColor: 'rgba(245, 158, 11, 0.05)' }}>
                  <td style={{ padding: '6px 8px' }}><input aria-label="Work package code" style={inputStyle} value={editCode} onChange={e => setEditCode(e.target.value)} /></td>
                  <td style={{ padding: '6px 8px' }}><input aria-label="Work package name" style={inputStyle} value={editName} onChange={e => setEditName(e.target.value)} /></td>
                  <td style={{ padding: '6px 8px' }}>
                    <select style={inputStyle} value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                      <option value="NOT_STARTED">Not Started</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="DELAYED">Delayed</option>
                    </select>
                  </td>
                  <td style={{ padding: '6px 8px' }}><input style={{...inputStyle, textAlign: 'center'}} type="number" value={editDuration} onChange={e => setEditDuration(Number(e.target.value))} /></td>
                  <td style={{ padding: '6px 8px' }}><input style={inputStyle} type="date" value={editStart} onChange={e => setEditStart(e.target.value)} /></td>
                  <td style={{ padding: '6px 8px' }}><input style={inputStyle} type="date" value={editFinish} onChange={e => setEditFinish(e.target.value)} /></td>
                  <td style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>{act.totalFloat}d</td>
                  <td style={{ padding: '6px 8px' }}><input style={{...inputStyle, textAlign: 'center'}} type="number" min={0} max={100} value={editProgress} onChange={e => setEditProgress(Number(e.target.value))} /></td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{formattedActivityCost}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>{act.criticalPath ? '🔴' : '—'}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <button aria-label="Save work package" onClick={handleUpdate} style={{ padding: '4px 8px', backgroundColor: '#10b981', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginRight: '4px' }}>💾</button>
                    <button onClick={() => setEditingId(null)} style={{ padding: '4px 8px', backgroundColor: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '4px', cursor: 'pointer' }}>✗</button>
                  </td>
                </tr>
              ) : (
                /* View Row */
                <tr key={act.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  <td style={{ padding: '8px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{act.activityCode || '-'}</td>
                  <td style={{ padding: '8px', color: act.criticalPath ? '#ef4444' : 'var(--text-primary)', fontWeight: act.criticalPath ? 'bold' : 'normal' }}>{act.name}</td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    <span style={{ padding: '3px 8px', borderRadius: '10px', fontSize: '0.75rem', backgroundColor: `${statusColors[act.status] || '#6b7280'}20`, color: statusColors[act.status] || '#6b7280', fontWeight: 'bold' }}>
                      {act.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-primary)' }}>{act.plannedDuration}d</td>
                  <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    {act.plannedStartDate ? new Date(act.plannedStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    {act.plannedFinishDate ? new Date(act.plannedFinishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center', color: act.totalFloat === 0 ? '#ef4444' : 'var(--text-secondary)' }}>{act.totalFloat}d</td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                      <div style={{ width: '40px', height: '6px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${act.actualProgressPercent}%`, height: '100%', backgroundColor: '#10b981', borderRadius: '3px' }} />
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{act.actualProgressPercent}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 'bold' }}>{formattedActivityCost}</td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>{act.criticalPath ? '🔴' : '—'}</td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    {!isImmutable && (
                      <>
                        <button aria-label={`Edit work package ${act.activityCode || act.id}`} onClick={() => startEdit(act)} style={{ padding: '3px 6px', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', marginRight: '4px', fontSize: '0.75rem' }}>✏️</button>
                        <button onClick={() => handleDelete(act.id)} style={{ padding: '3px 6px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>🗑</button>
                      </>
                    )}
                  </td>
              </tr>
              );
            });
            })()}
                </React.Fragment>
                );
              });
            })()}
          </tbody>
        </table>
      </div>

      {activities.length === 0 && !isAdding && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          No activities yet. Click <strong>"+ Add Activity"</strong> to start building the WBS.
        </div>
      )}

      {/* Dependency Modal */}
      {showDepModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="glass-panel" style={{ padding: '30px', borderRadius: '12px', width: '500px', maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 20px 0', color: 'var(--accent-color)' }}>🔗 Add Dependency</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Predecessor (must finish first)</label>
                <select style={inputStyle} value={depPredecessorId} onChange={e => setDepPredecessorId(e.target.value)}>
                  <option value="">Select predecessor...</option>
                  {activities.map(a => <option key={a.id} value={a.id}>{a.activityCode || '—'} | {a.name}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Successor (depends on predecessor)</label>
                <select style={inputStyle} value={depSuccessorId} onChange={e => setDepSuccessorId(e.target.value)}>
                  <option value="">Select successor...</option>
                  {activities.map(a => <option key={a.id} value={a.id}>{a.activityCode || '—'} | {a.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Relationship Type</label>
                  <select style={inputStyle} value={depType} onChange={e => setDepType(e.target.value)}>
                    <option value="FS">Finish-to-Start (FS)</option>
                    <option value="SS">Start-to-Start (SS)</option>
                    <option value="FF">Finish-to-Finish (FF)</option>
                    <option value="SF">Start-to-Finish (SF)</option>
                  </select>
                </div>
                <div style={{ width: '100px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Lag (days)</label>
                  <input style={{...inputStyle, textAlign: 'center'}} type="number" value={depLag} onChange={e => setDepLag(Number(e.target.value))} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '25px' }}>
              <button onClick={() => setShowDepModal(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAddDependency} style={{ padding: '8px 16px', backgroundColor: 'var(--accent-color)', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Add Dependency</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
