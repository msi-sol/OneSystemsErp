'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { updateSubcontractor, deleteSubcontractor } from '@/app/actions/subcontractingActions';
import { subcontractorTrade } from '@/lib/subcontracting/subcontractor-trade';

export default function SubcontractorListClient({ initialData }: { initialData: any[] }) {
  const [subcontractors, setSubcontractors] = useState(initialData);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    setLoadingId(id);
    await updateSubcontractor(id, { accreditation: newStatus });
    setSubcontractors(prev => prev.map(s => s.id === id ? { ...s, accreditation: newStatus } : s));
    setLoadingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this subcontractor?")) return;
    setLoadingId(id);
    const res = await deleteSubcontractor(id);
    if (res.success) {
      setSubcontractors(prev => prev.filter(s => s.id !== id));
    } else {
      alert("Failed to delete subcontractor");
    }
    setLoadingId(null);
  };

  return (
    <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', color: '#000' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '15px' }}>
        <Link href="/subcontracting/subcontractors/create" style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', textDecoration: 'none', fontWeight: 'bold' }}>
          + Add Subcontractor
        </Link>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
            <th style={{ padding: '12px' }}>Name</th>
            <th style={{ padding: '12px' }}>Trade Category</th>
            <th style={{ padding: '12px' }}>Contact</th>
            <th style={{ padding: '12px' }}>Accreditation</th>
            <th style={{ padding: '12px' }}>Status</th>
            <th style={{ padding: '12px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {subcontractors.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                No subcontractors found.
              </td>
            </tr>
          ) : (
            subcontractors.map((sub: any) => (
              <tr key={sub.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px' }}>
                  <strong>{sub.name}</strong>
                  {sub.businessName && <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{sub.businessName}</div>}
                </td>
                <td style={{ padding: '12px' }}>{subcontractorTrade(sub) || 'N/A'}</td>
                <td style={{ padding: '12px' }}>
                  {sub.contactPerson} <br />
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{sub.contactNumber}</span>
                </td>
                <td style={{ padding: '12px' }}>
                  <select 
                    value={sub.accreditation}
                    disabled={loadingId === sub.id}
                    onChange={(e) => handleUpdateStatus(sub.id, e.target.value)}
                    style={{ 
                      padding: '6px 12px', 
                      borderRadius: '4px', 
                      border: '1px solid #d1d5db',
                      cursor: loadingId === sub.id ? 'wait' : 'pointer',
                      backgroundColor: sub.accreditation === 'APPROVED' ? '#dcfce7' : sub.accreditation === 'PENDING' ? '#fef9c3' : '#fee2e2',
                      color: sub.accreditation === 'APPROVED' ? '#166534' : sub.accreditation === 'PENDING' ? '#854d0e' : '#991b1b',
                      fontWeight: 'bold'
                    }}
                  >
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="SUSPENDED">Suspended</option>
                    <option value="BLACKLISTED">Blacklisted</option>
                  </select>
                </td>
                <td style={{ padding: '12px' }}>
                  <span style={{ padding: '4px 8px', borderRadius: '9999px', fontSize: '0.75rem', backgroundColor: sub.blacklistStatus === 'CLEAR' ? '#d1fae5' : '#fee2e2', color: sub.blacklistStatus === 'CLEAR' ? '#065f46' : '#991b1b' }}>
                    {sub.blacklistStatus}
                  </span>
                </td>
                <td style={{ padding: '12px', display: 'flex', gap: '8px' }}>
                  <Link href={`/subcontracting/subcontractors/${sub.id}/edit`} style={{ padding: '4px 8px', backgroundColor: '#e5e7eb', color: '#374151', textDecoration: 'none', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.875rem' }}>
                    Edit / View
                  </Link>
                  <button 
                    onClick={() => handleDelete(sub.id)}
                    disabled={loadingId === sub.id}
                    style={{ padding: '4px 8px', backgroundColor: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '4px', cursor: loadingId === sub.id ? 'wait' : 'pointer', fontSize: '0.875rem' }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
