import React from 'react';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const billing = await prisma.subcontractBilling.findUnique({
    where: { id },
    include: {
      project: true,
      subcontractor: true,
      package: true,
      jobOrder: true
    }
  });

  if (!billing) {
    return (
      <div style={{ padding: '40px', color: '#fff' }}>
        <h2>Invoice Not Found</h2>
        <Link href="/supplier-payables" style={{ color: 'var(--accent-color)' }}>← Back</Link>
      </div>
    );
  }

  const isJobOrder = !!billing.jobOrderId;
  const referenceName = isJobOrder ? 'Job Order' : 'Subcontract Package';
  const referenceNumber = isJobOrder ? billing.jobOrder?.jobNumber : billing.package?.packageNumber;

  return (
    <div style={{ maxWidth: '900px', margin: '40px auto', padding: '40px', background: '#fff', color: '#000', borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: '20px', marginBottom: '30px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2.5rem', color: '#000' }}>INVOICE</h1>
          <p style={{ margin: '5px 0 0 0', color: '#555', fontSize: '1.1rem' }}>No: {billing.billingNumber}</p>
          <div style={{ marginTop: '10px' }}>
            <span style={{ 
              padding: '4px 12px', 
              borderRadius: '20px', 
              fontSize: '0.85rem', 
              fontWeight: 'bold',
              background: billing.paymentStatus === 'PAID' ? '#dcfce7' : '#fef9c3',
              color: billing.paymentStatus === 'PAID' ? '#166534' : '#854d0e',
              border: `1px solid ${billing.paymentStatus === 'PAID' ? '#166534' : '#854d0e'}`
            }}>
              {billing.paymentStatus}
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h2 style={{ margin: 0, color: '#000' }}>OneSystems ERP</h2>
          <p style={{ margin: '5px 0', color: '#555' }}>Finance Department</p>
          <p style={{ margin: 0, color: '#555' }}>Date Generated: {new Date(billing.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px' }}>
        <div style={{ width: '48%' }}>
          <h3 style={{ borderBottom: '1px solid #ccc', paddingBottom: '5px', color: '#333' }}>Billed To:</h3>
          <p style={{ margin: '5px 0', fontWeight: 'bold', fontSize: '1.1rem' }}>Project: {billing.project.name}</p>
          <p style={{ margin: '5px 0', color: '#555' }}>{referenceName}: {referenceNumber}</p>
        </div>
        <div style={{ width: '48%' }}>
          <h3 style={{ borderBottom: '1px solid #ccc', paddingBottom: '5px', color: '#333' }}>Payable To:</h3>
          <p style={{ margin: '5px 0', fontWeight: 'bold', fontSize: '1.1rem' }}>{billing.subcontractor.name}</p>
          <p style={{ margin: '5px 0', color: '#555' }}>Subcontractor / Supplier</p>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px' }}>
        <thead>
          <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #000' }}>
            <th style={{ padding: '12px', textAlign: 'left', color: '#000' }}>Description</th>
            <th style={{ padding: '12px', textAlign: 'right', color: '#000' }}>Amount (PHP)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>Total Contract Value</td>
            <td style={{ padding: '12px', borderBottom: '1px solid #eee', textAlign: 'right' }}>
              ₱ {billing.contractAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '12px', borderBottom: '1px solid #eee' }}>Cumulative Accomplished (Gross)</td>
            <td style={{ padding: '12px', borderBottom: '1px solid #eee', textAlign: 'right' }}>
              ₱ {billing.totalGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '12px', borderBottom: '1px solid #eee', color: '#555', paddingLeft: '30px' }}>
              Less: Previous Billings
            </td>
            <td style={{ padding: '12px', borderBottom: '1px solid #eee', textAlign: 'right', color: '#ef4444' }}>
              - ₱ {billing.previousGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </td>
          </tr>
          <tr style={{ background: '#f8fafc' }}>
            <td style={{ padding: '12px', borderBottom: '1px solid #000', fontWeight: 'bold', color: '#000' }}>
              Current Gross Amount
            </td>
            <td style={{ padding: '12px', borderBottom: '1px solid #000', textAlign: 'right', fontWeight: 'bold', color: '#000' }}>
              ₱ {billing.currentGross.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </td>
          </tr>

          {/* Deductions Section */}
          <tr>
            <td colSpan={2} style={{ padding: '20px 12px 5px 12px', fontWeight: 'bold', color: '#333' }}>Deductions</td>
          </tr>
          <tr>
            <td style={{ padding: '8px 12px', color: '#555', paddingLeft: '30px' }}>Retention (10%)</td>
            <td style={{ padding: '8px 12px', textAlign: 'right', color: '#ef4444' }}>
              - ₱ {(billing.retentionDeduction || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </td>
          </tr>
          {(billing.whtDeduction || 0) > 0 && (
            <tr>
              <td style={{ padding: '8px 12px', color: '#555', paddingLeft: '30px' }}>Withholding Tax</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', color: '#ef4444' }}>
                - ₱ {billing.whtDeduction!.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
            </tr>
          )}
          {(billing.mobilizationDeduction || 0) > 0 && (
            <tr>
              <td style={{ padding: '8px 12px', color: '#555', paddingLeft: '30px' }}>Mobilization Recovery</td>
              <td style={{ padding: '8px 12px', textAlign: 'right', color: '#ef4444' }}>
                - ₱ {billing.mobilizationDeduction!.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '40px' }}>
        <div style={{ width: '350px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '2px solid #000' }}>
            <span style={{ fontWeight: 'bold', color: '#000' }}>Total Deductions:</span>
            <span style={{ color: '#ef4444' }}>
              - ₱ {((billing.retentionDeduction || 0) + (billing.whtDeduction || 0) + (billing.mobilizationDeduction || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 0', borderBottom: '4px double #000' }}>
            <span style={{ fontWeight: 'bold', fontSize: '1.3rem', color: '#000' }}>NET PAYABLE:</span>
            <span style={{ fontWeight: 'bold', fontSize: '1.3rem', color: '#000' }}>
              ₱ {billing.netPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '50px', textAlign: 'center' }}>
        <Link href="/supplier-payables">
          <button style={{ 
            padding: '10px 20px', 
            background: '#333', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '4px', 
            fontWeight: 'bold', 
            cursor: 'pointer',
            marginRight: '10px'
          }}>
            ← Return to Payables
          </button>
        </Link>
        <a href="javascript:window.print()" style={{ textDecoration: 'none' }}>
          <button 
            style={{ 
              padding: '10px 20px', 
              background: '#0ea5e9', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '4px', 
              fontWeight: 'bold', 
              cursor: 'pointer' 
            }}
            type="button"
          >
            🖨️ Print Invoice
          </button>
        </a>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * {
            visibility: hidden;
          }
          div[style*="maxWidth: '900px'"], div[style*="maxWidth: '900px'"] * {
            visibility: visible;
          }
          div[style*="maxWidth: '900px'"] {
            position: absolute;
            left: 0;
            top: 0;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            width: 100%;
          }
          button {
            display: none !important;
          }
        }
      `}} />
    </div>
  );
}
