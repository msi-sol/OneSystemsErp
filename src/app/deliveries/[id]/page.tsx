import { verifySession } from '@/lib/dal/auth';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import styles from '../../projects/page.module.css';
import Link from 'next/link';
import DeliveryWorkflowButtons from './DeliveryWorkflowButtons';
import { getUserPermissions } from '@/lib/permissions';
import DelayedProofUpload from './DelayedProofUpload';

export const dynamic = 'force-dynamic';

export default async function DeliveryDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const delivery = await prisma.delivery.findUnique({
    where: { id: resolvedParams.id },
    include: {
      po: { include: { supplier: true, mr: { include: { project: true } } } },
      items: { include: { consolidatedBoqItem: true } },
      receivedBy: true,
      approvedBy: true,
    }
  });

  if (!delivery) notFound();

  // Ordered, already received (other approved receipts) and outstanding per material, so staggered deliveries and
  // over-receipts are visible before approval. Over-delivery stays allowed (existing policy); it is only flagged.
  const [orderLines, otherReceipts] = await Promise.all([
    prisma.purchaseOrderItem.findMany({ where: { poId: delivery.poId }, select: { consolidatedBoqItemId: true, quantity: true } }),
    prisma.deliveryItem.findMany({ where: { delivery: { poId: delivery.poId, id: { not: delivery.id }, status: { in: ['APPROVED', 'COMPLETED'] } } }, select: { consolidatedBoqItemId: true, quantity: true } }),
  ]);
  const sumBy = (rows: { consolidatedBoqItemId: string; quantity: number }[]) => rows.reduce((map, row) => map.set(row.consolidatedBoqItemId, (map.get(row.consolidatedBoqItemId) || 0) + Number(row.quantity)), new Map<string, number>());
  const orderedByMaterial = sumBy(orderLines), receivedBefore = sumBy(otherReceipts);
  const outstandingFor = (materialId: string) => Math.max(0, (orderedByMaterial.get(materialId) || 0) - (receivedBefore.get(materialId) || 0));
  const overReceipts = delivery.items.filter(item => item.quantity > outstandingFor(item.consolidatedBoqItemId));

  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  let currentUser = null;
  let permissions: Record<string, any> = {};

  if (sessionId) {
    currentUser = await prisma.user.findUnique({ where: { id: sessionId }, select: { id: true, name: true, role: true } });
    if (currentUser) {
      permissions = await getUserPermissions(currentUser.id);
    }
  }

  return (
    <div className={styles.container} style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <header className={styles.header}>
        <div>
          <Link href="/deliveries" style={{ color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '10px', display: 'inline-block' }}>
            ← Back to Deliveries
          </Link>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            Delivery Receipt: {delivery.receiptNumber || 'N/A'}
            <span className={`${styles.badge} ${delivery.status === 'APPROVED' && delivery.hasProof !== false && !delivery.isMismatch ? styles.badgeActive : styles.badgeInactive}`} 
                  style={{ fontSize: '1rem', ...(delivery.status === 'APPROVED' && (delivery.hasProof === false || delivery.isMismatch) ? { background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', border: '1px solid #eab308' } : {}) }}>
              {delivery.status === 'APPROVED' ? (
                delivery.hasProof === false && delivery.isMismatch ? 'APPROVED (LACKING DOCS & MATERIALS)' :
                delivery.hasProof === false ? 'APPROVED (LACKING DOCUMENTS)' :
                delivery.isMismatch ? 'APPROVED (LACKING MATERIALS)' : 'APPROVED'
              ) : delivery.status.replace(/_/g, ' ')}
            </span>
          </h1>
          <p style={{ marginTop: '10px', color: 'var(--text-secondary)' }}>
            Project: {delivery.po.mr.project.name} | Supplier: {delivery.po.supplier.name} | PO: {delivery.po.poNumber}
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          {delivery.status === 'APPROVED' && (
            <Link href={`/deliveries/${delivery.id}/print`} target="_blank" style={{ textDecoration: 'none' }}>
              <button style={{ 
                padding: '10px 20px', 
                borderRadius: '8px', 
                background: 'white', 
                color: 'black', 
                border: 'none', 
                fontWeight: 'bold', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                🖨️ Print Official Record
              </button>
            </Link>
          )}
          
          <DeliveryWorkflowButtons 
            deliveryId={delivery.id} 
            status={delivery.status} 
            permissions={permissions} 
          />
        </div>
      </header>

      {delivery.isMismatch && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '12px', padding: '20px', marginBottom: '30px' }}>
          <h2 style={{ color: '#ef4444', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            ⚠️ PARTIAL / MISMATCHED DELIVERY
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            <strong>Footnote for Project Accountant:</strong> {delivery.mismatchNotes}
          </p>
        </div>
      )}

      {delivery.hasProof === false && (
        <div style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid #eab308', borderRadius: '12px', padding: '20px', marginBottom: '30px' }}>
          <h2 style={{ color: '#eab308', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            ⚠️ PENDING DOCUMENT UPLOAD
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            <strong>Notice to Approver:</strong> This delivery was logged without an uploaded DR document, bypassing AI OCR validation. Please review and optionally require a document upload.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
        <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <h3 style={{ margin: '0 0 15px 0', color: 'var(--text-secondary)' }}>Encoding Details</h3>
          <p><strong>Encoded By:</strong> {delivery.receivedBy?.name || 'Unknown'}</p>
          <p><strong>Encoded Date:</strong> {new Date(delivery.createdAt).toLocaleString()}</p>
        </div>
        <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <h3 style={{ margin: '0 0 15px 0', color: 'var(--text-secondary)' }}>Approval Details</h3>
          <p><strong>Approved By:</strong> {delivery.approvedBy?.name || 'Pending'}</p>
          <p><strong>Approval Date:</strong> {delivery.status === 'APPROVED' ? new Date(delivery.updatedAt).toLocaleString() : '---'}</p>
        </div>
      </div>

      <div style={{ marginBottom: '30px' }}>
        <h3 style={{ margin: '0 0 15px 0', color: 'var(--text-secondary)' }}>Document Attachments</h3>
        {delivery.proofFileUrl ? (
          <div style={{ background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>An official Delivery Receipt was provided and validated by the AI OCR engine.</p>
            <Link href={delivery.proofFileUrl} target="_blank" style={{ textDecoration: 'none' }}>
              <button style={{ 
                padding: '10px 20px', 
                borderRadius: '8px', 
                background: '#3b82f6', 
                color: 'white', 
                border: 'none', 
                fontWeight: 'bold', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                📄 View Attached DR Document
              </button>
            </Link>
          </div>
        ) : (
          <DelayedProofUpload deliveryId={delivery.id} />
        )}
      </div>

      {delivery.status === 'FOR_ACCOUNTANT_APPROVAL' && overReceipts.length > 0 && (
        <div role="alert" style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.4)', color: '#fcd34d' }}>
          This receipt is more than the PO&apos;s outstanding quantity for {overReceipts.length} item{overReceipts.length === 1 ? '' : 's'}. The extra quantity will be recorded and costed at the PO rate if approved; check it with the supplier first.
        </div>
      )}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Category</th>
              <th>Item Description</th>
              <th>Ordered</th>
              <th>Received before</th>
              <th>Outstanding</th>
              <th>DR Qty</th>
              <th>Actual Qty</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {delivery.items.map(item => {
              const outstanding = outstandingFor(item.consolidatedBoqItemId);
              const over = item.quantity > outstanding;
              return (
              <tr key={item.id} style={{ background: item.drQuantity !== item.quantity ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                <td>{item.consolidatedBoqItem.category || '-'}</td>
                <td>{item.consolidatedBoqItem.description}</td>
                <td>{orderedByMaterial.get(item.consolidatedBoqItemId) ?? 0}</td>
                <td>{receivedBefore.get(item.consolidatedBoqItemId) ?? 0}</td>
                <td>{outstanding}</td>
                <td>{item.drQuantity !== null ? item.drQuantity : 'N/A'}</td>
                <td style={{ fontWeight: 'bold', color: item.drQuantity !== item.quantity ? '#ef4444' : over ? '#f59e0b' : 'inherit' }}>
                  {item.quantity}{over && <span style={{ display: 'block', fontWeight: 'normal', fontSize: '0.8rem' }}>{item.quantity - outstanding} over outstanding</span>}
                </td>
                <td>{item.remarks || '-'}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
