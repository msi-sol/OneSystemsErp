'use client';
import { useRef, useState } from 'react';
import type { WorkspaceAnalysis, WorkspaceItem, WorkspaceMapping } from '@/lib/boq/workspace-types';
import { RESOURCE_KINDS, type BreakdownKind, type PackageBreakdownUpload } from '@/lib/scheduling/package-breakdown';
import type { PlanResource } from '@/lib/scheduling/work-package-details-types';
import styles from '../planning/planning.module.css';

type Props = { projectId: string; scheduleId: string; activityId: string; packageName: string; rowVersion: number;
  uploads: PackageBreakdownUpload[]; existingResourceCount: number; existingResources?: PlanResource[]; canEdit: boolean; onSaved: () => void };
const fields = ['itemCode', 'description', 'unit', 'quantity', 'unitCost', 'amount'] as const;
const labels = ['Item code (optional)', 'Description', 'Unit', 'Quantity', 'Unit rate (optional)', 'Amount'];
const money = (value: number | string) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value));

export default function PackageBreakdownPanel(props: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<WorkspaceAnalysis | null>(null);
  const [rows, setRows] = useState<WorkspaceItem[]>([]);
  const [mapping, setMapping] = useState<WorkspaceMapping | null>(null);
  const [sheet, setSheet] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [categories, setCategories] = useState<Record<string, Record<string, BreakdownKind>>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [replacements, setReplacements] = useState<Record<string, string[]>>({});
  const [version, setVersion] = useState({ source: props.rowVersion, value: props.rowVersion });
  const currentVersion = version.source === props.rowVersion ? version.value : props.rowVersion;
  const endpoint = `/api/projects/${encodeURIComponent(props.projectId)}/work-packages/breakdown`;
  const current = analysis && analysis.selectedSheet === sheet && JSON.stringify(analysis.mapping) === JSON.stringify(mapping);

  async function submit(action: 'analyze' | 'preserve') {
    if (!file || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const body = new FormData(); body.set('file', file); body.set('action', action);
      body.set('scheduleId', props.scheduleId); body.set('activityId', props.activityId);
      body.set('expectedRowVersion', String(currentVersion));
      if (sheet) body.set('sheetName', sheet);
      if (mapping) body.set('mapping', JSON.stringify(mapping));
      if (analysis) body.set('fileHash', analysis.fileHash);
      if (analysis?.documentToken) body.set('documentToken', analysis.documentToken);
      const response = await fetch(endpoint, { method: 'POST', body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The breakdown could not be saved.');
      if (action === 'analyze') {
        setAnalysis(result.analysis); setRows(result.rows); setMapping(result.analysis.mapping || { headerRow: 1, itemCode: null, description: null, unit: null, quantity: null, unitCost: null, amount: null }); setSheet(result.analysis.selectedSheet || '');
        setMessage('Review the complete component rows below. Preserving this upload will not change package costs.');
      } else {
        setVersion({ source: props.rowVersion, value: result.rowVersion });
        setFile(null); setAnalysis(null); setRows([]); setMapping(null); setSheet('');
        if (fileInput.current) fileInput.current.value = '';
        setMessage('Breakdown preserved. Open the saved upload below to categorize and explicitly add its costs.'); props.onSaved();
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The breakdown could not be processed.'); }
    finally { setBusy(false); }
  }
  async function apply(upload: PackageBreakdownUpload) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(props.projectId)}/work-packages/details`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'apply-breakdown', scheduleId: props.scheduleId,
          expectedRowVersion: currentVersion, fields: { uploadId: upload.id, categories: categories[upload.id] || {}, reason: reasons[upload.id] || '', acknowledgeExisting: acknowledged[upload.id] === true, replaceResourceIds: replacements[upload.id] || [] } }),
      });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'The component costs could not be added.');
      setVersion({ source: props.rowVersion, value: result.rowVersion });
      setMessage('Component costs added as unreviewed draft resources. Review allowances in Resources & budgets, then complete Engineer review and PM approval.'); props.onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The costs could not be added.'); }
    finally { setBusy(false); }
  }
  function itemTable(items: WorkspaceItem[], upload?: PackageBreakdownUpload) {
    return <div className={styles.scroll} role="region" aria-label="Complete package breakdown rows" tabIndex={0}><table className={styles.table}>
      <thead><tr><th>Source row / section</th><th>Code / description</th><th>Quantity</th><th>Source rate</th><th>Amount</th>{upload && <th>Resource category</th>}</tr></thead>
      <tbody>{items.map(row => <tr key={row.sourceRowNumber}><td>{row.sourceRowNumber} · {row.section}</td><th scope="row">{row.itemCode}<br/>{row.description}</th><td>{row.quantity} {row.unit}{(row.quantityDefaulted || row.unitDefaulted) && <p>Quantity or unit needs correction before adding costs.</p>}</td><td>{row.sourceUnitCost === null ? 'Not stated' : money(row.sourceUnitCost)}</td><td>{money(row.amount)}</td>{upload && <td>{upload.appliedAt ? upload.categories[String(row.sourceRowNumber)] : <select aria-label={`Category for source row ${row.sourceRowNumber}`} disabled={busy || !props.canEdit} value={categories[upload.id]?.[row.sourceRowNumber] || ''} onChange={event => setCategories({ ...categories, [upload.id]: { ...categories[upload.id], [row.sourceRowNumber]: event.target.value as BreakdownKind } })}><option value="">Choose category</option>{RESOURCE_KINDS.map(kind => <option key={kind} value={kind}>{kind}</option>)}</select>}</td>}</tr>)}</tbody>
    </table></div>;
  }
  return <section className={styles.panel} id="package-breakdown"><h3>Package breakdown / DUPA</h3>
    <p className={styles.muted}>For {props.packageName}. Upload an existing package-level component breakdown independently of BOQ-generated suggestions. The original file and all extracted rows are retained.</p>
    <p className={styles.muted}>Upload Excel (.xlsx/.xls), CSV/TSV, PDF, Word (.docx), text (.txt), or a PNG/JPEG/WEBP scan. Unfamiliar documents and images may use the AI reading helper. Check every extracted value against the original before preserving it. Include description, unit, quantity and stated amount; a unit rate is optional. Quantities must already be for this package. No automatic scaling or inventory matching is performed.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status" className={styles.success}>{message}</p>}
    {props.canEdit && <><label htmlFor="package-breakdown-file">Choose package breakdown (supported formats · up to 10 MiB)</label><input ref={fileInput} id="package-breakdown-file" type="file" accept=".xlsx,.xls,.csv,.tsv,.pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" disabled={busy} onChange={event => { setFile(event.target.files?.[0] || null); setAnalysis(null); setRows([]); setMapping(null); setSheet(''); setError(''); setMessage(''); }}/>
      {analysis && <div className={styles.fields}><div><label htmlFor="breakdown-sheet">Worksheet</label><select id="breakdown-sheet" disabled={busy} value={sheet} onChange={event => { setSheet(event.target.value); setMapping(null); }}><option value="">Choose worksheet</option>{analysis.sheets.map(value => <option key={value.name}>{value.name}</option>)}</select></div>
        {mapping && <><div><label htmlFor="breakdown-header">Header row</label><input id="breakdown-header" type="number" min="1" max="1000" value={mapping.headerRow} disabled={busy} onChange={event => setMapping({ ...mapping, headerRow: Number(event.target.value) })}/></div>{fields.map((field, index) => <div key={field}><label htmlFor={`breakdown-${field}`}>{labels[index]}</label><select id={`breakdown-${field}`} disabled={busy} value={mapping[field] ?? ''} onChange={event => setMapping({ ...mapping, [field]: event.target.value ? Number(event.target.value) : null })}><option value="">Not mapped</option>{analysis.columns.map(column => <option key={column.index} value={column.index}>{column.index} · {column.label}</option>)}</select></div>)}</>}
      </div>}
      <div className={styles.actions} style={{ marginTop: 16 }}><button className={styles.secondary} disabled={busy || !file} onClick={() => void submit('analyze')}>{busy ? 'Processing…' : analysis ? 'Re-analyze selection' : 'Analyze package breakdown'}</button>{analysis && <button className={styles.button} disabled={busy || !current || !!analysis.errors.length || !rows.length} onClick={() => void submit('preserve')}>Preserve reviewed breakdown</button>}</div>
      {analysis && <><p>{rows.length} component rows · {money(analysis.total)} · entire selected worksheet</p>{analysis.errors.map((issue, index) => <p className={styles.error} key={index}>Row {issue.row}: {issue.message}</p>)}{analysis.warnings.map((issue, index) => <p className={styles.muted} key={index}>Row {issue.row}: {issue.message}</p>)}{itemTable(rows)}</>}
    </>}
    <h4 style={{ marginTop: 24 }}>Preserved package uploads</h4>{!props.uploads.length && <p className={styles.muted}>No breakdown uploaded for this package yet.</p>}
    {props.uploads.map(upload => <details key={upload.id} className={styles.history}><summary>{upload.fileName} · {upload.sheetName} · {upload.rows.length} rows · {upload.appliedAt ? 'Added to draft resources' : 'Evidence only'}</summary>
      <p className={styles.muted}>Preserved {new Date(upload.uploadedAt).toLocaleString('en-PH')}. Source quantities and financial values remain available below.</p>
      <a className={styles.link} href={`${endpoint}?scheduleId=${encodeURIComponent(props.scheduleId)}&uploadId=${encodeURIComponent(upload.id)}`}>Download preserved original</a>
      {itemTable(upload.rows, upload)}
      {!!upload.replacedResources?.length && <details><summary>{upload.replacedResources.length} replaced draft rows (retained history)</summary><ul>{upload.replacedResources.map(row => <li key={row.id}>{row.kind} · {row.description} · {row.quantity} {row.unit} · {money(row.amount)}</li>)}</ul></details>}{upload.appliedAt ? <p>Applied {new Date(upload.appliedAt).toLocaleString('en-PH')} · {upload.reason}. Imported resources retain this upload and source-row reference; later resource edits do not change the original.</p> : props.canEdit && <>
        <p className={styles.muted}>Choose any existing draft allowance rows that this DUPA replaces. Unselected rows remain. Replaced values and your reason are retained in the upload history. BOQ scope and approved baselines stay unchanged; new costs require review.</p>
        {!!props.existingResources?.length && <fieldset><legend>Draft rows to replace (optional)</legend>{props.existingResources.map(resource => <label key={resource.id} style={{display:'block',marginBottom:8}}><input type="checkbox" disabled={busy} checked={(replacements[upload.id] || []).includes(resource.id)} onChange={event => setReplacements(current => ({...current,[upload.id]: event.target.checked ? [...current[upload.id] || [],resource.id] : (current[upload.id] || []).filter(id => id !== resource.id)}))}/>{resource.kind} · {resource.description} · {resource.quantity} {resource.unit} · {money(resource.amount)}</label>)}</fieldset>}
        <label htmlFor={`breakdown-reason-${upload.id}`}>Reason / relationship to generated or existing package costs</label><textarea id={`breakdown-reason-${upload.id}`} maxLength={500} value={reasons[upload.id] || ''} disabled={busy} onChange={event => setReasons({ ...reasons, [upload.id]: event.target.value })}/>
        {props.existingResourceCount > 0 && <label><input type="checkbox" checked={acknowledged[upload.id] || false} disabled={busy} onChange={event => setAcknowledged({ ...acknowledged, [upload.id]: event.target.checked })}/> I reviewed the {props.existingResourceCount} existing resource rows. I checked the selected replacements and the additional costs that will remain.</label>}
        <button className={styles.button} disabled={busy || upload.rows.some(row => !categories[upload.id]?.[row.sourceRowNumber]) || (reasons[upload.id]?.trim().length || 0) < 5 || (props.existingResourceCount > 0 && !acknowledged[upload.id])} onClick={() => void apply(upload)}>Add reviewed component rows to draft resources</button>
      </>}
    </details>)}
  </section>;
}
