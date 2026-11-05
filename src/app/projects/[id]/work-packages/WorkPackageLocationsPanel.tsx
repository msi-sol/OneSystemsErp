'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { formatLocationPath } from '@/lib/scheduling/work-package-location';
import type { PlanLocation } from '@/lib/scheduling/work-package-details-types';
import styles from '../planning/planning.module.css';

type Props = { projectId: string; onSaved: () => void; canEdit?: boolean };
type State = { rowVersion: number; locations: PlanLocation[] };
type Fields = { id: string; name: string; code: string; parentId: string };
const blank = (): Fields => ({ id: '', name: '', code: '', parentId: '' });

function message(code: string) {
  const known: Record<string, string> = {
    PROJECT_ACCESS_DENIED: 'You do not have permission to manage project locations.',
    EXECUTION_VERSION_CONFLICT: 'Locations changed in another session. Refresh and try again.',
    SCHEDULE_VERSION_CONFLICT: 'The work plan changed in another session. Refresh and try again.',
    DUPLICATE_LOCATION_NAME: 'A location with this name already exists under that parent.',
    DUPLICATE_LOCATION_CODE: 'This location code is already in use.',
    INVALID_LOCATION_PARENT: 'Choose an active parent location from this project.',
    LOCATION_HIERARCHY_CYCLE: 'A location cannot be moved inside itself or one of its descendants.',
    LOCATION_HAS_ACTIVE_CHILDREN: 'Archive or move this location’s active child locations first.',
    LOCATION_HAS_CHILDREN: 'Archive or move this location’s child locations first.',
    LOCATION_IN_USE: 'This location is referenced by a plan, weekly target, or daily work history.',
    LOCATION_ARCHIVED: 'Archived locations cannot be edited.',
  };
  return known[code] ?? code.replaceAll('_', ' ').toLocaleLowerCase();
}

export default function WorkPackageLocationsPanel({ projectId, onSaved, canEdit = false }: Props) {
  const [state, setState] = useState<State>({ rowVersion: 0, locations: [] });
  const [fields, setFields] = useState<Fields>(blank);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [archiveId, setArchiveId] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/work-packages/locations`, { credentials: 'same-origin' });
        const result = await response.json() as { rowVersion?: number; locations?: PlanLocation[]; error?: string };
        if (!response.ok) throw new Error(message(result.error ?? 'LOCATION_LOAD_FAILED'));
        if (!cancelled) setState({ rowVersion: result.rowVersion ?? 0, locations: result.locations ?? [] });
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Project locations could not be loaded.'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  async function mutate(action: 'create' | 'update' | 'archive', values: Record<string, unknown>) {
    setBusy(true); setError(''); setSuccess('');
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/work-packages/locations`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, expectedRowVersion: state.rowVersion, ...values }),
      });
      const result = await response.json() as { error?: string; rowVersion?: number; locations?: PlanLocation[] };
      if (!response.ok) throw new Error(message(result.error ?? 'LOCATION_SAVE_FAILED'));
      setState({ rowVersion: result.rowVersion ?? state.rowVersion, locations: result.locations ?? state.locations });
      setFields(blank()); setArchiveId(''); setSuccess(action === 'archive' ? 'Location archived.' : action === 'update' ? 'Location updated.' : 'Location added.');
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The location could not be saved.'); }
    finally { setBusy(false); }
  }

  function isDescendant(candidateId: string, ancestorId: string) {
    let item = state.locations.find(location => location.id === candidateId);
    const seen = new Set<string>();
    while (item?.parentId && !seen.has(item.id)) {
      if (item.parentId === ancestorId) return true;
      seen.add(item.id);
      item = state.locations.find(location => location.id === item!.parentId);
    }
    return false;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { ...(fields.id ? { id: fields.id } : {}), name: fields.name.trim(), code: fields.code.trim() || null, parentId: fields.parentId || null };
    void mutate(fields.id ? 'update' : 'create', payload);
  }

  return <section className={styles.panel} aria-labelledby="project-locations-heading">
    <div className={styles.titleRow}>
      <div><h3 id="project-locations-heading">Project locations</h3><p className={styles.muted}>Maintain the project’s area hierarchy. Approved work plan snapshots remain unchanged.</p></div>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {success && <p role="status" className={styles.success}>{success}</p>}
    {canEdit && <form onSubmit={submit}>
      <h4>{fields.id ? 'Edit location' : 'Add a location'}</h4>
      <div className={styles.fields}>
        <div><label htmlFor="project-location-name">Location name</label><input id="project-location-name" required maxLength={191} value={fields.name} onChange={event => setFields({ ...fields, name: event.target.value })} /></div>
        <div><label htmlFor="project-location-code">Code (optional)</label><input id="project-location-code" maxLength={64} value={fields.code} onChange={event => setFields({ ...fields, code: event.target.value })} /></div>
        <div><label htmlFor="project-location-parent">Parent location</label><select id="project-location-parent" value={fields.parentId} onChange={event => setFields({ ...fields, parentId: event.target.value })}><option value="">Top level</option>{state.locations.filter(item => item.isActive !== false && item.id !== fields.id && (!fields.id || !isDescendant(item.id, fields.id))).map(item => <option key={item.id} value={item.id}>{formatLocationPath(state.locations, item.id)}</option>)}</select></div>
      </div>
      <div className={styles.actions}><button className={styles.button} disabled={busy || loading || !fields.name.trim()} type="submit">{busy ? 'Saving…' : fields.id ? 'Save location' : 'Add location'}</button>{fields.id && <button className={styles.secondary} type="button" disabled={busy} onClick={() => setFields(blank())}>Cancel edit</button>}</div>
    </form>}
    <h4>Locations</h4>
    {loading ? <p className={styles.muted}>Loading locations…</p> : state.locations.length === 0 ? <p className={styles.empty}>No locations recorded yet.</p> : <div className={styles.scroll} tabIndex={0} role="region" aria-label="Project location list"><table className={styles.table}><caption className="sr-only">Project locations</caption><thead><tr><th scope="col">Location</th><th scope="col">Parent</th><th scope="col">Status</th>{canEdit && <th scope="col">Actions</th>}</tr></thead><tbody>{state.locations.map(item => <tr key={item.id}><th scope="row">{item.code ? `${item.code} · ` : ''}{formatLocationPath(state.locations, item.id)}</th><td>{item.parentId ? state.locations.find(parent => parent.id === item.parentId)?.name ?? 'Unknown parent' : 'Project-wide'}</td><td>{item.isActive === false ? 'Archived' : 'Active'}</td>{canEdit && <td><div className={styles.actions}>{item.isActive !== false && <><button className={styles.secondary} type="button" disabled={busy} onClick={() => setFields({ id: item.id, name: item.name, code: item.code ?? '', parentId: item.parentId ?? '' })}>Edit</button>{archiveId === item.id ? <><span>Archive this unused location?</span><button className={styles.secondary} type="button" disabled={busy} onClick={() => void mutate('archive', { id: item.id })}>Confirm archive</button><button className={styles.secondary} type="button" disabled={busy} onClick={() => setArchiveId('')}>Keep</button></> : <button className={styles.secondary} type="button" disabled={busy} onClick={() => setArchiveId(item.id)}>Archive…</button>}</>}</div></td>}</tr>)}</tbody></table></div>}
  </section>;
}
