'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toggleConsolidatedBOQLock } from '@/app/actions/mutations';
import { askConfirm } from '@/lib/ui/dialogs';
import styles from './materialsFlow.module.css';

/**
 * Locks or unlocks the Master Materials List. The label is the action ("Lock list" / "Unlock"), never the state, and
 * the confirmation is an in-page dialog (the browser's confirm() is blocked in some browsers, so it silently did nothing).
 */
export default function LockConsolidatedBOQButton({ projectId, isLocked, onError }: { projectId: string; isLocked: boolean; onError?: (message: string) => void }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async () => {
    const ok = await askConfirm(isLocked
      ? 'Unlock the Master Materials List? Material requests cannot be raised from it until it is locked again.'
      : 'Lock the Master Materials List? Material requests can then be raised from it; it can no longer be regenerated or changed here.',
    { confirmLabel: isLocked ? 'Unlock list' : 'Lock list', danger: isLocked });
    if (!ok) return;
    setIsLoading(true);
    try {
      await toggleConsolidatedBOQLock(projectId, !isLocked);
      router.refresh();
    } catch (err: unknown) {
      onError?.(err instanceof Error && err.message ? err.message : 'The lock could not be changed.');
    } finally {
      setIsLoading(false);
    }
  };

  return isLocked
    ? <button type="button" className={styles.ghost} onClick={() => void handleToggle()} disabled={isLoading}>{isLoading ? 'Unlocking…' : 'Unlock'}</button>
    : <button type="button" className={styles.cta} onClick={() => void handleToggle()} disabled={isLoading}>{isLoading ? 'Locking…' : 'Lock list'}</button>;
}
