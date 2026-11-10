'use client';

import { useEffect, useRef, useState } from 'react';
import styles from '../planning/planning.module.css';
import drop from './bulk-dupa-upload.module.css';
import { FileSpreadsheet, Pencil, Trash2, UploadCloud } from 'lucide-react';
import AiThinking from '@/components/ai/AiThinking';
import { reconcileDupa, type BoqMatch, type DupaReconciliation, type MatchableBoqItem } from '@/lib/scheduling/dupa-boq-match';

/**
 * Upload many DUPAs at once. A file may hold one DUPA or many (one per worksheet, or several stacked in one
 * worksheet). Every DUPA found is read, then an AI check suggests the work package and the original BOQ items it
 * prices. Accept or change each suggestion, then upload one DUPA at a time or all of them. Uploaded DUPAs are saved
 * as "uploaded, not applied yet": package costs change only when applied on the package's DUPA tab.
 */
type Pkg = { id: string; code: string | null; name: string; value: number };
type BoqLink = { id: string; itemCode: string; description: string };
type PlanPackage = Pkg & { boqItems: BoqLink[] };
type Reading = {
  key: string; fileName: string; sheetName: string; title: string; titleLines: string[]; firstRow: number | null; lastRow: number | null;
  componentCount: number; total: number; components: string[]; errors: string[];
  suggestion: { packageId: string; confidence: 'high' | 'medium' | 'low'; reason: string; boqItems: BoqLink[]; source: 'ai' | 'built-in' };
  boqMatch: BoqMatch; reconciliation: DupaReconciliation; referenceQuantity: number | null; duplicateOf: string | null; duplicateActivityId: string | null; duplicateUploadId: string | null; duplicateApplied: boolean; signature: string;
};
type ProjectBoqItem = MatchableBoqItem & BoqLink;
type Entry = Reading & { file: File; activityId: string; boqItemIds: string[]; state: 'ready' | 'saving' | 'saved' | 'failed'; note: string };

const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
const READING = ['Opening the files', 'Finding every DUPA in each file', 'Reading the components', 'Matching each DUPA to a package and its BOQ items'];
const CONFIDENCE: Record<string, { label: string; color: string }> = {
  high: { label: 'Strong match', color: '#6ee7b7' }, medium: { label: 'Likely match', color: '#93c5fd' }, low: { label: 'Check this', color: '#fcd34d' },
};

export default function BulkDupaUpload({ projectId, scheduleId, rowVersion, packages, onSaved, onOpenDupa }: {
  projectId: string; scheduleId: string; rowVersion: number; packages: Pkg[]; onSaved: () => void; onOpenDupa: (activityId: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const version = useRef(rowVersion);
  useEffect(() => { version.current = Math.max(version.current, rowVersion); }, [rowVersion]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [planPackages, setPlanPackages] = useState<PlanPackage[]>([]);
  const [boqItems, setBoqItems] = useState<ProjectBoqItem[]>([]);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [aiNote, setAiNote] = useState('');
  const [using, setUsing] = useState(false);
  const [confirmUse, setConfirmUse] = useState(false);
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/work-packages/breakdown`;
  const busy = reading || saving || using;

  async function read(files: FileList | null) {
    const list = [...(files ?? [])];
    if (!list.length) return;
    setError(''); setProblems([]); setAiNote(''); setEntries([]); setReading(true);
    const found: Entry[] = [];
    const issues: string[] = [];
    let note = '';
    // One request per file keeps each request small and shows partial results if one file fails.
    for (const file of list) {
      try {
        const body = new FormData();
        body.set('action', 'bulk-read'); body.set('scheduleId', scheduleId); body.append('file', file);
        const response = await fetch(endpoint, { method: 'POST', body });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'The file could not be read.');
        setPlanPackages(data.packages ?? []);
        setBoqItems(data.boqItems ?? []);
        issues.push(...(data.problems ?? []));
        // Only a file that had DUPAs says whether the AI was used (an unreadable file never reaches it).
        if (data.readings?.length && data.ai?.status !== 'used' && data.ai?.message) note = data.ai.message;
        for (const reading of data.readings as Reading[]) {
          // The same DUPA in another file of this upload (each file is read in its own request).
          const earlier = found.find(entry => entry.signature === reading.signature);
          const duplicateOf = reading.duplicateOf ?? (earlier ? `${earlier.fileName} · ${earlier.sheetName}, in this upload` : null);
          // A duplicate starts without a package, so "Upload all" skips it; it can still be chosen on purpose.
          found.push({ ...reading, duplicateOf, file, activityId: duplicateOf ? '' : reading.suggestion.packageId, boqItemIds: reading.suggestion.boqItems.map(item => item.id),
            state: 'ready', note: duplicateOf ? '' : reading.errors.length ? reading.errors[0] : '' });
        }
        setEntries([...found]);
      } catch (cause) {
        issues.push(`${file.name}: ${cause instanceof Error ? cause.message : 'could not be read.'}`);
      }
    }
    setProblems(issues); setAiNote(note); setReading(false);
  }

  const update = (key: string, patch: Partial<Entry>) => setEntries(current => current.map(entry => entry.key === key ? { ...entry, ...patch } : entry));

  async function save(keys: string[]) {
    if (busy) return;
    const chosen = entries.filter(entry => keys.includes(entry.key) && entry.state !== 'saved');
    if (chosen.some(entry => !entry.activityId)) { setError('Choose the package for every DUPA you upload, or skip it.'); return; }
    setSaving(true); setError('');
    const byFile = new Map<File, Entry[]>();
    chosen.forEach(entry => byFile.set(entry.file, [...(byFile.get(entry.file) ?? []), entry]));
    for (const [file, group] of byFile) {
      group.forEach(entry => update(entry.key, { state: 'saving', note: 'Saving…' }));
      try {
        const body = new FormData();
        body.set('action', 'bulk-save'); body.set('scheduleId', scheduleId); body.set('expectedRowVersion', String(version.current)); body.append('file', file);
        body.set('selections', JSON.stringify(group.map(entry => ({ key: entry.key, activityId: entry.activityId, boqItemIds: entry.boqItemIds }))));
        const response = await fetch(endpoint, { method: 'POST', body });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'The DUPAs could not be saved.');
        version.current = data.rowVersion ?? version.current;
        for (const result of data.results as Array<{ key: string; ok: boolean; message: string }>) update(result.key, { state: result.ok ? 'saved' : 'failed', note: result.message });
      } catch (cause) {
        group.forEach(entry => update(entry.key, { state: 'failed', note: cause instanceof Error ? cause.message : 'Upload failed.' }));
      }
    }
    setSaving(false);
    onSaved();
  }

  const pending = entries.filter(entry => entry.state !== 'saved');
  const ready = pending.filter(entry => entry.activityId);
  // Read DUPAs that are already uploaded (and not yet used) under a package: they can be used for those packages.
  const usable = entries.filter(entry => entry.state === 'ready' && entry.duplicateUploadId && !entry.duplicateApplied)
    .filter((entry, index, all) => all.findIndex(other => other.duplicateUploadId === entry.duplicateUploadId) === index);
  const usablePackages = new Set(usable.map(entry => entry.duplicateActivityId)).size;
  async function applyToPackages() {
    if (!usable.length || busy) return;
    setUsing(true); setError('');
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/work-packages/details`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'use-dupas', scheduleId, expectedRowVersion: version.current, uploadIds: usable.map(entry => entry.duplicateUploadId) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The DUPAs could not be used.');
      if (data.rowVersion) version.current = data.rowVersion;
      const byUpload = new Map((data.results as Array<{ uploadId: string; ok: boolean; message: string }>).map(result => [result.uploadId, result]));
      setEntries(current => current.map(entry => {
        const result = entry.duplicateUploadId ? byUpload.get(entry.duplicateUploadId) : undefined;
        if (!result) return entry;
        return result.ok ? { ...entry, state: 'saved', activityId: entry.duplicateActivityId ?? entry.activityId, duplicateApplied: true, note: `Used for the package. ${result.message}` }
          : { ...entry, state: 'failed', note: result.message };
      }));
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The DUPAs could not be used.'); }
    finally { setUsing(false); setConfirmUse(false); }
  }
  const fileCount = new Set(entries.map(entry => entry.fileName)).size;
  const boqById = new Map(boqItems.map(item => [item.id, item]));
  // Live reconciliation for the BOQ items currently linked (the reviewer may change them).
  const reconcile = (entry: Entry) => reconcileDupa(entry.total, entry.boqItemIds.map(id => boqById.get(id)).filter((item): item is ProjectBoqItem => !!item), entry.referenceQuantity);
  const MATCH: Record<BoqMatch['status'], { label: string; color: string }> = {
    matched: { label: 'BOQ item matched', color: '#6ee7b7' }, ambiguous: { label: 'Several BOQ items fit · choose', color: '#fcd34d' }, unmatched: { label: 'No BOQ item found · choose', color: '#fca5a5' },
  };

  return <section className={styles.panel} aria-labelledby="bulk-dupa-heading">
    <h3 id="bulk-dupa-heading" className={drop.srOnly}>Upload DUPAs</h3>
    {/* Same centered drop area as the BOQ Workspace upload: click to choose files or drop them here. */}
    <div className={`${drop.dropzone} ${dragging ? drop.dragging : ''}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!busy) void read(event.dataTransfer.files); }}>
      <span className={drop.icon} aria-hidden="true"><UploadCloud size={28} /></span>
      <strong className={drop.title}>Drop DUPA files here</strong>
      <span className={drop.meta}>Excel, PDF, Word or images · many DUPAs per file</span>
      <label className={drop.button}><FileSpreadsheet size={18} aria-hidden="true" /> Choose files
        <input ref={input} className={drop.input} type="file" multiple aria-label="Choose DUPA files" accept=".xlsx,.xls,.csv,.tsv,.pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" disabled={busy} onChange={event => void read(event.target.files)} />
      </label>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {reading && <div style={{ marginTop: 12 }}><AiThinking messages={READING} note="Matching each DUPA to its package." /></div>}
    {problems.length > 0 && <ul role="status" style={{ color: '#fcd34d', marginTop: 10 }}>{problems.map(problem => <li key={problem}>{problem}</li>)}</ul>}
    {entries.length > 0 && <>
      <p role="status" className={styles.muted} style={{ marginTop: 12 }}>
        Found <strong>{entries.length} DUPA{entries.length === 1 ? '' : 's'}</strong> in {fileCount} file{fileCount === 1 ? '' : 's'}; {entries.filter(entry => entry.suggestion.packageId).length} linked to a package by the {entries.some(entry => entry.suggestion.source === 'ai') ? 'AI check' : 'built-in matcher'}.
        {aiNote && <> {aiNote}</>}
      </p>
      <div className={styles.scroll} role="region" aria-label="DUPAs found" tabIndex={0} style={{ marginTop: 8 }}><table className={styles.table}>
        <thead><tr><th>DUPA</th><th>Package and BOQ items</th><th>DUPA vs BOQ</th><th>Status</th></tr></thead>
        <tbody>{entries.map(entry => {
          const packageItems = planPackages.find(item => item.id === entry.activityId)?.boqItems ?? [];
          // The package's items, plus BOQ items from other packages that this DUPA matched or already links to.
          const extra = [...entry.boqMatch.items.map(match => match.id), ...entry.boqItemIds].filter((id, index, all) => all.indexOf(id) === index && !packageItems.some(item => item.id === id))
            .map(id => boqById.get(id)).filter((item): item is ProjectBoqItem => !!item);
          const boqChoices: Array<BoqLink & { other?: boolean }> = [...packageItems, ...extra.map(item => ({ id: item.id, itemCode: item.itemCode, description: item.description, other: true }))];
          const check = reconcile(entry);
          // Once BOQ items are linked (by the matcher, the AI or the reviewer) say so; "choose" only when none is linked.
          const match = entry.boqItemIds.length
            ? { label: `Linked to ${entry.boqItemIds.length} BOQ item${entry.boqItemIds.length === 1 ? '' : 's'}`, color: '#6ee7b7' }
            : MATCH[entry.boqMatch.status === 'matched' ? 'unmatched' : entry.boqMatch.status];
          const suggested = entry.suggestion.packageId === entry.activityId && entry.activityId;
          const confidence = CONFIDENCE[entry.suggestion.confidence];
          const locked = busy || entry.state === 'saved';
          return <tr key={entry.key}>
            <th scope="row" style={{ verticalAlign: 'top', minWidth: 220 }}>
              <div>{entry.title}</div>
              <div className={styles.muted} style={{ fontWeight: 400, fontSize: 12 }}>{entry.fileName} · {entry.sheetName}{entry.firstRow ? ` rows ${entry.firstRow}–${entry.lastRow}` : ''} · {entry.componentCount} component{entry.componentCount === 1 ? '' : 's'}</div>
              {entry.components.length > 0 && <div className={styles.muted} style={{ fontWeight: 400, fontSize: 12 }}>{entry.components.slice(0, 4).join(', ')}{entry.components.length > 4 ? '…' : ''}</div>}
            </th>
            <td style={{ verticalAlign: 'top', minWidth: 300, maxWidth: 440, whiteSpace: 'normal' }}>
              <select aria-label={`Package for ${entry.title}`} value={entry.activityId} disabled={locked}
                onChange={event => { const activityId = event.target.value; update(entry.key, { activityId, boqItemIds: activityId === entry.suggestion.packageId ? entry.suggestion.boqItems.map(item => item.id) : [] }); }}>
                <option value="">Skip / choose package</option>
                {(planPackages.length ? planPackages : packages).map(item => <option key={item.id} value={item.id}>{item.code ? `${item.code} · ` : ''}{item.name}{item.id === entry.suggestion.packageId ? ' (suggested)' : ''}</option>)}
              </select>
              {suggested && <div style={{ fontSize: 12, marginTop: 4 }}><span style={{ color: confidence.color, fontWeight: 600 }}>{entry.suggestion.source === 'ai' ? 'AI suggested' : 'Suggested'} · {confidence.label}</span> <span className={styles.muted}>{entry.suggestion.reason}</span></div>}
              {!entry.suggestion.packageId && <div style={{ fontSize: 12, marginTop: 4, color: '#fcd34d' }}>{entry.suggestion.reason}</div>}
              <div style={{ fontSize: 12, marginTop: 4, color: match.color }}>{match.label}</div>
              {entry.activityId && boqChoices.length > 0 && <details style={{ fontSize: 12, marginTop: 6 }} open={entry.boqItemIds.length > 0}>
                <summary>Linked BOQ items · {entry.boqItemIds.length} of {boqChoices.length}</summary>
                <div style={{ maxHeight: 140, overflowY: 'auto', marginTop: 4 }}>{boqChoices.map(item => <label key={item.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <input type="checkbox" disabled={locked} checked={entry.boqItemIds.includes(item.id)}
                    onChange={event => update(entry.key, { boqItemIds: event.target.checked ? [...entry.boqItemIds, item.id] : entry.boqItemIds.filter(id => id !== item.id) })} />
                  <span>{item.itemCode} {item.description}{item.other && <span className={styles.muted}> · other package</span>}</span>
                </label>)}</div>
              </details>}
            </td>
            <td style={{ verticalAlign: 'top', whiteSpace: 'normal', minWidth: 190, fontSize: 13 }}>
              <div>{money(check.dupaAmount)}{check.boqAmount ? ` vs ${money(check.boqAmount)}` : ''}</div>
              <div style={{ fontSize: 12, color: check.reconciles ? '#6ee7b7' : '#fcd34d' }}>
                {check.reconciles ? '✓ Reconciles' : check.basis === 'unclear' && !entry.boqItemIds.length ? 'Link a BOQ item to compare' : `Differs by ${money(Math.abs(check.difference))}`}
                {check.basis === 'per-unit' && <span className={styles.muted}> · per unit, × BOQ qty</span>}
              </div>
            </td>
            <td style={{ verticalAlign: 'top', minWidth: 180, maxWidth: 260, whiteSpace: 'normal' }}>
              {entry.state === 'saved' ? <span style={{ color: '#6ee7b7' }}>✓ {entry.note} <button type="button" className={styles.link} onClick={() => onOpenDupa(entry.activityId)}>Open DUPA</button></span>
                : entry.state === 'saving' ? 'Saving…'
                // Already uploaded: no warning text, just edit (open the uploaded copy) and remove (drop it from this list).
                : entry.duplicateOf && entry.state === 'ready' ? <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className={styles.secondary} style={{ padding: 8, minHeight: 0 }} disabled={busy || !entry.duplicateActivityId} title={`Already uploaded: ${entry.duplicateOf}. Open it.`} aria-label={`Edit the uploaded copy of ${entry.title}`} onClick={() => entry.duplicateActivityId && onOpenDupa(entry.duplicateActivityId)}><Pencil size={16} aria-hidden="true" /></button>
                  <button type="button" className={styles.secondary} style={{ padding: 8, minHeight: 0 }} disabled={busy} title="Remove from this list" aria-label={`Remove ${entry.title} from this list`} onClick={() => setEntries(current => current.filter(item => item.key !== entry.key))}><Trash2 size={16} aria-hidden="true" /></button>
                </div>
                : <>
                  {entry.note && <div style={{ color: entry.state === 'failed' ? '#fca5a5' : '#fcd34d', fontSize: 12, marginBottom: 6 }}>{entry.note}</div>}
                  <button type="button" className={styles.secondary} disabled={busy || !entry.activityId} onClick={() => void save([entry.key])}>Upload this DUPA</button>
                </>}
            </td>
          </tr>;
        })}</tbody>
      </table></div>
      <div className={styles.actions} style={{ marginTop: 12 }}>
        <button type="button" className={styles.button} disabled={busy || !ready.length} onClick={() => void save(ready.map(entry => entry.key))}>{saving ? 'Uploading…' : `Upload all ${ready.length} DUPA${ready.length === 1 ? '' : 's'}`}</button>
        {/* DUPAs already uploaded but not used yet: use them for the packages they are under (replaces those packages'
            generated allowances; asks once to confirm). */}
        {usable.length > 0 && <button type="button" className={styles.button} disabled={busy} onClick={() => { if (!confirmUse) { setConfirmUse(true); return; } void applyToPackages(); }}>
          {using ? 'Using the DUPAs…' : confirmUse ? `Confirm: replace the allowances of ${usablePackages} package${usablePackages === 1 ? '' : 's'}` : `Use ${usable.length} DUPA${usable.length === 1 ? '' : 's'} for their packages`}
        </button>}
        {confirmUse && !using && <button type="button" className={styles.secondary} onClick={() => setConfirmUse(false)}>Cancel</button>}
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setEntries([]); setProblems([]); setAiNote(''); setConfirmUse(false); if (input.current) input.current.value = ''; }}>Clear</button>
        {pending.length > ready.length + usable.length && <span className={styles.muted}>{pending.length - ready.length - usable.length} without a package will be skipped.</span>}
      </div>
    </>}
  </section>;
}
