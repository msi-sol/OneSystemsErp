import React from 'react';
import JobOrderFormClient from './JobOrderFormClient';
import { prisma } from '@/lib/prisma';
import styles from '../../page.module.css';

export default async function CreateJobOrderPage() {
  const projects = await prisma.project.findMany({ select: { id: true, name: true, contractNumber: true } });
  const subcontractors = await prisma.subcontractor.findMany({ select: { id: true, name: true, specialization: true } });

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>Create Job Order</h1>
          <p>Create a short-form subcontract for limited, specific, short-duration works.</p>
        </div>
      </header>

      <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <JobOrderFormClient projects={projects} subcontractors={subcontractors} />
      </div>
    </div>
  );
}
