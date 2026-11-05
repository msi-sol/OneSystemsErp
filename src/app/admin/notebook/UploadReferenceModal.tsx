'use client';

import { useState } from 'react';
import { uploadReferenceFile } from '@/app/actions/notebook';

const CATEGORIES = [
  'Awarded BOQ Reference', 'Accomplishment Template', 'Billing Template',
  'Procurement Policy', 'Materials Request Policy', 'Purchase Order Policy',
  'Inventory Policy', 'Payroll Policy', 'DTR Policy', 'Company Policy',
  'AI Validation Criteria', 'Approval Matrix', 'Role Permission Matrix'
];

export default function UploadReferenceModal({ onClose }: { onClose: () => void, currentUser: any }) {
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    fileName: '',
    referenceCategory: CATEGORIES[0],
    moduleAssignment: '',
    projectAssignment: ''
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsUploading(true);
    try {
      const uploadData = new FormData(e.currentTarget);
      await uploadReferenceFile(uploadData);
      
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to upload reference.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'var(--bg-secondary)', padding: '30px', borderRadius: '16px',
        border: '1px solid var(--glass-border)', width: '100%', maxWidth: '500px',
      }}>
        <h2 style={{ margin: '0 0 10px 0', color: 'var(--text-primary)' }}>Upload AI Reference</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.9rem' }}>
          Upload a mandatory policy, template, or BOQ for the AI Validation Engine to index.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-primary)', fontSize: '0.9rem' }}>File Name</label>
            <input 
              required
              name="fileName"
              type="text" 
              value={formData.fileName}
              onChange={e => setFormData({...formData, fileName: e.target.value})}
              placeholder="e.g. 2026 Q3 Procurement Policy"
              style={{ width: '100%', padding: '10px', borderRadius: '8px', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-primary)', fontSize: '0.9rem' }}>Reference Category</label>
            <select 
              name="referenceCategory"
              value={formData.referenceCategory}
              onChange={e => setFormData({...formData, referenceCategory: e.target.value})}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-primary)', fontSize: '0.9rem' }}>Target Module (Optional)</label>
            <input 
              name="moduleAssignment"
              type="text" 
              value={formData.moduleAssignment}
              onChange={e => setFormData({...formData, moduleAssignment: e.target.value})}
              placeholder="e.g. Purchase Order"
              style={{ width: '100%', padding: '10px', borderRadius: '8px', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-primary)', fontSize: '0.9rem' }}>Select File (PDF/Excel)</label>
            <input 
              type="file" 
              name="file"
              required
              style={{ width: '100%', padding: '10px', borderRadius: '8px', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button type="button" onClick={onClose} disabled={isUploading}
              style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--glass-border)', backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={isUploading}
              style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: 'var(--accent-color)', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>
              {isUploading ? 'Uploading & Indexing...' : 'Upload Reference'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
