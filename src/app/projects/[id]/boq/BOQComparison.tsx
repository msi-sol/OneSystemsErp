'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Download } from 'lucide-react';
import { compareBOQLines, decimal, isStated, summarizeComparison, type BOQComparisonLine, type ComparisonField, type ComparisonRow, type ComparisonStatus } from '@/lib/boq/comparison';
import styles from './BOQComparison.module.css';

export type { BOQComparisonLine } from '@/lib/boq/comparison';

const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
const qty = (value: number) => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 4 }).format(value);
const signed = (value: number, format: (value: number) => string) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${format(Math.abs(value))}`;
const PAGE_SIZE = 25;

type Filter = 'differences' | 'all' | ComparisonStatus;
const STATUS_CLASS: Record<ComparisonStatus, string> = { Matched: 'matched', Changed: 'changed', 'Only in file': 'onlyFile', 'Only in system': 'onlySystem' };
const isDifference = (row: ComparisonRow) => row.status !== 'Matched';

function show(field: ComparisonField, line: BOQComparisonLine): string {
  if (field === 'quantity') return isStated(line.quantity) ? qty(decimal(line.quantity)) : 'Not stated';
  if (field === 'unitCost') return isStated(line.unitCost) ? money(decimal(line.unitCost)) : 'Not stated';
  if (field === 'amount') return money(decimal(line.amount));
  if (field === 'unit') return line.unit || 'Not stated';
  return line[field] || '—';
}

function ValueCell({ row, field }: { row: ComparisonRow; field: Extract<ComparisonField, 'quantity' | 'unit' | 'unitCost' | 'amount'> }) {
  const { source, current } = row;
  if (source && current && row.changed.includes(field)) {
    const numeric = field !== 'unit' && isStated(source[field]) && isStated(current[field]);
    const delta = numeric ? decimal(current[field]) - decimal(source[field]) : 0;
    return <td className={styles.diffCell}>
      <span className={styles.old}><span className={styles.srOnly}>File: </span>{show(field, source)}</span>
      <span className={styles.new}><span className={styles.srOnly}>System: </span>{show(field, current)}</span>
      {numeric && <small className={styles.delta}>{signed(delta, field === 'quantity' ? qty : money)}</small>}
    </td>;
  }
  const line = current ?? source;
  return <td className={!current ? styles.fileOnlyValue : undefined}>{line ? show(field, line) : '—'}</td>;
}

export default function BOQComparison({ sourceAvailable, sourceName, sourceRows, currentRows, originalHref }: {
  sourceAvailable: boolean;
  sourceName: string | null;
  sourceRows: BOQComparisonLine[];
  currentRows: BOQComparisonLine[];
  originalHref?: string | null;
}) {
  const rows = useMemo(() => compareBOQLines(sourceRows, currentRows), [sourceRows, currentRows]);
  const summary = useMemo(() => summarizeComparison(rows), [rows]);
  const [filter, setFilter] = useState<Filter>(summary.differences > 0 ? 'differences' : 'all');
  const [section, setSection] = useState('all');
  const [page, setPage] = useState(0);

  if (!sourceAvailable) return <section className={styles.notice} aria-labelledby="boq-comparison-heading">
    <h3 id="boq-comparison-heading">Compare with the uploaded file</h3>
    <p>This BOQ came from an earlier import that did not keep the original file reading, so there is nothing to compare against. The recorded BOQ is still available under BOQ items.</p>
  </section>;

  const filtered = rows.filter(row => (filter === 'all' || (filter === 'differences' ? isDifference(row) : row.status === filter))
    && (section === 'all' || summary.sectionOf(row) === section));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const allMatch = summary.differences === 0 && Math.abs(summary.difference) < 0.005;
  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'differences', label: 'Differences', count: summary.differences },
    { key: 'Changed', label: 'Changed', count: summary.changed },
    { key: 'Only in file', label: 'Only in file', count: summary.onlyInFile },
    { key: 'Only in system', label: 'Only in system', count: summary.onlyInSystem },
    { key: 'all', label: 'All items', count: rows.length },
  ];

  return <section className={styles.section} aria-labelledby="boq-comparison-heading">
    <header className={styles.heading}>
      <div>
        <h3 id="boq-comparison-heading">Compare the file with the system</h3>
        <p>What was first read from <strong>{sourceName || 'the uploaded file'}</strong> next to what is recorded in the system now.</p>
      </div>
      {originalHref && <a className={styles.download} href={originalHref}><Download size={16} aria-hidden="true" /> Download original file</a>}
    </header>

    <dl className={styles.totals}>
      <div><dt>From the file · {sourceRows.length} items</dt><dd>{money(summary.sourceTotal)}</dd></div>
      <div><dt>In the system · {currentRows.length} items</dt><dd>{money(summary.currentTotal)}</dd></div>
      <div className={Math.abs(summary.difference) >= 0.005 ? styles.warnTile : undefined}><dt>Total difference</dt><dd>{Math.abs(summary.difference) < 0.005 ? 'None' : signed(summary.difference, money)}</dd></div>
      <div className={summary.differences ? styles.warnTile : undefined}><dt>Items that differ</dt><dd>{summary.differences}</dd>
        {summary.differences > 0 && <span className={styles.tileNote}>{summary.changed} changed · {summary.onlyInFile} only in file · {summary.onlyInSystem} only in system</span>}</div>
    </dl>

    {allMatch && <p className={styles.allMatch}><CheckCircle2 size={18} aria-hidden="true" /> Every recorded item matches the file, and the totals agree.</p>}

    <div className={styles.controls}>
      <div className={styles.chips} role="radiogroup" aria-label="Show items">
        {filters.map(item => <button key={item.key} type="button" role="radio" aria-checked={filter === item.key} className={filter === item.key ? styles.chipActive : styles.chip}
          disabled={item.count === 0 && item.key !== 'all'} onClick={() => { setFilter(item.key); setPage(0); }}>{item.label} <span>{item.count}</span></button>)}
      </div>
      <label className={styles.sectionSelect}>Section
        <select value={section} onChange={event => { setSection(event.target.value); setPage(0); }}>
          <option value="all">All sections</option>
          {summary.sections.map(entry => <option key={entry.section} value={entry.section}>{entry.section}{entry.differences ? ` · ${entry.differences} differ` : ''}</option>)}
        </select>
      </label>
    </div>

    {filtered.length === 0
      ? <p className={styles.empty}>{filter === 'differences' ? 'No differences in this selection.' : 'No items in this selection.'}</p>
      : <div className={styles.tableScroll} role="region" aria-label="Item comparison, file and system" tabIndex={0}>
        <table className={styles.comparisonTable}>
          <caption className={styles.srOnly}>Each changed value shows the file value, then the system value.</caption>
          <thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Unit</th><th scope="col">Unit rate</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead>
          <tbody>{visible.map((row, index) => {
            const line = row.current ?? row.source!;
            const textChanged = row.source && row.current && (['itemCode', 'description', 'section'] as const).filter(field => row.changed.includes(field));
            return <tr key={`${row.source?.rowNumber ?? 'system'}:${row.current?.itemId ?? row.current?.rowNumber ?? index}`} className={styles[STATUS_CLASS[row.status]]}>
              <th scope="row">
                <span className={styles.itemTitle}>{line.itemCode && <span className={styles.code}>{line.itemCode}</span>}{line.description}</span>
                <small>{summary.sectionOf(row)}{row.source ? ` · file row ${row.source.rowNumber}` : ''}</small>
                {textChanged && textChanged.length > 0 && <small className={styles.textChange}>In the file: {textChanged.map(field => `${field === 'itemCode' ? 'code' : field} “${show(field, row.source!)}”`).join(' · ')}</small>}
              </th>
              <ValueCell row={row} field="quantity" /><ValueCell row={row} field="unit" /><ValueCell row={row} field="unitCost" /><ValueCell row={row} field="amount" />
              <td><span className={styles.badge}>{row.status}</span></td>
            </tr>;
          })}</tbody>
        </table>
      </div>}

    {filtered.length > PAGE_SIZE && <div className={styles.pagination}>
      <span aria-live="polite">Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
      <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
      <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</button>
    </div>}

    <details className={styles.sectionTotals} open={summary.sections.some(entry => Math.abs(entry.currentAmount - entry.sourceAmount) >= 0.005)}>
      <summary>Section totals · {summary.sections.length} sections</summary>
      <div className={styles.tableScroll}><table className={styles.sectionTable}>
        <thead><tr><th scope="col">Section</th><th scope="col">From the file</th><th scope="col">In the system</th><th scope="col">Difference</th><th scope="col">Items that differ</th></tr></thead>
        <tbody>
          {summary.sections.map(entry => { const delta = entry.currentAmount - entry.sourceAmount; return <tr key={entry.section} className={Math.abs(delta) >= 0.005 || entry.differences ? styles.changed : undefined}>
            <th scope="row">{entry.section}</th><td>{money(entry.sourceAmount)} <small>({entry.sourceCount})</small></td><td>{money(entry.currentAmount)} <small>({entry.currentCount})</small></td>
            <td>{Math.abs(delta) < 0.005 ? '—' : signed(delta, money)}</td><td>{entry.differences || '—'}</td></tr>; })}
          <tr className={styles.total}><th scope="row">All sections</th><td>{money(summary.sourceTotal)}</td><td>{money(summary.currentTotal)}</td><td>{Math.abs(summary.difference) < 0.005 ? '—' : signed(summary.difference, money)}</td><td>{summary.differences || '—'}</td></tr>
        </tbody>
      </table></div>
    </details>
  </section>;
}
