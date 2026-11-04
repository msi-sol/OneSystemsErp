// @ts-nocheck
import React from 'react';
import { getJobOrderById } from '@/app/actions/jobOrderActions';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/dal/auth';
import { hasPermission } from '@/lib/permissions';
import Link from 'next/link';
import JobOrderWorkflowControls from './JobOrderWorkflowControls';

export default async function ViewJobOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const joRes = await getJobOrderById(id);

  if (!joRes.success || !joRes.data) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ color: '#b91c1c' }}>Job Order Not Found</h2>
        <p>The Job Order you are trying to view does not exist or has been deleted.</p>
        <Link href="/job-orders/dashboard">
          <button style={{ padding: '8px 16px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '12px' }}>Return to Dashboard</button>
        </Link>
      </div>
    );
  }

  const jo = joRes.data;
  const session = await verifySession();
  const canUnlock = session?.id ? await hasPermission(session.id, 'SUBCONTRACTING', 'canUnlockWithAuthorization') : false;

  // Fetch actual BOQ item details for the IDs
  let boqItems: any[] = [];
  const actualIds = jo.boqReferenceIds?.filter((id: string) => id !== '1_LOT' && id !== 'ADDITIONAL_WORKS') || [];
  if (actualIds.length > 0) {
    boqItems = await prisma.consolidatedBOQItem.findMany({
      where: { id: { in: actualIds } },
      select: { id: true, itemCode: true, description: true, category: true }
    });
  }

  const getBoqLabel = (ref: string) => {
    if (ref === '1_LOT') return '1 Lot (Lump Sum Works)';
    if (ref === 'ADDITIONAL_WORKS') return 'Management Approved Additional Works';
    const found = boqItems.find(item => item.id === ref);
    if (found) {
      const categoryTag = found.category ? `[${found.category}] ` : '';
      return `${categoryTag}${found.itemCode} - ${found.description}`;
    }
    return ref;
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px', color: '#111827' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', color: '#111827', margin: 0 }}>Job Order Details: {jo.jobNumber}</h1>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0' }}>{jo.project?.name} - {jo.subcontractor?.name}</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link href={`/job-orders/${id}/edit`}>
            <button style={{ padding: '8px 16px', backgroundColor: '#fef3c7', color: '#d97706', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              Edit Job Order
            </button>
          </Link>
          <Link href="/job-orders/dashboard">
            <button style={{ padding: '8px 16px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              Back to Dashboard
            </button>
          </Link>
        </div>
      </div>

      <JobOrderWorkflowControls 
        jobOrderId={jo.id} 
        currentStatus={jo.status} 
        isLocked={jo.status === 'APPROVED' || jo.status === 'ISSUED'} 
        canUnlock={canUnlock} 
      />

      <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h4 style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem', textTransform: 'uppercase' }}>Project</h4>
            <div style={{ fontSize: '1.1rem', fontWeight: '500' }}>{jo.project?.contractNumber} - {jo.project?.name}</div>
          </div>
          <div>
            <h4 style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem', textTransform: 'uppercase' }}>Subcontractor</h4>
            <div style={{ fontSize: '1.1rem', fontWeight: '500' }}>{jo.subcontractor?.name}</div>
          </div>
          <div>
            <h4 style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem', textTransform: 'uppercase' }}>Location</h4>
            <div style={{ fontSize: '1.1rem', fontWeight: '500' }}>{jo.location}</div>
          </div>
          <div>
            <h4 style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem', textTransform: 'uppercase' }}>Job Order Type</h4>
            <div style={{ fontSize: '1.1rem', fontWeight: '500' }}>{jo.jobOrderType?.replace(/_/g, ' ')}</div>
          </div>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h4 style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem', textTransform: 'uppercase' }}>Contract Amount</h4>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#059669' }}>
              ₱{jo.contractAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            {jo.isThresholdExceeded && (
              <div style={{ color: '#b91c1c', fontSize: '0.85rem', marginTop: '4px', backgroundColor: '#fee2e2', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' }}>
                ⚠️ Exceeds Standard Threshold
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <h4 style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem', textTransform: 'uppercase' }}>Start Date</h4>
              <div style={{ fontSize: '1.1rem', fontWeight: '500' }}>{jo.startDate ? new Date(jo.startDate).toLocaleDateString() : 'N/A'}</div>
            </div>
            <div>
              <h4 style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem', textTransform: 'uppercase' }}>Completion Date</h4>
              <div style={{ fontSize: '1.1rem', fontWeight: '500' }}>{jo.completionDate ? new Date(jo.completionDate).toLocaleDateString() : 'N/A'}</div>
            </div>
          </div>
          <div>
            <h4 style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem', textTransform: 'uppercase' }}>Material Responsibility</h4>
            <div style={{ fontSize: '1.1rem', fontWeight: '500' }}>{jo.materialResponsibility?.replace(/_/g, ' ')}</div>
          </div>
        </div>

        {/* Full Width */}
        <div style={{ gridColumn: '1 / -1', marginTop: '8px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
          <h4 style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '8px' }}>Scope of Work / Description</h4>
          <p style={{ margin: 0, fontSize: '1rem', lineHeight: '1.6', color: '#374151', whiteSpace: 'pre-wrap', backgroundColor: '#f9fafb', padding: '16px', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
            {jo.description}
          </p>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <h4 style={{ margin: 0, color: '#6b7280', fontSize: '0.85rem', textTransform: 'uppercase', marginBottom: '8px' }}>BOQ References ({jo.boqReferenceIds?.length || 0})</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {jo.boqReferenceIds?.map((ref: string) => (
              <span key={ref} style={{ backgroundColor: '#dbeafe', color: '#1e40af', padding: '6px 14px', borderRadius: '16px', fontSize: '0.9rem', fontWeight: '500', border: '1px solid #bfdbfe' }}>
                {getBoqLabel(ref)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
