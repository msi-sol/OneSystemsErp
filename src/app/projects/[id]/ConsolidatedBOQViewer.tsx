'use client';

import { useState, useRef, useEffect, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import styles from './materialsFlow.module.css';
import { materialQuantity, materialTotalCost } from '@/lib/procurement/material-values';
import LockConsolidatedBOQButton from './LockConsolidatedBOQButton';
import GenerateMRFModal from './GenerateMRFModal';
import AddManualMaterialModal from './AddManualMaterialModal';
import { autoConsolidateBOQ, deleteMasterMaterialsList, downloadMasterMaterialsTemplate } from '@/app/actions/consolidation';
import { askConfirm } from '@/lib/ui/dialogs';
import MaterialTrackingTable, { STAGE } from './MaterialTrackingTable';
import type { MaterialTracking, TrackingStage } from '@/lib/procurement/material-tracking';

interface ConsolidatedBOQViewerProps {
  projectId: string;
  isLocked: boolean;
  consolidatedItems: any[];
  totalItems: number;
  totalAmount: number;
  users?: { id: string; name: string | null }[];
  canCreateMRF?: boolean;
  canLock?: boolean;
  isSuperAdmin?: boolean;
  /** Procurement tracking per material (requested → ordered → delivered → issued → on hand, with history). */
  tracking?: Record<string, MaterialTracking>;
}

export default function ConsolidatedBOQViewer({ 
  projectId, 
  isLocked, 
  consolidatedItems, 
  totalItems, 
  totalAmount,
  users = [],
  canCreateMRF = true,
  canLock = true,
  isSuperAdmin = false,
  tracking
}: ConsolidatedBOQViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddManualModalOpen, setIsAddManualModalOpen] = useState(false);
  const [showRevised, setShowRevised] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRegenerating, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const router = useRouter();
  const [query, setQuery] = useState('');
  // Tracking (procurement stages, on hand, history) is the main view; the budget/VO table stays one click away.
  const [view, setView] = useState<'tracking' | 'budget'>(tracking ? 'tracking' : 'budget');
  const [stageFilter, setStageFilter] = useState<TrackingStage | 'ALL' | 'AWAITING'>('ALL');
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { AWAITING: 0 };
    for (const item of consolidatedItems) {
      const track = tracking?.[item.id];
      if (!track) continue;
      counts[track.stage] = (counts[track.stage] || 0) + 1;
      if (track.awaiting) counts.AWAITING += 1;
    }
    return counts;
  }, [consolidatedItems, tracking]);
  // Search and the stage filter narrow the table; selection and "select all" act on the rows shown.
  const visibleItems = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const byStage = view !== 'tracking' || stageFilter === 'ALL' || !tracking ? consolidatedItems
      : consolidatedItems.filter(item => stageFilter === 'AWAITING' ? !!tracking[item.id]?.awaiting : tracking[item.id]?.stage === stageFilter);
    if (!words.length) return byStage;
    return byStage.filter(item => {
      const sources = (item.mappings || []).map((mapping: { procurementBenchmarkItem?: { itemCode?: string | null; description?: string } | null }) => `${mapping.procurementBenchmarkItem?.itemCode || ''} ${mapping.procurementBenchmarkItem?.description || ''}`).join(' ');
      return words.every(word => `${item.itemCode} ${item.description} ${item.unit} ${sources}`.toLowerCase().includes(word));
    });
  }, [consolidatedItems, query, view, stageFilter, tracking]);
  const closeMore = () => { if (moreRef.current) moreRef.current.open = false; };
  /** Where a material came from: its benchmark lines, added here, or a variation order. */
  function sourceChip(item: any) {
    if (item.isVariationItem || item.voAdditiveQty > 0 || item.voDeductiveQty > 0) {
      return <span style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', padding: '1px 8px', borderRadius: 12, fontWeight: 'bold', whiteSpace: 'nowrap' }}>{item.sourceVoNumber || 'VO applied'}</span>;
    }
    const lines = (item.mappings || []).filter((mapping: { procurementBenchmarkItem?: unknown }) => mapping.procurementBenchmarkItem).map((mapping: { procurementBenchmarkItem: { itemCode?: string | null; description: string } }) => `${mapping.procurementBenchmarkItem.itemCode ? `${mapping.procurementBenchmarkItem.itemCode} · ` : ''}${mapping.procurementBenchmarkItem.description}`);
    const reviewed = item.mappings?.some((mapping: { mappingType: string }) => mapping.mappingType === 'BENCHMARK_REVIEW');
    const label = reviewed ? '✓ Reviewed' : lines.length > 1 ? `Benchmark · ${lines.length} lines` : lines.length ? 'Benchmark' : item.mappings?.length ? '✓ Mapped' : 'Added here';
    const title = lines.length ? `From the procurement benchmark:\n${lines.join('\n')}` : item.mappings?.length ? 'Mapped to its BOQ source' : 'Added in this list, not from the benchmark';
    return <span title={title} style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '1px 8px', borderRadius: 12, fontWeight: 'bold', whiteSpace: 'nowrap' }}>{label}</span>;
  }
  // The "More" menu closes when you click anywhere else, like other menus.
  useEffect(() => {
    const onClick = (event: MouseEvent) => { if (moreRef.current?.open && !moreRef.current.contains(event.target as Node)) moreRef.current.open = false; };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleDownloadTemplate = async () => {
    try {
      setIsDownloading(true);
      const base64Data = await downloadMasterMaterialsTemplate(projectId);
      const binaryString = window.atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Master_Materials_${projectId}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setActionError(err.message || 'Failed to download template. It may not exist.');
    } finally {
      setIsDownloading(false);
    }
  };

  function toggleFullscreen() {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }

  function toggleSelection(id: string) {
    const newSet = new Set(selectedItemIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedItemIds(newSet);
  }

  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every(item => selectedItemIds.has(item.id));
  function handleSelectAll() {
    const next = new Set(selectedItemIds);
    for (const item of visibleItems) { if (allVisibleSelected) next.delete(item.id); else next.add(item.id); }
    setSelectedItemIds(next);
  }

  const selectedItemsList = consolidatedItems.filter(item => selectedItemIds.has(item.id));

  const [actionError, setActionError] = useState('');
  const handleRegenerate = async () => {
    if (await askConfirm('Regenerate the Master Materials List? This discards the current list and re-analyzes the Procurement Benchmark from scratch.', { confirmLabel: 'Regenerate', danger: true })) {
      startTransition(async () => {
        try {
          await autoConsolidateBOQ(projectId, true);
          setSelectedItemIds(new Set());
          router.refresh();
        } catch (err: any) {
          setActionError(err.message || 'Error regenerating Master Materials List');
        }
      });
    }
  };

  const handleDelete = async () => {
    if (await askConfirm('Super admin action: delete the whole Master Materials List? This cannot be undone.', { confirmLabel: 'Delete', danger: true })) {
      startTransition(async () => {
        try {
          await deleteMasterMaterialsList(projectId);
          router.refresh();
        } catch (err: any) {
          setActionError(err.message || 'Error deleting Master Materials List');
        }
      });
    }
  };

  // Calculate summary totals
  const hasAnyVOImpact = consolidatedItems.some(
    i => i.voAdditiveQty > 0 || i.voDeductiveQty > 0 || i.isVariationItem
  );
  const totalOriginalValue = consolidatedItems.reduce((sum: number, item: any) => sum + item.totalCost, 0);
  const totalVOAdditive = consolidatedItems.reduce((sum: number, item: any) => sum + (item.voAdditiveCost || 0), 0);
  const totalVODeductive = consolidatedItems.reduce((sum: number, item: any) => sum + (item.voDeductiveCost || 0), 0);
  const totalRevisedValue = consolidatedItems.reduce((sum: number, item: any) => {
    return sum + materialTotalCost(item);
  }, 0);

  return (
    <div ref={containerRef} className={isFullscreen ? "fullscreen-wrapper" : "normal-wrapper"}>
      <div id="materials-actions" className={styles.bar}>
        <div>
          <h3 className={styles.barTitle} style={{ color: isFullscreen ? '#fff' : undefined }}>
            {showRevised && hasAnyVOImpact ? 'Revised Master Materials List' : 'Master Materials List'}{' '}
            <span className={`${styles.status} ${isLocked ? styles.statusLocked : styles.statusDraft}`} style={{ verticalAlign: 'middle', marginLeft: 6 }}>{isLocked ? '🔒 Locked · ready for requests' : 'Draft · not locked'}</span>
          </h3>
          <p className={styles.barNote}>
            {totalItems} materials · {showRevised && hasAnyVOImpact
              ? <>original ₱ {totalOriginalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · revised <strong style={{ color: 'var(--accent-color)' }}>₱ {totalRevisedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></>
              : <>total ₱ {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>}
            {isLocked && canCreateMRF ? ' · tick materials below to raise a request.' : !isLocked ? ' · check it, then lock it so requests can be raised.' : ''}
          </p>
        </div>
        <div className={styles.actions}>
          {hasAnyVOImpact && (
            <button type="button" className={styles.ghost} aria-pressed={showRevised} onClick={() => setShowRevised(!showRevised)}>
              {showRevised ? 'Showing revised (with VOs)' : 'Showing original'}
            </button>
          )}
          {isLocked && canCreateMRF && (
            <button
              type="button"
              className={styles.cta}
              disabled={selectedItemIds.size === 0}
              title={selectedItemIds.size === 0 ? 'Tick the materials to request first' : undefined}
              onClick={() => {
                const generated = consolidatedItems.some(item => item.mappings?.some((mapping: { mappingType: string }) => mapping.mappingType === 'BENCHMARK_REVIEW'));
                if (generated) window.location.assign(`/material-requests/create?projectId=${encodeURIComponent(projectId)}`);
                else setIsModalOpen(true);
              }}
            >
              Raise material request{selectedItemIds.size ? ` (${selectedItemIds.size})` : ''}
            </button>
          )}
          {canLock && <LockConsolidatedBOQButton projectId={projectId} isLocked={isLocked} onError={setActionError} />}
          <button type="button" onClick={handleDownloadTemplate} disabled={isDownloading} className={styles.ghost}>
            {isDownloading ? 'Exporting…' : 'Export Excel'}
          </button>
          <details ref={moreRef} className={styles.more}>
            <summary className={styles.ghost} aria-label="More actions">More ▾</summary>
            <div className={styles.menu} role="menu">
              {!isLocked && <button type="button" role="menuitem" disabled={isRegenerating} onClick={() => { closeMore(); void handleRegenerate(); }}>
                {isRegenerating ? 'Regenerating…' : 'Regenerate from the benchmark'}<span className={styles.menuHint}>Copies the procurement benchmark again</span></button>}
              {!isLocked && <button type="button" role="menuitem" onClick={() => { closeMore(); setIsAddManualModalOpen(true); }}>
                Add a material<span className={styles.menuHint}>For items not in the benchmark</span></button>}
              <button type="button" role="menuitem" onClick={() => { closeMore(); toggleFullscreen(); }}>{isFullscreen ? 'Exit full screen' : 'Full screen'}</button>
              {isSuperAdmin && !isLocked && <button type="button" role="menuitem" className={styles.menuDanger} disabled={isRegenerating} onClick={() => { closeMore(); void handleDelete(); }}>
                Delete the whole list<span className={styles.menuHint}>Super admin only · cannot be undone</span></button>}
            </div>
          </details>
        </div>
      </div>

      {tracking && <div className={styles.filters} style={{ marginBottom: 8 }}>
        <span className={styles.segment} role="group" aria-label="Table view">
          <button type="button" aria-pressed={view === 'tracking'} onClick={() => setView('tracking')}>Tracking</button>
          <button type="button" aria-pressed={view === 'budget'} onClick={() => setView('budget')}>Budget &amp; VO</button>
        </span>
        {view === 'tracking' && <span role="group" aria-label="Filter by stage" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['ALL', ...Object.keys(STAGE), 'AWAITING'] as Array<TrackingStage | 'ALL' | 'AWAITING'>).filter(key => key === 'ALL' || stageCounts[key]).map(key => {
            const active = stageFilter === key;
            const label = key === 'ALL' ? `All ${consolidatedItems.length}` : key === 'AWAITING' ? `Awaiting action ${stageCounts.AWAITING}` : `${STAGE[key as TrackingStage].label} ${stageCounts[key]}`;
            return <button key={key} type="button" aria-pressed={active} onClick={() => setStageFilter(key)}
              style={{ padding: '5px 10px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', border: `1px solid ${active ? 'var(--accent-color)' : 'var(--glass-border)'}`, background: active ? 'rgba(0, 240, 255, 0.12)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</button>;
          })}
        </span>}
      </div>}

      <div className={styles.filters}>
        <input type="search" className={styles.search} placeholder="Search code, material, unit or benchmark line" aria-label="Search materials" value={query} onChange={event => setQuery(event.target.value)} />
        <span className={styles.count} aria-live="polite">{visibleItems.length === consolidatedItems.length ? `${consolidatedItems.length} materials` : `${visibleItems.length} of ${consolidatedItems.length} materials`}{selectedItemIds.size ? ` · ${selectedItemIds.size} selected` : ''}</span>
      </div>

      {isModalOpen && (
        <GenerateMRFModal 
          projectId={projectId}
          items={selectedItemsList}
          users={users}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      {isAddManualModalOpen && (
        <AddManualMaterialModal 
          projectId={projectId}
          onClose={() => setIsAddManualModalOpen(false)}
        />
      )}

      {/* VO Impact Summary Banner */}
      {showRevised && hasAnyVOImpact && (
        <div style={{
          display: 'flex',
          gap: '20px',
          padding: '12px 20px',
          marginBottom: '15px',
          background: 'linear-gradient(135deg, rgba(0,200,83,0.08), rgba(255,82,82,0.08))',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.1)',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Original material budget</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>₱ {totalOriginalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <div style={{ fontSize: '0.75rem', color: '#00c853', textTransform: 'uppercase', letterSpacing: '0.5px' }}>+ VO Additive</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#00c853' }}>₱ {totalVOAdditive.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <div style={{ fontSize: '0.75rem', color: '#ff5252', textTransform: 'uppercase', letterSpacing: '0.5px' }}>- VO Deductive</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#ff5252' }}>₱ {totalVODeductive.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div style={{ flex: 1, minWidth: '140px', borderLeft: '2px solid rgba(255,255,255,0.15)', paddingLeft: '20px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--accent-color)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Revised material budget</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>₱ {totalRevisedValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
        </div>
      )}

      {/* No vertical padding: rows scrolled under the sticky header/footer would otherwise show through the padding strip. */}
      {/* No padding: content scrolled sideways showed in a white strip beside the sticky item-code column. */}
      {/* isolation keeps the sticky header's z-index inside the table, so it no longer draws over the app's top bar. */}
      <div className="table-scroll-container" style={{ backgroundColor: '#fff', padding: 0, borderRadius: '8px 8px 0 0', border: '1px solid var(--glass-border)', borderBottom: 'none', isolation: 'isolate' }}>
        <style dangerouslySetInnerHTML={{__html: `
          .fullscreen-wrapper {
            width: 100vw;
            height: 100vh;
            background-color: var(--bg-dark);
            padding: 20px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          .normal-wrapper {
            position: relative;
          }
          .table-scroll-container {
            overflow: auto;
            flex-grow: 1;
            max-height: ${isFullscreen ? 'calc(100vh - 250px)' : '600px'};
          }
          .consolidation-table { 
            width: 100%; 
            border-collapse: separate; 
            border-spacing: 0;
            color: #000; 
            font-size: 0.85rem; 
          }
          .consolidation-table td, .consolidation-table th { 
            padding: 10px; 
            background-color: #fff;
          }
          .consolidation-table th {
            background-color: #f0f0f0 !important;
            position: sticky;
            top: 0;
            z-index: 10;
            border-bottom: 2px solid #ccc;
            text-align: left;
          }
          .consolidation-table td {
            border-bottom: 1px solid #eaeaea;
          }
          /* Codes, quantities, units and peso amounts never break across lines ("BM-" / "0064", "₱" / "248,940.63"). */
          .consolidation-table .nowrap {
            white-space: nowrap;
          }
          .consolidation-table td.description {
            min-width: 220px;
          }
          .consolidation-table td:first-child, .consolidation-table th:first-child {
            position: sticky;
            left: 0;
            z-index: 5;
          }
          .consolidation-table th:first-child {
            z-index: 11;
          }
          .vo-badge {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            background: linear-gradient(135deg, #e8f5e9, #c8e6c9);
            color: #2e7d32;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.7rem;
            font-weight: bold;
            white-space: nowrap;
          }
          .vo-impact-row {
            background-color: rgba(0, 200, 83, 0.03) !important;
          }
          .vo-item-row {
            background-color: rgba(0, 200, 83, 0.06) !important;
          }
          .consolidation-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
          .consolidation-table th.num { text-align: right; }
          .tracking-table tr.tracking-open td { border-bottom-color: transparent; background-color: #f8fafc; }
          .tracking-table tr.tracking-history td:first-child { position: static; }
        `}} />
        {view === 'tracking' && tracking ? <MaterialTrackingTable
          items={visibleItems}
          tracking={tracking}
          selectable={isLocked && canCreateMRF}
          selected={selectedItemIds}
          onToggle={toggleSelection}
          allSelected={allVisibleSelected}
          onToggleAll={handleSelectAll}
          source={sourceChip}
        /> : <table className="consolidation-table">
          <thead>
            <tr>
              {isLocked && (
                <th style={{ textAlign: 'center', width: '40px' }}>
                  <input 
                    type="checkbox" 
                    aria-label="Select all materials shown"
                    checked={allVisibleSelected}
                    onChange={handleSelectAll}
                  />
                </th>
              )}
              <th style={{ whiteSpace: 'nowrap' }}>Item Code</th>
              <th>Description</th>
              <th style={{ textAlign: 'center' }}>Source</th>
              <th style={{ textAlign: 'right' }}>Orig Qty</th>
              {showRevised && hasAnyVOImpact && (
                <>
                  <th style={{ textAlign: 'right', color: '#2e7d32' }}>+ VO Qty</th>
                  <th style={{ textAlign: 'right', color: '#c62828' }}>- VO Qty</th>
                  <th style={{ textAlign: 'right', fontWeight: 'bold' }}>Rev Qty</th>
                </>
              )}
              <th>Unit</th>
              <th style={{ textAlign: 'right' }}>Unit Cost</th>
              <th style={{ textAlign: 'right' }}>Orig Value</th>
              {showRevised && hasAnyVOImpact && (
                <th style={{ textAlign: 'right', fontWeight: 'bold' }}>Revised Value</th>
              )}
            </tr>
          </thead>
          <tbody>
            {!visibleItems.length && <tr><td colSpan={12} style={{ textAlign: 'center', color: '#666', padding: 24 }}>No materials match the search.</td></tr>}
            {visibleItems.map((item) => {
              const hasVOImpact = item.voAdditiveQty > 0 || item.voDeductiveQty > 0;
              const rowClass = item.isVariationItem ? 'vo-item-row' : (hasVOImpact ? 'vo-impact-row' : '');

              return (
                <tr key={item.id} className={rowClass} style={{ backgroundColor: selectedItemIds.has(item.id) ? 'rgba(0, 255, 163, 0.05)' : undefined }}>
                  {isLocked && (
                    <td style={{ textAlign: 'center' }}>
                      <input 
                        type="checkbox"
                        aria-label={`Select ${item.itemCode}`}
                        checked={selectedItemIds.has(item.id)}
                        onChange={() => toggleSelection(item.id)}
                      />
                    </td>
                  )}
                  <td className="nowrap" style={{ fontWeight: 'bold' }}>
                    {item.itemCode}
                    {item.isVariationItem && (
                      <span className="vo-badge" style={{ marginLeft: '6px' }}>
                        ⚡ New via VO
                      </span>
                    )}
                  </td>
                  <td className="description">{item.description}</td>
                  <td className="nowrap" style={{ textAlign: 'center' }}>
                    {item.isVariationItem || hasVOImpact ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        backgroundColor: '#e8f5e9',
                        color: '#2e7d32',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap'
                      }}>
                        {item.sourceVoNumber || 'VO Applied'}
                      </span>
                    ) : (
                      <span style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '4px', 
                        backgroundColor: '#dcfce7', 
                        color: '#166534', 
                        padding: '2px 8px', 
                        borderRadius: '12px', 
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                      }}>
                        {(() => {
                          const lines = (item.mappings || []).filter((mapping: { procurementBenchmarkItem?: unknown }) => mapping.procurementBenchmarkItem).map((mapping: { procurementBenchmarkItem: { itemCode?: string | null; description: string } }) => `${mapping.procurementBenchmarkItem.itemCode ? `${mapping.procurementBenchmarkItem.itemCode} · ` : ''}${mapping.procurementBenchmarkItem.description}`);
                          const reviewed = item.mappings?.some((mapping: { mappingType: string }) => mapping.mappingType === 'BENCHMARK_REVIEW');
                          const label = reviewed ? '✓ Reviewed' : lines.length > 1 ? `Benchmark · ${lines.length} lines` : lines.length ? 'Benchmark' : item.mappings?.length ? '✓ Mapped' : 'Added here';
                          const title = lines.length ? `From the procurement benchmark:\n${lines.join('\n')}` : item.mappings?.length ? 'Mapped to its BOQ source' : 'Added in this list, not from the benchmark';
                          return <span style={{ whiteSpace: 'nowrap' }} title={title}>{label}</span>;
                        })()}
                      </span>
                    )}
                  </td>
                  <td className="nowrap" style={{ textAlign: 'right', fontWeight: 'bold' }}>
                    {item.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                  {showRevised && hasAnyVOImpact && (
                    <>
                      <td style={{ textAlign: 'right', color: item.voAdditiveQty > 0 ? '#2e7d32' : '#999', fontWeight: item.voAdditiveQty > 0 ? 'bold' : 'normal' }}>
                        {item.voAdditiveQty > 0 ? `+${item.voAdditiveQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: item.voDeductiveQty > 0 ? '#c62828' : '#999', fontWeight: item.voDeductiveQty > 0 ? 'bold' : 'normal' }}>
                        {item.voDeductiveQty > 0 ? `-${item.voDeductiveQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: materialQuantity(item) !== item.quantity ? 'var(--accent-color)' : '#000' }}>
                        {materialQuantity(item).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                    </>
                  )}
                  <td className="nowrap">{item.unit}</td>
                  <td className="nowrap" style={{ textAlign: 'right' }}>
                    ₱ {item.unitCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="nowrap" style={{ textAlign: 'right' }}>
                    ₱ {item.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  {showRevised && hasAnyVOImpact && (
                    <td className="nowrap" style={{ textAlign: 'right', fontWeight: 'bold', color: materialTotalCost(item) !== item.totalCost ? 'var(--accent-color)' : '#000' }}>
                      ₱ {materialTotalCost(item).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>}
      </div>
      {/* The total sits outside the scrolling table, so sideways scrolling and the floating AI button cannot hide it. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: '8px 16px', padding: '14px 16px', backgroundColor: '#e0e0e0', color: '#000', border: '1px solid var(--glass-border)', borderTop: '2px solid #ccc', borderRadius: '0 0 8px 8px', fontWeight: 'bold' }}>
        {showRevised && hasAnyVOImpact ? (
          <span style={{ fontSize: '0.9rem' }}>
            Original: ₱ {totalOriginalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span style={{ color: '#2e7d32', margin: '0 10px' }}>+ ₱ {totalVOAdditive.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span style={{ color: '#c62828' }}>- ₱ {totalVODeductive.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </span>
        ) : null}
        <span style={{ fontSize: '1.05rem', whiteSpace: 'nowrap' }}>
          {showRevised && hasAnyVOImpact ? 'REVISED TOTAL:' : 'GRAND TOTAL:'}{' '}
          <span style={{ color: '#0f766e' }}>₱ {(showRevised && hasAnyVOImpact ? totalRevisedValue : totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </span>
      </div>
      {actionError && <p role="alert" style={{ margin: '10px 0 0', color: '#fca5a5' }}>{actionError}</p>}
    </div>
  );
}
