import type { Prisma } from '@prisma/client';

/**
 * Which approved BOQ item each procurement-benchmark line budgets for, chosen by a reviewer (usually from the AI
 * Check's suggestions). ProcurementBenchmarkItem has no BOQ column, so the links are kept as the latest audit-log
 * state for the project ({ links: { [benchmarkItemId]: boqItemId } }), the same way the benchmark review keeps its
 * state. "Generate Master Materials" copies them into BOQMapping.awardedBoqItemId.
 */
export const BENCHMARK_BOQ_LINKS_ACTION = 'PROCUREMENT_BENCHMARK_BOQ_LINKS';

export async function readBenchmarkBoqLinks(db: Pick<Prisma.TransactionClient, 'auditLog'>, projectId: string): Promise<Record<string, string>> {
  const row = await db.auditLog.findFirst({
    where: { moduleName: 'PROJECT_MANAGEMENT', transactionId: projectId, actionType: BENCHMARK_BOQ_LINKS_ACTION },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { newValue: true },
  });
  try {
    const parsed = JSON.parse(row?.newValue || '{}') as { links?: unknown };
    if (!parsed.links || typeof parsed.links !== 'object' || Array.isArray(parsed.links)) return {};
    return Object.fromEntries(Object.entries(parsed.links as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch { return {}; }
}
