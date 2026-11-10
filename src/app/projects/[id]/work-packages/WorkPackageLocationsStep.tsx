'use client';

import { useState } from 'react';
import WorkPackageLocationsPanel from './WorkPackageLocationsPanel';
import WorkPackageDetailsPanel from './WorkPackageDetailsPanel';
import { formatLocationPath } from '@/lib/scheduling/work-package-location';
import type { ModuleSchedule } from './module-types';
import styles from '../planning/planning.module.css';
import own from './locations-step.module.css';

type Props = {
  projectId: string;
  schedule: ModuleSchedule;
  members: { id: string; name: string }[];
  /** Pre-fills "Where is the work done?" (the project's recorded location, else "Project site"). */
  projectSite?: string;
  /** Can edit this draft plan (assign locations, record constraints). */
  canEdit: boolean;
  /** Can edit the project's location list (stays editable after approval). */
  canEditProjectLocations: boolean;
  pending: boolean;
  plan: (action: string, values?: Record<string, unknown>) => Promise<unknown>;
  onSaved: () => void;
};

/**
 * Step "Locations & constraints", in the order a planner answers it:
 * where the work happens (one click for a single site), which package is where, optional sub-areas,
 * then the optional constraints. A status line on top says what is still missing.
 */
export default function WorkPackageLocationsStep({ projectId, schedule, members, projectSite = '', canEdit, canEditProjectLocations, pending, plan, onSaved }: Props) {
  const [site, setSite] = useState(projectSite);
  const locations = schedule.details.locations;
  const where = schedule.details.allocationLocations;
  const active = locations.filter((row) => row.isActive !== false);
  const label = (id: string) => formatLocationPath(locations, id) || 'Unknown location';

  const packages = schedule.activities.map((activity) => {
    const rows = schedule.allocations.filter((row) => row.activityId === activity.id);
    const values = [...new Set(rows.map((row) => where[row.id] || ''))];
    return { activity, lines: rows.length, located: rows.filter((row) => where[row.id]).length, value: values.length === 1 ? values[0] : 'mixed' };
  });
  const withScope = packages.filter((row) => row.lines > 0);
  const needLocation = withScope.filter((row) => row.located < row.lines);
  const unlocatedLines = schedule.allocations.filter((row) => !where[row.id]).length;
  const constraints = schedule.details.constraints;
  const openConstraints = constraints.filter((row) => row.status !== 'RESOLVED').length;

  return <>
    <p className={own.statusLine} role="status">
      <span className={!withScope.length || needLocation.length ? own.todo : own.done}>
        {!withScope.length ? 'No package has BOQ scope yet' : needLocation.length ? `${needLocation.length} of ${withScope.length} packages still need a location` : '✓ Every package has a location'}
      </span>
      <span className={own.dot} aria-hidden="true">·</span>
      <span>Constraints: {constraints.length}{openConstraints ? ` (${openConstraints} open)` : ''} <span className={own.optional}>optional</span></span>
    </p>

    {canEdit && unlocatedLines > 0 && <section className={styles.panel} aria-labelledby="wp-where-heading">
      <h3 id="wp-where-heading">Where is the work done?</h3>
      <form className={own.quickRow} onSubmit={(event) => { event.preventDefault(); void plan('locate-all-at', { name: site.trim() }); }}>
        <div>
          <label htmlFor="wp-site-name">Site or location name</label>
          <input id="wp-site-name" type="text" maxLength={191} value={site} placeholder="e.g. Project site, Brgy. San Jose" onChange={(event) => setSite(event.target.value)} />
        </div>
        <button className={styles.button} type="submit" disabled={pending || !site.trim()}>Use for all packages</button>
      </form>
    </section>}

    <section className={styles.panel} aria-labelledby="wp-package-locations-heading">
      <h3 id="wp-package-locations-heading">Location of each package</h3>
      <p className={styles.muted}>{canEdit ? 'Change a package here when its work happens somewhere else, for example another building or area. All of the package’s BOQ lines move with it.' : 'Where each package’s work happens.'}</p>
      {!withScope.length
        ? <p className={styles.muted}>Assign BOQ scope to the packages first (Scope step).</p>
        : <div className={styles.scroll} role="region" aria-label="Location of each package" tabIndex={0} style={{ marginTop: 14 }}>
          <table className={styles.table}>
            <thead><tr><th scope="col">Package</th><th scope="col">BOQ lines</th><th scope="col">Location</th></tr></thead>
            <tbody>{packages.map(({ activity, lines, located, value }) => {
              const name = `${activity.activityCode ? `${activity.activityCode} · ` : ''}${activity.name}`;
              const choices = value && value !== 'mixed' && !active.some((row) => row.id === value) ? [...active, ...locations.filter((row) => row.id === value)] : active;
              return <tr key={activity.id}>
                <th scope="row">{name}</th>
                <td>{lines}</td>
                <td>{lines === 0 ? <span className={styles.muted}>No scope yet</span>
                  : canEdit ? <select className={own.locationSelect} aria-label={`Location for ${name}`} disabled={pending} value={value} onChange={(event) => { if (event.target.value !== 'mixed') void plan('locate-package', { activityId: activity.id, locationId: event.target.value }); }}>
                    {value === 'mixed' && <option value="mixed" disabled>Mixed · {located} of {lines} lines set</option>}
                    <option value="">Not set</option>
                    {choices.map((row) => <option key={row.id} value={row.id}>{label(row.id)}{row.isActive === false ? ' (archived)' : ''}</option>)}
                  </select>
                  : value === 'mixed' ? 'Mixed' : value ? label(value) : <span className={styles.warningText}>Not set</span>}
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      {canEdit && withScope.length > 0 && !active.length && <p className={styles.muted} style={{ marginTop: 12 }}>No locations yet. Use “Where is the work done?” above, or add them under sub-areas below.</p>}
    </section>

    <details className={own.subAreas}>
      <summary>Add sub-areas or more locations <span>(optional)</span></summary>
      <p className={styles.muted}>Only needed when packages happen in different places, for example Building A › 2nd floor. Add them here, then pick them in the table above.</p>
      <WorkPackageLocationsPanel projectId={projectId} canEdit={canEditProjectLocations} onSaved={onSaved} />
    </details>

    <WorkPackageDetailsPanel projectId={projectId} scheduleId={schedule.id} rowVersion={schedule.rowVersion} details={schedule.details} activities={schedule.activities} members={members} canEdit={canEdit} view="constraints" onSaved={onSaved} />
  </>;
}
