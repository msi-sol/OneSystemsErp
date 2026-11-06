'use client';

import Link from 'next/link';

export default function InventoryHub() {
  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ marginBottom: '40px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '20px' }}>
        <h1 style={{ margin: '0 0 10px 0', color: 'var(--text-primary)', fontSize: '2rem' }}>Inventory Hub</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Manage site deliveries, stocks, and material issuances.</p>
      </header>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
        gap: '30px'
      }}>
        {/* Deliveries Card */}
        <Link href="/deliveries" style={{ textDecoration: 'none' }}>
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
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-5px)';
            e.currentTarget.style.borderColor = 'var(--accent-color)';
            e.currentTarget.style.boxShadow = '0 8px 30px rgba(0, 240, 255, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = 'var(--glass-border)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
          }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '15px' }}>🚚</div>
            <h2 style={{ color: 'var(--text-primary)', margin: '0 0 10px 0', fontSize: '1.5rem' }}>Deliveries</h2>
            <p style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5', flexGrow: 1 }}>
              Track incoming material deliveries, generate Delivery Receipts, and inspect items upon arrival.
            </p>
            <div style={{ 
              marginTop: '20px', 
              color: 'var(--accent-color)', 
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}>
              Manage Deliveries <span>→</span>
            </div>
          </div>
        </Link>

        {/* Stocks & Materials Card */}
        <Link href="/inventory/stocks" style={{ textDecoration: 'none' }}>
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
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-5px)';
            e.currentTarget.style.borderColor = 'var(--accent-color)';
            e.currentTarget.style.boxShadow = '0 8px 30px rgba(0, 240, 255, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.borderColor = 'var(--glass-border)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
          }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '15px' }}>📦</div>
            <h2 style={{ color: 'var(--text-primary)', margin: '0 0 10px 0', fontSize: '1.5rem' }}>Site Stocks</h2>
            <p style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5', flexGrow: 1 }}>
              View master inventory, track physically delivered items, and monitor available stock on hand.
            </p>
            <div style={{ 
              marginTop: '20px', 
              color: 'var(--accent-color)', 
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}>
              View Stocks <span>→</span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
