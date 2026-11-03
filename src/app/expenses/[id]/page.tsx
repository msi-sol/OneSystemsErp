import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import styles from '../../projects/page.module.css';
import Link from 'next/link';

export default async function ExpenseDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const expense = await prisma.expense.findUnique({
    where: { id },
    include: { breakdownItems: true, project: true, loggedBy: true }
  });

  if (!expense) {
    return (
      <div className={styles.container}>
        <h2>Expense not found</h2>
      </div>
    );
  }

  // Check if this expense was generated from an Accounts Payable
  if (expense.category === 'MATERIALS' && expense.description.includes('Payment to')) {
    const poMatch = expense.description.match(/PO:\s*(.*?)\s*\|/);
    const drMatch = expense.description.match(/DR:\s*(.*)$/);
    
    if (poMatch && drMatch) {
      const poNumber = poMatch[1].trim();
      const drNumber = drMatch[1].trim();
      
      const payable = await prisma.accountsPayable.findFirst({
        where: {
          po: { poNumber: poNumber },
          delivery: { receiptNumber: drNumber }
        }
      });

      if (payable) {
        redirect(`/supplier-payables/${payable.id}?origin=expenses`);
      }
    }
  }

  const getStatusColor = (status: string) => {
    switch(status.toUpperCase()) {
      case 'LOGGED': return '#4ade80';
      case 'PAID': return '#00ffa3';
      case 'DRAFT': return '#fbbf24';
      default: return '#94a3b8';
    }
  };

  return (
    <div className={styles.container} style={{ paddingBottom: '50px' }}>
      <header style={{ marginBottom: '30px' }}>
        <Link href="/expenses" style={{ color: 'var(--accent-color)', textDecoration: 'none', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '5px', marginBottom: '15px' }}>
          ← Back to Expenses
        </Link>
        <h1 style={{ margin: 0, fontSize: '2rem', display: 'flex', alignItems: 'center', gap: '15px' }}>
          Expense Voucher
          <span style={{ 
            fontSize: '0.8rem', 
            padding: '4px 12px', 
            borderRadius: '20px', 
            backgroundColor: `${getStatusColor(expense.status)}20`,
            color: getStatusColor(expense.status),
            border: `1px solid ${getStatusColor(expense.status)}40`,
            textTransform: 'uppercase',
            fontWeight: 'bold'
          }}>
            {expense.status}
          </span>
          {expense.isAccrued && (
             <span style={{ fontSize: '0.8rem', padding: '4px 12px', borderRadius: '20px', backgroundColor: 'rgba(168, 85, 247, 0.2)', color: '#a855f7', border: '1px solid rgba(168, 85, 247, 0.4)', fontWeight: 'bold' }}>
               ACCRUED
             </span>
          )}
        </h1>
        <p style={{ color: '#aaa', margin: '5px 0 0 0' }}>Ref: {expense.receiptRef || expense.id}</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={{ background: 'var(--bg-secondary)', padding: '25px', borderRadius: '16px', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <span style={{ color: '#aaa', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Amount</span>
          <span style={{ fontSize: '2.2rem', fontWeight: '800', color: '#fff', textShadow: '0 0 20px rgba(0,255,163,0.3)' }}>
            ₱ {expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          {expense.vatAmount > 0 && (
            <span style={{ fontSize: '0.85rem', color: '#4ade80' }}>
              Includes ₱ {expense.vatAmount.toLocaleString()} VAT
            </span>
          )}
        </div>

        <div style={{ background: 'var(--bg-secondary)', padding: '25px', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', color: 'var(--accent-color)' }}>Expense Details</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '3px' }}>DATE</div>
              <div style={{ color: '#fff', fontWeight: '500' }}>{new Date(expense.date).toLocaleDateString()}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '3px' }}>CATEGORY</div>
              <div style={{ color: '#fff', fontWeight: '500' }}>{expense.category}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '3px' }}>SUPPLIER / VENDOR</div>
              <div style={{ color: '#fff', fontWeight: '500' }}>{expense.supplierName || 'N/A'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '3px' }}>LOGGED BY</div>
              <div style={{ color: '#fff', fontWeight: '500' }}>{expense.loggedBy?.name || 'System'}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-secondary)', padding: '25px', borderRadius: '16px', border: '1px solid var(--glass-border)', marginBottom: '30px' }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: 'var(--accent-color)' }}>Description & Project</h3>
        <p style={{ color: '#e2e8f0', margin: '0 0 15px 0', lineHeight: '1.6' }}>{expense.description}</p>
        {expense.project && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
            <span style={{ color: '#aaa', fontSize: '0.85rem' }}>Project:</span>
            <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.9rem' }}>{expense.project.name}</span>
          </div>
        )}
      </div>

      {expense.breakdownItems && expense.breakdownItems.length > 0 && (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--glass-border)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 25px', borderBottom: '1px solid var(--glass-border)', background: 'linear-gradient(135deg, rgba(255,255,255,0.03), transparent)' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--accent-color)' }}>Itemized Breakdown</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: '15px 25px', color: '#aaa', fontSize: '0.85rem', fontWeight: '500' }}>Description</th>
                  <th style={{ padding: '15px 25px', color: '#aaa', fontSize: '0.85rem', fontWeight: '500' }}>Supplier</th>
                  <th style={{ padding: '15px 25px', color: '#aaa', fontSize: '0.85rem', fontWeight: '500', textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: '15px 25px', color: '#aaa', fontSize: '0.85rem', fontWeight: '500' }}>Unit</th>
                  <th style={{ padding: '15px 25px', color: '#aaa', fontSize: '0.85rem', fontWeight: '500', textAlign: 'right' }}>Unit Price</th>
                  <th style={{ padding: '15px 25px', color: '#aaa', fontSize: '0.85rem', fontWeight: '500', textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {expense.breakdownItems.map((item, idx) => (
                  <tr key={item.id} style={{ borderBottom: idx !== expense.breakdownItems.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <td style={{ padding: '15px 25px', color: '#fff' }}>{item.description}</td>
                    <td style={{ padding: '15px 25px', color: '#e2e8f0' }}>{item.supplierName || '-'}</td>
                    <td style={{ padding: '15px 25px', color: '#fff', textAlign: 'right' }}>{item.quantity}</td>
                    <td style={{ padding: '15px 25px', color: '#aaa' }}>{item.unit}</td>
                    <td style={{ padding: '15px 25px', color: '#fff', textAlign: 'right' }}>₱ {item.unitCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: '15px 25px', color: '#4ade80', fontWeight: 'bold', textAlign: 'right' }}>₱ {item.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
