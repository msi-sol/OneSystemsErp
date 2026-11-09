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
        // PARTIALLY_PAID was missing, so a billing dropped out of "Billed" and "Total Collections" as soon as the
        // first payment was recorded.
        billings: { where: { status: { in: ['APPROVED', 'SUBMITTED', 'PARTIALLY_PAID', 'PAID'] } }, include: { payments: true } },
        expenses: { where: { status: 'APPROVED' } },
        // Approved or paid only: drafts and billings still in validation are not costs yet.
        subcontractBillings: { where: { status: { in: ['APPROVED_FOR_PAYMENT', 'PAID'] } }, select: { currentGross: true } },
        projectCostLedgers: { where: { approvalStatus: 'APPROVED' }, select: { netAmount: true, costCategory: true, referenceDocumentType: true } },
        // Approved (or already billed) accomplishments: physical progress earned so far.
        accomplishments: { where: { status: { in: ['APPROVED', 'BILLED'] } }, select: { approvedAmount: true } },
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

  // The approved work-package plan's span (first planned start to last planned finish), used for the timeline when
  // no contract dates are recorded, so an approved, fully dated plan is not shown as "Not scheduled".
  const baseline = await prisma.projectSchedule.findFirst({ where: { projectId, workflowStatus: 'ACTIVE_BASELINE' }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  const planSpan = baseline ? await prisma.scheduleActivity.aggregate({ where: { scheduleId: baseline.id }, _min: { plannedStartDate: true }, _max: { plannedFinishDate: true } }) : null;
  const planStart = planSpan?._min.plannedStartDate ?? null;
  const planFinish = planSpan?._max.plannedFinishDate ?? null;

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
  // Approved direct and petty-cash expenses as posted to the actual-cost ledger. Summing approved Expense rows
  // also counted supplier payment records (category MATERIALS), whose cost is already in the delivery postings.
  const totalExpenses = project.projectCostLedgers
    .filter(entry => entry.referenceDocumentType === 'DIRECT_EXPENSE' || entry.referenceDocumentType === 'PETTY_CASH')
    .reduce((sum, entry) => sum + entry.netAmount, 0);
  const totalSubcontract = project.subcontractBillings.reduce((sum, sb) => sum + sb.currentGross, 0);
  // Match the approved actual-cost ledger used by the profitability module,
  // including delivery costs and avoiding a second sum of their source records.
  const totalCostToDate = project.projectCostLedgers.reduce((sum, entry) => sum + entry.netAmount, 0);
  const approvedActualCostEntries = project.projectCostLedgers.length;
  // Actual cost by category (materials from approved deliveries, labor, subcontract…), so the breakdown adds up to
  // the actual cost shown above. It used to list only petty-cash expenses and subcontract billings.
  const costByCategory = Object.entries(project.projectCostLedgers.reduce<Record<string, number>>((totals, entry) => {
    const key = (entry.costCategory || 'UNCODED').replaceAll('_', ' ');
    totals[key] = (totals[key] || 0) + entry.netAmount;
    return totals;
  }, {})).sort((a, b) => b[1] - a[1]);
  const earnedValue = project.accomplishments.reduce((sum, entry) => sum + (entry.approvedAmount || 0), 0);
  const physicalProgress = revisedContract > 0 ? (earnedValue / revisedContract) * 100 : 0;
  
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
  const DAY = 1000 * 3600 * 24;
  // Which dates the timeline shows: the contract dates when recorded, else the approved plan (finish inclusive).
  const timelineSource: 'contract' | 'plan' | null = startDate && endDate ? 'contract' : planStart && planFinish && planFinish >= planStart ? 'plan' : null;
  const shownStart = timelineSource === 'contract' ? startDate : timelineSource === 'plan' ? planStart : null;
  const shownEnd = timelineSource === 'contract' ? endDate : timelineSource === 'plan' ? planFinish : null;

  if (timelineSource && shownStart && shownEnd) {
    const now = new Date();
    const endExclusive = timelineSource === 'plan' ? shownEnd.getTime() + DAY : shownEnd.getTime();
    totalDays = Math.max(1, Math.round((endExclusive - shownStart.getTime()) / DAY));
    daysElapsed = Math.max(0, Math.ceil((Math.min(now.getTime(), endExclusive) - shownStart.getTime()) / DAY));
    timeProgress = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100));
  }
  const shortDate = (date: Date | null) => date ? date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }) : 'N/A';

  const formatCurrency = (amount: number) => `₱ ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // With no approved ledger entries the cost is not known yet ("Not available"), which differs from a recorded ₱0.00.
  // It is shown in a neutral colour: red read as an alarm next to the green "100% remaining".
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
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', margin: '14px 0 8px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Physical Progress (approved accomplishment)</span>
              <span style={{ fontWeight: 'bold' }}>{physicalProgress < 0.1 && physicalProgress > 0 ? physicalProgress.toFixed(2) : physicalProgress.toFixed(1)}%</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, physicalProgress)}%`, height: '100%', background: '#10b981', borderRadius: '4px' }} />
            </div>
            <div style={{ fontSize: '0.8rem', marginTop: '8px', color: 'var(--text-secondary)' }}>Earned value: {formatCurrency(earnedValue)}</div>
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
              <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold', color: approvedActualCostEntries === 0 ? 'var(--text-primary)' : '#ff6b6b' }}>{actualCostDisplay}</p>
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
                {/* Without dates there is no timeline; "0 / 0 Days" read like a real zero-day schedule. */}
                {timelineSource ? `${daysElapsed} / ${totalDays} ${totalDays === 1 ? 'Day' : 'Days'}${timelineSource === 'plan' ? ' (plan)' : ''}` : 'Not scheduled'}
              </p>
            </div>
            {/* With no contract dates yet, the editor starts from the approved plan's dates, so one save records them. */}
            <ProjectTimelineEditor
              projectId={projectId}
              initialStartDate={project.startDate?.toISOString() || (timelineSource === 'plan' ? planStart?.toISOString() ?? null : null)}
              initialDuration={project.originalContractDuration || totalDays || null}
            />
          </div>

          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Time Elapsed</span>
              <span style={{ fontWeight: 'bold' }}>{timelineSource ? `${timeProgress.toFixed(1)}%` : '—'}</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${timeProgress}%`, height: '100%', background: '#a855f7', borderRadius: '4px', transition: 'width 1s ease-in-out' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '8px', color: 'var(--text-secondary)' }}>
              <span>Start: {shortDate(shownStart)}</span>
              <span>{timelineSource === 'plan' ? 'Plan finish' : 'Target'}: {shortDate(shownEnd)}</span>
            </div>
            {timelineSource === 'plan' && <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No contract dates recorded; showing the approved work-package plan. Use Edit Timeline to record the contract dates.</p>}
            {!timelineSource && <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Set the contract start and duration with Edit Timeline, or approve a dated work-package plan.</p>}
          </div>
        </div>

      </div>

      {/* BOQ and schedule status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
        <section style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Latest BOQ version</h3>
          {boqVersion ? <>
            {/* The import label ("Draft BOQ Workspace Import") is kept after approval; showing it next to "Status: APPROVED" contradicted itself. */}
            <p style={{ margin: '0 0 6px', fontWeight: 700 }}>Version {boqVersion.versionNumber}{boqVersion.versionLabel && !(boqVersion.status !== 'DRAFT' && /^draft\b/i.test(boqVersion.versionLabel)) ? ` · ${boqVersion.versionLabel}` : ''}</p>
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
        
        {/* These cards looked clickable (pointer cursor) but went nowhere; each now opens where its number comes from. */}
        {([
          { href: `/projects/${projectId}?tab=billing`, label: 'Total Collections', value: formatCurrency(totalCollected), icon: <DollarSign size={24} color="#4ade80" />, tint: 'rgba(74, 222, 128, 0.1)' },
          { href: `/projects/${projectId}?tab=variation-orders`, label: 'Approved VOs', value: formatCurrency(approvedAdditive - approvedDeductive), icon: <FileText size={24} color="#fbbf24" />, tint: 'rgba(251, 191, 36, 0.1)' },
          { href: '/procurement/purchase-orders', label: 'Active Purchase Orders', value: String(activePOs), icon: <Truck size={24} color="#38bdf8" />, tint: 'rgba(56, 189, 248, 0.1)' },
          { href: '/workers', label: 'Active Site Workers', value: String(activeWorkers), icon: <HardHat size={24} color="#f472b6" />, tint: 'rgba(244, 114, 182, 0.1)' },
        ]).map(card => (
          <Link key={card.label} href={card.href} className={styles.statCard} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', color: 'inherit', textDecoration: 'none' }}>
            <div style={{ background: card.tint, padding: '12px', borderRadius: '50%' }}>{card.icon}</div>
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{card.label}</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{card.value}</div>
            </div>
          </Link>
        ))}

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
              <span style={{ color: 'var(--text-secondary)' }}>Subcontractor Billings (approved)</span>
              <span style={{ fontWeight: 'bold' }}>{formatCurrency(totalSubcontract)}</span>
            </div>
            {costByCategory.map(([category, amount]) => <div key={category} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>Actual cost · {category.toLowerCase()}</span>
              <span style={{ fontWeight: 'bold' }}>{formatCurrency(amount)}</span>
            </div>)}
            <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '10px' }}>
              Detailed breakdowns are available in their respective tabs.
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
