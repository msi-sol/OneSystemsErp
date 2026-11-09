import React from 'react';
import { prisma } from '@/lib/prisma';
import UnifiedSubcontractWizard from './UnifiedSubcontractWizard';

export default async function CreateSubcontractPage() {
  // Fetch required reference data for the wizard
  const [projects, subcontractors] = await Promise.all([
    prisma.project.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, contractNumber: true }
    }),
    prisma.subcontractor.findMany({
      select: { id: true, name: true, specialization: true }
    })
  ]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <header style={{ marginBottom: '30px' }}>
        <h1 style={{ fontSize: '2rem', color: '#ffffff', margin: 0 }}>Create Subcontract Hub</h1>
        <p style={{ color: '#9ca3af', marginTop: '8px' }}>Unified wizard for creating the Subcontract Package, assigning BOQ, and setting up the Program of Works.</p>
      </header>
      
      <UnifiedSubcontractWizard 
        projects={projects} 
        subcontractors={subcontractors} 
      />
    </div>
  );
}
