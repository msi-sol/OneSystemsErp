'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import type { BOQReviewDocument } from '@/lib/boq/review-state';
import styles from '../planning/planning.module.css';

type Review = { current: boolean; reviewerName: string; comments: string; decidedAt: string } | null;
const money = (value: string) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value));
type ReviewFinding = BOQReviewDocument['findings'][number];
type ReviewState = (Pick<BOQReviewDocument, 'findings' | 'contract' | 'revisions' | 'readingHistory' | 'correctedSources'> & { rowVersion: number; provenance?: BOQReviewDocument['source']['provenance']; firstReadAvailable?: boolean }) | null;
function ReadingConflictHistory({ reading }: { reading: BOQReviewDocument['readingHistory'][number] }) {
  if (!reading.conflicts?.length) return null;
  return <ul aria-label="Reading conflict decisions">{reading.conflicts.map(conflict => <li key={`${conflict.itemId}:${conflict.field}`}><strong>{conflict.field} · {conflict.decision === 'KEEP_CURRENT' ? 'Kept current correction' : conflict.decision === 'USE_READING' ? 'Used corrected reading' : 'Earlier decision details not recorded'}</strong><p>Reviewed value: {conflict.currentValue} · workbook reading: {conflict.correctedValue ?? 'not read'}</p><p>Reason: {conflict.decisionReason || 'Not recorded in this earlier history entry.'}</p>{conflict.decidedAt && <p>Recorded {new Date(conflict.decidedAt).toLocaleString('en-PH')}</p>}</li>)}</ul>;
}
export function ApprovedBOQEvidence({ source, findings, revisions, readingHistory, correctedSources, contract }: { source: { fileName: string | null; selectedSheet: string | null; fileHash: string | null; provenance?: string; firstReadAvailable?: boolean }; findings: ReviewFinding[]; revisions: NonNullable<ReviewState>['revisions']; readingHistory: NonNullable<ReviewState>['readingHistory']; correctedSources: NonNullable<ReviewState>['correctedSources']; contract: NonNullable<ReviewState>['contract'] }) {
  return <details className={styles.history}><summary>BOQ source and review history</summary><dl><dt>Source workbook</dt><dd>{source.firstReadAvailable ? `${source.fileName ?? 'Unknown workbook'} · ${source.selectedSheet ?? 'Unknown sheet'} · SHA-256 ${source.fileHash ?? 'not recorded'}` : 'Legacy canonical snapshot · no original workbook or first reading was preserved.'}</dd><dt>Contract verification</dt><dd>{contract.verified ? `${contract.verifiedBy} · ${contract.verificationReason}` : 'Not verified in this record'}</dd></dl><h4>Review findings</h4><ul>{findings.map(finding => <li key={finding.id}>{finding.field} · {finding.status} · {finding.message}{finding.reason ? ` · ${finding.reason}` : ''}</li>)}</ul><h4>Line revisions</h4><ul>{revisions.map(revision => <li key={revision.id}>{revision.action} · {revision.reason} · {new Date(revision.createdAt).toLocaleString('en-PH')}</li>)}</ul><h4>Corrected sources</h4><ul>{correctedSources.map(candidate => <li key={candidate.versionId}>{candidate.fileName} · {candidate.status} · {candidate.assessment.length} assessed rows</li>)}</ul><h4>Reading corrections</h4><ul>{readingHistory.map(reading => <li key={reading.id}>{reading.fileName} · {reading.selectedSheet} · {reading.appliedAt ? 'applied' : 'preview only'} · {reading.comparison.length} rows compared<ReadingConflictHistory reading={reading}/></li>)}</ul></details>;
}

export default function BOQEngineeringReview({ projectId, versionId, checksum, canReview, canApprove, review, reviewState, reconciliation }: {
  projectId: string; versionId: string; checksum: string; canReview: boolean; canApprove: boolean; review: Review; reviewState?: ReviewState;
  reconciliation: { contractAmount: string; boqTotal: string; difference: string; matches: boolean };
}) {
  const router = useRouter();
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const pending = busy || refreshing;
  const [confirmApproval, setConfirmApproval] = useState(false);
  const [approvalNote, setApprovalNote] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [decisionReasons, setDecisionReasons] = useState<Record<string, string>>({});
  const [contractReason, setContractReason] = useState('');
  const [revisedContract, setRevisedContract] = useState('');
  const [setAsideReason, setSetAsideReason] = useState('');
  const [acknowledgeSetAside, setAcknowledgeSetAside] = useState(false);
  const openFindings = reviewState?.findings.filter(finding => finding.status === 'OPEN' && !finding.invalidatedAt) || [];
  const proposedDifference = /^\d+(?:\.\d{1,2})?$/.test(revisedContract) && new Decimal(revisedContract).gt(0)
    ? new Decimal(revisedContract).minus(reconciliation.boqTotal).abs().toFixed(2) : null;
  async function action(value: 'review' | 'approve' | 'finding-decision' | 'verify-contract' | 'revise-contract', extra: Record<string, unknown> = {}) {
    if (pending) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/projects/${projectId}/boq-review`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: value, versionId, expectedChecksum: checksum, comments, approvalNote, expectedRowVersion: reviewState?.rowVersion, setAsideAcknowledged: acknowledgeSetAside, setAsideReason, ...extra }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The review could not be saved.');
      setMessage(value === 'review' ? 'Engineering review recorded for the current BOQ.' : value === 'approve' ? 'BOQ approved and locked.' : value === 'revise-contract' ? 'Contract revision recorded. Verify the revised value before approval.' : value === 'verify-contract' ? data.reconciliation?.reconciles === false ? `Contract check recorded. The ${money(data.reconciliation.difference)} difference remains; approval stays blocked until reconciliation.` : 'Contract value verified. The BOQ and contract amounts reconcile.' : 'BOQ review updated.');
      if (value === 'revise-contract') setRevisedContract('');
      setComments(''); setConfirmApproval(false); startRefresh(() => router.refresh());
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The review could not be saved.'); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel} aria-labelledby="boq-approval-heading"><h3 id="boq-approval-heading">BOQ review and approval</h3>
    <p className={styles.muted}>An engineer reviews the exact BOQ draft. The Project Manager then approves and locks that reviewed version. Editing the BOQ makes the previous review stale.</p>
    <ol aria-label="BOQ approval requirements" className={styles.reviewSteps}>
      <li><strong>Check the contract and BOQ total</strong><span>{reviewState?.contract.verified ? 'Contract verified' : 'Record your signed-document check below'} · {reconciliation.matches ? 'Amounts match' : `${money(reconciliation.difference)} difference to resolve`}</span></li>
      <li><strong>Resolve workbook findings</strong><span>{openFindings.length ? `${openFindings.length} decisions required below` : 'No open findings'}</span></li>
      <li><strong>Record the Engineer review</strong><span>{review?.current ? 'Current version reviewed' : 'Enter comments and record the review after completing the checks'}</span></li>
      <li><strong>PM approves and locks the BOQ</strong><span>After the current Engineer review, approve the baseline to continue to Work Packages.</span></li>
    </ol>
    {error && <div className={styles.error} role="alert"><p>{error}</p>{/changed|refresh|concurrent/i.test(error) && <button type="button" className={styles.secondary} disabled={pending} onClick={() => { setConfirmApproval(false); setError(''); startRefresh(() => router.refresh()); }}>Refresh current BOQ</button>}</div>}{message && <p className={styles.success} role="status">{message}</p>}
    {review && <div className={styles.status}><strong>{review.current ? 'Engineering review is current' : 'BOQ changed — a new engineering review is required'}</strong><p>{review.reviewerName} · {new Date(review.decidedAt).toLocaleString('en-PH')}</p><p>{review.comments}</p></div>}
    {reviewState && <>
      {!reviewState.firstReadAvailable && <div className={styles.status}><strong>Legacy canonical snapshot</strong><p>No original workbook or first reading was preserved. Findings and source comparisons are limited to this saved BOQ.</p></div>}
      <div className={styles.status}>
        <strong>Signed contract value {reviewState.contract.verified ? 'verified' : 'needs verification'}</strong>
        <dl className={styles.reconciliationFacts}><div><dt>Recorded contract value</dt><dd>{money(reconciliation.contractAmount)}</dd></div><div><dt>BOQ item total</dt><dd>{money(reconciliation.boqTotal)}</dd></div><div><dt>Difference to resolve</dt><dd>{money(reconciliation.difference)}</dd></div></dl>
        {reviewState.contract.verified && <p>{reviewState.contract.verifiedBy} · {reviewState.contract.verificationReason}</p>}
      </div>
      {!reconciliation.matches && <div className={styles.status} role="alert"><h4>Resolve the BOQ and contract difference</h4><p>This draft is saved. Approval stays blocked by the {money(reconciliation.difference)} difference. Check the signed contract and choose what needs correcting.</p><div className={styles.actions}><a className={styles.link} href={`/projects/${projectId}/boq?view=items`}>Review and correct BOQ items</a>{canApprove && <button type="button" className={styles.secondary} disabled={pending} onClick={() => { setRevisedContract(reconciliation.boqTotal); setConfirmApproval(false); }}>Use BOQ total as proposed contract value</button>}</div><p>Choosing a proposed value does not save it. A contract revision requires a reason and explicit confirmation below.</p></div>}
      {canApprove && <div style={{ marginTop: 12 }}>
        <div className={styles.fields}><div><label htmlFor="boq-contract-verification-reason">Contract check or revision reason</label><input id="boq-contract-verification-reason" value={contractReason} onChange={event => setContractReason(event.target.value)} maxLength={300} placeholder="Record the signed-document check" disabled={pending}/><p className={styles.muted}>Enter at least 5 characters. Verification records your check; it does not change the BOQ or remove an amount difference.</p></div><div><label htmlFor="boq-revised-contract">Revised signed contract value (optional)</label><input id="boq-revised-contract" aria-label="Revised signed contract value" type="number" min="0.01" step="0.01" value={revisedContract} onChange={event => { setRevisedContract(event.target.value); setConfirmApproval(false); }} placeholder="Enter only for a contract revision" disabled={pending}/><p className={styles.muted}>Leave this blank when verifying the current contract value.</p></div></div>
        {proposedDifference !== null && <div className={styles.status}><strong>Proposed contract revision · not saved</strong><p>Current {money(reconciliation.contractAmount)} → proposed {money(revisedContract)} · difference to BOQ {money(proposedDifference)}</p><p>The BOQ items stay unchanged. The revision and its reason are recorded in history.</p></div>}
        <div className={styles.actions}><button type="button" className={styles.secondary} disabled={pending || contractReason.trim().length < 5} onClick={() => void action('verify-contract', { reason: contractReason })}>Verify signed contract value</button><button type="button" className={styles.secondary} disabled={pending || contractReason.trim().length < 5 || proposedDifference === null} onClick={() => void action('revise-contract', { reason: contractReason, contractAmount: revisedContract })}>Record contract revision</button></div>
      </div>}
      {reviewState.findings.length > 0 && <div className={styles.status}><h4>Workbook findings and review decisions</h4><ul>{reviewState.findings.map(finding => <li key={finding.id} style={{ marginTop: 12 }}><strong>{finding.field} · {finding.severity}{finding.invalidatedAt ? ' · superseded by later reading' : ''}</strong><p>{finding.message}</p>{finding.invalidatedAt && <p>{finding.invalidationReason || 'This evidence was superseded; its original decision remains in history.'}</p>}{finding.status === 'OPEN' && !finding.invalidatedAt && canReview && <><label htmlFor={`finding-reason-${finding.id}`}>Decision reason (required for set-aside or defer)</label><input id={`finding-reason-${finding.id}`} value={decisionReasons[finding.id] || ''} onChange={event => setDecisionReasons({ ...decisionReasons, [finding.id]: event.target.value })} maxLength={300}/><div className={styles.actions}><button type="button" className={styles.secondary} disabled={pending} onClick={() => void action('finding-decision', { findingId: finding.id, decision: 'CONFIRMED' })}>Confirm as read</button><button type="button" className={styles.secondary} disabled={pending || (decisionReasons[finding.id] || '').trim().length < 5} onClick={() => void action('finding-decision', { findingId: finding.id, decision: 'SET_ASIDE', reason: decisionReasons[finding.id] })}>Set aside</button>{finding.severity !== 'BLOCKING' && <button type="button" className={styles.secondary} disabled={pending || (decisionReasons[finding.id] || '').trim().length < 5} onClick={() => void action('finding-decision', { findingId: finding.id, decision: 'DEFERRED', reason: decisionReasons[finding.id] })}>Defer</button>}</div></>}{finding.status !== 'OPEN' && <p>Decision: {finding.status}{finding.reason ? ` · ${finding.reason}` : ''}</p>}</li>)}</ul></div>}
      {reviewState.findings.some(finding => finding.status === 'SET_ASIDE') && <div className={styles.fields}><label><input type="checkbox" checked={acknowledgeSetAside} onChange={event => setAcknowledgeSetAside(event.target.checked)}/> I acknowledge the source rows intentionally set aside.</label><input aria-label="Acknowledgement reason" maxLength={300} value={setAsideReason} onChange={event => setSetAsideReason(event.target.value)} placeholder="Reason for acknowledging set-aside rows"/></div>}
      <details className={styles.history}><summary>Source, correction and reading history</summary><ul>{reviewState.revisions.map(revision => <li key={revision.id}>{revision.action} · {revision.reason} · {new Date(revision.createdAt).toLocaleString('en-PH')}</li>)}{reviewState.readingHistory.map(reading => <li key={reading.id}>Reading {reading.fileName} · {reading.selectedSheet} · {reading.appliedAt ? 'applied' : 'preview only'} · {reading.comparison.length} compared rows<ReadingConflictHistory reading={reading}/></li>)}{reviewState.correctedSources.map(source => <li key={source.versionId}>Corrected source {source.fileName} · {source.status} · {source.assessment.length} assessed rows</li>)}</ul></details>
    </>}
    {!review && <p className={styles.muted}>Engineering review has not been recorded for this BOQ.</p>}
    {canReview && <><label htmlFor="boq-engineering-comments">Engineering review comments</label><textarea id="boq-engineering-comments" rows={3} minLength={5} maxLength={10000} value={comments} onChange={event => setComments(event.target.value)} disabled={pending} /><p className={styles.muted}>Enter at least 5 characters, then record the review. Typing comments alone does not save a review.</p><div className={styles.actions} style={{ marginTop: 14 }}><button className={styles.secondary} disabled={pending || comments.trim().length < 5 || !reviewState?.contract.verified || openFindings.length > 0} onClick={() => action('review')}>{pending ? 'Saving…' : 'Record engineering review'}</button></div></>}
    {canApprove && <><label htmlFor="boq-pm-approval-note" style={{marginTop:20}}>PM approval note (optional)</label><textarea id="boq-pm-approval-note" value={approvalNote} maxLength={1000} minLength={5} rows={2} disabled={pending} onChange={event=>setApprovalNote(event.target.value)}/><p className={styles.muted}>Saved with this approval in Evidence & history. Existing review and reconciliation requirements still apply.</p><div className={styles.actions} style={{ marginTop: 20 }}><button className={styles.button} disabled={pending || (approvalNote.trim().length>0&&approvalNote.trim().length<5) || !reconciliation.matches || !review?.current || !reviewState?.contract.verified || openFindings.length > 0 || (reviewState.findings.some(finding => finding.status === 'SET_ASIDE' && !finding.invalidatedAt) && (!acknowledgeSetAside || setAsideReason.trim().length < 5))} onClick={() => { if (confirmApproval) void action('approve'); else setConfirmApproval(true); }}>{pending ? 'Saving…' : confirmApproval ? 'Confirm PM approval & lock' : 'Approve BOQ baseline'}</button>{confirmApproval && <button className={styles.secondary} disabled={pending} onClick={() => setConfirmApproval(false)}>Cancel approval</button>}</div></>}
    {confirmApproval && <p className={styles.muted}>Approval locks the BOQ and makes it available for work-package planning.</p>}
  </section>;
}
