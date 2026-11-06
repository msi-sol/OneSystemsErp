import { prepareIssuance, validateIssuanceDraft } from '../../apps/aws-backend/src/services/material-issuance';

function fixture() {
  const material = { id: 'material-a', projectId: 'project-a', description: 'Cement', deliveredQty: 10, consumedQty: 2 };
  const slip = { id: 'slip-a', projectId: 'project-a', status: 'PENDING', items: [{ id: 'item-a', consolidatedBoqItemId: material.id, requestedQty: 6, consolidatedBoqItem: material }] };
  const tx = {
    consolidatedBOQItem: { findMany: jest.fn().mockResolvedValue([material]) },
    materialIssuance: { findUnique: jest.fn().mockResolvedValue(slip), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    issuanceItem: { update: jest.fn() },
  };
  return { material, slip, tx, db: tx as never };
}

describe('material issuance data consistency', () => {
  const draft = { projectId: 'project-a', foremanId: 'foreman', activity: 'Concrete works', items: [{ consolidatedBoqItemId: 'material-a', requestedQty: 6 }] };

  it('accepts available stock belonging to the selected project', async () => {
    const { db } = fixture();
    await expect(validateIssuanceDraft(db, draft)).resolves.toBeUndefined();
  });

  it('rejects a material from another project instead of saving an unlinked selection', async () => {
    const { tx, db } = fixture();
    tx.consolidatedBOQItem.findMany.mockResolvedValue([]);
    await expect(validateIssuanceDraft(db, draft)).rejects.toThrow('selected project');
  });

  it('rejects duplicate materials and insufficient available quantities', async () => {
    const { db } = fixture();
    await expect(validateIssuanceDraft(db, { ...draft, items: [draft.items[0], draft.items[0]] })).rejects.toThrow('only once');
    await expect(validateIssuanceDraft(db, { ...draft, items: [{ ...draft.items[0], requestedQty: 9 }] })).rejects.toThrow('Not enough');
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid requested quantity %s', async requestedQty => {
    const { db } = fixture();
    await expect(validateIssuanceDraft(db, { ...draft, items: [{ ...draft.items[0], requestedQty }] })).rejects.toThrow('positive finite');
  });

  it('does not update another slip through an unrelated item ID', async () => {
    const { tx, db } = fixture();
    await expect(prepareIssuance(db, 'slip-a', 'warehouseman', [{ id: 'other-slip-item', releasedQty: 3 }])).rejects.toThrow('does not belong');
    expect(tx.issuanceItem.update).not.toHaveBeenCalled();
    expect(tx.materialIssuance.updateMany).not.toHaveBeenCalled();
  });

  it('does not move already released materials back to processed', async () => {
    const { slip, tx, db } = fixture();
    slip.status = 'RELEASED';
    await expect(prepareIssuance(db, 'slip-a', 'warehouseman', [{ id: 'item-a', releasedQty: 3 }])).rejects.toThrow('pending issuance');
    expect(tx.issuanceItem.update).not.toHaveBeenCalled();
  });

  it('does not prepare more than requested or available', async () => {
    const { material, tx, db } = fixture();
    await expect(prepareIssuance(db, 'slip-a', 'warehouseman', [{ id: 'item-a', releasedQty: 7 }])).rejects.toThrow('requested quantity');
    material.consumedQty = 9;
    await expect(prepareIssuance(db, 'slip-a', 'warehouseman', [{ id: 'item-a', releasedQty: 2 }])).rejects.toThrow('Not enough');
    expect(tx.issuanceItem.update).not.toHaveBeenCalled();
  });

  it('saves a partial preparation and its status together', async () => {
    const { tx, db } = fixture();
    await prepareIssuance(db, 'slip-a', 'warehouseman', [{ id: 'item-a', releasedQty: 3 }]);
    expect(tx.issuanceItem.update).toHaveBeenCalledWith({ where: { id: 'item-a' }, data: { releasedQty: 3 } });
    expect(tx.materialIssuance.updateMany).toHaveBeenCalledWith({ where: { id: 'slip-a', status: 'PENDING' }, data: { status: 'PROCESSED', warehousemanId: 'warehouseman' } });
  });
});
