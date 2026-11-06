'use client';

import { useState } from 'react';
import Link from 'next/link';
import { uploadProcurementBenchmark, lockProcurementBenchmark, deleteProcurementBenchmark } from '@/app/actions/mutations';

export default function ProcurementBenchmarkTab({ 
  projectId, 
  isLocked,
  items,
  totalItems,
  totalAmount
}: { 
  projectId: string;
  isLocked: boolean;
  items: any[];
  totalItems: number;
  totalAmount: number;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [error, setError] = useState('');

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsUploading(true);
    setError('');
    
    try {
      const formData = new FormData(e.currentTarget);
      formData.append('projectId', projectId);
      await uploadProcurementBenchmark(formData);
      (e.target as HTMLFormElement).reset();
    } catch (err: any) {
      setError(err.message || 'Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleLock = async () => {
    if (confirm('Are you sure you want to lock the Procurement Benchmark? This will allow you to generate the Master Materials List via AI auto-consolidation.')) {
      setIsLocking(true);
      try {
        await lockProcurementBenchmark(projectId);
      } catch (err: any) {
        alert(err.message || 'Failed to lock benchmark');
      } finally {
        setIsLocking(false);
      }
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this Procurement Benchmark? This action cannot be undone.')) {
      try {
        await deleteProcurementBenchmark(projectId);
      } catch (err: any) {
        alert(err.message || 'Failed to delete benchmark');
      }
    }
  };

  if (items.length === 0) {
    return (
      <div style={{ padding: '40px', border: '1px solid var(--glass-border)', borderRadius: '12px', background: 'rgba(0, 0, 0, 0.2)', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ marginBottom: '20px', padding: '14px 16px', border: '1px solid rgba(125, 211, 252, 0.35)', borderRadius: '10px', background: 'rgba(14, 116, 144, 0.12)' }}>
          <strong style={{ display: 'block', marginBottom: '5px' }}>Use the benchmark review workflow</strong>
          <span style={{ color: 'var(--text-secondary)' }}>Analyze the source, map rows to BOQ items and work packages, then review and approve benchmark limits.</span>
          <Link href={`/projects/${projectId}/benchmark`} style={{ display: 'inline-block', marginTop: '9px', color: '#7dd3fc', fontWeight: 700 }}>Open benchmark review →</Link>
        </div>
        <h3 style={{ marginBottom: '15px' }}>Upload Procurement Benchmark (Forecast BOQ)</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>
          Please upload the Excel file (.xlsx) containing the Procurement Benchmark. This file will be parsed and stored. Once locked, it can be used to generate the Master Materials List.
        </p>

        {error && <div style={{ color: '#ef4444', marginBottom: '20px', padding: '10px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px' }}>{error}</div>}

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
      <div style={{ marginBottom: '18px', padding: '14px 16px', border: '1px solid rgba(125, 211, 252, 0.35)', borderRadius: '10px', background: 'rgba(14, 116, 144, 0.12)' }}>
        <strong style={{ display: 'block', marginBottom: '5px' }}>Use the benchmark review workflow</strong>
        <span style={{ color: 'var(--text-secondary)' }}>Analyze the source, map rows to BOQ items and work packages, then review and approve benchmark limits.</span>{' '}
        <Link href={`/projects/${projectId}/benchmark`} style={{ display: 'inline-block', marginTop: '9px', color: '#7dd3fc', fontWeight: 700 }}>Open benchmark review →</Link>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3>Procurement Benchmark (Forecast BOQ)</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Total Items: {totalItems} | Total Amount: ₱{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        
        {!isLocked && (
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Please review the uploaded items below.</span>
            <button 
              onClick={handleDelete}
              className="btn-primary"
              style={{ backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff' }}
            >
              Delete Benchmark
            </button>
            <button 
              onClick={handleLock}
              disabled={isLocking}
              className="btn-primary"
              style={{ backgroundColor: '#00cc66', borderColor: '#00cc66' }}
            >
              {isLocking ? 'Locking...' : 'Lock Procurement Benchmark'}
            </button>
          </div>
        )}
        
        {isLocked && (
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
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
            <button 
              onClick={() => {
                if(confirm("This benchmark is locked. Are you absolutely sure you want to delete it? This might affect existing records.")){ 
                  handleDelete(); 
                }
              }}
              className="btn-primary"
              style={{ backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#fff', padding: '6px 12px', fontSize: '0.85rem' }}
            >
              Delete
            </button>
          </div>
        )}
      </div>

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
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '30px' }}>
                    No items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
