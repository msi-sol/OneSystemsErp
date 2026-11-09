jest.mock('@/lib/dal/auth', () => ({ verifySession: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: { $transaction: jest.fn() } }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('@/lib/s3', () => ({ getStoredUploadDownloadUrl: jest.fn(), readStoredUpload: jest.fn(), uploadToS3: jest.fn() }));
jest.mock('@/lib/boq/workspace-service', () => ({ actorCanAccessProject: jest.fn() }));
jest.mock('@/lib/permissions', () => ({ hasPermission: jest.fn() }));
jest.mock('@/lib/boq/benchmark-request-allowance', () => ({ assertMaterialRequestAllowance: jest.fn(), assertMaterialRequestTransition: jest.fn() }));

import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/dal/auth';
import { actorCanAccessProject } from '@/lib/boq/workspace-service';
import { applyProcurementBenchmarkSuggestions, saveProcurementBenchmarkBoqLinks } from '@/app/actions/mutations';

function harness(options: { locked?: boolean; mapped?: boolean } = {}) {
  const tx = {
    project: { findUnique: jest.fn().mockResolvedValue({ procurementBenchmarkLocked: !!options.locked }) },
    auditLog: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
    bOQMapping: {
      findFirst: jest.fn().mockResolvedValue(options.mapped ? { id: 'm1' } : null),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: options.mapped ? 1 : 0 }),
    },
    procurementBenchmarkItem: {
      findMany: jest.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) => Promise.resolve(where.id.in.filter((id) => id !== 'missing').map((id) => ({ id, itemCode: 'X', category: null, description: 'D', unit: 'pc', unitCost: 1, totalCost: 1 })))),
      update: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  (prisma.$transaction as jest.Mock).mockImplementation((work: (client: typeof tx) => unknown) => work(tx));
  (verifySession as jest.Mock).mockResolvedValue({ id: 'u1', role: 'PROJECT_ENGINEER', mustChangePassword: false });
  (actorCanAccessProject as jest.Mock).mockResolvedValue(true);
  return tx;
}

describe('saving benchmark AI suggestions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('saves the chosen edits and removals together and records them', async () => {
    const tx = harness();
    const result = await applyProcurementBenchmarkSuggestions('p1', [
      { rowId: 'b1', field: 'unit', value: ' m ' }, { rowId: 'b1', field: 'description', value: 'Copper pipe 3/8 in' },
      { rowId: 'b2', field: 'totalCost', value: '₱1,250.50' }, { rowId: 'b3', field: 'remove', value: '' },
    ]);
    expect(tx.procurementBenchmarkItem.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { unit: 'm', description: 'Copper pipe 3/8 in' } });
    expect(tx.procurementBenchmarkItem.update).toHaveBeenCalledWith({ where: { id: 'b2' }, data: { totalCost: 1250.5 } });
    expect(tx.procurementBenchmarkItem.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'p1', id: { in: ['b3'] } } });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actionType: 'PROCUREMENT_BENCHMARK_AI_SUGGESTIONS_APPLIED' }) }));
    expect(result).toEqual({ updated: 2, removed: 1 });
  });

  it('merges chosen BOQ links into the saved links, clearing ones set to "not in the BOQ"', async () => {
    const tx = harness();
    Object.assign(tx, { awardedBOQItem: { findMany: jest.fn().mockResolvedValue([{ id: 'boq-2' }]) } });
    tx.auditLog.findFirst.mockResolvedValue({ newValue: JSON.stringify({ links: { b1: 'boq-1', b9: 'boq-1', gone: 'boq-1' } }) });
    tx.procurementBenchmarkItem.findMany.mockImplementation(({ where }: { where: { id?: { in: string[] } } }) => Promise.resolve((where.id ? where.id.in : ['b1', 'b2', 'b9']).map((id) => ({ id }))));
    const result = await saveProcurementBenchmarkBoqLinks('p1', [{ rowId: 'b2', boqItemId: 'boq-2' }, { rowId: 'b1', boqItemId: null }]);
    const saved = tx.auditLog.create.mock.calls[0][0].data;
    expect(saved.actionType).toBe('PROCUREMENT_BENCHMARK_BOQ_LINKS');
    expect(JSON.parse(saved.newValue)).toEqual({ links: { b9: 'boq-1', b2: 'boq-2' } });
    expect(result).toEqual({ saved: 2, linked: 2, materialsUpdated: 0 });
  });

  it('keeps generated master materials in step: saved links update their mappings', async () => {
    const tx = harness({ mapped: true });
    Object.assign(tx, { awardedBOQItem: { findMany: jest.fn().mockResolvedValue([{ id: 'boq-1' }]) } });
    tx.procurementBenchmarkItem.findMany.mockImplementation(({ where }: { where: { id?: { in: string[] } } }) => Promise.resolve((where.id ? where.id.in : ['b1', 'b2']).map((id) => ({ id }))));
    const result = await saveProcurementBenchmarkBoqLinks('p1', [{ rowId: 'b1', boqItemId: 'boq-1' }, { rowId: 'b2', boqItemId: null }]);
    expect(tx.bOQMapping.updateMany).toHaveBeenCalledWith({ where: { procurementBenchmarkItemId: 'b1', mappingType: { not: 'BENCHMARK_REVIEW' }, consolidatedBoqItem: { projectId: 'p1' } }, data: { awardedBoqItemId: 'boq-1' } });
    expect(tx.bOQMapping.updateMany).toHaveBeenCalledWith({ where: { procurementBenchmarkItemId: 'b2', mappingType: { not: 'BENCHMARK_REVIEW' }, consolidatedBoqItem: { projectId: 'p1' } }, data: { awardedBoqItemId: null } });
    expect(result).toEqual({ saved: 2, linked: 1, materialsUpdated: 2 });
  });

  it('refuses a BOQ link to another project\'s BOQ item', async () => {
    const tx = harness();
    Object.assign(tx, { awardedBOQItem: { findMany: jest.fn().mockResolvedValue([]) } });
    await expect(saveProcurementBenchmarkBoqLinks('p1', [{ rowId: 'b1', boqItemId: 'other-project-item' }])).rejects.toThrow(/does not belong/);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('changes nothing when the benchmark is locked, a value is invalid, or a line is gone', async () => {
    let tx = harness({ locked: true });
    await expect(applyProcurementBenchmarkSuggestions('p1', [{ rowId: 'b1', field: 'unit', value: 'm' }])).rejects.toThrow(/locked/);
    expect(tx.procurementBenchmarkItem.update).not.toHaveBeenCalled();

    tx = harness();
    await expect(applyProcurementBenchmarkSuggestions('p1', [{ rowId: 'b1', field: 'unitCost', value: '-5' }])).rejects.toThrow(/valid unit cost/);
    await expect(applyProcurementBenchmarkSuggestions('p1', [{ rowId: 'b1', field: 'quantity', value: '9' }])).rejects.toThrow(/not supported/);
    await expect(applyProcurementBenchmarkSuggestions('p1', [{ rowId: 'missing', field: 'unit', value: 'm' }])).rejects.toThrow(/no longer exist/);
    expect(tx.procurementBenchmarkItem.update).not.toHaveBeenCalled();
    expect(tx.procurementBenchmarkItem.deleteMany).not.toHaveBeenCalled();
  });
});
