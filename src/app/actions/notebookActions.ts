'use server';

import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/dal/auth';
import { revalidatePath } from 'next/cache';


import { uploadToS3 as put } from '@/lib/s3';
import path from 'path';
const pdfParse = require('pdf-parse');
import * as xlsx from 'xlsx';
import { generateText } from 'ai';
// AI runs on OpenAI (OPENAI_API_KEY, gpt-6-luna by default); previously Gemini.
import { openAIModel } from '@/lib/ai/openai-model';

export async function uploadReferenceFile(formData: FormData) {
  try {
    const actor = await verifySession();
    if (!actor) throw new Error('Unauthorized: sign in before uploading a notebook reference.');

    const title = formData.get('title') as string;
    const category = formData.get('category') as string;
    const isMandatory = formData.get('isMandatory') === 'true';
    const targetModule = formData.get('targetModule') as string;
    const file = formData.get('file') as File;

    if (!file || !title || !category) {
      return { success: false, error: 'Missing required fields' };
    }

    const safeFilename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const storedFile = await put(`notebook/${safeFilename}`, buffer, {
      contentType: file.type || 'application/octet-stream',
      module: 'KNOWLEDGE_CENTER',
      uploadedBy: actor.id,
    });

    // 2. Extract Text based on file type
    let extractedText = '';
    const fileType = file.type || '';
    const extension = path.extname(file.name).toLowerCase();

    if (fileType === 'application/pdf' || extension === '.pdf') {
      try {
        const pdfData = await pdfParse(buffer);
        extractedText = pdfData.text;
      } catch (e) {
        console.warn('Failed to parse PDF', e);
      }
    } else if (
      fileType === 'text/csv' ||
      extension === '.csv' ||
      fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      extension === '.xlsx' ||
      extension === '.xls'
    ) {
      try {
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        extractedText = xlsx.utils.sheet_to_txt(worksheet);
      } catch (e) {
        console.warn('Failed to parse spreadsheet', e);
      }
    } else if (fileType.startsWith('text/') || extension === '.txt') {
      extractedText = buffer.toString('utf-8');
    }

    // 3. AI Summarization & Indexing
    let aiSummary = 'No summary generated.';
    let aiKeywords = '';
    let indexedStatus = 'FAILED';

    if (extractedText.trim().length > 0) {
      try {
        const prompt = `Act as an ERP System Knowledge Base Indexer.
Analyze the following text extracted from a policy document or reference file.
Generate a concise AI Summary (1-3 sentences max) of the rules and policies it contains.
Generate a comma-separated list of 5-10 AI Keywords that can be used to search for this document.

Respond exactly in this JSON format:
{
  "summary": "The summary here...",
  "keywords": "keyword1, keyword2, keyword3"
}

Document Text:
${extractedText.substring(0, 15000)}
`;
        const result = await generateText({
          model: openAIModel(),
          prompt
        });

        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          aiSummary = parsed.summary;
          aiKeywords = parsed.keywords;
          indexedStatus = 'INDEXED';
        }
      } catch (aiError) {
        console.error('AI Indexing failed:', aiError);
      }
    }

    // 4. Save to Database
    const newRef = await prisma.notebookReference.create({
      data: {
        referenceCode: `REF-${Date.now()}`,
        title,
        category,
        fileName: file.name,
        fileType: file.type || 'unknown',
        filePath: storedFile.url,
        mandatoryFlag: isMandatory,
        status: 'ACTIVE',
        uploadedBy: actor.id,
        uploadedByRole: actor.role,
        moduleScope: targetModule || 'GENERAL',
        versions: {
          create: {
            versionNumber: 1,
            fileName: file.name,
            filePath: storedFile.url,
            extractedText: extractedText.substring(0, 60000), // Max length safety
            aiSummary,
            aiKeywords,
            indexedStatus,
            uploadedBy: actor.id,
          }
        }
      },
      include: {
        versions: true
      }
    });

    revalidatePath('/ai-notebook');
    return { success: true, reference: newRef };
  } catch (error: any) {
    console.error('Error uploading reference file:', error);
    return { success: false, error: error.message };
  }
}

export async function getReferenceFiles() {
  try {
    const files = await prisma.notebookReference.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1
        }
      }
    });
    return files;
  } catch (error: any) {
    console.error('Error fetching references:', error);
    return [];
  }
}
