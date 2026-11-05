'use client';

import { useMemo, useState } from 'react';
import styles from '../planning/planning.module.css';

type BaselineLine = { id: string; itemCode: string; category: string | null; description: string; unit: string; quantity: number; combinedUnitCost: number; totalCost: number };
const currency = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);

export default function BOQBaselineViewer({ lines }: { lines: BaselineLine[] }) {
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('all');
  const sections = useMemo(() => [...new Set(lines.map(line => line.category || 'General'))].sort((a, b) => a.localeCompare(b)), [lines]);
  const filtered = lines.filter(line => (section === 'all' || (line.category || 'General') === section)
    && (!query.trim() || `${line.itemCode} ${line.category || ''} ${line.description} ${line.unit}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const sectionTotal = filtered.reduce((sum, line) => sum + line.totalCost, 0);
  return <section aria-label="Approved BOQ baseline" className={styles.panel}>
    <div className={styles.fields}><label htmlFor="approved-boq-section">Section</label><select id="approved-boq-section" value={section} onChange={event => setSection(event.target.value)}><option value="all">All sections ({lines.length})</option>{sections.map(name => <option key={name} value={name}>{name} · {lines.filter(line => (line.category || 'General') === name).length}</option>)}</select><label htmlFor="approved-boq-search">Search BOQ items</label><input id="approved-boq-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Item code, section, description, unit"/></div>
    <p className={styles.muted}>{filtered.length} of {lines.length} items · filtered value {currency(sectionTotal)}</p>
    <div className={styles.scroll} role="region" aria-label="BOQ baseline items" tabIndex={0}><table className={styles.table}><thead><tr><th>Item</th><th>Section</th><th>Description</th><th>Unit</th><th>Approved quantity</th><th>Unit rate</th><th>Amount</th></tr></thead><tbody>{filtered.map(line => <tr key={line.id}><th scope="row">{line.itemCode}</th><td>{line.category || 'General'}</td><td>{line.description}</td><td>{line.unit}</td><td>{line.quantity.toLocaleString('en-PH', { maximumFractionDigits: 12 })}</td><td>{currency(line.combinedUnitCost)}</td><td>{currency(line.totalCost)}</td></tr>)}</tbody><tfoot><tr><th colSpan={6}>Visible BOQ amount</th><td>{currency(sectionTotal)}</td></tr></tfoot></table></div>
    {!filtered.length && <p className={styles.muted}>{query ? 'No BOQ items match this search.' : 'This section has no BOQ items.'}</p>}
  </section>;
}
