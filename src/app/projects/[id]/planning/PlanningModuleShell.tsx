import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './planning.module.css';

export type Crumb = { label: string; href?: string };

export default function PlanningModuleShell({ project, active, trail = [], children }: {
  project: { id: string; name: string; contractAmount: number; status: string };
  active: 'boq' | 'work-packages';
  /** Sub-view or package below the module, e.g. "BOQ items" or "WP-01 · Earthworks". */
  trail?: Crumb[];
  children: ReactNode;
}) {
  const crumbs: Crumb[] = [
    { label: 'BOQ Workspace', href: '/boq' },
    { label: `${project.name} · Project Summary`, href: `/projects/${project.id}?tab=summary` },
    { label: 'BOQ', href: `/projects/${project.id}/boq` },
    ...(active === 'work-packages' ? [{ label: 'Work Packages', href: `/projects/${project.id}/work-packages` }] : []),
    ...trail,
  ];
  return <div className={styles.shell}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><ol>
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        return <li key={`${index}-${crumb.label}`}>{last || !crumb.href ? <span aria-current={last ? 'page' : undefined}>{crumb.label}</span> : <Link href={crumb.href}>{crumb.label}</Link>}</li>;
      })}
    </ol></nav>
    <header className={styles.projectHeader}><h1>{project.name}</h1><div><strong>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(project.contractAmount)}</strong><span>{project.status.replaceAll('_', ' ')}</span></div></header>
    <div className={styles.moduleBody}>{children}</div>
  </div>;
}
