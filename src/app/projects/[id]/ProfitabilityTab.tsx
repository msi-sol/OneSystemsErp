'use client';

import React, { useEffect, useState } from 'react';
import { getProjectProfitability } from '@/app/actions/profitabilityActions';

interface Props {
  projectId: string;
}

const peso = (value: number) => `₱ ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS: Record<string, { label: string; color: string; background: string }> = {
  NOT_STARTED: { label: 'No cost yet', color: 'var(--text-secondary)', background: 'rgba(255, 255, 255, 0.06)' },
  WITHIN_CONTRACT: { label: 'Within contract', color: '#10b981', background: 'rgba(16, 185, 129, 0.2)' },
  OVERRUN: { label: 'Overrun', color: '#ef4444', background: 'rgba(239, 68, 68, 0.2)' },
};

export default function ProfitabilityTab({ projectId }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchProfitability() {
      try {
        const res = await getProjectProfitability(projectId);
        if (res.success) {
          setData(res.data);
        } else {
          setError(res.error || 'Failed to load profitability data');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchProfitability();
  }, [projectId]);

  if (loading) return <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>Loading Engine...</div>;
  if (error) return <div style={{ padding: '20px', color: '#ef4444' }}>Error: {error}</div>;
  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', marginTop: '20px' }}>
      
      <div style={{
        background: 'linear-gradient(135deg, rgba(0, 255, 163, 0.1), rgba(0, 204, 130, 0.05))',
        border: '1px solid var(--glass-border)',
        borderRadius: '16px',
        padding: '30px'
      }}>
        <h2 style={{ margin: '0 0 20px 0', color: 'var(--text-primary)', fontSize: '1.4rem' }}>Realtime Profitability Engine</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          
          <div style={{ background: 'var(--bg-dark)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 'bold' }}>Contract Revenue (Awarded BOQ)</p>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.8rem' }}>
              ₱ {data.contractRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>

          <div style={{ background: 'var(--bg-dark)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 'bold' }}>Target Execution Cost (Benchmark)</p>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.8rem' }}>
              ₱ {data.targetExecutionCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>

          <div style={{ background: 'var(--bg-dark)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 'bold' }}>Open Commitments (not yet delivered)</p>
            <h3 style={{ margin: 0, color: '#f59e0b', fontSize: '1.8rem' }}>
              ₱ {data.committedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>

          <div style={{ background: 'var(--bg-dark)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 'bold' }}>Actual Cost Incurred (Paid / Delivered)</p>
            <h3 style={{ margin: 0, color: '#ef4444', fontSize: '1.8rem' }}>
              ₱ {data.actualCostIncurred.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>

        </div>

        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '30px 0' }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          
          <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(0,0,0,0.2)' }}>
            <p style={{ margin: '0 0 5px 0', color: 'var(--text-secondary)' }}>Target Profit (Contract - Target Cost)</p>
            <h2 style={{ margin: 0, color: 'var(--accent-color)' }}>
              ₱ {data.targetProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span style={{ fontSize: '1rem', marginLeft: '10px', color: 'var(--text-secondary)' }}>
                ({data.targetProfitMargin.toFixed(2)}%)
              </span>
            </h2>
          </div>

          <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(0,0,0,0.2)' }}>
            <p style={{ margin: '0 0 5px 0', color: 'var(--text-secondary)' }}>Execution Variance (Target Cost - Actual Cost)</p>
            <h2 style={{ margin: 0, color: data.executionVariance >= 0 ? 'var(--accent-color)' : '#ef4444' }}>
              ₱ {data.executionVariance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
          </div>

          <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(0,0,0,0.2)' }}>
            <p style={{ margin: '0 0 5px 0', color: 'var(--text-secondary)' }}>Realized Profitability (Contract - Actual Cost)</p>
            <h2 style={{ margin: 0, color: data.realizedProfit >= 0 ? '#3b82f6' : '#ef4444' }}>
              ₱ {data.realizedProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span style={{ fontSize: '1rem', marginLeft: '10px', color: 'var(--text-secondary)' }}>
                ({data.realizedProfitMargin.toFixed(2)}%)
              </span>
            </h2>
          </div>

        </div>
        
        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '30px 0' }} />

        {/* Savings are measured only on what has been ordered; the unspent budget is shown separately. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          <div style={{ padding: '20px', borderRadius: '12px', background: data.purchaseSavings.savings < 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', border: `1px solid ${data.purchaseSavings.savings < 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}` }}>
            <h3 style={{ margin: '0 0 8px 0', color: data.purchaseSavings.savings < 0 ? '#ef4444' : '#10b981' }}>
              {data.purchaseSavings.savings < 0 ? 'Paying above the benchmark' : 'Savings on purchases so far'}
            </h3>
            {data.purchaseSavings.lines === 0 ? <>
              <h2 style={{ margin: '0 0 8px 0', color: 'var(--text-secondary)', fontSize: '1.8rem' }}>No purchases yet</h2>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Savings appear once purchase orders are approved: the benchmark rate for the ordered quantity minus the PO price.</p>
            </> : <>
              <h2 style={{ margin: '0 0 8px 0', color: data.purchaseSavings.savings < 0 ? '#ef4444' : '#10b981', fontSize: '2rem' }}>
                {data.purchaseSavings.savings < 0 ? '−' : '+'} {peso(Math.abs(data.purchaseSavings.savings))}
              </h2>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Ordered {peso(data.purchaseSavings.orderedAmount)} on {data.purchaseSavings.lines} PO {data.purchaseSavings.lines === 1 ? 'line' : 'lines'}; the benchmark allows {peso(data.purchaseSavings.budgetForOrdered)} for the same quantities.
              </p>
            </>}
          </div>
          <div style={{ padding: '20px', borderRadius: '12px', background: data.isOverrun ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0,0,0,0.2)', border: `1px solid ${data.isOverrun ? 'rgba(239, 68, 68, 0.3)' : 'var(--glass-border)'}` }}>
            <h3 style={{ margin: '0 0 8px 0', color: data.isOverrun ? '#ef4444' : 'var(--text-primary)' }}>{data.isOverrun ? 'Over the benchmark budget' : 'Budget left to spend'}</h3>
            <h2 style={{ margin: '0 0 8px 0', color: data.isOverrun ? '#ef4444' : 'var(--text-primary)', fontSize: '2rem' }}>{data.isOverrun ? '−' : ''}{peso(Math.abs(data.budgetLeft))}</h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Benchmark {peso(data.targetExecutionCost)} − actual {peso(data.actualCostIncurred)} − open commitments {peso(data.committedCost)}.{data.isOverrun ? ' Executive review required.' : ' Not a saving: it is budget not yet spent or committed.'}
            </p>
          </div>
        </div>

        {/* NEW: Cash Flow Section */}
        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '30px 0' }} />
        <h2 style={{ margin: '0 0 20px 0', color: 'var(--text-primary)', fontSize: '1.4rem' }}>Cash Flow Snapshot</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
          <div style={{ background: 'var(--bg-dark)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 'bold' }}>Total Billed</p>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.5rem' }}>
              ₱ {data.cashFlow.totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          
          <div style={{ background: 'var(--bg-dark)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 'bold' }}>Total Collected</p>
            <h3 style={{ margin: 0, color: '#10b981', fontSize: '1.5rem' }}>
              ₱ {data.cashFlow.totalCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          
          <div style={{ background: 'var(--bg-dark)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 'bold' }}>Uncollected Billing</p>
            <h3 style={{ margin: 0, color: '#f59e0b', fontSize: '1.5rem' }}>
              ₱ {data.cashFlow.uncollectedBilling.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          
          <div style={{ background: 'var(--bg-dark)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 'bold' }}>Total Payables</p>
            <h3 style={{ margin: 0, color: '#ef4444', fontSize: '1.5rem' }}>
              ₱ {data.cashFlow.totalPayables.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
          
          <div style={{ background: 'var(--bg-dark)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
            <p style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 'bold' }}>Cash Surplus/Deficit</p>
            <h3 style={{ margin: 0, color: data.cashFlow.cashSurplus >= 0 ? '#10b981' : '#ef4444', fontSize: '1.5rem' }}>
              ₱ {data.cashFlow.cashSurplus.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
        </div>

        {/* NEW: BOQ-Level Profitability Section */}
        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '40px 0' }} />
        <h2 style={{ margin: '0 0 20px 0', color: 'var(--text-primary)', fontSize: '1.4rem' }}>BOQ-Level Profitability</h2>
        
        <div className="table-container" style={{ marginTop: '20px' }}>
          <table className="glass-table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Awarded Value</th>
                <th style={{ textAlign: 'right' }}>Cost so far (actual + open)</th>
                <th style={{ textAlign: 'right' }}>Awarded − cost</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.boqLevelDetails.map((item: any) => (
                <tr key={item.id}>
                  <td>{item.itemCode || '-'}</td>
                  <td style={{ maxWidth: '250px', whiteSpace: 'normal' }}>{item.description}</td>
                  <td style={{ textAlign: 'right' }}>₱{item.awardedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right' }}>₱{item.actualCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right', color: item.status === 'NOT_STARTED' ? 'var(--text-secondary)' : item.variance >= 0 ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                    {item.status === 'NOT_STARTED' ? '—' : `₱${item.variance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </td>
                  <td>
                    <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', whiteSpace: 'nowrap', backgroundColor: (STATUS[item.status] || STATUS.NOT_STARTED).background, color: (STATUS[item.status] || STATUS.NOT_STARTED).color }}>
                      {(STATUS[item.status] || STATUS.NOT_STARTED).label}
                    </span>
                  </td>
                </tr>
              ))}
              {data.unlinkedCost > 0 && (
                <tr>
                  <td>—</td>
                  <td style={{ whiteSpace: 'normal' }}><strong>Not linked to a BOQ item</strong><div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Costs whose material or subcontract has no BOQ link. Link benchmark lines to the BOQ in the Procurement Benchmark AI Check.</div></td>
                  <td style={{ textAlign: 'right' }}>—</td>
                  <td style={{ textAlign: 'right' }}>₱{data.unlinkedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right' }}>—</td>
                  <td />
                </tr>
              )}
              {data.boqLevelDetails.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>No BOQ items found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
