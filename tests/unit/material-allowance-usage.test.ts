import { materialAllowanceUsage } from '@/lib/boq/material-allowance-usage';
const request = (status: string, quantity = 300) => ({ id: 'mr', status, items: [{ consolidatedBoqItemId: 'blocks', quantity, approvedQuantity: null }], purchaseOrders: [{ status: 'APPROVED', items: [{ consolidatedBoqItemId: 'blocks', quantity: 100, unitCost: 20 }] }] });
it('tracks a consolidated 500-piece allowance without counting its PO quantity twice', () => {
  expect(materialAllowanceUsage([request('SUBMITTED')], 'blocks', '500', '10000')).toMatchObject({ reservedQuantity: '300', remainingQuantity: '200', committedCost: '2000.00', remainingBudget: '8000.00' });
});
it.each(['DRAFT', 'AI_CHECKING', 'REJECTED', 'CANCELLED'])('does not reserve an %s request', status => {
  expect(materialAllowanceUsage([{ ...request(status), purchaseOrders: [] }], 'blocks', '500', '10000').remainingQuantity).toBe('500');
});
it('exposes reached and exceeded limits without hiding the overrun', () => {
  expect(materialAllowanceUsage([{ ...request('APPROVED', 500), purchaseOrders: [{ status: 'APPROVED', items: [{ consolidatedBoqItemId: 'blocks', quantity: 500, unitCost: 21 }] }] }], 'blocks', '500', '10000')).toMatchObject({ quantityLimitReached: true, costLimitReached: true, overBudget: true, remainingBudget: '0.00', committedCost: '10500.00' });
});
