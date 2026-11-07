import { verifySession } from '@/lib/dal/auth';
import { prisma } from '@/lib/prisma';
import styles from '../../projects/page.module.css';
import React from 'react';
import Link from 'next/link';
import MRWorkflowButtons from './MRWorkflowButtons';
import { cookies } from 'next/headers';
import { getUserPermissions } from '@/lib/permissions';
import { materialQuantity } from '@/lib/procurement/material-values';
import Decimal from 'decimal.js';

export const dynamic = 'force-dynamic';

export default async function MaterialRequestDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const mr = await prisma.materialRequest.findUnique({
    where: { id },
    include: {
      project: true,
      requester: true,
      preparer: true,
      checker: true,
      approver: true,
      purchaseOrders: true,
      canvassForms: true,
      items: {
        include: {
          consolidatedBoqItem: true
        }
      }
    }
  });

  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  let currentUser = null;
  if (sessionId) {
    currentUser = await prisma.user.findUnique({ where: { id: sessionId }, select: { id: true, name: true, role: true } });
  }

  if (!mr) {
    return <div style={{ padding: '20px', color: 'red' }}>Material Request not found.</div>;
  }
  const permissions = currentUser ? await getUserPermissions(currentUser.id) : {};
  const actions = ['canEditDraft', 'canSubmit', 'canReview', 'canApprove', 'canReject', 'canReturnForCorrection', 'canCancel'];
  const capabilities = Object.fromEntries(actions.map(action => [action, Boolean(permissions.IS_ADMIN || permissions.MATERIALS_REQUEST?.[action])]));

  return (
    <div style={{ backgroundColor: '#f0f2f5', minHeight: '100vh', padding: '40px 20px', fontFamily: '"Arial", sans-serif' }}>
      
      {/* Workflow Controls (Outside the printable area) */}
      <div style={{ maxWidth: '1000px', margin: '0 auto 20px auto', backgroundColor: 'var(--bg-secondary)', padding: '20px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/material-requests" style={{ color: 'var(--accent-color)', textDecoration: 'none', fontWeight: 'bold' }}>&larr; Back to MRs</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
            <span className={`badge-${mr.status}`} style={{ fontWeight: 'bold', padding: '6px 12px', borderRadius: '20px', backgroundColor: 'var(--bg-dark)' }}>{mr.status.replace('_', ' ')}</span>
          </div>
        </div>
        <MRWorkflowButtons mrId={mr.id} status={mr.status} currentUser={currentUser} capabilities={capabilities} />
      </div>

      {/* Printable MRF Document */}
      <div style={{ 
        maxWidth: '1000px', margin: '0 auto', backgroundColor: '#ffffff', color: '#000000', 
        padding: '50px', borderRadius: '4px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
        position: 'relative'
      }}>
        
        {/* Company Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #1e3a8a', paddingBottom: '20px', marginBottom: '30px' }}>
          <div>
            <h1 style={{ margin: '0 0 5px 0', color: '#1e3a8a', fontSize: '24px', fontWeight: '900', letterSpacing: '1px' }}>JEJORS CONSTRUCTION CORPORATION</h1>
            <p style={{ margin: 0, fontSize: '14px', color: '#4b5563' }}>Engineering & Construction Services</p>
            <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: '#6b7280' }}>123 Main Street, Business District, Metro City</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h2 style={{ margin: '0 0 10px 0', fontSize: '22px', fontWeight: 'bold', color: '#111827' }}>MATERIAL REQUEST FORM</h2>
            <div style={{ border: '1px solid #d1d5db', padding: '10px', borderRadius: '4px', backgroundColor: '#f9fafb', display: 'inline-block', textAlign: 'left' }}>
              <div style={{ marginBottom: '5px' }}><strong>MRF No:</strong> {mr.mrNumber.startsWith('DRAFT') ? <span style={{ color: '#ef4444' }}>{mr.mrNumber}</span> : mr.mrNumber}</div>
              <div><strong>Date:</strong> {new Date(mr.createdAt).toLocaleDateString()}</div>
            </div>
          </div>
        </div>

        {/* AI Validation Stamp */}
        {mr.aiValidationRisk && (
          <div style={{ 
            marginBottom: '30px', padding: '15px', border: `2px dashed ${mr.aiValidationRisk === 'CRITICAL' || mr.aiValidationRisk === 'HIGH' ? '#ef4444' : mr.aiValidationRisk === 'MEDIUM' ? '#f59e0b' : '#10b981'}`,
            backgroundColor: '#f9fafb', borderRadius: '4px', display: 'flex', alignItems: 'flex-start', gap: '15px'
          }}>
            <div style={{ fontSize: '24px' }}>🤖</div>
            <div>
              <h4 style={{ margin: '0 0 5px 0', color: '#111827' }}>AI Validation System - Risk Level: <span style={{ color: mr.aiValidationRisk === 'CRITICAL' || mr.aiValidationRisk === 'HIGH' ? '#ef4444' : mr.aiValidationRisk === 'MEDIUM' ? '#f59e0b' : '#10b981' }}>{mr.aiValidationRisk}</span></h4>
              <p style={{ margin: 0, fontSize: '13px', color: '#4b5563', whiteSpace: 'pre-wrap' }}>{mr.aiValidationNotes}</p>
            </div>
          </div>
        )}

        {/* Project & Request Info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px', fontSize: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px' }}>
            <strong style={{ color: '#374151' }}>Project Name:</strong> <span>{mr.project.name}</span>
            <strong style={{ color: '#374151' }}>Location of Use:</strong> <span>{mr.locationOfUse || 'N/A'}</span>
            <strong style={{ color: '#374151' }}>Purpose:</strong> <span>{mr.purpose || 'N/A'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px' }}>
            <strong style={{ color: '#374151' }}>Priority:</strong> <span>{mr.priority}</span>
            <strong style={{ color: '#374151' }}>Date Needed:</strong> <span>{mr.dateNeeded ? new Date(mr.dateNeeded).toLocaleDateString() : 'N/A'}</span>
            <strong style={{ color: '#374151' }}>Remarks:</strong> <span>{mr.remarks || 'None'}</span>
          </div>
        </div>

        {/* Materials Table */}
        <h3 style={{ fontSize: '16px', borderBottom: '2px solid #e5e7eb', paddingBottom: '8px', marginBottom: '15px', color: '#111827' }}>Requested Materials</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f3f4f6' }}>
              <th style={{ padding: '10px', border: '1px solid #d1d5db', textAlign: 'center', width: '50px' }}>No.</th>
              <th style={{ padding: '10px', border: '1px solid #d1d5db', textAlign: 'left' }}>Item Code</th>
              <th style={{ padding: '10px', border: '1px solid #d1d5db', textAlign: 'left' }}>Description</th>
              <th style={{ padding: '10px', border: '1px solid #d1d5db', textAlign: 'center' }}>Unit</th>
              <th style={{ padding: '10px', border: '1px solid #d1d5db', textAlign: 'right' }}>Benchmark Balance</th>
              <th style={{ padding: '10px', border: '1px solid #d1d5db', textAlign: 'right', backgroundColor: '#e5e7eb', fontWeight: 'bold' }}>Requested Qty</th>
            </tr>
          </thead>
          <tbody>
            {mr.items.map((item, index) => {
              const boq = item.consolidatedBoqItem;
              const balance = Decimal.max(0, new Decimal(String(materialQuantity(boq))).minus(String(boq.deliveredQty))).toNumber();
              return (
                <React.Fragment key={item.id}>
                <tr>
                  <td style={{ padding: '8px', border: '1px solid #d1d5db', textAlign: 'center' }}>{index + 1}</td>
                  <td style={{ padding: '8px', border: '1px solid #d1d5db' }}>{boq.itemCode}</td>
                  <td style={{ padding: '8px', border: '1px solid #d1d5db' }}>{boq.description}</td>
                  <td style={{ padding: '8px', border: '1px solid #d1d5db', textAlign: 'center' }}>{boq.unit}</td>
                  <td style={{ padding: '8px', border: '1px solid #d1d5db', textAlign: 'right' }}>{balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td style={{ padding: '8px', border: '1px solid #d1d5db', textAlign: 'right', fontWeight: 'bold' }}>{item.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                </tr>
                {item.breakdownData && Array.isArray(item.breakdownData) && item.breakdownData.length > 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '10px 20px', backgroundColor: '#f9fafb', border: '1px solid #d1d5db' }}>
                      <div style={{ marginLeft: '40px', padding: '10px', backgroundColor: '#fff', border: '1px dashed #d1d5db', borderRadius: '4px' }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#1e3a8a' }}>Breakdown Details</h4>
                        <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#4b5563' }}>
                              <th style={{ textAlign: 'left', padding: '4px' }}>Description</th>
                              <th style={{ textAlign: 'right', padding: '4px' }}>Qty</th>
                              <th style={{ textAlign: 'center', padding: '4px' }}>Unit</th>
                              <th style={{ textAlign: 'right', padding: '4px' }}>Est. Unit Price</th>
                              <th style={{ textAlign: 'left', padding: '4px' }}>Supplier</th>
                              <th style={{ textAlign: 'center', padding: '4px' }}>VAT?</th>
                            </tr>
                          </thead>
                          <tbody>
                            {item.breakdownData.map((bd: any, idx: number) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '4px' }}>{bd.description}</td>
                                <td style={{ padding: '4px', textAlign: 'right' }}>{Number(bd.quantity).toLocaleString()}</td>
                                <td style={{ padding: '4px', textAlign: 'center' }}>{bd.unit}</td>
                                <td style={{ padding: '4px', textAlign: 'right' }}>₱{Number(bd.unitPrice).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                <td style={{ padding: '4px' }}>{bd.supplierName || '-'}</td>
                                <td style={{ padding: '4px', textAlign: 'center' }}>{bd.isVat ? 'Yes' : 'No'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {/* Signatures */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '60px' }}>
          
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #000', paddingBottom: '5px', marginBottom: '10px', minHeight: '30px', fontWeight: 'bold', color: '#1e3a8a' }}>
              {mr.requester?.name || '______________________'}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Requested By</div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>Materials Engineer</div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #000', paddingBottom: '5px', marginBottom: '10px', minHeight: '30px', fontWeight: 'bold', color: '#1e3a8a' }}>
              {mr.checker?.name || '______________________'}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Checked & Endorsed By</div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>Cost Control</div>
          </div>

          <div style={{ textAlign: 'center', position: 'relative' }}>
            {mr.status === 'APPROVED' && (
              <div style={{
                position: 'absolute',
                top: '-30px',
                left: '50%',
                transform: 'translateX(-50%) rotate(-5deg)',
                border: '3px solid #16a34a',
                color: '#16a34a',
                padding: '4px 12px',
                borderRadius: '4px',
                fontWeight: '900',
                fontSize: '18px',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                opacity: 0.8,
                pointerEvents: 'none',
                backgroundColor: 'rgba(255,255,255,0.7)',
                zIndex: 10
              }}>
                APPROVED
              </div>
            )}
            <div style={{ borderBottom: '1px solid #000', paddingBottom: '5px', marginBottom: '10px', minHeight: '30px', fontWeight: 'bold', color: '#1e3a8a', position: 'relative', zIndex: 1 }}>
              {mr.approver?.name || '______________________'}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Approved By</div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>Project Manager</div>
          </div>

        </div>

      </div>

      <h2 style={{ color: 'var(--text-primary)', marginTop: '40px', marginBottom: '20px', maxWidth: '1000px', margin: '40px auto 20px auto' }}>Related Canvass Forms</h2>
      <div className={styles.tableContainer} style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Canvass Number</th>
              <th>Date</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {!mr.canvassForms || mr.canvassForms.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.emptyState}>
                  No canvass forms generated for this MR yet.
                  {/* The next flow step from an approved request; previously users had to find it under Procurement. */}
                  {mr.status === 'APPROVED' && <> <Link href={`/procurement/canvassing/new?mrId=${encodeURIComponent(mr.id)}`} style={{ color: '#3b82f6', textDecoration: 'underline', fontWeight: 'bold' }}>Start canvassing for this request →</Link></>}
                </td>
              </tr>
            ) : mr.canvassForms.map((cf: any) => (
              <tr key={cf.id}>
                <td>{cf.canvassNumber}</td>
                <td>{new Date(cf.createdAt).toLocaleDateString()}</td>
                <td>{cf.status}</td>
                <td>
                  <Link href={`/procurement/canvassing/${cf.id}`} style={{ color: '#3b82f6', textDecoration: 'underline', fontWeight: 'bold' }}>
                    View Canvass Form
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ color: 'var(--text-primary)', marginTop: '40px', marginBottom: '20px', maxWidth: '1000px', margin: '40px auto 20px auto' }}>Related Purchase Orders</h2>
      <div className={styles.tableContainer} style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>PO Number</th>
              <th>Date</th>
              <th>Status</th>
              <th>Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {mr.purchaseOrders.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.emptyState}>No purchase orders generated for this MR yet.</td>
              </tr>
            ) : mr.purchaseOrders.map(po => (
              <tr key={po.id}>
                <td>{po.poNumber}</td>
                <td>{new Date(po.createdAt).toLocaleDateString()}</td>
                <td>{po.status}</td>
                <td>₱ {po.totalAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        .badge-DRAFT { background-color: rgba(148, 163, 184, 0.2); color: #cbd5e1; }
        .badge-AI_CHECKING { background-color: rgba(56, 189, 248, 0.2); color: #38bdf8; }
        .badge-SUBMITTED { background-color: rgba(250, 204, 21, 0.2); color: #facc15; }
        .badge-FOR_REVIEW { background-color: rgba(168, 85, 247, 0.2); color: #c084fc; }
        .badge-APPROVED { background-color: rgba(74, 222, 128, 0.2); color: #4ade80; }
        .badge-REJECTED { background-color: rgba(248, 113, 113, 0.2); color: #f87171; }
        .badge-RETURNED { background-color: rgba(251, 146, 60, 0.2); color: #fb923c; }
      `}</style>
    </div>
  );
}
