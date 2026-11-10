'use client';

import { useCallback, useRef, useState } from 'react';
import SideDrawer from '@/components/ui/SideDrawer';
import { ArrowRight, BookOpen, CalendarDays, LockKeyhole, Search } from 'lucide-react';
import type { buildWorkPackageSummary } from '@/lib/scheduling/work-package-summary';
import styles from './work-packages.module.css';
import DraftAllocationEditor from './DraftAllocationEditor';

type Summary = ReturnType<typeof buildWorkPackageSummary>;

export interface WorkPackageWorkspaceProps {
  projectId: string;
  summary: Summary;
  workflowStatus: string;
  baselineCode?: string | null;
  boqLocked: boolean;
  onPlan: () => void;
  onReview?: () => void;
  canEditDraft?: boolean;
  rowVersion?: number;
  onRefresh?: () => void;
  moduleMode?: boolean;
  onOpenPackage?: (id: string) => void;
  completionWeights?: Record<string, number>;
  /** Materials, labor and equipment allowances per package, in pesos. */
  allowances?: Record<string, number>;
}

// Group the decimal string without converting financial values to binary floats.
function numberText(value: string | null) {
  if (value === null) return 'Not recorded';
  const [whole, fraction] = value.split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? `.${fraction}` : '');
}

function money(value: string | null) {
  return value === null ? 'Value not recorded' : `₱${numberText(value)}`;
}

function dateText(value: string | null) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

const workflowLabels: Record<string, string> = {
  AI_GENERATED_DRAFT: 'Draft plan',
  INVALID_GENERATED_DRAFT: 'Plan needs correction',
  TECHNICAL_REVISIONS_REQUIRED: 'Changes requested',
  READY_FOR_REVIEW: 'Ready for technical review',
  UNDER_TECHNICAL_REVIEW: 'Under technical review',
  TECHNICALLY_APPROVED: 'Technical review approved',
  PENDING_BASELINE_APPROVAL: 'Awaiting baseline approval',
  ACTIVE_BASELINE: 'Approved active baseline',
  SUPERSEDED_BASELINE: 'Superseded baseline',
  ARCHIVED_BASELINE: 'Archived baseline',
};

export default function WorkPackageWorkspace({ projectId, summary, workflowStatus, baselineCode, boqLocked, onPlan, canEditDraft = false, rowVersion = 0, onRefresh, moduleMode = false, onOpenPackage, completionWeights, allowances }: WorkPackageWorkspaceProps) {
  const [query, setQuery] = useState('');
  const [issuesOnly, setIssuesOnly] = useState(false);
  // Package whose BOQ scope is open in the side panel; focus returns to its "Review BOQ scope" button on close.
  const [scopeId, setScopeId] = useState<string | null>(null);
  const scopeOpener = useRef<HTMLButtonElement | null>(null);
  const closeScope = useCallback(() => { setScopeId(null); requestAnimationFrame(() => scopeOpener.current?.focus()); }, []);
  const canEditScope = !moduleMode && canEditDraft && !summary.isImmutable && boqLocked
    && ['AI_GENERATED_DRAFT', 'INVALID_GENERATED_DRAFT', 'TECHNICAL_REVISIONS_REQUIRED'].includes(workflowStatus);
  const search = query.trim().toLocaleLowerCase();
  const matches = (values: (string | null)[]) => values.some(value => value?.toLocaleLowerCase().includes(search));
  const scopeIssuesByBoq = new Set(summary.coverage.filter(line => line.status !== 'planned').map(line => line.id));
  const packageHasIssue = (item: Summary['packages'][number]) =>
    !item.startDate || !item.finishDate || item.scope.length === 0 || item.amount === null ||
    item.scope.some(line => line.allocatedQuantity === null || line.legacyQuantity || scopeIssuesByBoq.has(line.boqItemId));
  const packages = summary.packages.filter(item =>
    (!issuesOnly || packageHasIssue(item)) &&
    (!search || matches([item.code, item.name, item.groupName, ...item.scope.flatMap(line => [line.itemCode, line.description])])));
  const coverage = summary.coverage.filter(line =>
    (!issuesOnly || line.status !== 'planned') && (!search || matches([line.itemCode, line.description])));
  const scopeIssues = summary.coverage.filter(line => line.status !== 'planned').length;
  const dated = summary.packages.filter(item => item.startDate && item.finishDate);
  const starts = dated.map(item => item.startDate!).sort();
  const finishes = dated.map(item => item.finishDate!).sort();
  const windowStart = starts.length ? new Date(starts[0]).getTime() : null;
  const windowFinish = finishes.length ? new Date(finishes[finishes.length - 1]).getTime() : null;
  const windowSize = windowStart !== null && windowFinish !== null ? Math.max(86400000, windowFinish - windowStart + 86400000) : 0;

  // The package's BOQ scope table, shown in the side panel.
  const scopeItem = scopeId ? summary.packages.find(entry => entry.id === scopeId) ?? null : null;
  const scopeTable = (item: Summary['packages'][number]) => (item.scope.length === 0 ? <p className={styles.empty}>No BOQ quantities are linked to this package. Review its scope in the existing planning workflow.</p> : <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={`${item.code} BOQ scope`}><table><caption className={styles.srOnly}>BOQ quantities allocated to {item.name}</caption><thead><tr><th scope="col">BOQ item</th><th scope="col">Unit</th><th scope="col">BOQ quantity</th><th scope="col">Package quantity</th><th scope="col">Allocation value</th></tr></thead><tbody>{item.scope.map(line => <tr key={line.id}><th scope="row"><strong>{line.itemCode}</strong><span>{line.description}</span></th><td>{line.unit}</td><td>{numberText(line.approvedQuantity)}</td><td>{canEditScope && onRefresh && !line.legacyQuantity ? <DraftAllocationEditor projectId={projectId} allocationId={line.id} itemCode={line.itemCode} quantity={line.allocatedQuantity} rowVersion={rowVersion} onSaved={onRefresh} /> : numberText(line.allocatedQuantity)}{line.legacyQuantity && <small className={styles.warning}>Legacy mapping · verify quantity</small>}</td><td>{money(line.amount)}</td></tr>)}</tbody></table></div>);

  return (
    <section className={styles.workspace} aria-labelledby="work-package-heading">
      <div className={styles.header}>
        <div>
          <h2 id="work-package-heading">{moduleMode ? 'Package list and schedule' : 'Work packages'}</h2>
          {!moduleMode && <p>Turn the approved BOQ into a plan the project team can follow.</p>}
        </div>
        {!moduleMode && <a className={styles.link} href={`/projects/${encodeURIComponent(projectId)}?tab=awarded-boq`}>
          <BookOpen size={16} aria-hidden="true" /> View contract BOQ <ArrowRight size={16} aria-hidden="true" />
        </a>}
      </div>

      {!moduleMode && <ol className={styles.workflow} aria-label="BOQ to work package workflow">
        <li><span>1</span><div><strong>Establish the BOQ</strong><small>{boqLocked ? 'Contract BOQ locked' : 'Review and lock the contract BOQ'}</small></div></li>
        <li><span>2</span><div><strong>Plan work packages</strong><small>{summary.packages.length} activities · {summary.datedCount} fully dated</small></div></li>
        <li><span>3</span><div><strong>Review and approve</strong><small>{workflowLabels[workflowStatus] || workflowStatus.replaceAll('_', ' ')}</small></div></li>
      </ol>}

      {/* In the Work Packages module the steps and the Review & approve tab already show the plan status. */}
      {!moduleMode && <div className={styles.standing}>
        <div>
          <strong>{summary.isImmutable && <LockKeyhole size={16} aria-hidden="true" />} {workflowLabels[workflowStatus] || 'Project plan'}{baselineCode ? ` · ${baselineCode}` : ''}</strong>
          {summary.isImmutable && <p>This baseline is locked. Changes go through a plan revision.</p>}
        </div>
        <a className={styles.link} href="#schedule-review">Review workflow <ArrowRight size={16} aria-hidden="true" /></a>
      </div>}

      {/* The Work Packages module shows these totals in its plan summary above, so only the standalone view repeats them. */}
      {!moduleMode && <dl className={styles.facts}>
        <div><dt>Contract BOQ value</dt><dd>{money(summary.contractAmount)}</dd></div>
        <div><dt>Package allocation value</dt><dd>{money(summary.allocatedAmount)}</dd></div>
        <div><dt>BOQ scope to review</dt><dd>{scopeIssues} of {summary.coverage.length} items</dd></div>
        <div><dt>Packages without BOQ links</dt><dd>{summary.missingScopeCount}</dd></div>
      </dl>}


      <div className={styles.toolbar}>
        <label className={styles.search}><Search size={17} aria-hidden="true" /><span className={styles.srOnly}>Search work packages and BOQ items</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search packages or BOQ items" /></label>
        <label className={styles.check}><input type="checkbox" checked={issuesOnly} onChange={event => setIssuesOnly(event.target.checked)} /> Needs attention only</label>
        {!moduleMode && <button className={styles.action} type="button" onClick={onPlan}>{summary.isImmutable ? 'View WBS & activities' : 'Plan in WBS & activities'} <ArrowRight size={16} aria-hidden="true" /></button>}
      </div>

      {/* Only the plan's date range is kept here; the package count and dating status show in the plan summary. */}
      {windowStart !== null && windowFinish !== null && <div className={styles.scheduleHeading}>
        <span><CalendarDays size={16} aria-hidden="true" />{dateText(starts[0])} – {dateText(finishes[finishes.length - 1])}</span>
      </div>}

      {packages.length === 0 ? <p className={styles.empty}>{summary.packages.length ? 'No packages match these filters. Clear the search or turn off the attention filter.' : 'No work packages are recorded in this schedule yet.'}</p> : (
        <ul className={styles.packages}>
          {packages.map(item => {
            const geometry = item.startDate && item.finishDate && windowStart !== null ? {
              marginLeft: `${((new Date(item.startDate).getTime() - windowStart) / windowSize) * 100}%`,
              width: `${Math.max(0.5, ((new Date(item.finishDate).getTime() - new Date(item.startDate).getTime() + 86400000) / windowSize) * 100)}%`,
            } : null;
            return <li key={item.id} className={styles.package}>
              <div className={styles.packageHeading}><div><span className={styles.code}>{item.code}</span><h4>{item.name}</h4><p>{item.groupName || 'No WBS group assigned'}</p></div>{summary.isImmutable && <span className={styles.locked}><LockKeyhole size={14} aria-hidden="true" /> Locked</span>}</div>
              <div className={styles.timeline} aria-hidden="true">{geometry && <span style={geometry} />}</div>
              <div className={styles.packageFacts}>
                {completionWeights && <span>Completion weight: <strong>{Number(((completionWeights[item.id] || 0) * 100).toFixed(4))}%</strong></span>}
                <span>{item.startDate && item.finishDate ? `${dateText(item.startDate)} – ${dateText(item.finishDate)}` : 'Dates need review'}</span>
                <span><strong>{item.weightPercent === null ? 'Not available' : `${numberText(item.weightPercent)}%`}</strong> BOQ value share</span>
                <span>Value: <strong>{money(item.amount)}</strong></span>
                {allowances && <span>Allowances: <strong>{allowances[item.id] ? `₱${allowances[item.id].toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'None yet'}</strong></span>}
                <span>{moduleMode?'Measured progress':'Recorded progress'}: <strong>{item.recordedProgressPercent === null ? (summary.isImmutable?'Not available for this baseline':'See active baseline') : `${item.recordedProgressPercent}%`}</strong></span>
              </div>
              {/* One row: the BOQ scope opens in a panel on the right; Open package stays on the right of the same row. */}
              <div className={styles.cardActions}>
                <button type="button" className={styles.scopeButton} aria-haspopup="dialog" onClick={event => { scopeOpener.current = event.currentTarget; setScopeId(item.id); }}>Review BOQ scope <span>{item.scope.length} linked {item.scope.length === 1 ? 'item' : 'items'}</span></button>
                {onOpenPackage && <button type="button" className={styles.action} onClick={() => onOpenPackage(item.id)}>Open package <ArrowRight size={15} /></button>}
              </div>
            </li>;
          })}
        </ul>
      )}

      <details className={styles.coverage}>
        <summary>BOQ quantity coverage <span>{scopeIssues ? `${scopeIssues} items need review` : 'View all BOQ items'}</span></summary>
        <p>Across this schedule, allocated quantities should cover each BOQ item exactly once in total. This comparison supports review; it does not replace the server’s approval checks.</p>        {coverage.length === 0 ? <p className={styles.empty}>{summary.coverage.length ? 'No BOQ items match these filters.' : 'No contract BOQ items are available. Open Contract Value & BOQ to review the source.'}</p> : <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="BOQ quantity coverage"><table><caption className={styles.srOnly}>BOQ quantities compared with work package allocations</caption><thead><tr><th scope="col">BOQ item</th><th scope="col">Unit</th><th scope="col">BOQ quantity</th><th scope="col">Allocated quantity</th><th scope="col">Remaining quantity</th><th scope="col">Scope standing</th></tr></thead><tbody>{coverage.map(line => <tr key={line.id}><th scope="row"><strong>{line.itemCode}</strong><span>{line.description}</span></th><td>{line.unit}</td><td>{numberText(line.approvedQuantity)}</td><td>{numberText(line.allocatedQuantity)}</td><td>{numberText(line.remainingQuantity)}</td><td className={line.status === 'planned' ? styles.planned : styles.warning}>{{planned:'Fully planned',unplanned:'Scope remaining',overallocated:'Overallocated',unknown:'Quantity needs review'}[line.status]}</td></tr>)}</tbody></table></div>}
      </details>
      {scopeItem && <SideDrawer onClose={closeScope} wide={canEditScope}
        title={`${scopeItem.code} · ${scopeItem.name}`}
        meta={`${scopeItem.scope.length} linked BOQ ${scopeItem.scope.length === 1 ? 'item' : 'items'} · ${money(scopeItem.amount)}`}
        footer={<><span>Package value · {money(scopeItem.amount)}</span>{onOpenPackage && <button type="button" className={styles.footerLink} onClick={() => { const id = scopeItem.id; setScopeId(null); onOpenPackage(id); }}>Open package →</button>}</>}>
        {scopeTable(scopeItem)}
      </SideDrawer>}
    </section>
  );
}
