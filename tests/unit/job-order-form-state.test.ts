import { allocateContractAmount, buildEditFormState, selectedItemsFromReferences } from '@/app/job-orders/create/jobOrderFormState';

const defaults = { projectId: '', subcontractorId: '', location: '', paymentBasis: 'MILESTONE', jobOrderType: 'LABOR_ONLY' };

describe('buildEditFormState', () => {
  test('copies form fields and leaves out relations and workflow fields', () => {
    const state = buildEditFormState({
      id: 'jo-1', status: 'APPROVED', createdAt: '2026-01-01', project: { id: 'p' }, subcontractBillings: [],
      projectId: 'p', subcontractorId: 's', location: 'Roof', paymentBasis: 'PROGRESS', jobOrderType: 'EQUIPMENT_RENTAL',
    }, defaults);
    expect(state).toEqual({ projectId: 'p', subcontractorId: 's', location: 'Roof', paymentBasis: 'PROGRESS', jobOrderType: 'EQUIPMENT_RENTAL' });
  });

  test('replaces null columns with the form default so inputs stay controlled', () => {
    expect(buildEditFormState({ projectId: 'p', subcontractorId: null, location: 'Roof' }, defaults).subcontractorId).toBe('');
  });
});

describe('selectedItemsFromReferences', () => {
  test('reloads saved BOQ items and leaves out the lump sum marker', () => {
    expect(selectedItemsFromReferences(['1_LOT', 'boq-1', 'ADDITIONAL_WORKS'])).toEqual([
      { id: 'boq-1', joCost: 0 }, { id: 'ADDITIONAL_WORKS', joCost: 0 },
    ]);
  });

  test.each([[null], [undefined], [[]]])('handles %j', (references) => {
    expect(selectedItemsFromReferences(references)).toEqual([]);
  });
});

describe('allocateContractAmount', () => {
  const total = (items: Array<{ joCost: number }>) => items.reduce((sum, item) => sum + Math.round(item.joCost * 100), 0) / 100;
  const boqItems = [
    { id: 'a', quantity: 1, combinedUnitCost: 300 },
    { id: 'b', quantity: 2, combinedUnitCost: 350 },
  ];

  test('weights each item by its master BOQ value', () => {
    expect(allocateContractAmount([{ id: 'a', joCost: 0 }, { id: 'b', joCost: 0 }], boqItems, 500)).toEqual([
      { id: 'a', joCost: 150 }, { id: 'b', joCost: 350 },
    ]);
  });

  test('the costs add back to the saved contract amount despite rounding', () => {
    const selected = ['a', 'b', 'c'].map((id) => ({ id, joCost: 0 }));
    const items = selected.map(({ id }) => ({ id, quantity: 1, combinedUnitCost: 1 }));
    expect(total(allocateContractAmount(selected, items, 100))).toBe(100);
  });

  test('splits evenly when the selected items have no master value', () => {
    expect(allocateContractAmount([{ id: 'x', joCost: 0 }, { id: 'y', joCost: 0 }], boqItems, 90)).toEqual([
      { id: 'x', joCost: 45 }, { id: 'y', joCost: 45 },
    ]);
  });

  test('gives a single item the whole amount', () => {
    expect(allocateContractAmount([{ id: 'a', joCost: 0 }], boqItems, 1234.56)).toEqual([{ id: 'a', joCost: 1234.56 }]);
  });
});
