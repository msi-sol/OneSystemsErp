import { prisma } from './prisma';
import { PrismaClient } from '@prisma/client';
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { GoogleGenerativeAI } from '@google/generative-ai';
const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function validateTransactionWithAI(
  moduleName: string,
  transactionDetails: any,
  userId: string,
  userRole: string
) {
  try {
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
      return { 
        validationStatus: 'PASSED', 
        riskLevel: 'LOW', 
        findings: 'No mandatory references found for this module.', 
        aiRecommendation: '',
        validationLogId: null
      };
    }

    let referenceContext = '';
    let primaryRefId = references[0].id;
    let primaryVersionId = references[0].versions[0]?.id;

    for (const ref of references) {
      if (ref.versions && ref.versions.length > 0) {
         referenceContext += `--- POLICY: ${ref.title} ---\n${ref.versions[0].extractedText?.substring(0, 5000)}\n\n`;
      }
    }

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
      model: google('gemini-2.5-flash'),
      prompt
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    let validationResult;
    if (jsonMatch) {
       validationResult = JSON.parse(jsonMatch[0]);
    } else {
       validationResult = { validationStatus: 'NEEDS HUMAN REVIEW', riskLevel: 'MEDIUM', findings: 'Failed to parse AI response.', aiRecommendation: 'Review manually.' };
    }

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

    return { ...validationResult, validationLogId: savedLog.id };

  } catch (error: any) {
    console.error('AI Validation Error:', error);
    return { validationStatus: 'NEEDS HUMAN REVIEW', riskLevel: 'MEDIUM', findings: 'AI Engine Error: ' + error.message, aiRecommendation: 'Contact admin.', validationLogId: null };
  }
}

export async function updateAIValidationLog(logId: string, transactionId: string) {
    if (!logId) return;
    try {
        await prisma.aITransactionValidation.update({
            where: { id: logId },
            data: { transactionId }
        });
    } catch(e) {
        console.error("Failed to update AI log with transaction ID", e);
    }
}

export async function verifyDeliveryDocumentWithAI(fileBuffer: Buffer, mimeType: string, poDetails: any) {
  try {
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

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: fileBuffer.toString("base64"),
          mimeType: mimeType
        }
      }
    ]);

    const responseText = result.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
       return JSON.parse(jsonMatch[0]);
    } else {
       return { matches: false, findings: "Failed to parse AI response. Rejecting for safety." };
    }
  } catch (error: any) {
    console.error('AI Document Verification Error:', error);
    return { matches: false, findings: `AI Vision Engine Error: ${error.message}` };
  }
}
