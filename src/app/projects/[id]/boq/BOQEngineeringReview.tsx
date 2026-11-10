'use client';
import { useState, useTransition, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import type { BOQReviewDocument } from '@/lib/boq/review-state';
import styles from '../planning/planning.module.css';
import ReasonSelect from '@/components/ui/ReasonSelect';

// Approval fields are drop-downs of common answers; "Custom…" lets the user type their own.
const CONTRACT_REASONS = [
  'Checked against the signed contract: the value matches',
  'BOQ total matches the signed contract',
  'Contract revised per the signed amendment',
  'Contract value corrected per the notice of award',
];
const SET_ASIDE_REASONS = [
  'Set-aside rows are headers, subtotals or notes',
  'Set-aside rows are outside the contract scope',
  'Set-aside rows are duplicates of other lines',
];
const ENGINEERING_REVIEW_COMMENTS = [
  'Quantities, units and amounts checked against the signed BOQ',
  'Checked against the signed BOQ; findings resolved',
  'Checked; only minor wording differences from the file',
  'Checked; corrections made are recorded in the history',
];
const PM_APPROVAL_NOTES = [
  'Approved as reviewed by engineering',
  'Approved; baseline ready for work-package planning',
  'Approved with the contract check on record',
];
import BOQFindingsReview from './BOQFindingsReview';
import { boqFindingsRequired } from '@/lib/boq/findings-mode';

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
  const [contractReason, setContractReason] = useState('');
  const [revisedContract, setRevisedContract] = useState('');
  const [setAsideReason, setSetAsideReason] = useState('');
  const [acknowledgeSetAside, setAcknowledgeSetAside] = useState(false);
  // With findings switched off they are hidden and never block the review or approval (the server agrees).
  const findingsOn = boqFindingsRequired();
  const openFindings = findingsOn ? reviewState?.findings.filter(finding => finding.status === 'OPEN' && !finding.invalidatedAt) || [] : [];
  const proposedDifference = /^\d+(?:\.\d{1,2})?$/.test(revisedContract) && new Decimal(revisedContract).gt(0)
    ? new Decimal(revisedContract).minus(reconciliation.boqTotal).abs().toFixed(2) : null;
  async function action(value: 'review' | 'approve' | 'finding-decision' | 'verify-contract' | 'revise-contract', extra: Record<string, unknown> = {}): Promise<boolean> {
    if (pending) return false;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/projects/${projectId}/boq-review`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: value, versionId, expectedChecksum: checksum, comments, approvalNote, expectedRowVersion: reviewState?.rowVersion, setAsideAcknowledged: acknowledgeSetAside, setAsideReason, ...extra }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The review could not be saved.');
      setMessage(value === 'review' ? 'Engineering review recorded for the current BOQ.' : value === 'approve' ? 'BOQ approved and locked.' : value === 'revise-contract' ? 'Contract revision recorded. Verify the revised value before approval.' : value === 'verify-contract' ? data.reconciliation?.reconciles === false ? `Contract check recorded. The ${money(data.reconciliation.difference)} difference remains; approval stays blocked until reconciliation.` : 'Contract value verified. The BOQ and contract amounts reconcile.' : 'BOQ review updated.');
      if (value === 'revise-contract') setRevisedContract('');
      setComments(''); setConfirmApproval(false); startRefresh(() => router.refresh());
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The review could not be saved.'); return false; }
    finally { setBusy(false); }
  }
  // The approval runs in order: 1 contract, 2 engineering review, 3 PM approval. Only the current step is open;
  // done steps collapse to one line and later steps wait.
  const contractDone = !!reviewState?.contract.verified && reconciliation.matches;
  const reviewDone = !!review?.current;
  const current = !contractDone ? 1 : !reviewDone ? 2 : 3;
  const step = (number: 1 | 2 | 3, title: string, done: boolean, summary: ReactNode, body: ReactNode, waiting: string) => {
    const state = done ? 'done' : number === current ? 'current' : 'waiting';
    return <li className={`${styles.flowStep} ${styles[`flow_${state}`]}`} aria-current={state === 'current' ? 'step' : undefined}>
      <div className={styles.flowHead}><span className={styles.flowNumber} aria-hidden="true">{done ? <Check size={16} strokeWidth={3} /> : number}</span><strong>{title}</strong></div>
      <div className={styles.flowBody}>{done ? <p className={styles.flowSummary}>{summary}</p> : state === 'current' ? body : <p className={styles.flowSummary}>{waiting}</p>}</div>
    </li>;
  };
  const noPermission = (who: string) => <p className={styles.flowSummary}>Waiting for {who}.</p>;
  return <section className={styles.panel} aria-labelledby="boq-approval-heading"><h3 id="boq-approval-heading">BOQ review and approval</h3>
    {error && <div className={styles.error} role="alert"><p>{error}</p>{/changed|refresh|concurrent/i.test(error) && <button type="button" className={styles.secondary} disabled={pending} onClick={() => { setConfirmApproval(false); setError(''); startRefresh(() => router.refresh()); }}>Refresh current BOQ</button>}</div>}{message && <p className={styles.success} role="status">{message}</p>}
    {reviewState && !reviewState.firstReadAvailable && <div className={styles.status}><strong>Legacy canonical snapshot</strong><p>No original workbook or first reading was preserved.</p></div>}
    {reviewState && findingsOn && <>
      <BOQFindingsReview projectId={projectId} findings={reviewState.findings} canReview={canReview} pending={pending}
        onDecide={(findingId, decision, reason) => action('finding-decision', reason === undefined ? { findingId, decision } : { findingId, decision, reason })} />
      {reviewState.findings.some(finding => finding.status === 'SET_ASIDE') && <div className={styles.fields}><label><input type="checkbox" checked={acknowledgeSetAside} onChange={event => setAcknowledgeSetAside(event.target.checked)}/> I acknowledge the source rows intentionally set aside.</label><ReasonSelect id="boq-set-aside-reason" label="Acknowledgement reason" options={SET_ASIDE_REASONS} maxLength={300} value={setAsideReason} onChange={setSetAsideReason} placeholder="Reason for acknowledging set-aside rows"/></div>}
    </>}

    <ol className={styles.flow} aria-label="BOQ approval steps">
      {step(1, 'Verify the contract value', contractDone,
        <>{money(reconciliation.contractAmount)} · matches the BOQ total{reviewState?.contract.verifiedBy ? ` · ${reviewState.contract.verifiedBy}` : ''}</>,
        <>
          <dl className={styles.reconciliationFacts} id="boq-contract-check"><div><dt>Contract value</dt><dd>{money(reconciliation.contractAmount)}</dd></div><div><dt>BOQ total</dt><dd>{money(reconciliation.boqTotal)}</dd></div><div><dt>Difference</dt><dd>{money(reconciliation.difference)}</dd></div></dl>
          {!reconciliation.matches && <div className={styles.actions}><a className={styles.link} href={`/projects/${projectId}/boq?view=items`}>Correct BOQ items</a>{canApprove && <button type="button" className={styles.secondary} disabled={pending} onClick={() => { setRevisedContract(reconciliation.boqTotal); setConfirmApproval(false); }}>Use BOQ total as contract value</button>}</div>}
          {canApprove ? <>
            <div className={styles.fields}>
              <div><label htmlFor="boq-contract-verification-reason">Reason</label><ReasonSelect id="boq-contract-verification-reason" options={CONTRACT_REASONS} value={contractReason} onChange={setContractReason} maxLength={300} placeholder="Record the signed-document check" disabled={pending}/></div>
              {(!reconciliation.matches || revisedContract) && <div><label htmlFor="boq-revised-contract">New contract value</label><input id="boq-revised-contract" aria-label="Revised signed contract value" type="number" min="0.01" step="0.01" value={revisedContract} onChange={event => { setRevisedContract(event.target.value); setConfirmApproval(false); }} placeholder="Only for a contract revision" disabled={pending}/></div>}
            </div>
            {proposedDifference !== null && <p className={styles.flowSummary}>{money(reconciliation.contractAmount)} → {money(revisedContract)} · difference to BOQ {money(proposedDifference)} · not saved</p>}
            <div className={styles.actions}>
              {proposedDifference !== null
                ? <button type="button" className={styles.button} disabled={pending || contractReason.trim().length < 5} onClick={() => void action('revise-contract', { reason: contractReason, contractAmount: revisedContract })}>Save new contract value</button>
                : <button type="button" className={styles.button} disabled={pending || contractReason.trim().length < 5} onClick={() => void action('verify-contract', { reason: contractReason })}>Verify contract value</button>}
            </div>
          </> : noPermission('the Project Manager')}
        </>,
        '')}
      {step(2, 'Engineering review', reviewDone,
        <>{review?.reviewerName} · {review ? new Date(review.decidedAt).toLocaleString('en-PH') : ''}{review?.comments ? ` · ${review.comments}` : ''}</>,
        canReview ? <>
          {review && !review.current && <p className={styles.flowSummary}>The BOQ changed after the last review; review it again.</p>}
          <label htmlFor="boq-engineering-comments">Comments</label>
          <ReasonSelect id="boq-engineering-comments" options={ENGINEERING_REVIEW_COMMENTS} multiline maxLength={10000} value={comments} onChange={setComments} disabled={pending} placeholder="Engineering review comments" />
          <div className={styles.actions}><button className={styles.button} disabled={pending || comments.trim().length < 5 || !reviewState?.contract.verified || openFindings.length > 0} onClick={() => action('review')}>{pending ? 'Saving…' : 'Record engineering review'}</button></div>
        </> : noPermission('the Project Engineer'),
        'After the contract value is verified.')}
      {step(3, 'PM approval', false, null,
        canApprove ? <>
          <label htmlFor="boq-pm-approval-note">Note (optional)</label>
          <ReasonSelect id="boq-pm-approval-note" options={PM_APPROVAL_NOTES} optional multiline value={approvalNote} maxLength={1000} disabled={pending} onChange={setApprovalNote} placeholder="PM approval note"/>
          <div className={styles.actions}><button className={styles.button} disabled={pending || (approvalNote.trim().length>0&&approvalNote.trim().length<5) || !reconciliation.matches || !review?.current || !reviewState?.contract.verified || openFindings.length > 0 || (findingsOn && !!reviewState?.findings.some(finding => finding.status === 'SET_ASIDE' && !finding.invalidatedAt) && (!acknowledgeSetAside || setAsideReason.trim().length < 5))} onClick={() => { if (confirmApproval) void action('approve'); else setConfirmApproval(true); }}>{pending ? 'Saving…' : confirmApproval ? 'Confirm: approve & lock BOQ' : 'Approve BOQ baseline'}</button>{confirmApproval && <button className={styles.secondary} disabled={pending} onClick={() => setConfirmApproval(false)}>Cancel</button>}</div>
          {confirmApproval && <p className={styles.flowSummary}>Locks the BOQ for work-package planning.</p>}
        </> : noPermission('the Project Manager'),
        'After the engineering review.')}
    </ol>

    {reviewState && <details className={styles.history}><summary>History</summary><ul>{reviewState.revisions.map(revision => <li key={revision.id}>{revision.action} · {revision.reason} · {new Date(revision.createdAt).toLocaleString('en-PH')}</li>)}{reviewState.readingHistory.map(reading => <li key={reading.id}>Reading {reading.fileName} · {reading.selectedSheet} · {reading.appliedAt ? 'applied' : 'preview only'} · {reading.comparison.length} compared rows<ReadingConflictHistory reading={reading}/></li>)}{reviewState.correctedSources.map(source => <li key={source.versionId}>Corrected source {source.fileName} · {source.status} · {source.assessment.length} assessed rows</li>)}</ul></details>}
  </section>;
}
