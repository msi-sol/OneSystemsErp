import { getReferenceFiles } from '@/app/actions/notebook';
import NotebookClient from './NotebookClient';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/dal/auth';

export const dynamic = 'force-dynamic';

export default async function NotebookPage() {
  // Act as the signed-in user; the backend checks this user's permissions when approving/locking files.
  const currentUser = await verifySession();
  if (!currentUser) redirect('/login');

  const files = await getReferenceFiles();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-main)' }}>
      <NotebookClient 
        initialFiles={files} 
        currentUser={{ id: currentUser.id, role: currentUser.role }}
      />
    </div>
  );
}
