const mockCreate = jest.fn();
jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('openai', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => ({ responses: { create: mockCreate } })) }));
jest.mock('openai/helpers/zod', () => ({ zodTextFormat: jest.fn(() => ({ type: 'json_schema' })) }));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/scheduling/work-package-planning', () => ({ boqSections: jest.fn(), draftPackagesClearBlocker: jest.fn() }));

import { prisma } from '@/lib/prisma';
import { runBenchmarkAiCheck } from '@/lib/ai/planning-ai-check';

const actor = { id: 'user-1', role: 'PROJECT_ENGINEER' };
const auditCreate = jest.fn().mockResolvedValue({});

function setup(rows: Array<{ id: string; itemCode: string; description: string; unit: string; quantity: number; unitCost: number; totalCost: number }>) {
  Object.assign(prisma, {
    project: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', name: 'PGH VRF', contractAmount: 1000 }) },
    procurementBenchmarkItem: { findMany: jest.fn().mockResolvedValue(rows.map((row) => ({ category: 'Materials', ...row }))) },
    awardedBOQItem: { findMany: jest.fn().mockResolvedValue([{ id: 'boq-1', itemCode: '1.1', category: 'VRF A', description: 'Copper pipe 3/8 in', unit: 'm', quantity: 100 }]) },
    auditLog: { create: auditCreate, findFirst: jest.fn().mockResolvedValue({ newValue: JSON.stringify({ links: { b1: 'boq-1' } }) }) },
  });
}

describe('procurement benchmark AI check', () => {
  beforeEach(() => { jest.clearAllMocks(); process.env.OPENAI_API_KEY = 'test-key'; });

  it('flags amount differences (rounding separately), repeated lines and AI-unmatched lines', async () => {
    setup([
      { id: 'b1', itemCode: 'M-1', description: 'Copper pipe 3/8 in', unit: 'm', quantity: 3, unitCost: 466_699.9977, totalCost: 1_400_099.99 },
      { id: 'b2', itemCode: 'M-2', description: 'Pipe insulation', unit: 'm', quantity: 10, unitCost: 5, totalCost: 60 },
      { id: 'b3', itemCode: 'M-3', description: 'Copper pipe 3/8 in', unit: 'M', quantity: 2, unitCost: 1, totalCost: 2 },
      { id: 'b4', itemCode: 'P-1', description: 'Barangay permit', unit: 'lot', quantity: 1, unitCost: 500, totalCost: 500 },
    ]);
    mockCreate.mockResolvedValue({ status: 'completed', output_text: JSON.stringify({
      summary: 'Mostly matched.', insights: [{ severity: 'warning', title: 'Permit not in BOQ', detail: 'Budget only.', refs: [3, 3] }],
      links: [
        { row: 0, boq: 0, confidence: 'high', reason: '' }, { row: 1, boq: 0, confidence: 'low', reason: 'Insulation, not pipe.' },
        { row: 2, boq: 0, confidence: 'medium', reason: 'Duplicate line.' }, { row: 3, boq: null, confidence: 'high', reason: 'Permits are not a BOQ item.' },
        { row: 3, boq: 0, confidence: 'high', reason: 'repeat ignored' }, { row: 99, boq: 0, confidence: 'high', reason: 'bad ref' },
      ],
      suggestions: [
        { row: 2, field: 'unit', proposed: 'm', reason: 'Same item uses m elsewhere.' },
        { row: 0, field: 'unit', proposed: 'm', reason: 'Already m: no change.' },
        { row: 2, field: 'remove', proposed: '', reason: 'Accidental duplicate.' },
        { row: 1, field: 'description', proposed: '', reason: 'Empty proposal is ignored.' },
        { row: 42, field: 'unit', proposed: 'pcs', reason: 'Bad ref.' },
      ],
    }) });
    const result = await runBenchmarkAiCheck(actor, 'p1');

    // b1 differs only by display rounding of the rate; b2 is really off by ₱10.
    expect(result.checks.amountIssues.map((row) => [row.id, row.rounding])).toEqual([['b2', false]]);
    expect(result.checks.amountIssues[0].difference).toBe(10);
    expect(result.checks.duplicates).toEqual([expect.objectContaining({ count: 2, totalQuantity: 5 })]);
    expect(result.checks.benchmarkTotal).toBe(1_400_661.99);
    // One BOQ link per line (repeats and bad refs dropped). b1 is already linked as suggested; low-confidence and
    // "not in the BOQ" suggestions start unticked.
    expect(result.links.map((link) => [link.rowId, link.boqId, link.confidence, link.savedBoqId, link.selected])).toEqual([
      ['b1', 'boq-1', 'high', 'boq-1', false],
      ['b2', 'boq-1', 'low', null, false],
      ['b3', 'boq-1', 'medium', null, true],
      ['b4', null, 'high', null, false],
    ]);
    expect(result.unmatchedCount).toBe(2);
    expect(result.boqOptions).toEqual([{ id: 'boq-1', label: '1.1 · Copper pipe 3/8 in' }]);
    expect(result.insights[0].refs).toHaveLength(1);
    // Suggestions: the real ₱10 difference gets an unticked total fix; AI fixes skip no-ops, empties and bad refs.
    expect(result.suggestions.map((item) => [item.rowId, item.field, item.proposed, item.source, item.selected])).toEqual([
      ['b2', 'totalCost', '50.00', 'exact', false],
      ['b3', 'unit', 'm', 'ai', true],
      ['b3', 'remove', '', 'ai', true],
    ]);
    expect(auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actionType: 'AI_CHECK_RUN' }) }));
  });

  it('refuses before calling the AI when no benchmark is uploaded', async () => {
    setup([]);
    await expect(runBenchmarkAiCheck(actor, 'p1')).rejects.toMatchObject({ status: 409 });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
