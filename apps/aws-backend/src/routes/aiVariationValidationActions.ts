import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateText } from 'ai';
// AI runs on OpenAI (OPENAI_API_KEY, gpt-6-luna by default); previously Gemini.
import { openAIModel } from '../../../../src/lib/ai/openai-model';

const router = Router();

router.post('/preCheckVariationOrder', async (req, res) => {
  try {
    const { voId } = req.body;
    // Acting user comes from the verified backend token (auth middleware), never from the client body.
    const userId = req.body.sessionId as string;

    if (!voId || !userId) {
      return res.status(400).json({ success: false, error: 'voId and userId are required.' });
    }

    const vo = await prisma.variationOrder.findUnique({
      where: { id: voId },
      include: {
        items: true,
        documents: true,
        project: true
      }
    });

    if (!vo) {
      return res.status(404).json({ success: false, error: 'Variation Order not found' });
    }

    // Prepare context for the AI
    const voDetails = JSON.stringify({
      voNumber: vo.voNumber,
      variationType: vo.variationType,
      reason: vo.reasonForVariation,
      detailedDescription: vo.detailedDescription,
      originalContractAmount: vo.originalContractAmount,
      netVariationAmount: vo.netVariationAmount,
      percentageImpact: vo.percentageImpact,
      items: vo.items,
      uploadedDocuments: vo.documents.map(d => ({ fileType: d.fileType, category: d.documentCategory }))
    });

    const prompt = `
      You are the AI Assistant for the Project Variation Order Module.
      Your task is to analyze the following Variation Order (VO) and provide a comprehensive pre-check validation.

      VO Details:
      ${voDetails}

      Please analyze the following areas:
      1. Scope Validation: Are there potential duplicates or issues?
      2. Quantity Validation: Are quantities justified based on the provided details?
      3. Cost Validation: Are the unit costs and total amounts reasonable?
      4. Document Completeness: Are there missing mandatory documents based on the variation type?
      5. Risk Assessment: What is the overall risk (LOW, MEDIUM, HIGH, CRITICAL) and why?

      Output your response as JSON in the exact following format:
      {
        "scopeValidation": { "result": "PASSED" | "PASSED_WITH_WARNING" | "FAILED", "findings": "...", "confidence": "HIGH" },
        "quantityValidation": { "result": "PASSED" | "PASSED_WITH_WARNING" | "FAILED", "findings": "...", "confidence": "HIGH" },
        "costValidation": { "result": "PASSED" | "PASSED_WITH_WARNING" | "FAILED", "findings": "...", "confidence": "HIGH" },
        "documentCheck": { "result": "PASSED" | "FAILED", "missing": "...", "confidence": "HIGH" },
        "riskAssessment": { "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", "findings": "...", "recommendedAction": "..." }
      }
    `;

    const model = openAIModel();

    const result = await generateText({
      model: model,
      prompt: prompt,
    });

    let aiOutput;
    try {
      const cleanJson = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
      aiOutput = JSON.parse(cleanJson);
    } catch (parseError: any) {
      console.error("AI JSON Parse Error:", result.text);
      return res.status(500).json({ success: false, error: "AI returned invalid format: " + parseError.message });
    }

    // Save Scope Validation
    await prisma.aIVariationOrderValidation.create({
      data: {
        variationOrderId: voId,
        validationType: 'SCOPE',
        result: aiOutput.scopeValidation.result,
        findings: aiOutput.scopeValidation.findings,
        confidenceLevel: aiOutput.scopeValidation.confidence,
        riskLevel: aiOutput.riskAssessment.riskLevel
      }
    });

    // Save Quantity Validation
    await prisma.aIVariationOrderValidation.create({
      data: {
        variationOrderId: voId,
        validationType: 'QUANTITY',
        result: aiOutput.quantityValidation.result,
        findings: aiOutput.quantityValidation.findings,
        confidenceLevel: aiOutput.quantityValidation.confidence,
        riskLevel: aiOutput.riskAssessment.riskLevel
      }
    });

    // Save Cost Validation
    await prisma.aIVariationOrderValidation.create({
      data: {
        variationOrderId: voId,
        validationType: 'COST',
        result: aiOutput.costValidation.result,
        findings: aiOutput.costValidation.findings,
        confidenceLevel: aiOutput.costValidation.confidence,
        riskLevel: aiOutput.riskAssessment.riskLevel
      }
    });

    // Save Document Check
    await prisma.aIVariationOrderValidation.create({
      data: {
        variationOrderId: voId,
        validationType: 'DOCUMENT',
        result: aiOutput.documentCheck.result,
        findings: aiOutput.documentCheck.missing,
        confidenceLevel: aiOutput.documentCheck.confidence,
        riskLevel: aiOutput.riskAssessment.riskLevel,
        missingRequirements: aiOutput.documentCheck.missing
      }
    });

    // Update VO with overall risk
    await prisma.variationOrder.update({
      where: { id: voId },
      data: {
        aiValidationResult: 'COMPLETED',
        aiRiskRating: aiOutput.riskAssessment.riskLevel
      }
    });

    return res.json({ success: true, data: aiOutput });
  } catch (error: any) {
    console.error('Error in preCheckVariationOrder:', error);
    return res.status(500).json({ success: false, error: 'Failed to run AI Pre-check: ' + error.message });
  }
});

router.post('/askVariationOrderAssistant', async (req, res) => {
  try {
    const { voId, question } = req.body;

    if (!voId || !question) {
      return res.status(400).json({ success: false, error: 'voId and question are required.' });
    }

    const vo = await prisma.variationOrder.findUnique({
      where: { id: voId },
      include: { items: true, documents: true, project: true }
    });

    if (!vo) {
      return res.status(404).json({ success: false, error: 'Variation Order not found' });
    }

    const prompt = `
      You are an expert ERP Project Variation Order Assistant.
      Context VO: ${JSON.stringify(vo)}
      
      User Question: ${question}

      Provide a helpful, precise, and professional response. Do not invent details not present in the context.
    `;

    const model = openAIModel();

    const result = await generateText({
      model: model,
      prompt: prompt,
    });

    return res.json({ success: true, data: result.text });
  } catch (error: any) {
    console.error('Error in askVariationOrderAssistant:', error);
    return res.status(500).json({ success: false, error: 'Failed to get AI answer: ' + error.message });
  }
});

export default router;
