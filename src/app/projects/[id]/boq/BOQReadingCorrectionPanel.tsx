'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkspaceAnalysis, WorkspaceMapping } from '@/lib/boq/workspace-types';
import styles from '../planning/planning.module.css';

type PreviewRow = { sourceRowNumber: number; itemId: string | null; kind: 'MATCHED' | 'CHANGED' | 'ADDED'; changes: Array<{ field: string; currentValue: string; correctedValue: string }>; conflicts: Array<{ field: string; currentValue: string; correctedValue: string }> };
type Preview = { analysis: WorkspaceAnalysis; preview: PreviewRow[]; missingRows: Array<{ itemId: string; sourceRowNumber: number; itemCode: string; description: string }>; canApply: boolean; applyBlockedReason: string | null; expectedPreviewHash: string };
const fields: Array<keyof Omit<WorkspaceMapping, 'headerRow'>> = ['itemCode', 'description', 'unit', 'quantity', 'unitCost', 'amount'];
const labels: Record<typeof fields[number], string> = { itemCode: 'Item code', description: 'Description', unit: 'Unit', quantity: 'Quantity', unitCost: 'Unit rate', amount: 'Amount' };
function columnLetter(index: number): string {
  let letter = '';
  while (index > 0) { index -= 1; letter = String.fromCharCode(65 + index % 26) + letter; index = Math.floor(index / 26); }
  return letter;
}

export default function BOQReadingCorrectionPanel({ projectId, versionId, rowVersion, checksum, initialSheet, initialMapping, initialBreakdownMapping, canEdit }: {
  projectId: string; versionId: string; rowVersion: number; checksum: string; initialSheet: string; initialMapping: Record<string, number | null>; initialBreakdownMapping: Record<string, number | null>; canEdit: boolean;
}) {
  const router = useRouter();
  const [selectedSheet, setSelectedSheet] = useState(initialSheet);
  const [mapping, setMapping] = useState<WorkspaceMapping>({ headerRow: Number(initialMapping.headerRow) || 1, itemCode: initialMapping.itemCode ?? null, description: initialMapping.description ?? null, unit: initialMapping.unit ?? null, quantity: initialMapping.quantity ?? null, unitCost: initialMapping.unitCost ?? null, amount: initialMapping.amount ?? null });
  const [breakdownMapping, setBreakdownMapping] = useState<Record<string, number | null>>(initialBreakdownMapping);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, { decision: 'KEEP_CURRENT' | 'USE_READING' | ''; reason: string }>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const pending = busy || refreshing;
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function send(action: 'preview' | 'apply') {
    if (pending) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/boq-review/reading`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, versionId, expectedChecksum: checksum, expectedRowVersion: rowVersion, selectedSheet, mapping, breakdownMapping,
          ...(action === 'apply' ? { expectedPreviewHash: preview?.expectedPreviewHash, reason, conflictDecisions: decisions } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'The corrected reading could not be processed.');
      if (action === 'preview') {
        setPreview(body as Preview); setMapping((body as Preview).analysis.mapping ?? mapping); setBreakdownMapping((body as Preview).analysis.breakdownMapping ?? {}); setDecisions({});
      } else {
        setMessage('Corrected reading applied. The first reading remains in history.'); setPreview(null); setReason(''); startRefresh(() => router.refresh());
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The corrected reading could not be processed.'); }
    finally { setBusy(false); }
  }
  const conflicts = preview?.preview.flatMap(row => row.conflicts.map(conflict => ({ itemId: row.itemId!, sourceRowNumber: row.sourceRowNumber, ...conflict }))) ?? [];
  const decisionsReady = conflicts.every(conflict => {
    const decision = decisions[`${conflict.itemId}:${conflict.field}`];
    return decision && ['KEEP_CURRENT', 'USE_READING'].includes(decision.decision) && decision.reason.trim().length >= 5;
  });
  return <section className={styles.panel} aria-labelledby="boq-reading-correction-heading">
    <h3 id="boq-reading-correction-heading">Correct the workbook reading</h3>
    <p className={styles.muted}>Re-read the preserved workbook under a corrected sheet or column mapping. The first reading stays unchanged. Preview changes before applying; prior human corrections require an explicit choice.</p>
    {error && <div className={styles.error} role="alert"><p>{error}</p>{/changed|refresh|preview.*again|concurrent/i.test(error) && <><p>Refresh the current BOQ, preview the reading again, then make fresh conflict decisions. No earlier correction is overwritten by this error.</p><button type="button" className={styles.secondary} disabled={pending} onClick={() => { setPreview(null); setDecisions({}); setError(''); startRefresh(() => router.refresh()); }}>Refresh current BOQ for a new preview</button></>}</div>}{message && <p className={styles.success} role="status">{message}</p>}
    <div className={styles.fields}>
      <label htmlFor="reading-sheet">Workbook sheet</label>
      <select id="reading-sheet" value={selectedSheet} disabled={pending} onChange={event => { setSelectedSheet(event.target.value); setPreview(null); }}>
        {preview?.analysis.sheets.map(sheet => <option key={sheet.name} value={sheet.name}>{sheet.name} · {sheet.rowCount} rows</option>)}
        {!preview && <option value={initialSheet}>{initialSheet}</option>}
      </select>
      <div><label htmlFor="reading-header-row">Header row</label><input id="reading-header-row" type="number" min={1} max={1000} value={mapping.headerRow} disabled={pending} onChange={event => { setMapping({ ...mapping, headerRow: Number(event.target.value) }); setPreview(null); }}/></div>
      <p className={styles.muted}>Preview the saved mapping first to load worksheet and column choices. The original workbook stays unchanged.</p>
      {fields.map(field => <div key={field}><label htmlFor={`reading-${field}`}>{labels[field]}</label><select id={`reading-${field}`} value={mapping[field] ?? ''} disabled={pending} onChange={event => { setMapping({ ...mapping, [field]: event.target.value ? Number(event.target.value) : null }); setPreview(null); }}>
        <option value="">Not mapped</option>{!preview && mapping[field] !== null && <option value={mapping[field]!}>Column {columnLetter(mapping[field]!)} · saved mapping</option>}{preview?.analysis.columns.map(column => <option key={column.index} value={column.index}>{columnLetter(column.index)} — {column.label}</option>)}
      </select></div>)}
    </div>
    <button type="button" className={styles.secondary} disabled={pending || !canEdit} onClick={() => void send('preview')}>{pending ? 'Reading…' : 'Preview corrected reading'}</button>
    {preview && <>
      <p className={styles.muted}>{preview.analysis.itemCount} rows · {preview.preview.filter(row => row.kind === 'CHANGED').length} changed · {preview.missingRows.length} no longer identified · {conflicts.length} prior corrections conflict</p>
      {preview.analysis.errors.length > 0 && <ul>{preview.analysis.errors.map((issue, index) => <li key={`${issue.row}:${issue.field}:${index}`}>{issue.row} · {issue.field}: {issue.message}</li>)}</ul>}
      <div className={styles.scroll} role="region" aria-label="Corrected reading impact" tabIndex={0}><table className={styles.table}><thead><tr><th>Source row</th><th>BOQ item</th><th>Field changes</th><th>Prior correction decisions</th></tr></thead><tbody>{preview.preview.map(row => <tr key={row.sourceRowNumber}><th scope="row">{row.sourceRowNumber}</th><td>{row.itemId || 'New source row'}</td><td>{row.changes.map(change => <div key={change.field}><strong>{change.field}</strong>: {change.currentValue} → {change.correctedValue}</div>)}</td><td>{row.conflicts.map(conflict => {
        const key = `${row.itemId}:${conflict.field}`; const value = decisions[key];
        return <div key={key}><strong>{conflict.field}</strong><p>Current correction: {conflict.currentValue} · corrected reading: {conflict.correctedValue}</p><select aria-label={`Decision for row ${row.sourceRowNumber} ${conflict.field}`} value={value?.decision ?? ''} onChange={event => setDecisions({ ...decisions, [key]: { decision: event.target.value as 'KEEP_CURRENT' | 'USE_READING', reason: value?.reason ?? '' } })}><option value="">Choose</option><option value="KEEP_CURRENT">Keep current correction</option><option value="USE_READING">Use corrected reading</option></select><input aria-label={`Reason for row ${row.sourceRowNumber} ${conflict.field}`} maxLength={300} minLength={5} placeholder="Decision reason" value={value?.reason ?? ''} onChange={event => setDecisions({ ...decisions, [key]: { decision: value?.decision ?? '', reason: event.target.value } })}/></div>;
      })}</td></tr>)}</tbody></table></div>
      {preview.missingRows.length > 0 && <p className={styles.warning}>Lines no longer read as BOQ rows will remain unchanged and receive blocking review findings.</p>}
      {preview.applyBlockedReason && <p className={styles.error}>{preview.applyBlockedReason}</p>}
      <label htmlFor="reading-apply-reason">Reason for applying this reading</label><input id="reading-apply-reason" maxLength={300} minLength={5} value={reason} onChange={event => setReason(event.target.value)} />
      <button type="button" className={styles.button} disabled={pending || !canEdit || !preview.canApply || !decisionsReady || reason.trim().length < 5 || preview.analysis.errors.length > 0} onClick={() => void send('apply')}>Apply corrected reading to this BOQ version</button>
    </>}
  </section>;
}
