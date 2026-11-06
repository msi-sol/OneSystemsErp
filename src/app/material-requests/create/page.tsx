import { prisma } from '@/lib/prisma';
import NewMRFForm from './NewMRFForm';
import Link from 'next/link';
import PackageMaterialRequestForm from './PackageMaterialRequestForm';

export const dynamic = 'force-dynamic';

export default async function NewMRFPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const params = await searchParams;
  const projectId = params?.projectId;

  if (!projectId) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <h2>Select a project first</h2>
        <p>Open Material Requests and choose a project to create its request.</p>
        <Link href="/material-requests" style={{ color: 'var(--accent-color)', display: 'inline-block', padding: '12px' }}>Open Material Requests</Link>
      </div>
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <h2>Project Not Found</h2>
        <Link href="/material-requests" style={{ color: 'var(--accent-color)', display: 'inline-block', padding: '12px' }}>Back to Material Requests</Link>
      </div>
    );
  }

  const allItems = await prisma.consolidatedBOQItem.findMany({
    where: { projectId },
    orderBy: [
      { isVariationItem: 'asc' },
      { itemCode: 'asc' }
    ]
  });

  const generatedMaterials = await prisma.bOQMapping.count({ where: { mappingType: 'BENCHMARK_REVIEW', status: 'APPROVED', consolidatedBoqItem: { projectId } } });

  const items = allItems.filter(item => {
    const isLot = item.unit?.toLowerCase().includes('lot') || false;
    return generatedMaterials > 0 || !isLot;
  });

  const users = await prisma.user.findMany({
    select: { id: true, name: true }
  });

  const schedule = generatedMaterials > 0 ? await prisma.projectSchedule.findFirst({
    where: { projectId, workflowStatus: 'ACTIVE_BASELINE' }, orderBy: { activatedAt: 'desc' },
    select: { activities: { select: { id: true, name: true }, orderBy: { activityCode: 'asc' } } },
  }) : null;

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{ marginBottom: '30px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '20px' }}>
        <Link href="/material-requests" style={{ color: 'var(--accent-color)', display: 'inline-block', marginBottom: '16px' }}>Back to Material Requests</Link>
        <h1 style={{ margin: '0 0 10px 0', color: 'var(--text-primary)' }}>Create Material Request</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Project: <strong>{project.name}</strong></p>
      </header>

      {items.length === 0 ? (
        <section role="status" style={{ padding: '24px', border: '1px solid var(--glass-border)', borderRadius: '12px' }}>
          <h2>No requestable materials yet</h2>
          <p>{allItems.length === 0
            ? 'This project has no master material rows. Review the procurement benchmark and generate its master materials before preparing a request.'
            : 'The master list currently contains only lump-sum scope. Review its material breakdown before requesting individual materials.'}</p>
          <Link href={`/projects/${projectId}?tab=consolidation`} style={{ color: 'var(--accent-color)' }}>Open this project’s master materials</Link>
        </section>
      ) : generatedMaterials > 0 ? <PackageMaterialRequestForm projectId={projectId} packages={schedule?.activities ?? []} /> : <NewMRFForm projectId={projectId} items={items} users={users} />}
    </div>
  );
}
