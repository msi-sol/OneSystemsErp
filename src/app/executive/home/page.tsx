import React from 'react';
import { getCompanyOverview } from '@/app/actions/executiveActions';
import Link from 'next/link';

export const metadata = {
  title: 'Executive Home | Command Center',
};

import { cookies } from 'next/headers';

export default async function ExecutiveHomePage() {
  const cookieStore = await cookies();
  const currentProjectId = cookieStore.get('executive_projectId')?.value || 'ALL';

  let data: any = null;
  let error: string | null = null;
  
  try {
    data = await getCompanyOverview(currentProjectId);
  } catch (err: any) {
    error = err.message || "An unknown error occurred while fetching company overview";
  }
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
  };

  const formatPercent = (percent: number) => {
    return `${percent.toFixed(1)}%`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.875rem', fontWeight: 700, color: '#111827' }}>{currentProjectId === 'ALL' ? 'Executive Home' : 'Project Overview'}</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280' }}>
            {currentProjectId === 'ALL' ? 'Real-time consolidated view of all active projects.' : 'Real-time financial and risk view for the selected project.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button style={{ padding: '8px 16px', backgroundColor: '#ffffff', border: '1px solid #d1d5db', borderRadius: '6px', fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
            Export PDF
          </button>
          <button style={{ padding: '8px 16px', backgroundColor: '#2563eb', border: 'none', borderRadius: '6px', fontWeight: 500, color: '#ffffff', cursor: 'pointer' }}>
            Generate AI Summary
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ margin: 0, color: '#991b1b', fontSize: '1rem', fontWeight: 600 }}>Failed to load data</h3>
          <p style={{ margin: '4px 0 0', color: '#b91c1c', fontSize: '0.875rem' }}>{error}</p>
        </div>
      )}

      {/* Critical AI Alerts Section */}
      {data && data.totalCriticalRisks > 0 && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '24px' }}>⚠️</div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, color: '#991b1b', fontSize: '1rem', fontWeight: 600 }}>Critical AI Validations Required</h3>
            <p style={{ margin: '4px 0 0', color: '#b91c1c', fontSize: '0.875rem' }}>
              There are {data.totalCriticalRisks} projects with high-risk validation alerts (e.g., mismatched billing, missing evidence).
            </p>
          </div>
          <Link href="/executive/validation" style={{ padding: '8px 16px', backgroundColor: '#dc2626', color: 'white', textDecoration: 'none', borderRadius: '6px', fontSize: '0.875rem', fontWeight: 500 }}>
            Review Risks
          </Link>
        </div>
      )}

      {/* Top Level KPIs */}
      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
            <KpiCard 
          title="Active Projects" 
          value={data.activeProjectsCount.toString()} 
          icon="🏗️" 
        />
        <KpiCard 
          title="Revised Contract Amount" 
          value={formatCurrency(data.revisedContractAmount)} 
          subValue={
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f3f4f6', paddingTop: '8px' }}>
                <span style={{ color: '#6b7280' }}>Original Contract:</span>
                <span style={{ fontWeight: 500, color: '#374151' }}>{formatCurrency(data.totalContractAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280' }}>Variation Orders:</span>
                <span style={{ fontWeight: 500, color: data.totalApprovedVOs > 0 ? '#10b981' : '#374151' }}>
                  {data.totalApprovedVOs > 0 ? '+' : ''}{formatCurrency(data.totalApprovedVOs)}
                </span>
              </div>
            </div>
          }
          icon="📋" 
        />
        <KpiCard 
          title="Total Billed to Clients" 
          value={formatCurrency(data.totalBilledAmount)} 
          subValue={`Progress: ${formatPercent(data.overallProgressPercentage)}`}
          icon="🧾" 
        />
        <KpiCard 
          title="Total Actual Costs" 
          value={formatCurrency(data.totalActualCost)} 
          subValue={`Cost to Date: ${formatPercent(data.costToDateRatio)}`}
          icon="💸" 
          trend={data.costToDateRatio > data.overallProgressPercentage ? 'Warning: Costs exceed progress' : 'Healthy Margin'}
          trendPositive={data.costToDateRatio <= data.overallProgressPercentage}
        />
      </div>

      {/* Secondary Financial KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#374151', borderBottom: '1px solid #f3f4f6', paddingBottom: '12px' }}>Cash Flow Snapshot</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#6b7280' }}>Total Collected</span>
              <span style={{ fontWeight: 600, color: '#10b981' }}>{formatCurrency(data.totalCollectedAmount)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#6b7280' }}>Outstanding Receivables</span>
              <span style={{ fontWeight: 600, color: '#f59e0b' }}>{formatCurrency(data.totalOutstandingReceivables)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f3f4f6', paddingTop: '16px' }}>
              <span style={{ color: '#374151', fontWeight: 600 }}>Total Project Expenses To Date</span>
              <span style={{ fontWeight: 700, color: '#ef4444' }}>{formatCurrency(data.totalProjectExpensesToDate)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '16px', borderLeft: '2px solid #f3f4f6', marginTop: '-4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                <span style={{ color: '#6b7280' }}>Supplier Payables</span>
                <span style={{ color: '#ef4444' }}>{formatCurrency(data.totalSupplierPayables)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                <span style={{ color: '#6b7280' }}>Subcon Payables</span>
                <span style={{ color: '#ef4444' }}>{formatCurrency(data.totalSubcontractPayables)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                <span style={{ color: '#6b7280' }}>Job Order Payables</span>
                <span style={{ color: '#ef4444' }}>{formatCurrency(data.totalJobOrderPayables)}</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#374151', borderBottom: '1px solid #f3f4f6', paddingBottom: '12px' }}>Executive Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
             <Link href="/executive/validation" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', textDecoration: 'none', color: '#334155', fontWeight: 500, border: '1px solid #e2e8f0' }}>
               <span>Review AI Validations</span>
               <span>→</span>
             </Link>
             <Link href="/director-audit" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', textDecoration: 'none', color: '#334155', fontWeight: 500, border: '1px solid #e2e8f0' }}>
               <span>Pending Approvals</span>
               <span>→</span>
             </Link>
             <Link href="/executive/reports" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', textDecoration: 'none', color: '#334155', fontWeight: 500, border: '1px solid #e2e8f0' }}>
               <span>AI Intelligence Center</span>
               <span>→</span>
             </Link>
          </div>
        </div>
      </div>
      </>
      )}

    </div>
  );
}

// Reusable KPI Card Component
function KpiCard({ title, value, subValue, icon, trend, trendPositive }: any) {
  return (
    <div style={{ 
      backgroundColor: '#ffffff', 
      borderRadius: '12px', 
      padding: '24px', 
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      border: '1px solid #e5e7eb',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </span>
        <span style={{ fontSize: '1.5rem' }}>{icon}</span>
      </div>
      <div>
        <div style={{ fontSize: '1.875rem', fontWeight: 700, color: '#111827' }}>
          {value}
        </div>
        {subValue && (
          <div style={{ fontSize: '0.875rem', color: '#4b5563', marginTop: '4px' }}>
            {subValue}
          </div>
        )}
      </div>
      {trend && (
        <div style={{ 
          fontSize: '0.875rem', 
          fontWeight: 500,
          color: trendPositive === true ? '#10b981' : (trendPositive === false ? '#ef4444' : '#6b7280'),
          backgroundColor: trendPositive === true ? '#d1fae5' : (trendPositive === false ? '#fee2e2' : '#f3f4f6'),
          padding: '4px 8px',
          borderRadius: '4px',
          alignSelf: 'flex-start',
          marginTop: 'auto'
        }}>
          {trend}
        </div>
      )}
    </div>
  );
}
