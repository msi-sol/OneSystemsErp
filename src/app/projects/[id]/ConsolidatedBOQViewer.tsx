'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { materialQuantity, materialTotalCost } from '@/lib/procurement/material-values';
import LockConsolidatedBOQButton from './LockConsolidatedBOQButton';
import GenerateMRFModal from './GenerateMRFModal';
import AddManualMaterialModal from './AddManualMaterialModal';
import { autoConsolidateBOQ, deleteMasterMaterialsList, downloadMasterMaterialsTemplate } from '@/app/actions/consolidation';

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
  isSuperAdmin = false
}: ConsolidatedBOQViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddManualModalOpen, setIsAddManualModalOpen] = useState(false);
  const [showRevised, setShowRevised] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRegenerating, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

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
      alert(err.message || 'Failed to download template. It may not exist.');
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

  function handleSelectAll() {
    if (selectedItemIds.size === consolidatedItems.length) {
      setSelectedItemIds(newSet => new Set());
    } else {
      setSelectedItemIds(new Set(consolidatedItems.map(i => i.id)));
    }
  }

  const selectedItemsList = consolidatedItems.filter(item => selectedItemIds.has(item.id));

  const handleRegenerate = () => {
    if (confirm('Are you sure you want to REGENERATE the Master Materials List? This will discard the current list and re-analyze the Procurement Benchmark from scratch.')) {
      startTransition(async () => {
        try {
          await autoConsolidateBOQ(projectId, true);
          setSelectedItemIds(new Set());
        } catch (err: any) {
          alert(err.message || 'Error regenerating Master Materials List');
        }
      });
    }
  };

  const handleDelete = () => {
    if (confirm('🚨 SUPER ADMIN ACTION: Are you sure you want to completely DELETE the Master Materials List? This action cannot be undone.')) {
      startTransition(async () => {
        try {
          await deleteMasterMaterialsList(projectId);
        } catch (err: any) {
          alert(err.message || 'Error deleting Master Materials List');
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <div>
          <h2 style={{ color: isFullscreen ? '#fff' : 'var(--text-primary)', margin: 0 }}>
            {showRevised && hasAnyVOImpact ? 'Revised Master Materials List' : 'Master Materials List Overview'}
          </h2>
          <p style={{ margin: '8px 0 0 0', color: isFullscreen ? '#aaa' : 'var(--text-secondary)', fontSize: '0.95rem' }}>
            {totalItems} grouped items &bull; 
            {showRevised && hasAnyVOImpact ? (
              <>
                {' '}Original: ₱ {totalOriginalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                {' '}&bull; Revised: <strong style={{ color: 'var(--accent-color)' }}>₱ {totalRevisedValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
              </>
            ) : (
              <> Total Value: ₱ {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {hasAnyVOImpact && (
            <button
              onClick={() => setShowRevised(!showRevised)}
              style={{
                backgroundColor: showRevised ? 'rgba(0, 200, 83, 0.15)' : 'transparent',
                color: showRevised ? '#00c853' : 'var(--text-secondary)',
                border: `1px solid ${showRevised ? '#00c853' : 'var(--glass-border)'}`,
                padding: '8px 16px',
                borderRadius: '6px',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              {showRevised ? '✓ Revised View' : '○ Original View'}
            </button>
          )}
          {isLocked && selectedItemIds.size > 0 && canCreateMRF && (
            <button 
              onClick={() => {
                const generated = consolidatedItems.some(item => item.mappings?.some((mapping: { mappingType: string }) => mapping.mappingType === 'BENCHMARK_REVIEW'));
                if (generated) window.location.assign(`/material-requests/create?projectId=${encodeURIComponent(projectId)}`);
                else setIsModalOpen(true);
              }}
              style={{
                backgroundColor: 'var(--accent-color)',
                color: '#000', border: 'none', padding: '8px 16px',
                borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer',
                boxShadow: '0 0 10px var(--accent-glow)'
              }}
            >
              📋 Generate MRF ({selectedItemIds.size})
            </button>
          )}
          {!isLocked && (
            <button 
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="btn-secondary"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--glass-border)',
                fontWeight: 'bold',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: isRegenerating ? 'not-allowed' : 'pointer'
              }}
            >
              {isRegenerating ? 'Regenerating...' : '⚡ Regenerate List'}
            </button>
          )}
          {!isLocked && (
            <button
              onClick={() => setIsAddManualModalOpen(true)}
              className="btn-secondary"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                color: '#10b981',
                border: '1px solid #10b981',
                fontWeight: 'bold',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              ➕ Add Material Manually
            </button>
          )}
          {isSuperAdmin && !isLocked && (
            <button
              onClick={handleDelete}
              disabled={isRegenerating}
              className="btn-secondary"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                border: '1px solid #ef4444',
                fontWeight: 'bold',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: isRegenerating ? 'not-allowed' : 'pointer'
              }}
            >
              🗑️ Delete Materials List
            </button>
          )}
          {canLock && (
            <LockConsolidatedBOQButton projectId={projectId} isLocked={isLocked} />
          )}
          <button 
            onClick={handleDownloadTemplate}
            disabled={isDownloading}
            className="btn-secondary"
            style={{ 
              backgroundColor: 'rgba(59, 130, 246, 0.1)', 
              color: '#3b82f6',
              borderColor: '#3b82f6',
              fontWeight: 'bold',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: isDownloading ? 'not-allowed' : 'pointer'
            }}
          >
            {isDownloading ? 'Downloading...' : '📥 Export Excel'}
          </button>
          <button 
            onClick={toggleFullscreen}
            className="btn-secondary"
            style={{ 
              backgroundColor: isFullscreen ? 'var(--accent-color)' : 'transparent', 
              color: isFullscreen ? '#000' : 'var(--accent-color)',
              borderColor: 'var(--accent-color)',
              fontWeight: 'bold',
              // Raised only over the full-screen overlay; otherwise it floated above the app header's Sign Off when scrolling.
              zIndex: isFullscreen ? 10000 : undefined
            }}
          >
            {isFullscreen ? 'Exit Full Screen' : '⛶ Maximize'}
          </button>
        </div>
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
      <div className="table-scroll-container" style={{ backgroundColor: '#fff', padding: '0 15px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
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
            max-height: ${isFullscreen ? 'calc(100vh - 200px)' : '600px'};
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
        `}} />
        <table className="consolidation-table">
          <thead>
            <tr>
              {isLocked && (
                <th style={{ textAlign: 'center', width: '40px' }}>
                  <input 
                    type="checkbox" 
                    checked={selectedItemIds.size === consolidatedItems.length && consolidatedItems.length > 0}
                    onChange={handleSelectAll}
                  />
                </th>
              )}
              <th>Item Code</th>
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
              <th style={{ textAlign: 'right', paddingRight: showRevised && hasAnyVOImpact ? undefined : 72 }}>Orig Value</th>
              {showRevised && hasAnyVOImpact && (
                <th style={{ textAlign: 'right', fontWeight: 'bold', paddingRight: 72 }}>Revised Value</th>
              )}
            </tr>
          </thead>
          <tbody>
            {consolidatedItems.map((item) => {
              const hasVOImpact = item.voAdditiveQty > 0 || item.voDeductiveQty > 0;
              const rowClass = item.isVariationItem ? 'vo-item-row' : (hasVOImpact ? 'vo-impact-row' : '');

              return (
                <tr key={item.id} className={rowClass} style={{ backgroundColor: selectedItemIds.has(item.id) ? 'rgba(0, 255, 163, 0.05)' : undefined }}>
                  {isLocked && (
                    <td style={{ textAlign: 'center' }}>
                      <input 
                        type="checkbox"
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
                        {item.mappings?.some((mapping: { mappingType: string }) => mapping.mappingType === 'BENCHMARK_REVIEW') ? '✓ Reviewed benchmark' : item.mappings?.length ? '✓ Mapped source' : 'Saved material'}
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
                  <td className="nowrap" style={{ textAlign: 'right', paddingRight: showRevised && hasAnyVOImpact ? undefined : 72 }}>
                    ₱ {item.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  {showRevised && hasAnyVOImpact && (
                    <td className="nowrap" style={{ textAlign: 'right', paddingRight: 72, fontWeight: 'bold', color: materialTotalCost(item) !== item.totalCost ? 'var(--accent-color)' : '#000' }}>
                      ₱ {materialTotalCost(item).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              {/* Every column except the last value column: 6 base (+1 checkbox, +4 with VO columns). */}
              <th colSpan={(showRevised && hasAnyVOImpact ? 10 : 6) + (isLocked ? 1 : 0)} style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.05rem', padding: '15px 10px', backgroundColor: '#e0e0e0', position: 'sticky', bottom: 0, zIndex: 10, borderTop: '2px solid #ccc', borderBottom: 'none' }}>
                {showRevised && hasAnyVOImpact ? (
                  <span>
                    Original: ₱ {totalOriginalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    <span style={{ color: '#2e7d32', margin: '0 12px' }}>+ ₱ {totalVOAdditive.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    <span style={{ color: '#c62828' }}>- ₱ {totalVODeductive.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    <span style={{ margin: '0 12px' }}>=</span>
                    REVISED TOTAL:
                  </span>
                ) : (
                  'GRAND TOTAL:'
                )}
              </th>
              {/* Dark teal stays readable on the light footer; extra right padding keeps the total clear of the floating AI button. */}
              <th style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.05rem', padding: '15px 72px 15px 10px', color: '#0f766e', backgroundColor: '#e0e0e0', position: 'sticky', bottom: 0, zIndex: 10, borderTop: '2px solid #ccc', borderBottom: 'none', whiteSpace: 'nowrap' }}>
                ₱ {(showRevised && hasAnyVOImpact ? totalRevisedValue : totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
