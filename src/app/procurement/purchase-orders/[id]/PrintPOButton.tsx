'use client';

/** The PO page is a server component, so its print button needs this small client wrapper to do anything. */
export default function PrintPOButton() {
  return (
    <button type="button" onClick={() => window.print()} className="no-print" style={{
      background: 'transparent', border: '1px solid var(--text-secondary)', color: 'var(--text-primary)',
      padding: '10px 20px', borderRadius: '4px', cursor: 'pointer'
    }}>Print PO</button>
  );
}
