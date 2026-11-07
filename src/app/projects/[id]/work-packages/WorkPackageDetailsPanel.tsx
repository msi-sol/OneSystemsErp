'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import SideDrawer from '@/components/ui/SideDrawer';
import Decimal from 'decimal.js';
import { CONSTRAINT_TYPE_LABEL, CONSTRAINT_TYPES } from '@/lib/scheduling/work-package-constraints';
import { formatLocationPath } from '@/lib/scheduling/work-package-location';
import styles from '../planning/planning.module.css';
import stepStyles from './locations-step.module.css';
import { estimatePhPublicWorksBudget } from '@/lib/scheduling/work-package-budget';
import type { WorkPackagePlanDetails } from '@/lib/scheduling/work-package-details-types';

type Location = { id: string; name: string; parentId: string | null;code?:string;type?:string;isActive?:boolean };
type Constraint = {
  id: string; activityId: string | null; description: string; ownerId: string | null;
  neededBy: string | null; blocking: boolean; status: 'OPEN' | 'RESOLVED'; resolution: string | null;
  locationId?: string | null;
  type?:string;title?:string;
};
type Resource = {
  id: string; activityId: string | null; kind: 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | 'ALLOWANCE';
  description: string; unit: string; quantity: string; unitCost: string; amount: string;
};
type Details = WorkPackagePlanDetails;
type Activity = { id: string; activityCode: string | null; name: string };
type Member = { id: string; name: string };
type View = 'locations' | 'constraints' | 'resources';

type Props = {
  projectId: string;
  scheduleId: string;
  rowVersion: number;
  details: Details;
  activities: Activity[];
  members: Member[];
  canEdit: boolean;
  view: View;
  packageScoped?: boolean;
  /** The package's BOQ value (package view only): shows each type's original BOQ share next to its allowance. */
  packageValue?: number;
  onSaved: () => void;
};

type LocationFields = { id: string; name: string; parentId: string;code:string;type:string };
type ConstraintFields = {
  id: string; activityId: string; description: string; ownerId: string;
  neededBy: string; blocking: boolean; status: 'OPEN' | 'RESOLVED'; resolution: string;
  type:string;title:string;
};
type ResourceFields = {
  id: string; activityId: string; kind: Resource['kind']; description: string;
  unit: string; quantity: string; unitCost: string; amount: string;
};

const emptyLocation = (): LocationFields => ({ id: '', name: '', parentId: '',code:'',type:'' });
const emptyConstraint = (): ConstraintFields => ({ id: '', activityId: '', description: '', ownerId: '', neededBy: '', blocking: true, status: 'OPEN', resolution: '',type:'OTHER',title:'' });
const emptyResource = (): ResourceFields => ({ id: '', activityId: '', kind: 'MATERIAL', description: '', unit: '', quantity: '', unitCost: '', amount: '' });

const errorMessages: Record<string, string> = {
  PROJECT_ACCESS_DENIED: 'You do not have access to edit these work package details.',
  SCHEDULE_VERSION_CONFLICT: 'This plan changed in another session. Refresh the page and try again.',
  SCHEDULE_NOT_EDITABLE_IN_CURRENT_STATUS: 'This plan is locked for edits in its current status.',
  INVALID_LOCATION_PARENT: 'Choose a valid parent location. A location cannot be its own parent.',
  LOCATION_IN_USE: 'This location is still referenced by a package or constraint. Reassign those records first.',
  RESOLUTION_REQUIRED: 'Add a resolution note before marking a constraint resolved.',
  RESOLVED_CONSTRAINT_REQUIRES_RESOLUTION: 'Add a resolution note before marking a constraint resolved.',
  RESOURCES_ALREADY_EXIST: 'Resource allowances can only be created when this plan has no resources.',
  INVALID_AMOUNT: 'Enter a valid nonnegative amount with up to two decimal places.',
  INVALID_QUANTITY: 'Enter a valid nonnegative quantity.',
  DETAILS_LIMIT_REACHED: 'This plan has reached its supported limit for this detail type.',
};

function displayError(code: unknown) {
  if (typeof code !== 'string') return 'The change could not be saved. Check the fields and try again.';
  return errorMessages[code] ?? (code.length < 160 ? code.replaceAll('_', ' ').toLocaleLowerCase() : 'The change could not be saved. Refresh the page and try again.');
}

function apiError(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return typeof record.error === 'string' ? record.error : typeof record.code === 'string' ? record.code : null;
}

function ActivitySelect({ id, value, activities, onChange, label = 'Work package' }: {
  id: string; value: string; activities: Activity[]; onChange: (value: string) => void; label?: string;
}) {
  return <div>
    <label htmlFor={id}>{label}</label>
    <select id={id} required value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Choose work package</option>
      {activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.activityCode ? `${activity.activityCode} · ` : ''}{activity.name}</option>)}
    </select>
  </div>;
}

export default function WorkPackageDetailsPanel({ projectId, scheduleId, rowVersion, details, activities, members, canEdit, view, onSaved, packageScoped = false, packageValue }: Props) {
  const [versionOverride, setVersionOverride] = useState({ source: rowVersion, value: rowVersion });
  const version = versionOverride.source === rowVersion ? versionOverride.value : rowVersion;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [location, setLocation] = useState<LocationFields>(emptyLocation);
  const [constraint, setConstraint] = useState<ConstraintFields>(emptyConstraint);
  const [resource, setResource] = useState<ResourceFields>(emptyResource);
  const [removeLocationId, setRemoveLocationId] = useState('');
  const [removeResourceId, setRemoveResourceId] = useState('');
  const [constraintFormOpen, setConstraintFormOpen] = useState(false);
  const [resourceFormOpen, setResourceFormOpen] = useState(false);
  const [resolving, setResolving] = useState<{ id: string; note: string } | null>(null);
  const constraintOpener = useRef<HTMLElement | null>(null);

  const visibleLocations = useMemo(() => [...details.locations].sort((a, b) => a.name.localeCompare(b.name)), [details.locations]);
  const parentName = (parentId: string | null) => parentId ? details.locations.find((item) => item.id === parentId)?.name ?? 'Missing parent' : 'Project-wide';
  const activityName = (activityId: string | null) => activityId ? activities.find((item) => item.id === activityId)?.name ?? 'Unknown work package' : 'Whole project';
  const memberName = (memberId: string | null) => memberId ? members.find((item) => item.id === memberId)?.name ?? 'Unassigned member' : 'Unassigned';
  function isDescendant(candidateId: string, locationId: string): boolean {
    let current = details.locations.find((item) => item.id === candidateId);
    const visited = new Set<string>();
    while (current?.parentId && !visited.has(current.id)) {
      if (current.parentId === locationId) return true;
      visited.add(current.id);
      current = details.locations.find((item) => item.id === current?.parentId);
    }
    return false;
  }

  async function mutate(action: string, fields?: Record<string, unknown>, doneText = 'Saved.'): Promise<boolean> {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/work-packages/details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ scheduleId, expectedRowVersion: version, action, ...(fields ? { fields } : {}) }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(displayError(apiError(result)));
      const resultRecord = result && typeof result === 'object' ? result as Record<string, unknown> : {};
      if (typeof resultRecord.rowVersion === 'number' && Number.isSafeInteger(resultRecord.rowVersion)) setVersionOverride({ source: rowVersion, value: resultRecord.rowVersion });
      setSuccess(doneText);
      setRemoveLocationId('');
      setRemoveResourceId('');
      onSaved();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The change could not be saved. Refresh the page and try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await mutate('location', { id: location.id || undefined, name: location.name.trim(), parentId: location.parentId || null,code:location.code,type:location.type }, location.id ? 'Location updated.' : 'Location added.');
    if (saved) setLocation(emptyLocation());
  }
  function editLocation(item: Location) {
    setLocation({ id: item.id, name: item.name, parentId: item.parentId ?? '',code:item.code||'',type:item.type||'' });
    setError(''); setSuccess('');
  }
  // Constraints are optional: the form opens on demand (a side panel; inline inside a package panel, which is itself a side panel).
  function openConstraintForm(next: ConstraintFields, opener: HTMLElement) {
    constraintOpener.current = opener;
    setConstraint(next); setConstraintFormOpen(true); setResolving(null);
    setError(''); setSuccess('');
  }
  function openNewConstraint(opener: HTMLElement) {
    openConstraintForm({ ...emptyConstraint(), activityId: packageScoped && activities.length === 1 ? activities[0].id : '' }, opener);
  }
  function closeConstraintForm() {
    setConstraintFormOpen(false); setConstraint(emptyConstraint()); setError('');
    const opener = constraintOpener.current;
    constraintOpener.current = null;
    if (opener) setTimeout(() => { if (opener.isConnected) opener.focus(); }, 0);
  }
  async function saveConstraint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = constraint.title.trim();
    const saved = await mutate('constraint', {
      id: constraint.id || undefined, activityId: constraint.activityId || null,
      description: constraint.description.trim() || title, ownerId: constraint.ownerId || null,
      neededBy: constraint.neededBy || null, blocking: constraint.blocking,
      status: constraint.status, resolution: constraint.resolution.trim() || null,
      type:constraint.type,title,
    }, constraint.id ? 'Constraint updated.' : 'Constraint recorded.');
    if (saved) closeConstraintForm();
  }
  function editConstraint(item: Constraint, opener: HTMLElement) {
    const title = item.title || item.description;
    openConstraintForm({ id: item.id, activityId: item.activityId ?? '', description: item.description === title ? '' : item.description, ownerId: item.ownerId ?? '', neededBy: item.neededBy ?? '', blocking: item.blocking, status: item.status, resolution: item.resolution ?? '',type:item.type||'OTHER',title }, opener);
  }
  async function resolveConstraint(item: Constraint, note: string) {
    const saved = await mutate('constraint', {
      id: item.id, activityId: item.activityId, description: item.description, ownerId: item.ownerId,
      neededBy: item.neededBy, blocking: item.blocking, status: 'RESOLVED', resolution: note.trim(),
      type: item.type || 'OTHER', title: item.title || item.description,
    }, 'Constraint resolved.');
    if (saved) setResolving(null);
  }
  const constraintTypeLabel = (type?: string) => (CONSTRAINT_TYPE_LABEL as Record<string, string>)[type || 'OTHER'] ?? 'Other';
  const constraintForm = <form onSubmit={saveConstraint}>
    {packageScoped && <h4>{constraint.id ? 'Edit constraint' : 'Add a constraint'}</h4>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.fields}>
      <div><label htmlFor="wp-constraint-type">What kind?</label><select id="wp-constraint-type" value={constraint.type} onChange={e=>setConstraint({...constraint,type:e.target.value})}>{CONSTRAINT_TYPES.map(type=><option key={type} value={type}>{CONSTRAINT_TYPE_LABEL[type]}</option>)}</select></div>
      <div><label htmlFor="wp-constraint-title">What could hold up the work?</label><input id="wp-constraint-title" type="text" required maxLength={191} placeholder="e.g. Barangay permit for road closure" value={constraint.title} onChange={e=>setConstraint({...constraint,title:e.target.value})}/></div>
      <ActivitySelect id="wp-constraint-activity" label="Which package does it affect?" value={constraint.activityId} activities={activities} onChange={(activityId) => setConstraint({ ...constraint, activityId })} />
      <div><label htmlFor="wp-constraint-owner">Who will clear it?</label><select id="wp-constraint-owner" value={constraint.ownerId} onChange={(event) => setConstraint({ ...constraint, ownerId: event.target.value })}><option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></div>
      <div><label htmlFor="wp-constraint-needed-by">Needed by</label><input id="wp-constraint-needed-by" type="date" value={constraint.neededBy} onChange={(event) => setConstraint({ ...constraint, neededBy: event.target.value })} /></div>
      {constraint.id && <div><label htmlFor="wp-constraint-status">Status</label><select id="wp-constraint-status" value={constraint.status} onChange={(event) => setConstraint({ ...constraint, status: event.target.value as ConstraintFields['status'] })}><option value="OPEN">Open</option><option value="RESOLVED">Resolved</option></select></div>}
    </div>
    {constraint.status === 'RESOLVED' && <div className={styles.fields}><div style={{ gridColumn: '1 / -1' }}><label htmlFor="wp-constraint-resolution">How was it resolved? (required)</label><textarea id="wp-constraint-resolution" rows={2} maxLength={10000} value={constraint.resolution} onChange={(event) => setConstraint({ ...constraint, resolution: event.target.value })} /></div></div>}
    <details className={stepStyles.moreOptions} open={!!constraint.description}>
      <summary>More detail (optional)</summary>
      <div className={styles.fields}>
        <div style={{ gridColumn: '1 / -1' }}><label htmlFor="wp-constraint-description">Notes or required action</label><textarea id="wp-constraint-description" maxLength={10000} rows={3} value={constraint.description} onChange={(event) => setConstraint({ ...constraint, description: event.target.value })} /></div>
        <label style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={constraint.blocking} onChange={(event) => setConstraint({ ...constraint, blocking: event.target.checked })} /> It must be cleared before the package can start. An open one needs an owner and a needed-by date before the plan can be approved.</label>
      </div>
    </details>
    <div className={styles.actions}><button className={styles.button} type="submit" disabled={busy || !constraint.title.trim() || (constraint.status === 'RESOLVED' && !constraint.resolution.trim())}>{busy ? 'Saving…' : constraint.id ? 'Save constraint' : 'Add constraint'}</button><button className={styles.secondary} type="button" disabled={busy} onClick={closeConstraintForm}>Cancel</button></div>
  </form>;
  async function saveResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await mutate('resource', {
      id: resource.id || undefined, activityId: resource.activityId || null,
      kind: resource.kind, description: resource.description.trim(), unit: resource.unit.trim(),
      quantity: resource.quantity.trim(), unitCost: resource.unitCost.trim(),
    }, resource.id ? 'Line updated.' : 'Line added.');
    if (saved) { setResource(emptyResource()); setResourceFormOpen(false); }
  }
  function editResource(item: Resource) {
    setResource({ id: item.id, activityId: item.activityId ?? '', kind: item.kind, description: item.description, unit: item.unit, quantity: item.quantity, unitCost: item.unitCost, amount: item.amount });
    setResourceFormOpen(true);
    setError(''); setSuccess('');
  }

  const title = view === 'locations' ? 'Locations' : view === 'constraints' ? 'Constraints (optional)' : packageScoped ? 'Allowance lines' : 'Resources and allowances';
  const intro = view === 'locations'
    ? 'Group scope by work area or site location. Locations describe where work takes place.'
    : view === 'constraints'
      ? 'Anything that could hold up a package (site access, permits, approvals, deliveries), who will clear it and by when. Skip this if there is nothing yet.'
      : packageScoped ? 'Planned materials, labor and equipment for this package. Amount = quantity × rate. These are planning budgets, not actual costs.' : 'Record planned materials, labor, equipment, and explicit BOQ budget allowances. These are planning references, not actual costs.';

  return <section className={styles.panel} aria-labelledby={`details-${view}-heading`}>
    <div className={styles.titleRow}>
      <div>
        <h3 id={`details-${view}-heading`}>{title}</h3>
        <p className={styles.muted}>{intro}</p>
      </div>
      {!canEdit && <span className={styles.muted}>Read only</span>}
    </div>

    {error && !(view === 'constraints' && constraintFormOpen) && <p className={styles.error} role="alert">{error}</p>}
    {success && <p className={styles.success} role="status">{success}</p>}

    {view === 'locations' && <>
      {canEdit && <form onSubmit={saveLocation}>
        <h4>{location.id ? 'Edit location' : 'Add a location'}</h4>
        <div className={styles.fields}>
          <div><label htmlFor="wp-location-name">Location name</label><input id="wp-location-name" required maxLength={191} value={location.name} onChange={(event) => setLocation({ ...location, name: event.target.value })} /></div>
          <div><label htmlFor="wp-location-code">Code (optional)</label><input id="wp-location-code" value={location.code} onChange={e=>setLocation({...location,code:e.target.value})}/></div><div><label htmlFor="wp-location-type">Location type (optional)</label><input id="wp-location-type" value={location.type} onChange={e=>setLocation({...location,type:e.target.value})}/></div><div><label htmlFor="wp-location-parent">Parent location</label><select id="wp-location-parent" value={location.parentId} onChange={(event) => setLocation({ ...location, parentId: event.target.value })}><option value="">No parent · top level</option>{visibleLocations.filter((item) => item.isActive!==false && item.id !== location.id && (!location.id || !isDescendant(item.id, location.id))).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        </div>
        <div className={styles.actions}><button className={styles.button} type="submit" disabled={busy || !location.name.trim()}>{busy ? 'Saving…' : location.id ? 'Save location' : 'Add location'}</button>{location.id && <button className={styles.secondary} type="button" disabled={busy} onClick={() => setLocation(emptyLocation())}>Cancel edit</button>}</div>
      </form>}
      {details.locations.length === 0 ? <p className={styles.empty}>No locations recorded. Add a location when it helps clarify where a package will take place.</p> : <div className={styles.scroll} tabIndex={0} role="region" aria-label="Work package locations"><table className={styles.table}><caption className="sr-only">Work package locations</caption><thead><tr><th scope="col">Location</th><th scope="col">Parent</th>{canEdit && <th scope="col">Actions</th>}</tr></thead><tbody>{visibleLocations.map((item) => <tr key={item.id}><th scope="row">{item.code?`${item.code} · `:""}{formatLocationPath(details.locations,item.id)}{item.isActive===false?" · Archived":""}</th><td>{parentName(item.parentId)}</td>{canEdit && <td><div className={styles.actions}><button className={styles.secondary} type="button" disabled={busy} onClick={() => editLocation(item)}>Edit</button>{removeLocationId === item.id ? <><span>Archive this unused location?</span><button className={styles.secondary} type="button" disabled={busy} onClick={() => void mutate('remove-location', { id: item.id }, 'Location archived.')}>Remove</button><button className={styles.secondary} type="button" onClick={() => setRemoveLocationId('')}>Keep</button></> : <button className={styles.secondary} type="button" disabled={busy} onClick={() => setRemoveLocationId(item.id)}>Archive…</button>}</div></td>}</tr>)}</tbody></table></div>}
    </>}

    {view === 'constraints' && <>
      {details.constraints.length === 0
        ? <div className={`${styles.empty} ${stepStyles.emptyState}`}><p>No constraints yet — this is optional.</p><p className={styles.muted}>Add one only when something could hold up a package, such as site access, a permit, an approval or a late delivery.</p></div>
        : <div className={styles.scroll} tabIndex={0} role="region" aria-label="Plan constraints"><table className={styles.table}><caption className="sr-only">Plan constraints and resolutions</caption><thead><tr><th scope="col">Constraint</th><th scope="col">Package</th><th scope="col">Owner</th><th scope="col">Needed by</th><th scope="col">Status</th>{canEdit && <th scope="col">Actions</th>}</tr></thead><tbody>{details.constraints.map((item) => <tr key={item.id}>
          <th scope="row">{item.title || item.description}<span className={styles.muted}> · {constraintTypeLabel(item.type)}{item.blocking ? ' · Must clear before start' : ''}</span>{item.title && item.description && item.description !== item.title && <p className={styles.muted}>{item.description}</p>}{item.resolution && <p className={styles.muted}>Resolution: {item.resolution}</p>}</th>
          <td>{activityName(item.activityId)}</td><td>{memberName(item.ownerId)}</td><td>{item.neededBy || 'Not set'}</td><td>{item.status === 'RESOLVED' ? 'Resolved' : 'Open'}</td>
          {canEdit && <td>{resolving?.id === item.id
            ? <div className={stepStyles.resolveRow}><input type="text" aria-label="How was it resolved?" placeholder="How was it resolved?" maxLength={10000} value={resolving.note} onChange={(event) => setResolving({ id: item.id, note: event.target.value })} /><button className={styles.button} type="button" disabled={busy || !resolving.note.trim()} onClick={() => void resolveConstraint(item, resolving.note)}>Mark resolved</button><button className={styles.secondary} type="button" disabled={busy} onClick={() => setResolving(null)}>Cancel</button></div>
            : item.status === 'RESOLVED' ? <span className={styles.muted}>Resolved</span>
            : <div className={stepStyles.rowActions}><button className={styles.secondary} type="button" disabled={busy} onClick={(event) => editConstraint(item, event.currentTarget)}>Edit</button><button className={styles.secondary} type="button" disabled={busy} onClick={() => { setResolving({ id: item.id, note: '' }); setError(''); setSuccess(''); }}>Resolve</button></div>}</td>}
        </tr>)}</tbody></table></div>}
      {canEdit && (!constraintFormOpen || !packageScoped) && <div className={styles.actions} style={{ marginTop: 16 }}><button className={styles.secondary} type="button" disabled={busy} onClick={(event) => openNewConstraint(event.currentTarget)}>+ Add constraint</button></div>}
      {canEdit && constraintFormOpen && (packageScoped
        ? constraintForm
        : <SideDrawer title={constraint.id ? 'Edit constraint' : 'Add a constraint'} meta="Something that could hold up the work, who will clear it, and by when." onClose={closeConstraintForm}>{constraintForm}</SideDrawer>)}
    </>}

    {view === 'resources' && (() => {
      const kindLabel = { MATERIAL: 'Materials', LABOR: 'Labor', EQUIPMENT: 'Equipment', ALLOWANCE: 'Budget allowance' } as const;
      const peso = (value: string) => { const amount = Number(value); return Number.isFinite(amount) ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount) : value; };
      // Suggested lines are stored as "System suggested material allowance" / "Suggested labor allowance for <package>".
      const lineName = (item: { description: string; kind: keyof typeof kindLabel }) => /^(System suggested|Suggested) (material|labor|equipment) allowance/i.test(item.description) ? `${kindLabel[item.kind]} allowance` : item.description;
      const withoutLines = activities.filter((activity) => !details.resources.some((row) => row.activityId === activity.id));
      const toConfirm = activities.filter((activity) => details.resources.some((row) => row.activityId === activity.id) && (details.resources.some((row) => row.activityId === activity.id && row.isSystemSuggested) || details.resourcesReviewNeeded?.[activity.id]));
      const total = details.resources.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      // Original = this type's share of the package's BOQ value, before the direct-cost factor (e.g. 84%) is applied.
      // Shown when the package has a single line of that type (the suggested lines); several DUPA lines share one type.
      const ratios = packageScoped && packageValue != null && activities.length === 1 ? estimatePhPublicWorksBudget(packageValue, activities[0].name).ratios : null;
      const ratioKey = { MATERIAL: 'materials', LABOR: 'labor', EQUIPMENT: 'equipment' } as const;
      const original = (item: { kind: keyof typeof kindLabel }) => !ratios || packageValue == null || item.kind === 'ALLOWANCE' || details.resources.filter((row) => row.kind === item.kind).length !== 1 ? null : packageValue * ratios[ratioKey[item.kind]];
      const originals = details.resources.map((item) => original(item));
      const originalTotal = originals.every((value) => value !== null) && originals.length ? (originals as number[]).reduce((sum, value) => sum + value, 0) : null;
      const isLumpSum = (item: { quantity: string; unit: string }) => Number(item.quantity) === 1 && ['lot', 'allowance', 'ls', 'lump sum'].includes(item.unit.trim().toLowerCase());
      return <>
        {toConfirm.length > 0 && <div className={styles.status}>
          <p>{packageScoped ? 'These lines are system suggestions (or the package changed since they were checked). Check the amounts, then confirm them.' : `${toConfirm.length} ${toConfirm.length === 1 ? 'package has' : 'packages have'} suggested lines to check.`}</p>
          {canEdit && <div className={styles.actions} style={{ marginTop: 10 }}>{toConfirm.map((activity) => <button key={activity.id} className={styles.button} type="button" disabled={busy} onClick={() => void mutate('confirm-resources', { activityId: activity.id }, 'Allowances confirmed.')}>{packageScoped ? 'Confirm these allowances' : `Confirm ${activity.activityCode || activity.name}`}</button>)}</div>}
        </div>}
        {canEdit && withoutLines.length > 0 && <div className={`${styles.empty} ${stepStyles.emptyState}`} style={{ marginBottom: 16 }}>
          <p>{packageScoped ? 'This package has no allowance lines yet.' : `${withoutLines.length} ${withoutLines.length === 1 ? 'package has' : 'packages have'} no allowance lines yet.`}</p>
          <p className={styles.muted}>Let the system split the BOQ value into materials, labor and equipment, or add your own lines.</p>
          <div className={styles.actions} style={{ marginTop: 12 }}><button className={styles.button} type="button" disabled={busy} onClick={() => void mutate('suggest-resources', packageScoped && activities.length === 1 ? { activityId: activities[0].id } : undefined, 'Suggested allowances added. Check them, then confirm.')}>{busy ? 'Working…' : 'Suggest from BOQ value'}</button></div>
        </div>}
        {details.resources.length === 0
          ? (!canEdit && <p className={styles.empty}>No allowance lines recorded.</p>)
          : <div className={styles.scroll} tabIndex={0} role="region" aria-label="Allowance lines"><table className={`${styles.table} ${stepStyles.lineTable}`}><caption className="sr-only">Planned resource quantities and amounts</caption>
            <thead><tr><th scope="col">Line</th>{!packageScoped && <th scope="col">Package</th>}<th scope="col">Type</th><th scope="col">Qty</th><th scope="col">Original</th><th scope="col">Allowance</th>{canEdit && <th scope="col"><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>{details.resources.map((item) => <tr key={item.id}>
              <th scope="row">{lineName(item)}{item.isSystemSuggested && <span className={stepStyles.optional}>suggested</span>}
                {item.breakdownUploadId && <p className={styles.muted}><a className={styles.link} href={`/projects/${projectId}/work-packages/${item.activityId}#package-breakdown`}>From DUPA · row {item.sourceRowNumber}</a></p>}</th>
              {!packageScoped && <td>{activityName(item.activityId)}</td>}
              <td>{kindLabel[item.kind]}</td>
              <td>{item.quantity} {item.unit}{!isLumpSum(item) && <span className={styles.muted}> × {peso(item.unitCost)}</span>}</td>
              <td>{(() => { const value = original(item); return value === null ? <span className={styles.muted}>—</span> : peso(value.toFixed(2)); })()}</td>
              <td><strong>{peso(item.amount)}</strong>{(() => { const value = original(item); return value ? <small className={stepStyles.split}>{Math.round((Number(item.amount) / value) * 100)}% of original</small> : null; })()}</td>
              {canEdit && <td className={stepStyles.actionsCell}><div className={stepStyles.rowActions}>{removeResourceId === item.id
                ? <><span className={styles.muted}>Remove?</span><button className={`${styles.secondary} ${stepStyles.small}`} type="button" disabled={busy} onClick={() => void mutate('remove-resource', { id: item.id }, 'Line removed.')}>Remove</button><button className={`${styles.secondary} ${stepStyles.small}`} type="button" onClick={() => setRemoveResourceId('')}>Keep</button></>
                : <><button className={`${styles.secondary} ${stepStyles.small}`} type="button" disabled={busy} onClick={() => editResource(item)}>Edit</button><button className={`${styles.secondary} ${stepStyles.small}`} type="button" disabled={busy} onClick={() => setRemoveResourceId(item.id)}>Remove</button></>}</div></td>}
            </tr>)}</tbody>
            <tfoot><tr><th scope="row" colSpan={packageScoped ? 3 : 4}>Total</th><td>{originalTotal === null ? <span className={styles.muted}>—</span> : peso(originalTotal.toFixed(2))}</td><td><strong>{peso(total.toFixed(2))}</strong>{originalTotal ? <small className={stepStyles.split}>{Math.round((total / originalTotal) * 100)}% of original</small> : null}</td>{canEdit && <td className={stepStyles.actionsCell} />}</tr></tfoot>
          </table></div>}
        {canEdit && !resourceFormOpen && <div className={styles.actions} style={{ marginTop: 16 }}><button className={styles.secondary} type="button" disabled={busy} onClick={() => { setResource({ ...emptyResource(), activityId: packageScoped && activities.length === 1 ? activities[0].id : '' }); setResourceFormOpen(true); setError(''); setSuccess(''); }}>+ Add a line</button></div>}
        {canEdit && resourceFormOpen && <form onSubmit={saveResource} className={stepStyles.lineForm}>
          <h4>{resource.id ? 'Edit line' : 'Add a line'}</h4>
          <div className={styles.fields}>
            {!packageScoped && <ActivitySelect id="wp-resource-activity" value={resource.activityId} activities={activities} onChange={(activityId) => setResource({ ...resource, activityId })} />}
            <div><label htmlFor="wp-resource-kind">Type</label><select id="wp-resource-kind" value={resource.kind} onChange={(event) => setResource({ ...resource, kind: event.target.value as ResourceFields['kind'] })}><option value="MATERIAL">Materials</option><option value="LABOR">Labor</option><option value="EQUIPMENT">Equipment</option></select></div>
            <div><label htmlFor="wp-resource-description">What is it?</label><input id="wp-resource-description" type="text" required maxLength={191} placeholder="e.g. Copper pipe 3/8&quot;, Aircon technicians" value={resource.description} onChange={(event) => setResource({ ...resource, description: event.target.value })} /></div>
            <div><label htmlFor="wp-resource-quantity">Quantity</label><input id="wp-resource-quantity" type="text" required inputMode="decimal" value={resource.quantity} onChange={(event) => setResource({ ...resource, quantity: event.target.value })} /></div>
            <div><label htmlFor="wp-resource-unit">Unit</label><input id="wp-resource-unit" type="text" required maxLength={191} placeholder="e.g. m, pcs, man-day, lot" value={resource.unit} onChange={(event) => setResource({ ...resource, unit: event.target.value })} /></div>
            <div><label htmlFor="wp-resource-unit-cost">Rate per unit (₱)</label><input id="wp-resource-unit-cost" type="text" required inputMode="decimal" value={resource.unitCost} onChange={(event) => setResource({ ...resource, unitCost: event.target.value })} /></div>
            <div><label htmlFor="wp-resource-amount">Amount</label><output id="wp-resource-amount" className={stepStyles.amountOut}>{(() => { try { return peso(new Decimal(resource.quantity || 0).mul(resource.unitCost || 0).toDecimalPlaces(2).toFixed(2)); } catch { return 'Enter quantity and rate'; } })()}</output></div>
          </div>
          <div className={styles.actions}><button className={styles.button} type="submit" disabled={busy || !resource.description.trim() || !resource.unit.trim() || !resource.quantity.trim() || !resource.unitCost.trim() || (!packageScoped && !resource.activityId)}>{busy ? 'Saving…' : resource.id ? 'Save line' : 'Add line'}</button><button className={styles.secondary} type="button" disabled={busy} onClick={() => { setResourceFormOpen(false); setResource(emptyResource()); }}>Cancel</button></div>
        </form>}
      </>;
    })()}
  </section>;
}
