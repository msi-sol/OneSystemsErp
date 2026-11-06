import { returnableMaterials } from '@/lib/procurement/material-returns';
import { validateMaterialReturnDraft } from '../../apps/aws-backend/src/services/material-returns';
const item = { id: 'line-a', consolidatedBoqItemId: 'cement', releasedQty: 10, consolidatedBoqItem: { category: 'Concrete', description: 'Cement', unit: 'bag' } };
describe('remaining quantities for material returns', () => {
  it('offers the balance after completed and pending partial returns', () => {
    const rows = returnableMaterials({ items: [item], returns: [
      { status: 'COMPLETED', items: [{ issuanceItemId: item.id, returnedQty: 3 }] },
      { status: 'PENDING', items: [{ issuanceItemId: item.id, returnedQty: 2 }] },
      { status: 'REJECTED', items: [{ issuanceItemId: item.id, returnedQty: 4 }] },
    ] });
    expect(rows[0].maxQty).toBe(5);
  });
  it('does not offer fully returned material again', () => {
    expect(returnableMaterials({ items: [item], returns: [{ status: 'COMPLETED', items: [{ issuanceItemId: item.id, returnedQty: 10 }] }] })).toEqual([]);
  });
  it('keeps fractional remaining quantities suitable for the form maximum', () => {
    const rows = returnableMaterials({ items: [{ ...item, releasedQty: 0.3 }], returns: [{ status: 'COMPLETED', items: [{ issuanceItemId: item.id, returnedQty: 0.1 }] }] });
    expect(rows[0].maxQty).toBe(0.2);
  });
  it('tracks separate issuance lines for the same material independently', () => {
    const rows = returnableMaterials({ items: [item, { ...item, id: 'line-b', releasedQty: 5 }], returns: [{ status: 'COMPLETED', items: [{ issuanceItemId: item.id, returnedQty: 4 }] }] });
    expect(rows.map(row => row.maxQty)).toEqual([6, 5]);
  });
});

describe('material return draft validation', () => {
  const input = { issuanceId: 'slip', projectId: 'project', foremanId: 'foreman', items: [{ issuanceItemId: item.id, consolidatedBoqItemId: item.consolidatedBoqItemId, returnedQty: 4, condition: 'GOOD' }] };
  function fixture() {
    const issuance = { status: 'RELEASED', projectId: 'project', foremanId: 'foreman', items: [item], returns: [{ status: 'COMPLETED', items: [{ issuanceItemId: item.id, returnedQty: 3 }] }, { status: 'PENDING', items: [{ issuanceItemId: item.id, returnedQty: 2 }] }] };
    const tx = { materialIssuance: { findUnique: jest.fn().mockResolvedValue(issuance) } };
    return { issuance, db: tx as never };
  }
  it('accepts a partial return within the remaining release', async () => {
    await expect(validateMaterialReturnDraft(fixture().db, input)).resolves.toBeUndefined();
  });
  it('counts pending drafts when rejecting a duplicate or excessive return', async () => {
    await expect(validateMaterialReturnDraft(fixture().db, { ...input, items: [{ ...input.items[0], returnedQty: 6 }] })).rejects.toThrow('prior and pending');
    await expect(validateMaterialReturnDraft(fixture().db, { ...input, items: [input.items[0], input.items[0]] })).rejects.toThrow('once');
  });
  it('rejects a return linked to the wrong project or original material', async () => {
    await expect(validateMaterialReturnDraft(fixture().db, { ...input, projectId: 'other-project' })).rejects.toThrow('match the original');
    await expect(validateMaterialReturnDraft(fixture().db, { ...input, items: [{ ...input.items[0], consolidatedBoqItemId: 'other-material' }] })).rejects.toThrow('matching material');
  });
});
