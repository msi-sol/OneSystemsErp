/**
 * Posts an approved direct / petty-cash expense to the project's actual-cost ledger, once. The project summary's
 * Actual Cost and its "Direct Expenses (Petty Cash/Misc)" line read this ledger; approved expenses used to stay
 * outside it, so they never showed as project cost.
 */
export const DIRECT_EXPENSE_REFERENCE_TYPES = ['DIRECT_EXPENSE', 'PETTY_CASH'] as const;

type ExpenseForLedger = {
  id: string; projectId: string; date: Date; category: string; receiptRef: string | null; supplierName: string | null;
  amount: number; netAmount: number; vatAmount: number; costType: string;
  consolidatedBoqItemId: string | null; awardedBoqItemId: string | null;
};

export async function postExpenseToCostLedger(tx: any, expense: ExpenseForLedger, approvedById: string, source: (typeof DIRECT_EXPENSE_REFERENCE_TYPES)[number]) {
  const referenceDocumentNo = `EXP-${expense.id}`;
  const existing = await tx.projectCostLedger.findFirst({ where: { projectId: expense.projectId, referenceDocumentType: source, referenceDocumentNo }, select: { id: true } });
  if (existing) return existing;
  const net = expense.netAmount > 0 ? expense.netAmount : expense.amount;
  return tx.projectCostLedger.create({ data: {
    projectId: expense.projectId, costDate: expense.date, costCategory: (expense.category || 'MISCELLANEOUS').toUpperCase().replace(/\s+/g, '_'),
    costType: expense.costType || 'DIRECT', directIndirect: expense.costType === 'INDIRECT' ? 'INDIRECT' : 'DIRECT',
    supplierName: expense.supplierName, referenceDocumentType: source, referenceDocumentNo,
    grossAmount: expense.amount, vatAmount: expense.vatAmount || 0, netAmount: net, paidAmount: expense.amount, unpaidBalance: 0,
    paymentStatus: 'PAID', approvalStatus: 'APPROVED', approvedById,
    consolidatedBoqItemId: expense.consolidatedBoqItemId, awardedBoqItemId: expense.awardedBoqItemId,
  } });
}
