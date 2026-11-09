'use client';

import React, { useState } from 'react';
import { createSubcontractor, updateSubcontractor } from '@/app/actions/subcontractingActions';
import { useRouter } from 'next/navigation';
import { subcontractorTrade } from '@/lib/subcontracting/subcontractor-trade';

export default function SubcontractorFormClient({ initialData, id }: { initialData?: any, id?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    businessName: initialData?.businessName || '',
    businessType: initialData?.businessType || 'CORPORATION',
    tradeCategory: subcontractorTrade(initialData) || initialData?.tradeCategory || 'General Works',
    address: initialData?.address || '',
    contactPerson: initialData?.contactPerson || '',
    contactNumber: initialData?.contactNumber || '',
    email: initialData?.email || '',
    tin: initialData?.tin || '',
    vatStatus: initialData?.vatStatus || 'VAT',
    pcabLicense: initialData?.pcabLicense || '',
    bankName: initialData?.bankName || '',
    bankAccountName: initialData?.bankAccountName || '',
    bankAccountNumber: initialData?.bankAccountNumber || '',
    gcashNumber: initialData?.gcashNumber || ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    let res;
    if (id) {
      res = await updateSubcontractor(id, formData);
    } else {
      res = await createSubcontractor(formData);
    }
    
    if (res.success) {
      router.push('/subcontracting/subcontractors');
    } else {
      setError(res.error || `Failed to ${id ? 'update' : 'register'} Subcontractor`);
    }
    setLoading(false);
  };

  return (
    <form className="form-wrapper" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px', color: '#111827' }}>
      <style>{`
        .form-wrapper input,
        .form-wrapper select,
        .form-wrapper textarea {
          background-color: #ffffff !important;
          color: #111827 !important;
          border: 1px solid #d1d5db !important;
        }
        .form-wrapper input:focus,
        .form-wrapper select:focus,
        .form-wrapper textarea:focus {
          border-color: #3b82f6 !important;
          outline: none !important;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2) !important;
        }
        .form-wrapper h3 {
          color: #111827 !important;
          text-shadow: none !important;
        }
        .form-wrapper label {
          color: #374151 !important;
        }
      `}</style>
      
      {error && <div style={{ padding: '12px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px' }}>{error}</div>}

      <div style={{ padding: '20px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb' }}>
        <h3 style={{ marginTop: 0, marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>Company Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '500' }}>Company / Subcontractor Name <span style={{ color: 'red' }}>*</span></label>
            <input type="text" name="name" value={formData.name} onChange={handleChange} required style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '500' }}>Registered Business Name</label>
            <input type="text" name="businessName" value={formData.businessName} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '500' }}>Business Type</label>
            <select name="businessType" value={formData.businessType} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }}>
              <option value="CORPORATION">Corporation</option>
              <option value="PARTNERSHIP">Partnership</option>
              <option value="SOLE_PROPRIATOR">Sole Proprietorship</option>
              <option value="INDIVIDUAL_CONTRACTOR">Individual / Freelance</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '500' }}>Primary Trade Category</label>
            <input type="text" name="tradeCategory" value={formData.tradeCategory} onChange={handleChange} placeholder="e.g. Painting, Electrical, Concreting" style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: 'span 2' }}>
            <label style={{ fontWeight: '500' }}>Business Address</label>
            <textarea name="address" value={formData.address} onChange={handleChange} rows={2} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db', resize: 'vertical' }}></textarea>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb' }}>
        <h3 style={{ marginTop: 0, marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>Contact & Legal Information</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '500' }}>Contact Person</label>
            <input type="text" name="contactPerson" value={formData.contactPerson} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '500' }}>Contact Number</label>
            <input type="text" name="contactNumber" value={formData.contactNumber} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '500' }}>Email Address</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '500' }}>TIN</label>
            <input type="text" name="tin" value={formData.tin} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '500' }}>VAT Status</label>
            <select name="vatStatus" value={formData.vatStatus} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }}>
              <option value="VAT">VAT Registered</option>
              <option value="NON_VAT">Non-VAT</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '500' }}>PCAB License (if applicable)</label>
            <input type="text" name="pcabLicense" value={formData.pcabLicense} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
          </div>
        </div>
      </div>

      <div style={{ padding: '20px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb' }}>
        <h3 style={{ marginTop: 0, marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>Financial / Payment Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '500' }}>Bank Name</label>
            <input type="text" name="bankName" value={formData.bankName} onChange={handleChange} placeholder="e.g. BDO, BPI" style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '500' }}>GCash Number</label>
            <input type="text" name="gcashNumber" value={formData.gcashNumber} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '500' }}>Bank Account Name</label>
            <input type="text" name="bankAccountName" value={formData.bankAccountName} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: '500' }}>Bank Account Number</label>
            <input type="text" name="bankAccountNumber" value={formData.bankAccountNumber} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginTop: '10px' }}>
        <button type="button" onClick={() => router.back()} style={{ padding: '12px 24px', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
          Cancel
        </button>
        <button type="submit" disabled={loading} style={{ padding: '12px 24px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Saving...' : id ? 'Update Subcontractor' : 'Register Subcontractor'}
        </button>
      </div>
    </form>
  );
}
