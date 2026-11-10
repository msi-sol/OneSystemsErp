'use client';

import { useTransition } from 'react';
import { deleteProject } from '@/app/actions/project';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import styles from './page.module.css';

export default function DeleteProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleDelete = () => {
    if (!confirm(`Delete "${projectName}"?\n\nThis removes the project and everything recorded for it (BOQ, plan, procurement, issuance and history). This cannot be undone.`)) return;
    startTransition(async () => {
      try {
        const res = await deleteProject(projectId);
        if (res && res.error) alert('Failed to delete: ' + res.error);
        else router.refresh();
      } catch (error: unknown) {
        alert('Error: ' + (error instanceof Error ? error.message : 'Error deleting project'));
      }
    });
  };

  return (
    <button type="button" className={styles.deleteProjectAction} onClick={handleDelete} disabled={isPending} aria-label={`Delete ${projectName}`} title="Delete project">
      <Trash2 size={16} aria-hidden="true" />
      {isPending ? 'Deleting…' : 'Delete'}
    </button>
  );
}
