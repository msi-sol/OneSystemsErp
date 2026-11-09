import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import POWorkflowButtons from '../../[id]/POWorkflowButtons';
import { verifySession } from '@/lib/dal/auth';
import { getUserPermissions } from '@/lib/permissions';
import { RECEIVABLE_PO_STATUSES } from '@/lib/procurement/receivable-purchase-order';
import PrintPOButton from './PrintPOButton';

export default async function PurchaseOrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      mr: { include: { project: true } },
      canvassForm: true,
      preparer: true,
      items: {
        include: { consolidatedBoqItem: true }
      }
    }
  });

  if (!po) {
    return notFound();
  }
  const actor = await verifySession();
  const currentUser = actor ? await prisma.user.findUnique({ where: { id: actor.id }, select: { id: true, name: true, role: true } }) : null;
  const permissions = currentUser ? await getUserPermissions(currentUser.id) : {};

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <Link href="/procurement/purchase-orders" style={{ color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '20px', display: 'inline-block' }}>
        ← Back to Purchase Orders
      </Link>
      
      <div className="glass-card" style={{ padding: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid var(--glass-border)', paddingBottom: '20px', marginBottom: '20px' }}>
          <div>
            <h1 style={{ color: 'var(--accent-color)', margin: '0 0 10px 0' }}>PURCHASE ORDER</h1>
            <p style={{ margin: '5px 0', color: 'var(--text-secondary)' }}><strong>PO No:</strong> <span style={{ color: '#fff' }}>{po.poNumber}</span></p>
            <p style={{ margin: '5px 0', color: 'var(--text-secondary)' }}><strong>Date:</strong> <span style={{ color: '#fff' }}>{new Date(po.createdAt).toLocaleDateString()}</span></p>
            <p style={{ margin: '5px 0', color: 'var(--text-secondary)' }}><strong>Status:</strong> 
              <span style={{ 
                marginLeft: '10px', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold',
                backgroundColor: po.status === 'APPROVED' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                color: po.status === 'APPROVED' ? '#4ade80' : '#facc15'
              }}>
                {po.status}
              </span>
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <h3 style={{ margin: '0 0 10px 0', color: 'var(--text-primary)' }}>Supplier Details</h3>
            <p style={{ margin: '5px 0', color: '#fff', fontWeight: 'bold' }}>{po.supplier.name}</p>
            <p style={{ margin: '5px 0', color: 'var(--text-secondary)' }}>{po.supplier.contactPerson || 'No contact provided'}</p>
            <p style={{ margin: '5px 0', color: 'var(--text-secondary)' }}>{po.supplier.email || 'No email provided'}</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
            <h4 style={{ margin: '0 0 10px 0', color: 'var(--accent-color)' }}>Reference Documents</h4>
            <p style={{ margin: '5px 0', color: 'var(--text-secondary)' }}><strong>Material Request:</strong> {po.mr.mrNumber}</p>
            <p style={{ margin: '5px 0', color: 'var(--text-secondary)' }}><strong>Project:</strong> {po.mr.project?.name}</p>
            {po.canvassForm && <p style={{ margin: '5px 0', color: 'var(--text-secondary)' }}><strong>Canvass Form:</strong> {po.canvassForm.canvassNumber}</p>}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
            <h4 style={{ margin: '0 0 10px 0', color: 'var(--accent-color)' }}>Financial Details</h4>
            <p style={{ margin: '5px 0', color: 'var(--text-secondary)' }}><strong>Total Amount:</strong> ₱{po.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p style={{ margin: '5px 0', color: 'var(--text-secondary)' }}><strong>Net Amount:</strong> ₱{po.netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p style={{ margin: '5px 0', color: 'var(--text-secondary)' }}><strong>VAT:</strong> ₱{(po.vatAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>

        <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px', color: 'var(--text-primary)' }}>Order Items</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '12px 8px' }}>Item Description</th>
              <th style={{ padding: '12px 8px', textAlign: 'center' }}>Quantity</th>
              <th style={{ padding: '12px 8px', textAlign: 'right' }}>Unit Cost</th>
              <th style={{ padding: '12px 8px', textAlign: 'right' }}>Total Cost</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '12px 8px', color: '#fff' }}>{item.consolidatedBoqItem.description}</td>
                <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>{item.quantity} {item.consolidatedBoqItem.unit}</td>
                <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>₱{item.unitCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style={{ padding: '12px 8px', textAlign: 'right', color: '#fff', fontWeight: 'bold' }}>₱{(item.quantity * item.unitCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ padding: '20px 8px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 'bold' }}>GRAND TOTAL:</td>
              <td style={{ padding: '20px 8px', textAlign: 'right', color: 'var(--accent-color)', fontWeight: 'bold', fontSize: '1.2rem' }}>₱{po.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>

        <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
          <PrintPOButton />
          {/* Next flow step once the PO can be received; previously users had to find it under Deliveries. */}
          {(RECEIVABLE_PO_STATUSES as readonly string[]).includes(po.status) && (
            <Link href={`/deliveries/new?poId=${encodeURIComponent(po.id)}`} className="no-print" style={{
              background: 'var(--accent-color)', color: '#000', padding: '10px 20px', borderRadius: '4px', fontWeight: 'bold', textDecoration: 'none'
            }}>Receive delivery →</Link>
          )}

          {/* Action buttons */}
          <POWorkflowButtons poId={po.id} status={po.status} currentUser={currentUser} permissions={permissions} canvassFormId={po.canvassFormId} />
        </div>
      </div>
    </div>
  );
}
