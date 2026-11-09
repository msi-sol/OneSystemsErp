'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { BOQReviewDocument } from '@/lib/boq/review-state';
import styles from './BOQFindingsReview.module.css';
import ReasonSelect from '@/components/ui/ReasonSelect';

const FINDING_REASONS = [
  'Checked against the signed BOQ: the file is right as read',
  'Not part of the contract scope',
  'Header, subtotal or note row, not a BOQ item',
  'Duplicate of another BOQ line',
  'Will be corrected in a BOQ revision',
  'Waiting for the client or designer to confirm',
];

type Finding = BOQReviewDocument['findings'][number];
type Decision = 'CONFIRMED' | 'SET_ASIDE' | 'DEFERRED';
const DECISION_LABEL: Record<string, string> = { CONFIRMED: 'Confirmed as read', CORRECTED: 'Corrected', SET_ASIDE: 'Set aside', DEFERRED: 'Deferred', OPEN: 'To decide' };
const FIELD_LABEL: Record<string, string> = { quantity: 'Quantity', unit: 'Unit', unitCost: 'Unit rate', amount: 'Amount', itemCode: 'Item code', description: 'Description', total: 'BOQ total' };

/** One open finding at a time, so the reviewer always knows what to decide next. */
export default function BOQFindingsReview({ projectId, findings, canReview, pending, onDecide }: {
  projectId: string;
  findings: Finding[];
  canReview: boolean;
  pending: boolean;
  onDecide: (findingId: string, decision: Decision, reason?: string) => Promise<boolean>;
}) {
  const open = findings.filter(finding => finding.status === 'OPEN' && !finding.invalidatedAt);
  const decided = findings.length - open.length;
  const [index, setIndex] = useState(0);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  if (!findings.length) return null;
  const position = Math.min(index, Math.max(0, open.length - 1));
  const finding = open[position];
  const reason = finding ? (reasons[finding.id] || '').trim() : '';
  const blocking = finding?.severity === 'BLOCKING';
  const decide = async (decision: Decision) => {
    if (!finding) return;
    // Same request shape as before: confirming sends no reason; set-aside and defer require one.
    const saved = await onDecide(finding.id, decision, decision === 'CONFIRMED' ? undefined : reason);
    // The decided finding leaves the open list, so the same position now shows the next one.
    if (saved && position >= open.length - 1) setIndex(Math.max(0, open.length - 2));
  };

  return <section className={styles.review} id="boq-findings" aria-labelledby="boq-findings-heading">
    <header className={styles.header}>
      <div><h4 id="boq-findings-heading">Reading findings</h4><p>Points where the file was unclear or did not add up. Each one needs a decision before the engineering review.</p></div>
      <span className={styles.count}>{open.length ? `${open.length} to decide` : 'All decided'} · {decided} of {findings.length} done</span>
    </header>
    <div className={styles.progress} role="progressbar" aria-label="Findings decided" aria-valuemin={0} aria-valuemax={findings.length} aria-valuenow={decided}><span style={{ width: `${findings.length ? decided / findings.length * 100 : 0}%` }} /></div>

    {finding ? <article className={styles.card} aria-labelledby={`finding-${finding.id}-title`}>
      <div className={styles.cardTop}>
        <span className={styles.position}>Finding {position + 1} of {open.length}</span>
        <span className={blocking ? styles.blocking : styles.attention}>{blocking ? 'Must be settled' : 'Needs attention'}</span>
      </div>
      <h5 id={`finding-${finding.id}-title`}>{FIELD_LABEL[finding.field] ?? finding.field}{finding.rowNumber ? ` · file row ${finding.rowNumber}` : ''}</h5>
      <p className={styles.message}>{finding.message}</p>
      <p className={styles.help}>{blocking
        ? 'Confirm it if the file is right as read, or set it aside with a reason. If the reading is wrong, correct the item first.'
        : 'Confirm it, set it aside, or defer it with a reason. If the reading is wrong, correct the item first.'}
        {' '}<Link href={`/projects/${projectId}/boq?view=compare`}>Check it against the file</Link> · <Link href={`/projects/${projectId}/boq?view=items`}>Correct BOQ items</Link></p>
      {canReview ? <>
        <label htmlFor={`finding-reason-${finding.id}`}>Reason {blocking ? '(needed to set aside)' : '(needed to set aside or defer)'}</label>
        <ReasonSelect id={`finding-reason-${finding.id}`} options={FINDING_REASONS} value={reasons[finding.id] || ''} maxLength={300} disabled={pending} placeholder="Why this decision is right"
          onChange={value => setReasons({ ...reasons, [finding.id]: value })} />
        <div className={styles.decisions}>
          <button type="button" className={styles.confirm} disabled={pending} onClick={() => void decide('CONFIRMED')}><CheckCircle2 size={16} aria-hidden="true" /> Confirm as read</button>
          <button type="button" className={styles.other} disabled={pending || reason.length < 5} onClick={() => void decide('SET_ASIDE')}>Set aside</button>
          {!blocking && <button type="button" className={styles.other} disabled={pending || reason.length < 5} onClick={() => void decide('DEFERRED')}>Defer</button>}
        </div>
      </> : <p className={styles.waiting}>A Project Engineer decides this finding.</p>}
      {open.length > 1 && <nav className={styles.pager} aria-label="Move between findings">
        <button type="button" disabled={position === 0} onClick={() => setIndex(position - 1)}><ChevronLeft size={16} aria-hidden="true" /> Previous</button>
        <button type="button" disabled={position >= open.length - 1} onClick={() => setIndex(position + 1)}>Next <ChevronRight size={16} aria-hidden="true" /></button>
      </nav>}
    </article> : <p className={styles.done}><CheckCircle2 size={18} aria-hidden="true" /> Every finding has a decision. Continue with the contract check and engineering review below.</p>}

    <details className={styles.all}>
      <summary>All findings · {findings.length}</summary>
      <ol>{findings.map(item => <li key={item.id} className={item.invalidatedAt ? styles.superseded : undefined}>
        <span className={item.status === 'OPEN' && !item.invalidatedAt ? styles.statusOpen : styles.statusDone}>{item.invalidatedAt ? 'Superseded' : DECISION_LABEL[item.status] ?? item.status}</span>
        <span><strong>{FIELD_LABEL[item.field] ?? item.field}{item.rowNumber ? ` · row ${item.rowNumber}` : ''}</strong> {item.message}{item.reason ? <em> · {item.reason}</em> : null}</span>
      </li>)}</ol>
    </details>
  </section>;
}
