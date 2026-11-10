'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './AiCheckPanel.module.css';
import AiThinking, { AI_THINKING_MESSAGES } from '@/components/ai/AiThinking';

/**
 * Optional AI Check for the BOQ → BOQ baseline → sections → work packages flow.
 * Nothing runs until the user asks. Results are insights plus proposals; every proposal can be edited before
 * it is accepted, and accepting goes through the normal BOQ draft / work-package commands.
 */

type Ref = { id: string; label: string };
type Insight = { severity: 'issue' | 'warning' | 'info'; title: string; detail: string; refs: Ref[] };
type BoqItem = { id: string; itemCode: string; section: string; description: string; unit: string; quantity: string; unitCost: string; amount: string };
type Correction = { id: string; field: 'description' | 'unit' | 'section' | 'itemCode'; current: string; proposed: string; reason: string; item: BoqItem };
type BoqResult = { scope: 'boq'; model: string; summary: string; insights: Insight[]; corrections: Correction[]; editable: boolean; versionId: string; checksum: string | null; versionStatus: string };
type Section = { ref: number; key: string; name: string; items: number; amount: number };
type Group = { name: string; reason: string; sections: number[] };
type Link = { before: Ref; after: Ref; reason: string };
type WpResult = { scope: 'work-packages'; model: string; summary: string; insights: Insight[]; sections: Section[]; grouping: Group[]; groupingAdjusted: number; sequence: Link[]; schedule: { id: string; rowVersion: number; workflowStatus: string; packageCount: number } | null; groupingEditable: boolean; groupingBlockedReason: string | null; sequenceEditable: boolean };

const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FIELD_LABEL: Record<Correction['field'], string> = { description: 'Description', unit: 'Unit', section: 'Section', itemCode: 'Item code' };
const FRIENDLY: Record<string, string> = {
  BOQ_CHECKSUM_MISMATCH: 'The BOQ changed since the check. Run the AI Check again.',
  DRAFT_BOQ_REQUIRED: 'Only a draft BOQ can be corrected. An approved baseline needs a BOQ revision.',
  CLEAR_ONLY_BEFORE_REVIEW: 'Packages can be regrouped only before the plan is submitted for review.',
  PACKAGE_HAS_EXECUTION_HISTORY: 'A package already has progress records, so the grouping cannot be replaced.',
  PACKAGE_HAS_PROCUREMENT_HISTORY: 'A package already has procurement records, so the grouping cannot be replaced.',
  PACKAGE_HAS_PRESERVED_BREAKDOWN_EVIDENCE: 'A package has an uploaded DUPA, so the grouping cannot be replaced.',
  SCHEDULE_VERSION_CONFLICT: 'The plan changed since the check. Run the AI Check again.',
  EVERY_BOQ_SECTION_NEEDS_A_PACKAGE: 'Every BOQ section must be in a package.',
  INVALID_PACKAGE_NAME: 'Each package needs a name of 3 to 180 characters.',
  DEPENDENCY_CYCLE: 'This link would make a loop (A before B before A). Remove it and save the rest.',
  DEPENDENCY_ALREADY_EXISTS: 'This link already exists. Remove it and save the rest.',
};
async function call(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const code = String(data.error || ''); throw new Error(FRIENDLY[code] || code.replace(/_/g, ' ').toLowerCase() || 'The request failed.'); }
  return data;
}

function Insights({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;
  return <div className={styles.section}><h4 className={styles.sectionTitle}>Insights ({insights.length})</h4><ul className={styles.list}>{insights.map((insight, index) => (
    <li key={index} className={`${styles.insight} ${styles[insight.severity]}`}>
      <div className={styles.insightTitle}>{insight.severity === 'issue' ? 'Issue' : insight.severity === 'warning' ? 'Check' : 'Note'} · {insight.title}</div>
      <p className={styles.muted}>{insight.detail}</p>
      {insight.refs.length > 0 && <div className={styles.refs}>{insight.refs.map((ref) => <span key={ref.id} className={styles.ref}>{ref.label}</span>)}</div>}
    </li>))}</ul></div>;
}

export default function AiCheckPanel({ projectId, scope }: { projectId: string; scope: 'boq' | 'work-packages' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [boq, setBoq] = useState<BoqResult | null>(null);
  const [wp, setWp] = useState<WpResult | null>(null);
  // BOQ proposal editing state
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Record<string, 'accepted' | 'dismissed'>>({});
  const [checksum, setChecksum] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, BoqItem>>({});
  const [selectedFix, setSelectedFix] = useState<Record<string, boolean>>({});
  // Work-package proposal editing state
  const [groups, setGroups] = useState<Group[]>([]);
  const [confirmApply, setConfirmApply] = useState(false);
  const [links, setLinks] = useState<Record<number, boolean>>({});
  const [rowVersion, setRowVersion] = useState<number | null>(null);
  // Elapsed seconds while a check runs, so a 30–60 s model call visibly progresses instead of looking frozen.
  const [running, setRunning] = useState(false);

  async function run() {
    setBusy(true); setRunning(true); setError(''); setMessage(''); setConfirmApply(false);
    try {
      const data = await call(`/api/projects/${projectId}/ai-check`, 'POST', { scope });
      if (scope === 'boq') {
        setBoq(data); setChecksum(data.checksum); setEdits({}); setDone({});
        setItems(Object.fromEntries((data as BoqResult).corrections.map((row) => [row.item.id, row.item])));
      } else {
        const result = data as WpResult;
        setWp(result); setGroups(result.grouping.map((group) => ({ ...group, sections: [...group.sections] }))); setLinks({}); setRowVersion(result.schedule?.rowVersion ?? null);
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The AI Check failed.'); }
    finally { setBusy(false); setRunning(false); }
  }

  // ---- BOQ: accept (optionally edited) correction through the normal draft-edit endpoint.
  /**
   * Saves one or more suggestions (as edited) to the draft BOQ, one after another so each uses the checksum the
   * previous save returned. Stops at the first failure and says how many were saved.
   */
  async function saveCorrections(list: Correction[]) {
    if (!boq || !list.length) return;
    setBusy(true); setError(''); setMessage('');
    let currentChecksum = checksum;
    let currentItems = { ...items };
    let saved = 0;
    try {
      for (const correction of list) {
        const value = (edits[correction.id] ?? correction.proposed).trim();
        if (!value) throw new Error(`Enter a value for ${correction.item.itemCode} before saving.`);
        const item = currentItems[correction.item.id] || correction.item;
        const reason = `AI Check suggestion ${edits[correction.id] !== undefined && edits[correction.id].trim() !== correction.proposed ? 'edited and saved' : 'saved'}: ${correction.reason}`.slice(0, 300);
        const next = { ...item, [correction.field]: value };
        const result = await call(`/api/projects/${projectId}/boq-draft`, 'PATCH', {
          versionId: boq.versionId, itemId: item.id, expectedChecksum: currentChecksum, editReason: reason.length >= 5 ? reason : 'AI Check suggestion saved.',
          itemCode: next.itemCode, description: next.description, unit: next.unit, quantity: next.quantity, unitCost: next.unitCost, amount: next.amount,
          ...(correction.field === 'section' ? { section: value } : {}),
        });
        currentChecksum = result.checksum;
        currentItems = { ...currentItems, [item.id]: next };
        saved += 1;
        setDone((current) => ({ ...current, [correction.id]: 'accepted' }));
      }
      setMessage(saved === 1 ? `${FIELD_LABEL[list[0].field]} updated for ${list[0].item.itemCode}. The engineering review must be recorded again.` : `Saved ${saved} corrections to the draft BOQ. The engineering review must be recorded again.`);
    } catch (caught) {
      setError(`${saved ? `Saved ${saved}, then stopped: ` : ''}${caught instanceof Error ? caught.message : 'The correction could not be saved.'}`);
    } finally {
      setChecksum(currentChecksum); setItems(currentItems); setSelectedFix({}); setBusy(false);
      if (saved) router.refresh();
    }
  }
  const removeCorrections = (list: Correction[]) => { setDone((current) => ({ ...current, ...Object.fromEntries(list.map((correction) => [correction.id, 'dismissed' as const])) })); setSelectedFix({}); };

  // ---- Work packages: grouping editor helpers.
  const sectionGroup = useMemo(() => { const map = new Map<number, number>(); groups.forEach((group, index) => group.sections.forEach((ref) => map.set(ref, index))); return map; }, [groups]);
  function moveSection(ref: number, to: number) {
    setGroups((current) => current.map((group, index) => ({ ...group, sections: index === to ? [...group.sections.filter((value) => value !== ref), ref].sort((a, b) => a - b) : group.sections.filter((value) => value !== ref) })));
    setConfirmApply(false);
  }
  async function applyGrouping() {
    if (!wp?.schedule) return;
    const usable = groups.filter((group) => group.sections.length);
    if (usable.some((group) => group.name.trim().length < 3)) { setError('Each package needs a name of at least 3 characters.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await call(`/api/projects/${projectId}/work-packages`, 'POST', { action: 'apply-grouping', currentScheduleId: wp.schedule.id, expectedRowVersion: rowVersion, groups: usable.map((group) => ({ name: group.name.trim(), sectionKeys: group.sections.map((ref) => wp.sections[ref].key) })) });
      setRowVersion(result.rowVersion); setConfirmApply(false);
      setMessage(`Applied ${usable.length} work packages. Set dates, locations and allowances again, then run the AI Check once more for sequence suggestions.`);
      // The earlier summary, insights and links describe packages that no longer exist; only the applied grouping stays.
      setWp({ ...wp, summary: 'Grouping applied. Run the AI Check again to review the new packages.', insights: [], sequence: [], schedule: { ...wp.schedule, rowVersion: result.rowVersion, packageCount: usable.length } });
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The grouping could not be applied.'); }
    finally { setBusy(false); }
  }
  const removeLinks = (indexes: number[]) => { if (!wp) return; const drop = new Set(indexes); setWp({ ...wp, sequence: wp.sequence.filter((_, index) => !drop.has(index)) }); setLinks({}); };
  async function addLinks(all = false) {
    if (!wp?.schedule) return;
    const chosen = wp.sequence.map((link, index) => ({ link, index })).filter(({ index }) => all || links[index]);
    if (!chosen.length) return;
    setBusy(true); setError(''); setMessage('');
    let version = rowVersion, added = 0;
    try {
      for (const { link } of chosen) {
        const result = await call(`/api/projects/${projectId}/work-packages`, 'POST', { action: 'dependency', currentScheduleId: wp.schedule.id, expectedRowVersion: version, predecessorId: link.before.id, successorId: link.after.id, dependencyType: 'FS', lagDays: 0, remarks: `AI Check: ${link.reason}`.slice(0, 500) });
        version = result.rowVersion; added++;
      }
      setMessage(`Added ${added} sequence ${added === 1 ? 'link' : 'links'}. Check that planned dates still respect them.`);
    } catch (caught) { setError(`${added ? `Added ${added}, then stopped: ` : ''}${caught instanceof Error ? caught.message : 'The link could not be added.'}`); }
    finally {
      // Links that were added leave the list even when a later one fails, so saving again does not repeat them.
      if (added) {
        const addedIndexes = new Set(chosen.slice(0, added).map((item) => item.index));
        setWp({ ...wp, sequence: wp.sequence.filter((_, index) => !addedIndexes.has(index)) }); setLinks({});
        router.refresh();
      }
      setRowVersion(version); setBusy(false);
    }
  }

  const result = scope === 'boq' ? boq : wp;
  return <section className={styles.panel} aria-labelledby={`ai-check-${scope}`}>
    <div className={styles.header}>
      <div>
        <h3 id={`ai-check-${scope}`} className={styles.title}>AI Check <span className={styles.badge}>Optional</span></h3>
        <p className={styles.muted}>{scope === 'boq'
          ? 'AI checks the BOQ for wrong sections, units, duplicates and unclear names. Nothing changes until you accept.'
          : 'AI suggests how to group sections into packages and their order. Nothing changes until you accept.'}</p>
      </div>
      <button type="button" className={result ? styles.secondary : styles.primary} disabled={busy} onClick={() => void run()}>{running ? 'Checking…' : result ? 'Run again' : 'Run AI Check'}</button>
    </div>
    {running && <AiThinking messages={scope === 'boq' ? AI_THINKING_MESSAGES.boq : AI_THINKING_MESSAGES.workPackages}
      note={`This usually takes 30–60 seconds.${scope === 'work-packages' ? ' You can keep working on other steps; the result will be here when you come back.' : ''}`} />}
    {error && <div className={styles.error} role="alert">{error}</div>}
    {message && <div className={styles.success} role="status">{message}</div>}

    {result && <div className={styles.summary}><strong>Summary.</strong> {result.summary}</div>}
    {result && <Insights insights={result.insights} />}

    {boq && <div className={styles.section}>
      <h4 className={styles.sectionTitle}>Suggested corrections ({boq.corrections.length})</h4>
      {!boq.corrections.length && <p className={styles.muted}>No item corrections suggested.</p>}
      {!!boq.corrections.length && !boq.editable && <p className={styles.muted}>This BOQ is {boq.versionStatus.toLowerCase()}; the baseline is locked, so these suggestions are for information. Correct them through a BOQ revision if needed.</p>}
      {!!boq.corrections.length && <div className={styles.tableWrap}><table className={styles.table}><thead><tr>{boq.editable && <th><input type="checkbox" aria-label="Select all open suggestions" checked={boq.corrections.some((correction) => !done[correction.id]) && boq.corrections.filter((correction) => !done[correction.id]).every((correction) => selectedFix[correction.id])} onChange={(event) => setSelectedFix(event.target.checked ? Object.fromEntries(boq.corrections.filter((correction) => !done[correction.id]).map((correction) => [correction.id, true])) : {})} /></th>}<th>Item</th><th>Field</th><th>Current → suggested (editable)</th><th>Why</th>{boq.editable && <th>Decision</th>}</tr></thead><tbody>
        {boq.corrections.map((correction) => {
          const state = done[correction.id];
          return <tr key={correction.id} style={state ? { opacity: 0.6 } : undefined}>
            {boq.editable && <td><input type="checkbox" aria-label={`Select suggestion for ${correction.item.itemCode}`} disabled={!!state || busy} checked={!!selectedFix[correction.id]} onChange={(event) => setSelectedFix((current) => ({ ...current, [correction.id]: event.target.checked }))} /></td>}
            <td><strong>{correction.item.itemCode}</strong><div className={styles.groupMeta}>{correction.item.description.slice(0, 80)}</div></td>
            <td>{FIELD_LABEL[correction.field]}</td>
            <td><div className={styles.strike}>{correction.current || '—'}</div>
              {correction.field === 'description'
                ? <textarea className={styles.input} rows={2} disabled={!boq.editable || !!state} value={edits[correction.id] ?? correction.proposed} onChange={(event) => setEdits((current) => ({ ...current, [correction.id]: event.target.value }))} aria-label={`Suggested ${FIELD_LABEL[correction.field]} for ${correction.item.itemCode}`} />
                : <input className={styles.input} disabled={!boq.editable || !!state} value={edits[correction.id] ?? correction.proposed} onChange={(event) => setEdits((current) => ({ ...current, [correction.id]: event.target.value }))} aria-label={`Suggested ${FIELD_LABEL[correction.field]} for ${correction.item.itemCode}`} />}
            </td>
            <td className={styles.groupMeta}>{correction.reason}</td>
            {boq.editable && <td>{state ? <span className={styles.groupMeta}>{state === 'accepted' ? 'Saved' : 'Removed'}</span> : <div className={styles.actions} style={{ marginTop: 0 }}>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => void saveCorrections([correction])}>Save</button>
              <button type="button" className={styles.ghost} disabled={busy} onClick={() => removeCorrections([correction])}>Remove</button>
            </div>}</td>}
          </tr>;
        })}
      </tbody></table></div>}
      {boq.editable && boq.corrections.some((correction) => !done[correction.id]) && (() => {
        const open = boq.corrections.filter((correction) => !done[correction.id]);
        const chosen = open.filter((correction) => selectedFix[correction.id]);
        return <div className={styles.actions}>
          <button type="button" className={styles.primary} disabled={busy || !chosen.length} onClick={() => void saveCorrections(chosen)}>Save selected ({chosen.length})</button>
          <button type="button" className={styles.secondary} disabled={busy} onClick={() => void saveCorrections(open)}>Save all ({open.length})</button>
          <button type="button" className={styles.ghost} disabled={busy || !chosen.length} onClick={() => removeCorrections(chosen)}>Remove selected</button>
          <button type="button" className={styles.ghost} disabled={busy} onClick={() => removeCorrections(open)}>Remove all</button>
        </div>;
      })()}
    </div>}

    {wp && <>
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Suggested package grouping ({groups.filter((group) => group.sections.length).length} packages from {wp.sections.length} BOQ sections)</h4>
        {wp.groupingEditable
          ? <p className={styles.muted}>Rename packages or move a section to another package, then accept. {wp.groupingAdjusted ? `${wp.groupingAdjusted} section(s) the AI did not place were added next to their neighbouring section; check them.` : ''}</p>
          : wp.groupingBlockedReason && <p className={styles.muted}>{wp.groupingBlockedReason}</p>}
        <ul className={styles.list} style={{ marginTop: 10 }}>{groups.map((group, index) => {
          const amount = group.sections.reduce((sum, ref) => sum + (wp.sections[ref]?.amount || 0), 0);
          return <li key={index} className={styles.group}>
            <div className={styles.groupHead}>
              {wp.groupingEditable
                ? <input className={styles.input} style={{ flex: 1 }} value={group.name} aria-label={`Package ${index + 1} name`} onChange={(event) => { const name = event.target.value; setGroups((current) => current.map((row, i) => (i === index ? { ...row, name } : row))); setConfirmApply(false); }} />
                : <span className={styles.insightTitle} style={{ flex: 1 }}>{index + 1}. {group.name}</span>}
              <span className={styles.groupMeta}>{group.sections.length} section{group.sections.length === 1 ? '' : 's'} · {peso(amount)}</span>
            </div>
            {group.reason && <p className={styles.reason}>{group.reason}</p>}
            {group.sections.map((ref) => <div key={ref} className={styles.sectionRow}><span>{wp.sections[ref].name} <span className={styles.groupMeta}>· {wp.sections[ref].items} items</span></span>
              {wp.groupingEditable && <select aria-label={`Move ${wp.sections[ref].name}`} value={sectionGroup.get(ref) ?? index} onChange={(event) => moveSection(ref, Number(event.target.value))}>{groups.map((target, targetIndex) => <option key={targetIndex} value={targetIndex}>{targetIndex === index ? 'Keep here' : `Move to: ${target.name.slice(0, 50) || `Package ${targetIndex + 1}`}`}</option>)}</select>}</div>)}
            {!group.sections.length && <p className={styles.groupMeta}>Empty: this package will be skipped.</p>}
          </li>;
        })}</ul>
        <div className={styles.actions}>
          {wp.groupingEditable && wp.schedule && <>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => setGroups((current) => [...current, { name: `New package ${current.length + 1}`, reason: '', sections: [] }])}>Add empty package</button>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => (confirmApply ? void applyGrouping() : setConfirmApply(true))}>{confirmApply ? `Confirm: replace ${wp.schedule.packageCount} current package${wp.schedule.packageCount === 1 ? '' : 's'}` : 'Accept this grouping'}</button>
            {confirmApply && <button type="button" className={styles.ghost} onClick={() => setConfirmApply(false)}>Cancel</button>}
          </>}
        </div>
        {confirmApply && wp.schedule && wp.schedule.packageCount > 0 && <p className={styles.muted}>Accepting replaces the current draft packages with this grouping. Their dates, locations, allowances and sequence links are cleared and must be set again. The approved BOQ is not changed.</p>}
      </div>
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Suggested sequence links ({wp.sequence.length})</h4>
        {!wp.sequence.length && <p className={styles.muted}>No new links suggested for the current packages.</p>}
        {!!wp.sequence.length && <><ul className={styles.list}>{wp.sequence.map((link, index) => <li key={index} className={styles.insight}><label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={!!links[index]} disabled={!wp.sequenceEditable} onChange={(event) => setLinks((current) => ({ ...current, [index]: event.target.checked }))} />
          <span style={{ flex: 1 }}><span className={styles.insightTitle}>{link.before.label} → {link.after.label}</span><span className={styles.muted} style={{ display: 'block' }}>Finish before start · {link.reason}</span></span>
          {wp.sequenceEditable && <button type="button" className={styles.ghost} disabled={busy} onClick={(event) => { event.preventDefault(); removeLinks([index]); }}>Remove</button>}</label></li>)}</ul>
          {wp.sequenceEditable && (() => {
            const chosen = wp.sequence.map((_, index) => index).filter((index) => links[index]);
            return <div className={styles.actions}>
              <button type="button" className={styles.primary} disabled={busy || !chosen.length} onClick={() => void addLinks()}>Save selected ({chosen.length})</button>
              <button type="button" className={styles.secondary} disabled={busy} onClick={() => void addLinks(true)}>Save all ({wp.sequence.length})</button>
              <button type="button" className={styles.ghost} disabled={busy || !chosen.length} onClick={() => removeLinks(chosen)}>Remove selected</button>
              <button type="button" className={styles.ghost} disabled={busy} onClick={() => removeLinks(wp.sequence.map((_, index) => index))}>Remove all</button>
            </div>;
          })()}</>}
      </div>
    </>}
    {result && <p className={styles.muted} style={{ marginTop: 14 }}>AI can be wrong. Review before accepting.</p>}
  </section>;
}
