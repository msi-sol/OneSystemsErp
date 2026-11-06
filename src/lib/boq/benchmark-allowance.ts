import { Prisma } from '@prisma/client';

const REVIEW_ACTION = 'PROCUREMENT_BENCHMARK_REVIEW_STATE';
const REVIEW_MODULE = 'PROJECT_MANAGEMENT';
const MAPPING_TYPE = 'BENCHMARK_REVIEW';

type GeneratedReview = {
  id: string;
  projectId: string;
  status: string;
  materialIds?: string[];
  benchmarkIds?: Record<string, string>;
};

type ReviewMapping = {
  procurementBenchmarkItemId: string | null;
  allocationQuantity: number | null;
  remarks: string | null;
  procurementBenchmarkItem: { projectId: string } | null;
};

/**
 * Project the approved quantity for one generated master material/package pair.
 * Null means this project has no generated benchmark and retains legacy behavior.
 */
export function projectGeneratedPackageAllowance(input: {
  review: GeneratedReview | null;
  projectId: string;
  materialId: string;
  sourcePackageId: string;
  mappings: ReviewMapping[];
}): Prisma.Decimal | null {
  const { review, projectId, materialId, sourcePackageId, mappings } = input;
  if (!review || review.status !== 'GENERATED') return null;
  if (review.projectId !== projectId || !review.id) throw new Error('BENCHMARK_ALLOWANCE_REVIEW_INVALID');
  if (!review.materialIds?.includes(materialId)) throw new Error('MATERIAL_NOT_IN_APPROVED_BENCHMARK');

  const approvedBenchmarkIds = new Set(Object.values(review.benchmarkIds || {}));
  if (!approvedBenchmarkIds.size) throw new Error('BENCHMARK_ALLOWANCE_ASSOCIATION_INVALID');

  let allowance = new Prisma.Decimal(0);
  const seenSourceLines = new Set<string>();
  for (const mapping of mappings) {
    let provenance: { benchmarkReviewId?: unknown; sourceLineId?: unknown; sourcePackageId?: unknown };
    try {
      provenance = JSON.parse(mapping.remarks || '{}');
    } catch {
      throw new Error('BENCHMARK_ALLOWANCE_ASSOCIATION_INVALID');
    }
    if (provenance.benchmarkReviewId !== review.id) continue;
    if (!mapping.procurementBenchmarkItemId || !approvedBenchmarkIds.has(mapping.procurementBenchmarkItemId) ||
      mapping.procurementBenchmarkItem?.projectId !== projectId || typeof provenance.sourceLineId !== 'string' ||
      typeof provenance.sourcePackageId !== 'string' || mapping.allocationQuantity === null ||
      !Number.isFinite(mapping.allocationQuantity) || mapping.allocationQuantity < 0 || seenSourceLines.has(provenance.sourceLineId)) {
      throw new Error('BENCHMARK_ALLOWANCE_ASSOCIATION_INVALID');
    }
    seenSourceLines.add(provenance.sourceLineId);
    if (provenance.sourcePackageId === sourcePackageId) allowance = allowance.plus(String(mapping.allocationQuantity));
  }
  return allowance;
}

/** Read the generated, audited allocation inside the caller's transaction. */
export async function readGeneratedPackageAllowance(
  tx: Prisma.TransactionClient,
  projectId: string,
  sourcePackageId: string,
  materialId: string,
): Promise<Prisma.Decimal | null> {
  const row = await tx.auditLog.findFirst({
    where: { moduleName: REVIEW_MODULE, transactionId: projectId, actionType: REVIEW_ACTION },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { newValue: true },
  });
  if (!row) return null;

  let review: GeneratedReview;
  try {
    review = JSON.parse(row.newValue || 'null') as GeneratedReview;
  } catch {
    throw new Error('BENCHMARK_ALLOWANCE_REVIEW_INVALID');
  }
  if (!review || typeof review !== 'object') throw new Error('BENCHMARK_ALLOWANCE_REVIEW_INVALID');
  if (!review || review.status !== 'GENERATED') return null;

  const mappings = await tx.bOQMapping.findMany({
    where: { mappingType: MAPPING_TYPE, status: 'APPROVED', consolidatedBoqItemId: materialId },
    select: {
      procurementBenchmarkItemId: true,
      allocationQuantity: true,
      remarks: true,
      procurementBenchmarkItem: { select: { projectId: true } },
    },
  });
  return projectGeneratedPackageAllowance({ review, projectId, materialId, sourcePackageId, mappings });
}

/** Material spending limit from approved source amounts, not BOQ plan allowances. */
export async function readGeneratedPackageMaterialBudget(tx: Prisma.TransactionClient, projectId: string, sourcePackageId: string) {
  const row = await tx.auditLog.findFirst({ where: { moduleName: REVIEW_MODULE, transactionId: projectId, actionType: REVIEW_ACTION }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { newValue: true } });
  if (!row) return null;
  const review = JSON.parse(row.newValue || 'null') as GeneratedReview | null;
  if (!review || review.projectId !== projectId) throw new Error('BENCHMARK_ALLOWANCE_REVIEW_INVALID');
  if (review.status !== 'GENERATED') return null;
  const mappings = await tx.bOQMapping.findMany({ where: { mappingType: MAPPING_TYPE, status: 'APPROVED', consolidatedBoqItem: { projectId } },
    select: { procurementBenchmarkItemId: true, remarks: true, procurementBenchmarkItem: { select: { projectId: true, totalCost: true } } } });
  const approvedIds = new Set(Object.values(review.benchmarkIds || {}));
  const seen = new Set<string>();
  let total = new Prisma.Decimal(0);
  for (const mapping of mappings) {
    const provenance = JSON.parse(mapping.remarks || '{}');
    if (provenance.benchmarkReviewId !== review.id) continue;
    if (!mapping.procurementBenchmarkItem || mapping.procurementBenchmarkItem.projectId !== projectId || !mapping.procurementBenchmarkItemId || !approvedIds.has(mapping.procurementBenchmarkItemId) || typeof provenance.sourceLineId !== 'string' || typeof provenance.sourcePackageId !== 'string' || seen.has(provenance.sourceLineId)) throw new Error('BENCHMARK_ALLOWANCE_ASSOCIATION_INVALID');
    seen.add(provenance.sourceLineId);
    const amount = new Prisma.Decimal(String(mapping.procurementBenchmarkItem.totalCost));
    if (!amount.isFinite() || amount.lt(0)) throw new Error('BENCHMARK_ALLOWANCE_ASSOCIATION_INVALID');
    if (provenance.sourcePackageId === sourcePackageId) total = total.plus(amount);
  }
  return total.toFixed(2);
}
