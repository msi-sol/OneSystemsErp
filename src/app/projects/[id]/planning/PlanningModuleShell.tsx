import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './planning.module.css';

export default function PlanningModuleShell({ project, active, children }: {
  project: { id: string; name: string; contractAmount: number; status: string };
  active: 'boq' | 'work-packages'; children: ReactNode;
}) {
  return <div className={styles.shell}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/boq">BOQ Workspace</Link><span>›</span><Link href={`/projects/${project.id}`}>{project.name}</Link><span>›</span><span>{active === 'boq' ? 'BOQ' : 'Work Packages'}</span></nav>
    <header className={styles.projectHeader}><h1>{project.name}</h1><div><strong>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(project.contractAmount)}</strong><span>{project.status.replaceAll('_', ' ')}</span></div></header>
    <div className={styles.moduleBody}>{children}</div>
  </div>;
}
