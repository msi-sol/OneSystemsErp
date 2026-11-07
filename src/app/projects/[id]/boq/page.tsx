import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { FileSpreadsheet } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { buildDraftBOQChecksum } from '@/lib/boq/draft-workflow';
import { getBOQEngineeringReview } from '@/lib/boq/module-review';
import { getBOQReviewDocument } from '@/lib/boq/review-state';
import { sourceComparisonFields } from '@/lib/boq/source-comparison';
import DraftBoqEditor from '../DraftBoqEditor';
import BOQEngineeringReview, { ApprovedBOQEvidence } from './BOQEngineeringReview';
import AiCheckPanel from '@/components/ai/AiCheckPanel';
import BOQSourceVersionsPanel from './BOQSourceVersionsPanel';
import BOQReviewPreparation from './BOQReviewPreparation';
import BOQReadingCorrectionPanel from './BOQReadingCorrectionPanel';
import BOQBaselineViewer from './BOQBaselineViewer';
import BOQComparison, { type BOQComparisonLine } from './BOQComparison';
import PlanningModuleShell from '../planning/PlanningModuleShell';
import styles from '../planning/planning.module.css';
import NextStepCard from '@/components/boq/NextStepCard';
import { deriveBoqLifecycle } from '@/lib/planning/lifecycle';
import BOQSections from './BOQSections';
import { boqSections } from '@/lib/boq/section-view';
import { BOQReviewRecord, BOQSourceFacts } from './BOQEvidenceRecord';
import BOQBaselineCard from './BOQBaselineCard';
import { compareBOQLines, summarizeComparison } from '@/lib/boq/comparison';
import BOQSourcePreview from './BOQSourcePreview';
import BOQReadingNotes from './BOQReadingNotes';
import type { WorkspaceIssue } from '@/lib/boq/workspace-types';

export const dynamic = 'force-dynamic';
const money = (value: number | string) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value));

export default async function ProjectBOQModule({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; section?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  // `evidence` was the old combined view; it now opens the source file view.
  const requestedView = query.view === 'evidence' ? 'source' : query.view || '';
  const view = ['sections', 'items', 'compare', 'source', 'history'].includes(requestedView) ? requestedView : 'overview';
  const actor = await getSessionActor().catch(() => null);
  if (!actor) redirect('/login');
  const capacity = await planningCapacity(actor, id);
  if (!capacity.canView) notFound();
  const [project, versions] = await Promise.all([
    prisma.project.findUnique({ where: { id }, select: { id: true, name: true, status: true, contractAmount: true, boqLocked: true,
      awardedBoqItems: { orderBy: { createdAt: 'asc' } },
      uploadedWorkbookFiles: { take: 1, orderBy: { uploadedAt: 'desc' }, select: { id: true, originalFilename: true, preservedOriginalUrl: true, commitStatus: true, uploadedBy:true, uploadedAt:true, fileHash:true, metadataJson:true } },
    } }),
    prisma.projectBOQVersion.findMany({ where: { projectId: id }, orderBy: { versionNumber: 'desc' } }),
  ]);
  if (!project) notFound();
  const version = versions[0];
  const persistedReview = version ? await getBOQReviewDocument(id, version.id) : null;
  const sourceFile = version?.sourceUploadedWorkbookFileId
    ? await prisma.uploadedWorkbookFile.findFirst({ where: { id: version.sourceUploadedWorkbookFileId, projectId: id }, select: { id: true, originalFilename: true, preservedOriginalUrl: true, commitStatus: true, uploadedBy:true, uploadedAt:true, fileHash:true, metadataJson:true } })
    : project.uploadedWorkbookFiles[0];
  const checksum = version?.checksum || buildDraftBOQChecksum(project.awardedBoqItems);
  const review = version ? await getBOQEngineeringReview(version.id, checksum) : null;
  const draft = version?.status === 'DRAFT' && !project.boqLocked;
  const approved = project.boqLocked && ['APPROVED', 'LOCKED'].includes(version?.status || '');
  const total = project.awardedBoqItems.reduce((sum, line) => sum.plus(String(line.totalCost)), new Prisma.Decimal(0));
  const sectionIdentities = persistedReview?.document.sectionIdentityByItemId ?? {};
  const sections = boqSections(project.awardedBoqItems, sectionIdentities);
  const selectedSection = sections.some(section => section.id === query.section) ? query.section! : 'all';
  const openFindingCount = persistedReview?.document.findings.filter(finding => finding.status === 'OPEN' && !finding.invalidatedAt).length ?? 0;
  const lifecycle = deriveBoqLifecycle({
    projectId: id, hasVersion: Boolean(version), draft, approved, reviewPrepared: Boolean(persistedReview),
    openFindings: openFindingCount, contractVerified: Boolean(persistedReview?.document.contract.verified),
    totalsMatch: total.equals(String(project.contractAmount)), reviewCurrent: Boolean(review?.current), reviewStale: Boolean(review && !review.current),
    canEdit: capacity.canEdit, canEngineerReview: capacity.canEngineerReview, canApprove: capacity.canApprove,
  });
  const viewLabels: Record<string, string> = { sections: 'Sections', items: 'BOQ items', compare: 'Compare with file', source: 'Source file', history: 'History' };
  const viewLabel = viewLabels[view];
  const sourceRows: BOQComparisonLine[] = (persistedReview?.document.source.originalRows ?? []).map(row => ({
    itemId: row.itemId ?? null, rowNumber: row.sourceRowNumber, section: row.section || 'Unsectioned',
    description: row.description, ...sourceComparisonFields(row), amount: row.amount,
  }));
  const currentRows: BOQComparisonLine[] = project.awardedBoqItems.map((line, index) => ({
    itemId: line.id, rowNumber: index + 1,
    section: persistedReview?.document.sectionIdentityByItemId[line.id]?.name || line.category || 'Unsectioned',
    itemCode: line.itemCode, description: line.description, unit: line.unit,
    quantity: String(line.quantity), unitCost: String(line.combinedUnitCost), amount: String(line.totalCost),
  }));
  const reviewHistory = [
    ...(review ? [{ action: review.current ? 'ENGINEERING_REVIEW_CURRENT' : 'ENGINEERING_REVIEW_STALE', at: review.decidedAt, reason: review.comments || null }] : []),
    ...(persistedReview?.document.history.map(event => ({ action: event.action, at: event.at, reason: event.reason })) ?? []),
    ...(version?.approvedAt ? [{ action: 'BOQ_APPROVED_AND_LOCKED', at: version.approvedAt.toISOString(), reason: version.remarks || null }] : []),
  ].sort((left, right) => left.at.localeCompare(right.at));
  const firstReadAvailable = Boolean(persistedReview?.document.source.firstReadAvailable);
  const comparisonSummary = firstReadAvailable ? summarizeComparison(compareBOQLines(sourceRows, currentRows)) : null;
  const originalHref = sourceFile ? (version?.sourceProvenance === 'BOQ_WORKSPACE' ? `/api/boq-workspace/uploads/${sourceFile.id}/original` : sourceFile.preservedOriginalUrl || null) : null;
  const actorIds = [...new Set([sourceFile?.uploadedBy, version?.approvedBy, version?.committedBy, persistedReview?.document.contract.verifiedBy,
    ...(persistedReview?.document.history.map(event=>event.actorId)??[]),...(persistedReview?.document.revisions.map(event=>event.actorId)??[])].filter((value):value is string=>typeof value==='string'&&value.length>0))];
  const recordedActors = actorIds.length ? await prisma.user.findMany({where:{id:{in:actorIds}},select:{id:true,name:true}}) : [];
  const actorNames = Object.fromEntries(recordedActors.map(user=>[user.id,user.name||'Unnamed account']));
  const sourceNotes: WorkspaceIssue[] = [];
  let notesRecorded = false;
  try {
    const metadata = JSON.parse(sourceFile?.metadataJson||'{}');
    if(Array.isArray(metadata?.report?.warnings)){
      notesRecorded=true;
      for(const note of metadata.report.warnings)if(note&&(typeof note.row==='string'||typeof note.row==='number')&&typeof note.field==='string'&&typeof note.message==='string')sourceNotes.push({row:note.row,field:note.field,message:note.message});
    }
  } catch { /* Earlier records may not have preserved structured reading notes. */ }
  const evidenceFacts = { fileName: sourceFile?.originalFilename ?? persistedReview?.document.source.fileName ?? null, fileHash: sourceFile?.fileHash ?? persistedReview?.document.source.fileHash ?? null,
    sheet: persistedReview?.document.source.selectedSheet ?? null, uploadedBy: sourceFile ? actorNames[sourceFile.uploadedBy] ?? null : null, uploadedAt: sourceFile?.uploadedAt.toISOString() ?? null,
    approvedBy: version?.approvedBy ? actorNames[version.approvedBy] ?? null : null, approvedAt: version?.approvedAt?.toISOString() ?? null,
    approvalNote: persistedReview?.document.finalApproval?.note ?? null, versionNotes: version?.remarks ?? null };
  return <PlanningModuleShell project={project} active="boq" trail={viewLabel ? [{ label: viewLabel }] : []}>
    <NextStepCard lifecycle={lifecycle} stepsLabel="BOQ review steps" />
    <div className={styles.titleRow}><div><h2>{approved ? 'BOQ Baseline' : 'Structured BOQ'}</h2><p>{version ? `BOQ version ${version.versionNumber} · ${version.status.replaceAll('_', ' ')}` : 'This project has no BOQ yet.'}</p></div><div className={styles.actions}>
      {originalHref && !(approved && view === 'overview') && <a className={styles.link} href={originalHref}><FileSpreadsheet size={16} /> Download original file</a>}
    </div></div>
    {version && <nav className={styles.baselineNav} aria-label="BOQ views">{([
      ['overview', 'Overview'], ['sections', `Sections · ${sections.length}`], ['items', `BOQ items · ${project.awardedBoqItems.length}`],
      ['compare', comparisonSummary ? `Compare with file${comparisonSummary.differences ? ` · ${comparisonSummary.differences} differ` : ' · matches'}` : 'Compare with file'],
      ['source', 'Source file'], ['history', 'History'],
    ] as const).map(([key, label]) => <Link key={key} aria-current={view === key ? 'page' : undefined} className={view === key ? styles.button : styles.secondary} href={`/projects/${id}/boq${key === 'overview' ? '' : `?view=${key}`}`}>{label}</Link>)}</nav>}
    {view === 'overview' && <>
    {approved && version
      ? <BOQBaselineCard projectId={id} total={total.toFixed(2)} contractAmount={String(project.contractAmount)} sectionCount={sections.length} itemCount={project.awardedBoqItems.length}
          versionNumber={version.versionNumber} approvedBy={version.approvedBy ? actorNames[version.approvedBy] ?? 'Recorded approver' : null} approvedAt={version.approvedAt?.toISOString() ?? null}
          approvalNote={persistedReview?.document.finalApproval?.note ?? null} reviewer={review ? { name: review.reviewerName, at: review.decidedAt } : null} originalHref={originalHref}
          sourceName={sourceFile?.originalFilename ?? persistedReview?.document.source.fileName ?? null} />
      : version && <section className={styles.panel} aria-label="BOQ overview"><h3>Review this BOQ before approval</h3><dl className={styles.reconciliationFacts}><div><dt>BOQ total</dt><dd>{money(total.toString())}</dd></div><div><dt>Signed contract value</dt><dd>{money(project.contractAmount)}</dd></div><div><dt>Sections · items</dt><dd>{sections.length} · {project.awardedBoqItems.length}</dd></div><div><dt>Findings to resolve</dt><dd>{openFindingCount}</dd></div>{comparisonSummary && <div><dt>Items that differ from the file</dt><dd>{comparisonSummary.differences}</dd></div>}</dl><div className={styles.actions}>{comparisonSummary && <Link className={styles.link} href={`/projects/${id}/boq?view=compare`}>Compare with file</Link>}<Link className={styles.link} href={`/projects/${id}/boq?view=items`}>Review BOQ items</Link><Link className={styles.link} href={`/projects/${id}/boq?view=sections`}>Review sections</Link></div></section>}
    {/* Optional AI Check: insights + editable suggestions; only runs when the user asks. */}
    {version && project.awardedBoqItems.length > 0 && <AiCheckPanel projectId={id} scope="boq" />}
    {draft && version && (persistedReview ? <BOQEngineeringReview projectId={id} versionId={version.id} checksum={checksum} canReview={capacity.canEngineerReview} canApprove={capacity.canApprove} review={review} reconciliation={{ contractAmount: String(project.contractAmount), boqTotal: total.toFixed(2), difference: total.minus(String(project.contractAmount)).abs().toFixed(2), matches: total.equals(String(project.contractAmount)) }} reviewState={{ rowVersion: persistedReview.rowVersion, findings: persistedReview.document.findings, contract: persistedReview.document.contract, revisions: persistedReview.document.revisions, readingHistory: persistedReview.document.readingHistory, correctedSources: persistedReview.document.correctedSources, provenance: persistedReview.document.source.provenance, firstReadAvailable: persistedReview.document.source.firstReadAvailable }} /> : <BOQReviewPreparation projectId={id} versionId={version.id} canPrepare={capacity.canEdit} />)}
    </>}
    {view === 'sections' && <BOQSections projectId={id} sections={sections} />}
    {view === 'compare' && <BOQComparison sourceAvailable={firstReadAvailable} sourceName={persistedReview?.document.source.fileName ?? sourceFile?.originalFilename ?? null} sourceRows={sourceRows} currentRows={currentRows} originalHref={originalHref} />}
    {view === 'source' && <>
      <p className={styles.muted}>The original file as uploaded, how it was read, and the tools to correct the reading. The original file is never changed.</p>
      <BOQSourceFacts facts={evidenceFacts} document={persistedReview?.document ?? null} />
      {sourceFile && /\.pdf$/i.test(sourceFile.originalFilename) && version?.sourceProvenance === 'BOQ_WORKSPACE' && <details className={styles.panel} open><summary>Original PDF</summary><iframe title="Original BOQ PDF" src={`/api/boq-workspace/uploads/${sourceFile.id}/original?view=inline`} style={{width:'100%',height:'75vh',border:0,marginTop:16}} /></details>}
      {sourceFile && version && /\.xlsx$/i.test(sourceFile.originalFilename) && <BOQSourcePreview key={version.id} projectId={id} versionId={version.id} initialSheet={persistedReview?.document.source.selectedSheet ?? null} />}
      {notesRecorded ? <BOQReadingNotes notes={sourceNotes} /> : <p className={styles.muted}>Reading notes were not kept for this earlier upload.</p>}
      {draft && version && firstReadAvailable && persistedReview?.document.source.uploadId && <section aria-labelledby="boq-corrections-heading">
        <h3 id="boq-corrections-heading">Correct the reading</h3>
        <p className={styles.muted}>Re-read this file with different columns, or upload a corrected file. Check the result under Compare with file.</p>
        {persistedReview.document.source.selectedSheet && <BOQReadingCorrectionPanel projectId={id} versionId={version.id} rowVersion={persistedReview.rowVersion} checksum={checksum} initialSheet={persistedReview.document.source.selectedSheet} initialMapping={persistedReview.document.source.mapping} initialBreakdownMapping={persistedReview.document.source.breakdownMapping} canEdit={capacity.canEdit} />}
        <BOQSourceVersionsPanel projectId={id} versionId={version.id} rowVersion={persistedReview.rowVersion} document={persistedReview.document} canEdit={capacity.canEdit} />
      </section>}
      {approved && <p className={styles.muted}>This BOQ is approved and locked. A corrected file cannot replace this baseline; that needs an authorized BOQ revision.</p>}
    </>}
    {view === 'history' && <>
      <p className={styles.muted}>Who uploaded, reviewed, corrected and approved this BOQ, and when.</p>
      <BOQReviewRecord facts={evidenceFacts} document={persistedReview?.document ?? null} actors={actorNames} engineeringReview={review} />
      <details className={styles.panel} open={reviewHistory.length > 0}><summary>Review and approval events · {reviewHistory.length}</summary>{reviewHistory.length ? <ol className={styles.reviewSteps}>{reviewHistory.map((event, index) => <li key={`${event.at}:${event.action}:${index}`}><strong>{event.action.replaceAll('_', ' ').replaceAll('-', ' ').toLocaleLowerCase()}</strong><span>{new Date(event.at).toLocaleString('en-PH')}{event.reason ? ` · ${event.reason}` : ''}</span></li>)}</ol> : <p className={styles.muted}>No review or approval events recorded for this version yet.</p>}</details>
      {versions.length > 0 && <details className={styles.panel}><summary>BOQ versions · {versions.length}</summary><ul>{versions.map(record => <li key={record.id}><strong>Version {record.versionNumber}</strong> · {record.status.replaceAll('_', ' ')} · {money(record.totalAmount || 0)}<br /><span className={styles.muted}>{record.approvedAt ? `Approved ${record.approvedAt.toLocaleString('en-PH')}` : `Created ${record.createdAt.toLocaleString('en-PH')}`}</span></li>)}</ul></details>}
      {approved && persistedReview && <ApprovedBOQEvidence source={persistedReview.document.source} findings={persistedReview.document.findings} revisions={persistedReview.document.revisions} readingHistory={persistedReview.document.readingHistory} correctedSources={persistedReview.document.correctedSources} contract={persistedReview.document.contract} />}
    </>}
    {view === 'items' && (project.awardedBoqItems.length === 0 ? <div className={styles.empty}><h3>No confirmed BOQ items</h3><p className={styles.muted}>Confirm a BOQ source before reviewing items.</p>{sourceFile && <p><Link className={styles.link} href={`/boq?upload=${sourceFile.id}`}>Review existing import</Link></p>}</div>
      : draft && version ? <>
        <DraftBoqEditor key={selectedSection} initialSection={selectedSection} sectionIdentities={sectionIdentities} projectId={id} version={{ id: version.id, checksum, reviewRowVersion: persistedReview?.rowVersion }} rows={project.awardedBoqItems.map(line => ({ id: line.id, itemCode: line.itemCode, category: line.category, description: line.description, unit: line.unit, quantity: line.quantity, combinedUnitCost: line.combinedUnitCost, totalCost: line.totalCost }))} contractAmount={project.contractAmount} canEdit={capacity.canEdit} canApprove={false} showApproval={false} />
      </> : <BOQBaselineViewer key={selectedSection} initialSection={selectedSection} sectionIdentities={sectionIdentities} lines={project.awardedBoqItems.map(line => ({ id: line.id, itemCode: line.itemCode, category: line.category, description: line.description, unit: line.unit, quantity: line.quantity, combinedUnitCost: line.combinedUnitCost, totalCost: line.totalCost }))} />)}
  </PlanningModuleShell>;
}
