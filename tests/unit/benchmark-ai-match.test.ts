const mockCreate = jest.fn();
jest.mock('openai', () => ({ __esModule: true, default: jest.fn().mockImplementation(() => ({ responses: { create: mockCreate } })) }));
jest.mock('openai/helpers/zod', () => ({ zodTextFormat: jest.fn(() => ({ type: 'json_schema' })) }));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/boq/workspace-service', () => ({ actorCanAccessProject: jest.fn(), storeWorkspaceOriginal: jest.fn(), removeWorkspaceOriginal: jest.fn() }));
jest.mock('@/lib/boq/workspace-parser', () => ({ parseWorkspaceWorkbook: jest.fn() }));
jest.mock('@/lib/scheduling/work-package-material-planning', () => ({ WPS_REQUIREMENT: 'WPS_MATERIAL_REQUIREMENT_SET' }));

import { suggestBenchmarkMatches, changeBenchmark, type BenchmarkLine, type BenchmarkReview } from '@/lib/boq/benchmark-review';
import { prisma } from '@/lib/prisma';
import { actorCanAccessProject } from '@/lib/boq/workspace-service';

const projectId = 'project-1';
const actor = { id: 'editor-1', name: 'Editor', role: 'PROJECT_ENGINEER' };
const line = (overrides: Partial<BenchmarkLine>): BenchmarkLine => ({
  id: 'line-1', sourceRowNumber: 5, section: 'Materials', itemCode: 'M-1', description: 'Portland cement', unit: 'bag', quantity: '10', unitCost: '2.00', amount: '20.00',
  resourceKind: 'UNCLASSIFIED', boqItemId: null, activityId: null, additionalReason: '',
  original: { description: 'Portland cement', unit: 'bag', quantity: '10', unitCost: '2.00', amount: '20.00' }, ...overrides,
});

function harness(lines: BenchmarkLine[]) {
  const document: BenchmarkReview = { id: 'review-1', projectId, status: 'DRAFT', source: { fileName: 'b.xlsx', fileHash: 'a'.repeat(64), storagePath: 'p', downloadUrl: '/s' }, lines, approvedBy: null, approvedAt: null, generatedAt: null, history: [] };
  const audits: Array<Record<string, unknown>> = [{ id: 'rev-1', createdAt: new Date('2026-01-01'), moduleName: 'PROJECT_MANAGEMENT', transactionId: projectId, actionType: 'PROCUREMENT_BENCHMARK_REVIEW_STATE', newValue: JSON.stringify(document) }];
  const tx = {
    auditLog: { findFirst: async () => audits[audits.length - 1], create: async ({ data }: { data: Record<string, unknown> }) => { const row = { ...data, id: `rev-${audits.length + 1}`, createdAt: new Date() }; audits.push(row); return row; } },
    project: { findUnique: async () => ({ id: projectId, name: 'P', status: 'ACTIVE', contractAmount: 100, boqLocked: true, procurementBenchmarkLocked: false, consolidatedBOQLocked: false }) },
    awardedBOQItem: { findMany: async () => [{ id: 'boq-1', itemCode: 'B-1', description: 'Cement, Portland', category: 'Concrete', unit: 'bag', quantity: 50, totalCost: 100 }] },
    projectSchedule: { findFirst: async () => ({ id: 'schedule-1', description: '', lockedBOQVersionId: 'v', lockedBOQChecksum: 'c', activities: [{ id: 'package-1', name: 'Foundations' }, { id: 'package-2', name: 'Frame' }] }) },
    scheduleBOQAllocation: { findMany: async () => [] },
    scheduleActivity: { findMany: async () => [{ id: 'package-1', description: 'Foundations' }, { id: 'package-2', description: 'Frame' }] },
    procurementBenchmarkItem: { count: async () => 0 },
    consolidatedBOQItem: { count: async () => 0 },
  };
  Object.assign(prisma, tx, { $transaction: jest.fn(async <T>(work: (client: typeof tx) => Promise<T>) => work(tx)) });
  (actorCanAccessProject as jest.Mock).mockResolvedValue(true);
  const saved = () => (JSON.parse(String(audits[audits.length - 1].newValue)) as BenchmarkReview).lines;
  return { saved, audits };
}

describe('benchmark AI matching', () => {
  beforeEach(() => { jest.clearAllMocks(); process.env.OPENAI_API_KEY = 'test-key'; });

  it('tags only the fields the AI filled, with its confidence and reason, and never overwrites a reviewer choice', async () => {
    const { saved } = harness([
      line({ id: 'line-1' }),
      line({ id: 'line-2', sourceRowNumber: 6, boqItemId: 'boq-1', resourceKind: 'MATERIAL' }),
    ]);
    mockCreate.mockResolvedValue({ status: 'completed', output_text: JSON.stringify({ matches: [
      { row: 0, boq: 0, pkg: null, kind: 'MATERIAL', confidence: 'low', reason: 'Same cement, same unit (bag).' },
      { row: 1, boq: null, pkg: 1, kind: 'LABOR', confidence: 'high', reason: 'Frame package covers this section.' },
    ] }) });
    const result = await suggestBenchmarkMatches(actor, projectId, 'rev-1');
    const [first, second] = saved();
    expect(first).toMatchObject({ boqItemId: 'boq-1', resourceKind: 'MATERIAL', aiMatch: { confidence: 'low', reason: 'Same cement, same unit (bag).', fields: ['boq', 'kind'] } });
    // Reviewer's BOQ item and kind are kept; only the empty package was filled.
    expect(second).toMatchObject({ boqItemId: 'boq-1', resourceKind: 'MATERIAL', activityId: 'package-2', aiMatch: { confidence: 'high', fields: ['package'] } });
    expect(result.aiMatching).toMatchObject({ rowsUpdated: 2, confidence: { high: 1, medium: 0, low: 1 } });
    // The AI receives quantities and package sections for better matching.
    expect(mockCreate.mock.calls[0][0].input).toContain('"qty"');
    expect(mockCreate.mock.calls[0][0].input).toContain('"sections"');
  });

  it('keeps a reviewer clearing the AI tag when the lines are saved', async () => {
    const { saved } = harness([line({ id: 'line-1', boqItemId: 'boq-1', activityId: 'package-1', resourceKind: 'MATERIAL', aiMatch: { confidence: 'medium', reason: 'Likely', fields: ['boq'] } })]);
    expect(saved()[0].aiMatch?.confidence).toBe('medium');
    await changeBenchmark(actor, projectId, { action: 'update-lines', expectedRevision: 'rev-1', lines: [{ ...saved()[0], aiMatch: null }] });
    expect(saved()[0].aiMatch).toBeNull();
  });
});
