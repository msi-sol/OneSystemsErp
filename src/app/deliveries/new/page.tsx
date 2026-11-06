import styles from '../../projects/page.module.css';
import { prisma } from '@/lib/prisma';
import LogDeliveryForm from './LogDeliveryForm';
import Link from 'next/link';
import { RECEIVABLE_PO_STATUSES } from '@/lib/procurement/receivable-purchase-order';

export const dynamic = 'force-dynamic';

export default async function NewDeliveryPage() {
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { status: { in: [...RECEIVABLE_PO_STATUSES] } },
    include: {
      supplier: true,
      mr: { include: { project: true } },
      deliveries: {
        where: { status: { in: ['APPROVED', 'COMPLETED'] } },
        include: { items: true },
      },
      items: {
        include: {
          consolidatedBoqItem: true
        }
      }
    }
  });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <Link href="/deliveries" style={{ color: 'var(--accent-color)', display: 'inline-block', marginBottom: '16px' }}>Back to Deliveries</Link>
          <h1>Receive Delivery</h1>
          <p>Encode incoming deliveries for Project Accountant approval.</p>
        </div>
      </header>

      {purchaseOrders.length > 0 ? <LogDeliveryForm purchaseOrders={purchaseOrders} /> : (
        <div className={styles.tableContainer} style={{ padding: '24px' }}>
          <h2>No purchase orders available</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>Complete the purchase-order workflow before recording a delivery.</p>
          <Link href="/procurement/purchase-orders" className={styles.actionLink}>Open Purchase Orders</Link>
        </div>
      )}
    </div>
  );
}
