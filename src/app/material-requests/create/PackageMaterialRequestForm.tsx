'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from '../../projects/page.module.css';
import MaterialAllowanceSummary from '../../projects/[id]/MaterialAllowanceSummary';
import type { readMaterialAllowanceUsage } from '@/lib/boq/material-allowance-usage';

type Requirement = {
  materialId: string; description: string; unit: string; requiredQuantity: string;
  pendingRequests: string; openPurchaseOrders: string; issued: string; shortage: string;
};
type PackageMaterials = { requirements: Requirement[]; canCreate: boolean; benchmarkMaterialBudget: string | null; projectMaterialLimits: Awaited<ReturnType<typeof readMaterialAllowanceUsage>> };

// Readable messages for the API's error codes (shown before as "REQUEST EXCEEDS CONFIRMED MATERIAL SHORTAGE").
const REQUEST_ERRORS: Record<string, string> = {
  REQUEST_EXCEEDS_CONFIRMED_MATERIAL_SHORTAGE: 'A requested quantity is more than the remaining allowance for this package. Lower it to the "Remaining shortage" shown, or wait for a cancelled request to release quantity.',
};

export default function PackageMaterialRequestForm({ projectId, packages }: {
  projectId: string; packages: { id: string; name: string; activityCode?: string | null }[];
}) {
  const router = useRouter();
  const [activityId, setActivityId] = useState('');
  const [data, setData] = useState<PackageMaterials | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [purpose, setPurpose] = useState('');
  const [dateNeeded, setDateNeeded] = useState('');
  const [locationOfUse, setLocation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/work-packages/materials`;

  useEffect(() => {
    const controller = new AbortController();
    if (!activityId) return () => controller.abort();
    fetch(`${endpoint}?activityId=${encodeURIComponent(activityId)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load package material allowances.');
        if (!controller.signal.aborted) setData(result);
      }).catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load package materials.');
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [activityId, endpoint]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const items = Object.entries(quantities).filter(([, quantity]) => Number(quantity) > 0).map(([materialId, quantity]) => ({ materialId, quantity }));
    if (!data || !activityId || !items.length) { setError('Enter a positive quantity for at least one package material.'); return; }
    setSaving(true); setError('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-request', activityId, purpose, dateNeeded, locationOfUse, items }) });
      const result = await response.json();
      if (!response.ok || !result.recordId) throw new Error(REQUEST_ERRORS[result.error] || result.error || 'Could not create this package request.');
      router.push(`/material-requests/${result.recordId}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create this package request.'); setSaving(false); }
  }

  return <form onSubmit={submit} style={{ display: 'grid', gap: 20 }}>
    <div>
      <label htmlFor="request-package">Work package</label>
      <select id="request-package" required value={activityId} disabled={saving} onChange={event => {
        setActivityId(event.target.value); setData(null); setQuantities({}); setError(''); setLoading(!!event.target.value);
      }} style={{ width: '100%', marginTop: 8 }}>
        <option value="">Select an approved work package</option>
        {/* The package code tells apart packages with the same name (e.g. "for ground:" under each system). */}
        {packages.map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.activityCode ? `${pkg.activityCode} · ${pkg.name}` : pkg.name}</option>)}
      </select>
      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>Materials and remaining quantities come from this package’s approved benchmark and live requests, orders and stock. The draft stays linked to the selected package.</p>
      {!packages.length && <Link href={`/projects/${projectId}/work-packages`} className={styles.actionLink}>Complete Work Package approval</Link>}
    </div>
    {loading && <p role="status">Loading package materials and remaining quantities…</p>}
    {error && <p role="alert" style={{ color: '#fca5a5', overflowWrap: 'anywhere' }}>{error.replaceAll('_', ' ')}</p>}
    {data && <>
      {/* Only this package's materials: the full project list (often 80+ rows) pushed the request table off screen. */}
      <MaterialAllowanceSummary rows={(data.projectMaterialLimits ?? []).filter(row => data.requirements.some(requirement => requirement.materialId === row.materialId))} />
      {data.benchmarkMaterialBudget !== null && <p>Approved package material budget: {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(data.benchmarkMaterialBudget))}</p>}
      <div className={styles.tableContainer}><table className={styles.table}>
        <thead><tr><th>Material</th><th>Allowance</th><th>Issued</th><th>Pending requests</th><th>Open POs</th><th>Remaining shortage</th><th>Request quantity</th></tr></thead>
        <tbody>{data.requirements.map(row => <tr key={row.materialId}>
          <td>{row.description} · {row.unit}</td><td>{row.requiredQuantity}</td><td>{row.issued}</td><td>{row.pendingRequests}</td><td>{row.openPurchaseOrders}</td><td>{row.shortage}</td>
          <td><input aria-label={`Request quantity for ${row.description}`} type="number" min="0" max={row.shortage} step="0.0001" disabled={saving || !data.canCreate || Number(row.shortage) <= 0} value={quantities[row.materialId] ?? ''} onChange={event => setQuantities(current => ({ ...current, [row.materialId]: event.target.value }))} style={{ width: 120 }} /></td>
        </tr>)}</tbody>
      </table></div>
      {!data.requirements.length && <p>No material requirements are approved for this package. <Link className={styles.actionLink} href={`/projects/${projectId}?tab=benchmark`}>Review benchmark mappings</Link></p>}
      <label htmlFor="package-request-purpose">Purpose<input id="package-request-purpose" value={purpose} minLength={3} required disabled={saving} onChange={event => setPurpose(event.target.value)} style={{ display: 'block', width: '100%', marginTop: 8 }} /></label>
      <label htmlFor="package-request-date">Date needed<input id="package-request-date" type="date" value={dateNeeded} required disabled={saving} onChange={event => setDateNeeded(event.target.value)} style={{ display: 'block', width: '100%', marginTop: 8 }} /></label>
      <label htmlFor="package-request-location">Location of use<input id="package-request-location" value={locationOfUse} required disabled={saving} onChange={event => setLocation(event.target.value)} style={{ display: 'block', width: '100%', marginTop: 8 }} /></label>
      <p style={{ color: 'var(--text-secondary)' }}>The signed-in user is recorded as the requester. Submission reserves the allowance through the existing review workflow.</p>
      <button type="submit" className={styles.primaryButton} disabled={saving || !data.canCreate || !data.requirements.some(row => Number(row.shortage) > 0)}>{saving ? 'Creating draft…' : 'Create package material request'}</button>
    </>}
  </form>;
}
