// @ts-nocheck
import React from 'react';
import { getSubcontractPackageById } from '@/app/actions/subcontractingActions';
import { prisma } from '@/lib/prisma';
import UnifiedSubcontractWizard from '../../../create/UnifiedSubcontractWizard';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function EditSubcontractPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  // Fetch required reference data for the wizard
  const [projects, subcontractors, initialData] = await Promise.all([
    prisma.project.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, contractNumber: true }
    }),
    prisma.subcontractor.findMany({
      select: { id: true, name: true, specialization: true }
    }),
    getSubcontractPackageById(id)
  ]);

  if (!initialData) {
    notFound();
  }

  if (initialData.isLocked) {
    return (
      <div style={{ maxWidth: '600px', margin: '100px auto', padding: '40px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', color: '#f8fafc', textAlign: 'center', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)' }}>
        <h2 style={{ color: '#ef4444', marginBottom: '16px', fontSize: '1.5rem', fontWeight: 'bold' }}>🔒 Subcontract Package Locked</h2>
        <p style={{ color: '#94a3b8', marginBottom: '24px', lineHeight: '1.6' }}>
          This package (<strong style={{ color: '#38bdf8' }}>{initialData.packageNumber}</strong>) is approved and has been locked to prevent unauthorized changes.
        </p>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '24px', lineHeight: '1.6' }}>
          To edit this package, please request a Project Manager or Project Director to unlock it from the package details view.
        </p>
        <Link href={`/subcontracting/packages/${id}`} style={{ display: 'inline-block', padding: '12px 28px', backgroundColor: '#0284c7', color: '#fff', textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold', transition: 'background-color 0.2s' }}>
          Return to Package Details
        </Link>
      </div>
    );
  }

  // Inject IDs to populate the initial state correctly
  const populatedInitialData = {
    ...initialData,
    projectId: initialData.projectId,
    subcontractorId: initialData.subcontractorId
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <header style={{ marginBottom: '30px' }}>
        <h1 style={{ fontSize: '2rem', color: '#ffffff', margin: 0 }}>Edit Subcontract Package</h1>
        <p style={{ color: '#9ca3af', marginTop: '8px' }}>Update package details, re-assign BOQ items, or modify the Program of Works.</p>
      </header>
      
      <UnifiedSubcontractWizard 
        projects={projects} 
        subcontractors={subcontractors} 
        initialData={populatedInitialData}
        isEdit={true}
      />
    </div>
  );
}
