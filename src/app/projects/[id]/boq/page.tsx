import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { ArrowRight, FileSpreadsheet, LockKeyhole } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { buildDraftBOQChecksum } from '@/lib/boq/draft-workflow';
import { getBOQEngineeringReview } from '@/lib/boq/module-review';
import { getBOQReviewDocument } from '@/lib/boq/review-state';
import DraftBoqEditor from '../DraftBoqEditor';
import BOQEngineeringReview, { ApprovedBOQEvidence } from './BOQEngineeringReview';
import BOQSourceVersionsPanel from './BOQSourceVersionsPanel';
import BOQReviewPreparation from './BOQReviewPreparation';
import BOQReadingCorrectionPanel from './BOQReadingCorrectionPanel';
import BOQBaselineViewer from './BOQBaselineViewer';
import PlanningModuleShell from '../planning/PlanningModuleShell';
import styles from '../planning/planning.module.css';

export const dynamic = 'force-dynamic';
const money = (value: number | string) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value));

export default async function ProjectBOQModule({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getSessionActor().catch(() => null);
  if (!actor) redirect('/login');
  const capacity = await planningCapacity(actor, id);
  if (!capacity.canView) notFound();
  const [project, versions] = await Promise.all([
    prisma.project.findUnique({ where: { id }, select: { id: true, name: true, status: true, contractAmount: true, boqLocked: true,
      awardedBoqItems: { orderBy: { createdAt: 'asc' } },
      uploadedWorkbookFiles: { take: 1, orderBy: { uploadedAt: 'desc' }, select: { id: true, originalFilename: true, preservedOriginalUrl: true, commitStatus: true } },
    } }),
    prisma.projectBOQVersion.findMany({ where: { projectId: id }, orderBy: { versionNumber: 'desc' } }),
  ]);
  if (!project) notFound();
  const version = versions[0];
  const persistedReview = version ? await getBOQReviewDocument(id, version.id) : null;
  const sourceFile = version?.sourceUploadedWorkbookFileId
    ? await prisma.uploadedWorkbookFile.findFirst({ where: { id: version.sourceUploadedWorkbookFileId, projectId: id }, select: { id: true, originalFilename: true, preservedOriginalUrl: true, commitStatus: true } })
    : project.uploadedWorkbookFiles[0];
  const checksum = version?.checksum || buildDraftBOQChecksum(project.awardedBoqItems);
  const review = version?.status === 'DRAFT' ? await getBOQEngineeringReview(version.id, checksum) : null;
  const draft = version?.status === 'DRAFT' && !project.boqLocked;
  const approved = project.boqLocked && ['APPROVED', 'LOCKED'].includes(version?.status || '');
  const total = project.awardedBoqItems.reduce((sum, line) => sum.plus(String(line.totalCost)), new Prisma.Decimal(0));
  return <PlanningModuleShell project={project} active="boq">
    <div className={styles.titleRow}><div><h2>Bill of Quantities</h2><p>{version ? `BOQ version ${version.versionNumber} · ${version.status.replaceAll('_', ' ')}` : 'Confirm a BOQ workbook to begin.'}</p></div><div className={styles.actions}>
      {sourceFile && <a className={styles.link} href={version?.sourceProvenance === 'BOQ_WORKSPACE' ? `/api/boq-workspace/uploads/${sourceFile.id}/original` : sourceFile.preservedOriginalUrl || '#'}><FileSpreadsheet size={16} /> Original workbook</a>}
      {approved && <Link className={styles.link} href={`/projects/${id}/work-packages`}>Open Work Packages <ArrowRight size={16} /></Link>}
    </div></div>
    {approved && <div className={styles.status}><strong><LockKeyhole size={15} /> Approved BOQ baseline</strong><p>Approved {version?.approvedAt ? new Date(version.approvedAt).toLocaleDateString('en-PH') : 'and locked'} · {project.awardedBoqItems.length} items · {money(total.toString())}. This BOQ is the source for work-package scope.</p></div>}
    {project.awardedBoqItems.length === 0 ? <div className={styles.empty}><h3>No confirmed BOQ items</h3><p className={styles.muted}>Analyze a workbook and confirm its BOQ sheet in the workspace.</p><Link className={styles.link} href={`/boq?project=${encodeURIComponent(project.id)}`}>Open BOQ Workspace <ArrowRight size={16} /></Link>{sourceFile && <p><Link className={styles.link} href={`/boq?upload=${sourceFile.id}`}>Review existing import</Link></p>}</div>
      : draft && version ? <>
        <DraftBoqEditor projectId={id} version={{ id: version.id, checksum, reviewRowVersion: persistedReview?.rowVersion }} rows={project.awardedBoqItems.map(line => ({ id: line.id, itemCode: line.itemCode, category: line.category, description: line.description, unit: line.unit, quantity: line.quantity, combinedUnitCost: line.combinedUnitCost, totalCost: line.totalCost }))} contractAmount={project.contractAmount} canEdit={capacity.canEdit} canApprove={false} showApproval={false} />
        {persistedReview ? <BOQEngineeringReview projectId={id} versionId={version.id} checksum={checksum} canReview={capacity.canEngineerReview} canApprove={capacity.canApprove} review={review} reconciliation={{ contractAmount: String(project.contractAmount), boqTotal: total.toFixed(2), difference: total.minus(String(project.contractAmount)).abs().toFixed(2), matches: total.equals(String(project.contractAmount)) }} reviewState={{ rowVersion: persistedReview.rowVersion, findings: persistedReview.document.findings, contract: persistedReview.document.contract, revisions: persistedReview.document.revisions, readingHistory: persistedReview.document.readingHistory, correctedSources: persistedReview.document.correctedSources, provenance: persistedReview.document.source.provenance, firstReadAvailable: persistedReview.document.source.firstReadAvailable }} />
          : <BOQReviewPreparation projectId={id} versionId={version.id} canPrepare={capacity.canEdit} />}
        {persistedReview?.document.source.firstReadAvailable && persistedReview.document.source.uploadId && persistedReview.document.source.selectedSheet && <BOQReadingCorrectionPanel projectId={id} versionId={version.id} rowVersion={persistedReview.rowVersion} checksum={checksum} initialSheet={persistedReview.document.source.selectedSheet} initialMapping={persistedReview.document.source.mapping} initialBreakdownMapping={persistedReview.document.source.breakdownMapping} canEdit={capacity.canEdit} />}
        {persistedReview?.document.source.firstReadAvailable && persistedReview.document.source.uploadId && <BOQSourceVersionsPanel projectId={id} versionId={version.id} rowVersion={persistedReview.rowVersion} document={persistedReview.document} canEdit={capacity.canEdit} />}
      </> : <BOQBaselineViewer lines={project.awardedBoqItems.map(line => ({ id: line.id, itemCode: line.itemCode, category: line.category, description: line.description, unit: line.unit, quantity: line.quantity, combinedUnitCost: line.combinedUnitCost, totalCost: line.totalCost }))} />}
    {approved && persistedReview && <ApprovedBOQEvidence source={persistedReview.document.source} findings={persistedReview.document.findings} revisions={persistedReview.document.revisions} readingHistory={persistedReview.document.readingHistory} correctedSources={persistedReview.document.correctedSources} contract={persistedReview.document.contract} />}
    {versions.length > 0 && <details className={styles.history}><summary>BOQ version record · {versions.length}</summary><ul>{versions.map(record => <li key={record.id}><strong>Version {record.versionNumber}</strong> · {record.status} · {money(record.totalAmount || 0)}<br /><span className={styles.muted}>{record.approvedAt ? `Approved ${record.approvedAt.toLocaleString('en-PH')}` : `Created ${record.createdAt.toLocaleString('en-PH')}`}</span></li>)}</ul></details>}
  </PlanningModuleShell>;
}
