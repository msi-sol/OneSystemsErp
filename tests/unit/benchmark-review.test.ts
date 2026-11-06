jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/boq/workspace-service', () => ({ actorCanAccessProject: jest.fn(), storeWorkspaceOriginal: jest.fn(), removeWorkspaceOriginal: jest.fn() }));
jest.mock('@/lib/scheduling/work-package-material-planning', () => ({ WPS_REQUIREMENT: 'WPS_MATERIAL_REQUIREMENT_SET' }));
jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn() }));

import { benchmarkLineProblems, groupBenchmarkMaterials, type BenchmarkLine } from '@/lib/boq/benchmark-review';
const row = (overrides: Partial<BenchmarkLine> = {}): BenchmarkLine => ({
  id: 'source-line', sourceRowNumber: 2, section: 'Materials', itemCode: 'TEST', description: 'Existing test material', unit: 'pcs',
  quantity: '100', unitCost: '2.00', amount: '200.00', resourceKind: 'MATERIAL', boqItemId: 'scope', activityId: 'package-a', additionalReason: '',
  original: { description: 'Existing test material', unit: 'pcs', quantity: '100', unitCost: '2.00', amount: '200.00' }, ...overrides,
});
describe('approved procurement benchmark rules', () => {
  it('combines equal materials across packages while retaining every source association', () => {
    const first = row(), second = row({ id: 'line-b', activityId: 'package-b', quantity: '200', amount: '400.00' });
    const groups = groupBenchmarkMaterials([first, second]);
    expect(groups).toHaveLength(1);
    expect(groups[0].quantity.toString()).toBe('300');
    expect(groups[0].amount.toString()).toBe('600');
    expect(groups[0].lines.map(line => line.activityId)).toEqual(['package-a', 'package-b']);
    expect(first.original.quantity).toBe('100');
  });
  it('keeps different units and similar but unequal descriptions separate', () => {
    const groups = groupBenchmarkMaterials([row(), row({ unit: 'box' }), row({ description: 'Existing test material large' })]);
    expect(groups).toHaveLength(3);
  });
  it('does not turn labor, equipment or other allowances into inventory materials', () => {
    expect(groupBenchmarkMaterials([row({ resourceKind: 'LABOR' }), row({ resourceKind: 'EQUIPMENT' }), row()])).toHaveLength(1);
    expect(benchmarkLineProblems(row({ resourceKind: 'UNCLASSIFIED' }))).toContain('Classify this budget row as material, labor, equipment or other.');
  });
  it('exposes even a cent difference instead of silently changing the approved budget', () => {
    const line = row({ amount: '200.01' });
    expect(benchmarkLineProblems(line).join(' ')).toMatch(/differs/);
    expect(line.amount).toBe('200.01');
  });
  it('requires a package and either mapped scope or an explicit additional-item reason', () => {
    expect(benchmarkLineProblems(row({ boqItemId: null, activityId: null }))).toHaveLength(2);
    expect(benchmarkLineProblems(row({ boqItemId: null, additionalReason: 'Additional item for approver review' }))).toEqual([]);
  });
});
