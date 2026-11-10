'use client';

import { useEffect, useRef, useState } from 'react';
import styles from '../planning/planning.module.css';
import AiThinking from '@/components/ai/AiThinking';

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
};
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
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [aiNote, setAiNote] = useState('');
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/work-packages/breakdown`;
  const busy = reading || saving;

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
        issues.push(...(data.problems ?? []));
        if (data.ai?.status !== 'used' && data.ai?.message) note = data.ai.message;
        for (const reading of data.readings as Reading[]) {
          found.push({ ...reading, file, activityId: reading.suggestion.packageId, boqItemIds: reading.suggestion.boqItems.map(item => item.id),
            state: 'ready', note: reading.errors.length ? reading.errors[0] : '' });
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

  const pkgOf = (id: string) => planPackages.find(item => item.id === id) ?? packages.find(item => item.id === id);
  const pending = entries.filter(entry => entry.state !== 'saved');
  const ready = pending.filter(entry => entry.activityId);
  const fileCount = new Set(entries.map(entry => entry.fileName)).size;

  return <section className={styles.panel} aria-labelledby="bulk-dupa-heading">
    <h3 id="bulk-dupa-heading">Upload DUPAs with AI</h3>
    <p className={styles.muted}>Choose one or more files. A file can hold many DUPAs (one per sheet or several in one sheet); each one is read and an AI check suggests its work package and the original BOQ items it prices. Accept or change each suggestion, then upload one at a time or all. Costs change only when you apply a DUPA on the package’s DUPA tab.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <input ref={input} type="file" multiple aria-label="Choose DUPA files" accept=".xlsx,.xls,.csv,.tsv,.pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" disabled={busy} onChange={event => void read(event.target.files)} />
    {reading && <div style={{ marginTop: 12 }}><AiThinking messages={READING} note="Reading every DUPA and checking it against the packages from the awarded BOQ." /></div>}
    {problems.length > 0 && <ul role="status" style={{ color: '#fcd34d', marginTop: 10 }}>{problems.map(problem => <li key={problem}>{problem}</li>)}</ul>}
    {entries.length > 0 && <>
      <p role="status" className={styles.muted} style={{ marginTop: 12 }}>
        Found <strong>{entries.length} DUPA{entries.length === 1 ? '' : 's'}</strong> in {fileCount} file{fileCount === 1 ? '' : 's'}; {entries.filter(entry => entry.suggestion.packageId).length} linked to a package by the {entries.some(entry => entry.suggestion.source === 'ai') ? 'AI check' : 'built-in matcher'}.
        {aiNote && <> {aiNote}</>}
      </p>
      <div className={styles.scroll} role="region" aria-label="DUPAs found" tabIndex={0} style={{ marginTop: 8 }}><table className={styles.table}>
        <thead><tr><th>DUPA</th><th>Suggested package and BOQ items</th><th>DUPA total vs package BOQ value</th><th>Status</th></tr></thead>
        <tbody>{entries.map(entry => {
          const target = pkgOf(entry.activityId);
          const share = target && target.value > 0 ? entry.total / target.value * 100 : null;
          const boqChoices = planPackages.find(item => item.id === entry.activityId)?.boqItems ?? [];
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
              {entry.activityId && boqChoices.length > 0 && <details style={{ fontSize: 12, marginTop: 6 }} open={entry.boqItemIds.length > 0}>
                <summary>Linked BOQ items · {entry.boqItemIds.length} of {boqChoices.length}</summary>
                <div style={{ maxHeight: 140, overflowY: 'auto', marginTop: 4 }}>{boqChoices.map(item => <label key={item.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <input type="checkbox" disabled={locked} checked={entry.boqItemIds.includes(item.id)}
                    onChange={event => update(entry.key, { boqItemIds: event.target.checked ? [...entry.boqItemIds, item.id] : entry.boqItemIds.filter(id => id !== item.id) })} />
                  <span>{item.itemCode} {item.description}</span>
                </label>)}</div>
              </details>}
            </td>
            <td style={{ verticalAlign: 'top', whiteSpace: 'normal', minWidth: 150 }}>{money(entry.total)}{target ? ` vs ${money(target.value)}` : ''}{share !== null && <span style={{ color: Math.abs(share - 100) > 5 ? '#fcd34d' : '#6ee7b7' }}> ({share.toFixed(1)}%)</span>}</td>
            <td style={{ verticalAlign: 'top', minWidth: 180, maxWidth: 260, whiteSpace: 'normal' }}>
              {entry.state === 'saved' ? <span style={{ color: '#6ee7b7' }}>✓ {entry.note} <button type="button" className={styles.link} onClick={() => onOpenDupa(entry.activityId)}>Open DUPA</button></span>
                : entry.state === 'saving' ? 'Saving…'
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
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setEntries([]); setProblems([]); setAiNote(''); if (input.current) input.current.value = ''; }}>Clear</button>
        {pending.length > ready.length && <span className={styles.muted}>{pending.length - ready.length} without a package will be skipped.</span>}
      </div>
    </>}
  </section>;
}
