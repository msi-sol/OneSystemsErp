'use client';

import { useMemo, useState } from 'react';
import styles from '../planning/planning.module.css';
import { boqSections, type SectionIdentity } from '@/lib/boq/section-view';

type BaselineLine = { id: string; itemCode: string; category: string | null; description: string; unit: string; quantity: number; combinedUnitCost: number; totalCost: number };
const currency = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);

export default function BOQBaselineViewer({ lines, sectionIdentities = {}, initialSection = 'all' }: { lines: BaselineLine[]; sectionIdentities?: Record<string, SectionIdentity>; initialSection?: string }) {
  const [query, setQuery] = useState('');
  const [section, setSection] = useState(initialSection);
  const [page, setPage] = useState(0);
  const sections = useMemo(() => boqSections(lines, sectionIdentities), [lines, sectionIdentities]);
  const selected = sections.find(row => row.id === section);
  const filtered = lines.filter(line => (section === 'all' || selected?.itemIds.includes(line.id))
    && (!query.trim() || `${line.itemCode} ${line.category || ''} ${line.description} ${line.unit}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const sectionTotal = filtered.reduce((sum, line) => sum + line.totalCost, 0);
  const safePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 25) - 1));
  const visible = filtered.slice(safePage * 25, (safePage + 1) * 25);
  function selectSection(value: string) {
    setSection(value); setPage(0);
    const url = new URL(window.location.href);
    if (value === 'all') url.searchParams.delete('section'); else url.searchParams.set('section', value);
    window.history.replaceState(null, '', url);
  }
  return <section aria-label="Approved BOQ baseline" className={styles.panel}>
    <h3>BOQ items</h3><div className={styles.fields}><div><label htmlFor="approved-boq-section">Section</label><select id="approved-boq-section" value={section} onChange={event => selectSection(event.target.value)}><option value="all">All sections ({sections.length})</option>{sections.map((row, index) => <option key={row.id} value={row.id}>{index + 1}. {row.name} · {row.itemIds.length}</option>)}</select></div><div><label htmlFor="approved-boq-search">Search BOQ items</label><input id="approved-boq-search" type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Item code, section, description, unit"/></div></div>
    <p className={styles.muted}>{filtered.length} of {lines.length} items · filtered value {currency(sectionTotal)}</p>
    <div className={styles.actions}><span>{filtered.length ? `Showing ${safePage * 25 + 1}–${Math.min((safePage + 1) * 25, filtered.length)} of ${filtered.length}` : 'No matching items'}</span><button className={styles.secondary} disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous items</button><button className={styles.secondary} disabled={(safePage + 1) * 25 >= filtered.length} onClick={() => setPage(safePage + 1)}>Next items</button><button className={styles.secondary} onClick={() => {selectSection('all');setQuery('');}}>View all items</button></div>
    <div className={styles.scroll} role="region" aria-label="BOQ baseline items" tabIndex={0}><table className={styles.table}><thead><tr><th>Item</th><th>Section</th><th>Description</th><th>Unit</th><th>Approved quantity</th><th>Unit rate</th><th>Amount</th></tr></thead><tbody>{visible.map(line => <tr key={line.id}><th scope="row">{line.itemCode}</th><td>{line.category || 'General'}</td><td>{line.description}</td><td>{line.unit}</td><td>{line.quantity.toLocaleString('en-PH', { maximumFractionDigits: 12 })}</td><td>{currency(line.combinedUnitCost)}</td><td>{currency(line.totalCost)}</td></tr>)}</tbody><tfoot><tr><th colSpan={6}>Filtered BOQ amount (all matching items)</th><td>{currency(sectionTotal)}</td></tr></tfoot></table></div>
    {!filtered.length && <p className={styles.muted}>{query ? 'No BOQ items match this search.' : 'This section has no BOQ items.'}</p>}
  </section>;
}
