'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../planning/planning.module.css';

export default function BOQReviewPreparation({ projectId, versionId, canPrepare }: { projectId: string; versionId: string; canPrepare: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function prepare() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/boq-review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prepare-review', versionId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'The BOQ review record could not be prepared.');
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The BOQ review record could not be prepared.'); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel} aria-labelledby="prepare-boq-review-heading">
    <h3 id="prepare-boq-review-heading">Review record needed</h3>
    <p className={styles.muted}>This draft predates BOQ review records. Preparing one snapshots the existing BOQ lines for review. No original workbook or first reading is available for this draft.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {canPrepare ? <button type="button" className={styles.button} disabled={busy} onClick={() => void prepare()}>{busy ? 'Preparing…' : 'Prepare legacy BOQ review'}</button> : <p className={styles.muted}>An authorized BOQ editor must prepare the review record.</p>}
  </section>;
}
