'use client';

import { useState } from 'react';
import AiThinking, { AI_THINKING_MESSAGES } from '@/components/ai/AiThinking';
import styles from '../planning/planning.module.css';

/**
 * AI Check for one uploaded DUPA: compares it with the package's BOQ items and value and suggests each row's
 * category, or leaving a row out. Every suggestion can be edited, saved one by one, saved all at once, or removed.
 * Saving only fills in the choices for applying this DUPA; nothing is applied until "Use this DUPA" / "Add".
 */
export type DupaChoice = { row: string; kind: 'category' | 'remove'; proposed: string };
type Insight = { severity: 'issue' | 'warning' | 'info'; title: string; detail: string; refs: { id: string; label: string }[] };
type Suggestion = { id: string; row: string; description: string; amount: number; kind: 'category' | 'remove'; current: string; proposed: string; reason: string };
type Result = { model: string; summary: string; insights: Insight[]; suggestions: Suggestion[]; packageValue: number; dupaTotal: number };

const KINDS = ['MATERIAL', 'LABOR', 'EQUIPMENT'] as const;
const KIND_LABEL: Record<string, string> = { MATERIAL: 'Material', LABOR: 'Labor', EQUIPMENT: 'Equipment' };
const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);

export default function DupaAiCheck({ projectId, scheduleId, uploadId, disabled, onSave }: {
  projectId: string; scheduleId: string; uploadId: string; disabled: boolean; onSave: (choices: DupaChoice[]) => void;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [state, setState] = useState<Record<string, 'saved' | 'removed'>>({});

  async function run() {
    setRunning(true); setError(''); setResult(null); setEdits({}); setSelected({}); setState({});
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ai-check`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'dupa', scheduleId, uploadId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data.error || 'The AI Check could not run. Try again; nothing was changed.'));
      setResult(data as Result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The AI Check failed.'); }
    finally { setRunning(false); }
  }

  const open = (result?.suggestions ?? []).filter(item => !state[item.id]);
  const valueOf = (item: Suggestion) => edits[item.id] ?? item.proposed;
  function save(items: Suggestion[]) {
    if (!items.length) return;
    onSave(items.map(item => ({ row: item.row, kind: item.kind, proposed: valueOf(item) })));
    setState(current => ({ ...current, ...Object.fromEntries(items.map(item => [item.id, 'saved' as const])) }));
    setSelected({});
  }
  function remove(items: Suggestion[]) {
    setState(current => ({ ...current, ...Object.fromEntries(items.map(item => [item.id, 'removed' as const])) }));
    setSelected({});
  }
  const chosen = open.filter(item => selected[item.id]);
  const share = result && result.packageValue > 0 ? result.dupaTotal / result.packageValue * 100 : null;

  return <div className={styles.panel} style={{ margin: '12px 0' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <div><strong>AI Check this DUPA</strong> <span className={styles.muted}>· compares it with the package’s BOQ items and value. Nothing changes until you save a suggestion and apply the DUPA.</span></div>
      <button type="button" className={result ? styles.secondary : styles.button} disabled={disabled || running} onClick={() => void run()}>{running ? 'Checking…' : result ? 'Run again' : 'Run AI Check'}</button>
    </div>
    {running && <AiThinking messages={AI_THINKING_MESSAGES.dupa} note="This usually takes 20–60 seconds." />}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {result && <>
      <p style={{ marginTop: 12 }}><strong>Summary.</strong> {result.summary}</p>
      <p className={styles.muted} style={share !== null && Math.abs(share - 100) > 5 ? { color: '#fcd34d' } : undefined}>DUPA total {money(result.dupaTotal)} vs package BOQ value {money(result.packageValue)}{share !== null ? ` (${share.toFixed(1)}%)` : ''}.</p>
      {result.insights.length > 0 && <ul style={{ margin: '8px 0', paddingLeft: 18 }}>{result.insights.map((insight, index) => <li key={index} style={{ marginBottom: 6 }}>
        <strong style={{ color: insight.severity === 'issue' ? '#fca5a5' : insight.severity === 'warning' ? '#fcd34d' : undefined }}>{insight.severity === 'issue' ? 'Issue' : insight.severity === 'warning' ? 'Check' : 'Note'} · {insight.title}</strong>
        <span className={styles.muted}> {insight.detail}{insight.refs.length ? ` (${insight.refs.map(ref => ref.label).join(', ')})` : ''}</span>
      </li>)}</ul>}
      <h4 style={{ margin: '12px 0 6px' }}>Suggestions ({open.length} open{result.suggestions.length - open.length ? ` · ${result.suggestions.length - open.length} handled` : ''})</h4>
      {!result.suggestions.length && <p className={styles.muted}>No changes suggested: the categories already fit and no row needs to be left out.</p>}
      {result.suggestions.length > 0 && <>
        <div className={styles.scroll} role="region" aria-label="DUPA AI suggestions" tabIndex={0}><table className={styles.table}>
          <thead><tr><th><input type="checkbox" aria-label="Select all open suggestions" checked={open.length > 0 && open.every(item => selected[item.id])} onChange={event => setSelected(event.target.checked ? Object.fromEntries(open.map(item => [item.id, true])) : {})} /></th><th>Row</th><th>Suggestion (editable)</th><th>Why</th><th>Decision</th></tr></thead>
          <tbody>{result.suggestions.map(item => {
            const done = state[item.id];
            return <tr key={item.id} style={done ? { opacity: 0.6 } : undefined}>
              <td><input type="checkbox" aria-label={`Select suggestion for row ${item.row}`} disabled={!!done} checked={!!selected[item.id]} onChange={event => setSelected(current => ({ ...current, [item.id]: event.target.checked }))} /></td>
              <td>Row {item.row}<div className={styles.muted}>{item.description.slice(0, 70)} · {money(item.amount)}</div></td>
              <td>{item.kind === 'category'
                ? <><span className={styles.muted}>{item.current} → </span><select aria-label={`Category for row ${item.row}`} disabled={!!done} value={valueOf(item)} onChange={event => setEdits(current => ({ ...current, [item.id]: event.target.value }))}>{KINDS.map(kind => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}</select></>
                : <select aria-label={`Leave out row ${item.row}`} disabled={!!done} value={valueOf(item)} onChange={event => setEdits(current => ({ ...current, [item.id]: event.target.value }))}><option value="Leave out">Leave this row out</option><option value="Keep">Keep this row</option></select>}</td>
              <td className={styles.muted}>{item.reason}</td>
              <td>{done ? (done === 'saved' ? 'Saved' : 'Removed') : <span style={{ display: 'flex', gap: 6 }}>
                <button type="button" className={styles.button} disabled={disabled || running} onClick={() => save([item])}>Save</button>
                <button type="button" className={styles.secondary} disabled={disabled || running} onClick={() => remove([item])}>Remove</button>
              </span>}</td>
            </tr>;
          })}</tbody>
        </table></div>
        {open.length > 0 && <div className={styles.actions} style={{ marginTop: 10 }}>
          <button type="button" className={styles.button} disabled={disabled || running || !chosen.length} onClick={() => save(chosen)}>Save selected ({chosen.length})</button>
          <button type="button" className={styles.secondary} disabled={disabled || running} onClick={() => save(open)}>Save all ({open.length})</button>
          <button type="button" className={styles.secondary} disabled={disabled || running || !chosen.length} onClick={() => remove(chosen)}>Remove selected</button>
          <button type="button" className={styles.secondary} disabled={disabled || running} onClick={() => remove(open)}>Remove all</button>
        </div>}
      </>}
      <p className={styles.muted} style={{ marginTop: 8 }}>Suggestions by {result.model}. AI can be wrong: check each row against the original DUPA.</p>
    </>}
  </div>;
}
