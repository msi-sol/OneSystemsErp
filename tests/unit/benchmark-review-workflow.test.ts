jest.mock('@/lib/prisma', () => ({ prisma: {} }));
jest.mock('@/lib/boq/workspace-service', () => ({
  actorCanAccessProject: jest.fn(), storeWorkspaceOriginal: jest.fn(), removeWorkspaceOriginal: jest.fn(),
}));
jest.mock('@/lib/boq/workspace-parser', () => ({ parseWorkspaceWorkbook: jest.fn() }));
jest.mock('@/lib/scheduling/work-package-material-planning', () => ({ WPS_REQUIREMENT: 'WPS_MATERIAL_REQUIREMENT_SET' }));
jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn() }));

import { changeBenchmark, saveBenchmarkSource, type BenchmarkLine, type BenchmarkReview } from '@/lib/boq/benchmark-review';
import { prisma } from '@/lib/prisma';
import { actorCanAccessProject, storeWorkspaceOriginal, removeWorkspaceOriginal } from '@/lib/boq/workspace-service';
import { parseWorkspaceWorkbook } from '@/lib/boq/workspace-parser';

const projectId = 'project-1';
const actor = { id: 'approver-1', name: 'Test Approver', role: 'DIRECTOR' };
const revision = 'review-revision-1';

function line(overrides: Partial<BenchmarkLine> = {}): BenchmarkLine {
  return {
    id: 'line-1', sourceRowNumber: 5, section: 'Materials', itemCode: 'MAT-1',
    description: 'Test cement', unit: 'bag', quantity: '10', unitCost: '2.00', amount: '20.00',
    resourceKind: 'MATERIAL', boqItemId: 'boq-1', activityId: 'package-1', additionalReason: '',
    original: { description: 'Test cement', unit: 'bag', quantity: '10', unitCost: '2.00', amount: '20.00' },
    ...overrides,
  };
}

function review(overrides: Partial<BenchmarkReview> = {}): BenchmarkReview {
  return {
    id: 'benchmark-review-1', projectId, status: 'DRAFT',
    source: { fileName: 'benchmark.xlsx', fileHash: 'a'.repeat(64), storagePath: 'private/path', downloadUrl: '/source' },
    lines: [line()], approvedBy: null, approvedAt: null, generatedAt: null, history: [],
    ...overrides,
  };
}

function makeHarness(options: {
  access?: { view?: boolean; edit?: boolean; approve?: boolean };
  document?: BenchmarkReview;
  expectedRevision?: string;
  boqLocked?: boolean;
  schedule?: { id: string; description: string; activities: Array<{ id: string; name: string }> } | null;
  boqItems?: Array<{ id: string; itemCode: string; description: string; category: string | null; unit: string; quantity: number; totalCost: number }>;
} = {}) {
  const state = {
    access: { view: true, edit: true, approve: true, ...options.access },
    project: { id: projectId, name: 'Test project', status: 'ACTIVE', contractAmount: 100, boqLocked: options.boqLocked ?? true,
      procurementBenchmarkLocked: false, consolidatedBOQLocked: false },
    boqItems: options.boqItems || [{ id: 'boq-1', itemCode: 'BOQ-1', description: 'Contract cement', category: 'Concrete', unit: 'bag', quantity: 50, totalCost: 100 }],
    schedule: options.schedule === undefined ? { id: 'schedule-1', description: '', activities: [{ id: 'package-1', name: 'Foundations' }, { id: 'package-2', name: 'Frame' }] } : options.schedule,
    legacyCount: 0,
    audits: [] as Array<{ id: string; createdAt: Date; moduleName: string; transactionId: string; actionType: string; newValue: string; [key: string]: unknown }>,
    benchmarkItems: [] as Array<Record<string, unknown>>,
    materials: [] as Array<Record<string, unknown>>,
    mappings: [] as Array<Record<string, unknown>>,
  };
  if (options.document) state.audits.push({ id: options.expectedRevision || revision, createdAt: new Date('2026-01-01T00:00:00Z'),
    moduleName: 'PROJECT_MANAGEMENT', transactionId: projectId, actionType: 'PROCUREMENT_BENCHMARK_REVIEW_STATE', newValue: JSON.stringify(options.document) });

  const findLatestReview = () => state.audits.filter(row => row.moduleName === 'PROJECT_MANAGEMENT' && row.transactionId === projectId
    && row.actionType === 'PROCUREMENT_BENCHMARK_REVIEW_STATE').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))[0] || null;
  const tx = {
    auditLog: {
      findFirst: async () => findLatestReview(),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { ...data, id: `audit-${state.audits.length + 1}`, createdAt: new Date() } as typeof state.audits[number];
        state.audits.push(created);
        return created;
      },
    },
    project: {
      findUnique: async () => ({ ...state.project }),
      update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(state.project, data),
    },
    awardedBOQItem: { findMany: async () => state.boqItems.map(item => ({ ...item })) },
    projectSchedule: { findFirst: async () => state.schedule ? { ...state.schedule, lockedBOQVersionId: 'boq-version-1', lockedBOQChecksum: 'checksum-1', activities: state.schedule.activities.map(item => ({ ...item })) } : null },
    projectBOQVersion: { findFirst: async () => ({ id: 'boq-version-1', status: 'APPROVED', checksum: 'checksum-1' }) },
    procurementBenchmarkItem: {
      count: async () => state.legacyCount,
      create: async ({ data }: { data: Record<string, unknown> }) => { const item = { id: `benchmark-item-${state.benchmarkItems.length + 1}`, ...data }; state.benchmarkItems.push(item); return item; },
    },
    consolidatedBOQItem: {
      count: async () => state.materials.length,
      create: async ({ data }: { data: Record<string, unknown> }) => { const material = { id: `material-${state.materials.length + 1}`, ...data }; state.materials.push(material); return material; },
    },
    bOQMapping: { create: async ({ data }: { data: Record<string, unknown> }) => { state.mappings.push(data); return data; } },
  };
  const transaction = jest.fn(async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx));
  Object.assign(prisma, tx, { $transaction: transaction });
  (actorCanAccessProject as jest.Mock).mockImplementation(async (_actor, _project, permissions: string[]) => {
    if (permissions.includes('canView')) return state.access.view;
    if (permissions.includes('canEdit') || permissions.includes('canEditDraft')) return state.access.edit;
    return state.access.approve;
  });
  return { state, transaction, tx };
}

describe('procurement benchmark review service gates', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  const sourceInput = { buffer: Buffer.from('test source'), fileName: 'benchmark.xlsx', fileHash: 'b'.repeat(64), selectedSheet: 'BOQ', mapping: { headerRow: 1, itemCode: 1, description: 2, unit: 3, quantity: 4, unitCost: 5, amount: 6 }, expectedRevision: revision };
  function parsedSource() {
    (parseWorkspaceWorkbook as jest.Mock).mockResolvedValue({ analysis: { fileHash: sourceInput.fileHash, errors: [] }, items: [{ sourceRowNumber: 2, section: 'Materials', itemCode: 'M-1', description: 'Test cement', unit: 'bag', quantity: 10, sourceUnitCost: 2, unitCost: 2, amount: 20 }] });
  }

  it('rejects another source before storage when a draft already exists', async () => {
    makeHarness({ document: review() }); parsedSource();
    await expect(saveBenchmarkSource(actor, projectId, sourceInput)).rejects.toThrow(/source is already preserved/);
    expect(storeWorkspaceOriginal).not.toHaveBeenCalled();
  });

  it('removes only the newly stored original when draft persistence fails', async () => {
    const harness = makeHarness(); parsedSource();
    (storeWorkspaceOriginal as jest.Mock).mockResolvedValue('new-private-source');
    harness.tx.auditLog.create = async () => { throw new Error('simulated persistence failure'); };
    await expect(saveBenchmarkSource(actor, projectId, { ...sourceInput, expectedRevision: null })).rejects.toThrow(/persistence failure/);
    expect(removeWorkspaceOriginal).toHaveBeenCalledWith('new-private-source');
    expect(harness.state.benchmarkItems).toHaveLength(0);
    expect(harness.state.materials).toHaveLength(0);
  });

  it('refuses mutations from an actor without project edit permission before opening a transaction', async () => {
    const harness = makeHarness({ access: { view: true, edit: false, approve: false }, document: review() });
    await expect(changeBenchmark(actor, projectId, { action: 'update-lines', expectedRevision: revision, lines: [line()] }))
      .rejects.toMatchObject({ status: 403 });
    expect(harness.transaction).not.toHaveBeenCalled();
    expect(harness.state.audits).toHaveLength(1);
  });

  it('refuses approval from an editor who lacks project approval permission', async () => {
    const harness = makeHarness({ access: { view: true, edit: true, approve: false }, document: review() });

    await expect(changeBenchmark(actor, projectId, { action: 'approve', expectedRevision: revision, acknowledgeAdditionalIds: [] }))
      .rejects.toMatchObject({ status: 403 });
    expect(harness.transaction).not.toHaveBeenCalled();
    expect(harness.state.benchmarkItems).toHaveLength(0);
  });

  it('rejects stale revisions without writing review or financial records', async () => {
    const harness = makeHarness({ document: review() });

    await expect(changeBenchmark(actor, projectId, { action: 'update-lines', expectedRevision: 'stale-revision', lines: [line()] }))
      .rejects.toMatchObject({ status: 409 });
    expect(harness.state.audits).toHaveLength(1);
    expect(harness.state.benchmarkItems).toHaveLength(0);
  });

  it.each([
    ['unlocked BOQ', { boqLocked: false }],
    ['missing active schedule', { boqLocked: true, schedule: null }],
  ])('does not approve a benchmark when the %s prerequisite is absent', async (_description, options) => {
    const harness = makeHarness({ ...options, document: review() });

    await expect(changeBenchmark(actor, projectId, { action: 'approve', expectedRevision: revision, acknowledgeAdditionalIds: [] }))
      .rejects.toThrow(/Approve the BOQ and Work Package Schedule/);
    expect(harness.state.benchmarkItems).toHaveLength(0);
    expect(harness.state.project.procurementBenchmarkLocked).toBe(false);
  });

  it.each([
    ['BOQ item', { boqItemId: 'boq-from-another-project' }],
    ['work package', { activityId: 'package-from-another-project' }],
  ])('rejects a %s association outside the project scope', async (_description, change) => {
    const harness = makeHarness({ document: review() });

    await expect(changeBenchmark(actor, projectId, { action: 'update-lines', expectedRevision: revision, lines: [line(change)] }))
      .rejects.toMatchObject({ status: 409 });
    expect(harness.state.audits).toHaveLength(1);
  });

  it('requires explicit approver acknowledgement for every additional budget row', async () => {
    const additional = line({ boqItemId: null, additionalReason: 'Required project allowance outside the awarded BOQ.' });
    const harness = makeHarness({ document: review({ lines: [additional] }) });

    await expect(changeBenchmark(actor, projectId, { action: 'approve', expectedRevision: revision, acknowledgeAdditionalIds: [] }))
      .rejects.toThrow(/Explicitly approve every additional budget row/);
    expect(harness.state.benchmarkItems).toHaveLength(0);
    expect(harness.state.project.procurementBenchmarkLocked).toBe(false);
  });

  it('records each additional-row approval with the saved reason and approver', async () => {
    const additional = line({ boqItemId: null, additionalReason: 'Explicit local test allowance.' });
    const harness = makeHarness({ document: review({ lines: [additional] }) });
    await changeBenchmark(actor, projectId, { action: 'approve', expectedRevision: revision, acknowledgeAdditionalIds: [additional.id] });
    const saved = JSON.parse(harness.state.audits.at(-1)!.newValue) as BenchmarkReview;
    expect(saved.status).toBe('APPROVED');
    expect(saved.additionalApprovals).toEqual([expect.objectContaining({ lineId: additional.id, reason: additional.additionalReason, approvedById: actor.id })]);
    expect(harness.state.benchmarkItems).toHaveLength(1);
  });

  it('refuses approval against a superseded BOQ without writing budget records', async () => {
    const harness = makeHarness({ document: review() });
    harness.tx.projectBOQVersion.findFirst = async () => ({ id: 'new-boq-version', status: 'APPROVED', checksum: 'new-checksum' });
    await expect(changeBenchmark(actor, projectId, { action: 'approve', expectedRevision: revision, acknowledgeAdditionalIds: [] }))
      .rejects.toThrow(/current approved BOQ/);
    expect(harness.state.benchmarkItems).toHaveLength(0);
    expect(harness.state.audits).toHaveLength(1);
  });

  it('generates aggregate material totals while retaining per-package mappings and WPS quantities, then refuses generation again', async () => {
    const first = line({ id: 'line-a', quantity: '3', amount: '6.00', activityId: 'package-1' });
    const second = line({ id: 'line-b', sourceRowNumber: 6, quantity: '7', amount: '14.00', activityId: 'package-2' });
    const approved = review({ status: 'APPROVED', lines: [first, second], approvedScheduleId: 'schedule-1',
      benchmarkIds: { 'line-a': 'benchmark-a', 'line-b': 'benchmark-b' } });
    const harness = makeHarness({ document: approved });
    harness.state.project.procurementBenchmarkLocked = true;
    harness.state.schedule = { id: 'schedule-1', description: JSON.stringify({ kind: 'BOQ_WPS_WORKSPACE_V1', locations: [], constraints: [], resources: [], allocationLocations: {}, packageIdentities: { 'package-1': 'package-source-a', 'package-2': 'package-source-b' } }), activities: [{ id: 'package-1', name: 'Foundations' }, { id: 'package-2', name: 'Frame' }] };

    await changeBenchmark(actor, projectId, { action: 'generate', expectedRevision: revision });

    expect(harness.state.materials).toHaveLength(1);
    expect(harness.state.materials[0]).toMatchObject({ quantity: 10, revisedQuantity: 10, remainingBenchmarkQuantity: 10, totalCost: 20, revisedTotalCost: 20 });
    expect(harness.state.mappings).toHaveLength(2);
    const mappingDetails = harness.state.mappings.map(mapping => JSON.parse(String(mapping.remarks)));
    expect(mappingDetails.map(details => details.sourcePackageId)).toEqual(['package-source-a', 'package-source-b']);
    expect(harness.state.audits.filter(row => row.actionType === 'WPS_MATERIAL_REQUIREMENT_SET').map(row => JSON.parse(row.newValue)))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ sourcePackageId: 'package-source-a', requiredQuantity: '3', materialId: 'material-1' }),
        expect.objectContaining({ sourcePackageId: 'package-source-b', requiredQuantity: '7', materialId: 'material-1' }),
      ]));

    const countBeforeRetry = harness.state.audits.length;
    const latestReviewRevision = [...harness.state.audits].reverse().find(row => row.actionType === 'PROCUREMENT_BENCHMARK_REVIEW_STATE')!.id;
    await expect(changeBenchmark(actor, projectId, { action: 'generate', expectedRevision: latestReviewRevision }))
      .rejects.toThrow(/already generated/);
    expect(harness.state.materials).toHaveLength(1);
    expect(harness.state.mappings).toHaveLength(2);
    expect(harness.state.audits).toHaveLength(countBeforeRetry);
  });

  it('completes an approved labor-only benchmark without inventing inventory rows', async () => {
    const harness = makeHarness({ document: review({ status: 'APPROVED', approvedScheduleId: 'schedule-1', lines: [line({ resourceKind: 'LABOR' })] }) });
    await changeBenchmark(actor, projectId, { action: 'generate', expectedRevision: revision });
    expect(harness.state.materials).toHaveLength(0);
    expect(harness.state.mappings).toHaveLength(0);
    expect(JSON.parse(harness.state.audits.at(-1)!.newValue)).toMatchObject({ status: 'GENERATED', materialIds: [] });
  });

  it('retains weighted-rate precision and the exact approved sum when material rates differ', async () => {
    const first = line({ id: 'line-a', quantity: '1', unitCost: '1.01', amount: '1.01' });
    const second = line({ id: 'line-b', quantity: '2', unitCost: '1.02', amount: '2.04' });
    const harness = makeHarness({ document: review({ status: 'APPROVED', approvedScheduleId: 'schedule-1', lines: [first, second], benchmarkIds: { 'line-a': 'benchmark-a', 'line-b': 'benchmark-b' } }) });
    await changeBenchmark(actor, projectId, { action: 'generate', expectedRevision: revision });
    expect(harness.state.materials[0].totalCost).toBe(3.05);
    expect(harness.state.materials[0].unitCost).toBeCloseTo(3.05 / 3, 12);
    expect(harness.state.materials[0].unitCost).not.toBe(1.02);
  });
});
