import { verifySession } from '@/lib/dal/auth';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AutoConsolidateButton from './AutoConsolidateButton';
import ConsolidatedBOQViewer from './ConsolidatedBOQViewer';

import UploadMasterMaterialsButton from './UploadMasterMaterialsButton';
import Link from 'next/link';
import { Prisma } from '@prisma/client';
import { readMaterialAllowanceUsage } from '@/lib/boq/material-allowance-usage';
import MaterialAllowanceSummary from './MaterialAllowanceSummary';

export default async function BOQConsolidationTab({ 
  projectId, 
  isBenchmarkLocked 
}: { 
  projectId: string;
  isBenchmarkLocked: boolean;
}) {  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { consolidatedBOQLocked: true }
  });
  const isConsolidatedLocked = project ? project.consolidatedBOQLocked : false;
  const reviewState = await prisma.auditLog.findFirst({ where: { moduleName: 'PROJECT_MANAGEMENT', transactionId: projectId, actionType: 'PROCUREMENT_BENCHMARK_REVIEW_STATE' }, select: { id: true } });

  const consolidatedItems = await prisma.consolidatedBOQItem.findMany({
    // A quantity allowance remains a material even when its approved rate is zero.
    where: { projectId },
    include: { mappings: { select: { mappingType: true } } },
    orderBy: [
      { isVariationItem: 'asc' },
      { category: 'asc' },
      { description: 'asc' }
    ]
  });

  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  
  let currentUser = null;
  if (sessionId) {
    currentUser = await prisma.user.findUnique({
      where: { id: sessionId },
      include: { userRoles: { include: { role: true } } }
    });
  }
  
  if (!currentUser) {
    const email = cookieStore.get('demo_user_email')?.value; 
    if(!email) {
      redirect('/');
    }
    currentUser = await prisma.user.findFirst({
      where: { email: { equals: email } },
      include: { userRoles: { include: { role: true } } }
    });
  }

  const isPurchasingOfficer = currentUser?.userRoles?.some(ur => ur.role.roleCode === 'PURCHASING_OFFICER');
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'SYSTEM_ADMIN' || currentUser?.userRoles?.some(ur => ur.role.roleCode === 'SUPER_ADMIN' || ur.role.roleCode === 'SYSTEM_ADMIN');

  if (consolidatedItems.length === 0) {
    if (reviewState) return <section><h3>Reviewed benchmark materials</h3><p>Generate material rows from the reviewed benchmark. Labor, equipment and other allowances remain budget evidence.</p><Link href={`/projects/${projectId}/benchmark`}>Open benchmark review →</Link></section>;
    if (isPurchasingOfficer) {
      return (
        <div style={{ textAlign: 'center', padding: '40px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <h3 style={{ color: '#ef4444' }}>Master Materials List Not Generated</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            The Master Materials List has not been generated yet. Only a Project Manager or Project Director can generate it from the Procurement Benchmark.
          </p>
        </div>
      );
    }
    return (
      <div>
        <UploadMasterMaterialsButton projectId={projectId} />
        
        {isBenchmarkLocked ? (
          <AutoConsolidateButton projectId={projectId} />
        ) : (
          <div style={{ textAlign: 'center', marginTop: '20px', padding: '40px', border: '1px solid var(--glass-border)', borderRadius: '12px', background: 'rgba(0, 0, 0, 0.2)' }}>
            <h3 style={{ marginBottom: '15px' }}>Option B: AI Auto-Generate</h3>
            <p style={{ color: '#ef4444', marginBottom: '15px' }}>Procurement Benchmark Not Locked</p>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto' }}>
              You must upload and lock the Procurement Benchmark (Forecast BOQ) before you can auto-generate the Master Materials List using AI.
            </p>
          </div>
        )}
      </div>
    );
  }

  // Calculate totals
  const totalItems = consolidatedItems.length;
  const totalAmount = consolidatedItems.reduce((sum, item) => sum + item.totalCost, 0);

  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const allowanceRows = reviewState ? await readMaterialAllowanceUsage(prisma as unknown as Prisma.TransactionClient, projectId) : [];

  return (
    <div>
      <MaterialAllowanceSummary rows={allowanceRows} />
      <ConsolidatedBOQViewer 
        projectId={projectId}
        isLocked={isConsolidatedLocked}
        consolidatedItems={consolidatedItems} 
        totalItems={totalItems} 
        totalAmount={totalAmount}
        users={users}
        canCreateMRF={!isPurchasingOfficer}
        canLock={!isPurchasingOfficer && !reviewState}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
