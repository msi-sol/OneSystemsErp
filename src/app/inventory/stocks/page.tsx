import { verifySession } from '@/lib/dal/auth';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import styles from '../../projects/page.module.css';
import { cookies } from 'next/headers';
import type { Prisma } from '@prisma/client';
import { getUserPermissions } from '@/lib/permissions';
import PermissionGuard from '@/components/PermissionGuard';
import { materialQuantity, materialStock } from '@/lib/procurement/material-values';

export const dynamic = 'force-dynamic';

export default async function StocksPage({ searchParams }: { searchParams: Promise<{ inStock?: string }> }) {
  const resolvedParams = await searchParams;
  const inStockOnly = resolvedParams?.inStock === 'true';

  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  const activeProjectId = cookieStore.get('activeProjectId')?.value || null;

  const user = sessionId ? await prisma.user.findUnique({ where: { id: sessionId } }) : null;
  const permissions = sessionId ? await getUserPermissions(sessionId) : {};
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'SYSTEM_ADMIN';

  const baseProjectFilter: Prisma.ProjectWhereInput = {};
  if (!isSuperAdmin && sessionId) {
    baseProjectFilter.userAssignments = {
      some: { userId: sessionId, assignmentStatus: 'active' }
    };
  }

  const itemsFilter: Prisma.ConsolidatedBOQItemWhereInput = {};
  if (!isSuperAdmin) itemsFilter.project = baseProjectFilter;
  if (activeProjectId) itemsFilter.projectId = activeProjectId;

  const activeProject = activeProjectId ? await prisma.project.findUnique({ where: { id: activeProjectId }, select: { name: true } }) : null;
  const items = await prisma.consolidatedBOQItem.findMany({
    where: itemsFilter,
    include: {
      project: true
    },
    orderBy: {
      project: { name: 'asc' }
    }
  });

  return (
    <div className={styles.container} style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <header className={styles.header}>
        <div>
          <Link href="/inventory" style={{ color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '10px', display: 'inline-block' }}>
            ← Back to Inventory Hub
          </Link>
          <h1>Site Stocks & Materials</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '5px' }}>Master inventory of all BOQ items across projects, driven by approved deliveries.</p>
          {/* The list follows the header's active project; say so, otherwise an empty list looks like missing stock. */}
          {activeProject && <p style={{ marginTop: '8px' }}>Showing materials for the active project <strong>{activeProject.name}</strong>. Change the active project in the header to see another project.</p>}
          
          <div style={{ marginTop: '20px' }}>
            <Link href={inStockOnly ? "/inventory/stocks" : "/inventory/stocks?inStock=true"}>
              <button style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: inStockOnly ? 'none' : '1px solid var(--glass-border)',
                background: inStockOnly ? 'var(--accent-color)' : 'transparent',
                color: inStockOnly ? '#000' : 'white',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}>
                {inStockOnly ? '✓ Showing In-Stock Only' : 'Show In-Stock Only'}
              </button>
            </Link>
          </div>
        </div>
        <PermissionGuard permissions={permissions} moduleName="MATERIAL_ISSUANCE" action="canView">
          <Link href="/material-issuance" className={styles.primaryButton}>Open Material Issuance</Link>
        </PermissionGuard>
      </header>

      <div className={styles.tableContainer} style={{ overflowX: 'auto' }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Category</th>
              <th>Item Description</th>
              <th>Unit</th>
              <th>Approved Quantity</th>
              <th>Delivered Qty</th>
              <th>Consumed / Issued</th>
              <th>Stock on Hand</th>
            </tr>
          </thead>
          <tbody>
            {items.filter(item => {
              if (!inStockOnly) return true;
              return materialStock(item) > 0;
            }).map(item => {
              const stockOnHand = materialStock(item);
              const isLowStock = stockOnHand <= 0 && item.deliveredQty > 0;
              
              return (
                <tr key={item.id}>
                  <td>{item.category || '-'}</td>
                  <td>{item.description}</td>
                  <td>{item.unit}</td>
                  <td>{materialQuantity(item)}</td>
                  <td style={{ color: 'var(--accent-color)' }}>{item.deliveredQty}</td>
                  <td>{item.consumedQty}</td>
                  <td style={{ 
                    fontWeight: 'bold', 
                    color: isLowStock ? '#ef4444' : (stockOnHand > 0 ? '#10b981' : 'inherit')
                  }}>
                    {stockOnHand}
                  </td>
                </tr>
              );
            })}
            
            {items.filter(item => {
              if (!inStockOnly) return true;
              return materialStock(item) > 0;
            }).length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                  {activeProject ? `No materials found for ${activeProject.name}${inStockOnly ? ' with stock on hand' : ''}.` : 'No BOQ items found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
