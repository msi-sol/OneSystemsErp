'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import UploadDropzone from '@/components/ui/UploadDropzone';
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
    <div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <UploadDropzone prompt="Drop the materials list here" hint="Excel with item no., description, quantity, unit and unit cost"
        accept=".xlsx,.xls" inputLabel="Choose the materials list file" files={file ? [file] : []} onFiles={files => setFile(files[0] ?? null)}
        disabled={isPending} status="ready to upload"
        action={<button type="button" className={styles.cta} onClick={() => void handleUpload()} disabled={!file || isPending}>{isPending ? 'Uploading…' : 'Upload list'}</button>} />
    </div>
  );
}
