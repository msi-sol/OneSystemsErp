'use client';

import { useState, useTransition } from 'react';
import { draftWorkflowMessage } from '@/lib/draft-workflow-messages';
import styles from './work-packages.module.css';

interface Props {
  projectId: string;
  allocationId: string;
  itemCode: string;
  quantity: string | null;
  rowVersion: number;
  onSaved: () => void;
}

export default function DraftAllocationEditor({ projectId, allocationId, itemCode, quantity, rowVersion, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(quantity || '0');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function save() {
    setError('');
    startTransition(async () => {
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/scheduling/allocations/${encodeURIComponent(allocationId)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ allocatedQuantity: value, expectedRowVersion: rowVersion }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(draftWorkflowMessage(data.error));
        setEditing(false);
        onSaved();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The allocation could not be saved.');
      }
    });
  }

  return <div className={styles.allocationEditor}>
    {editing ? <>
      <label className={styles.srOnly} htmlFor={`allocation-${allocationId}`}>Allocated quantity for {itemCode}</label>
      <input id={`allocation-${allocationId}`} type="number" min="0" step="any" value={value} disabled={pending} onChange={event => setValue(event.target.value)} />
      <div><button type="button" disabled={pending || !value.trim()} onClick={save}>{pending ? 'Saving…' : 'Save allocation'}</button><button type="button" disabled={pending} onClick={() => { setEditing(false); setError(''); }}>Cancel</button></div>
    </> : <>
      <span>{quantity ?? 'Not recorded'}</span>
      <button type="button" aria-label={`Edit allocation ${allocationId}`} onClick={() => { setValue(quantity || '0'); setEditing(true); }}>Edit quantity</button>
    </>}
    {error && <span role="alert" className={styles.allocationError}>{error}</span>}
  </div>;
}
