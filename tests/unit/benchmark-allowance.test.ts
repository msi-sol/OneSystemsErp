import { projectGeneratedPackageAllowance, readGeneratedPackageMaterialBudget } from '@/lib/boq/benchmark-allowance';

const review = {
  id: 'review-1', projectId: 'project-1', status: 'GENERATED', materialIds: ['material-1'],
  benchmarkIds: { lineA: 'benchmark-a', lineB: 'benchmark-b' },
};
const mapping = (sourcePackageId: string, allocationQuantity: number, sourceLineId: string, benchmarkId = 'benchmark-a') => ({
  procurementBenchmarkItemId: benchmarkId,
  allocationQuantity,
  remarks: JSON.stringify({ benchmarkReviewId: 'review-1', sourcePackageId, sourceLineId }),
  procurementBenchmarkItem: { projectId: 'project-1' },
});

describe('generated benchmark package allowance', () => {
  it('uses approved material source amounts for the package budget without mixing other packages', async () => {
    const tx = { auditLog: { findFirst: async () => ({ newValue: JSON.stringify(review) }) }, bOQMapping: { findMany: async () => [
      { ...mapping('package-a', 2, 'line-a'), procurementBenchmarkItem: { projectId: 'project-1', totalCost: 3.05 } },
      { ...mapping('package-b', 7, 'line-b', 'benchmark-b'), procurementBenchmarkItem: { projectId: 'project-1', totalCost: 99 } },
    ] } };
    expect(await readGeneratedPackageMaterialBudget(tx as never, 'project-1', 'package-a')).toBe('3.05');
  });
  it('sums only this material’s approved allocations for the selected source package', () => {
    const allowance = projectGeneratedPackageAllowance({
      review, projectId: 'project-1', materialId: 'material-1', sourcePackageId: 'package-a',
      mappings: [mapping('package-a', 12.5, 'line-a'), mapping('package-a', 2.5, 'line-b', 'benchmark-b'), mapping('package-b', 99, 'line-c')],
    });
    expect(allowance?.toString()).toBe('15');
  });

  it('returns zero when a generated material has no allocation to the package', () => {
    const allowance = projectGeneratedPackageAllowance({
      review, projectId: 'project-1', materialId: 'material-1', sourcePackageId: 'package-b',
      mappings: [mapping('package-a', 12, 'line-a')],
    });
    expect(allowance?.toString()).toBe('0');
  });

  it('leaves legacy projects unchanged until a benchmark is generated', () => {
    expect(projectGeneratedPackageAllowance({
      review: { ...review, status: 'DRAFT' }, projectId: 'project-1', materialId: 'legacy-material', sourcePackageId: 'package-a', mappings: [],
    })).toBeNull();
  });

  it('rejects attaching an unapproved master material or corrupt package associations', () => {
    expect(() => projectGeneratedPackageAllowance({
      review, projectId: 'project-1', materialId: 'unapproved-material', sourcePackageId: 'package-a', mappings: [],
    })).toThrow('MATERIAL_NOT_IN_APPROVED_BENCHMARK');
    expect(() => projectGeneratedPackageAllowance({
      review, projectId: 'project-1', materialId: 'material-1', sourcePackageId: 'package-a',
      mappings: [{ ...mapping('package-a', 12, 'line-a'), procurementBenchmarkItem: { projectId: 'other-project' } }],
    })).toThrow('BENCHMARK_ALLOWANCE_ASSOCIATION_INVALID');
  });
});
