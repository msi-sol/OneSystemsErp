'use client';

import { ArrowRight } from 'lucide-react';
import { packageAllowanceStatus } from '@/lib/scheduling/wps-overview';
import type { ModuleSchedule } from './module-types';
import styles from './WpsOverview.module.css';

const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
const DUPA_LABEL = { none: 'No DUPA · using suggestions', evidence: 'DUPA uploaded · not applied yet', applied: 'DUPA applied' } as const;

/** Explains how a DUPA relates to the suggested packages, and shows where each package stands. */
export default function DupaGuide({ schedule, onOpenPackage }: { schedule: ModuleSchedule; onOpenPackage: (activityId: string) => void }) {
  const rows = packageAllowanceStatus({
    activities: schedule.activities, allocations: schedule.allocations,
    resources: schedule.details.resources, uploads: schedule.details.breakdownUploads ?? [],
  });
  return <section className={styles.dupa} aria-labelledby="dupa-guide-heading">
    <h3 id="dupa-guide-heading">How a DUPA fits with the suggested packages</h3>
    <ol className={styles.dupaRules}>
      <li><strong>Suggested packages come from the BOQ.</strong> Related BOQ sections are grouped into a package with their BOQ quantities and value, plus suggested materials, labor and equipment allowances.</li>
      <li><strong>A DUPA never changes a package’s BOQ scope or value.</strong> It only replaces or adds to that package’s allowances. You choose which suggested rows it replaces, and the original file is kept.</li>
      <li><strong>No DUPA?</strong> The suggested allowances stay as the guide. Review them so they stop being marked as suggestions.</li>
      <li><strong>Either way,</strong> a package’s allowances must stay below its BOQ value before the plan can be approved.</li>
    </ol>
    <div className={styles.tableScroll} role="region" aria-label="Allowances and DUPA by package" tabIndex={0}>
      <table className={styles.table}>
        <thead><tr><th scope="col">Package</th><th scope="col">BOQ value</th><th scope="col">Allowances</th><th scope="col">DUPA</th><th scope="col"><span className={styles.srOnly}>Action</span></th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <th scope="row"><span className={styles.pkgCode}>{row.code || 'WP'}</span> {row.name}</th>
          <td>{money(row.value)}</td>
          <td className={row.allowanceWithinValue ? undefined : styles.over}>{money(row.allowance)}{!row.allowanceWithinValue && <small>Above BOQ value</small>}{row.suggestedRows > 0 && <small>{row.suggestedRows} suggested {row.suggestedRows === 1 ? 'row' : 'rows'} to review</small>}</td>
          <td><span className={row.dupa === 'applied' ? styles.tagOk : row.dupa === 'evidence' ? styles.tagWarn : styles.tag}>{DUPA_LABEL[row.dupa]}</span></td>
          <td><button type="button" className={styles.rowAction} onClick={() => onOpenPackage(row.id)}>{row.dupa === 'none' ? 'Upload DUPA' : 'Open DUPA'} <ArrowRight size={14} aria-hidden="true" /></button></td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
