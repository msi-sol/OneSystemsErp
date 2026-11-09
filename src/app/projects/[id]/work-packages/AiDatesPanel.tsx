'use client';

import { useState } from 'react';
import styles from '@/components/ai/AiCheckPanel.module.css';
import AiThinking, { AI_THINKING_MESSAGES } from '@/components/ai/AiThinking';

/**
 * Optional AI Check for the Dates & schedule step. It suggests a start and finish for every package and
 * finish-to-start links; the planner edits any date, lag or choice, then saves the ticked ones in one change
 * (planning command "apply-plan-dates"). Nothing changes until Save.
 */

type Ref = { id: string; label: string };
type Insight = { severity: 'issue' | 'warning' | 'info'; title: string; detail: string; refs: Ref[] };
type PackageSuggestion = Ref & { currentStart: string | null; currentFinish: string | null; startDay: number; durationDays: number; reason: string; fromAi: boolean; adjusted: boolean };
type LinkSuggestion = { before: Ref; after: Ref; lagDays: number; reason: string };
type Result = { model: string; summary: string; insights: Insight[]; projectStart: string | null; contractEnd: string | null; packages: PackageSuggestion[]; sequence: LinkSuggestion[]; editable: boolean };
type Row = { start: string; finish: string; on: boolean; saved: boolean };

const DAY = 86_400_000;
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const daysBetween = (start: string, finish: string) => Math.round((Date.parse(`${finish}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY) + 1;
const nice = (date: string | null) => date ? new Date(`${date}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—';
const FRIENDLY: Record<string, string> = {
  SCHEDULE_VERSION_CONFLICT: 'The plan changed since the check. Refresh the page, then run the AI Check again.',
  DEPENDENCY_CYCLE: 'One of the chosen links would make a loop (A before B before A). Untick it and save again.',
  DEPENDENCY_ALREADY_EXISTS: 'One of the chosen links already exists. Untick it and save again.',
  FINISH_BEFORE_START: 'A finish date is before its start date.',
  SCHEDULE_NOT_EDITABLE_IN_CURRENT_STATUS: 'This plan is locked in its current status.',
};
async function call(url: string, body: unknown) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const code = String(data.error || ''); throw new Error(FRIENDLY[code] || code.replace(/_/g, ' ').toLowerCase() || 'The request failed.'); }
  return data;
}

export default function AiDatesPanel({ projectId, scheduleId, rowVersion, canEdit, onSaved }: { projectId: string; scheduleId: string; rowVersion: number; canEdit: boolean; onSaved: () => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const [base, setBase] = useState('');
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [links, setLinks] = useState<{ on: boolean; lag: string; saved: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const datesFrom = (start: string, data: Result, keep?: Record<string, Row>) => Object.fromEntries(data.packages.map((row) => {
    const first = addDays(start, row.startDay - 1);
    return [row.id, { start: first, finish: addDays(first, row.durationDays - 1), on: keep?.[row.id]?.on ?? !row.currentStart, saved: keep?.[row.id]?.saved ?? false }];
  }));

  async function run() {
    setBusy(true); setRunning(true); setError(''); setMessage('');
    try {
      const data = await call(`/api/projects/${projectId}/ai-check`, { scope: 'dates' }) as Result;
      const start = data.projectStart || today();
      setResult(data); setBase(start); setRows(datesFrom(start, data));
      setLinks(data.sequence.map((link) => ({ on: true, lag: String(link.lagDays), saved: false })));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The AI Check failed.'); }
    finally { setBusy(false); setRunning(false); }
  }

  const editable = !!result?.editable && canEdit;
  // A package's dates as they would be after saving: the suggestion when ticked, otherwise its current dates.
  const effective = (id: string) => {
    const row = rows[id], current = result?.packages.find((item) => item.id === id);
    // Ticked or just saved: the panel's dates. Otherwise the package's dates as they were when the check ran.
    return row && (row.saved || row.on) ? { start: row.start, finish: row.finish } : { start: current?.currentStart ?? null, finish: current?.currentFinish ?? null };
  };
  const chosenRows = result ? result.packages.filter((row) => rows[row.id]?.on && !rows[row.id]?.saved) : [];
  const chosenLinks = result ? result.sequence.map((link, index) => ({ link, index })).filter(({ index }) => links[index]?.on && !links[index]?.saved) : [];
  const invalidRow = chosenRows.find((row) => !rows[row.id].start || !rows[row.id].finish || rows[row.id].finish < rows[row.id].start);
  const invalidLag = chosenLinks.find(({ index }) => !/^\d+$/.test(links[index].lag.trim()) || Number(links[index].lag) > 36500);
  // Same rule as the plan's readiness check: a finish-to-start link needs the successor to start on or after the
  // predecessor's finish + lag. Checked for every link that is (or will be) recorded: ticked ones and saved ones.
  const lagOf = (index: number) => { const value = Number(links[index]?.lag || 0); return Number.isFinite(value) ? value : 0; };
  const clashes = (index: number) => {
    const link = result?.sequence[index], state = links[index];
    if (!link || !state || (!state.on && !state.saved)) return false;
    const before = effective(link.before.id), after = effective(link.after.id);
    return !!(before.finish && after.start && after.start < addDays(before.finish, lagOf(index)));
  };
  // Only clashes that this save would create (a ticked link, or ticked dates on either end) block saving; a clash
  // between dates and links that are already saved is shown but must be fixed from the package.
  const pending = (id: string) => !!rows[id]?.on && !rows[id]?.saved;
  const clashingLinks = result ? result.sequence.map((link, index) => ({ link, index })).filter(({ link, index }) => clashes(index) && ((links[index]?.on && !links[index]?.saved) || pending(link.before.id) || pending(link.after.id))) : [];
  const planDates = result ? result.packages.map((row) => effective(row.id)).filter((row) => row.start && row.finish) as { start: string; finish: string }[] : [];
  const planStart = planDates.length ? planDates.map((row) => row.start).sort()[0] : null;
  const finishes = planDates.map((row) => row.finish).sort();
  const planFinish = finishes.length ? finishes[finishes.length - 1] : null;

  async function save() {
    if (!result || (!chosenRows.length && !chosenLinks.length) || invalidRow || invalidLag || clashingLinks.length) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await call(`/api/projects/${projectId}/work-packages`, {
        action: 'apply-plan-dates', currentScheduleId: scheduleId, expectedRowVersion: rowVersion,
        dates: chosenRows.map((row) => ({ activityId: row.id, start: rows[row.id].start, finish: rows[row.id].finish })),
        links: chosenLinks.map(({ link, index }) => ({ predecessorId: link.before.id, successorId: link.after.id, lagDays: Number(links[index].lag), remarks: `AI Check: ${link.reason}`.slice(0, 500) })),
      });
      setRows((current) => Object.fromEntries(Object.entries(current).map(([id, row]) => [id, chosenRows.some((item) => item.id === id) ? { ...row, saved: true } : row])));
      setLinks((current) => current.map((row, index) => chosenLinks.some((item) => item.index === index) ? { ...row, saved: true } : row));
      setMessage(`Saved ${data.dated} package ${data.dated === 1 ? 'date' : 'dates'}${data.linked ? ` and ${data.linked} sequence ${data.linked === 1 ? 'link' : 'links'}` : ''}. You can still change any of them below in the table.`);
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The suggestions could not be saved.'); }
    finally { setBusy(false); }
  }

  const setRow = (id: string, patch: Partial<Row>) => setRows((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  /** Moves each clashing successor's start (keeping its length) to its predecessor's finish + lag, then repeats so
   *  chains settle. A successor whose dates were already saved is left alone: change it from its package. */
  function shiftToFollowLinks() {
    if (!result) return;
    const next = { ...rows };
    const current = (id: string) => {
      const row = next[id], saved = result.packages.find((item) => item.id === id);
      return row && (row.saved || row.on) ? { start: row.start, finish: row.finish } : { start: saved?.currentStart ?? null, finish: saved?.currentFinish ?? null };
    };
    let moved = 0, blocked = 0;
    for (let pass = 0; pass < result.packages.length + 1; pass++) {
      let changed = false;
      result.sequence.forEach((link, index) => {
        const state = links[index];
        if (!state || (!state.on && !state.saved)) return;
        const before = current(link.before.id), after = current(link.after.id), row = next[link.after.id];
        if (!before.finish || !after.start) return;
        const earliest = addDays(before.finish, lagOf(index));
        if (after.start >= earliest) return;
        if (!row) { if (pass === 0) blocked++; return; }
        const length = after.finish ? daysBetween(after.start, after.finish) : 1;
        // A package saved earlier from this panel becomes ticked again, so the moved dates are saved next.
        next[link.after.id] = { ...row, start: earliest, finish: addDays(earliest, Math.max(1, length) - 1), on: true, saved: false };
        moved++; changed = true;
      });
      if (!changed) break;
    }
    setRows(next);
    setMessage(moved ? `Moved ${moved} start ${moved === 1 ? 'date' : 'dates'} so every ticked link is respected. Package lengths are unchanged. Save to record the moved dates.` : blocked ? 'A clashing package is not in this check; open it to change its dates, or untick the link.' : 'All ticked links are already respected.');
  }
  const tickAll = (on: boolean) => {
    setRows((current) => Object.fromEntries(Object.entries(current).map(([id, row]) => [id, row.saved ? row : { ...row, on }])));
    setLinks((current) => current.map((row) => row.saved ? row : { ...row, on }));
  };
  const setStart = (id: string, start: string) => {
    // Moving the start keeps the package's length, so editing a date never silently shortens the work.
    const row = rows[id];
    const length = row.start && row.finish ? daysBetween(row.start, row.finish) : 1;
    setRow(id, { start, finish: start ? addDays(start, Math.max(1, length) - 1) : row.finish, on: true });
  };

  return <section className={styles.panel} aria-labelledby="ai-check-dates">
    <div className={styles.header}>
      <div>
        <h3 id="ai-check-dates" className={styles.title}>AI Check · dates &amp; schedule <span className={styles.badge}>Optional</span></h3>
        <p className={styles.muted}>Have AI propose a start and finish for every package and which packages must finish before others start. Change any date or link, tick what you want, then save. Nothing changes until you save.</p>
      </div>
      <button type="button" className={result ? styles.secondary : styles.primary} disabled={busy} onClick={() => void run()}>{running ? 'Checking…' : result ? 'Run again' : 'Suggest dates'}</button>
    </div>
    {running && <AiThinking messages={AI_THINKING_MESSAGES.dates} note="This usually takes 30–60 seconds. You can keep working on other steps." />}
    {error && <div className={styles.error} role="alert">{error}</div>}
    {message && <div className={styles.success} role="status">{message}</div>}

    {result && <>
      <div className={styles.summary}><strong>Summary.</strong> {result.summary}</div>
      {result.insights.length > 0 && <div className={styles.section}><h4 className={styles.sectionTitle}>Insights ({result.insights.length})</h4><ul className={styles.list}>{result.insights.map((insight, index) => <li key={index} className={`${styles.insight} ${styles[insight.severity]}`}>
        <div className={styles.insightTitle}>{insight.severity === 'issue' ? 'Issue' : insight.severity === 'warning' ? 'Check' : 'Note'} · {insight.title}</div>
        <p className={styles.muted}>{insight.detail}</p>
        {insight.refs.length > 0 && <div className={styles.refs}>{insight.refs.map((ref) => <span key={ref.id} className={styles.ref}>{ref.label}</span>)}</div>}
      </li>)}</ul></div>}

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Suggested dates ({result.packages.length} packages)</h4>
        <div className={styles.actions} style={{ marginTop: 6, alignItems: 'flex-end' }}>
          <label className={styles.muted} style={{ display: 'grid', gap: 6 }}>Project start
            <input type="date" className={styles.input} value={base} disabled={!editable} onChange={(event) => { const start = event.target.value; setBase(start); if (start) setRows(datesFrom(start, result, rows)); }} />
          </label>
          <p className={styles.muted} style={{ margin: 0 }}>
            {planStart && planFinish ? <>Plan: <strong>{nice(planStart)} → {nice(planFinish)}</strong> ({daysBetween(planStart, planFinish)} days){result.contractEnd && <> · Contract end {nice(result.contractEnd)}{planFinish > result.contractEnd && <strong style={{ color: '#f1c782' }}> · finishes after the contract end</strong>}</>}</> : 'Pick a project start to see the dates.'}
          </p>
        </div>
        <p className={styles.muted}>Changing the project start moves every suggestion. Packages that already have dates are unticked, so yours are not replaced unless you tick them.{result.packages.some((row) => row.adjusted) ? ' Some starts were moved later so each package begins after the packages it depends on.' : ''}</p>
        <div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th><span className="sr-only">Use</span></th><th style={{ minWidth: 240 }}>Package and why</th><th style={{ minWidth: 80 }}>Now</th><th>Start</th><th>Finish</th><th>Days</th></tr></thead>
          <tbody>{result.packages.map((row) => {
            const state = rows[row.id];
            if (!state) return null;
            const days = state.start && state.finish ? daysBetween(state.start, state.finish) : null;
            return <tr key={row.id}>
              <td>{state.saved ? <span className={styles.groupMeta}>Saved</span> : <input type="checkbox" aria-label={`Use the suggested dates for ${row.label}`} checked={state.on} disabled={!editable} onChange={(event) => setRow(row.id, { on: event.target.checked })} />}</td>
              <td><strong>{row.label}</strong><div className={styles.groupMeta} style={{ marginTop: 4 }}>{row.reason}{row.adjusted && ' Moved later to follow its predecessor.'}</div></td>
              <td className={styles.groupMeta}>{row.currentStart ? `${nice(row.currentStart)} – ${nice(row.currentFinish)}` : 'Not dated'}</td>
              <td><input type="date" className={styles.input} style={{ width: 148, padding: '8px 10px' }} aria-label={`Start for ${row.label}`} value={state.start} disabled={!editable || state.saved} onChange={(event) => setStart(row.id, event.target.value)} /></td>
              <td><input type="date" className={styles.input} style={{ width: 148, padding: '8px 10px' }} aria-label={`Finish for ${row.label}`} min={state.start} value={state.finish} disabled={!editable || state.saved} onChange={(event) => setRow(row.id, { finish: event.target.value, on: true })} /></td>
              <td>{days && days > 0 ? days : <span style={{ color: '#ffb4b4' }}>Check</span>}</td>
            </tr>;
          })}</tbody>
        </table></div>
      </div>

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Suggested sequence links ({result.sequence.length})</h4>
        {!result.sequence.length && <p className={styles.muted}>No new links suggested.</p>}
        {result.sequence.length > 0 && <ul className={styles.list}>{result.sequence.map((link, index) => {
          const state = links[index];
          const lag = lagOf(index);
          const clash = clashes(index);
          return <li key={index} className={styles.insight}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {state?.saved ? <span className={styles.groupMeta}>Saved</span> : <input type="checkbox" aria-label={`Add link ${link.before.label} before ${link.after.label}`} checked={!!state?.on} disabled={!editable} onChange={(event) => setLinks((current) => current.map((row, i) => i === index ? { ...row, on: event.target.checked } : row))} />}
              <span style={{ flex: '1 1 260px' }}><span className={styles.insightTitle}>{link.before.label} → {link.after.label}</span>
                <span className={styles.muted} style={{ display: 'block' }}>Finish before start · {link.reason}</span>
                {clash && <span style={{ display: 'block', color: '#f1c782', fontSize: '.8rem' }}>With these dates, {link.after.label} starts before {link.before.label} finishes{lag ? ` + ${lag} days` : ''}. Use “Shift starts to follow links”, adjust a date, or untick the link.</span>}</span>
              <label className={styles.groupMeta} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Lag (days)
                <input type="number" min={0} className={styles.input} style={{ width: 80 }} value={state?.lag ?? '0'} disabled={!editable || state?.saved} onChange={(event) => setLinks((current) => current.map((row, i) => i === index ? { ...row, lag: event.target.value } : row))} />
              </label>
            </div>
          </li>;
        })}</ul>}
      </div>

      {editable ? <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={busy || (!chosenRows.length && !chosenLinks.length) || !!invalidRow || !!invalidLag || clashingLinks.length > 0} onClick={() => void save()}>
          {busy && !running ? 'Saving…' : `Save ${chosenRows.length} ${chosenRows.length === 1 ? 'date' : 'dates'}${chosenLinks.length ? ` and ${chosenLinks.length} ${chosenLinks.length === 1 ? 'link' : 'links'}` : ''}`}
        </button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => tickAll(true)}>Tick all</button>
        <button type="button" className={styles.ghost} disabled={busy} onClick={() => tickAll(false)}>Untick all</button>
        {result.sequence.some((_, index) => clashes(index)) && <button type="button" className={styles.secondary} disabled={busy} onClick={shiftToFollowLinks}>Shift starts to follow links</button>}
        {invalidRow && <span className={styles.muted}>Fix the dates of {invalidRow.label} first.</span>}
        {invalidLag && <span className={styles.muted}>Lag must be a whole number of days.</span>}
        {!invalidRow && !invalidLag && clashingLinks.length > 0 && <span className={styles.muted}>{clashingLinks.length} ticked {clashingLinks.length === 1 ? 'link clashes' : 'links clash'} with the dates. Shift the starts, change a date, or untick the link before saving.</span>}
      </div> : <p className={styles.muted}>{canEdit ? 'This plan is locked in its current status, so the suggestions are for information only.' : 'You can view these suggestions; saving needs permission to edit the plan.'}</p>}
      <p className={styles.muted} style={{ marginTop: 14 }}>Suggestions by {result.model}. AI can be wrong: review before saving. Saved dates and links are recorded in the history like any other edit.</p>
    </>}
  </section>;
}
