'use client';

import { useState } from 'react';
import styles from './BOQComparison.module.css';

export type BOQComparisonLine = {
  itemId: string | null;
  rowNumber: number;
  section: string;
  itemCode: string;
  description: string;
  unit: string;
  quantity: string;
  unitCost: string;
  amount: string;
};

type ComparisonStatus = 'Changed' | 'Matched' | 'Source only' | 'Current only';
type ComparisonRow = { source: BOQComparisonLine | null; current: BOQComparisonLine | null; status: ComparisonStatus };

function decimal(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
}

function quantity(value: number) {
  return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 4 }).format(value);
}

const stated = (value: string | undefined) => value !== undefined && value.trim() !== '';
const statedQuantity = (value: string) => stated(value) ? quantity(decimal(value)) : 'Not stated';
const statedRate = (value: string) => stated(value) ? money(decimal(value)) : 'Not stated';
const PAGE_SIZE_DEFAULT = 25;

function sectionQuantity(rows: BOQComparisonLine[]) {
  const totals = new Map<string, number>();
  for (const row of rows.filter(row => stated(row.quantity))) totals.set(row.unit || 'unit not recorded', (totals.get(row.unit || 'unit not recorded') ?? 0) + decimal(row.quantity));
  const missing = rows.filter(row => !stated(row.quantity)).length;
  return [...[...totals].map(([unit, value]) => `${quantity(value)} ${unit}`), ...(missing ? [`${missing} quantity not stated`] : [])].join(', ') || '—';
}

function same(source: BOQComparisonLine, current: BOQComparisonLine) {
  return source.section.trim() === current.section.trim()
    && source.itemCode.trim() === current.itemCode.trim()
    && source.description.trim() === current.description.trim()
    && source.unit.trim() === current.unit.trim()
    && stated(source.quantity) === stated(current.quantity) && decimal(source.quantity) === decimal(current.quantity)
    && stated(source.unitCost) === stated(current.unitCost) && decimal(source.unitCost) === decimal(current.unitCost)
    && decimal(source.amount) === decimal(current.amount);
}

function compare(sourceRows: BOQComparisonLine[], currentRows: BOQComparisonLine[]): ComparisonRow[] {
  const currentById = new Map(currentRows.filter(row => row.itemId).map(row => [row.itemId!, row]));
  const sourceByCode = new Map<string, BOQComparisonLine[]>();
  for (const row of sourceRows) {
    if (!row.itemId && row.itemCode.trim()) sourceByCode.set(row.itemCode.trim(), [...(sourceByCode.get(row.itemCode.trim()) ?? []), row]);
  }
  const usedSource = new Set<BOQComparisonLine>();
  const usedCurrent = new Set<BOQComparisonLine>();
  const rows: ComparisonRow[] = [];

  for (const source of sourceRows) {
    let current = source.itemId ? currentById.get(source.itemId) : undefined;
    if (!current && source.itemCode.trim()) {
      const candidates = currentRows.filter(row => row.itemCode.trim() === source.itemCode.trim());
      const sourceCandidates = sourceByCode.get(source.itemCode.trim()) ?? [];
      if (candidates.length === 1 && sourceCandidates.length === 1) current = candidates[0];
    }
    if (current && !usedCurrent.has(current)) {
      usedSource.add(source);
      usedCurrent.add(current);
      rows.push({ source, current, status: same(source, current) ? 'Matched' : 'Changed' });
    } else {
      rows.push({ source, current: null, status: 'Source only' });
    }
  }
  for (const current of currentRows) {
    if (!usedCurrent.has(current)) rows.push({ source: null, current, status: 'Current only' });
  }
  return rows;
}

function metricDelta(source: string | undefined, current: string | undefined, kind: 'quantity' | 'money') {
  if (!stated(source) || !stated(current)) return '—';
  const delta = decimal(current) - decimal(source);
  return kind === 'money' ? money(delta) : quantity(delta);
}

export default function BOQComparison({
  sourceAvailable,
  sourceName,
  sourceRows,
  currentRows,
  nextAction,
  reviewHistory,
}: {
  sourceAvailable: boolean;
  sourceName: string | null;
  sourceRows: BOQComparisonLine[];
  currentRows: BOQComparisonLine[];
  nextAction: string;
  reviewHistory: { action: string; at: string; reason: string | null }[];
}) {
  const [sectionFilter, setSectionFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  if (!sourceAvailable) return <section className={styles.notice} aria-labelledby="boq-comparison-heading">
    <h3 id="boq-comparison-heading">BOQ comparison</h3>
    <p><strong>Legacy canonical snapshot.</strong> No original workbook or first source reading was preserved, so a source-to-current comparison cannot be shown. The saved BOQ remains available below.</p>
    <p><strong>Current next action:</strong> {nextAction}</p>
    {reviewHistory.length > 0 && <History rows={reviewHistory} />}
  </section>;

  const rows = compare(sourceRows, currentRows);
  const sourceTotal = sourceRows.reduce((sum, row) => sum + decimal(row.amount), 0);
  const currentTotal = currentRows.reduce((sum, row) => sum + decimal(row.amount), 0);
  const sections = [...new Set([...sourceRows, ...currentRows].map(row => row.section || 'Unsectioned'))].sort((left, right) => left.localeCompare(right));
  const filteredRows = sectionFilter === 'all' ? rows : rows.filter(row =>
    (row.source?.section || 'Unsectioned') === sectionFilter || (row.current?.section || 'Unsectioned') === sectionFilter,
  );
  const filteredSource = filteredRows.flatMap(row => row.source ? [row.source] : []);
  const filteredCurrent = filteredRows.flatMap(row => row.current ? [row.current] : []);
  const filteredSourceTotal = filteredSource.reduce((sum, row) => sum + decimal(row.amount), 0);
  const filteredCurrentTotal = filteredCurrent.reduce((sum, row) => sum + decimal(row.amount), 0);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = filteredRows.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const changed = rows.filter(row => row.status === 'Changed').length;
  const sourceOnly = rows.filter(row => row.status === 'Source only').length;
  const currentOnly = rows.filter(row => row.status === 'Current only').length;

  return <section className={styles.section} aria-labelledby="boq-comparison-heading">
    <div className={styles.heading}>
      <div><h3 id="boq-comparison-heading">Source reading compared with current BOQ</h3><p>{sourceName || 'Preserved first workbook reading'} · {sourceRows.length} source lines · {currentRows.length} current lines</p></div>
      <span className={styles.action}><strong>Current next action</strong>{nextAction}</span>
    </div>
    <div className={styles.totals}>
      <div><span>All source · {sourceRows.length} lines</span><strong>{money(sourceTotal)}</strong></div>
      <div><span>All current · {currentRows.length} lines</span><strong>{money(currentTotal)}</strong></div>
      <div><span>Amount difference</span><strong>{money(currentTotal - sourceTotal)}</strong></div>
      <div><span>Line differences</span><strong>{changed} changed · {sourceOnly} source only · {currentOnly} current only</strong></div>
    </div>
    <div className={styles.sectionTotals}>
      <h4>Section totals</h4>
      <div className={styles.sectionScroll}><table><thead><tr><th>Section</th><th>Source quantities</th><th>Current quantities</th><th>Source amount</th><th>Current amount</th><th>Amount difference</th></tr></thead><tbody>
        {[...new Set([...sourceRows.map(row => row.section || 'Unsectioned'), ...currentRows.map(row => row.section || 'Unsectioned')])].map(section => {
          const sourceSection = sourceRows.filter(row => (row.section || 'Unsectioned') === section);
          const currentSection = currentRows.filter(row => (row.section || 'Unsectioned') === section);
          const sourceAmount = sourceSection.reduce((sum, row) => sum + decimal(row.amount), 0);
          const currentAmount = currentSection.reduce((sum, row) => sum + decimal(row.amount), 0);
          return <tr key={section}><th>{section}</th><td>{sectionQuantity(sourceSection)}</td><td>{sectionQuantity(currentSection)}</td><td>{money(sourceAmount)}</td><td>{money(currentAmount)}</td><td>{money(currentAmount - sourceAmount)}</td></tr>;
        })}
        <tr className={styles.total}><th>All sections</th><td>{sectionQuantity(sourceRows)}</td><td>{sectionQuantity(currentRows)}</td><td>{money(sourceTotal)}</td><td>{money(currentTotal)}</td><td>{money(currentTotal - sourceTotal)}</td></tr>
      </tbody></table></div>
    </div>
    <div className={styles.controls} aria-label="Comparison row controls">
      <label>Section <select value={sectionFilter} onChange={event => { setSectionFilter(event.target.value); setPage(0); }}><option value="all">All sections ({rows.length} comparison rows)</option>{sections.map(section => <option key={section} value={section}>{section}</option>)}</select></label>
      <label>Rows per page <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(0); }}><option value={25}>25</option><option value={50}>50</option></select></label>
      <p aria-live="polite">{filteredRows.length === 0 ? 'No comparison rows in this section' : `Showing ${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, filteredRows.length)} of ${filteredRows.length} filtered comparison rows · source ${filteredSource.length} lines / ${money(filteredSourceTotal)} · current ${filteredCurrent.length} lines / ${money(filteredCurrentTotal)}`}</p>
      <div className={styles.pagination}><button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button><span>Page {safePage + 1} of {pageCount}</span><button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</button></div>
    </div>
    <div className={styles.tableScroll} role="region" aria-label="Side-by-side BOQ line comparison" tabIndex={0}>
      <table className={styles.comparisonTable}><thead>
        <tr><th colSpan={5}>First source reading</th><th colSpan={5}>Current structured BOQ</th><th colSpan={5}>Difference · current minus source</th></tr>
        <tr><th>Section / item</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th><th>Section / item</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th><th>Status</th></tr>
      </thead><tbody>
        {visibleRows.map((row, index) => <tr key={`${row.source?.rowNumber ?? 'current'}:${row.current?.itemId ?? row.current?.rowNumber ?? index}`}>
          <td>{row.source ? <><small>{row.source.section || 'Unsectioned'} · row {row.source.rowNumber}</small><strong>{row.source.itemCode} {row.source.description}</strong></> : <span className={styles.missing}>No matching source line</span>}</td>
          <td>{row.source ? statedQuantity(row.source.quantity) : '—'}</td><td>{row.source?.unit || '—'}</td><td>{row.source ? statedRate(row.source.unitCost) : '—'}</td><td>{row.source ? money(decimal(row.source.amount)) : '—'}</td>
          <td>{row.current ? <><small>{row.current.section || 'Unsectioned'}</small><strong>{row.current.itemCode} {row.current.description}</strong></> : <span className={styles.missing}>No current BOQ line</span>}</td>
          <td>{row.current ? quantity(decimal(row.current.quantity)) : '—'}</td><td>{row.current?.unit || '—'}</td><td>{row.current ? money(decimal(row.current.unitCost)) : '—'}</td><td>{row.current ? money(decimal(row.current.amount)) : '—'}</td>
          <td>{metricDelta(row.source?.quantity, row.current?.quantity, 'quantity')}</td><td>{row.source && row.current ? row.source.unit === row.current.unit ? 'No change' : `${row.source.unit || '—'} → ${row.current.unit || '—'}` : row.source ? `${row.source.unit || '—'} → —` : `— → ${row.current?.unit || '—'}`}</td><td>{metricDelta(row.source?.unitCost, row.current?.unitCost, 'money')}</td><td>{metricDelta(row.source?.amount, row.current?.amount, 'money')}</td>
          <td><span className={`${styles.badge} ${row.status === 'Matched' ? styles.matched : styles.changed}`}>{row.status}</span></td>
        </tr>)}
        <tr className={styles.total}><th>Source total</th><td colSpan={3}>{sectionQuantity(sourceRows)}</td><td>{money(sourceTotal)}</td><th>Current total</th><td colSpan={3}>{sectionQuantity(currentRows)}</td><td>{money(currentTotal)}</td><td>By unit above</td><td>Units vary by line</td><td>—</td><td>{money(currentTotal - sourceTotal)}</td><td>—</td></tr>
      </tbody></table>
    </div>
    <History rows={reviewHistory} />
  </section>;
}

function History({ rows }: { rows: { action: string; at: string; reason: string | null }[] }) {
  return <details className={styles.history}><summary>Approval and source review history · {rows.length}</summary>
    {rows.length ? <ol>{rows.map((row, index) => <li key={`${row.at}:${row.action}:${index}`}><strong>{row.action.replaceAll('_', ' ')}</strong><time>{new Date(row.at).toLocaleString('en-PH')}</time>{row.reason && <p>{row.reason}</p>}</li>)}</ol> : <p>No approval or source review events are recorded for this BOQ version yet.</p>}
  </details>;
}
