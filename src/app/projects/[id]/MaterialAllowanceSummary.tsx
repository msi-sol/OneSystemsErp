import type { readMaterialAllowanceUsage } from '@/lib/boq/material-allowance-usage';

export default function MaterialAllowanceSummary({ rows }: { rows: Awaited<ReturnType<typeof readMaterialAllowanceUsage>> }) {
  if (!rows.length) return null;
  const money = (value: string) => Number(value).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
  return <section style={{ marginBottom: 24 }} aria-label="Master material limits">
    <h3>Master material limits</h3>
    <p>Approved benchmark quantities combine matching materials across packages. Submitted requests reserve quantity; cancelled or rejected requests release it. Cost usage below is approved purchase-order commitments, not cash paid or draft request estimates.</p>
    <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>{['Material', 'Approved quantity', 'Reserved by MRFs', 'Available quantity', 'Approved budget', 'Committed PO cost', 'Available budget', 'Limit status'].map(label => <th key={label} style={{ padding: 12, textAlign: 'left' }}>{label}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.materialId}>{[`${row.description} · ${row.unit}`, row.approvedQuantity, row.reservedQuantity, row.remainingQuantity, money(row.approvedBudget), money(row.committedCost), money(row.remainingBudget), row.overBudget ? 'Over cost limit' : row.quantityLimitReached || row.costLimitReached ? 'Limit reached' : 'Within limits'].map((value, index) => <td key={index} style={{ padding: 12, borderTop: '1px solid var(--glass-border)' }}>{value}</td>)}</tr>)}</tbody>
    </table></div>
  </section>;
}
