jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/boq/workspace-service', () => ({ actorCanAccessProject: jest.fn(), storeWorkspaceOriginal: jest.fn(), removeWorkspaceOriginal: jest.fn() }));
jest.mock('@/lib/scheduling/work-package-material-planning', () => ({ WPS_REQUIREMENT: 'WPS_MATERIAL_REQUIREMENT_SET' }));
jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn() }));

import { benchmarkLineProblems, groupBenchmarkMaterials, reconcileDisplayedRate, type BenchmarkLine } from '@/lib/boq/benchmark-review';
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
  it('names size-only rows with their section so different materials of one size stay separate', () => {
    const pipe = row({ section: 'Copper Pipes - Type L', description: '1/4"', unit: 'length/s' });
    const groups = groupBenchmarkMaterials([pipe, row({ id: 'line-b', section: 'Copper Pipes Insulation', description: '1/4"', unit: 'length/s' }), row({ id: 'line-c', section: 'Copper Pipes - Type L', description: '1/4"', unit: 'length/s', activityId: 'package-b' })]);
    expect(groups.map(group => [group.description, group.lines.length])).toEqual([['Copper Pipes - Type L 1/4"', 2], ['Copper Pipes Insulation 1/4"', 1]]);
    // Named materials still combine across sections (e.g. the same consumable under each system).
    expect(groupBenchmarkMaterials([row({ section: 'I-B. Consumables', description: 'Freon' }), row({ id: 'line-d', section: 'Consumables', description: 'Freon' })])).toHaveLength(1);
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
  it('accepts a precise workbook rate that reproduces the stated amount exactly', () => {
    // Sheet: 3 × 466,699.99774… = 1,400,099.99 (shown as 466,700.00 and 1,400,099.99).
    expect(benchmarkLineProblems(row({ quantity: '3', unitCost: '466699.996667', amount: '1400099.99' }))).toEqual([]);
    expect(benchmarkLineProblems(row({ quantity: '3', unitCost: '466700', amount: '1400099.99' })).join(' ')).toMatch(/differs/);
    expect(benchmarkLineProblems(row({ unitCost: '2.0000001' })).join(' ')).toMatch(/six decimal places/);
  });
  it('replaces a displayed rate only when its rounding alone explains the amount', () => {
    expect(reconcileDisplayedRate('3', '466700', '1400099.99')).toBe('466699.996667');
    expect(reconcileDisplayedRate('6', '34692.66', '208155.95')).toBe('34692.658333');
    expect(reconcileDisplayedRate('3', '466700', '1400000.00')).toBeNull();
    expect(reconcileDisplayedRate('0', '10', '0.00')).toBeNull();
    expect(reconcileDisplayedRate('3', 'Not stated', '30.00')).toBeNull();
  });
  it('requires a package and either mapped scope or an explicit additional-item reason', () => {
    expect(benchmarkLineProblems(row({ boqItemId: null, activityId: null }))).toHaveLength(2);
    expect(benchmarkLineProblems(row({ boqItemId: null, additionalReason: 'Additional item for approver review' }))).toEqual([]);
  });
});
