import Link from 'next/link';
import { ArrowRight, Download, History, Lock } from 'lucide-react';
import styles from './BOQBaselineCard.module.css';

const money = (value: string) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value));
const when = (value: string | null) => value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';

/** The approved, locked BOQ at a glance: what was approved, by whom, and where to go next. */
export default function BOQBaselineCard({ projectId, total, contractAmount, sectionCount, itemCount, versionNumber, approvedBy, approvedAt, approvalNote, reviewer, originalHref, sourceName }: {
  projectId: string; total: string; contractAmount: string; sectionCount: number; itemCount: number; versionNumber: number;
  approvedBy: string | null; approvedAt: string | null; approvalNote: string | null;
  reviewer: { name: string; at: string } | null; originalHref: string | null; sourceName: string | null;
}) {
  const matches = Math.abs(Number(total) - Number(contractAmount)) < 0.005;
  return <section className={styles.card} aria-labelledby="boq-baseline-heading">
    <header className={styles.header}>
      <span className={styles.badge}><Lock size={14} aria-hidden="true" /> Approved · locked</span>
      <h3 id="boq-baseline-heading">BOQ baseline · version {versionNumber}</h3>
      <p>This is the approved scope and value of the contract. Work packages are planned from it, and it cannot be edited.</p>
    </header>
    <dl className={styles.facts}>
      <div><dt>BOQ total</dt><dd>{money(total)}</dd></div>
      <div><dt>Signed contract value</dt><dd>{money(contractAmount)}{matches && <span className={styles.ok}> · matches</span>}</dd></div>
      <div><dt>Sections · items</dt><dd>{sectionCount} · {itemCount}</dd></div>
      <div><dt>Approved by</dt><dd>{approvedBy ?? 'Not recorded'}<small>{when(approvedAt)}</small></dd></div>
      <div><dt>Engineering review</dt><dd>{reviewer?.name ?? 'Not recorded'}<small>{reviewer ? when(reviewer.at) : ''}</small></dd></div>
      <div><dt>Source file</dt><dd className={styles.file}>{sourceName ?? 'Not kept'}</dd></div>
    </dl>
    {approvalNote && <p className={styles.note}><strong>Approval note</strong> {approvalNote}</p>}
    <div className={styles.actions}>
      <Link className={styles.primary} href={`/projects/${projectId}/work-packages`}>Open Work Packages <ArrowRight size={16} aria-hidden="true" /></Link>
      {originalHref && <a className={styles.secondary} href={originalHref}><Download size={16} aria-hidden="true" /> Download original file</a>}
      <Link className={styles.secondary} href={`/projects/${projectId}/boq?view=history`}><History size={16} aria-hidden="true" /> Approval history</Link>
    </div>
  </section>;
}
