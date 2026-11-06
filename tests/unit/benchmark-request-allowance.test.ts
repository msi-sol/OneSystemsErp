import { assertMaterialRequestAllowance, assertMaterialRequestTransition, requestAllowanceQuantities } from '@/lib/boq/benchmark-request-allowance';

const review = { id: 'review', projectId: 'project', status: 'GENERATED', materialIds: ['cement'], benchmarkIds: { a: 'benchmark-a', b: 'benchmark-b' } };
const item = (quantity: number) => ({ consolidatedBoqItemId: 'cement', quantity, approvedQuantity: null });
const request = (id: string, status: string, quantity: number) => ({ id, status, items: [item(quantity)], purchaseOrders: [] as { status: string }[] });

function fixture() {
  const state = { review: review as typeof review | null, requests: [request('current', 'AI_CHECKING', 50), request('other', 'SUBMITTED', 50), request('draft', 'DRAFT', 999)], links: ['current', 'other'].map(recordId => ({ transactionId: recordId, newValue: JSON.stringify({ projectId: 'project', sourcePackageId: 'package-a', recordId, recordType: 'REQUEST' }) })) };
  const tx = {
    auditLog: { findFirst: jest.fn(async () => state.review ? { newValue: JSON.stringify(state.review) } : null), findMany: jest.fn(async () => state.links) },
    materialRequest: { findMany: jest.fn(async () => state.requests) },
    consolidatedBOQItem: { findMany: jest.fn(async () => [{ id: 'cement' }]) },
    bOQMapping: { findMany: jest.fn(async () => ['a', 'b'].map(letter => ({ consolidatedBoqItemId: 'cement', procurementBenchmarkItemId: `benchmark-${letter}`, allocationQuantity: 100,
      remarks: JSON.stringify({ benchmarkReviewId: 'review', sourceLineId: `line-${letter}`, sourcePackageId: `package-${letter}` }), procurementBenchmarkItem: { projectId: 'project' } }))) },
  };
  return { state, tx };
}

describe('benchmark-backed MR reservation on submission', () => {
  it('counts submitted requests and ignores unsubmitted drafts', async () => {
    const { tx } = fixture();
    await expect(assertMaterialRequestAllowance(tx as never, 'project', 'current', 'SUBMITTED')).resolves.toBeUndefined();
  });
  it('rejects repeat requests beyond the approved package cap', async () => {
    const { tx, state } = fixture(); state.requests[0].items = [item(51)];
    await expect(assertMaterialRequestAllowance(tx as never, 'project', 'current', 'SUBMITTED')).rejects.toThrow(/Available: 50; requested: 51/);
  });
  it('keeps fulfilled requests reserved and never counts the current request twice', async () => {
    const { tx, state } = fixture(); state.requests[0].status = 'SUBMITTED'; state.requests[1].status = 'FULLY_PROCURED';
    await expect(assertMaterialRequestAllowance(tx as never, 'project', 'current', 'FOR_REVIEW')).resolves.toBeUndefined();
    state.requests[0].items = [item(51)];
    await expect(assertMaterialRequestAllowance(tx as never, 'project', 'current', 'FOR_REVIEW')).rejects.toThrow(/approved package/);
  });
  it.each(['CANCELLED', 'REJECTED'])('releases an uncommitted %s request reservation', async status => {
    const { tx, state } = fixture(); state.requests[1].status = status; state.requests[0].items = [item(100)];
    await expect(assertMaterialRequestAllowance(tx as never, 'project', 'current', 'SUBMITTED')).resolves.toBeUndefined();
  });
  it('does not release an allowance while an approved purchase commitment exists', async () => {
    const { tx, state } = fixture(); state.requests[0].purchaseOrders.push({ status: 'APPROVED' });
    await expect(assertMaterialRequestAllowance(tx as never, 'project', 'current', 'CANCELLED')).rejects.toThrow(/approved purchase commitment/);
  });
  it('requires an explicit package association before submission', async () => {
    const { tx, state } = fixture(); state.links = [];
    await expect(assertMaterialRequestAllowance(tx as never, 'project', 'current', 'SUBMITTED')).rejects.toThrow(/Link draft\/request/);
  });
  it('rejects materials outside the approved benchmark and foreign project associations', async () => {
    const { tx, state } = fixture(); state.requests[0].items[0].consolidatedBoqItemId = 'extra';
    await expect(assertMaterialRequestAllowance(tx as never, 'project', 'current', 'SUBMITTED')).rejects.toThrow(/outside the approved benchmark/);
    state.requests[0].items[0].consolidatedBoqItemId = 'cement'; tx.consolidatedBOQItem.findMany.mockResolvedValue([]);
    await expect(assertMaterialRequestAllowance(tx as never, 'project', 'current', 'SUBMITTED')).rejects.toThrow(/intended project/);
  });
  it('leaves pre-existing projects without a generated benchmark unchanged', async () => {
    const { tx, state } = fixture(); state.review = null;
    await expect(assertMaterialRequestAllowance(tx as never, 'project', 'current', 'SUBMITTED')).resolves.toBeUndefined();
    expect(tx.materialRequest.findMany).not.toHaveBeenCalled();
  });
  it('sums duplicate material rows and rejects invalid quantities', () => {
    expect(requestAllowanceQuantities([item(20), item(30)]).get('cement')?.toString()).toBe('50');
    expect(() => requestAllowanceQuantities([item(NaN)])).toThrow(/positive finite/);
  });
  it('prevents approval regression and resetting submitted requests to an unreserved draft', () => {
    expect(() => assertMaterialRequestTransition('SUBMITTED', 'AI_CHECKING')).toThrow(/not supported/);
    expect(() => assertMaterialRequestTransition('APPROVED', 'SUBMITTED')).toThrow(/not supported/);
    expect(() => assertMaterialRequestTransition('FOR_REVIEW', 'APPROVED')).not.toThrow();
  });
});
