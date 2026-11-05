import { prisma } from '@/lib/prisma';
import { buildDraftBOQChecksum } from '@/lib/boq/draft-workflow';
import { acceptCorrectedBOQCarryForward, adoptCorrectedBOQSource, correctedSourceCarryPlan } from '@/lib/boq/source-version-workflow';
import { createBOQReviewDocument, type BOQReviewDocument, type BOQSourceRow } from '@/lib/boq/review-state';

jest.mock('@/lib/prisma', () => ({ prisma: { $transaction: jest.fn() }, transactionContext: { run: (_context: unknown, callback: () => unknown) => callback() } }));
jest.mock('@/lib/scheduling/planning-capacity', () => ({ planningCapacity: jest.fn(async () => ({ canEdit: true })) }));
jest.mock('@/lib/boq/workspace-service', () => ({ removeWorkspaceOriginal: jest.fn(), storeWorkspaceOriginal: jest.fn() }));

const raw: BOQSourceRow = { sourceRowNumber: 2, itemId: 'item', section: 'Earthworks', sectionSourceKey: 'source:heading:1', sectionOrder: 1, itemCode: 'A', description: 'Excavation', unit: 'm3', quantity: '10', unitCost: '2', amount: '20', breakdown: {} };
function fixture(accepted: boolean) {
  const item = { id: 'item', projectId: 'p', itemCode: 'A', category: 'Earthworks', description: 'Excavation', unit: 'm3', quantity: 12, combinedUnitCost: 2, totalCost: 20, directCost: 20, indirectCost: 0 };
  const doc = createBOQReviewDocument({ projectId: 'p', versionId: 'v1', uploadId: 'original', fileName: 'original.xlsx', fileHash: 'old', selectedSheet: 'BOQ', mapping: {}, breakdownMapping: {}, rows: [{ ...raw }] });
  doc.revisions.push({ id: 'r1', itemId: 'item', actorId: 'engineer', reason: 'Verified quantity on signed bill', before: { ...raw }, after: { ...raw, quantity: '12' }, action: 'LINE_UPDATED', createdAt: '2026-11-05' });
  doc.findings.push({ id: 'open', code: 'CORRECTED_READING_CONFLICT', field: 'quantity', itemId: 'item', rowNumber: 2, message: 'Resolve this correction', severity: 'BLOCKING', status: 'OPEN', reason: null, evidence: {}, decidedBy: null, decidedAt: null });
  doc.contract = { verified: true, verifiedBy: 'pm', verifiedAt: 'before', verificationReason: 'Checked signed value' };
  doc.setAsideAcknowledgement = { actorId: 'pm', at: 'before', reason: 'Old rows excluded' };
  const source: BOQReviewDocument['correctedSources'][number] = { versionId: 'v2', uploadId: 'corrected', fileName: 'corrected.xlsx', fileHash: 'new', selectedSheet: 'BOQ', mapping: {}, breakdownMapping: {}, rows: [{ ...raw }], assessment: [{ oldItemId: 'item', oldRow: 1, newRow: 2, oldItemCode: 'A', newItemCode: 'A', kind: 'MATCHED' }], identityDecisions: { '1:2': { decision: 'SAME_ITEM', reason: 'Same stable item' } }, carryForward: { '2': 'CARRIED' }, status: 'READY_TO_ADOPT', createdAt: 'now', adoptedAt: null, basisChecksum: buildDraftBOQChecksum([item]), sourceFindings: [] };
  if (accepted) {
    source.carryPlans = { '1:2': correctedSourceCarryPlan(item, raw, doc) };
    source.carryAcceptance = { '1:2': { accepted: true, reason: 'Carry the verified correction', actorId: 'engineer', at: 'now' } };
  }
  doc.correctedSources.push(source);
  return { item, doc };
}

function database(input: ReturnType<typeof fixture>, archived = false) {
  let item = { ...input.item };
  const created: { dataJson?: string }[] = [];
  const tx = {
    project: { findUnique: jest.fn(async () => ({ id: 'p', status: archived ? 'ARCHIVED' : 'ACTIVE', boqLocked: false })) },
    projectBOQVersion: { findFirst: jest.fn(async () => ({ id: 'v1', versionNumber: 1, status: 'DRAFT', checksum: buildDraftBOQChecksum([item]) })), create: jest.fn(async () => ({ id: 'v2' })), update: jest.fn() },
    bOQReviewState: { findFirst: jest.fn(async () => ({ id: 'state', rowVersion: 4, dataJson: JSON.stringify(input.doc) })), updateMany: jest.fn(async () => ({ count: 1 })), create: jest.fn(async ({ data }: { data: { dataJson: string } }) => { created.push(data); return data; }) },
    awardedBOQItem: { findMany: jest.fn(async () => [item]), update: jest.fn(async ({ data }: { data: Partial<typeof item> }) => { item = { ...item, ...data }; return item; }), create: jest.fn(), deleteMany: jest.fn() },
    scheduleBOQAllocation: { count: jest.fn(async () => 0) }, uploadedWorkbookFile: { update: jest.fn() }, auditLog: { create: jest.fn() },
  };
  jest.mocked(prisma.$transaction).mockImplementation((async (callback: (client: unknown) => unknown) => callback(tx)) as typeof prisma.$transaction);
  return { tx, created, currentItem: () => item };
}
const input = { actor: { id: 'engineer', role: 'ENGINEER' }, projectId: 'p', versionId: 'v1', expectedRowVersion: 4, sourceVersionId: 'v2' };

describe('corrected-source adoption integrity', () => {
  beforeEach(() => jest.clearAllMocks());
  it('does not interpret identity or a legacy CARRIED flag as acceptance and retains open findings', async () => {
    const original = fixture(false), db = database(original);
    await adoptCorrectedBOQSource(input);
    expect(db.currentItem().quantity).toBe(10);
    const next = JSON.parse(db.created[0].dataJson!) as BOQReviewDocument;
    expect(next.findings).toEqual([expect.objectContaining({ code: 'CORRECTED_READING_CONFLICT', status: 'OPEN', itemId: 'item' })]);
    expect(next.contract.verified).toBe(false);
    expect(next.setAsideAcknowledgement).toBeNull();
    expect(original.doc.source.originalRows[0].quantity).toBe('10');
    expect(original.doc.revisions[0].after?.quantity).toBe('12');
  });
  it('applies only explicitly accepted safe corrections, preserving the raw corrected source and old evidence', async () => {
    const original = fixture(true), db = database(original);
    await adoptCorrectedBOQSource(input);
    expect(db.currentItem().quantity).toBe(12);
    const next = JSON.parse(db.created[0].dataJson!) as BOQReviewDocument;
    expect(next.source.originalRows[0].quantity).toBe('10');
    expect(next.revisions[0]).toEqual(expect.objectContaining({ reason: 'Carry the verified correction', after: expect.objectContaining({ quantity: '12' }) }));
    expect(next.findings[0].status).toBe('OPEN');
    expect(next.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'AMOUNT_ARITHMETIC', status: 'OPEN', itemId: 'item' })]));
    expect(original.doc.contract.verified).toBe(true);
  });
  it('rejects changed BOQ state rather than resolving by stale ordinal positions', async () => {
    const original = fixture(true); original.doc.correctedSources[0].basisChecksum = 'stale'; const db = database(original);
    await expect(adoptCorrectedBOQSource(input)).rejects.toThrow('current BOQ changed after assessment');
    expect(db.tx.awardedBOQItem.update).not.toHaveBeenCalled();
  });
  it('refuses archived baseline mutation before touching canonical items', async () => {
    const db = database(fixture(true), true);
    await expect(adoptCorrectedBOQSource(input)).rejects.toThrow('Approved or archived');
    expect(db.tx.awardedBOQItem.update).not.toHaveBeenCalled();
  });
  it('records carry acceptance separately from row identity without mutating canonical items', async () => {
    const db = database(fixture(false));
    await expect(acceptCorrectedBOQCarryForward({ ...input, identityKey: '1:2', reason: 'Carry the verified correction' })).resolves.toEqual({ success: true, rowVersion: 5 });
    expect(db.tx.awardedBOQItem.update).not.toHaveBeenCalled();
    const calls = db.tx.bOQReviewState.updateMany.mock.calls as unknown as Array<[{ data: { dataJson: string } }]>;
    const updated = JSON.parse(calls[0][0].data.dataJson) as BOQReviewDocument;
    expect(updated.correctedSources[0].carryAcceptance?.['1:2'].accepted).toBe(true);
    expect(updated.correctedSources[0].identityDecisions['1:2'].decision).toBe('SAME_ITEM');
  });
  it('cannot accept prior corrections for a different item', async () => {
    const original = fixture(false); original.doc.correctedSources[0].identityDecisions['1:2'].decision = 'NEW_ITEM'; const db = database(original);
    await expect(acceptCorrectedBOQCarryForward({ ...input, identityKey: '1:2', reason: 'Carry the verified correction' })).rejects.toThrow('same item first');
    expect(db.tx.bOQReviewState.updateMany).not.toHaveBeenCalled();
  });
  it('keeps set-aside source rows as explicit dispositions for approver acknowledgement', async () => {
    const original = fixture(false), source = original.doc.correctedSources[0];
    source.rows.push({ ...raw, sourceRowNumber: 3, itemId: null, itemCode: 'NOTE', description: 'Excluded alternate scope' });
    source.assessment.push({ oldRow: null, newRow: 3, oldItemCode: null, newItemCode: 'NOTE', kind: 'ADDED' });
    source.identityDecisions['new:3'] = { decision: 'SET_ASIDE', reason: 'Alternate scope outside this contract' };
    const db = database(original);
    await adoptCorrectedBOQSource(input);
    const next = JSON.parse(db.created[0].dataJson!) as BOQReviewDocument;
    expect(next.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SOURCE_ROW_SET_ASIDE', status: 'SET_ASIDE', rowNumber: 3, reason: 'Alternate scope outside this contract' })]));
    expect(next.source.originalRows).toHaveLength(2);
    expect(next.setAsideAcknowledgement).toBeNull();
  });
});
