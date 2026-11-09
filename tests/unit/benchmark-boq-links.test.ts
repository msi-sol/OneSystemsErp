import { readBenchmarkBoqLinks } from '@/lib/boq/benchmark-boq-links';

const auditRow = (links: unknown) => ({ newValue: JSON.stringify({ links }) });

describe('benchmark → BOQ links', () => {
  it('uses the latest saved link state when there is one', async () => {
    const bOQMapping = { findMany: jest.fn() };
    const db = { auditLog: { findFirst: jest.fn().mockResolvedValue(auditRow({ b1: 'boq-1', b2: 7 })) }, bOQMapping };
    await expect(readBenchmarkBoqLinks(db as never, 'p1')).resolves.toEqual({ b1: 'boq-1' });
    expect(bOQMapping.findMany).not.toHaveBeenCalled();
  });

  it('falls back to the links kept on generated material mappings when no state is saved', async () => {
    const bOQMapping = { findMany: jest.fn().mockResolvedValue([
      { procurementBenchmarkItemId: 'b1', awardedBoqItemId: 'boq-1' },
      { procurementBenchmarkItemId: null, awardedBoqItemId: 'boq-2' },
    ]) };
    const db = { auditLog: { findFirst: jest.fn().mockResolvedValue(null) }, bOQMapping };
    await expect(readBenchmarkBoqLinks(db as never, 'p1')).resolves.toEqual({ b1: 'boq-1' });
    expect(bOQMapping.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ procurementBenchmarkItem: { is: { projectId: 'p1' } }, mappingType: { not: 'BENCHMARK_REVIEW' } }),
    }));
  });

  it('returns no links when neither exists', async () => {
    const db = { auditLog: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(readBenchmarkBoqLinks(db as never, 'p1')).resolves.toEqual({});
  });
});
