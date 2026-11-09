import NewWorkerForm from './NewWorkerForm';
import { prisma } from '@/lib/prisma';

export default async function NewWorkerPage({ searchParams }: { searchParams: Promise<any> }) {
  const params = await searchParams;
  const projects = await prisma.project.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
  
  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', color: '#fff' }}>
      <header style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: 0, fontSize: '2rem' }}>Add New Worker / Consultant</h1>
        <p style={{ margin: '5px 0 0 0', color: 'var(--text-secondary)' }}>Complete profile registration with AI validation.</p>
      </header>
      <NewWorkerForm initialData={params} projects={projects} />
    </div>
  );
}
