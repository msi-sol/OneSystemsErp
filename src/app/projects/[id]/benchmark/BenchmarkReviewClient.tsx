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

};

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

export default function BenchmarkReviewClient({ projectId }: { projectId: string }) {

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
  const reviewRowCount = review ? lines.length : previewRows.length;
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

    setLines(current => current.map(line => line.id === id ? { ...line, [key]: value } : line));

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

      const stats = result.aiMatching as { rowsUpdated?: number; batchesFailed?: number; ratesReconciled?: number } | undefined;
      setData(result as Data); setLines(result.review?.lines || []);
      setNotice([
        `Suggestions applied as unapproved matches${stats ? ` (${stats.rowsUpdated ?? 0} row(s) updated)` : ''}. Review every suggested mapping before approval.`,
        stats?.ratesReconciled ? `${stats.ratesReconciled} rate(s) differed from their amount only by display rounding and now use the precise rate (amount ÷ quantity). Stated amounts are unchanged; the stated rate stays under “Original values”.` : '',
        stats?.batchesFailed ? `${stats.batchesFailed} AI batch(es) failed; run Suggest again for the remaining rows.` : '',
      ].filter(Boolean).join(' '));

    } catch (caught) { setError(readable(caught)); }

    finally { setBusy(false); }

  }

  return <section className={styles.page} aria-label="Procurement benchmark review">

    <nav className={styles.crumbs} aria-label="Breadcrumb"><Link href="/projects">Projects</Link><span>›</span><Link href={`/projects/${projectId}`}>{data?.project.name || 'Project'}</Link><span>›</span><span>Benchmark review</span></nav>

    <header className={styles.header}><div><p className={styles.eyebrow}>PROCUREMENT · CONTROLLED REVIEW</p><h1>Benchmark review</h1><p className={styles.subtitle}>{data ? `${data.project.name} · Compare priced scope, quantities, and package assignments before approval.` : 'Loading project benchmark context…'}</p></div><Link className={styles.back} href={`/projects/${projectId}`}>Project workspace</Link></header>

    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}

    {!data && <section className={styles.panel}><p>Loading benchmark review…</p></section>}

    {data && <>

      <section className={styles.context} aria-label="Project benchmark context"><div><span>Contract baseline</span><strong>{currency(data.project.contractAmount)}</strong><small>{data.project.boqLocked ? 'BOQ locked' : 'BOQ not locked'}</small></div><div><span>Procurement benchmark</span><strong>{review ? review.status : 'Not uploaded'}</strong><small>{review ? review.lines.length + ' source rows' : 'Upload a priced source to begin'}</small></div><div><span>Saved benchmark records</span><strong>{data.legacyItemCount}</strong><small>Existing records retained for reference</small></div><div><span>Next step</span><strong>{!review ? 'Analyze source' : review.status === 'DRAFT' ? 'Resolve and approve' : review.status === 'APPROVED' ? 'Generate materials' : 'Review output history'}</strong><small>BOQ contract baseline stays separate from benchmark limits</small></div></section>

      {(!data.project.boqLocked || !data.approvedScheduleId) && <section className={styles.panel}><h2>Complete the project baseline first</h2><p>You may preserve and review a benchmark draft now. Approval needs an approved BOQ and an approved Work Package Schedule before package assignments become available.</p><div className={styles.actions}><Link href={`/projects/${projectId}/boq`}>Open BOQ review →</Link><Link href={`/projects/${projectId}/work-packages`}>Open Work Package Schedule →</Link></div></section>}

      {(!review || review.status === 'DRAFT') && data.canEdit && <section className={styles.panel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>SOURCE</p><h2>{review ? 'Saved benchmark source' : 'Analyze benchmark source'}</h2><p>Supported files: .xlsx, .pdf, .docx. Review all extracted rows and column mapping before saving.</p></div></div>

        {!review && data.legacyItemCount === 0 && <div className={styles.upload}><label>Benchmark file<input type="file" accept=".xlsx,.pdf,.docx" onChange={chooseFile}/></label><button disabled={!file || busy} onClick={() => analyze('analyze')}>{busy ? 'Analyzing…' : 'Analyze file'}</button>{file && <span>{file.name}</span>}</div>}

        {!review && data.legacyItemCount > 0 && <p className={styles.finding}>Existing legacy benchmark rows are retained. New source intake is unavailable while those records remain; use the existing procurement benchmark workflow.</p>}

        {review && <p className={styles.muted}>The saved source cannot be replaced in this review state. A source change must follow the project’s revision workflow.</p>}

        {analysis && !review && <><div className={styles.analysisStats}><span>{analysis.fileName || file?.name}</span><span>{analysis.itemCount} source rows · {previewRows.length} shown</span><span>Source total {currency(analysis.total)}</span>{analysis.documentKind && <span>Document reading: {analysis.documentKind.toUpperCase()}</span>}</div>

          {!!analysis.sheets?.length && <label className={styles.sheet}>Sheet<select value={sheetName} onChange={e => setSheetName(e.target.value)}>{analysis.sheets.map(sheet => <option key={sheet.name} value={sheet.name}>{sheet.name} · {sheet.rowCount} rows{sheet.candidate ? ' · suggested' : ''}</option>)}</select></label>}

          <div className={styles.mapping}><h3>Column mapping <small>(column numbers are one-based)</small></h3><label>Header row<input type="number" min="1" max="10000" value={mapping.headerRow} onChange={event => setMapping(current => ({...current,headerRow:Number(event.target.value)}))}/></label>{(['itemCode','description','unit','quantity','unitCost','amount'] as const).map(key => <label key={key}>{key.replace(/[A-Z]/g, char => ` ${char}`).replace(/^./, char => char.toUpperCase())}<select value={mapping[key] ?? ''} onChange={e => setMapping(current => ({ ...current, [key]: e.target.value === '' ? null : Number(e.target.value) }))}><option value="">Not mapped</option>{(analysis.columns || []).map(column => <option key={column.index} value={column.index}>{column.index}: {column.label}</option>)}</select></label>)}</div>

          {!!analysis.errors?.length && <div className={styles.findings}>{analysis.errors.map((item,index)=><p key={index} role="alert">Row {item.row} · {item.field}: {item.message}</p>)}</div>}
          {[...new Set([...analysis.errors.filter(item=>item.field==='amount'&&item.message==='amount is required.'&&typeof item.row==='number').map(item=>Number(item.row)),...nonPricedRows.map(row=>row.rowNumber)])].map(rowNumber=><div className={styles.findings} key={rowNumber}><label><input type="checkbox" checked={nonPricedRows.some(row=>row.rowNumber===rowNumber)} onChange={event=>setNonPricedRows(current=>event.target.checked?[...current,{rowNumber,reason:''}]:current.filter(row=>row.rowNumber!==rowNumber))}/> Review source row {rowNumber} as non-priced scope</label><p>This requires a reason. Only a row with no stated unit, rate or amount can be excluded; the original and your decision remain preserved.</p>{nonPricedRows.some(row=>row.rowNumber===rowNumber)&&<label>Reason for non-priced row {rowNumber}<input value={nonPricedRows.find(row=>row.rowNumber===rowNumber)?.reason||''} maxLength={300} onChange={event=>setNonPricedRows(current=>current.map(row=>row.rowNumber===rowNumber?{...row,reason:event.target.value}:row))}/></label>}</div>)}
          {!!analysis.warnings?.length&&<details className={styles.findings}><summary>{analysis.warnings.length} source reading notes — review before saving</summary>{analysis.warnings.map((item,index)=><p key={index}>Row {item.row} · {item.field}: {item.message}</p>)}</details>}
          {analysis.printedTotal!=null&&<p className={styles.finding}>Printed source total: {currency(analysis.printedTotal)} · Imported item total: {currency(analysis.total)} · Difference: {currency(new Decimal(analysis.printedTotal).minus(analysis.total).toString())}. Source amounts are retained; no automatic adjustment.</p>}

          {rowPagination}<div className={styles.preview}><table><thead><tr><th>Row</th><th>Section</th><th>Code</th><th>Description</th><th>Unit</th><th>Quantity</th><th>Unit rate</th><th>Source amount</th></tr></thead><tbody>{previewRows.slice(currentRowPage * 25, (currentRowPage + 1) * 25).map((row,index)=><tr key={`${row.sourceRowNumber ?? index}-${index}`}><td>{row.sourceRowNumber ?? '—'}</td><td>{row.section || '—'}</td><td>{row.itemCode || '—'}</td><td>{row.description || '—'}</td><td>{row.unit || '—'}</td><td>{row.quantity ?? '—'}</td><td>{row.unitCost ?? '—'}</td><td>{row.amount ?? '—'}</td></tr>)}</tbody></table></div>

          <div className={styles.actions}><button className={styles.secondary} disabled={busy} onClick={refreshPreview}>Refresh preview with mapping</button><button disabled={busy || !previewRows.length || !mappingReady || !!analysis.errors.length} onClick={() => analyze('save')}>{busy ? 'Saving…' : mappingReady ? 'Save analyzed benchmark' : 'Refresh preview before saving'}</button></div>

        </>}

      </section>}

      {review && <>

        {review.status === 'GENERATED' && <section className={styles.panel}><h2>Master materials generated</h2><p>{lines.some(line => line.resourceKind === 'MATERIAL') ? 'Approved material quantities are connected to their work packages and the existing procurement/inventory records.' : 'This approved benchmark contains no material rows. Its labor/equipment/other budget evidence is retained; no inventory rows were created.'}</p><div className={styles.actions}><Link href={`/projects/${projectId}?tab=consolidation`}>Open master materials →</Link><Link href={`/projects/${projectId}/work-packages?baseline=active`}>Open package material requirements →</Link></div></section>}

        <section className={styles.panel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>SOURCE RECORD</p><h2>{review.source.fileName}</h2><p>Revision {data.revision || '—'} · SHA-256 {review.source.fileHash}</p></div>{review.source.downloadUrl && <a className={styles.back} href={review.source.downloadUrl}>Download source</a>}</div>

          <div className={styles.metricGrid}><div><span>Benchmark line total</span><strong>{currency(totals.benchmark)}</strong></div><div><span>Material-only total for generated inventory</span><strong>{currency(totals.material)}</strong></div><div><span>Unmatched / additional rows</span><strong>{additional.length} rows</strong></div><div><span>BOQ contract baseline</span><strong>{currency(data.project.contractAmount)}</strong></div><div><span>Benchmark minus contract</span><strong className={contractDifference > 0 ? styles.negative : ''}>{currency(contractDifference)}</strong></div><div><span>Line amount minus quantity × rate</span><strong className={Math.abs(totals.rateVariance) > 0.01 ? styles.negative : ''}>{currency(totals.rateVariance)}</strong></div></div>

          <p className={styles.explain}>The approved benchmark records the spending and quantity limits. The locked BOQ remains the contract baseline. Differences are shown for review; no source amount is automatically recalculated.</p>
          {review.source.printedTotal!=null&&review.source.itemTotal!=null&&<p className={styles.finding}>Preserved source printed total: {currency(review.source.printedTotal)} · Imported item total: {currency(review.source.itemTotal)} · Difference: {currency(new Decimal(review.source.printedTotal).minus(review.source.itemTotal).toString())}.</p>}
          {!!review.source.readingNotes?.length&&<details className={styles.findings}><summary>Preserved source notes and non-priced decisions · {review.source.readingNotes.length}</summary>{review.source.readingNotes.map((note,index)=><p key={index}>Row {note.row} · {note.field}: {note.message}</p>)}</details>}

          {(unresolved.length > 0 || missingPackage.length > 0 || unclassified.length > 0 || rateMismatches.length > 0) && <p className={styles.finding}>Approval needs {unresolved.length} unresolved BOQ/additional classification(s), {missingPackage.length} missing package assignment(s), {unclassified.length} unclassified resource kind(s), and {rateMismatches.length} invalid quantity/rate/amount calculation(s). Correct the entered values; the system does not recalculate money.</p>}

          {hasUnsavedChanges && <p role="status" className={styles.explain}>Save your line edits before matching or approval. The approval always uses the saved revision.</p>}<div className={styles.actions}>{editable && <><button className={styles.secondary} disabled={busy || hasUnsavedChanges} onClick={suggestMatches}>Suggest BOQ matches</button><button disabled={busy} onClick={submitLines}>{busy ? 'Saving…' : 'Save line edits'}</button></>}{review.status === 'DRAFT' && data.canApprove && <button disabled={!approvalReady || busy} onClick={() => sendAction('approve')}>Approve benchmark</button>}{review.status === 'APPROVED' && (data.canEdit || data.canApprove) && <button disabled={busy} onClick={() => sendAction('generate')}>{busy ? 'Generating…' : lines.some(line => line.resourceKind === 'MATERIAL') ? 'Generate master materials output' : 'Complete benchmark · no material output'}</button>}</div>

          {review.status === 'APPROVED' && <p className={styles.explain}>Approval locks this benchmark version. Generated master-material output links to this approved revision; output limits and downstream material usage remain governed by their linked records and revision history.</p>}

          {rowPagination}<div className={styles.tableWrap}><table className={styles.reviewTable}><thead><tr><th>Source</th><th>Description</th><th>Unit</th><th>Quantity</th><th>Rate</th><th>Amount</th><th>Resource kind</th><th>BOQ item / additional scope</th><th>Package</th><th>Reason for additional row</th><th>Rate check</th></tr></thead><tbody>{lines.slice(currentRowPage * 25, (currentRowPage + 1) * 25).map(line=>{const rateAmount=amount(line.quantity)*amount(line.unitCost);const delta=amount(line.amount)-rateAmount;return <tr key={line.id}><td>{line.sourceRowNumber}<small>{line.section || line.itemCode}</small><details><summary>Original values</summary><p>{line.original.description}</p><small>{line.original.quantity} {line.original.unit} · rate {currency(line.original.unitCost)} · amount {currency(line.original.amount)}</small></details></td><td><input aria-label={`Description row ${line.sourceRowNumber}`} disabled={!editable} value={line.description} onChange={e=>updateLine(line.id,'description',e.target.value)}/></td><td><input aria-label={`Unit row ${line.sourceRowNumber}`} disabled={!editable} value={line.unit} onChange={e=>updateLine(line.id,'unit',e.target.value)}/></td><td><input aria-label={`Quantity row ${line.sourceRowNumber}`} disabled={!editable} inputMode="decimal" value={line.quantity} onChange={e=>updateLine(line.id,'quantity',e.target.value)}/></td><td><input aria-label={`Rate row ${line.sourceRowNumber}`} disabled={!editable} inputMode="decimal" value={line.unitCost} onChange={e=>updateLine(line.id,'unitCost',e.target.value)}/></td><td><input aria-label={`Amount row ${line.sourceRowNumber}`} disabled={!editable} inputMode="decimal" value={line.amount} onChange={e=>updateLine(line.id,'amount',e.target.value)}/></td><td><select aria-label={`Resource kind row ${line.sourceRowNumber}`} disabled={!editable} value={line.resourceKind} onChange={e=>updateLine(line.id,'resourceKind',e.target.value as ReviewLine['resourceKind'])}><option value="UNCLASSIFIED">Unclassified · select</option><option value="MATERIAL">Material</option><option value="LABOR">Labor</option><option value="EQUIPMENT">Equipment</option><option value="OTHER">Other</option></select></td><td><select aria-label={`BOQ mapping row ${line.sourceRowNumber}`} disabled={!editable} value={line.boqItemId || ''} onChange={e=>updateLine(line.id,'boqItemId',e.target.value || null)}><option value="">Additional / unmatched</option>{data.boqItems.map(item=><option key={item.id} value={item.id}>{item.itemCode} · {item.description} ({item.unit})</option>)}</select>{!line.boqItemId ? <small>Additional rows require a reason and approval acknowledgement.</small> : <small>Scope reference only. Material quantities stay in {line.unit}; no conversion to BOQ units is inferred.</small>}</td><td><select aria-label={`Package row ${line.sourceRowNumber}`} disabled={!editable} value={line.activityId || ''} onChange={e=>updateLine(line.id,'activityId',e.target.value || null)}><option value="">Select package…</option>{data.packages.map(pkg=><option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}</select></td><td><input aria-label={`Additional reason row ${line.sourceRowNumber}`} disabled={!editable || !!line.boqItemId} value={line.additionalReason} placeholder="Reason required for additional scope" onChange={e=>updateLine(line.id,'additionalReason',e.target.value)}/>{!line.boqItemId && <label className={styles.ack}><input type="checkbox" disabled={!data.canApprove || review.status !== 'DRAFT'} checked={acknowledged.includes(line.id)} onChange={e=>setAcknowledged(current=>e.target.checked?[...new Set([...current,line.id])]:current.filter(id=>id!==line.id))}/> Approver acknowledges additional row</label>}</td><td className={Math.abs(delta)>0.01?styles.negative:''}>{currency(delta)}<small>entered {currency(line.amount)} · qty × rate {currency(rateAmount)}</small></td></tr>})}</tbody></table></div>

          <details className={styles.matches}><summary>Suggested matches · review before approval</summary><p>Suggestions are unapproved. Confirm each BOQ item and package against the source and project scope before approving.</p></details>

        </section>

        <section className={styles.panel}><h2>Review history</h2>{review.history.length ? <ol className={styles.history}>{review.history.map((entry,index)=><li key={`${entry.at}-${index}`}><strong>{entry.action}</strong><span>{entry.actorName} · {new Date(entry.at).toLocaleString()}</span>{entry.reason && <p>{entry.reason}</p>}</li>)}</ol> : <p className={styles.muted}>No review actions recorded yet.</p>}</section>

      </>}

      <p className={styles.footer}>Linked master-material output retains its approved benchmark revision reference. Later benchmark revisions do not silently rewrite generated output or downstream records; review those links in their owning workflows.</p>

    </>}

  </section>;

}

