import { prisma } from '@/lib/prisma';
import styles from '../page.module.css';
import Link from 'next/link';
import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { notFound, redirect } from 'next/navigation';
import { checkSchedulingAccess, getSessionActor } from '@/lib/scheduling/authUtils';

import BOQActions from './BOQActions';
import AwardedBOQViewer from './AwardedBOQViewer';
import DraftBoqEditor from './DraftBoqEditor';
import { buildDraftBoqChecksum } from '@/lib/boq/draft-workflow';
import BOQConsolidationTab from './BOQConsolidationTab';
import ProjectVariationOrdersTab from './ProjectVariationOrdersTab';
import ModuleKnowledgeTab from '@/app/knowledge-center/ModuleKnowledgeTab';
import ProfitabilityTab from './ProfitabilityTab';
import ProcurementBenchmarkTab from './ProcurementBenchmarkTab';
import ProjectCostLedgerTab from './ProjectCostLedgerTab';
import ProjectTeamClient from './ProjectTeamClient';
import ProjectSummaryTab from './ProjectSummaryTab';
import ProjectExpenseLedgerTab from './ProjectExpenseLedgerTab';
import ProjectPayrollCostTab from './ProjectPayrollCostTab';
import ProjectMaterialsControlTab from './ProjectMaterialsControlTab';
import ProjectSubcontractingTab from './ProjectSubcontractingTab';
import ProjectJobOrdersTab from './ProjectJobOrdersTab';
import ProjectAccomplishmentTab from './ProjectAccomplishmentTab';
import ProjectBillingTab from './ProjectBillingTab';
import ProjectReportsTab from './ProjectReportsTab';
import ProjectAuditTrailTab from './ProjectAuditTrailTab';
import ProjectAIAssistantTab from './ProjectAIAssistantTab';
import ProjectStatusOverride from './ProjectStatusOverride';

const PROJECT_TABS = [
  { id: 'summary', label: 'Project Summary', group: 'Overview' },
  { id: 'team-access', label: 'Team Access', group: 'Overview' },
  { id: 'awarded-boq', label: 'Contract Value & BOQ', group: 'Planning' },
  { id: 'work-packages', label: 'Work Packages', group: 'Planning' },
  { id: 'benchmark', label: 'Procurement Benchmark', group: 'Planning' },
  { id: 'consolidation', label: 'Master Materials List', group: 'Planning' },
  { id: 'profitability', label: 'Profitability Center (Cash Flow & Variance)', group: 'Financials' },
  { id: 'actual-cost', label: 'Actual Cost Ledger', group: 'Financials' },
  { id: 'expense-ledger', label: 'Expense Ledger', group: 'Financials' },
  { id: 'payroll-cost', label: 'Payroll Cost', group: 'Financials' },
  { id: 'materials-control', label: 'Materials Control', group: 'Execution' },
  { id: 'subcontracting', label: 'Subcontracting Control', group: 'Execution' },
  { id: 'job-orders', label: 'Job Order Control', group: 'Execution' },
  { id: 'accomplishment', label: 'Accomplishment & Earned Value', group: 'Billing' },
  { id: 'billing', label: 'Billing & Collection', group: 'Billing' },
  { id: 'variation-orders', label: 'Variation Orders', group: 'Management' },
  { id: 'reports', label: 'Reports', group: 'Management' },
  { id: 'audit-trail', label: 'Audit Trail', group: 'Management' },
  { id: 'ai-assistant', label: 'AI Assistant', group: 'Management' },
  { id: 'knowledge', label: 'Knowledge Base', group: 'Management' },
];

export const dynamic = 'force-dynamic';

function escapeBoqText(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export default async function ProjectDetailsPage({ 
  params,
  searchParams 
}: { 
  params: Promise<{ id: string }>,
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params;
  const { tab = 'summary' } = await searchParams;
  if (tab === 'awarded-boq') redirect(`/projects/${id}/boq`);
  if (tab === 'work-packages') redirect(`/projects/${id}/work-packages`);
  const actor = await getSessionActor().catch(() => null);
  if (!actor) redirect('/login');
  const access = await checkSchedulingAccess(actor.id, actor.role, id, 'canView');
  if (!access.allowed) notFound();
  
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      materialRequests: true,
      awardedBoqItems: { orderBy: { createdAt: 'asc' } },
      procurementBenchmarkItems: true,
      variationOrders: {
        where: { currentStatus: 'APPROVED' }
      },
      userAssignments: {
        include: { user: { select: { name: true, email: true, role: true, id: true } } },
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!project) {
    return <div style={{ padding: '20px', color: 'red' }}>Project not found.</div>;
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: actor.id },
    include: { userRoles: { include: { role: true } } }
  });
  const isPurchasingOfficer = currentUser?.userRoles.some(ur => ur.role.roleCode === 'PURCHASING_OFFICER');
  const boqVersion = tab === 'awarded-boq' ? await prisma.projectBOQVersion.findFirst({
    where: { projectId: id }, orderBy: { versionNumber: 'desc' },
  }) : null;
  const isDraftBoq = boqVersion?.status === 'DRAFT';
  const [boqEditAccess, boqApprovalAccess] = isDraftBoq ? await Promise.all([
    checkSchedulingAccess(actor.id, actor.role, id, 'canEditDraft'),
    checkSchedulingAccess(actor.id, actor.role, id, 'canApprove'),
  ]) : [{ allowed: false }, { allowed: false }];

  let htmlTable = '';
  let consolidatedHtmlTable = '';
  let hasBOQ = project.awardedBoqItems && project.awardedBoqItems.length > 0;

  let approvedAdditive = 0;
  let approvedDeductive = 0;
  project.variationOrders?.forEach(vo => {
    approvedAdditive += (vo.additionalAmount || 0);
    approvedDeductive += (vo.deductiveAmount || 0);
  });
  const revisedContractAmount = (project.contractAmount || 0) + approvedAdditive - approvedDeductive;

  let originalFileUrl = '';
  if (project.description && project.description.includes('BOQ File Uploaded: ')) {
    originalFileUrl = project.description.split('BOQ File Uploaded: ')[1].trim();
  }

  if (hasBOQ) {
    const hasVariations = project.variationOrders && project.variationOrders.length > 0;
    
    let customHtml = '<table><thead><tr style="background: #e0e0e0; font-weight: bold;"><th>Item No.</th><th>Description</th><th>Unit</th>';
    if (hasVariations) {
      customHtml += '<th>Original Qty</th><th>Deductive Qty</th><th>Additive Qty</th><th>Revised Qty</th><th>Unit Cost</th><th>Original Total Cost</th><th>Deductive Amount</th><th>Additive Amount</th><th>Revised Total Cost</th>';
    } else {
      customHtml += '<th>Qty</th><th>Unit Cost</th><th>Total Cost</th>';
    }
    customHtml += '</tr></thead><tbody>';

    for (const item of project.awardedBoqItems) {
      const originalQty = item.quantity || 0;
      const voQty = item.approvedClientVoQuantity || 0;
      const additiveQty = voQty > 0 ? voQty : 0;
      const deductiveQty = voQty < 0 ? Math.abs(voQty) : 0;
      const displayQty = item.revisedContractQuantity || originalQty;
      
      const originalTotalCost = item.totalCost || 0;
      const displayTotalCost = item.revisedContractAmount || originalTotalCost;
      const voAmount = displayTotalCost - originalTotalCost;
      const additiveAmount = voAmount > 0 ? voAmount : 0;
      const deductiveAmount = voAmount < 0 ? Math.abs(voAmount) : 0;
      
      const displayUnitCost = hasVariations
        ? (displayQty > 0 ? displayTotalCost / displayQty : 0)
        : item.combinedUnitCost;
      
      const isHeader = !item.quantity && !item.totalCost && !item.revisedContractAmount;
      const isVariation = item.description.includes('(VO)') || voQty !== 0 || voAmount !== 0;
      
      const rowStyle = isVariation ? 'color: #3b82f6; font-weight: 500; background-color: rgba(59, 130, 246, 0.05);' : '';
      
      customHtml += `<tr style="${rowStyle}">
        <td style="${isHeader ? 'font-weight: bold; background-color: rgba(0,0,0,0.05);' : ''}">${escapeBoqText(item.itemCode || '')}</td>
        <td style="${isHeader ? 'font-weight: bold; background-color: rgba(0,0,0,0.05);' : ''}">${escapeBoqText(item.description || '')}</td>
        <td style="${isHeader ? 'background-color: rgba(0,0,0,0.05);' : ''}">${escapeBoqText(item.unit || '')}</td>`;
      
      if (hasVariations) {
        customHtml += `
        <td style="${isHeader ? 'background-color: rgba(0,0,0,0.05);' : ''}">${originalQty > 0 || isVariation ? originalQty.toLocaleString() : ''}</td>
        <td style="${isHeader ? 'background-color: rgba(0,0,0,0.05);' : 'color: #ef4444;'}">${deductiveQty > 0 ? '-' + deductiveQty.toLocaleString() : ''}</td>
        <td style="${isHeader ? 'background-color: rgba(0,0,0,0.05);' : 'color: #10b981;'}">${additiveQty > 0 ? '+' + additiveQty.toLocaleString() : ''}</td>
        <td style="${isHeader ? 'background-color: rgba(0,0,0,0.05); font-weight: bold;' : 'font-weight: bold;'}">${displayQty > 0 ? displayQty.toLocaleString() : ''}</td>
        <td style="${isHeader ? 'background-color: rgba(0,0,0,0.05);' : ''}">${displayUnitCost > 0 ? displayUnitCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</td>
        <td style="${isHeader ? 'font-weight: bold; background-color: rgba(0,0,0,0.05);' : ''}">${originalTotalCost > 0 || isVariation ? originalTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}</td>
        <td style="${isHeader ? 'background-color: rgba(0,0,0,0.05);' : 'color: #ef4444;'}">${deductiveAmount > 0 ? '-₱ ' + deductiveAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}</td>
        <td style="${isHeader ? 'background-color: rgba(0,0,0,0.05);' : 'color: #10b981;'}">${additiveAmount > 0 ? '+₱ ' + additiveAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}</td>
        <td style="${isHeader ? 'font-weight: bold; background-color: rgba(0,0,0,0.05);' : 'font-weight: bold;'}">${displayTotalCost > 0 ? '₱ ' + displayTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}</td>`;
      } else {
        customHtml += `
        <td style="${isHeader ? 'background-color: rgba(0,0,0,0.05);' : ''}">${originalQty > 0 ? originalQty.toLocaleString() : ''}</td>
        <td style="${isHeader ? 'background-color: rgba(0,0,0,0.05);' : ''}">${displayUnitCost > 0 ? displayUnitCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</td>
        <td style="${isHeader ? 'font-weight: bold; background-color: rgba(0,0,0,0.05);' : ''}">${originalTotalCost > 0 ? '₱ ' + originalTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}</td>`;
      }
      
      customHtml += `</tr>`;
    }
    customHtml += '</tbody></table>';
    htmlTable = customHtml;

    // Generate Consolidated HTML Table for Schedule Verification
    const groups = new Map<string, any>();
    for (const item of project.awardedBoqItems) {
      let oldItemCode = item.itemCode || 'N/A';
      if (oldItemCode === 'N/A' || oldItemCode.trim() === '') {
        oldItemCode = item.description.trim();
      }
      const normalizedDesc = item.description.trim().toLowerCase();
      const normalizedUnit = (item.unit || '').trim().toLowerCase();
      const key = `${oldItemCode.toLowerCase()}||${normalizedDesc}||${normalizedUnit}`;
      
      if (!groups.has(key)) {
        groups.set(key, {
          itemCode: oldItemCode,
          description: item.description,
          unit: item.unit || 'lot',
          quantity: 0,
          totalCost: 0,
          unitCost: item.combinedUnitCost || item.revisedContractUnitPrice || 0
        });
      }
      const group = groups.get(key);
      group.quantity += (item.revisedContractQuantity || item.quantity || 0);
      group.totalCost += (item.revisedContractAmount || item.totalCost || 0);
    }

    let consHtml = '<table><thead><tr style="background: #0f172a; color: #38bdf8; font-weight: bold;"><th>Item No.</th><th>Description</th><th>Unit</th><th>Consolidated Quantity</th><th>Unit Cost</th><th>Total Cost</th></tr></thead><tbody>';
    let grandTotal = 0;
    for (const group of groups.values()) {
      grandTotal += group.totalCost;
      const displayGroupUnitCost = group.quantity > 0 ? group.totalCost / group.quantity : 0;
      consHtml += `<tr>
        <td>${escapeBoqText(group.itemCode || '')}</td>
        <td>${escapeBoqText(group.description || '')}</td>
        <td>${escapeBoqText(group.unit || '')}</td>
        <td>${group.quantity?.toLocaleString() || ''}</td>
        <td>${displayGroupUnitCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td>${group.totalCost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || ''}</td>
      </tr>`;
    }
    consHtml += `</tbody><tfoot><tr style="background: #0f172a; color: #38bdf8; font-weight: bold;"><td colSpan="5" style="text-align: right;">Grand Total:</td><td>₱ ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr></tfoot></table>`;
    consolidatedHtmlTable = consHtml;
  }

  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <Link href="/projects" style={{ color: 'var(--accent-color)', textDecoration: 'none', marginBottom: '10px', display: 'inline-block' }}>&larr; Back to Projects</Link>
          <h1>{project.name}</h1>
          <p style={{ whiteSpace: 'pre-wrap' }}>{project.description?.replace(/BOQ File Uploaded: .*/, '') || 'No description provided.'}</p>
          
        </div>
        <div className={styles.projectFacts}>
          <div style={{ fontSize: '1.15rem', color: 'var(--accent-color)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            ₱ {project.contractAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <ProjectStatusOverride projectId={project.id} currentStatus={project.status} />
          <div style={{ color: 'var(--text-secondary)' }}>Location: {project.location || 'N/A'}</div>
          {project.startDate && <div style={{ color: 'var(--text-secondary)' }}>Date Started: {new Date(project.startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} (15 Days post-NTP)</div>}
          {project.originalCompletionDate && <div style={{ color: 'var(--text-secondary)' }}>Target Completion: {new Date(project.originalCompletionDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} (180 Calendar Days)</div>}
        </div>
      </header>

      {/* TABS NAVIGATION OVERHAUL */}
      <div style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingBottom: '15px', borderBottom: '1px solid var(--glass-border)' }}>
          {PROJECT_TABS.map((t) => (
            <Link 
              key={t.id} 
              href={t.id === 'awarded-boq' ? `/projects/${project.id}/boq` : t.id === 'work-packages' ? `/projects/${project.id}/work-packages` : `/projects/${project.id}?tab=${t.id}`}
              style={{ 
                padding: '8px 14px', 
                textDecoration: 'none', 
                fontSize: '0.85rem',
                borderRadius: '20px',
                backgroundColor: tab === t.id ? 'var(--accent-color)' : 'rgba(255,255,255,0.05)',
                color: tab === t.id ? '#000' : 'var(--text-secondary)', 
                fontWeight: tab === t.id ? 'bold' : 'normal',
                border: tab === t.id ? 'none' : '1px solid var(--glass-border)',
                transition: 'all 0.2s'
              }}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {tab === 'summary' && (
        <ProjectSummaryTab projectId={project.id} />
      )}

      {tab === 'team-access' && (
        <ProjectTeamClient 
          projectId={project.id}
          teamMembers={project.userAssignments || []}
        />
      )}

      {tab === 'awarded-boq' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div>
              <h2 style={{ color: 'var(--text-primary)', margin: 0 }}>{isDraftBoq ? 'Draft BOQ' : 'Contract BOQ (Awarded)'}</h2>
              <div style={{ display: 'flex', gap: '20px', marginTop: '8px' }}>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '1rem' }}>
                  Original Contract: ₱ {project.contractAmount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                </p>
                {project.variationOrders && project.variationOrders.length > 0 && (
                  <p style={{ margin: 0, color: 'var(--accent-color)', fontWeight: 'bold', fontSize: '1.1rem' }}>
                    Revised Contract: ₱ {revisedContractAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
              <Link href={`/projects/${project.id}/scheduling`} className="btn-secondary">
                Open work packages
              </Link>
              {project.description && project.description.includes('BOQ File Uploaded: ') && (
                <a 
                  href={project.description.split('BOQ File Uploaded: ')[1]} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style={{ 
                    padding: '8px 16px', 
                    borderRadius: '8px', 
                    background: 'rgba(0, 240, 255, 0.1)', 
                    color: 'var(--accent-color)', 
                    textDecoration: 'none', 
                    fontWeight: 'bold',
                    fontSize: '0.9rem', 
                    border: '1px solid rgba(0, 240, 255, 0.3)',
                    transition: 'all 0.2s'
                  }}
                >
                  ⬇️ Download Original BOQ
                </a>
              )}
              {!isPurchasingOfficer && (
                <BOQActions projectId={project.id} isLocked={project.boqLocked} hasBOQ={hasBOQ} usesDraftApproval={isDraftBoq} />
              )}
            </div>
          </div>
          {isDraftBoq && boqVersion ? <DraftBoqEditor
            projectId={project.id}
            version={{ id: boqVersion.id, checksum: boqVersion.checksum || buildDraftBoqChecksum(project.awardedBoqItems) }}
            rows={project.awardedBoqItems.map(item => ({ id: item.id, itemCode: item.itemCode, description: item.description, unit: item.unit,
              quantity: item.quantity, combinedUnitCost: item.combinedUnitCost, totalCost: item.totalCost }))}
            contractAmount={project.contractAmount || 0}
            canEdit={boqEditAccess.allowed}
            canApprove={boqApprovalAccess.allowed}
          /> : <AwardedBOQViewer
            projectId={project.id}
            htmlTable={htmlTable} 
            consolidatedHtmlTable={consolidatedHtmlTable} 
            originalFileUrl={originalFileUrl}
            projectName={project.name}
          />}
        </>
      )}

      {tab === 'benchmark' && (
        <ProcurementBenchmarkTab 
          projectId={project.id} 
          isLocked={project.procurementBenchmarkLocked}
          items={project.procurementBenchmarkItems || []}
          totalItems={(project.procurementBenchmarkItems || []).length}
          totalAmount={(project.procurementBenchmarkItems || []).reduce((acc: number, cur: any) => acc + cur.totalCost, 0)}
        />
      )}

      {tab === 'consolidation' && (
        <BOQConsolidationTab projectId={project.id} isBenchmarkLocked={project.procurementBenchmarkLocked} />
      )}

      {tab === 'variation-orders' && (
        <ProjectVariationOrdersTab projectId={project.id} />
      )}

      {tab === 'profitability' && (
        <ProfitabilityTab projectId={project.id} />
      )}

      {tab === 'knowledge' && (
        <ModuleKnowledgeTab moduleId={project.id} moduleType="projectId" />
      )}
      
      {tab === 'actual-cost' && (
        <ProjectCostLedgerTab projectId={project.id} />
      )}

      {tab === 'expense-ledger' && (
        <ProjectExpenseLedgerTab projectId={project.id} />
      )}

      {tab === 'payroll-cost' && (
        <ProjectPayrollCostTab projectId={project.id} />
      )}

      {tab === 'materials-control' && (
        <ProjectMaterialsControlTab projectId={project.id} />
      )}

      {tab === 'subcontracting' && (
        <ProjectSubcontractingTab projectId={project.id} />
      )}

      {tab === 'job-orders' && (
        <ProjectJobOrdersTab projectId={project.id} />
      )}

      {tab === 'accomplishment' && (
        <ProjectAccomplishmentTab projectId={project.id} />
      )}

      {tab === 'billing' && (
        <ProjectBillingTab projectId={project.id} />
      )}

      {tab === 'reports' && (
        <ProjectReportsTab projectId={project.id} />
      )}

      {tab === 'audit-trail' && (
        <ProjectAuditTrailTab projectId={project.id} />
      )}

      {tab === 'ai-assistant' && (
        <ProjectAIAssistantTab projectId={project.id} />
      )}

    </div>
  );
}
