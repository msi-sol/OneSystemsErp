'use client';

import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import { ArrowRight, Check, ChevronDown, FileSpreadsheet, Loader2, Pencil, Search, UploadCloud, X } from 'lucide-react';
import { approveBOQUpload, reviewBOQUpload } from '@/app/actions/boqUploadParser';
import { WORKSPACE_BREAKDOWN_FIELDS, type WorkspaceAnalysis, type WorkspaceBreakdownMapping, type WorkspaceMapping, type WorkspaceIssue } from '@/lib/boq/workspace-types';
import styles from './boqTemplate.module.css';
import NextStepCard from '@/components/boq/NextStepCard';
import { BOARD_GROUPS, deriveIntakeLifecycle, projectBoardStage } from '@/lib/planning/lifecycle';
import { readWorkspaceResponse } from '@/lib/boq/workspace-response';

export interface WorkspaceProject {
  id: string; name: string; contractAmount: number; boqLocked: boolean; hasBOQ: boolean;
  boqStatus: string; fileName: string | null; uploadId: string | null; uploadStatus: string | null;
  canEdit: boolean; canApprove: boolean;
  /** Work-package plan: none yet, a draft in progress, or an approved baseline. */
  planStage: 'none' | 'draft' | 'approved';
}
export interface WorkspaceUpload {
  uploadId: string; projectId: string; status: string; fileName: string; fileUrl?: string;
  grandTotal: number; validRowsCount: number; warningRowsCount: number; errorRowsCount: number;
  canSubmit: boolean; canApprove: boolean; sheetName?: string;
  issues?: WorkspaceIssue[];
}
interface Props {
  projects: WorkspaceProject[]; actorName: string; actorRole: string;
  canCreate: boolean; canAnalyze: boolean; canApprove: boolean; initialUpload: WorkspaceUpload | null;
  initialProjectId?: string; initialMode?: 'new' | 'existing';
}
const money = (value: string | number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value));
function columnLetter(index: number): string {
  let value = index;
  let letter = '';
  while (value > 0) { value -= 1; letter = String.fromCharCode(65 + value % 26) + letter; value = Math.floor(value / 26); }
  return letter;
}
const columnDisplayName = (column: WorkspaceAnalysis['columns'][number]) => `${columnLetter(column.index)} — ${column.label}`;
const mappingFields: { key: Exclude<keyof WorkspaceMapping, 'headerRow'>; label: string; required?: boolean }[] = [
  { key: 'itemCode', label: 'Item code' }, { key: 'description', label: 'Description', required: true },
  { key: 'unit', label: 'Unit', required: true }, { key: 'quantity', label: 'Quantity', required: true },
  { key: 'unitCost', label: 'Unit rate' }, { key: 'amount', label: 'Amount', required: true },
];
const labels: Record<string, string> = { DRAFT_UPLOADED: 'Draft import', PENDING: 'Draft import', SUBMITTED_FOR_REVIEW: 'Submitted for review', RETURNED_FOR_CORRECTION: 'Returned for correction', VALIDATION_FAILED: 'Needs correction', COMMITTED: 'Approved', APPROVED: 'Approved' };

export default function BOQTemplateClient({ projects, actorName, actorRole, canCreate, canAnalyze, canApprove, initialUpload }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const contractAmountEdited = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  // PDF, Word, text and image sources are not workbooks; name them plainly in the progress and button text.
  const sourceNoun = !file || /\.(xlsx|xls|csv|tsv)$/i.test(file.name) ? 'workbook' : 'file';
  const [analysis, setAnalysis] = useState<WorkspaceAnalysis | null>(null);
  const [mapping, setMapping] = useState<WorkspaceMapping | null>(null);
  const [breakdownMapping, setBreakdownMapping] = useState<WorkspaceBreakdownMapping | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [projectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectContractAmount, setProjectContractAmount] = useState('');
  const normalizedName = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const sameNameProject = projectName.trim() ? projects.find(project => normalizedName(project.name) === normalizedName(projectName)) ?? null : null;
  /** Project details are read from the file and stay read-only until the pencil opens one field. */
  const [editingField, setEditingField] = useState<'name' | 'contract' | null>(null);
  const [nameEdited, setNameEdited] = useState(false);
  const [contractSource, setContractSource] = useState<'document' | 'boq-total' | 'boq-total-chosen' | 'edited' | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<'analyze' | 'confirm' | 'review' | 'approve' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [upload, setUpload] = useState(initialUpload);
  const [approvalConfirmation, setApprovalConfirmation] = useState(false);
  const selectedProject = projects.find(project => project.id === projectId);
  const validMapping = mapping && mapping.headerRow > 0 && mapping.description !== null && mapping.unit !== null && mapping.quantity !== null && mapping.amount !== null;
  const mappingChanged = JSON.stringify(mapping) !== JSON.stringify(analysis?.mapping)
    || JSON.stringify(breakdownMapping) !== JSON.stringify(analysis?.breakdownMapping);
  const approvedUpload = upload?.status === 'APPROVED' || upload?.status === 'COMMITTED';
  const enteredContract = selectedProject ? String(selectedProject.contractAmount) : projectContractAmount;
  let contractDifference: string | null = null;
  if (analysis?.itemCount && /^\d+(?:\.\d{1,2})?$/.test(enteredContract.trim())) {
    const amount = new Decimal(enteredContract);
    if (amount.isFinite() && amount.gt(0)) contractDifference = amount.minus(analysis.total).abs().toFixed(2);
  }
  const contractMismatch = contractDifference !== null && contractDifference !== '0.00';

  function chooseFile(selected?: File) {
    if (!selected || busy) return;
    setError(''); setMessage('');
    if (!/\.(xlsx|xls|csv|tsv|pdf|docx|txt|png|jpe?g|webp)$/i.test(selected.name)) { setError('Choose .xlsx, .xls, .csv, .tsv, .pdf, .docx, .txt, .png, .jpg, .jpeg or .webp. Executable and archive files are not supported.'); return; }
    if (selected.size === 0 || selected.size > 10 * 1024 * 1024) { setError('Choose a source file larger than 0 bytes and no bigger than 10 MB.'); return; }
    setFile(selected); setAnalysis(null); setMapping(null); setBreakdownMapping(null); setSheetName(''); setUpload(null); setApprovalConfirmation(false);
    resetProjectDetails();
  }
  function resetProjectDetails() {
    setProjectName(''); setNameEdited(false); setProjectContractAmount(''); setContractSource(null);
    setEditingField(null); contractAmountEdited.current = false;
  }
  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setDragging(false);
    if (event.dataTransfer.files.length > 1) { setError('Choose one BOQ workbook at a time.'); return; }
    chooseFile(event.dataTransfer.files[0]);
  }
  async function analyze(nextSheet?: string, nextMapping?: WorkspaceMapping | null, nextBreakdownMapping?: WorkspaceBreakdownMapping | null, preview?: { offset?: number; sectionKey?: string | null }) {
    if (!file || busy) return;
    setBusy('analyze'); setError(''); setMessage('');
    try {
      const body = new FormData(); body.set('file', file);
      if (analysis?.documentToken) body.set('documentToken', analysis.documentToken);
      if (projectId) body.set('projectId', projectId);
      if (nextSheet) body.set('sheetName', nextSheet);
      if (nextMapping) body.set('mapping', JSON.stringify(nextMapping));
      if (nextBreakdownMapping) body.set('breakdownMapping', JSON.stringify(nextBreakdownMapping));
      body.set('offset', String(preview?.offset ?? 0));
      if (preview?.sectionKey) body.set('sectionKey', preview.sectionKey);
      const response = await fetch('/api/boq-workspace/analyze', { method: 'POST', body });
      const data = await readWorkspaceResponse(response, 'analyze');
      if (!data.success) throw new Error(data.error);
      const result: WorkspaceAnalysis = data.analysis;
      setAnalysis(result); setMapping(result.mapping); setBreakdownMapping(result.breakdownMapping); setSheetName(result.selectedSheet || '');
      if (!nameEdited) setProjectName(result.suggestedProjectName || '');
      setEditingField(null);
      if (!contractAmountEdited.current) {
        // The contract value stated in the document wins; the BOQ total is only a candidate to check.
        if (result.extractedContractAmount && Number(result.extractedContractAmount) > 0) {
          setProjectContractAmount(result.extractedContractAmount); setContractSource('document');
        } else if (result.itemCount > 0 && result.errors.length === 0 && Number.isFinite(Number(result.total)) && Number(result.total) > 0) {
          setProjectContractAmount(result.total); setContractSource('boq-total');
        } else {
          setProjectContractAmount(''); setContractSource(null);
        }
      }
      setMessage(result.readingMethod === 'openai-assisted'
        ? 'OpenAI helped read the unfamiliar layout. Review the extracted fields and original values before saving.'
        : 'Read with the built-in reader. Review the sheet, columns and item preview before saving.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not analyze this workbook.'); }
    finally { setBusy(null); }
  }
  async function confirmSource() {
    if (!file || !analysis || !mapping || busy) return;
    setBusy('confirm'); setError(''); setMessage('');
    try {
      const body = new FormData(); body.set('file', file); body.set('fileHash', analysis.fileHash);
      if (analysis.documentToken) body.set('documentToken', analysis.documentToken);
      body.set('sheetName', sheetName); body.set('mapping', JSON.stringify(mapping)); body.set('projectId', projectId); body.set('projectName', projectName);
      body.set('breakdownMapping', JSON.stringify(breakdownMapping ?? {}));
      body.set('projectContractAmount', projectContractAmount);
      const response = await fetch('/api/boq-workspace/confirm', { method: 'POST', body });
      const data = await readWorkspaceResponse(response, 'confirm');
      if (!data.success) throw new Error(data.error);
      setUpload({ uploadId: data.uploadId, projectId: data.projectId, status: data.status,
        fileName: file.name, fileUrl: data.report.fileUrl, grandTotal: Number(data.report.grandTotal),
        validRowsCount: data.report.validRowsCount, warningRowsCount: data.report.warningRowsCount, errorRowsCount: data.report.errorRowsCount,
        canSubmit: true, canApprove: selectedProject?.canApprove ?? canApprove, sheetName, issues: analysis.warnings });
      setAnalysis(null); setMapping(null); setBreakdownMapping(null); setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setMessage('Draft BOQ saved to its project. Opening the BOQ page to review sections, items and approvals.');
      router.push(`/projects/${data.projectId}/boq`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save this BOQ import.'); }
    finally { setBusy(null); }
  }
  async function review(action: 'SUBMIT_FOR_REVIEW' | 'RETURN_FOR_CORRECTION') {
    if (!upload || busy) return;
    setBusy('review'); setError('');
    try {
      const result = await reviewBOQUpload(upload.uploadId, action);
      if (!result.success) throw new Error('error' in result ? result.error : 'The import could not be approved.');
      setUpload({ ...upload, status: result.status }); setApprovalConfirmation(false);
      setMessage(action === 'SUBMIT_FOR_REVIEW' ? 'Submitted for review.' : 'Returned for correction. Choose a corrected workbook to continue.'); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update the review.'); }
    finally { setBusy(null); }
  }
  async function approve() {
    if (!upload || busy) return;
    setBusy('approve'); setError('');
    try {
      const result = await approveBOQUpload(upload.uploadId);
      if (!result.success) throw new Error('error' in result ? result.error : 'The import could not be approved.');
      setUpload({ ...upload, status: 'APPROVED' }); setApprovalConfirmation(false);
      setMessage('BOQ approved and locked. Open the project BOQ or continue to work packages.'); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not approve the BOQ.'); }
    finally { setBusy(null); }
  }
  function finishEditingOnKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); setEditingField(null); }
  }
  const lifecycle = deriveIntakeLifecycle({
    fileChosen: Boolean(file), analyzed: Boolean(analysis), blockingIssues: analysis?.errors.length ?? 0,
    saved: Boolean(upload), savedProjectId: upload?.projectId, canAnalyze,
  });
  const query = search.trim().toLocaleLowerCase();
  const visibleProjects = projects.filter(project => !query || [project.name, project.id, project.fileName].some(value => value?.toLocaleLowerCase().includes(query)));
  const staged = visibleProjects.map(project => ({ project, stage: projectBoardStage(project) }));

  return <div className={styles.container}>
    <header className={styles.header}><h1>BOQ Workspace</h1><p>Start a new project from its BOQ. Analyze the file, check the reading, then save a draft for review.</p></header>
    <NextStepCard lifecycle={lifecycle} stepsLabel="Upload steps" />
    {error && <div role="alert" className={styles.error}><strong>Unable to continue</strong><span>{error}</span></div>}
    {message && <p role="status" className={styles.message}>{message}</p>}
    <section className={styles.intake} aria-label="BOQ workbook intake" aria-busy={busy === 'analyze' || busy === 'confirm'}>
      <div className={styles.intakeBody}>
        <div className={`${styles.dropzone} ${dragging ? styles.dragging : ''}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
          <div className={styles.uploadIcon}><UploadCloud size={28} strokeWidth={1.6} /></div>
          <h2>{file ? file.name : 'Drop the BOQ document here'}</h2>
          <p>{file ? `${file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(2)} MB`} · ${analysis ? 'analyzed' : 'ready to analyze'}` : 'Excel, CSV/TSV, PDF, Word, text, or PNG/JPEG/WEBP image · up to 10 MB'}</p>
          <label className={styles.fileButton}><FileSpreadsheet size={18} /> {file ? 'Choose another file' : 'Choose file'}
            <input ref={fileInput} aria-label="Choose BOQ source file" className={styles.fileInput} type="file" accept=".xlsx,.xls,.csv,.tsv,.pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values,text/plain,application/pdf,image/png,image/jpeg,image/webp" onChange={(event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0])} disabled={!!busy || !canAnalyze} />
          </label>
          {file && !busy && <button className={styles.clearFile} onClick={() => { setFile(null); setAnalysis(null); setMapping(null); setSheetName(''); resetProjectDetails(); if (fileInput.current) fileInput.current.value = ''; }} aria-label="Remove selected workbook"><X size={16} /></button>}
        </div>
        <div className={styles.analysisBar}>
          <ol aria-label="Workbook intake progress" className={styles.progress}>
            <li className={file || analysis || upload ? styles.current : ''}>{file || analysis || upload ? <Check size={15} /> : null}File selected</li>
            <li className={analysis || upload ? styles.current : ''}>{analysis || upload ? <Check size={15} /> : null}Checking and reading the {sourceNoun}</li>
            <li className={upload ? styles.current : ''}>{upload ? <Check size={15} /> : null}Confirm BOQ sheet</li>
          </ol>
          <button className={styles.primary} disabled={!file || !!busy || !canAnalyze} onClick={() => analyze()}>{busy === 'analyze' && <Loader2 size={17} className={styles.spin} />} {busy === 'analyze' ? `Analyzing ${sourceNoun}…` : `Analyze this ${sourceNoun}`}</button>
        </div>
        <p className={styles.note}>Analyzing as {actorName} · {actorRole.replaceAll('_', ' ')}. Analysis creates no project or BOQ. Your original {sourceNoun} is preserved unchanged when you confirm its source.</p>
        {!canAnalyze && <p className={styles.warning}>Your account can view BOQs. An authorized project editor must upload a workbook.</p>}
        {analysis && <section className={styles.projectDetails} aria-labelledby="boq-project-details-heading">
          <h3 id="boq-project-details-heading">New project details</h3>
          <div className={styles.detailGrid}>
            <div className={styles.detailField}>
              <span className={styles.detailLabel} id="boq-project-name-label">Project name</span>
              <div className={styles.detailRow}>
                {editingField === 'name'
                  ? <input id="boq-project-name" aria-labelledby="boq-project-name-label" autoFocus value={projectName} maxLength={191} disabled={!!busy || !canCreate} placeholder="Project name" onChange={event => { setProjectName(event.target.value); setNameEdited(true); }} onKeyDown={finishEditingOnKey} />
                  : <span className={projectName ? styles.detailValue : styles.detailMissing}>{projectName || 'Not found in the file'}</span>}
                <button type="button" className={styles.iconButton} disabled={!!busy || !canCreate} aria-label={editingField === 'name' ? 'Done editing project name' : 'Edit project name'} title={editingField === 'name' ? 'Done' : 'Edit'} onClick={() => setEditingField(editingField === 'name' ? null : 'name')}>{editingField === 'name' ? <Check size={16} /> : <Pencil size={15} />}</button>
              </div>
              {/* Says exactly where the name came from; a name taken from the file name is a warning to check. */}
              <span className={!nameEdited && projectName && analysis.projectNameSource === 'file-name' ? styles.detailSourceWarn : styles.detailSource}>{nameEdited ? 'Edited by you' : !projectName ? 'Add the project name with the pencil'
                : analysis.projectNameSource === 'file-name' ? 'Not stated in the file: taken from the file name. Check it.'
                : analysis.projectNameSource === 'ai' ? `Read by AI from the file${analysis.projectNameEvidence ? ` · ${analysis.projectNameEvidence.replace(/ · read by AI$/, '')}` : ''}`
                : `Read from the file${analysis.projectNameEvidence ? ` · ${analysis.projectNameEvidence}` : ''}`}</span>
              {!nameEdited && (analysis.metadataChecks ?? []).filter(check => check.field === 'projectName').map((check, index) => <span key={index} className={styles.detailSourceWarn}>{check.message}</span>)}
            </div>
            <div className={styles.detailField}>
              <span className={styles.detailLabel} id="boq-contract-amount-label">Signed contract value</span>
              <div className={styles.detailRow}>
                {editingField === 'contract'
                  ? <input id="boq-contract-amount" aria-labelledby="boq-contract-amount-label" autoFocus type="number" min="0.01" step="0.01" required value={projectContractAmount} disabled={!!busy || !canCreate} placeholder="0.00" onKeyDown={finishEditingOnKey} onChange={event => { contractAmountEdited.current = true; setContractSource('edited'); setProjectContractAmount(event.target.value); setError(current => current === 'The BOQ total must match the entered signed contract value.' ? '' : current); }} />
                  : <span className={projectContractAmount ? styles.detailValue : styles.detailMissing}>{projectContractAmount && Number.isFinite(Number(projectContractAmount)) ? money(projectContractAmount) : 'Not found in the file'}</span>}
                <button type="button" className={styles.iconButton} disabled={!!busy || !canCreate} aria-label={editingField === 'contract' ? 'Done editing signed contract value' : 'Edit signed contract value'} title={editingField === 'contract' ? 'Done' : 'Edit'} onClick={() => setEditingField(editingField === 'contract' ? null : 'contract')}>{editingField === 'contract' ? <Check size={16} /> : <Pencil size={15} />}</button>
              </div>
              <span className={contractSource === 'boq-total' || contractSource === 'boq-total-chosen' ? styles.detailSourceWarn : styles.detailSource}>{contractSource === 'document' ? (analysis.contractAmountSource === 'ai'
                ? `Read by AI from the file${analysis.contractAmountEvidence ? ` · ${analysis.contractAmountEvidence.replace(/ · read by AI$/, '')}` : ''}`
                : `Read from the file${analysis.contractAmountEvidence ? ` · ${analysis.contractAmountEvidence}` : ''}`) : contractSource === 'boq-total' ? 'No contract value stated in the file, so the BOQ total is used. Check it against the signed contract.' : contractSource === 'boq-total-chosen' ? 'Set to the BOQ total by you. Check it against the signed contract.' : contractSource === 'edited' ? 'Edited by you' : 'Add the signed contract value with the pencil'}</span>
              {/* Contract value vs BOQ total has its own panel below; here only a second, different stated value. */}
              {contractSource !== 'edited' && (analysis.metadataChecks ?? []).filter(check => check.field === 'contractAmount' && !check.message.startsWith('The file states a contract value')).map((check, index) => <span key={index} className={styles.detailSourceWarn} role="alert">{check.message}</span>)}
            </div>
          </div>
          <p className={styles.detailNote}>The project is created only when you confirm the BOQ source below. Verification and approval follow in the BOQ module.</p>
          {/* Saving always creates a NEW project; warn when one with this name exists so records go to the right project. */}
          {sameNameProject && <div className={styles.warning} role="alert"><strong>A project named “{sameNameProject.name}” already exists.</strong><p>Saving creates a separate new project. To work on the existing project&apos;s BOQ instead, <Link href={`/projects/${sameNameProject.id}/boq`}>open that project</Link>; otherwise rename this one with the pencil.</p></div>}
          {contractMismatch && <div className={styles.warning} role="alert"><strong>BOQ and contract amounts differ</strong><dl className={styles.uploadFacts}><div><dt>Signed contract value</dt><dd>{money(enteredContract)}</dd></div><div><dt>BOQ item total</dt><dd>{money(analysis.total)}</dd></div><div><dt>Difference to resolve</dt><dd>{money(contractDifference!)}</dd></div></dl><p>You can save this as a draft and resolve the difference in the BOQ review. Approval stays blocked until the amounts reconcile. Neither amount is replaced automatically.</p><button type="button" className={styles.secondary} disabled={!!busy || !canCreate} onClick={() => { contractAmountEdited.current = true; setContractSource('boq-total-chosen'); setProjectContractAmount(analysis.total); setEditingField(null); setError(''); }}>Use BOQ total as contract value</button></div>}
        </section>}
      </div>
      <div className={styles.moreWays}><span>Already have a project?</span><Link href="/projects">Open projects to continue review or corrections</Link></div>
    </section>

    {analysis && <section className={styles.review} aria-labelledby="source-heading">
      <header className={styles.sectionHeader}><div><h2 id="source-heading">Confirm BOQ source</h2><p>Select the sheet and check how its columns map to BOQ items.</p></div><span className={styles.badge}>Not saved yet</span></header>
      <div className={styles.mappingGrid}>
        <div><label htmlFor="boq-source-sheet">BOQ sheet</label><select id="boq-source-sheet" value={sheetName} disabled={!!busy} onChange={event => { setSheetName(event.target.value); setMapping(null); setBreakdownMapping(null); void analyze(event.target.value); }}><option value="" disabled>Choose the BOQ sheet</option>{analysis.sheets.map(sheet => <option key={sheet.name} value={sheet.name}>{sheet.suggested ? '★ ' : ''}{sheet.name} · {sheet.rowCount} rows{sheet.suggested ? ' · likely main BOQ' : sheet.candidate ? ' · BOQ columns found' : ''}</option>)}</select></div>
        {mapping && <div><label htmlFor="boq-header-row">Header row</label><input id="boq-header-row" type="number" min={1} max={1000} value={mapping.headerRow} disabled={!!busy} onChange={event => setMapping({ ...mapping, headerRow: Number(event.target.value) })} /></div>}
      </div>
      {mapping && <><div className={styles.mappingGrid}>{mappingFields.map(field => <div key={field.key}><label htmlFor={`boq-column-${field.key}`}>{field.label}{field.required ? ' *' : ' (optional)'}</label><select id={`boq-column-${field.key}`} disabled={!!busy} value={mapping[field.key] ?? ''} onChange={event => setMapping({ ...mapping, [field.key]: event.target.value ? Number(event.target.value) : null })}><option value="">{field.required ? 'Choose a column' : 'Not present'}</option>{analysis.columns.map(column => <option key={column.index} value={column.index}>{columnDisplayName(column)}</option>)}</select></div>)}</div><details className={styles.issues}><summary>Optional cost breakdown mapping</summary><div className={styles.mappingGrid}>{WORKSPACE_BREAKDOWN_FIELDS.map(field => <div key={field}><label htmlFor={`boq-breakdown-${field}`}>{field.replace(/[A-Z]/g, letter => ` ${letter.toLowerCase()}`)}</label><select id={`boq-breakdown-${field}`} disabled={!!busy} value={breakdownMapping?.[field] ?? ''} onChange={event => setBreakdownMapping({ ...breakdownMapping, [field]: event.target.value ? Number(event.target.value) : null })}><option value="">Not present</option>{analysis.columns.map(column => <option key={column.index} value={column.index}>{columnDisplayName(column)}</option>)}</select></div>)}</div></details><button className={styles.secondary} disabled={!!busy || !validMapping} onClick={() => analyze(sheetName, mapping, breakdownMapping)}>Update item preview</button></>}
      {analysis.columns.length > 0 && <details className={styles.issues} open={analysis.errors.some(issue => issue.row === 'header')}><summary>Column evidence and mapping help</summary><p>When headings repeat, choose which column the BOQ prices from. Column letters distinguish identical headings. Filled counts show cells below the selected header; priced rows have a description and a positive mapped quantity or amount. Counts help you inspect the source and do not select a column for you.</p><div className={styles.tableScroll} role="region" aria-label="Workbook column evidence" tabIndex={0}><table><caption className={styles.srOnly}>Column positions and populated-row counts</caption><thead><tr><th scope="col">Column</th><th scope="col">Workbook heading</th><th scope="col">Filled body rows</th><th scope="col">Filled priced rows</th></tr></thead><tbody>{analysis.columns.map(column => <tr key={column.index}><th scope="row">{columnLetter(column.index)}</th><td>{column.label}</td><td>{column.populatedRows ?? '—'}</td><td>{column.pricedRowCount ? `${column.pricedPopulatedRows ?? 0} of ${column.pricedRowCount}` : 'Set a description and quantity/amount mapping first'}</td></tr>)}</tbody></table></div><p>Choose the sheet, header row and columns above, then click Update item preview. An empty rival column stays unselected until you make a choice.</p></details>}
      {(analysis.errors.length > 0 || analysis.warnings.length > 0) && <div className={styles.issues}>{analysis.errors.length > 0 && <div><h3>Resolve before confirming</h3><p>Your workbook and mapping choices are kept here. Correct the indicated sheet or column and update the preview; confirmation stays blocked while required fields are unresolved.</p><ul>{analysis.errors.slice(0, 20).map((issue, index) => <li key={index}>Row {issue.row} · {issue.field}: {issue.message}</li>)}</ul>{analysis.errors.length > 20 && <p>{analysis.errors.length - 20} more issues. Correct the workbook and analyze again.</p>}</div>}{analysis.warnings.length > 0 && <details><summary>{analysis.warnings.length} review {analysis.warnings.length === 1 ? 'note' : 'notes'}</summary><ul>{analysis.warnings.slice(0, 20).map((issue, index) => <li key={index}>Row {issue.row} · {issue.field}: {issue.message}</li>)}</ul></details>}</div>}
      {/* Items are reviewed in the project BOQ after saving; the upload step only shows what was read. */}
      {analysis.itemCount > 0 && <div className={styles.previewHeader}><h3>BOQ read from the file</h3><p>{analysis.itemCount} items · {analysis.sections.length} {analysis.sections.length === 1 ? 'section' : 'sections'} · {money(analysis.total)}. Review the items in the project BOQ after saving.</p></div>}
      <footer className={styles.confirmBar}><p>Confirming saves an unapproved import draft and the unchanged workbook. The BOQ becomes authoritative only after approval.</p><button className={styles.primary} disabled={!!busy || !sheetName || !validMapping || mappingChanged || analysis.errors.length > 0 || analysis.itemCount === 0 || (!projectId && (!canCreate || !projectName.trim() || !projectContractAmount.trim()))} onClick={confirmSource}>{busy === 'confirm' && <Loader2 size={17} className={styles.spin} />} {busy === 'confirm' ? 'Saving import draft…' : 'Confirm sheet & save draft'}</button></footer>
    </section>}

    {upload && <section className={styles.review} aria-labelledby="upload-review-heading"><header className={styles.sectionHeader}><div><h2 id="upload-review-heading">BOQ import review</h2><p>{upload.fileName}{upload.sheetName ? ` · ${upload.sheetName}` : ''}</p></div><span className={`${styles.badge} ${approvedUpload ? styles.approved : ''}`}>{labels[upload.status] || upload.status}</span></header><dl className={styles.uploadFacts}><div><dt>Item amount total</dt><dd>{money(upload.grandTotal)}</dd></div><div><dt>Valid rows</dt><dd>{upload.validRowsCount}</dd></div><div><dt>Review notes</dt><dd>{upload.warningRowsCount}</dd></div></dl><p className={styles.note}>The original workbook is preserved. Approval reconciles its stated amounts with the project contract and locks the BOQ.</p><div className={styles.reviewLinks}>{upload.fileUrl && <a href={upload.fileUrl}>Download original workbook</a>}<Link href={`/projects/${upload.projectId}/boq`}>Open project BOQ <ArrowRight size={15} /></Link>{approvedUpload && <Link href={`/projects/${upload.projectId}/work-packages`}>Open work packages <ArrowRight size={15} /></Link>}</div>{!!upload.issues?.length && <details className={styles.issues}><summary>Validation details · {upload.issues.length}</summary><ul>{upload.issues.map((issue, index) => <li key={index}>Row {issue.row} · {issue.field}: {issue.message}</li>)}</ul></details>}{!approvedUpload && <div className={styles.reviewActions}>{upload.canApprove && upload.status !== 'RETURNED_FOR_CORRECTION' && <button className={styles.secondary} disabled={!!busy} onClick={() => review('RETURN_FOR_CORRECTION')}>Return for correction</button>}{upload.canSubmit && upload.status !== 'SUBMITTED_FOR_REVIEW' && upload.status !== 'RETURNED_FOR_CORRECTION' && <button className={styles.secondary} disabled={!!busy || upload.errorRowsCount > 0} onClick={() => review('SUBMIT_FOR_REVIEW')}>Submit for review</button>}{upload.canApprove && upload.status !== 'RETURNED_FOR_CORRECTION' && <button className={styles.primary} disabled={!!busy || upload.errorRowsCount > 0} onClick={() => { if (approvalConfirmation) void approve(); else setApprovalConfirmation(true); }}>{busy === 'approve' ? 'Approving…' : approvalConfirmation ? 'Confirm approval & import' : 'Approve and import'}</button>}</div>}{approvalConfirmation && <p role="alert" className={styles.warning}>This imports and locks the authoritative BOQ. <button className={styles.textButton} onClick={() => setApprovalConfirmation(false)}>Cancel approval</button></p>}</section>}

    <section className={styles.board} aria-labelledby="workspace-projects"><div className={styles.boardHeader}><h2 id="workspace-projects">Projects</h2><span>{projects.length} {projects.length === 1 ? 'project' : 'projects'}</span><div className={styles.search}><Search size={18} aria-hidden="true" /><input type="search" aria-label="Search BOQ projects" placeholder="Name, code, or file…" value={search} onChange={event => setSearch(event.target.value)} /></div></div>
      {BOARD_GROUPS.map(group => { const items = staged.filter(entry => entry.stage.group === group.key); return <details key={`${group.key}-${Boolean(query)}`} className={styles.projectGroup} open={query || (group.key !== 'approved' && items.length > 0) ? true : undefined}><summary><ChevronDown size={17} /><span>{group.title}</span><span className={styles.count}>· {items.length}</span></summary><div className={styles.projectList}>{items.length === 0 ? <p className={styles.empty}>{query ? 'No projects match your search in this group.' : group.empty}</p> : items.map(({ project, stage }) => <article className={styles.projectRow} key={project.id}><div><Link className={styles.projectName} href={`/projects/${project.id}/boq`}>{project.name}</Link><p>{project.fileName || 'No BOQ file confirmed yet'}</p><span className={styles.nextAction}>{stage.next}</span></div><div className={styles.projectActions}><span>{money(project.contractAmount)}</span><Link className={styles.projectCta} href={stage.cta.href} onClick={stage.cta.href.startsWith('/boq?upload=') ? () => setUpload(null) : undefined}>{stage.cta.label} <ArrowRight size={15} /></Link>{group.key !== 'boq' && <Link href={`/projects/${project.id}/boq`}>View BOQ <ArrowRight size={15} /></Link>}</div></article>)}</div></details>; })}
    </section>
  </div>;
}
