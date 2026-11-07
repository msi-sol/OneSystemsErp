import { prisma } from '@/lib/prisma';
import React from 'react';
import Link from 'next/link';
import { 
  Wallet, DollarSign, Activity, FileText, Truck, HardHat, Calendar, BarChart3, Receipt
} from 'lucide-react';
import ProjectTimelineEditor from './ProjectTimelineEditor';
import styles from './ProjectSummary.module.css';
import { RECEIVABLE_PO_STATUSES } from '@/lib/procurement/receivable-purchase-order';
import { summarizeMaterialRequests } from '@/lib/procurement/request-summary';

export default async function ProjectSummaryTab({ projectId }: { projectId: string }) {
  const [project, boqVersion, latestSchedule] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      include: {
        variationOrders: { where: { currentStatus: 'APPROVED' } },
        billings: { where: { status: { in: ['APPROVED', 'SUBMITTED', 'PAID'] } }, include: { payments: true } },
        expenses: { where: { status: 'APPROVED' } },
        subcontractBillings: true,
        projectCostLedgers: { where: { approvalStatus: 'APPROVED' }, select: { netAmount: true } },
        materialRequests: true,
        workers: { where: { employmentStatus: 'ACTIVE' } },
        awardedBoqItems: { select: { id: true } },
      }
    }),
    prisma.projectBOQVersion.findFirst({
      where: { projectId },
      orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { versionNumber: true, versionLabel: true, status: true, totalAmount: true, sourceProvenance: true },
    }),
    prisma.projectSchedule.findFirst({
      where: { projectId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        name: true, workflowStatus: true, baselineCode: true, revisionCode: true,
        _count: { select: { activities: true } },
      },
    }),
  ]);

  if (!project) return null;

  // Calculate Financials
  const originalContract = project.contractAmount || 0;
  let approvedAdditive = 0;
  let approvedDeductive = 0;
  project.variationOrders.forEach(vo => {
    approvedAdditive += (vo.additionalAmount || 0);
    approvedDeductive += (vo.deductiveAmount || 0);
  });
  const revisedContract = originalContract + approvedAdditive - approvedDeductive;

  const totalBilled = project.billings.reduce((sum, b) => sum + b.currentBillingAmount, 0);
  const totalCollected = project.billings.reduce((sum, b) => {
    return sum + b.payments.reduce((psum, p) => psum + p.amountPaid, 0);
  }, 0);
  const financialProgress = revisedContract > 0 ? (totalBilled / revisedContract) * 100 : 0;

  // Calculate Costs
  const totalExpenses = project.expenses.reduce((sum, e) => sum + e.netAmount, 0);
  const totalSubcontract = project.subcontractBillings.reduce((sum, sb) => sum + sb.currentGross, 0);
  // Match the approved actual-cost ledger used by the profitability module,
  // including delivery costs and avoiding a second sum of their source records.
  const totalCostToDate = project.projectCostLedgers.reduce((sum, entry) => sum + entry.netAmount, 0);
  const approvedActualCostEntries = project.projectCostLedgers.length;
  
  // This balance excludes all future costs; keep the existing calculation but do not present it as a forecast.
  const contractLessActualCost = revisedContract - totalCostToDate;
  const contractLessActualCostPercent = revisedContract > 0 ? (contractLessActualCost / revisedContract) * 100 : 0;

  // Queries for other stats
  const activePOs = await prisma.purchaseOrder.count({
    where: {
      status: { in: [...RECEIVABLE_PO_STATUSES] },
      mr: { projectId }
    }
  });

  const { pending: pendingMRs, approved: approvedMRs } = summarizeMaterialRequests(project.materialRequests);
  const activeWorkers = project.workers.length;

  // Timeline Calculations
  const startDate = project.startDate ? new Date(project.startDate) : null;
  const endDate = project.revisedCompletionDate ? new Date(project.revisedCompletionDate) : (project.originalCompletionDate ? new Date(project.originalCompletionDate) : null);
  
  let daysElapsed = 0;
  let totalDays = 0;
  let timeProgress = 0;

  if (startDate && endDate) {
    const now = new Date();
    totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)));
    daysElapsed = Math.max(0, Math.ceil((Math.min(now.getTime(), endDate.getTime()) - startDate.getTime()) / (1000 * 3600 * 24)));
    timeProgress = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100));
  }

  const formatCurrency = (amount: number) => `₱ ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const actualCostDisplay = approvedActualCostEntries === 0 ? 'Not available' : formatCurrency(totalCostToDate);

  return (
    <div className={styles.summary} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Top Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '20px' }}>
        
        {/* Contract & Financial Progress */}
        <div style={{ 
          background: 'var(--glass-bg)', 
          border: '1px solid var(--glass-border)', 
          borderRadius: '12px', 
          padding: '24px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ padding: '10px', background: 'rgba(0, 240, 255, 0.1)', borderRadius: '8px' }}>
              <Wallet size={24} color="var(--accent-color)" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-secondary)' }}>Revised Contract Value</h3>
              <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-color)' }}>{formatCurrency(revisedContract)}</p>
            </div>
          </div>
          
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Financial Progress (Billed)</span>
              <span style={{ fontWeight: 'bold' }}>{financialProgress.toFixed(1)}%</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${financialProgress}%`, height: '100%', background: 'var(--accent-color)', borderRadius: '4px', transition: 'width 1s ease-in-out' }} />
            </div>
            <div className={styles.factsRow} style={{ fontSize: '0.8rem', marginTop: '8px', color: 'var(--text-secondary)' }}>
              <span>Billed: {formatCurrency(totalBilled)}</span>
              <span>Remaining: {formatCurrency(Math.max(0, revisedContract - totalBilled))}</span>
            </div>
          </div>
        </div>

        {/* Cost & Profitability */}
        <div style={{ 
          background: 'var(--glass-bg)', 
          border: '1px solid var(--glass-border)', 
          borderRadius: '12px', 
          padding: '24px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ padding: '10px', background: 'rgba(255, 100, 100, 0.1)', borderRadius: '8px' }}>
              <Activity size={24} color="#ff6b6b" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-secondary)' }}>Actual Cost to Date</h3>
              <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold', color: '#ff6b6b' }}>{actualCostDisplay}</p>
            </div>
          </div>
          
          <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Contract remaining after approved costs</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: contractLessActualCostPercent > 15 ? '#4ade80' : contractLessActualCostPercent > 5 ? '#fbbf24' : '#ef4444' }}>
                {contractLessActualCostPercent.toFixed(1)}%
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Balance before future costs: {formatCurrency(contractLessActualCost)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {approvedActualCostEntries === 0 ? 'No approved actual-cost ledger entries recorded.' : `${approvedActualCostEntries} approved actual-cost ledger ${approvedActualCostEntries === 1 ? 'entry' : 'entries'} included.`}
            </div>
          </div>
        </div>

        {/* Timeline Status */}
        <div style={{ 
          background: 'var(--glass-bg)', 
          border: '1px solid var(--glass-border)', 
          borderRadius: '12px', 
          padding: '24px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ padding: '10px', background: 'rgba(167, 139, 250, 0.1)', borderRadius: '8px' }}>
              <Calendar size={24} color="#a855f7" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Project Timeline</h3>
              <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold', color: '#a855f7' }}>
                {/* Without both dates there is no timeline; "0 / 0 Days" read like a real zero-day schedule. */}
                {startDate && endDate ? `${daysElapsed} / ${totalDays} ${totalDays === 1 ? 'Day' : 'Days'}` : 'Not scheduled'}
              </p>
            </div>
            <ProjectTimelineEditor 
              projectId={projectId} 
              initialStartDate={project.startDate?.toISOString() || null} 
              initialDuration={project.originalContractDuration || totalDays || null} 
            />
          </div>
          
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Time Elapsed</span>
              <span style={{ fontWeight: 'bold' }}>{timeProgress.toFixed(1)}%</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${timeProgress}%`, height: '100%', background: '#a855f7', borderRadius: '4px', transition: 'width 1s ease-in-out' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '8px', color: 'var(--text-secondary)' }}>
              <span>Start: {startDate ? startDate.toLocaleDateString() : 'N/A'}</span>
              <span>Target: {endDate ? endDate.toLocaleDateString() : 'N/A'}</span>
            </div>
          </div>
        </div>

      </div>

      {/* BOQ and schedule status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
        <section style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Latest BOQ version</h3>
          {boqVersion ? <>
            <p style={{ margin: '0 0 6px', fontWeight: 700 }}>Version {boqVersion.versionNumber}{boqVersion.versionLabel ? ` · ${boqVersion.versionLabel}` : ''}</p>
            <p style={{ margin: '0 0 6px', color: 'var(--text-secondary)' }}>Status: {boqVersion.status.replaceAll('_', ' ')}</p>
            <p style={{ margin: '0 0 6px', color: 'var(--text-secondary)' }}>BOQ total: {boqVersion.totalAmount === null ? 'Not available' : formatCurrency(boqVersion.totalAmount)}</p>
            <p style={{ margin: '0 0 6px', color: 'var(--text-secondary)' }}>{project.awardedBoqItems.length} project BOQ {project.awardedBoqItems.length === 1 ? 'item' : 'items'}</p>
            {boqVersion.status === 'DRAFT' && <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)' }}>{boqVersion.sourceProvenance === 'BOQ_WORKSPACE' ? 'Draft workbook import · not approved' : 'Draft BOQ version · not approved'}</p>}
          </> : <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)' }}>No BOQ version recorded. BOQ total and item count are unavailable.</p>}
          <Link href={`/projects/${projectId}/boq`} style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}>Open BOQ review →</Link>
        </section>

        <section style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Latest-created work package schedule</h3>
          {latestSchedule ? <>
            <p style={{ margin: '0 0 6px', fontWeight: 700 }}>{latestSchedule.name}</p>
            <p style={{ margin: '0 0 6px', color: 'var(--text-secondary)' }}>Status: {latestSchedule.workflowStatus.replaceAll('_', ' ')}</p>
            <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)' }}>{latestSchedule._count.activities} {latestSchedule._count.activities === 1 ? 'package' : 'packages'}{latestSchedule.baselineCode ? ` · ${latestSchedule.baselineCode}` : latestSchedule.revisionCode ? ` · ${latestSchedule.revisionCode}` : ''}</p>
          </> : <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)' }}>No work package schedule recorded; package count and execution status are unavailable.</p>}
          <Link href={`/projects/${projectId}/work-packages`} style={{ color: 'var(--accent-color)', textDecoration: 'underline' }}>Open Work Packages and WPS →</Link>
        </section>
      </div>

      {/* Middle Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px' }}>
        
        {/* Collections */}
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', transition: 'transform 0.2s', cursor: 'pointer' }}>
          <div style={{ background: 'rgba(74, 222, 128, 0.1)', padding: '12px', borderRadius: '50%' }}>
            <DollarSign size={24} color="#4ade80" />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Total Collections</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{formatCurrency(totalCollected)}</div>
          </div>
        </div>

        {/* Variation Orders */}
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', transition: 'transform 0.2s', cursor: 'pointer' }}>
          <div style={{ background: 'rgba(251, 191, 36, 0.1)', padding: '12px', borderRadius: '50%' }}>
            <FileText size={24} color="#fbbf24" />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Approved VOs</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{formatCurrency(approvedAdditive - approvedDeductive)}</div>
          </div>
        </div>

        {/* Purchase Orders */}
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', transition: 'transform 0.2s', cursor: 'pointer' }}>
          <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '12px', borderRadius: '50%' }}>
            <Truck size={24} color="#38bdf8" />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Active Purchase Orders</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{activePOs}</div>
          </div>
        </div>

        {/* Workforce */}
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', transition: 'transform 0.2s', cursor: 'pointer' }}>
          <div style={{ background: 'rgba(244, 114, 182, 0.1)', padding: '12px', borderRadius: '50%' }}>
            <HardHat size={24} color="#f472b6" />
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Active Site Workers</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{activeWorkers}</div>
          </div>
        </div>

      </div>

      {/* Bottom Layout - Charts & Logs placeholder */}
      <div className={styles.bottomGrid}>
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart3 size={20} color="var(--accent-color)" /> Material Requests Activity
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Requests awaiting action</span>
              <span style={{ fontWeight: 'bold', color: '#fbbf24' }}>{pendingMRs}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Approved Requests</span>
              <span style={{ fontWeight: 'bold', color: '#4ade80' }}>{approvedMRs}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total Logged</span>
              <span style={{ fontWeight: 'bold' }}>{project.materialRequests.length}</span>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Receipt size={20} color="#a855f7" /> Ledger Breakdown
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Direct Expenses (Petty Cash/Misc)</span>
              <span style={{ fontWeight: 'bold' }}>{formatCurrency(totalExpenses)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Subcontractor Billings</span>
              <span style={{ fontWeight: 'bold' }}>{formatCurrency(totalSubcontract)}</span>
            </div>
            <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '10px' }}>
              Detailed breakdowns are available in their respective tabs.
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
