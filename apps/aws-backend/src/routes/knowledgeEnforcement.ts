import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();

/**
 * Fetches the active, mandatory knowledge rules applicable to a specific ERP module.
 */
router.post('/getApplicableRulesForModule', async (req, res) => {
  try {
    const { moduleName } = req.body;
    if (!moduleName) {
      return res.status(400).json({ success: false, error: 'moduleName is required' });
    }
    const rules = await prisma.knowledgeRuleReference.findMany({
      where: {
        moduleName: moduleName,
        isMandatory: true
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ success: true, data: rules });
  } catch (error: any) {
    console.error(`Failed to fetch rules for module from backend:`, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Logs an audit event whenever the AI or the backend enforces a Knowledge Center rule.
 */
router.post('/logKnowledgeAudit', async (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.moduleName || !data.notebookName || !data.ruleApplied || !data.validationResult || !data.actionTaken) {
        return res.status(400).json({ success: false, error: 'Missing required audit log data fields' });
    }
    const audit = await prisma.knowledgeRuleAuditLog.create({
      data: {
        transactionId: data.transactionId,
        moduleName: data.moduleName,
        notebookName: data.notebookName,
        ruleApplied: data.ruleApplied,
        validationResult: data.validationResult,
        actionTaken: data.actionTaken,
        userAction: data.userAction,
        overrideRequested: data.overrideRequested || false,
        overrideApprovedBy: data.overrideApprovedBy,
        overrideReason: data.overrideReason
      }
    });
    return res.json({ success: true, data: audit });
  } catch (error: any) {
    console.error('Failed to log knowledge audit from backend:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Fetches recent audit logs for a specific module to display in the UI panel.
 */
router.post('/getRecentAuditLogsForModule', async (req, res) => {
  try {
    const { moduleName, limit = 5 } = req.body;
    if (!moduleName) {
        return res.status(400).json({ success: false, error: 'moduleName is required' });
    }
    const logs = await prisma.knowledgeRuleAuditLog.findMany({
      where: { moduleName },
      orderBy: { timestamp: 'desc' },
      take: limit
    });
    return res.json({ success: true, data: logs });
  } catch (error: any) {
    console.error('Failed to fetch module audit logs from backend:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Utility to pre-populate some baseline mandatory rules since this is a new feature.
 */
router.post('/seedBaselineRules', async (req, res) => {
  try {
    const count = await prisma.knowledgeRuleReference.count();
    if (count > 0) return res.json({ success: true, message: 'Already seeded' });

    await prisma.knowledgeRuleReference.createMany({
      data: [
        {
          notebookName: 'Progress Billing & Accomplishment Rules',
          moduleName: 'Progress Billing',
          ruleCategory: 'File Integrity',
          ruleTitle: 'Excel Layout Preservation',
          ruleDescription: 'The system must preserve the original Excel file structure, empty rows, and layout when parsing or exporting billing.',
          validationType: 'Structural Check',
          severity: 'BLOCK',
          isMandatory: true,
          sourceLink: '/knowledge/formulas_and_validation.md'
        },
        {
          notebookName: 'Payroll Engine Computation Rules',
          moduleName: 'Payroll',
          ruleCategory: 'AI Compliance',
          ruleTitle: 'Zero Net Pay Protection',
          ruleDescription: 'Payroll submission must be blocked if net pay is zero or negative.',
          validationType: 'Logic Pre-Check',
          severity: 'BLOCK',
          isMandatory: true,
          sourceLink: '/knowledge/payroll_formulas_and_validation.md'
        },
        {
          notebookName: 'Finance & Cash Management Rules',
          moduleName: 'Petty Cash',
          ruleCategory: 'Fund Disbursement',
          ruleTitle: 'Insufficient Balance Block',
          ruleDescription: 'The system must immediately block disbursement if the expense amount exceeds the current active balance.',
          validationType: 'Financial Lock',
          severity: 'BLOCK',
          isMandatory: true,
          sourceLink: '/knowledge/finance_formulas_and_validation.md'
        },
        {
          notebookName: 'Procurement & Inventory Rules',
          moduleName: 'Procurement',
          ruleCategory: 'Accounts Payable',
          ruleTitle: 'VAT Split Rules',
          ruleDescription: 'For Vatable suppliers, the exact Gross / 1.12 BIR formula must be used.',
          validationType: 'Accounting Logic',
          severity: 'BLOCK',
          isMandatory: true,
          sourceLink: '/knowledge/procurement_formulas_and_validation.md'
        }
      ]
    });

    return res.json({ success: true, message: 'Seeded baseline rules' });
  } catch (error: any) {
    console.error('Failed to seed baseline rules from backend:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
