import { verifySession } from '@/lib/dal/auth';
import React from 'react';
import { getSubcontractPackageById } from '@/app/actions/subcontractingActions';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import PackageWorkflowControls from './PackageWorkflowControls';

export default async function ViewSubcontractPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pkg = await getSubcontractPackageById(id);

  if (!pkg) {
    notFound();
  }

  // Check auth and role for unlocking packages
  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  let canDelete = false;
  // The workflow controls enable each approval step by role; without it every step button was disabled.
  let currentRole = '';
  if (sessionId) {
    const user = await prisma.user.findUnique({
      where: { id: sessionId },
      include: { userRoles: { include: { role: true } } }
    });
    currentRole = cookieStore.get('simulatedRole')?.value || user?.role || '';
    const hasCompletedPayments = pkg.billings?.some((b: any) => ['APPROVED_FOR_PAYMENT', 'PAID'].includes(b.status)) || false;
    
    if (hasCompletedPayments) {
      // Only Project Director or System Admin can delete
      canDelete = user?.email === 'pd@gmail.com' ||
        user?.role === 'PROJECT_DIRECTOR' ||
        user?.role === 'SUPER_ADMIN' ||
        user?.userRoles?.some(ur => ['SUPER_ADMIN', 'PROJECT_DIRECTOR'].includes(ur.role.roleCode)) || false;
    } else {
      // Project Manager can also delete
      canDelete = user?.email === 'pd@gmail.com' ||
        user?.role === 'PROJECT_DIRECTOR' ||
        user?.role === 'PROJECT_MANAGER' ||
        user?.role === 'SUPER_ADMIN' ||
        user?.userRoles?.some(ur => ['SUPER_ADMIN', 'PROJECT_DIRECTOR', 'PROJECT_MANAGER'].includes(ur.role.roleCode)) || false;
    }
  }

  // Find the Program of Works
  const pow = pkg.programOfWorks && pkg.programOfWorks.length > 0 ? pkg.programOfWorks[0] : null;
  // Get BOQ Items
  const boqItems = pkg.subcontractor?.subcontractorBOQItems || [];

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px', color: '#111827' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '12px', color: '#ffffff' }}>
            {pkg.packageNumber} 
            <span style={{ 
              fontSize: '0.9rem', 
              padding: '4px 12px', 
              borderRadius: '999px', 
              backgroundColor: pkg.status === 'APPROVED' ? '#d1fae5' : '#fef3c7',
              color: pkg.status === 'APPROVED' ? '#065f46' : '#92400e',
              verticalAlign: 'middle'
            }}>
              {pkg.status}
            </span>
          </h1>
          <p style={{ color: '#9ca3af', margin: '8px 0 0 0' }}>Subcontract Details</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link href="/subcontracting/dashboard" style={{ padding: '8px 16px', backgroundColor: '#f3f4f6', color: '#374151', borderRadius: '6px', textDecoration: 'none', fontWeight: '500', border: '1px solid #d1d5db' }}>
            Back to Hub
          </Link>
          {(pkg as any).isLocked ? (
            <span style={{ 
              padding: '8px 16px', 
              backgroundColor: '#334155', 
              color: '#94a3b8', 
              borderRadius: '6px', 
              fontWeight: '500', 
              border: '1px solid #475569',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'not-allowed'
            }}>
              🔒 Locked
            </span>
          ) : (
            <Link href={`/subcontracting/packages/${id}/edit`} style={{ padding: '8px 16px', backgroundColor: '#3b82f6', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontWeight: '500' }}>
              Edit Package
            </Link>
          )}
        </div>
      </div>

      <PackageWorkflowControls packageId={id} currentStatus={pkg.status} isLocked={(pkg as any).isLocked} canDelete={canDelete} currentUser={{ role: currentRole }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>Core Information</h3>
          <div style={{ display: 'grid', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>Project</label>
              <div style={{ fontWeight: '500' }}>{pkg.project?.contractNumber} - {pkg.project?.name}</div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>Subcontractor</label>
              <div style={{ fontWeight: '500' }}>{pkg.subcontractor?.name}</div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>Work Category & Scope</label>
              <div style={{ fontWeight: '500' }}>{pkg.workCategory} - {pkg.contractType}</div>
              <div style={{ color: '#4b5563', marginTop: '4px' }}>{pkg.scopeOfWork}</div>
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>Financials & Schedule</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>Total Contract Amount</label>
              <div style={{ fontWeight: 'bold', fontSize: '1.25rem', color: '#059669' }}>
                ₱{pkg.contractAmount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>Start Date</label>
              <div style={{ fontWeight: '500' }}>{pkg.startDate ? new Date(pkg.startDate).toLocaleDateString() : 'N/A'}</div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>Target Completion</label>
              <div style={{ fontWeight: '500' }}>{pkg.targetCompletion ? new Date(pkg.targetCompletion).toLocaleDateString() : 'N/A'}</div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>Payment Terms</label>
              <div style={{ fontWeight: '500' }}>{pkg.paymentTerms}</div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>Cost Type</label>
              <div style={{ fontWeight: '500' }}>{pkg.costType}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '20px' }}>
        <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>Program of Works (Milestones)</h3>
          {pow ? (
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>{pow.title}</div>
              <div style={{ display: 'flex', gap: '20px', color: '#6b7280', marginBottom: '12px' }}>
                <span>From: {pow.startDate ? new Date(pow.startDate).toLocaleDateString() : 'N/A'}</span>
                <span>To: {pow.endDate ? new Date(pow.endDate).toLocaleDateString() : 'N/A'}</span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', color: '#374151' }}>{pow.description || 'No detailed milestones provided.'}</div>
            </div>
          ) : (
            <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No Program of Works established.</div>
          )}
        </div>

        <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px', marginBottom: '12px' }}>
            <h3 style={{ margin: 0 }}>Assigned BOQ Items</h3>
            <span style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '4px 12px', borderRadius: '16px', fontSize: '0.9rem', fontWeight: '500' }}>{boqItems.length} Items</span>
          </div>
          {boqItems.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Code</th>
                  <th style={{ padding: '12px', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Description</th>
                  <th style={{ padding: '12px', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Subcontractor Qty</th>
                  <th style={{ padding: '12px', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>Unit Cost</th>
                  <th style={{ padding: '12px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textAlign: 'right' }}>Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {boqItems.map((item: any) => (
                  <tr key={item.id}>
                    <td style={{ padding: '12px', borderBottom: '1px solid #f3f4f6', fontWeight: '500' }}>{item.awardedBoqItem?.itemCode}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #f3f4f6', color: '#4b5563' }}>{item.awardedBoqItem?.description}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #f3f4f6' }}>{item.quantity} {item.awardedBoqItem?.unit}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #f3f4f6' }}>₱{item.unitCost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #f3f4f6', textAlign: 'right', fontWeight: 'bold', color: '#059669' }}>
                      ₱{item.totalCost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ padding: '16px 12px', borderTop: '2px solid #e5e7eb', textAlign: 'right', fontWeight: 'bold', color: '#374151', fontSize: '1.05rem' }}>
                    Total Assigned BOQ Items:
                  </td>
                  <td style={{ padding: '16px 12px', borderTop: '2px solid #e5e7eb', textAlign: 'right', fontWeight: 'bold', color: '#059669', fontSize: '1.15rem' }}>
                    ₱{boqItems.reduce((sum: number, item: any) => sum + (item.totalCost || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div style={{ color: '#6b7280', fontStyle: 'italic', padding: '12px 0' }}>No BOQ items linked to this subcontractor.</div>
          )}
        </div>
      </div>
    </div>
  );
}
