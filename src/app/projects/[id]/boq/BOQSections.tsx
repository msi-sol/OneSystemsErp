'use client';

import Link from 'next/link';
import { useState } from 'react';
import styles from '../planning/planning.module.css';

type Section = { id: string; name: string; itemIds: string[]; amount: string };
export default function BOQSections({ projectId, sections }: { projectId: string; sections: Section[] }) {
  const [search, setSearch] = useState('');
  const visible = sections.filter(row => row.name.toLowerCase().includes(search.trim().toLowerCase()));
  return <section className={styles.panel} aria-labelledby="boq-sections-heading">
    <div className={styles.titleRow}><div><h3 id="boq-sections-heading">Sections</h3><p className={styles.muted}>Review the workbook breakdown. Repeated section names remain separate source occurrences.</p></div><span>{sections.length} sections</span></div>
    <label htmlFor="boq-section-search">Search sections</label><input id="boq-section-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Section name" />
    <p className={styles.muted}>{visible.length} of {sections.length} sections</p>
    <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Section</th><th>Items</th><th>BOQ amount</th><th>Action</th></tr></thead><tbody>{visible.map(section => <tr key={section.id}><th scope="row">{sections.indexOf(section) + 1}. {section.name}</th><td>{section.itemIds.length}</td><td>{new Intl.NumberFormat('en-PH', {style:'currency',currency:'PHP'}).format(Number(section.amount))}</td><td><Link className={styles.link} href={`/projects/${projectId}/boq?view=items&section=${encodeURIComponent(section.id)}`}>View items</Link></td></tr>)}</tbody></table></div>
    {!visible.length && <p>No sections match this search.</p>}
  </section>;
}
