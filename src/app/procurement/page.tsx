'use server';
import { verifySession } from '@/lib/dal/auth';

import Link from 'next/link';
import ApplicableRulesPanel from '@/components/ApplicableRulesPanel';
import PermissionGuard from '@/components/PermissionGuard';
import { getUserPermissions } from '@/lib/permissions';
import { cookies } from 'next/headers';

export default async function ProcurementHub() {
  const cookieStore = await cookies();
  const __session = await verifySession();
  const userId = __session?.id || '';
  const permissions = await getUserPermissions(userId);

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <ApplicableRulesPanel moduleName="Procurement" />
      <header style={{ marginBottom: '40px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '20px' }}>
        <h1 style={{ margin: '0 0 10px 0', color: 'var(--text-primary)', fontSize: '2rem' }}>Procurement Hub</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Manage your material requests and purchase orders from a central dashboard.</p>
      </header>

      <PermissionGuard permissions={permissions} moduleName="PROCUREMENT" action="canView" fallback={<div style={{ padding: '20px', color: '#ef4444' }}>You do not have permission to view the Procurement Hub.</div>}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
          gap: '30px'
        }}>
          {/* Material Requests Card */}
          <Link href="/material-requests" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '16px',
              padding: '30px',
              border: '1px solid var(--glass-border)',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
            }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '15px' }}>📝</div>
              <h2 style={{ color: 'var(--text-primary)', margin: '0 0 10px 0', fontSize: '1.5rem' }}>Material Requests</h2>
              <p style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5', flexGrow: 1 }}>
                Review, approve, and track material requests from your projects. View MRF status and details.
              </p>
              <div style={{ 
                marginTop: '20px', 
                color: 'var(--accent-color)', 
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                View Requests <span>→</span>
              </div>
            </div>
          </Link>

          {/* Canvassing & Quotations Card */}
          <Link href="/procurement/canvassing" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '16px',
              padding: '30px',
              border: '1px solid var(--glass-border)',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
            }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '15px' }}>⚖️</div>
              <h2 style={{ color: 'var(--text-primary)', margin: '0 0 10px 0', fontSize: '1.5rem' }}>Canvassing & Supplier Comparison</h2>
              <p style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5', flexGrow: 1 }}>
                Prepare canvass forms from approved MRFs, encode supplier quotations, and use AI to compare and recommend the best vendor.
              </p>
              <div style={{ 
                marginTop: '20px', 
                color: '#a855f7', 
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                Start Canvassing <span>→</span>
              </div>
            </div>
          </Link>

          {/* Purchase Orders Card */}
          <Link href="/procurement/purchase-orders" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '16px',
              padding: '30px',
              border: '1px solid var(--glass-border)',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
            }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '15px' }}>🛒</div>
              <h2 style={{ color: 'var(--text-primary)', margin: '0 0 10px 0', fontSize: '1.5rem' }}>Purchase Orders</h2>
              <p style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5', flexGrow: 1 }}>
                Manage purchase orders generated from approved material requests. Track PO status and delivery.
              </p>
              <div style={{ 
                marginTop: '20px', 
                color: 'var(--accent-color)', 
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                View Purchase Orders <span>→</span>
              </div>
            </div>
          </Link>

          {/* Vendors & Suppliers Card */}
          <Link href="/procurement/suppliers" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '16px',
              padding: '30px',
              border: '1px solid var(--glass-border)',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
            }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '15px' }}>🏢</div>
              <h2 style={{ color: 'var(--text-primary)', margin: '0 0 10px 0', fontSize: '1.5rem' }}>Vendors & Suppliers</h2>
              <p style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5', flexGrow: 1 }}>
                Manage vendor directory, contact information, and VAT settings.
              </p>
              <div style={{ 
                marginTop: '20px', 
                color: 'var(--accent-color)', 
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                View Suppliers <span>→</span>
              </div>
            </div>
          </Link>
        </div>
      </PermissionGuard>
    </div>
  );
}
