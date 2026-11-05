import { compareCorrectedSourceRows, correctedSourceCarryPlan, originalItemRows, preserveUnresolvedSourceFindings } from '@/lib/boq/source-version-workflow';
import { createBOQReviewDocument, type BOQSourceRow, type BOQFinding } from '@/lib/boq/review-state';

const item = { id: 'old-1', itemCode: 'A-1', description: 'Excavation', unit: 'm3', quantity: 10, combinedUnitCost: 2, totalCost: 20 };
function row(overrides: Partial<BOQSourceRow> = {}): BOQSourceRow {
  return { sourceRowNumber: 2, section: 'Earthworks', itemCode: 'A-1', description: 'Excavation', unit: 'm3', quantity: '10', unitCost: '2', amount: '20', breakdown: {}, ...overrides };
}
function document() {
  return createBOQReviewDocument({ projectId: 'p', versionId: 'v1', uploadId: 'u', fileName: 'original.xlsx', fileHash: 'hash', selectedSheet: 'BOQ', mapping: {}, breakdownMapping: {}, rows: [row()] });
}
function finding(overrides: Partial<BOQFinding> = {}): BOQFinding {
  return { id: 'f1', code: 'quantity-defaulted', field: 'quantity', itemId: item.id, rowNumber: 2, message: 'Check source quantity', severity: 'BLOCKING', status: 'OPEN', reason: null, evidence: {}, decidedBy: null, decidedAt: null, ...overrides };
}

describe('corrected BOQ source identity', () => {
  it('uses unique stable codes and checks descriptions before claiming identity', () => {
    const result = compareCorrectedSourceRows([item], [row({ description: 'Concrete foundation' })]);
    expect(result).toEqual([expect.objectContaining({ oldItemId: item.id, kind: 'POSSIBLE_MATCH' })]);
  });
  it('keeps same-item changed amounts distinct from identity uncertainty', () => {
    expect(compareCorrectedSourceRows([item], [row({ amount: '25' })])).toEqual([expect.objectContaining({ kind: 'CHANGED', oldItemId: item.id })]);
  });
  it('does not greedily match duplicate codes on either side', () => {
    const result = compareCorrectedSourceRows([item, { ...item, id: 'old-2' }], [row(), row({ sourceRowNumber: 3 })]);
    expect(result.filter(entry => ['MATCHED', 'CHANGED', 'POSSIBLE_MATCH'].includes(entry.kind))).toHaveLength(0);
    expect(result.filter(entry => entry.kind === 'ADDED')).toHaveLength(2);
    expect(result.filter(entry => entry.kind === 'REMOVED')).toHaveLength(2);
  });
  it('offers a possible match when a code changed but description and all values agree', () => {
    expect(compareCorrectedSourceRows([item], [row({ itemCode: 'A-NEW' })])).toEqual([expect.objectContaining({ kind: 'POSSIBLE_MATCH', oldItemId: item.id })]);
  });
  it('asks about unnumbered identities and does not treat generated ROW codes as stable', () => {
    expect(compareCorrectedSourceRows([{ ...item, itemCode: 'ROW-2', itemCodeSynthesized: true }], [row({ itemCode: '' })])).toEqual([expect.objectContaining({ kind: 'POSSIBLE_MATCH' })]);
  });
  it('does not silently equate different-case item codes', () => {
    expect(compareCorrectedSourceRows([item], [row({ itemCode: 'a-1' })])).toEqual([expect.objectContaining({ kind: 'POSSIBLE_MATCH' })]);
  });
  it('does not invent source identity for a manually added line without source evidence', () => {
    expect(compareCorrectedSourceRows([{ ...item, sourceAvailable: false }], [row()]).map(entry => entry.kind)).toEqual(['ADDED', 'REMOVED']);
  });
});

describe('explicit prior-review carry-forward', () => {
  it('compares immutable source values and offers safe human field corrections without mutating either version', () => {
    const doc = document();
    doc.revisions.push({ id: 'r1', itemId: item.id, actorId: 'engineer', reason: 'Verified quantity', before: { quantity: '10' }, after: { quantity: '12' }, action: 'LINE_UPDATED', createdAt: '2026-11-05' });
    const corrected = { ...item, quantity: 12 };
    expect(originalItemRows([corrected], doc)[0].quantity).toBe(10);
    const plan = correctedSourceCarryPlan(corrected, row(), doc);
    expect(plan.applyFields).toEqual({ quantity: '12' });
    expect(plan.conflicts).toEqual([]);
    expect(doc.source.originalRows[0].quantity).toBe('10');
    expect(corrected.quantity).toBe(12);
  });
  it('refuses to carry a correction over a changed source field', () => {
    const doc = document();
    doc.revisions.push({ id: 'r1', itemId: item.id, actorId: 'engineer', reason: 'Verified quantity', before: { quantity: '10' }, after: { quantity: '12' }, action: 'LINE_UPDATED', createdAt: '2026-11-05' });
    const plan = correctedSourceCarryPlan({ ...item, quantity: 12 }, row({ quantity: '15' }), doc);
    expect(plan.applyFields).toEqual({});
    expect(plan.conflicts).toEqual(['quantity']);
  });
  it('offers settled same-source decisions, never open findings or deferrals', () => {
    const doc = document();
    doc.findings = [finding(), finding({ id: 'confirmed', status: 'CONFIRMED' }), finding({ id: 'deferred', status: 'DEFERRED', reason: 'Check later' })];
    expect(correctedSourceCarryPlan(item, row(), doc).decisions.map(entry => entry.id)).toEqual(['confirmed']);
    expect(correctedSourceCarryPlan(item, row({ amount: '21' }), doc).decisions).toEqual([]);
  });
  it('retains unresolved same-item and version obligations with lineage even after identity confirmation', () => {
    const source = [finding(), finding({ id: 'total', itemId: null, rowNumber: null, code: 'printed-total-differs' })];
    const result = preserveUnresolvedSourceFindings([], source, new Map([[item.id, 'new-item']]), 'v1');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(expect.objectContaining({ itemId: 'new-item', status: 'OPEN', evidence: { priorFindingId: 'f1', priorVersionId: 'v1' } }));
    expect(source[0].id).toBe('f1');
  });
  it('does not duplicate regenerated findings or carry a removed item obligation into a different item', () => {
    const regenerated = finding({ id: 'new-finding', itemId: 'new-item' });
    expect(preserveUnresolvedSourceFindings([regenerated], [finding()], new Map([[item.id, 'new-item']]), 'v1')).toEqual([regenerated]);
    expect(preserveUnresolvedSourceFindings([], [finding()], new Map(), 'v1')).toEqual([]);
  });
});
