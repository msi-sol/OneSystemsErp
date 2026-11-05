'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Decimal from 'decimal.js';
import { CONSTRAINT_TYPE_LABEL, CONSTRAINT_TYPES } from '@/lib/scheduling/work-package-constraints';
import { formatLocationPath } from '@/lib/scheduling/work-package-location';
import styles from '../planning/planning.module.css';
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

export default function WorkPackageDetailsPanel({ projectId, scheduleId, rowVersion, details, activities, members, canEdit, view, onSaved }: Props) {
  const [versionOverride, setVersionOverride] = useState({ source: rowVersion, value: rowVersion });
  const version = versionOverride.source === rowVersion ? versionOverride.value : rowVersion;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [location, setLocation] = useState<LocationFields>(emptyLocation);
  const [constraint, setConstraint] = useState<ConstraintFields>(emptyConstraint);
  const [resource, setResource] = useState<ResourceFields>(emptyResource);
  const [confirmSuggest, setConfirmSuggest] = useState(false);
  const [removeLocationId, setRemoveLocationId] = useState('');
  const [removeResourceId, setRemoveResourceId] = useState('');

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
      setConfirmSuggest(false);
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
  async function saveConstraint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await mutate('constraint', {
      id: constraint.id || undefined, activityId: constraint.activityId || null,
      description: constraint.description.trim(), ownerId: constraint.ownerId || null,
      neededBy: constraint.neededBy || null, blocking: constraint.blocking,
      status: constraint.status, resolution: constraint.resolution.trim() || null,
      type:constraint.type,title:constraint.title,
    }, constraint.id ? 'Constraint updated.' : 'Constraint recorded.');
    if (saved) setConstraint(emptyConstraint());
  }
  function editConstraint(item: Constraint) {
    setConstraint({ id: item.id, activityId: item.activityId ?? '', description: item.description, ownerId: item.ownerId ?? '', neededBy: item.neededBy ?? '', blocking: item.blocking, status: item.status, resolution: item.resolution ?? '',type:item.type||'OTHER',title:item.title||item.description });
    setError(''); setSuccess('');
  }
  async function saveResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await mutate('resource', {
      id: resource.id || undefined, activityId: resource.activityId || null,
      kind: resource.kind, description: resource.description.trim(), unit: resource.unit.trim(),
      quantity: resource.quantity.trim(), unitCost: resource.unitCost.trim(),
    }, resource.id ? 'Resource updated.' : 'Resource added.');
    if (saved) setResource(emptyResource());
  }
  function editResource(item: Resource) {
    setResource({ ...item, activityId: item.activityId ?? '' });
    setError(''); setSuccess('');
  }

  const title = view === 'locations' ? 'Locations' : view === 'constraints' ? 'Constraints' : 'Resources and allowances';
  const intro = view === 'locations'
    ? 'Group scope by work area or site location. Locations describe where work takes place.'
    : view === 'constraints'
      ? 'Record access, approvals, interfaces, and other conditions that affect the plan.'
      : 'Record planned materials, labor, equipment, and explicit BOQ budget allowances. These are planning references, not actual costs.';

  return <section className={styles.panel} aria-labelledby={`details-${view}-heading`}>
    <div className={styles.titleRow}>
      <div>
        <h3 id={`details-${view}-heading`}>{title}</h3>
        <p className={styles.muted}>{intro}</p>
      </div>
      {!canEdit && <span className={styles.muted}>Read only</span>}
    </div>

    {error && <p className={styles.error} role="alert">{error}</p>}
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
      {canEdit && <form onSubmit={saveConstraint}>
        <h4>{constraint.id ? 'Edit constraint' : 'Record a constraint'}</h4>
        <div className={styles.fields}>
          <div><label htmlFor="wp-constraint-type">Constraint type</label><select id="wp-constraint-type" value={constraint.type} onChange={e=>setConstraint({...constraint,type:e.target.value})}>{CONSTRAINT_TYPES.map(type=><option key={type} value={type}>{CONSTRAINT_TYPE_LABEL[type]}</option>)}</select></div><div><label htmlFor="wp-constraint-title">Constraint title</label><input id="wp-constraint-title" required maxLength={191} value={constraint.title} onChange={e=>setConstraint({...constraint,title:e.target.value})}/></div><ActivitySelect id="wp-constraint-activity" value={constraint.activityId} activities={activities} onChange={(activityId) => setConstraint({ ...constraint, activityId })} />
          <div><label htmlFor="wp-constraint-owner">Owner</label><select id="wp-constraint-owner" value={constraint.ownerId} onChange={(event) => setConstraint({ ...constraint, ownerId: event.target.value })}><option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></div>
          <div><label htmlFor="wp-constraint-description">Constraint or required action</label><textarea id="wp-constraint-description" required maxLength={10000} rows={3} value={constraint.description} onChange={(event) => setConstraint({ ...constraint, description: event.target.value })} /></div>
          <div><label htmlFor="wp-constraint-needed-by">Needed by</label><input id="wp-constraint-needed-by" type="date" value={constraint.neededBy} onChange={(event) => setConstraint({ ...constraint, neededBy: event.target.value })} /></div>
          <div><label htmlFor="wp-constraint-status">Status</label><select id="wp-constraint-status" value={constraint.status} onChange={(event) => setConstraint({ ...constraint, status: event.target.value as ConstraintFields['status'] })}><option value="OPEN">Open</option><option value="RESOLVED">Resolved</option></select></div>
          <div><label htmlFor="wp-constraint-resolution">Resolution note {constraint.status === 'RESOLVED' && <span>(required)</span>}</label><textarea id="wp-constraint-resolution" rows={2} maxLength={10000} value={constraint.resolution} onChange={(event) => setConstraint({ ...constraint, resolution: event.target.value })} /></div>
          <label><input type="checkbox" checked={constraint.blocking} onChange={(event) => setConstraint({ ...constraint, blocking: event.target.checked })} /> Blocks readiness to start; an owned, dated constraint may remain open at approval</label>
        </div>
        <div className={styles.actions}><button className={styles.button} type="submit" disabled={busy || !constraint.description.trim() || (constraint.status === 'RESOLVED' && !constraint.resolution.trim())}>{busy ? 'Saving…' : constraint.id ? 'Save constraint' : 'Add constraint'}</button>{constraint.id && <button className={styles.secondary} type="button" disabled={busy} onClick={() => setConstraint(emptyConstraint())}>Cancel edit</button>}</div>
      </form>}
      {details.constraints.length === 0 ? <p className={styles.empty}>No constraints recorded. Add known access, interface, approval, or delivery conditions.</p> : <div className={styles.scroll} tabIndex={0} role="region" aria-label="Plan constraints"><table className={styles.table}><caption className="sr-only">Plan constraints and resolutions</caption><thead><tr><th scope="col">Constraint</th><th scope="col">Package</th><th scope="col">Owner</th><th scope="col">Needed by</th><th scope="col">Status</th>{canEdit && <th scope="col">Actions</th>}</tr></thead><tbody>{details.constraints.map((item) => <tr key={item.id}><th scope="row">{item.description}{item.blocking && <span className={styles.muted}> · Blocks readiness to start</span>}{item.resolution && <p className={styles.muted}>Resolution: {item.resolution}</p>}</th><td>{activityName(item.activityId)}</td><td>{memberName(item.ownerId)}</td><td>{item.neededBy || 'Not set'}</td><td>{item.status === 'RESOLVED' ? 'Resolved' : 'Open'}</td>{canEdit && <td><button className={styles.secondary} type="button" disabled={busy || item.status==="RESOLVED"} onClick={() => editConstraint(item)}>Edit</button></td>}</tr>)}</tbody></table></div>}
    </>}

    {view === 'resources' && <><div className={styles.status}><p>Budget amounts are quantity × rate. All packages need materials, labor and equipment allowances. Suggested lines must be accepted by a person; dates or scope changes in a revision require another resource review.</p>{activities.map(activity=><div key={activity.id} className={styles.actions}><span>{activity.activityCode} · {activity.name}{details.resourcesReviewNeeded?.[activity.id]?' · Review needed':''}{details.resources.some(row=>row.activityId===activity.id&&row.isSystemSuggested)?' · System suggestions unreviewed':''}</span>{canEdit&&<button className={styles.secondary} disabled={busy} onClick={()=>void mutate('confirm-resources',{activityId:activity.id},'Allowances reviewed and accepted.')}>Confirm allowances</button>}</div>)}</div>
      {canEdit && <>
        {!confirmSuggest && <div>
          <h4>Create BOQ budget allowances</h4>
          <p className={styles.muted}>This creates explicit planning references from the approved BOQ. Allowances are not actual costs, commitments, or proof of spending.</p>
          <button className={styles.secondary} type="button" disabled={busy} onClick={() => setConfirmSuggest(true)}>Review allowance creation</button>
        </div>}
        {confirmSuggest && <div>
          <h4>Confirm BOQ allowance creation</h4>
          <p>Missing package budgets receive the source app’s suggested materials, labor and equipment split. These are labeled suggestions and require your review before approval. Existing resource lines are preserved.</p>
          <div className={styles.actions}><button className={styles.button} type="button" disabled={busy} onClick={() => void mutate('suggest-resources', undefined, 'BOQ budget allowance references created.')}>{busy ? 'Creating…' : 'Create BOQ budget allowances'}</button><button className={styles.secondary} type="button" disabled={busy} onClick={() => setConfirmSuggest(false)}>Cancel</button></div>
        </div>}
        <form onSubmit={saveResource}>
          <h4>{resource.id ? 'Edit resource' : 'Add a planned resource'}</h4>
          <div className={styles.fields}>
            <ActivitySelect id="wp-resource-activity" value={resource.activityId} activities={activities} onChange={(activityId) => setResource({ ...resource, activityId })} />
            <div><label htmlFor="wp-resource-kind">Resource type</label><select id="wp-resource-kind" value={resource.kind} onChange={(event) => setResource({ ...resource, kind: event.target.value as ResourceFields['kind'] })}><option value="MATERIAL">Material</option><option value="LABOR">Labor</option><option value="EQUIPMENT">Equipment</option></select></div>
            <div><label htmlFor="wp-resource-description">Description</label><input id="wp-resource-description" required maxLength={191} value={resource.description} onChange={(event) => setResource({ ...resource, description: event.target.value })} /></div>
            <div><label htmlFor="wp-resource-unit">Unit</label><input id="wp-resource-unit" required maxLength={191} value={resource.unit} onChange={(event) => setResource({ ...resource, unit: event.target.value })} /></div>
            <div><label htmlFor="wp-resource-quantity">Planned quantity</label><input id="wp-resource-quantity" required inputMode="decimal" value={resource.quantity} onChange={(event) => setResource({ ...resource, quantity: event.target.value })} /></div>
            <div><label htmlFor="wp-resource-unit-cost">Reference unit rate</label><input id="wp-resource-unit-cost" required inputMode="decimal" value={resource.unitCost} onChange={(event) => setResource({ ...resource, unitCost: event.target.value })} /></div>
            <div><label htmlFor="wp-resource-amount">Amount (quantity × rate)</label><output id="wp-resource-amount">{(()=>{try{return new Decimal(resource.quantity||0).mul(resource.unitCost||0).toDecimalPlaces(2).toFixed(2)}catch{return "Enter quantity and rate"}})()}</output></div>
          </div>
          {resource.kind === 'ALLOWANCE' && <p className={styles.muted}>An allowance is a planning reference from BOQ budget information, not an actual cost or transaction.</p>}
          <div className={styles.actions}><button className={styles.button} type="submit" disabled={busy || !resource.description.trim() || !resource.unit.trim() || !resource.quantity.trim() || !resource.unitCost.trim()}>{busy ? 'Saving…' : resource.id ? 'Save resource' : 'Add resource'}</button>{resource.id && <button className={styles.secondary} type="button" disabled={busy} onClick={() => setResource(emptyResource())}>Cancel edit</button>}</div>
        </form>
      </>}
      {details.resources.length === 0 ? <p className={styles.empty}>No planned resources are recorded. Add a resource or explicitly create BOQ budget allowance references.</p> : <div className={styles.scroll} tabIndex={0} role="region" aria-label="Planned resources and budget allowances"><table className={styles.table}><caption className="sr-only">Planned resource quantities and stated values</caption><thead><tr><th scope="col">Resource</th><th scope="col">Package</th><th scope="col">Type</th><th scope="col">Quantity</th><th scope="col">Reference rate</th><th scope="col">Stated amount</th>{canEdit && <th scope="col">Actions</th>}</tr></thead><tbody>{details.resources.map((item) => <tr key={item.id}><th scope="row">{item.description}<span className={styles.muted}>{item.unit}</span>{item.breakdownUploadId && <p className={styles.muted}><a className={styles.link} href={`/projects/${projectId}/work-packages/${item.activityId}#package-breakdown`}>Uploaded breakdown · source row {item.sourceRowNumber}</a></p>}{item.kind === 'ALLOWANCE' && <p className={styles.muted}>Budget reference · not actual cost</p>}</th><td>{activityName(item.activityId)}</td><td>{{ MATERIAL: 'Material', LABOR: 'Labor', EQUIPMENT: 'Equipment', ALLOWANCE: 'Budget allowance' }[item.kind]}</td><td>{item.quantity}</td><td>{item.unitCost}</td><td>{item.amount}</td>{canEdit && <td><div className={styles.actions}><button className={styles.secondary} type="button" disabled={busy} onClick={() => editResource(item)}>Edit</button>{removeResourceId === item.id ? <><span>Remove this resource?</span><button className={styles.secondary} type="button" disabled={busy} onClick={() => void mutate('remove-resource', { id: item.id }, 'Resource removed.')}>Remove</button><button className={styles.secondary} type="button" onClick={() => setRemoveResourceId('')}>Keep</button></> : <button className={styles.secondary} type="button" disabled={busy} onClick={() => setRemoveResourceId(item.id)}>Archive…</button>}</div></td>}</tr>)}</tbody></table></div>}
    </>}
  </section>;
}
