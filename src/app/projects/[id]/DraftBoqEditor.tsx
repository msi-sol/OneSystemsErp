'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import { draftWorkflowMessage } from '@/lib/draft-workflow-messages';
import styles from './draft-boq.module.css';

export interface DraftBoqRow {
  id: string;
  itemCode: string;
  description: string;
  unit: string;
  quantity: number;
  combinedUnitCost: number;
  totalCost: number;
}

interface Props {
  projectId: string;
  version: { id: string; checksum: string };
  rows: DraftBoqRow[];
  contractAmount: number;
  canEdit: boolean;
  canApprove: boolean;
}

const currency = (value: Decimal.Value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(new Decimal(value).toNumber());

export default function DraftBoqEditor({ projectId, version, rows, contractAmount, canEdit, canApprove }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState({ description: '', unit: '', quantity: '', unitCost: '', amount: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmApproval, setConfirmApproval] = useState(false);
  const total = rows.reduce((sum, row) => sum.plus(String(row.totalCost)), new Decimal(0));
  const difference = new Decimal(String(contractAmount)).minus(total);

  function edit(row: DraftBoqRow) {
    setEditingId(row.id);
    setValues({ description: row.description, unit: row.unit, quantity: String(row.quantity), unitCost: String(row.combinedUnitCost), amount: String(row.totalCost) });
    setError('');
    setMessage('');
    setConfirmApproval(false);
  }

  function request(method: 'PATCH' | 'POST') {
    setError('');
    setMessage('');
    startTransition(async () => {
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/boq-draft`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ versionId: version.id, expectedChecksum: version.checksum,
            ...(method === 'PATCH' ? { itemId: editingId, ...values } : {}),
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

  function save(event: FormEvent) {
    event.preventDefault();
    request('PATCH');
  }

  return <section className={styles.editor} aria-labelledby="draft-boq-items">
    <div className={styles.heading}><div><h3 id="draft-boq-items">Review BOQ items</h3><p>Edit the draft, reconcile it with the contract, then approve and lock the BOQ.</p></div><span className={styles.status}>Draft · not approved</span></div>
    <dl className={styles.totals}>
      <div><dt>Contract value</dt><dd>{currency(contractAmount)}</dd></div>
      <div><dt>Draft BOQ total</dt><dd>{currency(total)}</dd></div>
      <div><dt>Difference to resolve</dt><dd className={!difference.isZero() ? styles.warning : undefined}>{currency(difference)}</dd></div>
    </dl>
    <p className={styles.hint}>The amount is kept as entered. Changing a quantity or unit rate does not silently replace the BOQ amount. After approval, review any changed quantities in the work packages.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {message && <p role="status" className={styles.success}>{message}</p>}
    <form onSubmit={save}>
      <div className={styles.scroll} role="region" aria-label="Editable draft BOQ items" tabIndex={0}>
        <table><caption className={styles.srOnly}>Draft BOQ items and their stated quantities and amounts</caption><thead><tr><th scope="col">Item</th><th scope="col">Description</th><th scope="col">Unit</th><th scope="col">Quantity</th><th scope="col">Unit rate</th><th scope="col">Amount</th><th scope="col">Action</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>
            <th scope="row">{row.itemCode}</th>
            {editingId === row.id ? <>
              <td><label className={styles.srOnly} htmlFor="draft-boq-description">BOQ description</label><textarea id="draft-boq-description" required rows={3} disabled={pending} value={values.description} onChange={e => setValues({ ...values, description: e.target.value })} /></td>
              <td><label className={styles.srOnly} htmlFor="draft-boq-unit">BOQ unit</label><input id="draft-boq-unit" required disabled={pending} value={values.unit} onChange={e => setValues({ ...values, unit: e.target.value })} /></td>
              <td><label className={styles.srOnly} htmlFor="draft-boq-quantity">BOQ quantity</label><input id="draft-boq-quantity" type="number" min="0" step="any" required disabled={pending} value={values.quantity} onChange={e => setValues({ ...values, quantity: e.target.value })} /></td>
              <td><label className={styles.srOnly} htmlFor="draft-boq-rate">BOQ unit rate</label><input id="draft-boq-rate" type="number" min="0" step="0.01" required disabled={pending} value={values.unitCost} onChange={e => setValues({ ...values, unitCost: e.target.value })} /></td>
              <td><label className={styles.srOnly} htmlFor="draft-boq-amount">BOQ amount</label><input id="draft-boq-amount" type="number" min="0" step="0.01" required disabled={pending} value={values.amount} onChange={e => setValues({ ...values, amount: e.target.value })} /></td>
              <td className={styles.actions}><button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save BOQ item'}</button><button type="button" disabled={pending} onClick={() => setEditingId(null)}>Cancel</button></td>
            </> : <>
              <td>{row.description}</td><td>{row.unit}</td><td>{row.quantity.toLocaleString('en-PH', { maximumFractionDigits: 12 })}</td><td>{currency(row.combinedUnitCost)}</td><td>{currency(row.totalCost)}</td>
              <td>{canEdit ? <button type="button" disabled={pending || editingId !== null} onClick={event => { event.preventDefault(); edit(row); }} aria-label={`Edit BOQ ${row.itemCode}`}>Edit</button> : 'View only'}</td>
            </>}
          </tr>)}</tbody>
        </table>
      </div>
    </form>
    <div className={styles.approval}>
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
    </div>
  </section>;
}
