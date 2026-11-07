'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '@/components/ai/AiCheckPanel.module.css';
import { applyProcurementBenchmarkSuggestions, saveProcurementBenchmarkBoqLinks } from '@/app/actions/mutations';

/**
 * Optional AI Check for the uploaded procurement benchmark: exact amount and duplicate checks, the benchmark total
 * against the contract value, and AI-found budget lines with no (or an unclear) matching BOQ item. Read-only.
 */
type Ref = { id: string; label: string };
type Insight = { severity: 'issue' | 'warning' | 'info'; title: string; detail: string; refs: Ref[] };
type Suggestion = { id: string; rowId: string; label: string; field: 'description' | 'unit' | 'category' | 'itemCode' | 'unitCost' | 'totalCost' | 'remove'; current: string; proposed: string; reason: string; source: 'ai' | 'exact'; selected: boolean };
type Draft = { value: string; selected: boolean; state: 'open' | 'dismissed' | 'saved' };
type LinkDraft = { boqId: string; selected: boolean; state: 'open' | 'dismissed' | 'saved' };
const FIELD_LABEL: Record<Suggestion['field'], string> = { description: 'Description', unit: 'Unit', category: 'Category', itemCode: 'Item code', unitCost: 'Unit cost', totalCost: 'Total', remove: 'Remove line' };
type Result = {
  model: string; summary: string; insights: Insight[]; suggestions: Suggestion[];
  links: { rowId: string; label: string; amount: number; boqId: string | null; boqLabel: string | null; savedBoqId: string | null; savedBoqLabel: string | null; confidence: 'high' | 'medium' | 'low'; reason: string; selected: boolean }[];
  boqOptions: Ref[];
  checks: {
    lines: number; benchmarkTotal: number; contractAmount: number; amountIssueCount: number;
    amountIssues: { id: string; label: string; quantity: number; unitCost: number; amount: number; computed: number; difference: number; rounding: boolean }[];
    duplicates: { label: string; count: number; totalQuantity: number; unit: string }[];
  };
};

const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BenchmarkAiCheck({ projectId, editable = true }: { projectId: string; editable?: boolean }) {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  // Each suggestion can be edited, ticked/unticked or dismissed; nothing is saved until "Save selected".
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [linkDrafts, setLinkDrafts] = useState<Record<string, LinkDraft>>({});
  const [linkPage, setLinkPage] = useState(0);
  const [savingLinks, setSavingLinks] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [running]);

  async function run() {
    setRunning(true); setElapsed(0); setError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/ai-check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'benchmark' }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data.error || 'The AI Check could not run. Try again; nothing was changed.'));
      const next = data as Result;
      setResult(next); setSaveMessage('');
      setDrafts(Object.fromEntries((next.suggestions ?? []).map((item) => [item.id, { value: item.proposed, selected: item.selected, state: 'open' as const }])));
      // Link suggestions that only repeat what is already saved need no review.
      // "Not in the BOQ" lines stay in the list (unticked) so they can be linked by hand if the AI is wrong.
      setLinkDrafts(Object.fromEntries((next.links ?? []).map((link) => [link.rowId, { boqId: link.boqId ?? '', selected: link.selected, state: link.boqId && link.boqId === link.savedBoqId ? 'saved' as const : 'open' as const }])));
      setLinkPage(0);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The AI Check failed.'); }
    finally { setRunning(false); }
  }

  // BOQ links: least certain first (not in the BOQ, then low, medium, high).
  const order = { low: 1, medium: 2, high: 3 } as const;
  const openLinks = (result?.links ?? []).filter((link) => linkDrafts[link.rowId]?.state === 'open')
    .sort((a, b) => (a.boqId ? order[a.confidence] : 0) - (b.boqId ? order[b.confidence] : 0));
  const chosenLinks = openLinks.filter((link) => linkDrafts[link.rowId]?.selected);
  const sameAsSaved = (result?.links ?? []).filter((link) => link.boqId && link.boqId === link.savedBoqId).length;
  const notInBoq = (result?.links ?? []).filter((link) => !link.boqId);
  const setLinkDraft = (id: string, patch: Partial<LinkDraft>) => setLinkDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  async function saveLinks() {
    if (!chosenLinks.length) return;
    setSavingLinks(true); setError(''); setSaveMessage('');
    try {
      const outcome = await saveProcurementBenchmarkBoqLinks(projectId, chosenLinks.map((link) => ({ rowId: link.rowId, boqItemId: linkDrafts[link.rowId].boqId || null })));
      setLinkDrafts((current) => ({ ...current, ...Object.fromEntries(chosenLinks.map((link) => [link.rowId, { ...current[link.rowId], state: 'saved' as const }])) }));
      setSaveMessage(`Saved ${outcome.saved} BOQ link${outcome.saved === 1 ? '' : 's'}. ${outcome.linked} benchmark line${outcome.linked === 1 ? ' is' : 's are'} now linked to the BOQ.`);
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The links could not be saved.'); }
    finally { setSavingLinks(false); }
  }
  const openSuggestions = (result?.suggestions ?? []).filter((item) => drafts[item.id]?.state === 'open');
  const chosen = openSuggestions.filter((item) => drafts[item.id]?.selected);
  const setDraft = (id: string, patch: Partial<Draft>) => setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  async function saveSelected() {
    if (!chosen.length) return;
    setSaving(true); setError(''); setSaveMessage('');
    try {
      const outcome = await applyProcurementBenchmarkSuggestions(projectId, chosen.map((item) => ({ rowId: item.rowId, field: item.field, value: drafts[item.id].value })));
      setDrafts((current) => ({ ...current, ...Object.fromEntries(chosen.map((item) => [item.id, { ...current[item.id], state: 'saved' as const }])) }));
      setSaveMessage(`Saved: ${outcome.updated} line${outcome.updated === 1 ? '' : 's'} changed${outcome.removed ? `, ${outcome.removed} removed` : ''}. Run the AI Check again to re-check the updated benchmark.`);
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The changes could not be saved.'); }
    finally { setSaving(false); }
  }
  function discardAll() {
    setDrafts((current) => Object.fromEntries(Object.entries(current).map(([id, draft]) => [id, draft.state === 'open' ? { ...draft, state: 'dismissed' as const } : draft])));
    setSaveMessage('All suggestions discarded. Nothing was changed.');
  }

  const checks = result?.checks;
  const difference = checks ? checks.benchmarkTotal - checks.contractAmount : 0;
  const rounding = checks?.amountIssues.filter((row) => row.rounding) ?? [];
  const realDifferences = checks?.amountIssues.filter((row) => !row.rounding) ?? [];

  return <section className={styles.panel} aria-labelledby="ai-check-benchmark" style={{ marginBottom: 20 }}>
    <div className={styles.header}>
      <div>
        <h3 id="ai-check-benchmark" className={styles.title}>AI Check <span className={styles.badge}>Optional</span></h3>
        <p className={styles.muted}>Check this benchmark against the approved BOQ: lines where quantity × unit cost does not equal the total (including small rounding differences), duplicate lines, and budget lines with no matching BOQ item. Nothing changes.</p>
      </div>
      <button type="button" className={result ? styles.secondary : styles.primary} disabled={running} onClick={() => void run()}>{running ? `Checking… ${elapsed}s` : result ? 'Run again' : 'Run AI Check'}</button>
    </div>
    {running && <p className={styles.muted} role="status" style={{ marginTop: 10 }}>{elapsed < 90 ? 'The AI is comparing every budget line with the BOQ. This usually takes 30–60 seconds.' : 'Still working: the AI service is slower than usual. It stops by itself after about 4 minutes.'}</p>}
    {error && <div className={styles.error} role="alert">{error}</div>}

    {saveMessage && <div className={styles.success} role="status">{saveMessage}</div>}

    {result && checks && <>
      <div className={styles.summary}><strong>Summary.</strong> {result.summary}</div>

      {(result.suggestions ?? []).length > 0 && <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Suggested fixes ({openSuggestions.length})</h4>
        {!openSuggestions.length ? <p className={styles.muted}>No suggestions left to review.</p> : <>
          <p className={styles.muted}>Change any suggested value, untick what you do not want, or remove a suggestion with ✕. Nothing changes until you save. Total changes start unticked because they change the budget.</p>
          <div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr><th><span className="sr-only">Use</span></th><th>Line</th><th>Change</th><th>Why</th><th><span className="sr-only">Remove suggestion</span></th></tr></thead>
            <tbody>{openSuggestions.map((item) => {
              const draft = drafts[item.id];
              return <tr key={item.id}>
                <td><input type="checkbox" aria-label={`Use suggestion for ${item.label}`} checked={draft.selected} disabled={!editable || saving} onChange={(event) => setDraft(item.id, { selected: event.target.checked })} /></td>
                <td>{item.label}<div className={styles.groupMeta}>{item.source === 'ai' ? 'AI suggestion' : 'Exact check'}</div></td>
                <td style={{ minWidth: 240 }}>
                  <strong>{FIELD_LABEL[item.field]}</strong>
                  {item.field === 'remove'
                    ? <div className={styles.groupMeta}>The line will be deleted from the benchmark.</div>
                    : <><div className={styles.strike}>{item.current || '—'}</div>
                      {item.field === 'description'
                        ? <textarea className={styles.input} rows={2} value={draft.value} disabled={!editable || saving} aria-label={`New ${FIELD_LABEL[item.field]} for ${item.label}`} onChange={(event) => setDraft(item.id, { value: event.target.value, selected: true })} />
                        : <input className={styles.input} inputMode={item.field === 'unitCost' || item.field === 'totalCost' ? 'decimal' : undefined} value={draft.value} disabled={!editable || saving} aria-label={`New ${FIELD_LABEL[item.field]} for ${item.label}`} onChange={(event) => setDraft(item.id, { value: event.target.value, selected: true })} />}</>}
                </td>
                <td className={styles.groupMeta}>{item.reason}</td>
                <td><button type="button" className={styles.ghost} aria-label={`Remove this suggestion for ${item.label}`} title="Remove this suggestion" disabled={saving} onClick={() => setDraft(item.id, { state: 'dismissed' })}>✕</button></td>
              </tr>;
            })}</tbody>
          </table></div>
          {editable
            ? <div className={styles.actions}>
              <button type="button" className={styles.primary} disabled={saving || !chosen.length} onClick={() => void saveSelected()}>{saving ? 'Saving…' : `Save ${chosen.length} selected ${chosen.length === 1 ? 'change' : 'changes'}`}</button>
              <button type="button" className={styles.ghost} disabled={saving} onClick={discardAll}>Discard all suggestions</button>
            </div>
            : <p className={styles.muted}>This benchmark is locked, so the suggestions are for information only.</p>}
        </>}
      </div>}

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Totals</h4>
        <p className={styles.muted}>Benchmark {peso(checks.benchmarkTotal)} ({checks.lines} lines) · Contract value {peso(checks.contractAmount)} · {difference <= 0 ? `${peso(-difference)} below the contract value` : `${peso(difference)} above the contract value`}{checks.contractAmount > 0 ? ` (${Math.round((checks.benchmarkTotal / checks.contractAmount) * 100)}% of it)` : ''}.</p>
      </div>

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Amount differences ({checks.amountIssueCount})</h4>
        {!checks.amountIssueCount ? <p className={styles.muted}>✓ Every line’s total equals quantity × unit cost.</p> : <>
          <p className={styles.muted}>{realDifferences.length} line(s) differ by ₱1 or more; {rounding.length} only by rounding (under ₱1). Totals are kept as in the file.</p>
          <div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr><th>Line</th><th>Qty × unit cost</th><th>Total in file</th><th>Difference</th></tr></thead>
            <tbody>{[...realDifferences, ...rounding].slice(0, 60).map((row) => <tr key={row.id}>
              <td>{row.label}</td>
              <td>{row.quantity.toLocaleString('en-PH')} × {peso(row.unitCost)} = {peso(row.computed)}</td>
              <td>{peso(row.amount)}</td>
              <td style={{ color: row.rounding ? '#fde68a' : '#fca5a5', whiteSpace: 'nowrap' }}>{row.difference > 0 ? '+' : ''}{peso(row.difference)}{row.rounding ? ' · rounding' : ''}</td>
            </tr>)}</tbody>
          </table></div>
        </>}
      </div>

      {checks.duplicates.length > 0 && <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Repeated lines ({checks.duplicates.length})</h4>
        <p className={styles.muted}>The same item appears more than once. That is normal when it is budgeted in several sections; the master material list adds them together.</p>
        <ul className={styles.list}>{checks.duplicates.slice(0, 20).map((row) => <li key={row.label} className={styles.insight}><span className={styles.insightTitle}>{row.label}</span> <span className={styles.muted}>· {row.count} times · {row.totalQuantity.toLocaleString('en-PH')} {row.unit} in total</span></li>)}</ul>
      </div>}

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>BOQ links ({openLinks.length} to review)</h4>
        <p className={styles.muted}>Which BOQ item each budget line is for. Change the BOQ item if the AI picked the wrong one, untick what you do not want, or remove a suggestion with ✕. Low-confidence and “not in the BOQ” lines start unticked. Saved links are used when the master materials list is generated.{sameAsSaved ? ` ${sameAsSaved} line(s) already have the suggested link.` : ''}</p>
        {notInBoq.length > 0 && <p className={styles.muted}><strong>Not in the BOQ ({notInBoq.length}):</strong> {notInBoq.slice(0, 8).map((link) => link.label).join('; ')}{notInBoq.length > 8 ? '; …' : ''}. These are additional budget items; link them in the list below if the AI is wrong.</p>}
        {!openLinks.length ? <p className={styles.muted}>No link changes left to review.</p> : <>
          <div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr><th><span className="sr-only">Use</span></th><th>Budget line</th><th>BOQ item</th><th>Confidence</th><th><span className="sr-only">Remove suggestion</span></th></tr></thead>
            <tbody>{openLinks.slice(linkPage * 25, (linkPage + 1) * 25).map((link) => {
              const draft = linkDrafts[link.rowId];
              return <tr key={link.rowId}>
                <td><input type="checkbox" aria-label={`Use BOQ link for ${link.label}`} checked={draft.selected} disabled={savingLinks} onChange={(event) => setLinkDraft(link.rowId, { selected: event.target.checked })} /></td>
                <td>{link.label}<div className={styles.groupMeta}>{peso(link.amount)}{link.savedBoqLabel ? ` · now linked to ${link.savedBoqLabel}` : ''}</div></td>
                <td style={{ minWidth: 260 }}>
                  <select className={styles.input} aria-label={`BOQ item for ${link.label}`} value={draft.boqId} disabled={savingLinks} onChange={(event) => setLinkDraft(link.rowId, { boqId: event.target.value, selected: true })}>
                    <option value="">Not in the BOQ (additional budget item)</option>
                    {result.boqOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                  {link.reason && <div className={styles.groupMeta}>{link.reason}</div>}
                </td>
                <td><span className={styles.ref} style={{ color: link.confidence === 'high' ? '#86efac' : link.confidence === 'medium' ? '#fde68a' : '#fca5a5' }}>{link.boqId ? link.confidence : 'not in BOQ'}</span></td>
                <td><button type="button" className={styles.ghost} aria-label={`Remove the BOQ link suggestion for ${link.label}`} title="Remove this suggestion" disabled={savingLinks} onClick={() => setLinkDraft(link.rowId, { state: 'dismissed' })}>✕</button></td>
              </tr>;
            })}</tbody>
          </table></div>
          {openLinks.length > 25 && <div className={styles.actions}>
            <button type="button" className={styles.ghost} disabled={linkPage === 0} onClick={() => setLinkPage((page) => page - 1)}>← Previous</button>
            <span className={styles.muted}>{linkPage * 25 + 1}–{Math.min((linkPage + 1) * 25, openLinks.length)} of {openLinks.length}</span>
            <button type="button" className={styles.ghost} disabled={(linkPage + 1) * 25 >= openLinks.length} onClick={() => setLinkPage((page) => page + 1)}>Next →</button>
          </div>}
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={savingLinks || !chosenLinks.length} onClick={() => void saveLinks()}>{savingLinks ? 'Saving…' : `Save ${chosenLinks.length} BOQ ${chosenLinks.length === 1 ? 'link' : 'links'}`}</button>
            <button type="button" className={styles.ghost} disabled={savingLinks} onClick={() => setLinkDrafts((current) => Object.fromEntries(Object.entries(current).map(([id, draft]) => [id, draft.state === 'open' ? { ...draft, state: 'dismissed' as const } : draft])))}>Discard all link suggestions</button>
          </div>
        </>}
      </div>

      {result.insights.length > 0 && <div className={styles.section}><h4 className={styles.sectionTitle}>Insights ({result.insights.length})</h4><ul className={styles.list}>{result.insights.map((insight, index) => <li key={index} className={`${styles.insight} ${styles[insight.severity]}`}>
        <div className={styles.insightTitle}>{insight.severity === 'issue' ? 'Issue' : insight.severity === 'warning' ? 'Check' : 'Note'} · {insight.title}</div>
        <p className={styles.muted}>{insight.detail}</p>
        {insight.refs.length > 0 && <div className={styles.refs}>{insight.refs.map((ref) => <span key={ref.id} className={styles.ref}>{ref.label}</span>)}</div>}
      </li>)}</ul></div>}

      <p className={styles.muted} style={{ marginTop: 14 }}>Matches by {result.model}. AI can be wrong: review before locking. The exact amount and repeat checks do not use AI.</p>
    </>}
  </section>;
}
