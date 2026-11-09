import { verifySession } from '@/lib/dal/auth';
import { prisma } from '@/lib/prisma';
import styles from '../../projects/page.module.css';
import Link from 'next/link';
import POWorkflowButtons from './POWorkflowButtons';
import { cookies } from 'next/headers';
import { getUserPermissions } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export default async function PurchaseOrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      mr: { include: { project: true } },
      preparer: true,
      approver: true,
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
  let permissions: Record<string, any> = {};

  if (sessionId) {
    currentUser = await prisma.user.findUnique({ where: { id: sessionId }, select: { id: true, name: true, role: true } });
    if (currentUser) {
      permissions = await getUserPermissions(currentUser.id);
    }
  }

  if (!po) {
    return <div style={{ padding: '20px', color: 'red' }}>Purchase Order not found.</div>;
  }

  return (
    <div style={{ backgroundColor: '#f0f2f5', minHeight: '100vh', padding: '40px 20px', fontFamily: '"Arial", sans-serif' }}>
      
      <div style={{ maxWidth: '1000px', margin: '0 auto 20px auto', backgroundColor: 'var(--bg-secondary)', padding: '20px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/procurement/purchase-orders" style={{ color: 'var(--accent-color)', textDecoration: 'none', fontWeight: 'bold' }}>&larr; Back to Procurement</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
            <span className={`badge-${po.status}`} style={{ fontWeight: 'bold', padding: '6px 12px', borderRadius: '20px', backgroundColor: 'var(--bg-dark)' }}>{po.status.replace('_', ' ')}</span>
          </div>
        </div>
        <POWorkflowButtons poId={po.id} status={po.status} currentUser={currentUser} permissions={permissions} />
      </div>

      <div style={{ 
        maxWidth: '1000px', margin: '0 auto', backgroundColor: '#ffffff', color: '#000000', 
        padding: '50px', borderRadius: '4px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
        position: 'relative'
      }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #1e3a8a', paddingBottom: '20px', marginBottom: '30px' }}>
          <div>
            <h1 style={{ margin: '0 0 5px 0', color: '#1e3a8a', fontSize: '24px', fontWeight: '900', letterSpacing: '1px' }}>JEJORS CONSTRUCTION CORPORATION</h1>
            <p style={{ margin: 0, fontSize: '14px', color: '#4b5563' }}>Purchase Order</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc2626' }}>{po.poNumber}</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Date: {new Date(po.createdAt).toLocaleDateString()}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '40px', marginBottom: '30px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase' }}>Supplier</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#111827' }}>{po.supplier.name}</div>
            {po.supplier.address && <div style={{ fontSize: '14px', color: '#374151' }}>{po.supplier.address}</div>}
            {po.supplier.paymentTerms && <div style={{ fontSize: '14px', color: '#374151', marginTop: '4px' }}><strong>Terms:</strong> {po.supplier.paymentTerms}</div>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase' }}>Project Details</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#111827' }}>{po.mr.project.name}</div>
            <div style={{ fontSize: '14px', color: '#374151' }}>MRF Ref: {po.mr.mrNumber}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', color: '#374151', width: '60%' }}>Item Description</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', color: '#374151', width: '10%' }}>Qty</th>
              <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', color: '#374151', width: '15%' }}>Unit Price</th>
              <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', color: '#374151', width: '15%' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((item, index) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px', fontSize: '14px' }}>
                  <div style={{ fontWeight: 'bold', color: '#111827' }}>{item.consolidatedBoqItem.itemCode}</div>
                  <div style={{ color: '#6b7280', fontSize: '12px', textTransform: 'uppercase', marginBottom: '4px' }}>{item.consolidatedBoqItem.category || 'Uncategorized'}</div>
                  <div style={{ color: '#4b5563', fontSize: '13px' }}>{item.consolidatedBoqItem.description}</div>
                </td>
                <td style={{ padding: '12px', fontSize: '14px', textAlign: 'center' }}>{item.quantity} {item.consolidatedBoqItem.unit}</td>
                <td style={{ padding: '12px', fontSize: '14px', textAlign: 'right' }}>{item.unitCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style={{ padding: '12px', fontSize: '14px', textAlign: 'right', fontWeight: 'bold' }}>
                  {(item.quantity * item.unitCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {po.supplier.isVatable ? (
              <>
                <tr>
                  <td colSpan={3} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px', color: '#4b5563' }}>Vatable Amount (Net of VAT)</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px', color: '#4b5563' }}>
                    ₱ {po.netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px', color: '#4b5563', borderBottom: '1px solid #e5e7eb' }}>VAT (12%)</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px', color: '#4b5563', borderBottom: '1px solid #e5e7eb' }}>
                    ₱ {po.vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} style={{ padding: '15px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '16px' }}>Total Gross Amount</td>
                  <td style={{ padding: '15px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '16px', color: '#1e3a8a' }}>
                    ₱ {po.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </>
            ) : (
              <tr>
                <td colSpan={3} style={{ padding: '15px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '16px' }}>Total Amount</td>
                <td style={{ padding: '15px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: '16px', color: '#1e3a8a' }}>
                  ₱ {po.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )}
          </tfoot>
        </table>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '60px' }}>
          
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #000', paddingBottom: '5px', marginBottom: '10px', minHeight: '30px', fontWeight: 'bold', color: '#1e3a8a' }}>
              {po.preparer?.name || '______________________'}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Prepared By</div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>Procurement Officer</div>
          </div>

          <div style={{ textAlign: 'center', position: 'relative' }}>
            {['APPROVED', 'ISSUED', 'COMPLETED'].includes(po.status) && (
              <div style={{
                position: 'absolute', top: '-30px', left: '50%', transform: 'translateX(-50%) rotate(-5deg)',
                border: '3px solid #16a34a', color: '#16a34a', padding: '4px 12px', borderRadius: '4px',
                fontWeight: '900', fontSize: '18px', letterSpacing: '2px', textTransform: 'uppercase',
                opacity: 0.8, pointerEvents: 'none', backgroundColor: 'rgba(255,255,255,0.7)', zIndex: 10
              }}>
                APPROVED
              </div>
            )}
            <div style={{ borderBottom: '1px solid #000', paddingBottom: '5px', marginBottom: '10px', minHeight: '30px', fontWeight: 'bold', color: '#1e3a8a', position: 'relative', zIndex: 1 }}>
              {po.approver?.name || '______________________'}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Approved By</div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>Project Director</div>
          </div>

        </div>

      </div>
    </div>
  );
}
