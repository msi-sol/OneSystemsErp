'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadMasterMaterialsList } from '@/app/actions/consolidation';
import styles from './materialsFlow.module.css';

/** Secondary path: upload a ready-made materials list. It is not linked line by line to the benchmark. */
export default function UploadMasterMaterialsButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setIsPending(true);
    setError('');
    const formData = new FormData();
    formData.append('projectId', projectId);
    formData.append('materialsFile', file);
    try {
      await uploadMasterMaterialsList(formData);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'The file could not be uploaded.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ marginBottom: 12 }}>
        The Excel file needs columns for item no., description, quantity, unit and unit cost. An uploaded list is not linked
        line by line to the procurement benchmark.
      </p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.fileRow}>
        <label className={styles.ghost} style={{ cursor: 'pointer' }}>
          {file ? `📄 ${file.name}` : 'Choose Excel file (.xlsx)'}
          <input type="file" accept=".xlsx,.xls" className="sr-only" onChange={event => setFile(event.target.files?.[0] ?? null)} />
        </label>
        <button type="button" className={styles.secondary} onClick={() => void handleUpload()} disabled={!file || isPending}>
          {isPending ? 'Uploading…' : 'Upload list'}
        </button>
      </div>
    </div>
  );
}
