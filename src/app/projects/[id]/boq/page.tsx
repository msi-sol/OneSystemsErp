import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { ArrowRight, FileSpreadsheet } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { buildDraftBOQChecksum } from '@/lib/boq/draft-workflow';
import { getBOQEngineeringReview } from '@/lib/boq/module-review';
import { getBOQReviewDocument } from '@/lib/boq/review-state';
import { sourceComparisonFields } from '@/lib/boq/source-comparison';
import DraftBoqEditor from '../DraftBoqEditor';
import BOQEngineeringReview, { ApprovedBOQEvidence } from './BOQEngineeringReview';
import BOQSourceVersionsPanel from './BOQSourceVersionsPanel';
import BOQReviewPreparation from './BOQReviewPreparation';
import BOQReadingCorrectionPanel from './BOQReadingCorrectionPanel';
import BOQBaselineViewer from './BOQBaselineViewer';
import BOQComparison, { type BOQComparisonLine } from './BOQComparison';
import PlanningModuleShell from '../planning/PlanningModuleShell';
import styles from '../planning/planning.module.css';
import PlanningFlowGuide from '@/components/boq/PlanningFlowGuide';
import BOQSections from './BOQSections';
import { boqSections } from '@/lib/boq/section-view';
import BOQEvidenceRecord from './BOQEvidenceRecord';
import BOQSourcePreview from './BOQSourcePreview';
import BOQReadingNotes from './BOQReadingNotes';
import type { WorkspaceIssue } from '@/lib/boq/workspace-types';

export const dynamic = 'force-dynamic';
const money = (value: number | string) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value));

export default async function ProjectBOQModule({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; section?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const view = ['sections', 'items', 'evidence'].includes(query.view || '') ? query.view! : 'overview';
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
  const nextAction = approved ? 'Approved baseline is locked and ready for work-package scope.'
    : !version ? 'Confirm a source BOQ workbook in the BOQ workspace.'
      : !draft ? 'Review the current version record; this version is not an editable draft.'
        : !persistedReview ? 'Complete the review preparation for this draft.'
          : openFindingCount > 0 ? `Resolve ${openFindingCount} open workbook finding${openFindingCount === 1 ? '' : 's'}.`
            : !persistedReview.document.contract.verified ? 'Verify the signed contract value.'
              : !total.equals(String(project.contractAmount)) ? 'Resolve the difference between the contract and BOQ total.'
                : !review?.current ? capacity.canEngineerReview ? 'Record the engineering review for this exact draft.' : 'Waiting for an engineering review of this draft.'
                  : capacity.canApprove ? 'Project Manager approval and baseline lock are ready.' : 'Waiting for Project Manager approval and baseline lock.';
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
  return <PlanningModuleShell project={project} active="boq">
    <PlanningFlowGuide step={2} next={nextAction} />
    <div className={styles.titleRow}><div><h2>{approved ? 'BOQ Baseline' : 'Structured BOQ'}</h2><p>{version ? `BOQ version ${version.versionNumber} · ${version.status.replaceAll('_', ' ')}` : 'Confirm a BOQ workbook to begin.'}</p></div><div className={styles.actions}>
      {sourceFile && <a className={styles.link} href={version?.sourceProvenance === 'BOQ_WORKSPACE' ? `/api/boq-workspace/uploads/${sourceFile.id}/original` : sourceFile.preservedOriginalUrl || '#'}><FileSpreadsheet size={16} /> Original workbook</a>}
      {approved && <Link className={styles.link} href={`/projects/${id}/work-packages`}>Open Work Packages <ArrowRight size={16} /></Link>}
    </div></div>
    <nav className={styles.baselineNav} aria-label="BOQ views">{([['overview','Overview'],['sections',`Sections ${sections.length}`],['items',`BOQ items ${project.awardedBoqItems.length}`],['evidence','Evidence & history']] as const).map(([key,label]) => <Link key={key} aria-current={view === key ? 'page' : undefined} className={view === key ? styles.button : styles.secondary} href={`/projects/${id}/boq${key === 'overview' ? '' : `?view=${key}`}`}>{label}</Link>)}</nav>
    {view === 'overview' && <>
    <section className={styles.panel} aria-label="BOQ overview"><h3>{approved ? 'Approved contract scope' : 'Review this BOQ before approval'}</h3><dl className={styles.reconciliationFacts}><div><dt>BOQ total</dt><dd>{money(total.toString())}</dd></div><div><dt>Sections</dt><dd>{sections.length}</dd></div><div><dt>Items</dt><dd>{project.awardedBoqItems.length}</dd></div><div><dt>Findings to resolve</dt><dd>{openFindingCount}</dd></div></dl><p>{nextAction}</p><div className={styles.actions}><Link className={styles.link} href={`/projects/${id}/boq?view=sections`}>Review sections</Link><Link className={styles.link} href={`/projects/${id}/boq?view=items`}>Review BOQ items</Link>{!approved && draft && <a className={styles.link} href="#boq-approval-heading">Continue review & approval</a>}</div></section>
    {approved && <p className={styles.muted}>Approved {version?.approvedAt ? new Date(version.approvedAt).toLocaleDateString('en-PH') : 'and locked'}. This locked BOQ is the source for work-package scope.</p>}
    {draft && version && (persistedReview ? <BOQEngineeringReview projectId={id} versionId={version.id} checksum={checksum} canReview={capacity.canEngineerReview} canApprove={capacity.canApprove} review={review} reconciliation={{ contractAmount: String(project.contractAmount), boqTotal: total.toFixed(2), difference: total.minus(String(project.contractAmount)).abs().toFixed(2), matches: total.equals(String(project.contractAmount)) }} reviewState={{ rowVersion: persistedReview.rowVersion, findings: persistedReview.document.findings, contract: persistedReview.document.contract, revisions: persistedReview.document.revisions, readingHistory: persistedReview.document.readingHistory, correctedSources: persistedReview.document.correctedSources, provenance: persistedReview.document.source.provenance, firstReadAvailable: persistedReview.document.source.firstReadAvailable }} /> : <BOQReviewPreparation projectId={id} versionId={version.id} canPrepare={capacity.canEdit} />)}
    </>}
    {view === 'sections' && <BOQSections projectId={id} sections={sections} />}
    {view === 'evidence' && <>
    <h3>Evidence & history</h3><p className={styles.muted}>Original source, reading comparisons, corrections and version records. These records support the current BOQ; they do not replace approval.</p>
    <BOQEvidenceRecord facts={{fileName:sourceFile?.originalFilename??persistedReview?.document.source.fileName??null,fileHash:sourceFile?.fileHash??persistedReview?.document.source.fileHash??null,sheet:persistedReview?.document.source.selectedSheet??null,uploadedBy:sourceFile?actorNames[sourceFile.uploadedBy]??null:null,uploadedAt:sourceFile?.uploadedAt.toISOString()??null,approvedBy:version?.approvedBy?actorNames[version.approvedBy]??null:null,approvedAt:version?.approvedAt?.toISOString()??null,approvalNote:persistedReview?.document.finalApproval?.note??null,versionNotes:version?.remarks??null}} document={persistedReview?.document??null} actors={actorNames} engineeringReview={review}/>
    {sourceFile&&version&&/\.xlsx$/i.test(sourceFile.originalFilename)&&<BOQSourcePreview key={version.id} projectId={id} versionId={version.id} initialSheet={persistedReview?.document.source.selectedSheet??null}/>}
    {notesRecorded?<BOQReadingNotes notes={sourceNotes}/>:<p className={styles.muted}>Structured source reading notes were not preserved for this earlier upload.</p>}
    <details className={styles.panel}><summary>Compare source and BOQ · {sourceRows.length} source items · {currentRows.length} recorded items</summary><BOQComparison sourceAvailable={Boolean(persistedReview?.document.source.firstReadAvailable)} sourceName={persistedReview?.document.source.fileName ?? null} sourceRows={sourceRows} currentRows={currentRows} nextAction={nextAction} reviewHistory={reviewHistory} /></details>
    {sourceFile && /\.pdf$/i.test(sourceFile.originalFilename) && version?.sourceProvenance === 'BOQ_WORKSPACE' && <details className={styles.panel}><summary>View preserved original PDF</summary><iframe title="Original BOQ PDF" src={`/api/boq-workspace/uploads/${sourceFile.id}/original?view=inline`} style={{width:'100%',height:'75vh',border:0,marginTop:16}} /></details>}
    {draft && version && <>
      {persistedReview?.document.source.firstReadAvailable && persistedReview.document.source.uploadId && persistedReview.document.source.selectedSheet && <BOQReadingCorrectionPanel projectId={id} versionId={version.id} rowVersion={persistedReview.rowVersion} checksum={checksum} initialSheet={persistedReview.document.source.selectedSheet} initialMapping={persistedReview.document.source.mapping} initialBreakdownMapping={persistedReview.document.source.breakdownMapping} canEdit={capacity.canEdit} />}
      {persistedReview?.document.source.firstReadAvailable && persistedReview.document.source.uploadId && <BOQSourceVersionsPanel projectId={id} versionId={version.id} rowVersion={persistedReview.rowVersion} document={persistedReview.document} canEdit={capacity.canEdit} />}
    </>}
    {approved && persistedReview && <ApprovedBOQEvidence source={persistedReview.document.source} findings={persistedReview.document.findings} revisions={persistedReview.document.revisions} readingHistory={persistedReview.document.readingHistory} correctedSources={persistedReview.document.correctedSources} contract={persistedReview.document.contract} />}
    {versions.length > 0 && <details className={styles.history}><summary>BOQ version record · {versions.length}</summary><ul>{versions.map(record => <li key={record.id}><strong>Version {record.versionNumber}</strong> · {record.status} · {money(record.totalAmount || 0)}<br /><span className={styles.muted}>{record.approvedAt ? `Approved ${record.approvedAt.toLocaleString('en-PH')}` : `Created ${record.createdAt.toLocaleString('en-PH')}`}</span></li>)}</ul></details>}
    {approved&&<p className={styles.muted}>This BOQ is approved and locked. A corrected source cannot silently replace this commercial baseline; an authorized BOQ revision process is required.</p>}
    </>}
    {view === 'items' && (project.awardedBoqItems.length === 0 ? <div className={styles.empty}><h3>No confirmed BOQ items</h3><p className={styles.muted}>Confirm a BOQ source before reviewing items.</p>{sourceFile && <p><Link className={styles.link} href={`/boq?upload=${sourceFile.id}`}>Review existing import</Link></p>}</div>
      : draft && version ? <>
        <DraftBoqEditor key={selectedSection} initialSection={selectedSection} sectionIdentities={sectionIdentities} projectId={id} version={{ id: version.id, checksum, reviewRowVersion: persistedReview?.rowVersion }} rows={project.awardedBoqItems.map(line => ({ id: line.id, itemCode: line.itemCode, category: line.category, description: line.description, unit: line.unit, quantity: line.quantity, combinedUnitCost: line.combinedUnitCost, totalCost: line.totalCost }))} contractAmount={project.contractAmount} canEdit={capacity.canEdit} canApprove={false} showApproval={false} />
      </> : <BOQBaselineViewer key={selectedSection} initialSection={selectedSection} sectionIdentities={sectionIdentities} lines={project.awardedBoqItems.map(line => ({ id: line.id, itemCode: line.itemCode, category: line.category, description: line.description, unit: line.unit, quantity: line.quantity, combinedUnitCost: line.combinedUnitCost, totalCost: line.totalCost }))} />)}
  </PlanningModuleShell>;
}
