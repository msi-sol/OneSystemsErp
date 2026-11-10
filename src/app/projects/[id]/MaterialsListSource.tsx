'use client';

import { useState } from 'react';
import AutoConsolidateButton from './AutoConsolidateButton';
import UploadMasterMaterialsButton from './UploadMasterMaterialsButton';
import styles from './materialsFlow.module.css';
import choice from './work-packages/locations-step.module.css';

/**
 * Two ways to create the Master Materials List, as two choices (same look as Resources & DUPA): generate it from the
 * locked procurement benchmark, or upload an own list. Only the chosen one is shown.
 */
export default function MaterialsListSource({ projectId, benchmarkLocked }: { projectId: string; benchmarkLocked: boolean }) {
  const [method, setMethod] = useState<'generate' | 'upload'>('generate');
  return <section className={styles.empty} id="materials-generate" aria-labelledby="materials-source-heading" style={{ textAlign: 'left' }}>
    <h3 id="materials-source-heading">Create the Master Materials List</h3>
    <div className={choice.choiceGroup} role="radiogroup" aria-labelledby="materials-source-heading">
      <button type="button" role="radio" aria-checked={method === 'generate'} className={`${choice.choice} ${method === 'generate' ? choice.choiceOn : ''}`} onClick={() => setMethod('generate')}>
        <strong>Generate from procurement benchmark</strong><span>{benchmarkLocked ? 'Every benchmark line carries over' : 'Lock the benchmark first'}</span>
      </button>
      <button type="button" role="radio" aria-checked={method === 'upload'} className={`${choice.choice} ${method === 'upload' ? choice.choiceOn : ''}`} onClick={() => setMethod('upload')}>
        <strong>Upload own material list</strong><span>Not linked line by line to the benchmark</span>
      </button>
    </div>
    <div style={{ marginTop: 18 }}>
      {method === 'upload'
        ? <UploadMasterMaterialsButton projectId={projectId} />
        : <AutoConsolidateButton projectId={projectId} benchmarkLocked={benchmarkLocked} />}
    </div>
  </section>;
}
