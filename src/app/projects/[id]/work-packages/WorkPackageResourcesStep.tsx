'use client';

import { useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import SideDrawer from '@/components/ui/SideDrawer';
import WorkPackageDetailsPanel from './WorkPackageDetailsPanel';
import BulkDupaUpload from './BulkDupaUpload';
import { packageAllowanceStatus } from '@/lib/scheduling/wps-overview';
import { wpsAllowancesRequired } from '@/lib/scheduling/wps-capacity-mode';
import type { ModuleSchedule } from './module-types';
import styles from '../planning/planning.module.css';
import own from './locations-step.module.css';


const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
const KINDS = ['MATERIAL', 'LABOR', 'EQUIPMENT'] as const;
const KIND_LABEL = { MATERIAL: 'Materials', LABOR: 'Labor', EQUIPMENT: 'Equipment' } as const;
const ERRORS: Record<string, string> = {
  SCHEDULE_VERSION_CONFLICT: 'This plan changed in another session. Refresh the page and try again.',
  NO_RESOURCE_ALLOWANCES: 'A package has no allowances to confirm yet. Suggest allowances first.',
  PLANNING_EDIT_PERMISSION_REQUIRED: 'You do not have permission to edit this plan.',
};

type Props = {
  projectId: string;
  schedule: ModuleSchedule;
  members: { id: string; name: string }[];
  canEdit: boolean;
  onSaved: () => void;
  /** Opens a package's own panel on its DUPA tab. */
  onOpenDupa: (activityId: string) => void;
};

type Standing = 'missing' | 'over' | 'review' | 'confirmed';

/**
 * Step "Resources & DUPA" for someone new to it: one line says what is left, one button handles the usual case
 * (confirm the suggested allowances), and one row per package shows its money and status. Line-level detail
 * opens in a side panel; the DUPA rules are a short help note.
 */
export default function WorkPackageResourcesStep({ projectId, schedule, members, canEdit, onSaved, onOpenDupa }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openId, setOpenId] = useState('');
  const [confirmRemove, setConfirmRemove] = useState('');
  const [method, setMethod] = useState<'confirm' | 'dupa' | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const resources = schedule.details.resources;
  const reviewNeeded = schedule.details.resourcesReviewNeeded ?? {};

  const allKinds = wpsAllowancesRequired();
  const rows = packageAllowanceStatus({
    activities: schedule.activities, allocations: schedule.allocations,
    resources, uploads: schedule.details.breakdownUploads ?? [],
  }).map((row) => {
    const lines = resources.filter((item) => item.activityId === row.id);
    const split = KINDS.map((kind) => ({ kind, amount: lines.filter((item) => item.kind === kind).reduce((sum, item) => sum + Number(item.amount || 0), 0), present: lines.some((item) => item.kind === kind) }));
    const unreviewed = lines.some((item) => item.isSystemSuggested) || !!reviewNeeded[row.id];
    // Missing = no allowances at all; a missing kind only counts when all three kinds are required.
    const standing: Standing = (allKinds ? split.some((item) => !item.present) : !lines.length) ? 'missing' : !row.allowanceWithinValue ? 'over' : unreviewed ? 'review' : 'confirmed';
    return { ...row, lines: lines.length, split, standing };
  });
  const missing = rows.filter((row) => row.standing === 'missing');
  const toConfirm = rows.filter((row) => row.standing === 'review');
  const over = rows.filter((row) => row.standing === 'over');
  // Upload DUPA is the first choice and is selected until the user picks.
  const chosen = method ?? 'dupa';
  // With "Confirm suggested allowances" chosen, every package is listed so its suggested split can be checked first;
  // otherwise a package shows once its allowances are confirmed (or exceed the BOQ value and must be fixed).
  const listed = chosen === 'confirm' ? rows : rows.filter((row) => row.standing === 'confirmed' || row.standing === 'over');
  const boqValue = rows.reduce((sum, row) => sum + row.value, 0);
  const dupaCount = rows.filter((row) => row.dupa !== 'none').length;
  // DUPA vs BOQ (minutes 2026-11-09: the DUPAs should add up to the BOQ amount). Uses each package's latest upload.
  const uploads = schedule.details.breakdownUploads ?? [];
  const latestDupa = rows.flatMap((row) => {
    const own = uploads.filter((upload) => upload.activityId === row.id).sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)))[0];
    return own ? [{ value: row.value, total: own.rows.reduce((sum, line) => sum + Number(line.amount || 0), 0) }] : [];
  });
  const dupaTotal = latestDupa.reduce((sum, item) => sum + item.total, 0);
  const dupaBoqValue = latestDupa.reduce((sum, item) => sum + item.value, 0);
  const open = rows.find((row) => row.id === openId);
  const openActivity = schedule.activities.find((activity) => activity.id === openId);

  async function post(action: string, fields: Record<string, unknown>, doneText: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/work-packages/details`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ scheduleId: schedule.id, expectedRowVersion: schedule.rowVersion, action, fields }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        const code = result?.error ?? '';
        throw new Error(ERRORS[code] ?? (code ? code.replaceAll('_', ' ').toLocaleLowerCase() : 'The change could not be saved.'));
      }
      setNotice(doneText);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The change could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  function openLines(id: string, from: HTMLElement) { opener.current = from; setOpenId(id); }
  function closeLines() {
    setOpenId('');
    const from = opener.current; opener.current = null;
    if (from) setTimeout(() => { if (from.isConnected) from.focus(); }, 0);
  }
  const label = (row: { code: string | null; name: string }) => `${row.code ? `${row.code} · ` : ''}${row.name}`;
  const badge = (row: (typeof rows)[number]) => row.standing === 'confirmed'
    ? <span className={own.done}>{row.dupa === 'applied' ? '✓ DUPA applied' : '✓ Confirmed'}</span>
    : row.standing === 'review' ? <span className={own.todo}>Suggested · check and confirm</span>
    : row.standing === 'over' ? <span className={own.bad}>Above BOQ value</span>
    // A package with some lines (e.g. a DUPA without equipment) is told what is missing, not "No allowances yet".
    : <span className={own.todo}>{row.lines ? `No ${row.split.filter((item) => !item.present).map((item) => KIND_LABEL[item.kind].toLowerCase()).join(' or ')} lines` : 'No allowances yet'}</span>;

  return <>

    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.success} role="status" style={{ marginBottom: 16 }}>{notice}</p>}

    {canEdit && missing.length > 0 && <section className={styles.panel} aria-labelledby="wp-res-suggest-heading">
      <h3 id="wp-res-suggest-heading">Start with suggested allowances</h3>
      <p className={styles.muted}>{missing.length === rows.length ? 'No package has allowances yet.' : `${missing.length} ${missing.length === 1 ? 'package has' : 'packages have'} no complete allowances yet.`} The system can split each package’s BOQ value into materials, labor and equipment for you. You check them next; existing lines are kept.</p>
      <div className={styles.actions} style={{ marginTop: 14 }}><button className={styles.button} type="button" disabled={busy} onClick={() => void post('suggest-resources', {}, 'Suggested allowances added. Check them below, then confirm.')}>{busy ? 'Working…' : `Suggest allowances for ${missing.length} ${missing.length === 1 ? 'package' : 'packages'}`}</button></div>
    </section>}

    {/* Two ways to set the allowances: upload DUPAs, or confirm the suggested split. Only the chosen one is shown. */}
    {canEdit && rows.length > 0 && <section className={styles.panel} aria-labelledby="wp-res-method-heading">
      <h3 id="wp-res-method-heading">Set the allowances</h3>
      <div className={own.choiceGroup} role="radiogroup" aria-labelledby="wp-res-method-heading">
        <button type="button" role="radio" aria-checked={chosen === 'dupa'} className={`${own.choice} ${chosen === 'dupa' ? own.choiceOn : ''}`} onClick={() => setMethod('dupa')}>
          <strong>Upload DUPA</strong><span>{dupaCount ? `${dupaCount} uploaded` : 'Use your own cost breakdown'}</span>
        </button>
        <button type="button" role="radio" aria-checked={chosen === 'confirm'} className={`${own.choice} ${chosen === 'confirm' ? own.choiceOn : ''}`} onClick={() => setMethod('confirm')}>
          <strong>Confirm suggested allowances</strong><span>{toConfirm.length ? `${toConfirm.length} ${toConfirm.length === 1 ? 'package' : 'packages'} to confirm` : 'Nothing to confirm'}</span>
        </button>
      </div>
      {chosen === 'confirm' && (toConfirm.length
        ? <div className={styles.actions} style={{ marginTop: 16 }}><button className={styles.button} type="button" disabled={busy} onClick={() => void post('confirm-resources', { activityIds: toConfirm.map((row) => row.id) }, `Allowances confirmed for ${toConfirm.length} ${toConfirm.length === 1 ? 'package' : 'packages'}.`)}>{busy ? 'Working…' : `Confirm all ${toConfirm.length} ${toConfirm.length === 1 ? 'package' : 'packages'}`}</button></div>
        : <p className={styles.muted} style={{ marginTop: 16 }}>No suggested allowances are waiting to be confirmed.</p>)}
    </section>}

    {dupaCount > 0 && <p className={styles.muted} role="note" style={{ marginBottom: 16, color: Math.abs(dupaTotal - dupaBoqValue) > dupaBoqValue * 0.05 ? '#fcd34d' : undefined }}>
      DUPA total {money(dupaTotal)} vs the BOQ value of those {dupaCount} {dupaCount === 1 ? 'package' : 'packages'} {money(dupaBoqValue)}{dupaBoqValue > 0 ? ` (${(dupaTotal / dupaBoqValue * 100).toFixed(1)}%)` : ''}.{dupaCount < rows.length ? ` ${rows.length - dupaCount} ${rows.length - dupaCount === 1 ? 'package has' : 'packages have'} no DUPA; the whole BOQ is ${money(boqValue)}.` : ''}
    </p>}

    {canEdit && rows.length > 0 && chosen === 'dupa' && <BulkDupaUpload projectId={projectId} scheduleId={schedule.id} rowVersion={schedule.rowVersion} packages={rows.map((row) => ({ id: row.id, code: row.code, name: row.name, value: row.value }))} onSaved={onSaved} onOpenDupa={onOpenDupa} />}

    {over.length > 0 && <p className={styles.error} role="note" style={{ marginBottom: 16 }}>{over.length} {over.length === 1 ? 'package has' : 'packages have'} allowances above the BOQ value ({over.map((row) => row.code || row.name).join(', ')}). Open its lines and lower them before the plan can be approved.</p>}

    {/* Every uploaded DUPA in the plan, with edit (open it on its package) and remove (take it off and put back the
        allowances it replaced). */}
    {uploads.length > 0 && <section className={styles.panel} aria-labelledby="wp-res-dupas-heading">
      <h3 id="wp-res-dupas-heading">Uploaded DUPAs ({uploads.length})</h3>
      <div className={styles.scroll} role="region" aria-label="Uploaded DUPAs" tabIndex={0}><table className={styles.table}>
        <thead><tr><th>Package</th><th>DUPA</th><th style={{ textAlign: 'right' }}>Total</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{uploads.map((upload) => {
          const pkg = rows.find((row) => row.id === upload.activityId);
          const total = upload.rows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
          return <tr key={upload.id}>
            <td style={{ whiteSpace: 'nowrap' }}>{pkg ? <><span className={own.pkgCode}>{pkg.code}</span> {pkg.name}</> : '—'}</td>
            <td style={{ whiteSpace: 'normal', minWidth: 220 }}>{upload.fileName.replace(/\.[^.]+$/, '')}</td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(total)}</td>
            <td>{upload.appliedAt ? <span className={own.done}>Applied</span> : <span className={styles.muted}>Not applied</span>}</td>
            <td style={{ whiteSpace: 'nowrap' }}><div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className={`${styles.secondary} ${own.small}`} title="Open this DUPA on its package" aria-label={`Edit ${upload.fileName}`} onClick={() => onOpenDupa(upload.activityId)}><Pencil size={15} aria-hidden="true" /></button>
              {canEdit && <button type="button" className={`${confirmRemove === upload.id ? styles.button : styles.secondary} ${own.small}`} disabled={busy} title={confirmRemove === upload.id ? 'Click again to remove' : 'Remove this DUPA'} aria-label={`Remove ${upload.fileName}`}
                onClick={() => { if (confirmRemove !== upload.id) { setConfirmRemove(upload.id); return; } setConfirmRemove(''); void post('remove-dupas', { uploadId: upload.id }, `DUPA removed${upload.appliedAt ? '; the allowances it replaced are back' : ''}.`); }}>
                {confirmRemove === upload.id ? 'Confirm' : <Trash2 size={15} aria-hidden="true" />}</button>}
            </div></td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>}

    {listed.length > 0 && <section className={styles.panel} aria-labelledby="wp-res-packages-heading">
      <h3 id="wp-res-packages-heading">Allowances by package</h3>
      <p className={styles.muted}>Allowances are planning budgets for materials, labor and equipment. They are not actual costs or purchases.</p>
      <ul className={own.pkgList} aria-label="Allowances by package">
        {listed.map((row) => {
          const share = row.value > 0 ? Math.round((row.allowance / row.value) * 100) : 0;
          return <li key={row.id} className={own.pkgCard}>
            <div className={own.pkgName}>
              <strong>{row.code && <span className={own.pkgCode}>{row.code}</span>}{row.name}</strong>
              {badge(row)}
            </div>
            <div className={own.pkgMoney}>
              <p><strong>{money(row.allowance)}</strong> <span className={styles.muted}>of {money(row.value)} BOQ{row.value > 0 ? ` · ${share}%` : ''}</span></p>
              <div className={own.meter} aria-hidden="true"><span className={row.standing === 'over' ? own.meterOver : undefined} style={{ width: `${Math.min(100, share)}%` }} /></div>
              {row.lines > 0 && <small className={own.split}>{row.split.map((item) => `${KIND_LABEL[item.kind]} ${money(item.amount)}`).join(' · ')}</small>}
            </div>
            <div className={own.pkgActions}>
              {canEdit && row.standing === 'review' && <button className={`${styles.button} ${own.small}`} type="button" disabled={busy} onClick={() => void post('confirm-resources', { activityId: row.id }, `Allowances confirmed for ${row.code || row.name}.`)}>Confirm</button>}
              <button className={`${styles.secondary} ${own.small}`} type="button" aria-label={`${canEdit ? 'Edit' : 'View'} allowance lines for ${label(row)}`} onClick={(event) => openLines(row.id, event.currentTarget)}>{canEdit ? 'Edit lines' : 'View lines'}</button>
              {/* Above its BOQ value because of its DUPA: Remove takes the DUPA off and puts back the allowances it replaced. */}
              {canEdit && row.standing === 'over' && row.dupa !== 'none'
                ? <button className={`${confirmRemove === row.id ? styles.button : styles.secondary} ${own.small}`} type="button" disabled={busy} aria-label={`Remove the DUPA of ${label(row)}`}
                  onClick={() => { if (confirmRemove !== row.id) { setConfirmRemove(row.id); return; } setConfirmRemove(''); void post('remove-dupas', { activityId: row.id }, `DUPA removed from ${row.code || row.name}; its previous allowances are back.`); }}>
                  {confirmRemove === row.id ? 'Confirm remove' : 'Remove'}</button>
                : <button className={`${styles.secondary} ${own.small}`} type="button" aria-label={`DUPA for ${label(row)}`} onClick={() => onOpenDupa(row.id)}>{row.dupa === 'none' ? (canEdit ? 'Upload DUPA' : 'DUPA') : 'Open DUPA'}</button>}
            </div>
          </li>;
        })}
      </ul>
    </section>}

    <details className={own.subAreas}>
      <summary>What is a DUPA, and do I need one? <span>(optional)</span></summary>
      <ul className={own.helpList}>
        <li><strong>A DUPA</strong> (Detailed Unit Price Analysis) is your own cost breakdown for a package. Uploading one is optional; the suggested allowances are enough to plan.</li>
        <li><strong>It never changes the BOQ.</strong> A package’s BOQ scope and value stay the same. A DUPA only replaces or adds to that package’s allowance lines, you choose which, and the original file is kept.</li>
        <li><strong>The one rule:</strong> each package’s allowances must stay below its BOQ value before the plan can be approved.</li>
      </ul>
    </details>

    {open && openActivity && <SideDrawer wide title={label(open)} meta={<>BOQ value {money(open.value)} · Allowances {money(open.allowance)}</>} onClose={closeLines}
      footer={<><span className={styles.muted}>{open.dupa === 'none' ? 'No DUPA uploaded' : open.dupa === 'applied' ? 'DUPA applied' : 'DUPA uploaded, not applied yet'}</span><button type="button" className={own.linkButton} onClick={() => { const id = open.id; setOpenId(''); onOpenDupa(id); }}>{open.dupa === 'none' ? 'Upload DUPA →' : 'Open DUPA →'}</button></>}>
      <WorkPackageDetailsPanel key={`resources-${open.id}`} projectId={projectId} scheduleId={schedule.id} rowVersion={schedule.rowVersion}
        details={{ ...schedule.details, resources: resources.filter((item) => item.activityId === open.id) }}
        activities={[openActivity]} members={members} canEdit={canEdit} view="resources" packageScoped packageValue={open.value} onSaved={onSaved} />
    </SideDrawer>}
  </>;
}
