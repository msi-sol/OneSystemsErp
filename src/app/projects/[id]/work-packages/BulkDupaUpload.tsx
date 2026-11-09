'use client';

import { useRef, useState } from 'react';
import styles from '../planning/planning.module.css';
import { matchPackage } from '@/lib/scheduling/dupa-file-match';

/**
 * Upload several DUPAs at once (minutes 2026-11-09: bulk upload in addition to per-package upload). Each file is
 * matched to a package by its code or name in the file name (changeable), then read and preserved exactly like the
 * per-package upload. Files that read cleanly are saved as "uploaded, not applied yet"; files with reading problems
 * are listed to finish on that package's DUPA tab. Nothing changes package costs until applied there.
 */
type Pkg = { id: string; code: string | null; name: string; value: number };
type Entry = { file: File; activityId: string; state: 'waiting' | 'reading' | 'saved' | 'needs-review' | 'failed'; note: string; total?: number };

const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);

export default function BulkDupaUpload({ projectId, scheduleId, rowVersion, packages, onSaved, onOpenDupa }: {
  projectId: string; scheduleId: string; rowVersion: number; packages: Pkg[]; onSaved: () => void; onOpenDupa: (activityId: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/work-packages/breakdown`;
  const update = (index: number, patch: Partial<Entry>) => setEntries(current => current.map((entry, i) => i === index ? { ...entry, ...patch } : entry));

  function choose(files: FileList | null) {
    setError('');
    setEntries([...(files ?? [])].map(file => ({ file, activityId: matchPackage(file.name, packages), state: 'waiting', note: '' })));
  }

  async function uploadAll() {
    if (busy) return;
    if (entries.some(entry => !entry.activityId)) { setError('Choose the package for every file first.'); return; }
    setBusy(true); setError('');
    let version = rowVersion;
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (entry.state === 'saved') continue;
      update(index, { state: 'reading', note: 'Reading…' });
      try {
        const analyzeBody = new FormData();
        analyzeBody.set('file', entry.file); analyzeBody.set('action', 'analyze');
        analyzeBody.set('scheduleId', scheduleId); analyzeBody.set('activityId', entry.activityId); analyzeBody.set('expectedRowVersion', String(version));
        const read = await fetch(endpoint, { method: 'POST', body: analyzeBody });
        const reading = await read.json();
        if (!read.ok) throw new Error(reading.error || 'The file could not be read.');
        const analysis = reading.analysis;
        const total = Number(analysis?.total || 0);
        if (analysis?.errors?.length || !reading.rows?.length) {
          update(index, { state: 'needs-review', total, note: analysis?.errors?.length ? `${analysis.errors.length} reading issue${analysis.errors.length === 1 ? '' : 's'}; finish it on the package's DUPA tab.` : 'No cost rows were found; check the worksheet and columns on the package\'s DUPA tab.' });
          continue;
        }
        const saveBody = new FormData();
        saveBody.set('file', entry.file); saveBody.set('action', 'preserve');
        saveBody.set('scheduleId', scheduleId); saveBody.set('activityId', entry.activityId); saveBody.set('expectedRowVersion', String(version));
        if (analysis.selectedSheet) saveBody.set('sheetName', analysis.selectedSheet);
        if (analysis.mapping) saveBody.set('mapping', JSON.stringify(analysis.mapping));
        saveBody.set('fileHash', analysis.fileHash);
        if (analysis.documentToken) saveBody.set('documentToken', analysis.documentToken);
        const saved = await fetch(endpoint, { method: 'POST', body: saveBody });
        const result = await saved.json();
        if (!saved.ok) throw new Error(result.error || 'The DUPA could not be saved.');
        version = result.rowVersion ?? version + 1;
        update(index, { state: 'saved', total, note: `${reading.rows.length} rows saved. Apply it on the package's DUPA tab.` });
      } catch (cause) {
        update(index, { state: 'failed', note: cause instanceof Error ? cause.message.replaceAll('_', ' ').toLowerCase() : 'Upload failed.' });
      }
    }
    setBusy(false);
    onSaved();
  }

  const pkg = (id: string) => packages.find(item => item.id === id);
  return <section className={styles.panel} aria-labelledby="bulk-dupa-heading">
    <h3 id="bulk-dupa-heading">Upload several DUPAs</h3>
    <p className={styles.muted}>Choose one DUPA file per package. Each file is matched to a package by the package code or name in its file name; change it if needed. Files are saved as uploaded, not applied: costs change only when you apply them on the package’s DUPA tab.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <input ref={input} type="file" multiple aria-label="Choose DUPA files" accept=".xlsx,.xls,.csv,.tsv,.pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" disabled={busy} onChange={event => choose(event.target.files)} />
    {entries.length > 0 && <>
      <div className={styles.scroll} role="region" aria-label="DUPA files to upload" tabIndex={0} style={{ marginTop: 12 }}><table className={styles.table}>
        <thead><tr><th>File</th><th>Package</th><th>DUPA total vs package BOQ value</th><th>Status</th></tr></thead>
        <tbody>{entries.map((entry, index) => {
          const target = pkg(entry.activityId);
          const share = target && target.value > 0 && entry.total !== undefined ? entry.total / target.value * 100 : null;
          return <tr key={`${entry.file.name}-${index}`}>
            <th scope="row">{entry.file.name}</th>
            <td><select aria-label={`Package for ${entry.file.name}`} value={entry.activityId} disabled={busy || entry.state === 'saved'} onChange={event => update(index, { activityId: event.target.value })}>
              <option value="">Choose package</option>
              {packages.map(item => <option key={item.id} value={item.id}>{item.code ? `${item.code} · ` : ''}{item.name}</option>)}
            </select></td>
            <td>{entry.total === undefined ? '—' : <>{money(entry.total)}{target ? ` vs ${money(target.value)}` : ''}{share !== null && <span style={{ color: Math.abs(share - 100) > 5 ? '#fcd34d' : '#6ee7b7' }}> ({share.toFixed(1)}%)</span>}</>}</td>
            <td>{entry.state === 'waiting' ? 'Ready' : entry.state === 'reading' ? 'Reading…' : entry.state === 'saved' ? <span style={{ color: '#6ee7b7' }}>✓ {entry.note}</span> : <span style={{ color: entry.state === 'failed' ? '#fca5a5' : '#fcd34d' }}>{entry.note} {entry.activityId && <button type="button" className={styles.link} onClick={() => onOpenDupa(entry.activityId)}>Open DUPA</button>}</span>}</td>
          </tr>;
        })}</tbody>
      </table></div>
      <div className={styles.actions} style={{ marginTop: 12 }}>
        <button type="button" className={styles.button} disabled={busy || entries.every(entry => entry.state === 'saved')} onClick={() => void uploadAll()}>{busy ? 'Uploading…' : `Upload ${entries.filter(entry => entry.state !== 'saved').length} DUPA file${entries.filter(entry => entry.state !== 'saved').length === 1 ? '' : 's'}`}</button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => { setEntries([]); if (input.current) input.current.value = ''; }}>Clear</button>
      </div>
    </>}
  </section>;
}
