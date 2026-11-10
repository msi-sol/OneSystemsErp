'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { uploadProcurementBenchmark, lockProcurementBenchmark, deleteProcurementBenchmark } from '@/app/actions/mutations';
import BenchmarkAiCheck from './BenchmarkAiCheck';
import styles from './materialsFlow.module.css';
import UploadDropzone from '@/components/ui/UploadDropzone';

type BenchmarkItem = { id?: string; itemCode?: string | null; description: string; quantity?: number | null; unit?: string | null; unitCost?: number | null; totalCost?: number | null };
const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money = (value: number | null | undefined) => (value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Procurement Benchmark: the internal spending limit, and the source the Master Materials List is generated from.
 * Corrections are made here (the materials list copies these lines), so the page leads with its figures, the
 * AI Check and one clear lock action; delete stays available but secondary.
 */
export default function ProcurementBenchmarkTab({
  projectId,
  isLocked,
  items,
  totalItems,
  totalAmount,
  contractAmount = 0,
  materialsGenerated = false,
  boqLinks = {}
}: {
  projectId: string;
  isLocked: boolean;
  items: BenchmarkItem[];
  totalItems: number;
  totalAmount: number;
  /** Signed contract value, to show the benchmark as a share of it (it may be lower: it is an internal limit). */
  contractAmount?: number;
  /** The Master Materials List already exists (it was copied from this benchmark). */
  materialsGenerated?: boolean;
  /** Saved benchmark-line → BOQ-item links (line id → "code · description"). */
  boqLinks?: Record<string, string>;
}) {
  const linkedCount = items.filter(item => item.id && boqLinks[item.id]).length;
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const [benchmarkFiles, setBenchmarkFiles] = useState<File[]>([]);
  // Confirmation is asked on the page itself. The browser's confirm() popup is not shown in every browser (in the app's
  // built-in browser it returns "Cancel" instantly), which made Delete and Lock silently do nothing.
  const [confirming, setConfirming] = useState<'delete' | 'lock' | null>(null);
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<'all' | 'unlinked'>('all');

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setIsUploading(true);
    setError('');
    try {
      const formData = new FormData(form);
      formData.append('projectId', projectId);
      await uploadProcurementBenchmark(formData);
      form.reset(); setBenchmarkFiles([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'The file could not be uploaded. Check that it is an Excel file and try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleLock = async () => {
    setConfirming(null); setIsLocking(true); setError('');
    try {
      await lockProcurementBenchmark(projectId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'The benchmark could not be locked.');
    } finally {
      setIsLocking(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    setConfirming(null); setIsDeleting(true); setError('');
    try {
      await deleteProcurementBenchmark(projectId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'The benchmark could not be deleted. Refresh the page and try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(item => (show === 'all' || !(item.id && boqLinks[item.id]))
      && words.every(word => `${item.itemCode || ''} ${item.description} ${item.unit || ''}`.toLowerCase().includes(word)));
  }, [items, query, show, boqLinks]);
  const visibleTotal = visible.reduce((sum, item) => sum + (item.totalCost || 0), 0);

  const errorBox = error && <div role="alert" className={styles.error}>{error}</div>;

  if (items.length === 0) {
    return (
      // Same upload as the BOQ Workspace: drop or choose the file, then upload.
      <form onSubmit={handleUpload} aria-label="Upload the procurement benchmark">
        {errorBox}
        <UploadDropzone prompt="Drop the benchmark file here" hint="Excel (.xlsx or .xls)" accept=".xlsx,.xls" name="benchmarkFile"
          inputLabel="Choose the benchmark file" files={benchmarkFiles} onFiles={setBenchmarkFiles} disabled={isUploading} status="ready to upload"
          action={<button type="submit" className={styles.cta} disabled={isUploading || !benchmarkFiles.length}>{isUploading ? 'Reading the file…' : 'Upload benchmark'}</button>} />
      </form>
    );
  }

  const share = contractAmount > 0 ? totalAmount / contractAmount * 100 : null;
  const aboveContract = share !== null && totalAmount > contractAmount + 0.005;

  return (
    <div>
      {errorBox}
      <div className={styles.figures}>
        <div className={styles.figure}><span className={styles.figureLabel}>Benchmark lines</span><span className={styles.figureValue}>{totalItems.toLocaleString()}</span></div>
        <div className={styles.figure}><span className={styles.figureLabel}>Benchmark total</span><span className={styles.figureValue} title={peso(totalAmount)}>{peso(totalAmount)}</span>
          {share !== null && <span className={`${styles.figureNote} ${aboveContract ? styles.warn : ''}`}>{aboveContract ? `Above the contract value (${share.toFixed(1)}%). Check the budget.` : `${share.toFixed(1)}% of the contract value. Lower is expected: this is an internal limit.`}</span>}
        </div>
        <div className={styles.figure}><span className={styles.figureLabel}>Linked to a BOQ item</span><span className={styles.figureValue}>{linkedCount} of {totalItems}</span>
          <span className={styles.figureNote}>{linkedCount === totalItems ? 'Every line is linked.' : <a href="#ai-check-benchmark" style={{ color: 'var(--accent-color)' }}>Link them with the AI Check ↓</a>}</span></div>
        <div className={styles.figure}><span className={styles.figureLabel}>Status</span>
          <span className={styles.figureValue}><span className={`${styles.status} ${isLocked ? styles.statusLocked : styles.statusDraft}`}>{isLocked ? '🔒 Locked' : 'Draft · not locked'}</span></span>
          <span className={styles.figureNote}>{isLocked ? (materialsGenerated ? 'The materials list was generated from it.' : 'Ready to generate the materials list.') : 'Check the lines, then lock.'}</span></div>
      </div>

      <div id="benchmark-actions" className={styles.bar}>
        <div>
          <h3 className={styles.barTitle}>Procurement Benchmark</h3>
          <p className={styles.barNote}>{isLocked
            ? 'Locked. The Master Materials List copies these lines and keeps them in step with this benchmark.'
            : 'Correct lines here, not in the materials list: the list is copied from this benchmark.'}</p>
        </div>
        <div className={styles.actions}>
          {!isLocked && <>
            <button type="button" className={styles.danger} onClick={() => { setConfirming('delete'); setError(''); }} disabled={isDeleting || isLocking}>{isDeleting ? 'Deleting…' : 'Delete and re-upload'}</button>
            <button type="button" className={styles.cta} onClick={() => { setConfirming('lock'); setError(''); }} disabled={isLocking || isDeleting}>{isLocking ? 'Locking…' : 'Lock benchmark'}</button>
          </>}
          {/* When locked, the progress card above already links to the next step. */}
          {isLocked && <Link className={styles.ghost} href={`/projects/${projectId}?tab=consolidation`}>Master Materials List</Link>}
        </div>
      </div>

      {confirming && !isLocked && (
        <div role="alertdialog" aria-labelledby="benchmark-confirm-text" className={`${styles.confirm} ${confirming === 'delete' ? styles.confirmDanger : styles.confirmGo}`}>
          <span id="benchmark-confirm-text" style={{ flex: '1 1 320px' }}>
            {confirming === 'delete'
              ? <><strong>Delete all {totalItems} benchmark lines?</strong> This cannot be undone. You can upload the file again afterwards.</>
              : <><strong>Lock the procurement benchmark?</strong> Lines can no longer be changed here. The Master Materials List can then be generated from it.</>}
          </span>
          <span className={styles.actions}>
            <button type="button" className={styles.ghost} onClick={() => setConfirming(null)} autoFocus>Cancel</button>
            {confirming === 'delete'
              ? <button type="button" className={styles.danger} onClick={() => void handleDelete()}>Yes, delete {totalItems} lines</button>
              : <button type="button" className={styles.cta} onClick={() => void handleLock()}>Yes, lock benchmark</button>}
          </span>
        </div>
      )}

      <BenchmarkAiCheck projectId={projectId} editable={!isLocked} />

      <div className={styles.filters}>
        <input type="search" className={styles.search} placeholder="Search code, description or unit" aria-label="Search benchmark lines" value={query} onChange={event => setQuery(event.target.value)} />
        <span className={styles.segment} role="group" aria-label="Which lines to show">
          <button type="button" aria-pressed={show === 'all'} onClick={() => setShow('all')}>All lines</button>
          <button type="button" aria-pressed={show === 'unlinked'} onClick={() => setShow('unlinked')}>Not linked to BOQ ({totalItems - linkedCount})</button>
        </span>
        <span className={styles.count} aria-live="polite">{visible.length === items.length ? `${items.length} lines` : `${visible.length} of ${items.length} lines · ${peso(visibleTotal)}`}</span>
      </div>

      <div className="table-scroll-container" style={{ overflow: 'auto', maxHeight: '600px', border: '1px solid #ccc', borderRadius: '8px 8px 0 0', isolation: 'isolate' }}>
        <style dangerouslySetInnerHTML={{__html: `
          .excel-table-wrapper table { border-collapse: separate; border-spacing: 0; width: 100%; color: #000; font-size: 0.85rem; background: #fff; table-layout: auto; }
          .excel-table-wrapper td, .excel-table-wrapper th { border-bottom: 1px solid #e5e5e5; padding: 8px 10px; white-space: normal; word-wrap: break-word; vertical-align: top; }
          .excel-table-wrapper th { position: sticky; top: 0; background: #eef0f2; font-weight: bold; z-index: 2; color: #000; text-align: left; border-bottom: 2px solid #ccc; }
          .excel-table-wrapper .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
          .excel-table-wrapper tr:hover td { background: #f7fbfc; }
        `}} />
        <div className="excel-table-wrapper">
          <table>
            <thead>
              <tr>
                <th style={{ width: '1%', whiteSpace: 'nowrap', maxWidth: 140 }}>Code</th>
                <th style={{ minWidth: 280 }}>Description</th>
                <th className="num" style={{ width: '1%' }}>Qty</th>
                <th style={{ width: '1%' }}>Unit</th>
                <th className="num" style={{ width: '1%' }}>Unit cost</th>
                <th className="num" style={{ width: '1%' }}>Total</th>
                <th style={{ width: '22%', minWidth: 180 }}>BOQ item</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item, index) => (
                <tr key={item.id || index}>
                  {/* Short codes stay on one line; some files put text in the code column, so long values wrap. */}
                  <td style={{ whiteSpace: (item.itemCode || '').length > 14 ? 'normal' : 'nowrap', maxWidth: 140, overflowWrap: 'anywhere' }}>{item.itemCode || '—'}</td>
                  <td style={{ fontWeight: 500 }}>{item.description}</td>
                  <td className="num">{item.quantity?.toLocaleString()}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{item.unit}</td>
                  <td className="num">{money(item.unitCost)}</td>
                  <td className="num" style={{ fontWeight: 'bold' }}>{money(item.totalCost)}</td>
                  <td style={{ color: item.id && boqLinks[item.id] ? '#000' : '#888' }}>{(item.id && boqLinks[item.id]) || 'Not linked'}</td>
                </tr>
              ))}
              {!visible.length && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#666', padding: 24 }}>No lines match. Clear the search or show all lines.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {/* Total kept outside the scroll area so it is always visible. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, padding: '12px 16px', background: '#e0e0e0', color: '#000', border: '1px solid #ccc', borderTop: 0, borderRadius: '0 0 8px 8px', fontWeight: 'bold' }}>
        {visible.length !== items.length && <span style={{ fontWeight: 500 }}>Shown: {peso(visibleTotal)}</span>}
        <span>Benchmark total: <span style={{ color: '#0f766e' }}>{peso(totalAmount)}</span></span>
      </div>
    </div>
  );
}
