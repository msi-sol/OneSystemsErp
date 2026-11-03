import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

const router = Router();

router.post('/askERPAssistant', async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ success: false, error: 'Question is required.' });
    }

    // 1. Fetch the Knowledge Center Context
    const activeRules = await prisma.knowledgeRecord.findMany({
      where: { status: 'Approved' },
      select: {
        title: true,
        description: true,
        relatedModule: true,
        documentType: true,
        notebookUrl: true,
      }
    });

    // 2. Build the context prompt
    const knowledgeContext = activeRules.map(rule => `
[${rule.documentType}] - ${rule.relatedModule}: ${rule.title}
Details: ${rule.description}
Reference: ${rule.notebookUrl || 'None'}
`).join('\n');

    const systemPrompt = `
You are the ONESYSTEMS AI ERP Assistant. You help construction and project management users navigate the ERP.

MANDATORY ERP KNOWLEDGE ENFORCEMENT:
The Knowledge Center notebooks are the absolute source-of-truth references for all ERP rules, formulas, and validations.
You MUST ALWAYS consult the applicable Knowledge Center notebook before answering, validating, generating, correcting, or approving any transaction related to Finance, Procurement, Payroll, or Progress Billing.
You MUST NOT rely on assumptions when a notebook rule exists.
If the user asks why a transaction is blocked, locked, recalculated, rejected, or flagged, you MUST explain the answer based on the applicable notebook rule.
If the user asks you to change a formula, override validation, bypass approval, or edit a locked transaction, you MUST first check if the request violates the notebook rules.
If the request violates a saved rule, you MUST WARN the user and require an authorized override or formal notebook revision.
You must never silently override notebook rules. If there is a conflict between existing code/UI behavior and the notebook, the notebook rule PREVAILS.

When citing a rule, explicitly mention the Notebook Name, the Rule Title, and the Module it applies to.

### ACTIVE KNOWLEDGE CENTER CONTEXT ###
${knowledgeContext}
`;

    const { text } = await generateText({
      model: google('gemini-2.5-flash'),
      system: systemPrompt,
      prompt: question,
      temperature: 0.2, // Low temperature for factual rule-based answers
    });

    res.json({ success: true, answer: text });
  } catch (error: any) {
    console.error('AI Assistant Error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to process AI request.' });
  }
});

export default router;
