import { prisma } from '@/lib/prisma';
import NewWorkerForm from '@/app/workers/new/NewWorkerForm';

export const dynamic = 'force-dynamic';

export default async function EditWorkerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const worker = await prisma.worker.findUnique({
    where: { id }
  });

  if (!worker) {
    return <div style={{ padding: '20px', color: '#fff' }}>Worker not found.</div>;
  }

  // Sanitize the object so it passes down well to client
  const serializedWorker = JSON.parse(JSON.stringify(worker));
  const projects = await prisma.project.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', color: '#fff' }}>
      <header style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: 0, fontSize: '2rem' }}>Edit Worker / Consultant</h1>
        <p style={{ margin: '5px 0 0 0', color: 'var(--text-secondary)' }}>Update profile information and configuration.</p>
      </header>
      <NewWorkerForm initialData={serializedWorker} projects={projects} />
    </div>
  );
}
