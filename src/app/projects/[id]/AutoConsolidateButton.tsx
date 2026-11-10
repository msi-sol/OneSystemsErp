'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { autoConsolidateBOQ } from '@/app/actions/consolidation';
import AiThinking from '@/components/ai/AiThinking';
import styles from './materialsFlow.module.css';
import box from '@/components/ui/UploadDropzone.module.css';

/**
 * Copies the locked procurement benchmark into the Master Materials List, with progress shown while it runs. Same
 * centered box as the uploads, with the generate button in the middle. Until the benchmark is locked, the button
 * opens the benchmark instead.
 */
const PROGRESS = ['Reading the benchmark lines', 'Combining identical materials with the same unit', 'Keeping each line’s BOQ link', 'Saving the materials list'];

export default function AutoConsolidateButton({ projectId, benchmarkLocked = true }: { projectId: string; benchmarkLocked?: boolean }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState('');

  const handleConsolidate = async () => {
    setIsPending(true);
    setError('');
    try {
      await autoConsolidateBOQ(projectId);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'The list could not be generated. Try again; nothing was changed.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={box.dropzone}>
        <div className={box.uploadIcon}><ClipboardList size={28} strokeWidth={1.6} /></div>
        <h2>Generate from the procurement benchmark</h2>
        <p>{benchmarkLocked ? 'Every benchmark line is copied; identical materials with the same unit become one row.' : 'Lock the procurement benchmark first; the list is generated from it.'}</p>
        {isPending
          ? <AiThinking messages={PROGRESS} note="This usually takes a few seconds." />
          : benchmarkLocked
            ? <button type="button" className={styles.cta} onClick={() => void handleConsolidate()}>Generate materials list</button>
            : <Link className={styles.cta} href={`/projects/${projectId}?tab=benchmark`}>Open Procurement Benchmark →</Link>}
      </div>
    </div>
  );
}
