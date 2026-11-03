'use client';
import React from 'react';
import Link from 'next/link';

export default function PaymentBatchDetails({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '20px', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <Link href="/payroll-payments/dashboard" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '1.5rem' }}>
              ←
            </Link>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', textShadow: '0 0 10px var(--accent-glow)' }}>
              Batch: PAY-2026-06-W1
            </h1>
            <span style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', background: 'rgba(243,156,18,0.2)', color: '#f39c12', border: '1px solid rgba(243,156,18,0.4)' }}>
              FOR APPROVAL
            </span>
          </div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '10px', marginLeft: '45px' }}>
            InstaPay API Transfer • 82 Workers • Prepared on June 8, 2026
          </p>
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button style={{ 
            background: 'transparent', border: '1px solid #e74c3c', color: '#e74c3c', 
            padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer',
            transition: 'all 0.2s'
          }}>
            Reject Batch
          </button>
          <button style={{ 
            background: 'var(--accent-color)', color: '#000', padding: '10px 20px', 
            borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', border: 'none',
            boxShadow: '0 4px 12px rgba(0, 255, 163, 0.2)', transition: 'all 0.2s'
          }}>
            Approve & Release to UnionBank
          </button>
        </div>
      </div>

      {/* AI Validation Alert */}
      <div style={{ background: 'rgba(0, 255, 163, 0.1)', borderLeft: '4px solid #00ffa3', padding: '20px', borderRadius: '0 16px 16px 0', marginBottom: '30px', display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '1.5rem', color: '#00ffa3' }}>🤖</div>
        <div>
          <p style={{ fontSize: '1rem', color: '#00ffa3', fontWeight: 'bold' }}>AI Validation: Low Risk</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '5px' }}>All 82 workers have verified Bank Accounts and are correctly routed to InstaPay. No duplicates detected.</p>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '20px', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Total Amount</h3>
          <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fff', marginTop: '10px' }}>₱1,450,200.00</p>
        </div>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '20px', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Total Workers</h3>
          <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fff', marginTop: '10px' }}>82</p>
        </div>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '20px', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Source Account</h3>
          <p style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff', marginTop: '10px' }}>UBP Corp (****3321)</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '5px' }}>Balance: ₱5,000,000.00</p>
        </div>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', padding: '20px', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Estimated Fee</h3>
          <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#fff', marginTop: '10px' }}>₱1,230.00</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '5px' }}>₱15.00 per InstaPay trans.</p>
        </div>
      </div>

      {/* Batch Rows */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--glass-border)', overflowX: 'auto' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#fff' }}>Payment Rows</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(0,0,0,0.2)' }}>
              <th style={{ padding: '15px 20px' }}>Worker Name</th>
              <th style={{ padding: '15px 20px' }}>Bank Details</th>
              <th style={{ padding: '15px 20px' }}>Amount</th>
              <th style={{ padding: '15px 20px' }}>Status</th>
              <th style={{ padding: '15px 20px' }}>API Ref</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <td style={{ padding: '15px 20px', fontWeight: 'bold' }}>Maria Clara</td>
              <td style={{ padding: '15px 20px' }}>
                <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold' }}>BDO Unibank</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>001234567890</div>
              </td>
              <td style={{ padding: '15px 20px', fontWeight: 'bold' }}>₱25,000.00</td>
              <td style={{ padding: '15px 20px' }}>
                <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.2)' }}>PENDING</span>
              </td>
              <td style={{ padding: '15px 20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>--</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <td style={{ padding: '15px 20px', fontWeight: 'bold' }}>Emilio Aguinaldo</td>
              <td style={{ padding: '15px 20px' }}>
                <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 'bold' }}>BPI</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>0987654321</div>
              </td>
              <td style={{ padding: '15px 20px', fontWeight: 'bold' }}>₱18,500.00</td>
              <td style={{ padding: '15px 20px' }}>
                <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.2)' }}>PENDING</span>
              </td>
              <td style={{ padding: '15px 20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>--</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
