import React from 'react';
import { getJobOrderById } from '@/app/actions/jobOrderActions';
import { prisma } from '@/lib/prisma';
import JobOrderFormClient from '../../create/JobOrderFormClient';
import Link from 'next/link';

export default async function EditJobOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const [joRes, projects, subcontractors] = await Promise.all([
    getJobOrderById(id),
    prisma.project.findMany({ select: { id: true, name: true, contractNumber: true } }),
    prisma.subcontractor.findMany({ select: { id: true, name: true, specialization: true } })
  ]);

  if (!joRes.success || !joRes.data) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ color: '#b91c1c' }}>Job Order Not Found</h2>
        <p>The Job Order you are trying to edit does not exist.</p>
        <Link href="/job-orders/dashboard">
          <button style={{ padding: '8px 16px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '12px' }}>Return to Dashboard</button>
        </Link>
      </div>
    );
  }

  const initialData = joRes.data;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', color: '#111827', margin: 0 }}>Edit Job Order</h1>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0' }}>Modifying Job Order: {initialData.jobNumber}</p>
        </div>
        <Link href="/job-orders/dashboard">
          <button style={{ padding: '8px 16px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            Back to Dashboard
          </button>
        </Link>
      </div>

      {initialData.subcontractAccomplishments?.some((a: any) => a.status === 'APPROVED') || 
       initialData.subcontractBillings?.some((b: any) => b.status === 'APPROVED_FOR_PAYMENT' || b.paymentStatus === 'PAID') ? (
        <div style={{ padding: '24px', backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', color: '#92400e', marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔒</span> Job Order Locked
          </h3>
          <p style={{ margin: 0 }}>
            This Job Order can no longer be edited because progress accomplishments or payment billings have already been processed against it.
          </p>
        </div>
      ) : (
        <JobOrderFormClient 
          projects={projects} 
          subcontractors={subcontractors} 
          initialData={initialData} 
        />
      )}
    </div>
  );
}
