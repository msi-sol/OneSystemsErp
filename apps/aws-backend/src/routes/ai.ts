import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateText } from 'ai';
import { uploadToS3 } from '../../../../src/lib/s3';
// AI runs on OpenAI (OPENAI_API_KEY, gpt-6-luna by default); previously Gemini.
import { openAIModel, generateOpenAIText } from '../../../../src/lib/ai/openai-model';

const router = Router();

router.post('/validate', async (req, res) => {
  try {
    const { moduleName, transactionDetails } = req.body;
    const userId = (req as any).user?.id || 'unknown';
    const userRole = (req as any).user?.role || 'unknown';
    
    // 1. Fetch Mandatory References for this module (and GENERAL)
    const references = await prisma.notebookReference.findMany({
      where: {
        status: 'ACTIVE',
        mandatoryFlag: true,
        OR: [
          { moduleScope: moduleName },
          { moduleScope: 'GENERAL' },
          { moduleScope: 'All Modules / General' }
        ]
      },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1
        }
      }
    });

    if (!references || references.length === 0) {
      return res.json({ 
        validationStatus: 'PASSED', 
        riskLevel: 'LOW', 
        findings: 'No mandatory references found for this module.', 
        aiRecommendation: '',
        validationLogId: null
      });
    }

    // 2. Prepare Reference Texts
    let referenceContext = '';
    let primaryRefId = references[0].id;
    let primaryVersionId = references[0].versions[0]?.id;

    for (const ref of references) {
      if (ref.versions && ref.versions.length > 0) {
         referenceContext += `--- POLICY: ${ref.title} ---\n${ref.versions[0].extractedText?.substring(0, 5000)}\n\n`;
      }
    }

    // 3. Prompt the AI model (OpenAI)
    const prompt = `Act as an ERP System Validator.
You are evaluating a transaction in the "${moduleName}" module.
You must check if the transaction violates any of the mandatory company policies provided below.

--- MANDATORY POLICIES ---
${referenceContext}

--- TRANSACTION DETAILS ---
User Role: ${userRole}
Transaction Data:
${JSON.stringify(transactionDetails, null, 2)}

Evaluate the transaction against the policies. Return EXACTLY the following JSON format:
{
  "validationStatus": "PASSED", // "PASSED" | "WARNING" | "BLOCKING ISSUE" | "NEEDS HUMAN REVIEW"
  "riskLevel": "LOW", // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  "findings": "Explanation of any violations found, or state that it complies.",
  "aiRecommendation": "Recommended next step for the user."
}

If the transaction clearly violates a strict rule in the policy (e.g. over limits, unauthorized type, missing mandatory info), return BLOCKING ISSUE.
If there are minor anomalies or borderline issues, return WARNING.
Otherwise, return PASSED.
`;

    const result = await generateText({
      model: openAIModel(),
      prompt
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    let validationResult;
    if (jsonMatch) {
       validationResult = JSON.parse(jsonMatch[0]);
    } else {
       validationResult = { validationStatus: 'NEEDS HUMAN REVIEW', riskLevel: 'MEDIUM', findings: 'Failed to parse AI response.', aiRecommendation: 'Review manually.' };
    }

    // 4. Save to Database
    const savedLog = await prisma.aITransactionValidation.create({
       data: {
         moduleName,
         transactionId: 'PRE_SAVE',
         userId,
         userRole,
         validationType: 'PRE_SAVE_CHECK',
         referenceId: primaryRefId,
         referenceVersionId: primaryVersionId,
         validationStatus: validationResult.validationStatus || 'NEEDS HUMAN REVIEW',
         riskLevel: validationResult.riskLevel || 'MEDIUM',
         aiFindings: validationResult.findings || 'No findings.',
         aiRecommendation: validationResult.aiRecommendation || '',
         blockingFlag: validationResult.validationStatus === 'BLOCKING ISSUE'
       }
    });

    res.json({ ...validationResult, validationLogId: savedLog.id });
  } catch (error: any) {
    console.error('AI Validation Error:', error);
    res.json({ validationStatus: 'NEEDS HUMAN REVIEW', riskLevel: 'MEDIUM', findings: 'AI Engine Error: ' + error.message, aiRecommendation: 'Contact admin.', validationLogId: null });
  }
});

router.post('/update-log', async (req, res) => {
    try {
        const { logId, transactionId } = req.body;
        if (!logId) return res.json({ success: false });
        await prisma.aITransactionValidation.update({
            where: { id: logId },
            data: { transactionId }
        });
        res.json({ success: true });
    } catch(e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/verify-delivery', async (req, res) => {
  try {
    const { fileBase64, mimeType, poDetails } = req.body;
    
    const prompt = `Act as an AI Document Verifier. You are validating an uploaded Delivery Receipt (DR) document against the system's Purchase Order (PO) details.

System PO Details:
- PO Number: ${poDetails.poNumber}
- Supplier/Vendor: ${poDetails.supplierName}
- Expected Items: 
${poDetails.items.map((i: any) => `  * ${i.description} (Ordered: ${i.quantity}, DR encoded: ${i.drQuantity})`).join('\n')}

Task:
1. Examine the uploaded document.
2. Verify if the vendor name on the document matches "${poDetails.supplierName}".
3. Verify if the PO Number or DR Number matches the transaction.
4. Verify if the item descriptions and quantities on the document match the expected items.

If there are ANY mismatches, you MUST reject it and show the ACTUAL mismatch in the findings (e.g., "Vendor mismatch: PO says X, Document says Y"). Focus strictly on:
- Vendor/Supplier mismatch
- PO Number mismatch
- Item Description or Quantity mismatch

Return EXACTLY the following JSON format:
{
  "matches": true, // or false
  "findings": "Explanation of the matches or the specific mismatches found."
}`;

    const responseText = await generateOpenAIText({
      prompt,
      file: { base64: fileBase64, mediaType: mimeType, filename: 'delivery-receipt' },
    });
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
       res.json(JSON.parse(jsonMatch[0]));
    } else {
       res.json({ matches: false, findings: "Failed to parse AI response. Rejecting for safety." });
    }
  } catch (error: any) {
    console.error('AI Document Verification Error:', error);
    res.json({ matches: false, findings: `AI Vision Engine Error: ${error.message}` });
  }
});

router.post('/quotations', async (req, res) => {
  try {
    const { canvassId, files } = req.body;
    
    const canvass = await prisma.canvassForm.findUnique({
      where: { id: canvassId },
      include: {
        items: { include: { consolidatedBoqItem: true } }
      }
    });

    if (!canvass) throw new Error('Canvass not found');
    if (['APPROVED', 'COMPLETED'].includes(canvass.status)) {
      return res.status(409).json({ success: false, error: 'Quotations cannot be changed after the canvass is approved or completed.' });
    }

    const allSuppliers = await prisma.supplier.findMany();
    const expectedSuppliersText = allSuppliers.map(s => `- ID: ${s.id}, Name: ${s.name}`).join('\n');
    const expectedItemsText = canvass.items.map(i => `- Item ID: ${i.id}, Description: ${i.consolidatedBoqItem?.description || 'Unknown'}, Qty Required: ${i.quantityRequired}`).join('\n');

    const processPromises = files.map(async (file: any) => {
      try {
        const buffer = Buffer.from(file.base64, 'base64');
        const fileName = `${Date.now()}-${file.name}`;
        
        const { url: fileUrl } = await uploadToS3(fileName, buffer, { module: 'PROCUREMENT', projectId: canvass.projectId, uploadedBy: String(req.headers['x-user-session'] || ''), contentType: file.type || 'application/octet-stream' });

        const prompt = `Act as an AI Procurement Data Extractor.
You are analyzing a scanned supplier's quotation document for a Canvass.

--- System Information ---
Valid Invited Suppliers:
${expectedSuppliersText}

Expected Canvassed Items:
${expectedItemsText}

--- Task Instructions ---
1. Supplier Identification: Extract the Supplier Name from the document (usually the letterhead). Match it strictly to one of the "Valid Invited Suppliers". If the supplier is NOT in the invited list, set "matches": false and explain in "findings".
2. Item Extraction & Verification: Extract the quoted items and their unit costs. Cross-reference them against the "Expected Canvassed Items".
   - CRITICAL RULE: If the quotation contains items that are NOT in the expected list, or if it is missing items that were requested, you MUST set "matches": false and detail the mismatched items in "findings".
3. Extract Delivery Period and Payment Terms if present.

Return EXACTLY the following JSON format. Do not use markdown blocks. Just the raw JSON.
{
  "supplierId": "the ID of the matched supplier, or null if no match",
  "matches": true,
  "findings": "Explanation. E.g., 'Rejected: Quoted item XYZ not requested' or 'Successfully extracted.'",
  "totalAmount": 1000.00,
  "deliveryPeriod": "30 Days",
  "paymentTerms": "COD",
  "items": [
    {
       "canvassItemId": "id of the expected canvass item",
       "unitCost": 500.00
    }
  ]
}`;

        const responseText = await generateOpenAIText({
          prompt,
          file: { base64: file.base64, mediaType: file.type, filename: file.name },
        });
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        
        if (!jsonMatch) {
          return { fileName: file.name, success: false, error: "Failed to parse AI response." };
        }

        const aiData = JSON.parse(jsonMatch[0]);

        if (!aiData.matches || !aiData.supplierId) {
          return { fileName: file.name, success: false, error: aiData.findings || "Supplier mismatched." };
        }

        if (!aiData.items || aiData.items.length === 0) {
           return { fileName: file.name, success: false, error: "No valid items extracted." };
        }

        const itemsData = aiData.items.map((i: any) => {
          const canvassItem = canvass.items.find(ci => ci.id === i.canvassItemId);
          const qty = canvassItem?.quantityRequired || 0;
          return {
            canvassItemId: i.canvassItemId,
            unitCost: i.unitCost,
            quantityAvailable: qty,
            totalCost: i.unitCost * qty,
            brand: 'Extracted by AI',
            remarks: 'AI Auto-Encoded'
          };
        });

        const totalAmount = itemsData.reduce((sum: number, i: any) => sum + i.totalCost, 0);

        const existingQuote = await prisma.supplierQuotation.findFirst({
            where: { canvassFormId: canvassId, supplierId: aiData.supplierId }
        });

        if (existingQuote) {
            return { fileName: file.name, success: false, error: `Quotation already encoded.` };
        }

        await prisma.$transaction(async (tx) => {
          const unlocked = await tx.canvassForm.updateMany({
            where: { id: canvassId, status: { notIn: ['APPROVED', 'COMPLETED'] }, updatedAt: canvass.updatedAt },
            data: {
              aiSummary: null,
              recommendedSupplierId: null,
              status: canvass.status === 'ENDORSED' ? 'DRAFT' : canvass.status,
            },
          });
          if (unlocked.count !== 1) throw new Error('Quotations cannot be changed after the canvass is approved or completed.');
          await tx.supplierQuotation.updateMany({
            where: { canvassFormId: canvassId },
            data: { isRecommended: false, aiRank: null, aiRationale: null },
          });
          await tx.supplierQuotation.create({
            data: {
              canvassFormId: canvassId,
              supplierId: aiData.supplierId,
              status: 'RECEIVED_AI_EXTRACTED',
              totalAmount: totalAmount,
              deliveryPeriod: aiData.deliveryPeriod || 'N/A',
              paymentTerms: aiData.paymentTerms || 'N/A',
              fileUrl: fileUrl,
              items: { create: itemsData }
            }
          });
        });

        const supplierObj = allSuppliers.find(s => s.id === aiData.supplierId);

        return {
          fileName: file.name,
          success: true,
          supplierName: supplierObj?.name || 'Unknown Supplier',
          message: aiData.findings || 'Successfully extracted.'
        };

      } catch (fileErr: any) {
        return { fileName: file.name, success: false, error: fileErr.message };
      }
    });

    const finalResults = await Promise.all(processPromises);
    res.json({ success: true, results: finalResults });

  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
