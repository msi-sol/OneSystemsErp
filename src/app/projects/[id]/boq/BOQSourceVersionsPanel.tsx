'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BOQReviewDocument } from '@/lib/boq/review-state';
import { WORKSPACE_BREAKDOWN_FIELDS, type WorkspaceBreakdownMapping, type WorkspaceAnalysis, type WorkspaceMapping } from '@/lib/boq/workspace-types';
import styles from '../planning/planning.module.css';

const fields: Array<keyof Omit<WorkspaceMapping, 'headerRow'>> = ['itemCode', 'description', 'unit', 'quantity', 'unitCost', 'amount'];
const fieldLabel: Record<typeof fields[number], string> = { itemCode: 'Item code', description: 'Description', unit: 'Unit', quantity: 'Quantity', unitCost: 'Unit rate', amount: 'Amount' };

export default function BOQSourceVersionsPanel({ projectId, versionId, rowVersion, document, canEdit }: { projectId: string; versionId: string; rowVersion: number; document: BOQReviewDocument; canEdit: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<WorkspaceAnalysis | null>(null);
  const [mapping, setMapping] = useState<WorkspaceMapping | null>(null);
  const [breakdown, setBreakdown] = useState<WorkspaceBreakdownMapping>({});
  const [sheetName, setSheetName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function analyze(nextSheet?: string, nextMapping?: WorkspaceMapping | null) {
    if (!file) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const form = new FormData(); form.set('file', file); form.set('projectId', projectId); if (nextSheet) form.set('sheetName', nextSheet);
      if (nextMapping) { form.set('mapping', JSON.stringify(nextMapping)); form.set('breakdownMapping', JSON.stringify(breakdown)); }
      const response = await fetch('/api/boq-workspace/analyze', { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'The corrected workbook could not be analyzed.');
      setBreakdown(body.analysis.breakdownMapping ?? {}); setAnalysis(body.analysis as WorkspaceAnalysis); setMapping(body.analysis.mapping); setSheetName(body.analysis.selectedSheet || '');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The corrected workbook could not be analyzed.'); }
    finally { setBusy(false); }
  }
  const mappingChanged = JSON.stringify(mapping) !== JSON.stringify(analysis?.mapping) || JSON.stringify(breakdown) !== JSON.stringify(analysis?.breakdownMapping);

  async function stage() {
    if (!file || !analysis || !mapping) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const form = new FormData(); form.set('file', file); form.set('versionId', versionId); form.set('expectedRowVersion', String(rowVersion));
      form.set('fileHash', analysis.fileHash); form.set('sheetName', sheetName); form.set('mapping', JSON.stringify(mapping));
      form.set('breakdownMapping', JSON.stringify(breakdown));
      const response = await fetch(`/api/projects/${projectId}/boq-review/source`, { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'The corrected source could not be staged.');
      setMessage('Corrected source staged. Review changed, new and removed rows before adoption.'); setFile(null); setAnalysis(null); setMapping(null); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The corrected source could not be staged.'); }
    finally { setBusy(false); }
  }

  async function decide(sourceVersionId: string, identityKey: string, decision: 'SAME_ITEM' | 'NEW_ITEM' | 'SET_ASIDE') {
    const reason = window.prompt('Record why this row identity decision is correct.');
    if (!reason || reason.trim().length < 5) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/boq-review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'identity-decision', versionId, expectedRowVersion: rowVersion, sourceVersionId, identityKey, decision, reason }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'The row decision could not be saved.'); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The row decision could not be saved.'); }
    finally { setBusy(false); }
  }

  async function sourceAction(sourceVersionId: string, identityKey: string, reject: boolean) {
    const reason = window.prompt(reject ? 'Why are you rejecting this source assessment?' : 'Why should this prior review and these corrections carry forward?');
    if (!reason || reason.trim().length < 5) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/boq-review/source`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: reject ? 'reject-source' : 'accept-carry-forward', versionId, expectedRowVersion: rowVersion, sourceVersionId, identityKey, reason }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'The source assessment could not be saved.');
      setMessage(reject ? 'Source assessment rejected; its evidence remains on record.' : 'Prior review and corrections explicitly accepted.'); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The source assessment could not be saved.'); }
    finally { setBusy(false); }
  }

  async function adopt(sourceVersionId: string) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/boq-review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'adopt-source', versionId, expectedRowVersion: rowVersion, sourceVersionId }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'The corrected source could not be adopted.');
      setMessage('Corrected source adopted as a new draft BOQ version.'); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The corrected source could not be adopted.'); }
    finally { setBusy(false); }
  }

  return <section className={styles.panel} aria-labelledby="boq-source-versions-heading">
    <h3 id="boq-source-versions-heading">Workbook source versions</h3>
    <p className={styles.muted}>Stage a corrected workbook without replacing the current BOQ. Compare rows, make identity decisions, and adopt it as a new editable draft version.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status" className={styles.success}>{message}</p>}
    {canEdit && <div className={styles.fields}><label htmlFor="corrected-boq-file">Corrected workbook</label><input id="corrected-boq-file" type="file" accept=".xlsx" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setAnalysis(null); setMapping(null); }}/><button className={styles.secondary} disabled={busy || !file} onClick={() => void analyze()}>{busy ? 'Analyzing…' : 'Analyze corrected workbook'}</button></div>}
    {analysis && mapping && <div className={styles.panel}><div className={styles.fields}><label htmlFor="corrected-sheet">Workbook sheet</label><select id="corrected-sheet" value={sheetName} disabled={busy} onChange={event => { setSheetName(event.target.value); void analyze(event.target.value); }}>{analysis.sheets.map(sheet => <option key={sheet.name} value={sheet.name}>{sheet.name} · {sheet.rowCount} rows</option>)}</select><label htmlFor="corrected-header">Header row</label><input id="corrected-header" type="number" min={1} value={mapping.headerRow} onChange={event => setMapping({ ...mapping, headerRow: Number(event.target.value) })} /><label>Column mapping</label>{fields.map(field => <div key={field}><label htmlFor={`corrected-${field}`}>{fieldLabel[field]}</label><select id={`corrected-${field}`} value={mapping[field] ?? ''} onChange={event => setMapping({ ...mapping, [field]: event.target.value ? Number(event.target.value) : null })}><option value="">Not mapped</option>{analysis.columns.map(column => <option key={column.index} value={column.index}>{column.label}</option>)}</select></div>)}{WORKSPACE_BREAKDOWN_FIELDS.map(field => <div key={field}><label htmlFor={`corrected-breakdown-${field}`}>{field}</label><select id={`corrected-breakdown-${field}`} value={breakdown[field] ?? ""} onChange={event => setBreakdown({ ...breakdown, [field]: event.target.value ? Number(event.target.value) : null })}><option value="">Not mapped</option>{analysis.columns.map(column => <option key={column.index} value={column.index}>{column.label}</option>)}</select></div>)}</div><button type="button" className={styles.secondary} disabled={busy || fields.some(field => mapping[field] == null && ['description','amount'].includes(field))} onClick={() => void analyze(sheetName, mapping)}>Update preview with mapping</button><p className={styles.muted}>{analysis.itemCount} lines · {analysis.total} · {analysis.errors.length} blocking workbook errors · {analysis.warnings.length} review notes</p>{analysis.preview.length > 0 && <div className={styles.scroll} role="region" aria-label="Corrected BOQ source preview" tabIndex={0}><table className={styles.table}><thead><tr><th>Row / code</th><th>Section</th><th>Description</th><th>Unit</th><th>Quantity</th><th>Rate</th><th>Amount</th></tr></thead><tbody>{analysis.preview.map(item => <tr key={item.sourceRowNumber}><th scope="row">{item.sourceRowNumber} · {item.itemCode || 'No code'}</th><td>{item.section}</td><td>{item.description}</td><td>{item.unit}</td><td>{item.quantity}</td><td>{item.unitCost}</td><td>{item.amount}</td></tr>)}</tbody></table></div>}<button className={styles.button} disabled={busy || mappingChanged || analysis.errors.length > 0 || !analysis.itemCount || !sheetName || fields.some(field => mapping?.[field] == null && ['description','amount'].includes(field))} onClick={() => void stage()}>Stage and compare source</button></div>}
    {document.correctedSources.map(source => {
      const pending = !['ADOPTED', 'REJECTED'].includes(source.status);
      return <details key={source.versionId} className={styles.history}>
        <summary>{source.fileName} · {source.status} · {source.assessment.length} compared rows</summary>
        <p className={styles.muted}>Sheet {source.selectedSheet} · {source.fileHash}</p>
        <a href={`/api/boq-workspace/uploads/${source.uploadId}/original`}>Download this preserved source</a>
        <div className={styles.scroll} role="region" aria-label="Corrected source row assessment" tabIndex={0}>
          <table className={styles.table}><thead><tr><th>Previous item</th><th>Corrected row</th><th>Assessment</th><th>Identity</th><th>Prior review and corrections</th></tr></thead>
            <tbody>{source.assessment.map(row => {
              const key = `${row.oldRow ?? 'new'}:${row.newRow ?? 'removed'}`;
              const decision = source.identityDecisions[key];
              const plan = source.carryPlans?.[key];
              const accepted = source.carryAcceptance?.[key]?.accepted;
              const corrected = source.rows.find(candidate => candidate.sourceRowNumber === row.newRow);
              const originalsByCode = document.source.originalRows.filter(candidate => candidate.itemCode === row.oldItemCode);
              const original = document.source.originalRows.find(candidate => candidate.itemId && candidate.itemId === row.oldItemId)
                ?? (originalsByCode.length === 1 ? originalsByCode[0] : undefined);
              return <tr key={key}>
                <td>{row.oldItemCode || 'No code'} · previous item {row.oldRow ?? '—'}{original && <><br />{original.description}<br />{original.quantity} {original.unit} · rate {original.unitCost} · amount {original.amount}</>}</td>
                <td>{row.newItemCode || 'No code'} · source row {row.newRow ?? '—'}{corrected && <><br />{corrected.description}<br />{corrected.quantity} {corrected.unit} · rate {corrected.unitCost} · amount {corrected.amount}</>}</td>
                <td>{row.kind.replaceAll('_', ' ')}</td>
                <td>{decision ? `${decision.decision.replaceAll('_', ' ')} · ${decision.reason}` : 'Decision required'}
                  {canEdit && pending && (!decision || row.kind === 'POSSIBLE_MATCH') && <div className={styles.actions}>
                    {row.oldRow !== null && row.newRow !== null && <button className={styles.secondary} disabled={busy} onClick={() => void decide(source.versionId, key, 'SAME_ITEM')}>Same item</button>}
                    {row.newRow !== null && <button className={styles.secondary} disabled={busy} onClick={() => void decide(source.versionId, key, 'NEW_ITEM')}>Different / new item</button>}
                    <button className={styles.secondary} disabled={busy} onClick={() => void decide(source.versionId, key, 'SET_ASIDE')}>Set aside source row</button>
                  </div>}
                </td>
                <td>{plan?.conflicts.length ? <p>Prior corrections conflict with this source: {plan.conflicts.join(', ')}. Review these values afresh; no correction is carried automatically.</p> : null}
                  {plan?.available && <><ul>{Object.entries(plan.applyFields).map(([field, value]) => <li key={field}>Carry {field}: {value}</li>)}{plan.decisions.map(finding => <li key={finding.id}>{finding.status}: {finding.message}{finding.reason ? ` · ${finding.reason}` : ''}</li>)}</ul>
                    {accepted ? <p>Prior review explicitly accepted for carry-forward.</p> : canEdit && pending && decision?.decision === 'SAME_ITEM' && !plan.conflicts.length && <button className={styles.secondary} disabled={busy} onClick={() => void sourceAction(source.versionId, key, false)}>Accept prior review and corrections</button>}
                  </>}
                  {!plan?.available && !plan?.conflicts.length && <p>No prior decision or correction is offered.</p>}
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {canEdit && pending && <div className={styles.actions}><button className={styles.button} disabled={busy || source.status !== 'READY_TO_ADOPT'} onClick={() => void adopt(source.versionId)}>Adopt as new BOQ draft</button><button className={styles.secondary} disabled={busy} onClick={() => void sourceAction(source.versionId, '', true)}>Reject this assessment</button></div>}
      </details>;
    })}
  </section>;
}
