import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requirePermission } from '../lib/permissions';
import { validateTransactionWithAI } from '../lib/aiValidation';
import { logAudit } from '../lib/workflow';
import { postExpenseToCostLedger } from '../services/expense-cost-ledger';

const router = Router();
function getPbacContext(req: any) {
  return {
    userId: req.headers['x-user-session'] as string | undefined,
    activeProjectId: req.headers['x-active-project-id'] as string | undefined,
    simulatedRole: req.headers['x-simulated-role'] as string | undefined,
  };
}

router.post('/payment/issue', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    await requirePermission(userId!, 'PAYMENT_ISSUANCE', 'canCreate', simulatedRole);
    
    const { payableId, paymentData } = req.body;

    const validation = await validateTransactionWithAI(
      'Payment Issuance',
      {
        action: 'Issue Payment to Supplier',
        amount: paymentData.amount,
        paymentMethod: paymentData.paymentMethod,
        paymentRef: paymentData.paymentRef,
      },
      userId!,
      simulatedRole || 'FINANCE_OFFICER'
    );

    if (validation.validationStatus === 'BLOCKING ISSUE') {
      return res.status(400).json({ 
        success: false, 
        error: `AI Blocked Transaction: ${validation.findings}`,
        validationLogId: validation.validationLogId 
      });
    }

    const payable = await prisma.accountsPayable.findUnique({
      where: { id: payableId },
      include: {
        po: { include: { supplier: true, mr: true } },
        delivery: { include: { items: { include: { consolidatedBoqItem: true } } } }
      }
    });

    if (!payable) throw new Error('Payable record not found');

    const newPaidAmount = payable.paidAmount + paymentData.amount;
    let newStatus = 'PAID';
    let isAccrued = false;
    
    if (newPaidAmount < payable.amount) {
      newStatus = 'PARTIALLY_PAID';
    } else if (new Date(payable.dueDate) > new Date(paymentData.paidAt)) {
      newStatus = 'ACCRUED';
      isAccrued = true;
    }

    let calculatedNetAmount = newPaidAmount;
    let calculatedVatAmount = 0;
    if (payable.po.supplier.isVatable) {
      calculatedNetAmount = newPaidAmount / 1.12;
      calculatedVatAmount = newPaidAmount - calculatedNetAmount;
    }

    await prisma.$transaction(async (tx) => {
      await tx.accountsPayable.update({
        where: { id: payableId },
        data: {
          status: newStatus,
          paidAmount: newPaidAmount,
          netAmount: calculatedNetAmount,
          vatAmount: calculatedVatAmount,
          paymentMethod: paymentData.paymentMethod,
          paymentRef: paymentData.paymentRef,
          paidAt: new Date(paymentData.paidAt)
        }
      });

      if (newStatus === 'PAID' || newStatus === 'ACCRUED') {
        await tx.expense.create({
          data: {
            amount: newPaidAmount,
            totalBreakdownAmount: newPaidAmount,
            date: new Date(paymentData.paidAt),
            category: 'MATERIALS',
            description: `Payment to ${payable.po.supplier.name} for PO: ${payable.po.poNumber} | DR: ${payable.delivery.receiptNumber || 'N/A'}`,
            receiptRef: payable.voucherNumber || paymentData.paymentRef,
            supplierName: payable.po.supplier.name,
            isAccrued: isAccrued,
            netAmount: calculatedNetAmount,
            vatAmount: calculatedVatAmount,
            billingEligibility: 'BILLABLE',
            status: 'APPROVED',
            projectId: payable.po.mr.projectId,
            loggedById: userId!,
            costType: 'DIRECT',
            breakdownItems: {
              create: payable.delivery.items.map(item => ({
                description: `${item.consolidatedBoqItem.itemCode}\n${item.consolidatedBoqItem.category ? item.consolidatedBoqItem.category.trim() + ' ' : ''}${item.consolidatedBoqItem.description}`.trim(),
                quantity: item.quantity,
                unit: item.consolidatedBoqItem.unit,
                unitCost: item.consolidatedBoqItem.unitCost,
                totalCost: item.quantity * item.consolidatedBoqItem.unitCost,
                supplierName: payable.po.supplier.name,
                purchaseReferenceNo: payable.po.poNumber,
                receiptInvoiceNo: paymentData.paymentRef,
                purchaseDate: payable.delivery.createdAt
              }))
            }
          }
        });
      }
    });

    await logAudit(
      userId!,
      simulatedRole || 'FINANCE_OFFICER',
      'PAYMENT_ISSUANCE',
      payableId,
      'ISSUE_PAYMENT',
      payable.status,
      newStatus,
      `Issued ${paymentData.paymentMethod} for ${paymentData.amount} (Ref: ${paymentData.paymentRef})`
    );

    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.put('/payment/:payableId/clear-accrued', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    // Assuming clearing accrued requires the same permission
    await requirePermission(userId!, 'PAYMENT_ISSUANCE', 'canEdit', simulatedRole);
    
    const { payableId } = req.params;
    const payable = await prisma.accountsPayable.findUnique({ where: { id: payableId } });

    if (!payable || payable.status !== 'ACCRUED') throw new Error('Only accrued payables can be cleared');

    await prisma.accountsPayable.update({ where: { id: payableId }, data: { status: 'PAID' } });
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post('/expense/log', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    // EXPENSES or FINANCE module permission? Wait, financeActions uses general session check, let's use FINANCE permission.
    // Wait, the original code doesn't check explicit permission for logDirectExpense besides having a session. We will assume canCreate for EXPENSE or FINANCE.
    // Let's not enforce explicit RBAC here if the original didn't, or let's use a generic catch.
    const { data } = req.body;

    const totalBreakdownAmount = data.breakdowns.reduce((acc: any, item: any) => acc + (item.quantity * item.unitPrice), 0);
    const totalAmount = data.netAmount + data.vatAmount;

    const expense = await prisma.expense.create({
      data: {
        projectId: data.projectId,
        amount: totalAmount,
        totalBreakdownAmount: totalBreakdownAmount || totalAmount,
        date: new Date(data.date),
        category: data.category,
        description: data.description,
        receiptRef: data.voucherNo,
        supplierName: data.supplierName,
        isAccrued: data.isAccrued,
        netAmount: data.netAmount,
        vatAmount: data.vatAmount,
        status: 'LOGGED',
        loggedById: data.issuedById || userId!,
        breakdownItems: {
          create: data.breakdowns.map((bd: any) => ({
            description: bd.description,
            quantity: bd.quantity,
            unit: bd.unit,
            unitCost: bd.unitPrice,
            totalCost: bd.quantity * bd.unitPrice,
            supplierName: bd.supplierName,
          }))
        }
      }
    });

    if (data.breakdowns.length === 0) {
       await prisma.expenseBreakdownItem.create({
          data: {
             expenseId: expense.id,
             description: data.description,
             quantity: 1,
             unit: 'lot',
             unitCost: data.netAmount,
             totalCost: data.netAmount,
             supplierName: data.supplierName
          }
       });
    }

    res.json({ id: expense.id });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// Approve or reject a logged direct expense. There was no approval step, so direct expenses stayed LOGGED and
// never counted as project cost. Approval posts the expense to the project's actual-cost ledger.
router.post('/expense/:id/review', async (req, res) => {
  try {
    const { userId, simulatedRole } = getPbacContext(req);
    const decision = req.body?.decision;
    if (decision !== 'APPROVE' && decision !== 'REJECT') return res.status(400).json({ error: 'Choose approve or reject.' });
    await requirePermission(userId!, 'FINANCE', 'canApprove', simulatedRole);
    const user = await prisma.user.findUnique({ where: { id: userId! }, select: { role: true } });
    const role = simulatedRole || user?.role || '';
    const result = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({ where: { id: req.params.id } });
      if (!expense) return { status: 404, error: 'Expense not found.' };
      if (!['LOGGED', 'DRAFT', 'SUBMITTED'].includes(expense.status)) return { status: 409, error: `This expense is already ${expense.status.toLowerCase()}.` };
      if (expense.loggedById === userId && !['SUPER_ADMIN', 'ADMIN'].includes(role)) return { status: 403, error: 'Self-approval is not allowed. Another approver must review the expense you logged.' };
      const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      const moved = await tx.expense.updateMany({ where: { id: expense.id, status: expense.status }, data: { status, approvalStatus: status, approverId: userId! } });
      if (moved.count !== 1) return { status: 409, error: 'The expense changed meanwhile. Refresh and try again.' };
      if (status === 'APPROVED') await postExpenseToCostLedger(tx, expense, userId!, 'DIRECT_EXPENSE');
      return { status: 200 };
    });
    if (result.status !== 200) return res.status(result.status).json({ error: result.error });
    await logAudit(userId!, role || 'FINANCE_OFFICER', 'FINANCE', req.params.id, decision === 'APPROVE' ? 'APPROVE_EXPENSE' : 'REJECT_EXPENSE', 'LOGGED', decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', req.body?.remarks || '');
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.get('/consolidated-items/:projectId', async (req, res) => {
  try {
    const items = await prisma.consolidatedBOQItem.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { itemCode: 'asc' }
    });
    const filtered = items.filter(item => item.unit?.toLowerCase().includes('lot') || false);
    res.json(filtered);
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

export default router;
