'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import { draftWorkflowMessage } from '@/lib/draft-workflow-messages';
import styles from './draft-boq.module.css';
import { boqSections, type SectionIdentity } from '@/lib/boq/section-view';

export interface DraftBoqRow {
  id: string;
  itemCode: string;
  category?: string | null;
  description: string;
  unit: string;
  quantity: number;
  combinedUnitCost: number;
  totalCost: number;
}

interface Props {
  projectId: string;
  version: { id: string; checksum: string; reviewRowVersion?: number };
  rows: DraftBoqRow[];
  contractAmount: number;
  canEdit: boolean;
  canApprove: boolean;
  showApproval?: boolean;
  sectionIdentities?: Record<string, SectionIdentity>;
  initialSection?: string;
}

const currency = (value: Decimal.Value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(new Decimal(value).toNumber());
const PAGE_SIZE_DEFAULT = 25;

export default function DraftBoqEditor({ projectId, version, rows, contractAmount, canEdit, canApprove, showApproval = true, sectionIdentities = {}, initialSection = 'all' }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState({ itemCode: '', section: 'General', description: '', unit: '', quantity: '', unitCost: '', amount: '', editReason: '' });
  const [newLine, setNewLine] = useState({ itemCode: '', category: 'General', description: '', unit: '', quantity: '', unitCost: '', amount: '', editReason: '' });
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmApproval, setConfirmApproval] = useState(false);
  const [sectionFilter, setSectionFilter] = useState(initialSection);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const total = rows.reduce((sum, row) => sum.plus(String(row.totalCost)), new Decimal(0));
  const difference = new Decimal(String(contractAmount)).minus(total);
  const sections = boqSections(rows, sectionIdentities);
  const selectedSection = sections.find(section => section.id === sectionFilter);
  const filteredRows = rows.filter(row => (sectionFilter === 'all' || selectedSection?.itemIds.includes(row.id)) && (!search.trim() || `${row.itemCode} ${row.category || ''} ${row.description} ${row.unit}`.toLowerCase().includes(search.trim().toLowerCase())));
  const filteredTotal = filteredRows.reduce((sum, row) => sum.plus(String(row.totalCost)), new Decimal(0));
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = filteredRows.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const interactionLocked = editingId !== null || removingId !== null;
  function selectSection(value: string) {
    setSectionFilter(value); setPage(0);
    const url = new URL(window.location.href);
    if (value === 'all') url.searchParams.delete('section'); else url.searchParams.set('section', value);
    window.history.replaceState(null, '', url);
  }

  function edit(row: DraftBoqRow) {
    setEditingId(row.id);
    setValues({ itemCode: row.itemCode, section: row.category || 'General', description: row.description, unit: row.unit, quantity: String(row.quantity), unitCost: String(row.combinedUnitCost), amount: String(row.totalCost), editReason: '' });
    setError('');
    setMessage('');
    setConfirmApproval(false);
  }

  function request(method: 'PATCH' | 'POST', action?: 'add' | 'remove', extra: Record<string, unknown> = {}) {
    setError('');
    setMessage('');
    startTransition(async () => {
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/boq-draft`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ versionId: version.id, expectedChecksum: version.checksum, expectedReviewRowVersion: version.reviewRowVersion,
            ...(method === 'PATCH' ? action === 'add' ? { action, ...newLine } : action === 'remove' ? { action, ...extra } : { itemId: editingId, ...values } : {}),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(draftWorkflowMessage(data.error));
        setEditingId(null);
        setConfirmApproval(false);
        setMessage(method === 'PATCH' ? 'BOQ item saved.' : 'BOQ approved and locked. Open work packages to continue planning.');
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The BOQ could not be saved.');
      }
    });
  }

  function addLine(event: FormEvent) {
    event.preventDefault();
    request('PATCH', 'add');
  }

  function save(event: FormEvent) {
    event.preventDefault();
    request('PATCH');
  }

  return <section className={styles.editor} aria-labelledby="draft-boq-items">
    <div className={styles.heading}><div><h3 id="draft-boq-items">Review BOQ items</h3><p>Edit the draft, reconcile it with the contract, then approve and lock the BOQ.</p></div><span className={styles.status}>Draft · not approved</span></div>
    <dl className={styles.totals}>
      <div><dt>Contract value</dt><dd>{currency(contractAmount)}</dd></div>
      <div><dt>All draft items · {rows.length}</dt><dd>{currency(total)}</dd></div>
      <div><dt>Filtered items · {filteredRows.length}</dt><dd>{currency(filteredTotal)}</dd></div>
      <div><dt>Difference to resolve</dt><dd className={!difference.isZero() ? styles.warning : undefined}>{currency(difference)}</dd></div>
    </dl>
    <p className={styles.hint}>The amount is kept as entered. Changing a quantity or unit rate does not silently replace the BOQ amount. After approval, review any changed quantities in the work packages.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {message && <p role="status" className={styles.success}>{message}</p>}
    <div className={styles.listControls} aria-label="Draft BOQ item list controls">
      <label>Section <select value={sectionFilter} disabled={interactionLocked} onChange={event => selectSection(event.target.value)}><option value="all">All sections ({sections.length})</option>{sections.map((section, index) => <option key={section.id} value={section.id}>{index + 1}. {section.name} ({section.itemIds.length})</option>)}</select></label>
      <label>Search BOQ items <input type="search" value={search} disabled={interactionLocked} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Item code, description or unit" /></label>
      <label>Rows per page <select value={pageSize} disabled={interactionLocked} onChange={event => { setPageSize(Number(event.target.value)); setPage(0); }}><option value={25}>25</option><option value={50}>50</option></select></label>
      <span>{filteredRows.length === 0 ? 'No items in this section' : `Showing ${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, filteredRows.length)} of ${filteredRows.length} filtered items`}</span>
      <div className={styles.actions}><button type="button" disabled={interactionLocked || safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button><span>Page {safePage + 1} of {pageCount}</span><button type="button" disabled={interactionLocked || safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</button></div>
    </div>
    <form onSubmit={save}>
      <div className={styles.scroll} role="region" aria-label="Editable draft BOQ items" tabIndex={0}>
        <table><caption className={styles.srOnly}>Draft BOQ items and their stated quantities and amounts</caption><thead><tr><th scope="col">Item</th><th scope="col">Section</th><th scope="col">Description</th><th scope="col">Unit</th><th scope="col">Quantity</th><th scope="col">Unit rate</th><th scope="col">Amount</th><th scope="col">Action</th></tr></thead>
          <tbody>{visibleRows.length ? visibleRows.map(row => <tr key={row.id}>
            <th scope="row">{editingId === row.id ? <><label className={styles.srOnly} htmlFor="draft-boq-item-code">Item code</label><input id="draft-boq-item-code" required disabled={pending} value={values.itemCode} onChange={e => setValues({ ...values, itemCode: e.target.value })} maxLength={191}/></> : row.itemCode}</th>
            {editingId === row.id ? <>
              <td><label className={styles.srOnly} htmlFor="draft-boq-section">BOQ section</label><input id="draft-boq-section" required disabled={pending} maxLength={191} value={values.section} onChange={e => setValues({ ...values, section: e.target.value })} /></td>
              <td><label className={styles.srOnly} htmlFor="draft-boq-description">BOQ description</label><textarea id="draft-boq-description" required rows={3} disabled={pending} value={values.description} onChange={e => setValues({ ...values, description: e.target.value })} /></td>
              <td><label className={styles.srOnly} htmlFor="draft-boq-unit">BOQ unit</label><input id="draft-boq-unit" required disabled={pending} value={values.unit} onChange={e => setValues({ ...values, unit: e.target.value })} /></td>
              <td><label className={styles.srOnly} htmlFor="draft-boq-quantity">BOQ quantity</label><input id="draft-boq-quantity" type="number" min="0" step="any" required disabled={pending} value={values.quantity} onChange={e => setValues({ ...values, quantity: e.target.value })} /></td>
              <td><label className={styles.srOnly} htmlFor="draft-boq-rate">BOQ unit rate</label><input id="draft-boq-rate" type="number" min="0" step="0.01" required disabled={pending} value={values.unitCost} onChange={e => setValues({ ...values, unitCost: e.target.value })} /></td>
              <td><label className={styles.srOnly} htmlFor="draft-boq-amount">BOQ amount</label><input id="draft-boq-amount" type="number" min="0" step="0.01" required disabled={pending} value={values.amount} onChange={e => setValues({ ...values, amount: e.target.value })} /></td>
              <td className={styles.actions}><label className={styles.srOnly} htmlFor="draft-boq-edit-reason">Correction reason</label><input id="draft-boq-edit-reason" required minLength={5} maxLength={300} placeholder="Reason for correction" value={values.editReason} onChange={e => setValues({ ...values, editReason: e.target.value })}/><button type="submit" disabled={pending || values.editReason.trim().length < 5}>{pending ? 'Saving…' : 'Save BOQ item'}</button><button type="button" disabled={pending} onClick={() => setEditingId(null)}>Cancel</button></td>
            </> : <>
              <td>{row.category || 'General'}</td><td>{row.description}</td><td>{row.unit}</td><td>{row.quantity.toLocaleString('en-PH', { maximumFractionDigits: 12 })}</td><td>{currency(row.combinedUnitCost)}</td><td>{currency(row.totalCost)}</td>
              <td>{canEdit ? <div className={styles.actions}><button type="button" disabled={pending || editingId !== null} onClick={event => { event.preventDefault(); edit(row); }} aria-label={`Edit BOQ ${row.itemCode}`}>Edit</button><button type="button" disabled={pending || editingId !== null} onClick={() => { setRemovingId(row.id); setRemoveReason(''); }}>Remove</button></div> : 'View only'}{removingId === row.id && <div><label htmlFor={`remove-reason-${row.id}`}>Removal reason</label><input id={`remove-reason-${row.id}`} minLength={5} maxLength={300} value={removeReason} onChange={event => setRemoveReason(event.target.value)}/><button type="button" disabled={pending || removeReason.trim().length < 5} onClick={() => { request('PATCH', 'remove', { itemId: row.id, editReason: removeReason }); setRemovingId(null); }}>Confirm remove</button><button type="button" disabled={pending} onClick={() => setRemovingId(null)}>Cancel</button></div>}</td>
            </>}
          </tr>) : <tr><td colSpan={8}>No BOQ items match this section.</td></tr>}</tbody>
        </table>
      </div>
    </form>
    {canEdit && <details className={styles.addLine}><summary>Add a missed BOQ line</summary><form onSubmit={addLine}><div className={styles.actions}><input aria-label="New item code" required maxLength={191} placeholder="Item code" value={newLine.itemCode} onChange={event => setNewLine({ ...newLine, itemCode: event.target.value })}/><input aria-label="BOQ section" maxLength={191} placeholder="Section" value={newLine.category} onChange={event => setNewLine({ ...newLine, category: event.target.value })}/><input aria-label="Description" required maxLength={10000} placeholder="Description" value={newLine.description} onChange={event => setNewLine({ ...newLine, description: event.target.value })}/><input aria-label="Unit" required placeholder="Unit" value={newLine.unit} onChange={event => setNewLine({ ...newLine, unit: event.target.value })}/><input aria-label="Quantity" type="number" min="0" step="any" required placeholder="Quantity" value={newLine.quantity} onChange={event => setNewLine({ ...newLine, quantity: event.target.value })}/><input aria-label="Unit rate" type="number" min="0" step="0.01" required placeholder="Unit rate" value={newLine.unitCost} onChange={event => setNewLine({ ...newLine, unitCost: event.target.value })}/><input aria-label="Amount" type="number" min="0" step="0.01" required placeholder="Amount" value={newLine.amount} onChange={event => setNewLine({ ...newLine, amount: event.target.value })}/><input aria-label="Reason for adding line" required minLength={5} maxLength={300} placeholder="Reason" value={newLine.editReason} onChange={event => setNewLine({ ...newLine, editReason: event.target.value })}/><button type="submit" disabled={pending || !newLine.editReason.trim()}>Add BOQ line</button></div></form></details>}
    {showApproval && <div className={styles.approval}>
      <p>{!difference.isZero() ? 'Resolve the difference before approving this BOQ.' : 'The draft total matches the contract value. Approval locks these BOQ items for work-package planning.'}</p>
      {canApprove ? <div>
        {confirmApproval && <p role="alert">Approval locks these items. Confirm when your BOQ review is complete.</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.primary} disabled={pending || editingId !== null || !difference.isZero() || rows.length === 0}
            onClick={() => { if (confirmApproval) request('POST'); else setConfirmApproval(true); }}>
            {pending ? 'Saving…' : confirmApproval ? 'Confirm approval & lock' : 'Approve & Lock BOQ'}
          </button>
          {confirmApproval && <button type="button" disabled={pending} onClick={() => setConfirmApproval(false)}>Cancel approval</button>}
        </div>
      </div> : <p>An authorized approver must approve and lock this BOQ.</p>}
    </div>}
  </section>;
}
