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
import { loadMaterialTracking } from '@/lib/procurement/load-material-tracking';
import styles from './materialsFlow.module.css';

const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
    include: { mappings: { select: { mappingType: true, procurementBenchmarkItemId: true, procurementBenchmarkItem: { select: { itemCode: true, description: true } } } } },
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
    if (reviewState) return <section className={styles.empty}><h3>Reviewed benchmark materials</h3><p>Generate material rows from the reviewed benchmark. Labor, equipment and other allowances remain budget evidence.</p><Link className={styles.cta} href={`/projects/${projectId}?tab=benchmark`}>Open Procurement Benchmark →</Link></section>;
    if (isPurchasingOfficer) {
      return (
        <div className={styles.empty}>
          <h3>Master Materials List not generated yet</h3>
          <p>A Project Manager or Project Director generates it from the locked procurement benchmark.</p>
        </div>
      );
    }
    if (!isBenchmarkLocked) {
      return (
        <div className={styles.empty} id="materials-generate">
          <h3>Lock the procurement benchmark first</h3>
          <p>The Master Materials List is generated from the procurement benchmark, so every benchmark line carries over. Check the benchmark, lock it, then come back here.</p>
          <Link className={styles.cta} href={`/projects/${projectId}?tab=benchmark`}>Open Procurement Benchmark →</Link>
          <details className={styles.alt}>
            <summary>No benchmark? Upload a materials list from Excel instead</summary>
            <UploadMasterMaterialsButton projectId={projectId} />
          </details>
        </div>
      );
    }
    return (
      <div className={styles.empty} id="materials-generate">
        <AutoConsolidateButton projectId={projectId} />
        <details className={styles.alt}>
          <summary>Or upload a materials list from Excel instead</summary>
          <UploadMasterMaterialsButton projectId={projectId} />
        </details>
      </div>
    );
  }

  // Calculate totals
  const totalItems = consolidatedItems.length;
  const totalAmount = consolidatedItems.reduce((sum, item) => sum + item.totalCost, 0);

  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  // Procurement tracking per material: requested → ordered → delivered → issued → on hand, with its movement history.
  const tracking = await loadMaterialTracking(prisma as unknown as Prisma.TransactionClient, projectId, consolidatedItems.map(item => ({ id: item.id, deliveredQty: item.deliveredQty ?? 0, consumedQty: item.consumedQty ?? 0 })));

  // Transfer check: every benchmark line should be in this list (the benchmark is the source), and the amounts that
  // came from it should still equal the benchmark. Materials added here and VO items are shown separately.
  const benchmarkLines = await prisma.procurementBenchmarkItem.findMany({ where: { projectId }, select: { id: true, itemCode: true, description: true, totalCost: true } });
  const carried = new Set(consolidatedItems.flatMap(item => (item.mappings ?? []).map(mapping => mapping.procurementBenchmarkItemId).filter((value): value is string => !!value)));
  const fromBenchmark = consolidatedItems.filter(item => (item.mappings ?? []).some(mapping => mapping.procurementBenchmarkItemId));
  const addedHere = consolidatedItems.filter(item => !(item.mappings ?? []).length && !item.isVariationItem);
  const missing = benchmarkLines.filter(line => !carried.has(line.id));
  const benchmarkTotal = benchmarkLines.reduce((sum, line) => sum + line.totalCost, 0);
  const carriedTotal = benchmarkLines.filter(line => carried.has(line.id)).reduce((sum, line) => sum + line.totalCost, 0);
  const listFromBenchmarkTotal = fromBenchmark.reduce((sum, item) => sum + item.totalCost, 0);
  const amountsMatch = Math.abs(carriedTotal - listFromBenchmarkTotal) < 1;
  const linkedToSource = fromBenchmark.length > 0;
  const transferOk = linkedToSource && !missing.length && amountsMatch;
  const transfer = !benchmarkLines.length ? null : <section className={styles.check} aria-label="Transfer from the procurement benchmark" style={{ borderColor: transferOk ? 'rgba(79, 191, 154, .4)' : 'rgba(241, 199, 130, .45)' }}>
    <div className={styles.checkHead}>
      <span className={`${styles.checkIcon} ${transferOk ? styles.good : styles.warn}`} aria-hidden="true">{transferOk ? '✓' : '!'}</span>
      <div>
        <h3 className={styles.checkTitle}>{!linkedToSource
          ? 'This list was uploaded, not generated from the benchmark'
          : transferOk ? `All ${benchmarkLines.length} benchmark lines are in this list` : missing.length ? `${missing.length} of ${benchmarkLines.length} benchmark lines are not in this list` : 'Amounts differ from the procurement benchmark'}</h3>
        <p className={styles.checkText}>
          {!linkedToSource
            ? `It cannot be checked line by line against the procurement benchmark (${benchmarkLines.length} lines, ${peso(benchmarkTotal)}). Generate it from the benchmark to keep the two in step.`
            : <>Benchmark {peso(benchmarkTotal)} → {fromBenchmark.length} materials worth {peso(listFromBenchmarkTotal)}{fromBenchmark.length < carried.size ? ` (identical lines combined)` : ''}.
              {!amountsMatch && ` The amounts differ by ${peso(Math.abs(carriedTotal - listFromBenchmarkTotal))}: the benchmark changed after this list was made.`}
              {(missing.length > 0 || !amountsMatch) && (reviewState ? ' Lines left out by the saved review (labor, equipment or other allowances) stay as budget only.' : !isConsolidatedLocked ? ' Use More → Regenerate to copy the benchmark again.' : '')}</>}
          {' '}Corrections to these lines are made in the <Link href={`/projects/${projectId}?tab=benchmark`} style={{ color: 'var(--accent-color)' }}>procurement benchmark</Link>.
          {addedHere.length > 0 && ` ${addedHere.length} material${addedHere.length === 1 ? ' was' : 's were'} added here (${peso(addedHere.reduce((sum, item) => sum + item.totalCost, 0))}), not from the benchmark.`}
        </p>
      </div>
    </div>
    {missing.length > 0 && linkedToSource && <ul className={styles.checkList}>
      {missing.slice(0, 8).map(line => <li key={line.id}>{line.itemCode ? `${line.itemCode} · ` : ''}{line.description.slice(0, 90)} · {peso(line.totalCost)}</li>)}
      {missing.length > 8 && <li>…and {missing.length - 8} more</li>}
    </ul>}
  </section>;
  const allowanceRows = reviewState ? await readMaterialAllowanceUsage(prisma as unknown as Prisma.TransactionClient, projectId) : [];

  return (
    <div>
      {transfer}
      <MaterialAllowanceSummary rows={allowanceRows} />
      <ConsolidatedBOQViewer 
        projectId={projectId}
        tracking={tracking}
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
