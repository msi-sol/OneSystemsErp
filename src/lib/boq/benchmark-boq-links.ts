import type { Prisma } from '@prisma/client';

/**
 * Which approved BOQ item each procurement-benchmark line budgets for, chosen by a reviewer (usually from the AI
 * Check's suggestions). ProcurementBenchmarkItem has no BOQ column, so the links are kept as the latest audit-log
 * state for the project ({ links: { [benchmarkItemId]: boqItemId } }), the same way the benchmark review keeps its
 * state. "Generate Master Materials" copies them into BOQMapping.awardedBoqItemId, and saving links after that also
 * updates those mappings, so the master materials list (and VO approval, which finds materials by BOQ item) stays in
 * step. When no saved state exists, the mappings are read instead.
 */
export const BENCHMARK_BOQ_LINKS_ACTION = 'PROCUREMENT_BENCHMARK_BOQ_LINKS';

export async function readBenchmarkBoqLinks(db: Pick<Prisma.TransactionClient, 'auditLog'> & Partial<Pick<Prisma.TransactionClient, 'bOQMapping'>>, projectId: string): Promise<Record<string, string>> {
  const row = await db.auditLog.findFirst({
    where: { moduleName: 'PROJECT_MANAGEMENT', transactionId: projectId, actionType: BENCHMARK_BOQ_LINKS_ACTION },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { newValue: true },
  });
  let saved: Record<string, string> | null = null;
  try {
    const parsed = JSON.parse(row?.newValue || '{}') as { links?: unknown };
    if (parsed.links && typeof parsed.links === 'object' && !Array.isArray(parsed.links)) {
      saved = Object.fromEntries(Object.entries(parsed.links as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    }
  } catch { saved = null; }
  if (saved || !db.bOQMapping) return saved ?? {};
  // No saved link state (none yet, or the history was cleared): use the links kept on the generated material
  // mappings, which every save also updates.
  const mappings = await db.bOQMapping.findMany({
    where: { procurementBenchmarkItem: { is: { projectId } }, awardedBoqItemId: { not: null }, mappingType: { not: 'BENCHMARK_REVIEW' } },
    select: { procurementBenchmarkItemId: true, awardedBoqItemId: true },
  });
  return Object.fromEntries(mappings.flatMap((mapping) => mapping.procurementBenchmarkItemId && mapping.awardedBoqItemId ? [[mapping.procurementBenchmarkItemId, mapping.awardedBoqItemId]] : []));
}
