'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';

import Link from 'next/link';

import Decimal from 'decimal.js';

import { useRouter } from 'next/navigation';

import styles from './BenchmarkReview.module.css';

import type { NonPricedSourceRow, WorkspaceIssue, WorkspaceAnalysis, WorkspaceItem, WorkspaceMapping } from '@/lib/boq/workspace-types';

type ReviewLine = {

  id: string; sourceRowNumber: number; section: string; itemCode: string; description: string;

  unit: string; quantity: string; unitCost: string; amount: string; boqItemId: string | null;

  activityId: string | null; additionalReason: string;

  resourceKind: 'UNCLASSIFIED' | 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | 'OTHER';

  original: { description: string; unit: string; quantity: string; unitCost: string; amount: string };

  /** Filled by "Suggest BOQ matches" (AI) and not yet checked by a person. */
  aiMatch?: { confidence: 'high' | 'medium' | 'low'; reason: string; fields: Array<'boq' | 'package' | 'kind'> } | null;

};
const CONFIDENCE_ORDER = { low: 0, medium: 1, high: 2 } as const;
const FIELD_NAME = { boq: 'BOQ item', package: 'package', kind: 'resource kind' } as const;

type Review = {

  id: string; projectId: string; status: 'DRAFT' | 'APPROVED' | 'GENERATED';

  source: { fileName: string; fileHash: string; storagePath: string; downloadUrl: string; printedTotal?: string | null; itemTotal?: string; readingNotes?: WorkspaceIssue[]; nonPricedRows?: NonPricedSourceRow[] };

  lines: ReviewLine[]; approvedBy: string | null; approvedAt: string | null; generatedAt: string | null;

  history: Array<{ action: string; actorName: string; at: string; reason?: string }>;

};

type Data = {

  project: { id: string; name: string; contractAmount: string | number; boqLocked: boolean; procurementBenchmarkLocked: boolean };

  canEdit: boolean; canApprove: boolean; revision: string | null; review: Review | null;

  boqItems: Array<{ id: string; itemCode: string; description: string; unit: string; quantity: number; totalCost: number; category: string | null }>;

  packages: Array<{ id: string; name: string }>; approvedScheduleId: string | null; legacyItemCount: number;

};

type Analysis = WorkspaceAnalysis;

type SourceItem = WorkspaceItem;

type AnalysisResult = { analysis: WorkspaceAnalysis; rows: WorkspaceItem[] };

const endpoint = (id: string) => `/api/projects/${encodeURIComponent(id)}/benchmark-review`;

const currency = (value: string | number) => Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value)) : 'Not stated';

const amount = (value: string | number) => Number(value) || 0;

const readable = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.';

const initialMapping = { headerRow: 1, itemCode: null as number | null, description: null as number | null, unit: null as number | null, quantity: null as number | null, unitCost: null as number | null, amount: null as number | null };

/** `embedded`: shown inside the project's Procurement Benchmark tab, which already has the project header and tabs. */
export default function BenchmarkReviewClient({ projectId, embedded = false }: { projectId: string; embedded?: boolean }) {

  const router = useRouter();

  const [data, setData] = useState<Data | null>(null);

  const [error, setError] = useState('');

  const [notice, setNotice] = useState('');

  const [busy, setBusy] = useState(false);

  const [file, setFile] = useState<File | null>(null);

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [nonPricedRows, setNonPricedRows] = useState<NonPricedSourceRow[]>([]);
  const [analyzedDecisions, setAnalyzedDecisions] = useState('[]');

  const [previewRows, setPreviewRows] = useState<SourceItem[]>([]);

  const [sheetName, setSheetName] = useState('');

  const [mapping, setMapping] = useState<WorkspaceMapping>(initialMapping);

  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [rowPage, setRowPage] = useState(0);

  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [aiOnly, setAiOnly] = useState(false);

  const mappingReady = !!analysis && sheetName === analysis.selectedSheet && JSON.stringify(mapping) === JSON.stringify(analysis.mapping) && JSON.stringify(nonPricedRows) === analyzedDecisions;

  useEffect(() => {

    let active = true;

    fetch(endpoint(projectId), { cache: 'no-store' }).then(async response => {

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Could not load benchmark review.');

      if (active) { setData(result as Data); setLines(result.review?.lines || []); }

    }).catch(caught => { if (active) setError(readable(caught)); });

    return () => { active = false; };

  }, [projectId]);

  const review = data?.review || null;
  // AI-filled rows a person has not checked yet, lowest confidence first; the filter shows only these.
  const aiToCheck = useMemo(() => lines.filter(line => line.aiMatch).sort((a, b) => CONFIDENCE_ORDER[a.aiMatch!.confidence] - CONFIDENCE_ORDER[b.aiMatch!.confidence] || a.sourceRowNumber - b.sourceRowNumber), [lines]);
  const aiLow = aiToCheck.filter(line => line.aiMatch!.confidence === 'low').length;
  const shownLines = aiOnly && aiToCheck.length ? aiToCheck : lines;
  const reviewRowCount = review ? shownLines.length : previewRows.length;
  const lastRowPage = Math.max(0, Math.ceil(reviewRowCount / 25) - 1);
  const currentRowPage = Math.min(rowPage, lastRowPage);
  const rowPagination = <div className={styles.actions} aria-label="Benchmark row pages"><span>Showing {reviewRowCount ? currentRowPage * 25 + 1 : 0}–{Math.min((currentRowPage + 1) * 25, reviewRowCount)} of {reviewRowCount} rows. Totals above include every row.</span><button type="button" className={styles.secondary} disabled={busy || currentRowPage === 0} onClick={()=>setRowPage(currentRowPage - 1)}>Previous rows</button><button type="button" className={styles.secondary} disabled={busy || currentRowPage >= lastRowPage} onClick={()=>setRowPage(currentRowPage + 1)}>Next rows</button></div>;

  const hasUnsavedChanges = JSON.stringify(lines) !== JSON.stringify(review?.lines || []);

  const editable = !!data?.canEdit && review?.status === 'DRAFT';

  const totals = useMemo(() => lines.reduce((sum, line) => {

    const rateTotal = amount(line.quantity) * amount(line.unitCost);

    return { benchmark: sum.benchmark + amount(line.amount), material: sum.material + (line.resourceKind === 'MATERIAL' ? amount(line.amount) : 0), calculated: sum.calculated + rateTotal, rateVariance: sum.rateVariance + amount(line.amount) - rateTotal };

  }, { benchmark: 0, material: 0, calculated: 0, rateVariance: 0 }), [lines]);

  const unresolved = lines.filter(line => !line.boqItemId && !line.additionalReason.trim());

  const missingPackage = lines.filter(line => !line.activityId);

  const unclassified = lines.filter(line => line.resourceKind === 'UNCLASSIFIED');

  const additional = lines.filter(line => !line.boqItemId);

  const mayApprove = !!data?.canApprove && review?.status === 'DRAFT' && unresolved.length === 0 && missingPackage.length === 0 && unclassified.length === 0 && additional.every(line => acknowledged.includes(line.id));

  const rateMismatches = lines.filter(line => { try { return !line.description.trim() || !line.unit.trim() || new Decimal(line.quantity).lte(0) || new Decimal(line.quantity).decimalPlaces() > 6 || !new Decimal(line.quantity).times(line.unitCost).toDecimalPlaces(2).eq(line.amount) || new Decimal(line.unitCost).decimalPlaces() > 6 || new Decimal(line.amount).decimalPlaces() > 2; } catch { return true; } });

  const approvalReady = mayApprove && !!data?.approvedScheduleId && data.project.boqLocked && rateMismatches.length === 0 && !hasUnsavedChanges;

  const contractDifference = totals.benchmark - amount(data?.project.contractAmount || 0);

  function updateLine<K extends keyof ReviewLine>(id: string, key: K, value: ReviewLine[K]) {

    // Changing a matched field makes it the reviewer's own choice, so the AI tag is cleared for that row.
    const matchField = key === 'boqItemId' || key === 'activityId' || key === 'resourceKind';
    setLines(current => current.map(line => line.id === id ? { ...line, [key]: value, ...(matchField && line.aiMatch ? { aiMatch: null } : {}) } : line));

    setAcknowledged(current => current.filter(lineId => lineId !== id));

  }

  async function submitLines() {

    if (!data || busy) return;

    setBusy(true); setError(''); setNotice('');

    try {

      const response = await fetch(endpoint(projectId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-lines', expectedRevision: data.revision, lines }) });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Could not save benchmark lines.');

      setData(result as Data); setLines(result.review?.lines || []); setNotice('Benchmark lines saved.'); router.refresh();

    } catch (caught) { setError(readable(caught)); }

    finally { setBusy(false); }

  }

  async function sendAction(action: 'approve' | 'generate') {

    if (!data || busy) return;

    setBusy(true); setError(''); setNotice('');

    try {

      const body = action === 'approve' ? { action, expectedRevision: data.revision, acknowledgeAdditionalIds: acknowledged } : { action, expectedRevision: data.revision };

      const response = await fetch(endpoint(projectId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || `Could not ${action} benchmark.`);

      setData(result as Data); setLines(result.review?.lines || []); setNotice(action === 'approve' ? 'Benchmark approved.' : 'Master materials output generated.'); router.refresh();

    } catch (caught) { setError(readable(caught)); }

    finally { setBusy(false); }

  }

  async function analyze(action: 'analyze' | 'save') {

    if (!file || busy) return;

    setBusy(true); setError(''); setNotice('');

    try {

      const form = new FormData(); form.set('action', action); form.set('file', file); form.set('sheetName', sheetName);
      form.set('nonPricedRows', JSON.stringify(nonPricedRows));

      if (analysis || action === 'save') form.set('mapping', JSON.stringify(mapping));

      if (action === 'save') {

        if (!analysis?.fileHash) throw new Error('Analyze the selected file before saving it.');

        form.set('fileHash', analysis.fileHash);

        if (analysis.documentToken) form.set('documentToken', analysis.documentToken);

        form.set('expectedRevision', data?.revision || '');

      } else if (analysis?.documentToken) form.set('documentToken', analysis.documentToken);

      const response = await fetch(endpoint(projectId), { method: 'POST', body: form });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || `Could not ${action} benchmark file.`);

      if (action === 'analyze') {

        const parsed = result as AnalysisResult;

        setAnalysis(parsed.analysis); setPreviewRows(parsed.rows || []);
        setAnalyzedDecisions(JSON.stringify(nonPricedRows));

        setSheetName(parsed.analysis.selectedSheet || parsed.analysis.sheets?.find(sheet => sheet.candidate)?.name || parsed.analysis.sheets?.[0]?.name || '');

        setMapping(parsed.analysis.mapping || initialMapping);

      } else {

        setData(result as Data); setLines(result.review?.lines || []); setAnalysis(null); setPreviewRows([]); setNotice('Source saved and benchmark review refreshed.'); router.refresh();

      }

    } catch (caught) { setError(readable(caught)); }

    finally { setBusy(false); }

  }

  async function refreshPreview() {

    if (!file) return;

    setBusy(true); setError('');

    try {

      const form = new FormData(); form.set('action', 'analyze'); form.set('file', file); form.set('sheetName', sheetName); form.set('mapping', JSON.stringify(mapping));
      form.set('nonPricedRows', JSON.stringify(nonPricedRows));

      if (analysis?.documentToken) form.set('documentToken', analysis.documentToken);

      const response = await fetch(endpoint(projectId), { method: 'POST', body: form }); const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Could not refresh the preview.');

      setAnalysis(result.analysis); setPreviewRows(result.rows || []);
      setAnalyzedDecisions(JSON.stringify(nonPricedRows));

    } catch (caught) { setError(readable(caught)); }

    finally { setBusy(false); }

  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {

    setFile(event.target.files?.[0] || null); setAnalysis(null); setPreviewRows([]); setError('');
    setNonPricedRows([]); setAnalyzedDecisions('[]');
    setRowPage(0);

  }

  async function suggestMatches() {

    if (busy) return;

    setBusy(true); setError(''); setNotice('');

    try {

      const response = await fetch(endpoint(projectId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'suggest-matches', expectedRevision: data?.revision }) });

      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not suggest matches.');

      const stats = result.aiMatching as { rowsUpdated?: number; batchesFailed?: number; ratesReconciled?: number; confidence?: { high: number; medium: number; low: number } } | undefined;
      setData(result as Data); setLines(result.review?.lines || []);
      const updated = stats?.rowsUpdated ?? 0;
      if (updated) { setAiOnly(true); setRowPage(0); }
      setNotice([
        updated
          ? `AI matched ${updated} row(s)${stats?.confidence ? `: ${stats.confidence.high} high, ${stats.confidence.medium} medium, ${stats.confidence.low} low confidence` : ''}. They are tagged “AI” with the reason; check them (low confidence first), then click “Looks right” or change the match.`
          : 'No new AI matches. Rows that are still open need a manual choice.',
        stats?.ratesReconciled ? `${stats.ratesReconciled} rate(s) differed from their amount only by display rounding and now use the precise rate (amount ÷ quantity). Stated amounts are unchanged; the stated rate stays under “Original values”.` : '',
        stats?.batchesFailed ? `${stats.batchesFailed} AI batch(es) failed; run Suggest again for the remaining rows.` : '',
      ].filter(Boolean).join(' '));

    } catch (caught) { setError(readable(caught)); }

    finally { setBusy(false); }

  }

  return <section className={`${styles.page} ${embedded ? styles.embedded : ''}`} aria-label="Procurement benchmark review">

    {!embedded && <nav className={styles.crumbs} aria-label="Breadcrumb"><Link href="/projects">Projects</Link><span>›</span><Link href={`/projects/${projectId}`}>{data?.project.name || 'Project'}</Link><span>›</span><span>Benchmark review</span></nav>}

    {embedded ? <header className={styles.embeddedHeader}><h2>Procurement benchmark</h2><p className={styles.subtitle}>Upload the benchmark, let AI match each budget line to the BOQ items and work packages, check the matches, then approve. The master material list is generated from the approved benchmark.</p></header>
    : <header className={styles.header}><div><p className={styles.eyebrow}>PROCUREMENT · CONTROLLED REVIEW</p><h1>Benchmark review</h1><p className={styles.subtitle}>{data ? `${data.project.name} · Compare priced scope, quantities, and package assignments before approval.` : 'Loading project benchmark context…'}</p></div><Link className={styles.back} href={`/projects/${projectId}`}>Project workspace</Link></header>}

    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}

    {!data && <section className={styles.panel}><p>Loading benchmark review…</p></section>}

    {data && <>

      <section className={styles.context} aria-label="Project benchmark context"><div><span>Contract baseline</span><strong>{currency(data.project.contractAmount)}</strong><small>{data.project.boqLocked ? 'BOQ locked' : 'BOQ not locked'}</small></div><div><span>Procurement benchmark</span><strong>{review ? ({ DRAFT: 'Draft', APPROVED: 'Approved', GENERATED: 'Materials generated' } as const)[review.status] : 'Not uploaded'}</strong><small>{review ? `${review.lines.length} rows` : 'Your spending budget per item'}</small></div>{data.legacyItemCount > 0 && <div><span>Older benchmark upload</span><strong>{data.legacyItemCount} rows</strong><small>Delete it to upload here</small></div>}<div><span>Next step</span><strong>{!review ? (analysis ? 'Check and save' : 'Upload the file') : review.status === 'DRAFT' ? 'Match and approve' : review.status === 'APPROVED' ? 'Generate materials' : 'Done'}</strong><small>The contract value stays separate from this budget</small></div></section>

      {(!data.project.boqLocked || !data.approvedScheduleId) && <section className={styles.panel}><h2>Complete the project baseline first</h2><p>You may preserve and review a benchmark draft now. Approval needs an approved BOQ and an approved Work Package Schedule before package assignments become available.</p><div className={styles.actions}><Link href={`/projects/${projectId}/boq`}>Open BOQ review →</Link><Link href={`/projects/${projectId}/work-packages`}>Open Work Package Schedule →</Link></div></section>}

      {(!review || review.status === 'DRAFT') && data.canEdit && <section className={styles.panel}>
        {review ? <>
          <div className={styles.panelHeading}><div><p className={styles.eyebrow}>SOURCE</p><h2>Saved benchmark file</h2></div></div>
          <p className={styles.muted}>The saved file cannot be replaced while it is being reviewed. A different file needs a benchmark revision.</p>
        </> : (() => {
          // Upload in three plain steps. Rows the reader could not price are shown as decisions; the column mapping,
          // the full row preview and the reading notes are folded away because they rarely need changing.
          const undecided = [...new Set([...(analysis?.errors || []).filter(item => item.field === 'amount' && item.message === 'amount is required.' && typeof item.row === 'number').map(item => Number(item.row)), ...nonPricedRows.map(row => row.rowNumber)])];
          const otherErrors = (analysis?.errors || []).filter(item => !(item.field === 'amount' && item.message === 'amount is required.'));
          const mappingComplete = mapping.description != null && mapping.amount != null;
          const printedDifference = analysis?.printedTotal != null ? new Decimal(analysis.printedTotal).minus(analysis.total) : null;
          const COLUMN_LABEL = { itemCode: 'Item code', description: 'Description', unit: 'Unit', quantity: 'Quantity', unitCost: 'Unit cost', amount: 'Amount' } as const;
          return <ol className={styles.steps}>
            <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">1</span>
              <div className={styles.stepBody}>
                <h3>Choose the benchmark file</h3>
                {data.legacyItemCount > 0
                  ? <p className={styles.finding}>An older benchmark upload is still saved for this project. Delete it first, then upload the file here.</p>
                  : <div className={styles.dropzone}>
                    <label className={styles.fileLabel}>
                      <input type="file" accept=".xlsx,.xls,.csv,.tsv,.pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={chooseFile} />
                      <strong>{file ? file.name : 'Choose a file'}</strong>
                      <small>Excel, CSV, PDF, Word or an image</small>
                    </label>
                    <button disabled={!file || busy} onClick={() => analyze('analyze')}>{busy && !analysis ? 'Reading the file…' : analysis ? 'Read again' : 'Read file'}</button>
                  </div>}
              </div>
            </li>

            {analysis && <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">2</span>
              <div className={styles.stepBody}>
                <h3>Check what was read</h3>
                <div className={styles.readSummary}>
                  <div><span>Rows read</span><strong>{analysis.itemCount}</strong></div>
                  <div><span>Total of the rows</span><strong>{currency(analysis.total)}</strong></div>
                  {sheetName && <div><span>Sheet</span><strong title={sheetName}>{sheetName}</strong></div>}
                </div>
                {printedDifference && (printedDifference.isZero()
                  ? <p className={styles.okText}>✓ Matches the total printed in the file.</p>
                  : <p className={styles.finding}>The file’s printed total is {currency(analysis.printedTotal!)}; the rows add up to {currency(analysis.total)} (difference {currency(printedDifference.toString())}). Amounts are kept exactly as in the file.</p>)}

                {undecided.length > 0 && <div className={styles.decisions}>
                  {(() => { const open = undecided.filter(rowNumber => !nonPricedRows.some(row => row.rowNumber === rowNumber && row.reason.trim())).length; return <p><strong>{open ? `${open} ${open === 1 ? 'row needs' : 'rows need'} your decision` : `✓ ${undecided.length} ${undecided.length === 1 ? 'row' : 'rows'} without a price will be skipped`}</strong></p>; })()}
                  {undecided.map(rowNumber => {
                    const skipped = nonPricedRows.find(row => row.rowNumber === rowNumber);
                    return <div className={styles.decision} key={rowNumber}>
                      <p>Row {rowNumber} has no amount. If it is a heading or a note (not something to buy), skip it.</p>
                      <label className={styles.check}><input type="checkbox" checked={!!skipped} onChange={event => setNonPricedRows(current => event.target.checked ? [...current, { rowNumber, reason: '' }] : current.filter(row => row.rowNumber !== rowNumber))} /> Skip row {rowNumber}: it has no price</label>
                      {skipped && <label className={styles.reason}>Why? (required)<input value={skipped.reason} maxLength={300} placeholder="e.g. Section heading" onChange={event => setNonPricedRows(current => current.map(row => row.rowNumber === rowNumber ? { ...row, reason: event.target.value } : row))} /></label>}
                    </div>;
                  })}
                </div>}
                {otherErrors.length > 0 && <div className={styles.findings}>{otherErrors.map((item, index) => <p key={index} role="alert">Row {item.row}: {item.message}</p>)}</div>}

                <details className={styles.more} open={!mappingComplete}>
                  <summary>Columns and sheet <span>{mappingComplete ? 'detected automatically; change only if the preview looks wrong' : 'choose the missing columns'}</span></summary>
                  {!!analysis.sheets?.length && <label className={styles.sheet}>Sheet<select value={sheetName} onChange={e => setSheetName(e.target.value)}>{analysis.sheets.map(sheet => <option key={sheet.name} value={sheet.name}>{sheet.name} · {sheet.rowCount} rows{sheet.candidate ? ' · suggested' : ''}</option>)}</select></label>}
                  <div className={styles.mapping}>
                    <label>Header row <small>(the row with the column titles)</small><input type="number" min="1" max="10000" value={mapping.headerRow} onChange={event => setMapping(current => ({ ...current, headerRow: Number(event.target.value) }))} /></label>
                    {(['itemCode', 'description', 'unit', 'quantity', 'unitCost', 'amount'] as const).map(key => <label key={key}>{COLUMN_LABEL[key]}<select value={mapping[key] ?? ''} onChange={e => setMapping(current => ({ ...current, [key]: e.target.value === '' ? null : Number(e.target.value) }))}><option value="">Not in the file</option>{(analysis.columns || []).map(column => <option key={column.index} value={column.index}>{column.index}: {column.label}</option>)}</select></label>)}
                  </div>
                </details>

                <details className={styles.more}>
                  <summary>Preview the rows <span>({previewRows.length})</span></summary>
                  {rowPagination}<div className={styles.preview}><table><thead><tr><th>Row</th><th>Section</th><th>Code</th><th>Description</th><th>Unit</th><th>Quantity</th><th>Unit rate</th><th>Amount</th></tr></thead><tbody>{previewRows.slice(currentRowPage * 25, (currentRowPage + 1) * 25).map((row, index) => <tr key={`${row.sourceRowNumber ?? index}-${index}`}><td>{row.sourceRowNumber ?? '—'}</td><td>{row.section || '—'}</td><td>{row.itemCode || '—'}</td><td>{row.description || '—'}</td><td>{row.unit || '—'}</td><td>{row.quantity ?? '—'}</td><td>{row.unitCost ?? '—'}</td><td>{row.amount ?? '—'}</td></tr>)}</tbody></table></div>
                </details>

                {!!analysis.warnings?.length && <details className={styles.more}>
                  <summary>Reading notes <span>({analysis.warnings.length}, for reference only)</span></summary>
                  <div className={styles.notesList}>{analysis.warnings.map((item, index) => <p key={index}>Row {item.row} · {item.field}: {item.message}</p>)}</div>
                </details>}
              </div>
            </li>}

            {analysis && <li className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">3</span>
              <div className={styles.stepBody}>
                <h3>Save the benchmark</h3>
                {!mappingReady
                  ? <><p className={styles.muted}>You changed the columns, the sheet or the skipped rows. Apply the changes to update what was read.</p>
                    <div className={styles.actions}><button disabled={busy || nonPricedRows.some(row => !row.reason.trim())} onClick={refreshPreview}>{busy ? 'Applying…' : 'Apply changes'}</button>{nonPricedRows.some(row => !row.reason.trim()) && <span className={styles.muted}>Give a reason for each skipped row first.</span>}</div></>
                  : analysis.errors.length
                    ? <p className={styles.muted}>Decide on the {undecided.length > 0 ? 'rows above' : 'problems above'} first.</p>
                    : <><p className={styles.muted}>After saving, you match each line to the BOQ and work packages (AI can suggest the matches), check them, then approve.</p>
                      <div className={styles.actions}><button disabled={busy || !previewRows.length} onClick={() => analyze('save')}>{busy ? 'Saving…' : `Save benchmark (${analysis.itemCount} rows)`}</button></div></>}
              </div>
            </li>}
          </ol>;
        })()}
      </section>}

      {review && <>

        {review.status === 'GENERATED' && <section className={styles.panel}><h2>Master materials generated</h2><p>{lines.some(line => line.resourceKind === 'MATERIAL') ? 'Approved material quantities are connected to their work packages and the existing procurement/inventory records.' : 'This approved benchmark contains no material rows. Its labor/equipment/other budget evidence is retained; no inventory rows were created.'}</p><div className={styles.actions}><Link href={`/projects/${projectId}?tab=consolidation`}>Open master materials →</Link><Link href={`/projects/${projectId}/work-packages?baseline=active`}>Open package material requirements →</Link></div></section>}

        <section className={styles.panel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>SOURCE RECORD</p><h2>{review.source.fileName}</h2><p>Revision {data.revision || '—'} · SHA-256 {review.source.fileHash}</p></div>{review.source.downloadUrl && <a className={styles.back} href={review.source.downloadUrl}>Download source</a>}</div>

          <div className={styles.metricGrid}><div><span>Benchmark line total</span><strong>{currency(totals.benchmark)}</strong></div><div><span>Material-only total for generated inventory</span><strong>{currency(totals.material)}</strong></div><div><span>Unmatched / additional rows</span><strong>{additional.length} rows</strong></div><div><span>BOQ contract baseline</span><strong>{currency(data.project.contractAmount)}</strong></div><div><span>Benchmark minus contract</span><strong className={contractDifference > 0 ? styles.negative : ''}>{currency(contractDifference)}</strong></div><div><span>Line amount minus quantity × rate</span><strong className={Math.abs(totals.rateVariance) > 0.01 ? styles.negative : ''}>{currency(totals.rateVariance)}</strong></div></div>

          <p className={styles.explain}>The approved benchmark records the spending and quantity limits. The locked BOQ remains the contract baseline. Differences are shown for review; no source amount is automatically recalculated.</p>
          {review.source.printedTotal!=null&&review.source.itemTotal!=null&&<p className={styles.finding}>Preserved source printed total: {currency(review.source.printedTotal)} · Imported item total: {currency(review.source.itemTotal)} · Difference: {currency(new Decimal(review.source.printedTotal).minus(review.source.itemTotal).toString())}.</p>}
          {!!review.source.readingNotes?.length&&<details className={styles.findings}><summary>Preserved source notes and non-priced decisions · {review.source.readingNotes.length}</summary>{review.source.readingNotes.map((note,index)=><p key={index}>Row {note.row} · {note.field}: {note.message}</p>)}</details>}

          {(unresolved.length > 0 || missingPackage.length > 0 || unclassified.length > 0 || rateMismatches.length > 0) && <p className={styles.finding}>Approval needs {unresolved.length} unresolved BOQ/additional classification(s), {missingPackage.length} missing package assignment(s), {unclassified.length} unclassified resource kind(s), and {rateMismatches.length} invalid quantity/rate/amount calculation(s). Correct the entered values; the system does not recalculate money.</p>}

          {review.status === 'DRAFT' && aiToCheck.length > 0 && <p className={styles.finding}>{aiToCheck.length} AI {aiToCheck.length === 1 ? 'match has' : 'matches have'} not been checked yet{aiLow ? ` (${aiLow} low confidence)` : ''}. Approval is still allowed, but check them first so the budget is linked to the right BOQ items and packages.</p>}
          {hasUnsavedChanges && <p role="status" className={styles.explain}>Save your line edits before matching or approval. The approval always uses the saved revision.</p>}<div className={styles.actions}>{editable && <><button className={styles.secondary} disabled={busy || hasUnsavedChanges} onClick={suggestMatches}>Suggest BOQ matches</button><button disabled={busy} onClick={submitLines}>{busy ? 'Saving…' : 'Save line edits'}</button></>}{review.status === 'DRAFT' && data.canApprove && <button disabled={!approvalReady || busy} onClick={() => sendAction('approve')}>Approve benchmark</button>}{review.status === 'APPROVED' && (data.canEdit || data.canApprove) && <button disabled={busy} onClick={() => sendAction('generate')}>{busy ? 'Generating…' : lines.some(line => line.resourceKind === 'MATERIAL') ? 'Generate master materials output' : 'Complete benchmark · no material output'}</button>}</div>

          {review.status === 'APPROVED' && <p className={styles.explain}>Approval locks this benchmark version. Generated master-material output links to this approved revision; output limits and downstream material usage remain governed by their linked records and revision history.</p>}

          {aiToCheck.length > 0 && <div className={styles.aiBar} role="status">
            <span><strong>{aiToCheck.length} AI {aiToCheck.length === 1 ? 'match' : 'matches'} to check</strong>{aiLow ? ` · ${aiLow} low confidence` : ''}. Rows tagged “AI” were matched by AI; check the reason, then click “Looks right” or change the match, and save your line edits.</span>
            <label className={styles.aiToggle}><input type="checkbox" checked={aiOnly} onChange={e => { setAiOnly(e.target.checked); setRowPage(0); }} /> Show only AI matches (low confidence first)</label>
            {editable && aiOnly && <button type="button" className={styles.secondary} disabled={busy} onClick={() => setLines(current => current.map(line => line.aiMatch?.confidence === 'high' ? { ...line, aiMatch: null } : line))}>Mark all high-confidence as checked</button>}
          </div>}
          {rowPagination}<div className={styles.tableWrap}><table className={styles.reviewTable}><thead><tr><th>Source</th><th>Description</th><th>Unit</th><th>Quantity</th><th>Rate</th><th>Amount</th><th>Resource kind</th><th>BOQ item / additional scope</th><th>Package</th><th>Reason for additional row</th><th>Rate check</th></tr></thead><tbody>{shownLines.slice(currentRowPage * 25, (currentRowPage + 1) * 25).map(line=>{const rateAmount=amount(line.quantity)*amount(line.unitCost);const delta=amount(line.amount)-rateAmount;return <tr key={line.id} className={line.aiMatch ? styles.aiRow : undefined}><td>{line.sourceRowNumber}<small>{line.section || line.itemCode}</small>
            {line.aiMatch && <div className={styles.aiTag}>
              <span className={`${styles.aiBadge} ${styles[`ai_${line.aiMatch.confidence}`]}`}>AI · {line.aiMatch.confidence}</span>
              <small>Filled {line.aiMatch.fields.map(field => FIELD_NAME[field]).join(', ')}. {line.aiMatch.reason}</small>
              {editable && <button type="button" className={styles.aiCheck} onClick={() => setLines(current => current.map(row => row.id === line.id ? { ...row, aiMatch: null } : row))}>Looks right</button>}
            </div>}<details><summary>Original values</summary><p>{line.original.description}</p><small>{line.original.quantity} {line.original.unit} · rate {currency(line.original.unitCost)} · amount {currency(line.original.amount)}</small></details></td><td><input aria-label={`Description row ${line.sourceRowNumber}`} disabled={!editable} value={line.description} onChange={e=>updateLine(line.id,'description',e.target.value)}/></td><td><input aria-label={`Unit row ${line.sourceRowNumber}`} disabled={!editable} value={line.unit} onChange={e=>updateLine(line.id,'unit',e.target.value)}/></td><td><input aria-label={`Quantity row ${line.sourceRowNumber}`} disabled={!editable} inputMode="decimal" value={line.quantity} onChange={e=>updateLine(line.id,'quantity',e.target.value)}/></td><td><input aria-label={`Rate row ${line.sourceRowNumber}`} disabled={!editable} inputMode="decimal" value={line.unitCost} onChange={e=>updateLine(line.id,'unitCost',e.target.value)}/></td><td><input aria-label={`Amount row ${line.sourceRowNumber}`} disabled={!editable} inputMode="decimal" value={line.amount} onChange={e=>updateLine(line.id,'amount',e.target.value)}/></td><td><select aria-label={`Resource kind row ${line.sourceRowNumber}`} disabled={!editable} value={line.resourceKind} onChange={e=>updateLine(line.id,'resourceKind',e.target.value as ReviewLine['resourceKind'])}><option value="UNCLASSIFIED">Unclassified · select</option><option value="MATERIAL">Material</option><option value="LABOR">Labor</option><option value="EQUIPMENT">Equipment</option><option value="OTHER">Other</option></select></td><td><select aria-label={`BOQ mapping row ${line.sourceRowNumber}`} disabled={!editable} value={line.boqItemId || ''} onChange={e=>updateLine(line.id,'boqItemId',e.target.value || null)}><option value="">Additional / unmatched</option>{data.boqItems.map(item=><option key={item.id} value={item.id}>{item.itemCode} · {item.description} ({item.unit})</option>)}</select>{!line.boqItemId ? <small>Additional rows require a reason and approval acknowledgement.</small> : <small>Scope reference only. Material quantities stay in {line.unit}; no conversion to BOQ units is inferred.</small>}</td><td><select aria-label={`Package row ${line.sourceRowNumber}`} disabled={!editable} value={line.activityId || ''} onChange={e=>updateLine(line.id,'activityId',e.target.value || null)}><option value="">Select package…</option>{data.packages.map(pkg=><option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}</select></td><td><input aria-label={`Additional reason row ${line.sourceRowNumber}`} disabled={!editable || !!line.boqItemId} value={line.additionalReason} placeholder="Reason required for additional scope" onChange={e=>updateLine(line.id,'additionalReason',e.target.value)}/>{!line.boqItemId && <label className={styles.ack}><input type="checkbox" disabled={!data.canApprove || review.status !== 'DRAFT'} checked={acknowledged.includes(line.id)} onChange={e=>setAcknowledged(current=>e.target.checked?[...new Set([...current,line.id])]:current.filter(id=>id!==line.id))}/> Approver acknowledges additional row</label>}</td><td className={Math.abs(delta)>0.01?styles.negative:''}>{currency(delta)}<small>entered {currency(line.amount)} · qty × rate {currency(rateAmount)}</small></td></tr>})}</tbody></table></div>

          <details className={styles.matches}><summary>Suggested matches · review before approval</summary><p>Suggestions are unapproved. Confirm each BOQ item and package against the source and project scope before approving.</p></details>

        </section>

        <section className={styles.panel}><h2>Review history</h2>{review.history.length ? <ol className={styles.history}>{review.history.map((entry,index)=><li key={`${entry.at}-${index}`}><strong>{entry.action}</strong><span>{entry.actorName} · {new Date(entry.at).toLocaleString()}</span>{entry.reason && <p>{entry.reason}</p>}</li>)}</ol> : <p className={styles.muted}>No review actions recorded yet.</p>}</section>

      </>}

      <p className={styles.footer}>Linked master-material output retains its approved benchmark revision reference. Later benchmark revisions do not silently rewrite generated output or downstream records; review those links in their owning workflows.</p>

    </>}

  </section>;

}

