'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadProcurementBenchmark, lockProcurementBenchmark, deleteProcurementBenchmark } from '@/app/actions/mutations';
import BenchmarkAiCheck from './BenchmarkAiCheck';

export default function ProcurementBenchmarkTab({
  projectId,
  isLocked,
  items,
  totalItems,
  totalAmount,
  boqLinks = {}
}: {
  projectId: string;
  isLocked: boolean;
  items: Array<{ id?: string; itemCode?: string | null; description: string; quantity?: number | null; unit?: string | null; unitCost?: number | null; totalCost?: number | null }>;
  totalItems: number;
  totalAmount: number;
  /** Saved benchmark-line → BOQ-item links (line id → "code · description"). */
  boqLinks?: Record<string, string>;
}) {
  const linkedCount = items.filter(item => item.id && boqLinks[item.id]).length;
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  // Confirmation is asked on the page itself. The browser's confirm() popup is not shown in every browser (in the app's
  // built-in browser it returns "Cancel" instantly), which made Delete and Lock silently do nothing.
  const [confirming, setConfirming] = useState<'delete' | 'lock' | null>(null);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setIsUploading(true);
    setError('');
    try {
      const formData = new FormData(form);
      formData.append('projectId', projectId);
      await uploadProcurementBenchmark(formData);
      form.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to upload file');
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
      setError(err instanceof Error && err.message ? err.message : 'Failed to lock benchmark');
    } finally {
      setIsLocking(false);
    }
  };

  // Shows progress and errors on the page (it used to give no feedback, and errors came as a browser alert).
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

  const errorBox = error && <div role="alert" style={{ color: '#fca5a5', marginBottom: '16px', padding: '10px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px' }}>{error}</div>;

  if (items.length === 0) {
    return (
      <div style={{ padding: '40px', border: '1px solid var(--glass-border)', borderRadius: '12px', background: 'rgba(0, 0, 0, 0.2)', maxWidth: '600px', margin: '0 auto' }}>
        <h3 style={{ marginBottom: '15px' }}>Upload Procurement Benchmark (Forecast BOQ)</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>
          Please upload the Excel file (.xlsx) containing the Procurement Benchmark. This file will be parsed and stored. Once locked, it can be used to generate the Master Materials List.
        </p>

        {errorBox}

        <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Benchmark Excel File</label>
            <input
              type="file"
              name="benchmarkFile"
              accept=".xlsx,.xls"
              required
              className="input-field"
              style={{ padding: '10px' }}
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={isUploading}
            style={{ padding: '12px', fontSize: '1rem' }}
          >
            {isUploading ? 'Uploading & Parsing...' : 'Upload Benchmark File'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      {errorBox}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h3>Procurement Benchmark (Forecast BOQ)</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Total Items: {totalItems} | Total Amount: ₱{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | Linked to BOQ: {linkedCount} of {totalItems}
          </p>
        </div>

        {!isLocked && (
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Please review the uploaded items below.</span>
            <button
              onClick={() => { setConfirming('delete'); setError(''); }}
              disabled={isDeleting || isLocking}
              className="btn-primary"
              style={{ backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff', opacity: isDeleting ? 0.7 : 1 }}
            >
              {isDeleting ? 'Deleting…' : 'Delete Benchmark'}
            </button>
            <button
              onClick={() => { setConfirming('lock'); setError(''); }}
              disabled={isLocking || isDeleting}
              className="btn-primary"
              style={{ backgroundColor: '#00cc66', borderColor: '#00cc66' }}
            >
              {isLocking ? 'Locking...' : 'Lock Procurement Benchmark'}
            </button>
          </div>
        )}

        {isLocked && (
          <span style={{
            backgroundColor: 'rgba(0, 255, 128, 0.1)',
            color: '#00ff80',
            padding: '6px 12px',
            borderRadius: '4px',
            fontWeight: 'bold',
            border: '1px solid rgba(0, 255, 128, 0.3)'
          }}>
            🔒 Benchmark Locked
          </span>
        )}
      </div>

      {confirming && !isLocked && (
        <div role="alertdialog" aria-labelledby="benchmark-confirm-text" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', justifyContent: 'space-between', marginBottom: '20px', padding: '14px 16px', borderRadius: '10px', border: `1px solid ${confirming === 'delete' ? 'rgba(239, 68, 68, 0.5)' : 'rgba(0, 204, 102, 0.5)'}`, background: confirming === 'delete' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0, 204, 102, 0.08)' }}>
          <span id="benchmark-confirm-text" style={{ flex: '1 1 320px' }}>
            {confirming === 'delete'
              ? <><strong>Delete all {totalItems} benchmark rows?</strong> This cannot be undone. You can upload the file again afterwards.</>
              : <><strong>Lock the Procurement Benchmark?</strong> This will allow you to generate the Master Materials List via AI auto-consolidation.</>}
          </span>
          <span style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn-secondary" onClick={() => setConfirming(null)} autoFocus>Cancel</button>
            {confirming === 'delete'
              ? <button type="button" className="btn-primary" onClick={() => void handleDelete()} style={{ backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }}>Yes, delete {totalItems} rows</button>
              : <button type="button" className="btn-primary" onClick={() => void handleLock()} style={{ backgroundColor: '#00cc66', borderColor: '#00cc66' }}>Yes, lock benchmark</button>}
          </span>
        </div>
      )}

      <BenchmarkAiCheck projectId={projectId} editable={!isLocked} />

      <div className="table-scroll-container" style={{ overflow: 'auto', maxHeight: '600px', border: '1px solid #ccc', borderRadius: '8px' }}>
        <style dangerouslySetInnerHTML={{__html: `
          .excel-table-wrapper table {
            border-collapse: separate;
            border-spacing: 0;
            width: 100%;
            color: #000;
            font-size: 0.85rem;
            background: #fff;
            table-layout: auto;
          }
          .excel-table-wrapper td, .excel-table-wrapper th {
            border: 1px solid #ccc;
            padding: 8px 10px;
            white-space: normal;
            word-wrap: break-word;
            vertical-align: top;
          }
          .excel-table-wrapper th {
            position: sticky;
            top: 0;
            background: #e0e0e0;
            font-weight: bold;
            z-index: 2;
            color: #000;
            text-align: left;
            box-shadow: 0 2px 2px rgba(0,0,0,0.1);
          }
        `}} />
        <div className="excel-table-wrapper">
          <table>
            <thead>
              <tr>
                <th style={{ width: '120px' }}>Item Code</th>
                <th>Description</th>
                <th style={{ textAlign: 'center', width: '80px' }}>Qty</th>
                <th style={{ textAlign: 'center', width: '80px' }}>Unit</th>
                <th style={{ textAlign: 'right', width: '150px' }}>Unit Cost</th>
                <th style={{ textAlign: 'right', width: '150px' }}>Total Cost</th>
                <th style={{ width: '220px' }}>BOQ Item</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id || index}>
                  <td>{item.itemCode || '-'}</td>
                  <td>
                    <div style={{ fontWeight: '500' }}>{item.description}</div>
                  </td>
                  <td style={{ textAlign: 'center' }}>{item.quantity?.toLocaleString()}</td>
                  <td style={{ textAlign: 'center' }}>{item.unit}</td>
                  <td style={{ textAlign: 'right' }}>{(item.unitCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{(item.totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td style={{ color: item.id && boqLinks[item.id] ? '#000' : '#888' }}>{(item.id && boqLinks[item.id]) || 'Not linked'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
