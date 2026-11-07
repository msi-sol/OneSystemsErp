'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { draftWorkflowMessage } from '@/lib/draft-workflow-messages';
import styles from '../planning/planning.module.css';
import drawer from './BOQSectionDrawer.module.css';

type Section = { id: string; name: string; itemIds: string[]; amount: string };
export type SectionItem = { id: string; itemCode: string; category: string | null; description: string; unit: string; quantity: number; unitCost: number; amount: number };
/** Present only while the BOQ is an editable draft and the user may edit it. */
export type SectionEditContext = { versionId: string; checksum: string; reviewRowVersion?: number };

const peso = (value: number | string) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value));
const quantity = (value: number) => value.toLocaleString('en-PH', { maximumFractionDigits: 4 });

export default function BOQSections({ projectId, sections, items, edit, locked }: { projectId: string; sections: Section[]; items: SectionItem[]; edit: SectionEditContext | null; locked: boolean }) {
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const visible = sections.filter(row => row.name.toLowerCase().includes(search.trim().toLowerCase()));
  const open = sections.find(section => section.id === openId) ?? null;
  // Focus returns to the "View items" button that opened the panel.
  const opener = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => { setOpenId(null); requestAnimationFrame(() => opener.current?.focus()); }, []);
  return <section className={styles.panel} aria-labelledby="boq-sections-heading">
    <div className={styles.titleRow}><div><h3 id="boq-sections-heading">Sections</h3><p className={styles.muted}>Review the workbook breakdown. Repeated section names remain separate source occurrences.</p></div><span>{sections.length} sections</span></div>
    <label htmlFor="boq-section-search">Search sections</label><input id="boq-section-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Section name" />
    <p className={styles.muted}>{visible.length} of {sections.length} sections</p>
    <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Section</th><th>Items</th><th>BOQ amount</th><th>Action</th></tr></thead><tbody>{visible.map(section => <tr key={section.id}><th scope="row">{sections.indexOf(section) + 1}. {section.name}</th><td>{section.itemIds.length}</td><td>{peso(section.amount)}</td><td>
      {/* Opens the section's items in a panel on the right instead of leaving the Sections list. */}
      <button type="button" className={styles.link} aria-haspopup="dialog" onClick={event => { opener.current = event.currentTarget; setOpenId(section.id); }}>View items</button>
    </td></tr>)}</tbody></table></div>
    {!visible.length && <p>No sections match this search.</p>}
    {open && <SectionDrawer key={open.id} projectId={projectId} number={sections.indexOf(open) + 1} section={open} items={items} edit={edit} locked={locked} onClose={close} />}
  </section>;
}

type Draft = { itemCode: string; description: string; unit: string; quantity: string; unitCost: string; amount: string };
const toDraft = (item: SectionItem): Draft => ({ itemCode: item.itemCode, description: item.description, unit: item.unit, quantity: String(item.quantity), unitCost: String(item.unitCost), amount: String(item.amount) });
const changed = (item: SectionItem, draft: Draft) => (Object.keys(draft) as (keyof Draft)[]).some(key => draft[key].trim() !== toDraft(item)[key].trim());

function SectionDrawer({ projectId, number, section, items, edit, locked, onClose }: { projectId: string; number: number; section: Section; items: SectionItem[]; edit: SectionEditContext | null; locked: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState('');
  // Edit mode: every field of every item in this section becomes editable; one reason covers the saved changes.
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editReason, setEditReason] = useState('');
  // Delete: tick items with the checkboxes at the start of each row, then Delete → reason → Confirm delete.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const closeButton = useRef<HTMLButtonElement>(null);
  const busyMode = useRef(false);
  useEffect(() => { busyMode.current = editing || confirmDelete; }, [editing, confirmDelete]);

  const byId = new Map(items.map(item => [item.id, item]));
  const rows = section.itemIds.map(id => byId.get(id)).filter((item): item is SectionItem => !!item);
  // Some workbooks put the section name in the item-code column; then the column only repeats the heading, so hide it (except while editing).
  const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
  const showCode = editing || rows.some(item => norm(item.itemCode) && !norm(section.name).includes(norm(item.itemCode)));
  const term = filter.trim().toLowerCase();
  const shown = term ? rows.filter(item => `${item.itemCode} ${item.description} ${item.unit}`.toLowerCase().includes(term)) : rows;
  const shownTotal = shown.reduce((sum, item) => sum + item.amount, 0);
  const selectedRows = rows.filter(item => selected.has(item.id));
  const selectedTotal = selectedRows.reduce((sum, item) => sum + item.amount, 0);
  const changedRows = editing ? rows.filter(item => drafts[item.id] && changed(item, drafts[item.id])) : [];
  const allShownSelected = shown.length > 0 && shown.every(item => selected.has(item.id));

  const cancelModes = useCallback(() => { setEditing(false); setConfirmDelete(false); }, []);
  useEffect(() => {
    // Focus the panel; Esc first leaves edit/delete mode, then closes the panel; the page behind does not scroll.
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key !== 'Escape') return; if (busyMode.current) cancelModes(); else onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose, cancelModes]);

  function startEditing() {
    setDrafts(Object.fromEntries(rows.map(item => [item.id, toDraft(item)])));
    setEditReason(''); setConfirmDelete(false); setError(''); setMessage(''); setEditing(true);
  }
  function setField(id: string, field: keyof Draft, value: string) {
    setDrafts(current => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }
  function toggle(id: string) {
    setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  /**
   * The draft API saves one item per request and returns the BOQ's new checksum, so several changes are sent one
   * after another, each with the latest checksum. Same rules, reasons and history as the BOQ items editor.
   */
  function runSequence(bodies: Record<string, unknown>[], done: (count: number) => string, onFinished: () => void) {
    if (!edit || !bodies.length) return;
    setError(''); setMessage('');
    startTransition(async () => {
      let checksum = edit.checksum, saved = 0;
      try {
        for (const [index, body] of bodies.entries()) {
          const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/boq-draft`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ versionId: edit.versionId, expectedChecksum: checksum, ...(index === 0 ? { expectedReviewRowVersion: edit.reviewRowVersion } : {}), ...body }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(draftWorkflowMessage(data.error));
          if (typeof data.checksum === 'string') checksum = data.checksum;
          saved++;
        }
        setMessage(done(saved)); onFinished();
      } catch (caught) {
        const reason = caught instanceof Error ? caught.message : 'The BOQ could not be saved.';
        setError(saved ? `${saved} of ${bodies.length} saved, then: ${reason}` : reason);
      } finally { router.refresh(); }
    });
  }
  function saveEdits() {
    if (editReason.trim().length < 5) { setError('Type a reason for the change (at least 5 characters).'); return; }
    if (!changedRows.length) { setMessage('No changes to save.'); setEditing(false); return; }
    runSequence(changedRows.map(item => {
      const draft = drafts[item.id];
      return { itemId: item.id, itemCode: draft.itemCode, section: item.category || section.name, description: draft.description, unit: draft.unit,
        quantity: draft.quantity, unitCost: draft.unitCost, amount: draft.amount, editReason: editReason.trim() };
    }), count => `${count} item${count === 1 ? '' : 's'} saved.`, () => setEditing(false));
  }
  function deleteSelected() {
    if (deleteReason.trim().length < 5) { setError('Type a reason for deleting (at least 5 characters).'); return; }
    runSequence(selectedRows.map(item => ({ action: 'remove', itemId: item.id, editReason: deleteReason.trim() })),
      count => `${count} item${count === 1 ? '' : 's'} deleted.`, () => { setConfirmDelete(false); setSelected(new Set()); });
  }

  return <>
    <div className={drawer.backdrop} onClick={() => { if (!editing && !confirmDelete) onClose(); }} aria-hidden="true" />
    <aside className={`${drawer.drawer} ${editing ? drawer.drawerWide : ''}`} role="dialog" aria-modal="true" aria-labelledby="boq-section-drawer-title">
      <header className={drawer.header}>
        <div className={drawer.headerText}>
          <h3 id="boq-section-drawer-title">{number}. {section.name}</h3>
          <div className={drawer.metaRow}>
            <p className={drawer.meta}>{rows.length} item{rows.length === 1 ? '' : 's'} · {peso(section.amount)}</p>
            {edit && <div className={drawer.toolbar}>
              {editing ? <>
                <button type="button" className={drawer.primary} disabled={pending || editReason.trim().length < 5} onClick={saveEdits}>{pending ? 'Saving…' : `Save changes${changedRows.length ? ` (${changedRows.length})` : ''}`}</button>
                <button type="button" className={drawer.actionButton} disabled={pending} onClick={() => setEditing(false)}>Cancel</button>
              </> : <>
                <button type="button" className={drawer.actionButton} disabled={pending || confirmDelete || !rows.length} onClick={startEditing}>Edit</button>
                <button type="button" className={`${drawer.actionButton} ${drawer.danger}`} disabled={pending || !selected.size || confirmDelete} title={selected.size ? undefined : 'Tick the items to delete first'} onClick={() => { setDeleteReason(''); setError(''); setMessage(''); setConfirmDelete(true); }}>Delete{selected.size ? ` (${selected.size})` : ''}</button>
              </>}
            </div>}
          </div>
        </div>
        <button ref={closeButton} type="button" className={drawer.close} aria-label="Close section items" onClick={onClose}>✕</button>
      </header>
      {editing && <div className={drawer.modeBar}>
        <label>Reason for the change (5–300 characters)<input autoFocus required minLength={5} maxLength={300} disabled={pending} placeholder="e.g. Units corrected to match the signed BOQ" value={editReason} onChange={event => setEditReason(event.target.value)} /></label>
        <p className={drawer.hint}>All fields are editable. Only items you change are saved. The amount is kept as entered; changing the quantity or rate does not recalculate it.</p>
      </div>}
      {confirmDelete && <div className={`${drawer.modeBar} ${drawer.deleteBar}`}>
        <p>Delete {selectedRows.length} selected item{selectedRows.length === 1 ? '' : 's'} from the draft BOQ? The section and BOQ totals go down by {peso(selectedTotal)}. The deletion and its reason stay in the BOQ history.</p>
        <label>Reason for deleting (5–300 characters)<input autoFocus minLength={5} maxLength={300} disabled={pending} placeholder="e.g. Duplicate lines from the workbook" value={deleteReason} onChange={event => setDeleteReason(event.target.value)} /></label>
        <div className={drawer.formButtons}>
          <button type="button" className={`${drawer.primary} ${drawer.dangerFill}`} disabled={pending || deleteReason.trim().length < 5} onClick={deleteSelected}>{pending ? 'Deleting…' : 'Confirm delete'}</button>
          <button type="button" className={drawer.actionButton} disabled={pending} onClick={() => setConfirmDelete(false)}>Cancel</button>
        </div>
      </div>}
      <div className={drawer.tools}>
        <input id="boq-section-drawer-search" aria-label="Search items in this section" type="search" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Search item code, description or unit" />
      </div>
      {(error || message || (!edit && locked)) && <div className={drawer.notices}>
        {error && <p role="alert" className={drawer.error}>{error}</p>}
        {message && <p role="status" className={drawer.success}>{message}</p>}
        {!edit && locked && <p className={drawer.note}>This BOQ is approved and locked. Item changes need an authorized BOQ revision.</p>}
      </div>}
      <div className={drawer.body} role="region" aria-label={`Items in ${section.name}`} tabIndex={0}>
        {shown.length ? <table className={drawer.table}>
          <thead><tr>
            {/* Selection checkbox is the first column, at the start of each item. */}
            {edit && <th className={drawer.checkCell}><input type="checkbox" aria-label="Select all items shown" disabled={pending || editing} checked={allShownSelected} onChange={() => setSelected(current => { const next = new Set(current); if (allShownSelected) shown.forEach(item => next.delete(item.id)); else shown.forEach(item => next.add(item.id)); return next; })} /></th>}
            {showCode && <th>Item</th>}<th>Description</th><th>Unit</th><th className={drawer.num}>Quantity</th><th className={drawer.num}>Unit rate</th><th className={drawer.num}>Amount</th>
          </tr></thead>
          <tbody>{shown.map(item => {
            const draft = drafts[item.id];
            const isChanged = editing && draft && changed(item, draft);
            return <tr key={item.id} className={selected.has(item.id) ? drawer.selectedRow : isChanged ? drawer.changedRow : undefined}>
              {edit && <td className={drawer.checkCell}><input type="checkbox" aria-label={`Select ${item.description.slice(0, 60)}`} disabled={pending || editing} checked={selected.has(item.id)} onChange={() => toggle(item.id)} /></td>}
              {editing && draft ? <>
                {showCode && <td><input className={`${drawer.cellInput} ${drawer.codeInput}`} aria-label="Item code" maxLength={191} disabled={pending} value={draft.itemCode} onChange={event => setField(item.id, 'itemCode', event.target.value)} /></td>}
                <td><textarea className={drawer.cellInput} aria-label="Description" rows={2} disabled={pending} value={draft.description} onChange={event => setField(item.id, 'description', event.target.value)} /></td>
                <td><input className={`${drawer.cellInput} ${drawer.narrow}`} aria-label="Unit" disabled={pending} value={draft.unit} onChange={event => setField(item.id, 'unit', event.target.value)} /></td>
                <td><input className={`${drawer.cellInput} ${drawer.numInput}`} aria-label="Quantity" type="number" min="0" step="any" disabled={pending} value={draft.quantity} onChange={event => setField(item.id, 'quantity', event.target.value)} /></td>
                <td><input className={`${drawer.cellInput} ${drawer.numInput}`} aria-label="Unit rate" type="number" min="0" step="0.01" disabled={pending} value={draft.unitCost} onChange={event => setField(item.id, 'unitCost', event.target.value)} /></td>
                <td><input className={`${drawer.cellInput} ${drawer.numInput}`} aria-label="Amount" type="number" min="0" step="0.01" disabled={pending} value={draft.amount} onChange={event => setField(item.id, 'amount', event.target.value)} /></td>
              </> : <>
                {showCode && <td className={drawer.code}>{item.itemCode}</td>}<td>{item.description}</td><td>{item.unit}</td>
                <td className={drawer.num}>{quantity(item.quantity)}</td><td className={drawer.num}>{peso(item.unitCost)}</td><td className={drawer.num}>{peso(item.amount)}</td>
              </>}
            </tr>;
          })}</tbody>
        </table> : <p className={drawer.empty}>{rows.length ? 'No items match this search.' : 'This section has no items.'}</p>}
      </div>
      <footer className={drawer.footer}>
        <span>{selected.size ? `${selected.size} selected · ${peso(selectedTotal)}` : term ? `Showing ${shown.length} of ${rows.length} · ${peso(shownTotal)}` : `Section total · ${peso(section.amount)}`}</span>
        <Link href={`/projects/${projectId}/boq?view=items&section=${encodeURIComponent(section.id)}`}>Open in BOQ items →</Link>
      </footer>
    </aside>
  </>;
}
