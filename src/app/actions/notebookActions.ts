'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';


import { uploadToS3 as put } from '@/lib/s3';
import * as fs from 'fs';
import path from 'path';
const pdfParse = require('pdf-parse');
import * as xlsx from 'xlsx';
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function uploadReferenceFile(formData: FormData) {
  try {
    const title = formData.get('title') as string;
    const category = formData.get('category') as string;
    const isMandatory = formData.get('isMandatory') === 'true';
    const targetModule = formData.get('targetModule') as string;
    const file = formData.get('file') as File;

    if (!file || !title || !category) {
      return { success: false, error: 'Missing required fields' };
    }

    // 1. Save file to disk
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'notebook');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const safeFilename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(uploadDir, safeFilename);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

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
          model: google('gemini-2.5-flash'),
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
        filePath: `/uploads/notebook/${safeFilename}`,
        mandatoryFlag: isMandatory,
        status: 'ACTIVE',
        uploadedBy: 'user-stub', 
        uploadedByRole: 'SUPER_ADMIN', 
        moduleScope: targetModule || 'GENERAL',
        versions: {
          create: {
            versionNumber: 1,
            fileName: file.name,
            filePath: `/uploads/notebook/${safeFilename}`,
            extractedText: extractedText.substring(0, 60000), // Max length safety
            aiSummary,
            aiKeywords,
            indexedStatus,
            uploadedBy: 'user-stub',
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
