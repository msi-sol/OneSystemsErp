'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { autoConsolidateBOQ } from '@/app/actions/consolidation';
import AiThinking from '@/components/ai/AiThinking';
import styles from './materialsFlow.module.css';

/** Copies the locked procurement benchmark into the Master Materials List, with progress shown while it runs. */
const PROGRESS = ['Reading the benchmark lines', 'Combining identical materials with the same unit', 'Keeping each line’s BOQ link', 'Saving the materials list'];

export default function AutoConsolidateButton({ projectId }: { projectId: string }) {
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
      <h3>Generate the Master Materials List</h3>
      <p>
        Every line of the locked procurement benchmark is copied into the list. Identical materials with the same unit are
        combined into one row; amounts stay as in the benchmark.
      </p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {isPending
        ? <AiThinking messages={PROGRESS} note="This usually takes a few seconds." />
        : <button type="button" className={styles.cta} onClick={() => void handleConsolidate()}>Generate from the benchmark</button>}
    </div>
  );
}
