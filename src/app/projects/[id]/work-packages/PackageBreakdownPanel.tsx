'use client';
import { useRef, useState } from 'react';
import type { WorkspaceAnalysis, WorkspaceItem, WorkspaceMapping } from '@/lib/boq/workspace-types';
import { RESOURCE_KINDS, type BreakdownKind, type PackageBreakdownUpload } from '@/lib/scheduling/package-breakdown';
import type { PlanResource } from '@/lib/scheduling/work-package-details-types';
import styles from '../planning/planning.module.css';
import DupaAiCheck, { type DupaChoice } from './DupaAiCheck';
import UploadDropzone from '@/components/ui/UploadDropzone';
import { Download } from 'lucide-react';
import choice from './locations-step.module.css';

type Props = { projectId: string; scheduleId: string; activityId: string; packageName: string; rowVersion: number;
  uploads: PackageBreakdownUpload[]; existingResourceCount: number; existingResources?: PlanResource[]; canEdit: boolean; onSaved: () => void;
  /** The package's allocated BOQ value, to show how an uploaded DUPA reconciles with it. */
  packageAmount?: number };
const fields = ['itemCode', 'description', 'unit', 'quantity', 'unitCost', 'amount'] as const;
const labels = ['Item code (optional)', 'Description', 'Unit', 'Quantity', 'Unit rate (optional)', 'Amount'];
const money = (value: number | string) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value));
/** A DUPA usually groups rows under Materials / Labor / Equipment headings; start each row in that category (still editable). */
function suggestedKind(section: string | null | undefined): BreakdownKind | undefined {
  const text = (section || '').toLowerCase();
  const kind = /material/.test(text) ? 'MATERIAL' : /labou?r|manpower|crew/.test(text) ? 'LABOR' : /equipment|tool/.test(text) ? 'EQUIPMENT' : undefined;
  return kind && (RESOURCE_KINDS as readonly string[]).includes(kind) ? kind as BreakdownKind : undefined;
}

export default function PackageBreakdownPanel(props: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  // The uploaded DUPA shown below the table; a single upload opens by default.
  const [openId, setOpenId] = useState(props.uploads.length === 1 ? props.uploads[0].id : '');
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
  /**
   * How to use each uploaded DUPA (minutes 2026-11-09: the user picks the DUPA or the generated allowances):
   * 'dupa' replaces every generated/draft line of the package, 'generated' keeps them (the DUPA stays as a reference
   * file), 'advanced' picks individual lines to replace as before.
   */
  const [modes, setModes] = useState<Record<string, 'dupa' | 'generated' | 'advanced'>>({});
  // Rows left out of the package when the DUPA is applied (saved from the DUPA AI Check, or toggled in the table).
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const isExcluded = (upload: PackageBreakdownUpload, row: string) => (excluded[upload.id] || []).includes(row);
  const keptRows = (upload: PackageBreakdownUpload) => upload.rows.filter(row => !isExcluded(upload, String(row.sourceRowNumber)));
  function saveAiChoices(upload: PackageBreakdownUpload, choices: DupaChoice[]) {
    const nextCategories = { ...categories[upload.id] };
    const nextExcluded = new Set(excluded[upload.id] || []);
    for (const choice of choices) {
      if (choice.kind === 'category') nextCategories[Number(choice.row)] = choice.proposed as BreakdownKind;
      else if (choice.proposed === 'Leave out') nextExcluded.add(choice.row);
      else nextExcluded.delete(choice.row);
    }
    setCategories({ ...categories, [upload.id]: nextCategories });
    setExcluded({ ...excluded, [upload.id]: [...nextExcluded] });
    setMessage(`Saved ${choices.length} suggestion${choices.length === 1 ? '' : 's'}. Check the rows below, then choose how to use this DUPA.`);
  }
  const replaceIdsFor = (upload: PackageBreakdownUpload) => modes[upload.id] === 'dupa' ? (props.existingResources ?? []).map(resource => resource.id) : replacements[upload.id] || [];
  const [version, setVersion] = useState({ source: props.rowVersion, value: props.rowVersion });
  const currentVersion = version.source === props.rowVersion ? version.value : props.rowVersion;
  // The user's choice wins; otherwise the category suggested by the row's DUPA section heading.
  const chosenCategories = (upload: PackageBreakdownUpload) => Object.fromEntries(upload.rows.filter(row => !(excluded[upload.id] || []).includes(String(row.sourceRowNumber))).flatMap(row => {
    const kind = categories[upload.id]?.[row.sourceRowNumber] ?? suggestedKind(row.section);
    return kind ? [[String(row.sourceRowNumber), kind]] : [];
  })) as Record<string, BreakdownKind>;
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
          expectedRowVersion: currentVersion, fields: { uploadId: upload.id, categories: chosenCategories(upload), reason: reasons[upload.id] || (modes[upload.id] === 'dupa' ? 'Using the uploaded DUPA instead of the generated allowances.' : ''), acknowledgeExisting: modes[upload.id] === 'dupa' || acknowledged[upload.id] === true, replaceResourceIds: replaceIdsFor(upload), excludeRows: excluded[upload.id] || [] } }),
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
      <tbody>{items.map(row => <tr key={row.sourceRowNumber} style={upload && !upload.appliedAt && isExcluded(upload, String(row.sourceRowNumber)) ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}><td>{row.sourceRowNumber} · {row.section}</td><th scope="row">{row.itemCode}<br/>{row.description}</th><td>{row.quantity} {row.unit}{(row.quantityDefaulted || row.unitDefaulted) && <p>Quantity or unit needs correction before adding costs.</p>}</td><td>{row.sourceUnitCost === null ? 'Not stated' : money(row.sourceUnitCost)}</td><td>{money(row.amount)}</td>{upload && <td>{upload.appliedAt ? (upload.excludedRows?.includes(String(row.sourceRowNumber)) ? 'Left out' : upload.categories[String(row.sourceRowNumber)]) : isExcluded(upload, String(row.sourceRowNumber)) ? <button type="button" className={styles.secondary} style={{ textDecoration: 'none' }} onClick={() => setExcluded({ ...excluded, [upload.id]: (excluded[upload.id] || []).filter(value => value !== String(row.sourceRowNumber)) })}>Left out · keep it</button> : <select aria-label={`Category for source row ${row.sourceRowNumber}`} disabled={busy || !props.canEdit} value={chosenCategories(upload)[String(row.sourceRowNumber)] || ''} onChange={event => setCategories({ ...categories, [upload.id]: { ...categories[upload.id], [row.sourceRowNumber]: event.target.value as BreakdownKind } })}><option value="">Choose category</option>{RESOURCE_KINDS.map(kind => <option key={kind} value={kind}>{kind}</option>)}</select>}</td>}</tr>)}</tbody>
    </table></div>;
  }
  const totalOf = (upload: PackageBreakdownUpload) => upload.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const opened = props.uploads.find(upload => upload.id === openId) ?? null;
  return <section className={styles.panel} id="package-breakdown"><h3>DUPA</h3>
    {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status" className={styles.success}>{message}</p>}
    {props.canEdit && <>
      {/* Same upload as the BOQ Workspace: choose or drop the file, then analyze it. */}
      <UploadDropzone prompt="Drop this package's DUPA here" hint="Excel, CSV, PDF, Word, text or an image · up to 10 MB" accept=".xlsx,.xls,.csv,.tsv,.pdf,.docx,.txt,.png,.jpg,.jpeg,.webp"
        inputLabel="Choose the DUPA file" files={file ? [file] : []} disabled={busy} status={analysis ? 'analyzed' : 'ready to analyze'}
        onFiles={files => { setFile(files[0] ?? null); setAnalysis(null); setRows([]); setMapping(null); setSheet(''); setError(''); setMessage(''); }}
        action={<><button className={styles.secondary} disabled={busy || !file} onClick={() => void submit('analyze')}>{busy ? 'Processing…' : analysis ? 'Re-analyze' : 'Analyze DUPA'}</button>{analysis && <button className={styles.button} disabled={busy || !current || !!analysis.errors.length || !rows.length} onClick={() => void submit('preserve')}>Save DUPA</button>}</>} />
      {analysis && <div className={styles.fields}><div><label htmlFor="breakdown-sheet">Worksheet</label><select id="breakdown-sheet" disabled={busy} value={sheet} onChange={event => { setSheet(event.target.value); setMapping(null); }}><option value="">Choose worksheet</option>{analysis.sheets.map(value => <option key={value.name}>{value.name}</option>)}</select></div>
        {mapping && <><div><label htmlFor="breakdown-header">Header row</label><input id="breakdown-header" type="number" min="1" max="1000" value={mapping.headerRow} disabled={busy} onChange={event => setMapping({ ...mapping, headerRow: Number(event.target.value) })}/></div>{fields.map((field, index) => <div key={field}><label htmlFor={`breakdown-${field}`}>{labels[index]}</label><select id={`breakdown-${field}`} disabled={busy} value={mapping[field] ?? ''} onChange={event => setMapping({ ...mapping, [field]: event.target.value ? Number(event.target.value) : null })}><option value="">Not mapped</option>{analysis.columns.map(column => <option key={column.index} value={column.index}>{column.index} · {column.label}</option>)}</select></div>)}</>}
      </div>}
      {analysis && <><p>{rows.length} component rows · {money(analysis.total)}</p>{analysis.errors.map((issue, index) => <p className={styles.error} key={index}>Row {issue.row}: {issue.message}</p>)}{analysis.warnings.map((issue, index) => <p className={styles.muted} key={index}>Row {issue.row}: {issue.message}</p>)}{itemTable(rows)}</>}
    </>}
    <h4 style={{ marginTop: 24 }}>Uploaded DUPAs</h4>
    {!props.uploads.length ? <p className={styles.muted}>No DUPA uploaded for this package yet.</p>
      // One row per uploaded DUPA (like Resources & budgets); open one to see its lines and choose how to use it.
      : <div className={styles.scroll} role="region" aria-label="Uploaded DUPAs" tabIndex={0}><table className={styles.table}>
        <thead><tr><th>DUPA</th><th style={{ textAlign: 'right' }}>Rows</th><th style={{ textAlign: 'right' }}>DUPA total</th><th style={{ textAlign: 'right' }}>vs package BOQ</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{props.uploads.map(upload => {
          const total = totalOf(upload);
          const share = props.packageAmount ? total / props.packageAmount * 100 : null;
          const off = share !== null && Math.abs(share - 100) > 5;
          return <tr key={upload.id}>
            <th scope="row" style={{ fontWeight: 600, whiteSpace: 'normal', minWidth: 220 }}>{upload.fileName.replace(/\.[^.]+$/, '')}<div className={styles.muted} style={{ fontWeight: 400, fontSize: 12 }}>{new Date(upload.uploadedAt).toLocaleDateString('en-PH', { dateStyle: 'medium' })}{upload.linkedBoqItems?.length ? ` · prices ${upload.linkedBoqItems.map(item => item.itemCode).join(', ')}` : ''}</div></th>
            <td style={{ textAlign: 'right' }}>{upload.rows.length}</td>
            <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(total)}</td>
            <td style={{ textAlign: 'right', color: share === null ? undefined : off ? '#fcd34d' : '#6ee7b7' }}>{share === null ? '—' : `${share.toFixed(1)}%`}</td>
            <td>{upload.appliedAt ? <span style={{ color: '#6ee7b7' }}>Applied</span> : <span className={styles.muted}>Not applied</span>}</td>
            <td style={{ whiteSpace: 'nowrap' }}><div className={styles.actions} style={{ margin: 0, flexWrap: 'nowrap' }}>
              <button type="button" className={openId === upload.id ? styles.button : styles.secondary} aria-expanded={openId === upload.id} onClick={() => setOpenId(openId === upload.id ? '' : upload.id)}>{openId === upload.id ? 'Close' : upload.appliedAt ? 'View' : 'Open'}</button>
              <a className={styles.secondary} href={`${endpoint}?scheduleId=${encodeURIComponent(props.scheduleId)}&uploadId=${encodeURIComponent(upload.id)}`} title="Download the original file" aria-label={`Download the original ${upload.fileName}`}><Download size={16} aria-hidden="true" /></a>
            </div></td>
          </tr>;
        })}</tbody>
      </table></div>}
    {opened && [opened].map(upload => <div key={upload.id} className={styles.panel} style={{ marginTop: 14 }} aria-label={`DUPA ${upload.fileName}`}>
      <h4 style={{ marginTop: 0 }}>{upload.fileName.replace(/\.[^.]+$/, '')}</h4>
      {!!upload.linkedBoqItems?.length && <p className={styles.muted}>Prices BOQ item{upload.linkedBoqItems.length === 1 ? '' : 's'}: {upload.linkedBoqItems.map(item => `${item.itemCode} ${item.description}`).join('; ')}</p>}
      {itemTable(upload.rows, upload)}
      {!!upload.replacedResources?.length && <details><summary>{upload.replacedResources.length} replaced draft rows (retained history)</summary><ul>{upload.replacedResources.map(row => <li key={row.id}>{row.kind} · {row.description} · {row.quantity} {row.unit} · {money(row.amount)}</li>)}</ul></details>}{upload.appliedAt ? <p>Applied {new Date(upload.appliedAt).toLocaleString('en-PH')} · {upload.reason}. Imported resources retain this upload and source-row reference; later resource edits do not change the original.</p> : props.canEdit && <>
        <DupaAiCheck projectId={props.projectId} scheduleId={props.scheduleId} uploadId={upload.id} disabled={busy} onSave={choices => saveAiChoices(upload, choices)} />
        {/* Same choice cards as Resources & DUPA: one clear option per card, the chosen one highlighted. */}
        <h4 id={`dupa-mode-heading-${upload.id}`} style={{ margin: '16px 0 0' }}>Which costs should this package use?</h4>
        <div className={choice.choiceGroup} role="radiogroup" aria-labelledby={`dupa-mode-heading-${upload.id}`}>
          {([
            ['dupa', 'Use this DUPA', props.existingResources?.length ? `Its lines replace the ${props.existingResources.length} current allowance line${props.existingResources.length === 1 ? '' : 's'}` : 'Its lines become the package allowances'],
            ['generated', 'Keep the current allowances', 'Nothing changes; this DUPA stays as a reference'],
            ['advanced', 'Advanced', 'Add the DUPA lines and choose which current lines they replace'],
          ] as const).map(([value, title, detail]) => <button key={value} type="button" role="radio" aria-checked={modes[upload.id] === value} disabled={busy}
            className={`${choice.choice} ${modes[upload.id] === value ? choice.choiceOn : ''}`} onClick={() => setModes({ ...modes, [upload.id]: value })}>
            <strong>{title}</strong><span>{detail}</span>
          </button>)}
        </div>
        {modes[upload.id] === 'generated' && <p role="status" className={styles.muted}>The generated allowances stay as they are. You can switch to this DUPA later.</p>}
        {(modes[upload.id] === 'dupa' || modes[upload.id] === 'advanced') && <div style={{ display: 'grid', gap: 12, marginTop: 20, justifyItems: 'start' }}>
          {modes[upload.id] === 'advanced' && <>
            <p className={styles.muted}>Tick the current lines this DUPA replaces. Unticked lines stay and the DUPA lines are added. Replaced values and your reason are kept in the upload history.</p>
            {!!props.existingResources?.length && <fieldset><legend>Current lines to replace (optional)</legend>{props.existingResources.map(resource => <label key={resource.id} style={{display:'block',marginBottom:8}}><input type="checkbox" disabled={busy} checked={(replacements[upload.id] || []).includes(resource.id)} onChange={event => setReplacements(current => ({...current,[upload.id]: event.target.checked ? [...current[upload.id] || [],resource.id] : (current[upload.id] || []).filter(id => id !== resource.id)}))}/>{resource.kind} · {resource.description} · {resource.quantity} {resource.unit} · {money(resource.amount)}</label>)}</fieldset>}
            {props.existingResourceCount > 0 && <label><input type="checkbox" checked={acknowledged[upload.id] || false} disabled={busy} onChange={event => setAcknowledged({ ...acknowledged, [upload.id]: event.target.checked })}/> I reviewed the {props.existingResourceCount} current lines, the ones I am replacing and the costs that will remain.</label>}
          </>}
          <div style={{ display: 'grid', gap: 6, width: '100%' }}><label htmlFor={`breakdown-reason-${upload.id}`} style={{ margin: 0 }}>Reason (kept in the history)</label><textarea id={`breakdown-reason-${upload.id}`} rows={2} style={{ width: '100%', margin: 0 }} maxLength={500} placeholder={modes[upload.id] === 'dupa' ? 'Using the uploaded DUPA instead of the generated allowances.' : 'Why these DUPA lines are added'} value={reasons[upload.id] || ''} disabled={busy} onChange={event => setReasons({ ...reasons, [upload.id]: event.target.value })}/></div>
          {keptRows(upload).some(row => !chosenCategories(upload)[String(row.sourceRowNumber)]) && <p className={styles.muted} style={{ margin: 0 }}>Choose a category (material, labor or equipment) for every row in the table above first.</p>}
          <button className={styles.button} disabled={busy || keptRows(upload).some(row => !chosenCategories(upload)[String(row.sourceRowNumber)]) || (modes[upload.id] === 'advanced' && ((reasons[upload.id]?.trim().length || 0) < 5 || (props.existingResourceCount > 0 && !acknowledged[upload.id]))) || (modes[upload.id] === 'dupa' && !!reasons[upload.id] && reasons[upload.id].trim().length < 5)} onClick={() => void apply(upload)}>{modes[upload.id] === 'dupa' ? 'Use this DUPA for the package' : 'Add the DUPA lines'}</button>
        </div>}
      </>}
    </div>)}
  </section>;
}
