'use server';
import { verifySession } from '@/lib/dal/auth';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import * as xlsx from 'xlsx';
import { getStoredUploadDownloadUrl, readStoredUpload, uploadToS3 as put } from '@/lib/s3';
import { actorCanAccessProject } from '@/lib/boq/workspace-service';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ResponseInputContent } from 'openai/resources/responses/responses';
import { z } from 'zod';
import { openAIModelName } from '@/lib/ai/openai-model';
import ExcelJS from 'exceljs';
import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { materialQuantity } from '@/lib/procurement/material-values';
import { hasPermission } from '@/lib/permissions';
import { assertMaterialRequestAllowance, assertMaterialRequestTransition } from '@/lib/boq/benchmark-request-allowance';
import { BENCHMARK_BOQ_LINKS_ACTION, readBenchmarkBoqLinks } from '@/lib/boq/benchmark-boq-links';

async function requireMaterialRequestActor(mrId: string, capabilities: string[]) {
  const actor = await verifySession();
  if (!actor || actor.mustChangePassword) throw new Error('Sign in before changing a material request.');
  const request = await prisma.materialRequest.findUnique({ where: { id: mrId }, select: { projectId: true } });
  if (!request || !await actorCanAccessProject(actor, request.projectId, ['canView'])) throw new Error('Material request is not available in your project access.');
  if (!(await Promise.all(capabilities.map(action => hasPermission(actor.id, 'MATERIALS_REQUEST', action)))).some(Boolean)) throw new Error('You do not have permission for this material request action.');
  return actor;
}

async function requireMaterialRequestCreation(projectId: string) {
  const actor = await verifySession();
  if (!actor || actor.mustChangePassword || !await hasPermission(actor.id, 'MATERIALS_REQUEST', 'canCreate') || !await actorCanAccessProject(actor, projectId, ['canView'])) throw new Error('You do not have permission to create material requests for this project.');
  return actor;
}

async function assertProcurementBenchmarkReplaceable(tx: Prisma.TransactionClient, projectId: string) {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { procurementBenchmarkLocked: true } });
  if (!project) throw new Error('Project not found. Refresh the project and try again.');
  if (project.procurementBenchmarkLocked) {
    throw new Error('The procurement benchmark is locked. Preserve it and ask a project administrator to resolve the lock; this legacy action cannot unlock or replace a locked benchmark.');
  }
  const reviewState = await tx.auditLog.findFirst({
    where: { moduleName: 'PROJECT_MANAGEMENT', transactionId: projectId, actionType: 'PROCUREMENT_BENCHMARK_REVIEW_STATE' },
    select: { id: true },
  });
  if (reviewState) {
    throw new Error('A benchmark review is already saved for this project. Use the benchmark review workspace; the legacy upload/delete action cannot replace its source or review history.');
  }
  const mapping = await tx.bOQMapping.findFirst({ where: { procurementBenchmarkItem: { is: { projectId } } }, select: { id: true } });
  if (mapping) {
    throw new Error('This procurement benchmark is already linked to the master materials list. Preserve the current benchmark and resolve its consolidation before replacing or deleting it.');
  }
}

async function requireProjectCapability(projectId: string, capabilities: string[], message: string) {
  const actor = await verifySession();
  if (!actor || actor.mustChangePassword) throw new Error('Unauthorized: sign in before changing this project.');
  if (!await actorCanAccessProject(actor, projectId, capabilities)) throw new Error(message);
  return actor;
}

async function requireProjectTemplateView(projectId: string) {
  const actor = await verifySession();
  if (!actor || actor.mustChangePassword) throw new Error('Unauthorized: sign in to view this project template.');
  if (!await actorCanAccessProject(actor, projectId, ['canView'])) {
    throw new Error('Unauthorized: you do not have permission to view this project template.');
  }
}

// Structured BOQ extraction for PDF/image uploads. Runs on OpenAI (OPENAI_API_KEY, gpt-6-luna by default)
// with the same structured-output approach as the BOQ workspace upload helper; previously Gemini.
const boqExtractionSchema = z.object({
  name: z.string().describe('The name of the project'),
  location: z.string().describe('The location or address of the project'),
  contractAmount: z.number().describe('The total contract amount'),
  items: z.array(z.object({
    itemCode: z.string().describe('Item Number or Code'),
    description: z.string().describe('Description of work or item'),
    unit: z.string().describe('Unit of Measurement (e.g., cu.m, sq.m, lot, ls)'),
    quantity: z.number().describe('Quantity'),
    unitCost: z.number().describe('Unit Cost or Price'),
    totalCost: z.number().describe('Total Cost or Amount for this item'),
  })).describe('List of Bill of Quantities (BOQ) line items'),
});

async function parseBoqWithAI(buffer: Buffer | null, mimeType: string, rawTextContent?: string) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('AI Processing Error: OpenAI is not configured. Upload an Excel file instead, which does not require AI to process.');

  const content: ResponseInputContent[] = [
    { type: 'input_text', text: 'Extract the project details (name, location, total contract amount) and the detailed Bill of Quantities (BOQ) line items from this data. Ensure you capture all items accurately. STRICT RULES:\n1. Assign the numbering or item code exactly as it appears in the uploaded file to the "itemCode" field (column 1). Do not merge it into the description.\n2. Exclude irrelevant rows like "MATERIAL LABOR EQUIPMENT TOTAL" or standalone multipliers (e.g., 0.08, 0.05). Include header rows (e.g., "I. GENERAL REQUIREMENTS") as items with 0 cost/quantity so they appear as sections.\n3. Use an empty string or 0 when a value is not shown; never invent quantities or prices.' },
  ];
  if (rawTextContent) {
    content.push({ type: 'input_text', text: `RAW EXCEL DATA:\n${rawTextContent}` });
  } else if (buffer && mimeType) {
    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
    content.push(mimeType.startsWith('image/')
      ? { type: 'input_image', image_url: dataUrl, detail: 'high' }
      : { type: 'input_file', filename: 'boq.pdf', file_data: dataUrl });
  }

  const client = new OpenAI({ apiKey, timeout: 120_000, maxRetries: 0 });
  const response = await client.responses.create({
    model: openAIModelName(), store: false, max_output_tokens: 24_000,
    input: [{ role: 'user', content }],
    text: { format: zodTextFormat(boqExtractionSchema, 'boq_extraction') },
  });
  if (response.status !== 'completed' || !response.output_text) {
    throw new Error('AI Processing Error: the AI could not return a complete BOQ reading. Upload an Excel file instead.');
  }
  const result = boqExtractionSchema.parse(JSON.parse(response.output_text));

  // Normalize parsed items
  const items = (result.items || []).map((item: any) => {
    const quantity = Number(item.quantity) || 0;
    const unitCost = Number(item.unitCost) || 0;
    let totalCost = Number(item.totalCost) || 0;
    if (totalCost === 0 && quantity > 0 && unitCost > 0) {
      totalCost = quantity * unitCost;
    }
    return {
      itemCode: String(item.itemCode || ''),
      description: String(item.description || ''),
      unit: String(item.unit || ''),
      quantity,
      directCost: 0,
      indirectCost: 0,
      combinedUnitCost: unitCost,
      totalCost,
      status: 'PENDING',
      processingType: 'MATERIAL_EQUIPMENT'
    };
  });

  return {
    name: result.name || '',
    location: result.location || '',
    contractAmount: result.contractAmount || 0,
    items
  };
}


export async function createProject(formData: FormData) {
  const actor = await verifySession();
  if (!actor) throw new Error('Unauthorized: sign in before creating a project.');

  const boqFile = formData.get('boqFile') as File | null;
  const managerId = formData.get('managerId') as string | null;
  const startDateStr = formData.get('startDate') as string | null;
  const durationDaysStr = formData.get('durationDays') as string | null;

  if (!boqFile || boqFile.size === 0) {
    throw new Error('No file uploaded');
  }

  let name = boqFile.name.replace(/\.[^/.]+$/, ""); // fallback to filename
  let location = 'Unknown Location';
  let description = `Automated Project Import from BOQ File: ${boqFile.name}`;
  
  let contractAmount = 0;
  let parsedItems: any[] = [];
  // Process file in memory for parsing
  const buffer = Buffer.from(await boqFile.arrayBuffer());
  
  description = `Automated Project Import from BOQ File: ${boqFile.name}`;

  const isPdfOrImage = boqFile.type === 'application/pdf' || boqFile.type.startsWith('image/');

  let aiResult: any;

  const mappedBoqJson = formData.get('mappedBoqJson') as string | null;

  let isMasterTemplate = formData.get('isMasterTemplate') === 'true';

  if (mappedBoqJson) {
    try {
      const parsedClientItems = JSON.parse(mappedBoqJson);
      parsedItems = parsedClientItems;
      contractAmount = parsedItems.reduce((sum, item) => sum + (item.totalCost || 0), 0);
    } catch (e) {
      throw new Error('Failed to parse client-mapped BOQ data');
    }
  } else if (isPdfOrImage) {
    try {
      aiResult = await parseBoqWithAI(buffer, boqFile.type);
    } catch (e: any) {
      if (e?.code === 'insufficient_quota' || e?.status === 429) {
        throw new Error('AI Processing Error: the OpenAI API quota or rate limit was reached. Please upload an Excel file instead, which does not require AI to process.');
      }
      if (e?.status === 401) {
        throw new Error('AI Processing Error: the configured OpenAI key was not accepted. Please upload an Excel file instead, or ask your administrator to check the key.');
      }
      throw e;
    }
  } else if (isMasterTemplate) {
    // ----------------------------------------------------
    // Parse using Master Template Format (via ExcelJS)
    // ----------------------------------------------------
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    
    // Helper to safely get string from cell (handles rich text)
    const getCellString = (cell: ExcelJS.Cell) => {
      if (cell.value && typeof cell.value === 'object' && 'richText' in cell.value) {
        // @ts-ignore
        return cell.value.richText.map(rt => rt.text).join("");
      }
      return cell.value?.toString() || "";
    };

    // Extract Logo
    let logoData = null;
    const imgObj = sheet.getImages()[0];
    if (imgObj) {
      try {
        const img = workbook.getImage(imgObj.imageId as unknown as number);
        if (img && img.buffer) {
          const bufferAny = img.buffer as any;
          const base64Str = Buffer.isBuffer(bufferAny) 
            ? bufferAny.toString('base64') 
            : Buffer.from(bufferAny).toString('base64');
          logoData = `data:image/${img.extension};base64,${base64Str}`;
        }
      } catch (e) {
        console.warn("Failed to extract image", e);
      }
    }

    const line1 = getCellString(sheet.getRow(1).getCell(3)) || getCellString(sheet.getRow(2).getCell(1)) || "REPUBLIC OF THE PHILIPPINES";
    const line2 = getCellString(sheet.getRow(2).getCell(3)) || getCellString(sheet.getRow(3).getCell(1)) || "";
    const line3 = getCellString(sheet.getRow(3).getCell(3)) || getCellString(sheet.getRow(4).getCell(1)) || "";

    formData.append('extractedLogo', logoData || '');
    formData.append('extractedLine1', line1);
    formData.append('extractedLine2', line2);
    formData.append('extractedLine3', line3);

    let anchorRowNumber = -1;
    sheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        if (cell.type === ExcelJS.ValueType.String && cell.value?.toString().replace(/\s/g, '').toUpperCase().includes("BIDDETAILEDCOSTBREAKDOWN")) {
          anchorRowNumber = rowNumber;
        }
      });
    });

    if (anchorRowNumber !== -1) {
      const headerRow = sheet.getRow(anchorRowNumber + 1);
      const subHeaderRow = sheet.getRow(anchorRowNumber + 2);
      
      const headers = Array.from(headerRow.values as any[] || []).map(v => String(v || '').replace(/\s/g, '').toUpperCase());
      const subHeaders = Array.from(subHeaderRow.values as any[] || []).map(v => String(v || '').replace(/\s/g, '').toUpperCase());

      // Search both rows for the column headers
      const findCol = (keywords: string[]) => {
        let idx = headers.findIndex(h => h && keywords.some(k => h.includes(k)));
        if (idx === -1) {
          idx = subHeaders.findIndex(h => h && keywords.some(k => h.includes(k)));
        }
        return idx;
      };

      const cItem = findCol(["ITEM"]);
      const cDesc = findCol(["DESCRIPTION"]);
      const cUnit = findCol(["UNIT"]);
      const cQty = findCol(["QUANTITY", "QTY"]);
      const cUc = findCol(["UNITCOST", "UNIT PRICE"]);
      const cAmt = findCol(["AMOUNT", "TOTAL COST"]);
      const cMat = findCol(["MATERIAL"]);
      const cLab = findCol(["LABOR"]);
      const cEqu = findCol(["EQUIPMENT"]);
      const cTdc = findCol(["TOTALDIRECTCOST", "TDC"]);
      const cOcm = findCol(["OCM"]);
      const cCp = findCol(["PROFIT", "CP"]);
      const cVat = findCol(["VAT", "TAX"]);
      const cTic = findCol(["TOTALINDIRECTCOST", "TIC"]);
      const cPct = findCol(["%OFTOTAL", "% OF TOTAL", "%"]);

      const getNum = (cell: ExcelJS.Cell | undefined) => {
        if (!cell) return 0;
        if (cell.type === ExcelJS.ValueType.Number) return cell.value as number;
        if (cell.type === ExcelJS.ValueType.Formula) return cell.result as number || 0;
        return Number(String(cell.value || '').replace(/[^0-9.-]/g, '')) || 0;
      };

      const getSafeCell = (row: ExcelJS.Row, colIndex: number) => {
        return colIndex >= 1 ? row.getCell(colIndex) : undefined;
      };

      let currentRowNum = anchorRowNumber + 3; // start data from anchor + 3
      while (currentRowNum <= sheet.rowCount) {
        const row = sheet.getRow(currentRowNum);
        const descCell = getCellString(getSafeCell(row, cDesc) as any).trim();
        const amount = getNum(getSafeCell(row, cAmt));
        const qty = getNum(getSafeCell(row, cQty));

        if (!descCell) {
          currentRowNum++;
          continue;
        }

        const descUpper = descCell.toUpperCase();
        if (descUpper.includes("GRAND TOTAL") || descUpper.includes("TOTAL ESTIMATED COST") || descUpper === "TOTAL") {
          break;
        }

        // Purge known spreadsheet sub-header junk
        const descNoSpaces = descUpper.replace(/\s/g, '');
        if (
          descNoSpaces.includes("DIRECTCOSTOCM") ||
          descNoSpaces.includes("PROFIT(8%)") ||
          descNoSpaces.includes("INDIRECTCOST") ||
          descNoSpaces === "(1)" ||
          descNoSpaces === "(2)" ||
          descNoSpaces === "(3)"
        ) {
          currentRowNum++;
          continue;
        }

        let itemNumber = getCellString(getSafeCell(row, cItem) as any).trim();
        let unit = getCellString(getSafeCell(row, cUnit) as any).trim();

        parsedItems.push({
          itemCode: itemNumber,
          description: descCell,
          unit: unit || "LOT",
          quantity: qty,
          directCost: getNum(getSafeCell(row, cTdc)),
          indirectCost: getNum(getSafeCell(row, cTic)),
          combinedUnitCost: getNum(getSafeCell(row, cUc)),
          totalCost: amount,
          status: 'PENDING',
          processingType: 'MATERIAL_EQUIPMENT'
        });

        contractAmount += amount;
        currentRowNum++;
      }
    }
  } else {
    // Parse Excel file using LOCAL parser (0 API credits)
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    // 1. Extract Name and Location from the top ~20 rows
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const row = rows[i];
      if (!row || !Array.isArray(row)) continue;
      
      const cellStrings = row.map(cell => (cell || '').toString().trim());
      
      for (let j = 0; j < cellStrings.length; j++) {
        const cellText = (cellStrings[j] || '').toLowerCase();
        
        if (cellText.startsWith('project') && cellText !== 'project manager') {
          for (let k = j + 1; k < cellStrings.length; k++) {
            const nextCell = cellStrings[k] || '';
            if (nextCell && nextCell !== ':') {
              name = nextCell;
              break;
            }
          }
        }
        
        if (cellText.startsWith('location') || cellText.startsWith('address')) {
          for (let k = j + 1; k < cellStrings.length; k++) {
            const nextCell = cellStrings[k] || '';
            if (nextCell && nextCell !== ':') {
              location = nextCell;
              break;
            }
          }
        }
      }
    }

    // 2. Extract BOQ Items
    let headerRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row && Array.isArray(row) && row.some(cell => typeof cell === 'string' && (cell.toLowerCase().includes('item no') || cell.toLowerCase().includes('description')))) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex !== -1) {
      const headers = rows[headerRowIndex].map(h => (h || '').toString().toLowerCase().trim());
      
      let currentSectionIndex = 0;

      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !Array.isArray(row) || row.length === 0) continue;
        
        let itemCode = '';
        let itemDesc = '';
        let unit = '';
        let quantity = 0;
        let unitCost = 0;
        let totalCost = 0;
        
        for (let j = 0; j < headers.length; j++) {
          const h = headers[j];
          const val = row[j];
          if (!h || val == null) continue;
          
          if (h.includes('item')) itemCode = val;
          else if (h.includes('desc')) itemDesc = val;
          else if (h === 'unit cost' || h.includes('combined') || h.includes('price')) unitCost = parseFloat((val || '').toString()) || 0;
          else if (h === 'total cost' || h === 'amount') totalCost = parseFloat((val || '').toString()) || 0;
          else if (h.includes('unit') || h.includes('uom')) unit = val;
          else if (h === 'qty' || h.includes('quantity')) quantity = parseFloat((val || '').toString()) || 0;
        }
        
        quantity = isNaN(quantity) ? 0 : quantity;
        unitCost = isNaN(unitCost) ? 0 : unitCost;
        totalCost = isNaN(totalCost) ? 0 : totalCost;

        if (totalCost === 0) totalCost = quantity * unitCost;

        let isHeader = false;
        
        // If it's a major category header (like I. GENERAL REQUIREMENTS or II. EARTHWORKS)
        // They typically have no cost/quantity but might have it in the description.
        if (itemDesc && quantity === 0 && totalCost === 0 && !itemDesc.toUpperCase().includes('MATERIAL LABOR EQUIPMENT')) {
           // It's a header section. We should reset the item numbering.
           isHeader = true;
           currentSectionIndex = 0;
        }

        // Apply auto-numbering for line items that have no itemCode but have quantity/cost
        if (!isHeader && (quantity > 0 || totalCost > 0) && !itemCode) {
           currentSectionIndex += 1;
           itemCode = `${currentSectionIndex}.0`;
           console.log('AUTO-NUMBERED:', itemDesc, '->', itemCode);
        }

        if (itemDesc && !itemDesc.toUpperCase().includes('MATERIAL LABOR EQUIPMENT') && (quantity > 0 || totalCost > 0 || isHeader)) {
          parsedItems.push({
            itemCode: String(itemCode || ''),
            description: String(itemDesc || ''),
            unit: String(unit || ''),
            quantity: quantity,
            directCost: 0,
            indirectCost: 0,
            combinedUnitCost: unitCost,
            totalCost: totalCost,
            status: 'PENDING',
            processingType: 'MATERIAL_EQUIPMENT'
          });
          
          // Accumulate contract amount automatically
          contractAmount += totalCost;
        }
      }
    }
  }

  if (aiResult) {
    if (aiResult.name) name = aiResult.name;
    if (aiResult.location) location = aiResult.location;
    if (aiResult.contractAmount) contractAmount = aiResult.contractAmount;
    parsedItems = aiResult.items.map((item: any) => {
      const { materialUnitCost, laborUnitCost, equipmentUnitCost, ...rest } = item;
      return rest;
    });
    
    // Fallback if AI didn't compute total contract amount correctly
    if (contractAmount === 0 && parsedItems.length > 0) {
      contractAmount = parsedItems.reduce((sum, item) => sum + (item.totalCost || 0), 0);
    }
  }



  const contractAmountOverrideStr = formData.get('contractAmountOverride') as string | null;
  if (contractAmountOverrideStr && !isNaN(parseFloat(contractAmountOverrideStr))) {
    contractAmount = parseFloat(contractAmountOverrideStr);
  }

  let startDate: Date | null = null;
  let endDate: Date | null = null;
  let originalContractDuration: number | null = null;

  if (startDateStr) {
    startDate = new Date(startDateStr);
  }
  if (durationDaysStr) {
    originalContractDuration = parseInt(durationDaysStr);
    if (startDate && originalContractDuration) {
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + originalContractDuration);
    }
  }

  const extractedLogo = formData.get('extractedLogo') as string | null;
  const extractedLine1 = formData.get('extractedLine1') as string | null;
  const extractedLine2 = formData.get('extractedLine2') as string | null;
  const extractedLine3 = formData.get('extractedLine3') as string | null;

  const boqRawHeadersJson = formData.get('boqRawHeaders') as string | null;
  let boqRawHeaders = null;
  if (boqRawHeadersJson) {
    try {
      boqRawHeaders = JSON.parse(boqRawHeadersJson);
    } catch (e) {
      console.warn('Failed to parse boqRawHeaders');
    }
  }

  const project = await prisma.project.create({
    data: {
      name,
      description,
      location,
      contractAmount,
      status: 'ACTIVE',
      manager: managerId ? { connect: { id: managerId } } : undefined,
      startDate,
      endDate,
      originalContractDuration,
      originalCompletionDate: endDate,

      awardedBoqItems: {
        create: parsedItems
      }
    }
  });

  const cookieStore = await cookies();
  const sessionId = actor.id;
  const simulatedRole = cookieStore.get('simulatedRole')?.value;

  if (sessionId) {
    const user = await prisma.user.findUnique({ where: { id: sessionId } });
    if (user) {
      const activeRole = simulatedRole || user.role;
      // Auto-assign the creator to the project
      await prisma.projectUserAssignment.create({
        data: {
          userId: sessionId,
          projectId: project.id,
          projectRole: activeRole,
          accessLevel: 'READ_WRITE',
          assignmentStatus: 'active',
          assignedBy: 'SYSTEM',
        }
      });
    }
  }

  // Preserve every accepted source file; only XLSX files act as editable awarded templates.
  const isXlsxSource = boqFile.name.toLowerCase().endsWith('.xlsx');
  const sourceContentType = boqFile.type || (isXlsxSource
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/octet-stream');
  const storedFile = await put(`projects/${project.id}/boq-source/${boqFile.name}`, buffer, {
    contentType: sourceContentType,
    module: 'PROJECT_MANAGEMENT',
    projectId: project.id,
    uploadedBy: actor.id,
  });

  await prisma.document.create({
    data: {
      projectId: project.id,
      title: isXlsxSource ? 'Awarded BOQ Template' : boqFile.name,
      category: isXlsxSource ? 'AWARDED_BOQ_TEMPLATE' : 'PROJECT_BOQ_SOURCE',
      fileUrl: storedFile.url,
      fileType: sourceContentType,
      fileSize: buffer.length,
      uploaderId: actor.id,
    }
  });

  revalidatePath('/projects');
  revalidatePath('/');
}

export async function uploadProcurementBenchmark(formData: FormData) {
  const projectId = formData.get('projectId') as string;
  const boqFile = formData.get('benchmarkFile') as File | null;
  if (!boqFile || boqFile.size === 0) {
    throw new Error('No file uploaded');
  }
  if (!projectId) throw new Error('Select a project before uploading a procurement benchmark.');
  const actor = await requireProjectCapability(projectId, ['canEdit', 'canEditDraft'], 'You do not have permission to edit this project procurement benchmark.');
  await assertProcurementBenchmarkReplaceable(prisma as unknown as Prisma.TransactionClient, projectId);

  let parsedItems: any[] = [];
  const buffer = Buffer.from(await boqFile.arrayBuffer());

  // Parse Excel file
  const workbookXlsx = xlsx.read(buffer, { type: 'buffer' });
  const sheetName = workbookXlsx.SheetNames[0];
  const sheetXlsx = workbookXlsx.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json<any[]>(sheetXlsx, { header: 1 });

  // Check if it's the BOQ Master Template
  let isMasterTemplate = false;
  let anchorRowIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && Array.isArray(row)) {
      if (row.some(cell => String(cell || '').replace(/\s/g, '').toUpperCase().includes('BIDDETAILEDCOSTBREAKDOWN'))) {
        isMasterTemplate = true;
        anchorRowIndex = i;
        break;
      }
    }
  }

  let line1 = "REPUBLIC OF THE PHILIPPINES";
  let line2 = "";
  let line3 = "";
  let logoData: string | null = null;

  if (isMasterTemplate) {
    // Parse using Master Template Format (via ExcelJS)
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    
    // Helper to safely get string from cell (handles rich text)
    const getCellString = (cell: ExcelJS.Cell) => {
      if (cell.value && typeof cell.value === 'object' && 'richText' in cell.value) {
        // @ts-ignore
        return cell.value.richText.map(rt => rt.text).join("");
      }
      return cell.value?.toString() || "";
    };

    // Extract Logo
    const imgObj = sheet.getImages()[0];
    if (imgObj) {
      try {
        const img = workbook.getImage(imgObj.imageId as unknown as number);
        if (img && img.buffer) {
          const bufferAny = img.buffer as any;
          const base64Str = Buffer.isBuffer(bufferAny) 
            ? bufferAny.toString('base64') 
            : Buffer.from(bufferAny).toString('base64');
          logoData = `data:image/${img.extension};base64,${base64Str}`;
        }
      } catch (e) {
        console.warn("Failed to extract image", e);
      }
    }

    line1 = getCellString(sheet.getRow(1).getCell(3)) || getCellString(sheet.getRow(2).getCell(1)) || "REPUBLIC OF THE PHILIPPINES";
    line2 = getCellString(sheet.getRow(2).getCell(3)) || getCellString(sheet.getRow(3).getCell(1)) || "";
    line3 = getCellString(sheet.getRow(3).getCell(3)) || getCellString(sheet.getRow(4).getCell(1)) || "";

    let anchorRowNumber = -1;
    sheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        if (cell.type === ExcelJS.ValueType.String && cell.value?.toString().replace(/\s/g, '').toUpperCase().includes("BIDDETAILEDCOSTBREAKDOWN")) {
          anchorRowNumber = rowNumber;
        }
      });
    });

    if (anchorRowNumber !== -1) {
      const headerRow = sheet.getRow(anchorRowNumber + 1);
      const headers = Array.from(headerRow.values as any[] || []).map(v => String(v || '').replace(/\s/g, '').toUpperCase());

      const cItem = headers.findIndex(h => h && h.includes("ITEM"));
      const cDesc = headers.findIndex(h => h && h.includes("DESCRIPTION"));
      const cUnit = headers.findIndex(h => h && h.includes("UNIT") && !h.includes("COST"));
      const cQty = headers.findIndex(h => h && h.includes("QUANTITY"));
      const cUc = headers.findIndex(h => h && h.includes("UNITCOST"));
      const cAmt = headers.findIndex(h => h && (h.includes("AMOUNT") || h.includes("TOTALCOST")));

      const getNum = (cell: ExcelJS.Cell) => {
        if (cell.type === ExcelJS.ValueType.Number) return cell.value as number;
        if (cell.type === ExcelJS.ValueType.Formula) return cell.result as number || 0;
        return Number(String(cell.value || '').replace(/[^0-9.-]/g, '')) || 0;
      };

      let currentRowNum = anchorRowNumber + 2;
      while (currentRowNum <= sheet.rowCount) {
        const row = sheet.getRow(currentRowNum);
        const descCell = getCellString(row.getCell(cDesc)).trim();
        const amount = getNum(row.getCell(cAmt));
        const qty = getNum(row.getCell(cQty));

        if (!descCell) {
          currentRowNum++;
          continue;
        }

        const descUpper = descCell.toUpperCase();
        if (descUpper.includes("GRAND TOTAL") || descUpper.includes("TOTAL ESTIMATED COST") || descUpper === "TOTAL") {
          break;
        }

        let itemNumber = getCellString(row.getCell(cItem)).trim();
        let unit = getCellString(row.getCell(cUnit)).trim();

        if (descCell && (qty > 0 || amount > 0)) {
          parsedItems.push({
            projectId,
            itemCode: itemNumber,
            description: descCell,
            unit: unit || "LOT",
            quantity: qty,
            unitCost: getNum(row.getCell(cUc)),
            totalCost: amount,
            status: 'PENDING'
          });
        }
        
        currentRowNum++;
      }
    }
  } else {
    // Original generic flat-file parser
    let headerRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row && Array.isArray(row) && row.some(cell => typeof cell === 'string' && (cell.toLowerCase().includes('item no') || cell.toLowerCase().includes('description')))) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex !== -1) {
      const headers = Array.from(rows[headerRowIndex]).map(h => (h || '').toString().toLowerCase().trim());
      
      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !Array.isArray(row) || row.length === 0) continue;
        
        let itemCode = '';
        let itemDesc = '';
        let unit = '';
        let quantity = 0;
        let unitCost = 0;
        let totalCost = 0;
        let category = '';
        
        for (let j = 0; j < headers.length; j++) {
          const h = headers[j];
          const val = row[j];
          if (!h || val == null) continue;
          
          if (h.includes('item')) itemCode = val;
          else if (h.includes('desc')) itemDesc = val;
          else if (h === 'unit cost' || h.includes('price')) unitCost = parseFloat((val || '').toString()) || 0;
          else if (h === 'total cost' || h === 'amount') totalCost = parseFloat((val || '').toString()) || 0;
          else if (h.includes('unit') || h.includes('uom')) unit = val;
          else if (h === 'qty' || h.includes('quantity')) quantity = parseFloat((val || '').toString()) || 0;
          else if (h.includes('cat')) category = val;
        }
        
        quantity = isNaN(quantity) ? 0 : quantity;
        unitCost = isNaN(unitCost) ? 0 : unitCost;
        totalCost = isNaN(totalCost) ? 0 : totalCost;

        if (totalCost === 0) totalCost = quantity * unitCost;

        const descUpper = String(itemDesc || '').toUpperCase();
        if (descUpper.includes('TOTAL PROJECT COST') || descUpper === 'GRAND TOTAL' || descUpper === 'TOTAL') {
          continue;
        }

        if (itemDesc && (quantity > 0 || totalCost > 0)) {
          parsedItems.push({
            projectId,
            itemCode: String(itemCode || ''),
            description: String(itemDesc || ''),
            category: String(category || ''),
            unit: String(unit || ''),
            quantity: quantity,
            unitCost: unitCost,
            totalCost: totalCost,
            status: 'PENDING'
          });
        }
      }
    }
  }

  if (parsedItems.length === 0) throw new Error('No benchmark line items were found. The current benchmark was left unchanged.');

  const contentType = boqFile.type || (boqFile.name.toLowerCase().endsWith('.xls')
    ? 'application/vnd.ms-excel'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const storedFile = await put(`projects/${projectId}/procurement-benchmark/${randomUUID()}-${boqFile.name}`, buffer, {
    contentType,
    module: 'PROJECT_MANAGEMENT',
    projectId,
    uploadedBy: actor.id,
  });

  await prisma.$transaction(async tx => {
    await assertProcurementBenchmarkReplaceable(tx as unknown as Prisma.TransactionClient, projectId);
    await tx.procurementBenchmarkItem.deleteMany({ where: { projectId } });
    await tx.procurementBenchmarkItem.createMany({ data: parsedItems });
    await tx.project.update({ where: { id: projectId }, data: { contractAmountVATInclusive: true } });
    await tx.document.create({ data: {
      projectId,
      title: `Procurement Benchmark: ${boqFile.name}`,
      category: 'PROCUREMENT_BENCHMARK_SOURCE',
      fileUrl: storedFile.url,
      fileType: contentType,
      fileSize: buffer.length,
      uploaderId: actor.id,
    } });
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function createMaterialRequest(formData: FormData) {
  const projectId = formData.get('projectId') as string;
  const actor = await requireMaterialRequestCreation(projectId);
  const requestedById = formData.get('requestedById') as string;
  const description = formData.get('description') as string;
  
  // Create an MR, generating an automatic mrNumber
  const count = await prisma.materialRequest.count();
  const mrNumber = `MR-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;

  await prisma.materialRequest.create({
    data: {
      mrNumber,
      projectId,
      requesterId: requestedById,
      preparerId: actor.id,
      status: 'DRAFT',
      remarks: description,
    }
  });

  revalidatePath('/material-requests');
  revalidatePath('/');
}

// Generate an MRF from selected Consolidated BOQ items
export async function generateMRFFromConsolidated(data: {
  projectId: string;
  requesterId: string;
  purpose: string;
  priority: string;
  locationOfUse: string;
  dateNeeded: string;
  remarks: string;
  items: { consolidatedBoqItemId: string; quantity: number; breakdownData?: any }[];
}) {
  const { projectId, requesterId, purpose, priority, locationOfUse, dateNeeded, remarks, items } = data;
  const actor = await requireMaterialRequestCreation(projectId);

  if (!items || items.length === 0 || items.length > 200) {
    throw new Error('No items selected for the material request.');
  }
  if (items.some(item => !Number.isFinite(item.quantity) || item.quantity <= 0)) throw new Error('Material request quantities must be positive finite numbers.');
  const materialIds = [...new Set(items.map(item => item.consolidatedBoqItemId))];
  if (await prisma.consolidatedBOQItem.count({ where: { projectId, id: { in: materialIds } } }) !== materialIds.length) throw new Error('Every requested material must belong to the intended project.');

  // Assign a temporary Draft ID until it passes AI Validation
  const mrNumber = `DRAFT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const mr = await prisma.materialRequest.create({
    data: {
      mrNumber,
      projectId,
      requesterId,
      preparerId: actor.id,
      status: 'DRAFT',
      purpose,
      priority,
      locationOfUse,
      remarks,
      dateNeeded: dateNeeded ? new Date(dateNeeded) : null,
      items: {
        create: items.map(item => ({
          consolidatedBoqItemId: item.consolidatedBoqItemId,
          quantity: item.quantity,
          breakdownData: item.breakdownData || null,
        })),
      },
    },
  });

  revalidatePath('/material-requests');
  revalidatePath(`/projects/${projectId}`);
  return mr.id;
}

// AI Validation for MRF (deterministic checks)
export async function runMRFAIValidation(mrId: string) {
  await requireMaterialRequestActor(mrId, ['canEditDraft', 'canSubmit']);
  const mr = await prisma.materialRequest.findUnique({
    where: { id: mrId },
    include: {
      items: {
        include: {
          consolidatedBoqItem: true,
        },
      },
      project: true,
    },
  });

  if (!mr) throw new Error('Material Request not found');
  if (!['DRAFT', 'AI_CHECKING', 'RETURNED'].includes(mr.status)) throw new Error('Only a draft or returned material request can be checked. Submitted quantities stay reserved.');

  const findings: string[] = [];
  let riskLevel = 'LOW';

  // Optimization: Fetch all duplicate items across other MRs in one query to prevent Vercel timeouts (N+1 query fix)
  const consolidatedBoqItemIds = mr.items
    .map(i => i.consolidatedBoqItemId)
    .filter((id): id is string => id !== null);

  const allExistingMRItems = await prisma.materialRequestItem.findMany({
    where: {
      consolidatedBoqItemId: { in: consolidatedBoqItemIds },
      mr: {
        projectId: mr.projectId,
        status: { notIn: ['DRAFT', 'AI_CHECKING', 'CANCELLED', 'REJECTED'] },
        id: { not: mrId },
      },
    },
  });

  for (const item of mr.items) {
    if (!item.consolidatedBoqItem) continue;
    const boqItem = item.consolidatedBoqItem;
    const allowedQuantity = materialQuantity(boqItem);
    const boqBalance = allowedQuantity - boqItem.deliveredQty;

    // Check if requested quantity exceeds BOQ balance
    if (item.quantity > boqBalance) {
      findings.push(
        `⚠️ OVER-REQUEST: "${boqItem.description}" — Requested ${item.quantity} ${boqItem.unit}, but BOQ balance is only ${boqBalance.toFixed(2)} ${boqItem.unit}.`
      );
      riskLevel = 'HIGH';
    }

    // Check if requested quantity exceeds total BOQ quantity
    if (item.quantity > allowedQuantity) {
      findings.push(
        `🚨 EXCEEDS BOQ: "${boqItem.description}" — Requested ${item.quantity} ${boqItem.unit} exceeds total revised BOQ quantity of ${allowedQuantity} ${boqItem.unit}.`
      );
      riskLevel = 'CRITICAL';
    }

    // Check for zero or negative quantities
    if (item.quantity <= 0) {
      findings.push(
        `❌ INVALID QTY: "${boqItem.description}" — Requested quantity is ${item.quantity}.`
      );
      riskLevel = 'CRITICAL';
    }

    // Check for duplicate requests of same item in other pending MRs
    const existingMRItems = allExistingMRItems.filter(
      (i) => i.consolidatedBoqItemId === item.consolidatedBoqItemId
    );

    if (existingMRItems.length > 0) {
      const totalAlreadyRequested = existingMRItems.reduce((sum, i) => sum + i.quantity, 0);
      findings.push(
        `🔄 DUPLICATE ALERT: "${boqItem.description}" — ${totalAlreadyRequested} ${boqItem.unit} already requested in ${existingMRItems.length} other active MR(s).`
      );
      if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
    }
  }

  if (findings.length === 0) {
    findings.push('✅ All items passed validation. Quantities are within BOQ balance. No duplicates detected.');
    riskLevel = 'LOW';
  }

  // If it passes (not CRITICAL) and still has a DRAFT number, assign an official MRF Number
  let officialMrNumber = mr.mrNumber;
  if (riskLevel !== 'CRITICAL' && mr.mrNumber.startsWith('DRAFT-')) {
    const currentYear = new Date().getFullYear();
    const prefix = `MR-${currentYear}-`;
    
    const lastMr = await prisma.materialRequest.findFirst({
      where: { mrNumber: { startsWith: prefix } },
      orderBy: { mrNumber: 'desc' },
      select: { mrNumber: true }
    });

    let nextNumber = 1;
    if (lastMr && lastMr.mrNumber) {
      const lastInt = parseInt(lastMr.mrNumber.substring(prefix.length), 10);
      if (!isNaN(lastInt)) {
        nextNumber = lastInt + 1;
      }
    }
    
    officialMrNumber = `${prefix}${nextNumber.toString().padStart(4, '0')}`;
  }

  // Update the MR with AI validation results
  const updated = await prisma.materialRequest.updateMany({
    where: { id: mrId, status: mr.status },
    data: {
      status: mr.status === 'RETURNED' ? 'RETURNED' : 'AI_CHECKING',
      aiValidationRisk: riskLevel,
      aiValidationNotes: findings.join('\n'),
      mrNumber: officialMrNumber,
    },
  });
  if (updated.count !== 1) throw new Error('The request changed during checking. Refresh before continuing.');

  revalidatePath(`/material-requests/${mrId}`);
  revalidatePath('/material-requests');
  return { riskLevel, findings };
}

// Update MR status (workflow transitions)
export async function updateMRStatus(mrId: string, newStatus: string, userId?: string) {
  // Keep the legacy argument for callers; identity always comes from the session.
  void userId;
  const capability: Record<string, string> = { SUBMITTED: 'canSubmit', FOR_REVIEW: 'canReview', APPROVED: 'canApprove', REJECTED: 'canReject', RETURNED: 'canReturnForCorrection', CANCELLED: 'canCancel' };
  if (!capability[newStatus]) throw new Error('Unsupported material request action.');
  const actor = await requireMaterialRequestActor(mrId, [capability[newStatus]]);
  await prisma.$transaction(async rawTx => {
    const tx = rawTx as unknown as Prisma.TransactionClient;
    const mr = await tx.materialRequest.findUnique({ where: { id: mrId } });
    if (!mr) throw new Error('Material request not found.');
    assertMaterialRequestTransition(mr.status, newStatus);
    if (newStatus === 'APPROVED' && (mr.preparerId || mr.requesterId) === actor.id && !['SUPER_ADMIN', 'ADMIN'].includes(actor.role)) throw new Error('Self-approval is prohibited. Ask an authorized independent approver to review this request.');
    await assertMaterialRequestAllowance(tx, mr.projectId, mrId, newStatus);
    const updateData: Prisma.MaterialRequestUncheckedUpdateManyInput = { status: newStatus };
    if (newStatus === 'APPROVED') updateData.approverId = actor.id;
    if (newStatus === 'FOR_REVIEW') updateData.checkerId = actor.id;
    if (newStatus === 'SUBMITTED') updateData.preparerId = actor.id;
    const changed = await tx.materialRequest.updateMany({ where: { id: mrId, status: mr.status }, data: updateData });
    if (changed.count !== 1) throw new Error('The request changed. Refresh before retrying.');
    await tx.auditLog.create({ data: { userId: actor.id, userRole: actor.role, moduleName: 'MATERIALS_REQUEST', transactionId: mrId, actionType: 'CHANGE_STATUS', oldValue: mr.status, newValue: newStatus, remarks: `Project ${mr.projectId}` } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidatePath(`/material-requests/${mrId}`);
  revalidatePath('/material-requests');
}


export async function deleteProcurementBenchmark(projectId: string) {
  await requireProjectCapability(projectId, ['canEdit', 'canEditDraft'], 'You do not have permission to edit this project procurement benchmark.');
  await prisma.$transaction(async tx => {
    await assertProcurementBenchmarkReplaceable(tx as unknown as Prisma.TransactionClient, projectId);
    await tx.procurementBenchmarkItem.deleteMany({ where: { projectId } });
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
}

/**
 * Saves the AI Check suggestions the reviewer kept (possibly edited) on an unlocked procurement benchmark:
 * field corrections and line removals, in one transaction with an audit record. Refused when the benchmark is
 * locked, under a benchmark review, or already linked to the master material list (same guard as delete).
 */
export async function applyProcurementBenchmarkSuggestions(projectId: string, changes: Array<{ rowId: string; field: string; value: string }>) {
  const actor = await requireProjectCapability(projectId, ['canEdit', 'canEditDraft'], 'You do not have permission to edit this project procurement benchmark.');
  if (!Array.isArray(changes) || !changes.length) throw new Error('Choose at least one suggestion to save.');
  if (changes.length > 500) throw new Error('Too many changes at once.');
  const TEXT: Record<string, number> = { description: 8000, unit: 191, category: 191, itemCode: 191 };
  const MONEY = new Set(['unitCost', 'totalCost']);
  const result = await prisma.$transaction(async tx => {
    await assertProcurementBenchmarkReplaceable(tx as unknown as Prisma.TransactionClient, projectId);
    const ids = [...new Set(changes.map(change => String(change.rowId)))];
    const rows = await tx.procurementBenchmarkItem.findMany({ where: { projectId, id: { in: ids } } });
    if (rows.length !== ids.length) throw new Error('Some benchmark lines no longer exist. Run the AI Check again.');
    const updates = new Map<string, Record<string, string | number>>();
    const removals = new Set<string>();
    for (const change of changes) {
      const id = String(change.rowId), field = String(change.field), value = String(change.value ?? '').trim();
      if (field === 'remove') { removals.add(id); continue; }
      let parsed: string | number;
      if (TEXT[field]) {
        if ((field === 'description' || field === 'unit') && !value) throw new Error(`The ${field} cannot be empty.`);
        if (value.length > TEXT[field]) throw new Error(`The ${field} is too long.`);
        parsed = value;
      } else if (MONEY.has(field)) {
        const amount = Number(value.replace(/[₱,\s]/g, ''));
        if (!Number.isFinite(amount) || amount < 0) throw new Error(`Enter a valid ${field === 'unitCost' ? 'unit cost' : 'total'} (a number, 0 or more).`);
        parsed = amount;
      } else throw new Error('This change is not supported.');
      updates.set(id, { ...(updates.get(id) ?? {}), [field]: parsed });
    }
    for (const id of removals) updates.delete(id);
    for (const [id, data] of updates) await tx.procurementBenchmarkItem.update({ where: { id }, data });
    if (removals.size) await tx.procurementBenchmarkItem.deleteMany({ where: { projectId, id: { in: [...removals] } } });
    await tx.auditLog.create({ data: {
      userId: actor.id, userRole: actor.role, moduleName: 'PROJECT_MANAGEMENT', transactionId: projectId, actionType: 'PROCUREMENT_BENCHMARK_AI_SUGGESTIONS_APPLIED',
      oldValue: JSON.stringify(rows.map(row => ({ id: row.id, itemCode: row.itemCode, category: row.category, description: row.description, unit: row.unit, unitCost: row.unitCost, totalCost: row.totalCost }))),
      newValue: JSON.stringify({ updated: Object.fromEntries(updates), removed: [...removals] }),
    } });
    return { updated: updates.size, removed: removals.size };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidatePath(`/projects/${projectId}`);
  return result;
}

/**
 * Saves the reviewer's benchmark-line → BOQ-item links (usually AI Check suggestions, possibly changed).
 * A null boqItemId clears a link. Allowed until the master materials list is generated, since generation copies
 * the links into its BOQ mappings.
 */
export async function saveProcurementBenchmarkBoqLinks(projectId: string, links: Array<{ rowId: string; boqItemId: string | null }>) {
  const actor = await requireProjectCapability(projectId, ['canEdit', 'canEditDraft'], 'You do not have permission to edit this project procurement benchmark.');
  if (!Array.isArray(links) || !links.length) throw new Error('Choose at least one BOQ link to save.');
  if (links.length > 1500) throw new Error('Too many links at once.');
  const result = await prisma.$transaction(async tx => {
    // Links can be saved before and after the master materials list is generated: generated mappings are updated
    // below so the list keeps the benchmark's BOQ links. Reviewed-benchmark mappings follow their own review.
    const rowIds = [...new Set(links.map(link => String(link.rowId)))];
    const rows = await tx.procurementBenchmarkItem.findMany({ where: { projectId, id: { in: rowIds } }, select: { id: true } });
    if (rows.length !== rowIds.length) throw new Error('Some benchmark lines no longer exist. Run the AI Check again.');
    const boqIds = [...new Set(links.map(link => link.boqItemId).filter((id): id is string => typeof id === 'string' && !!id))];
    const boq = boqIds.length ? await tx.awardedBOQItem.findMany({ where: { projectId, id: { in: boqIds } }, select: { id: true } }) : [];
    if (boq.length !== boqIds.length) throw new Error('A chosen BOQ item does not belong to this project.');
    const existingIds = new Set((await tx.procurementBenchmarkItem.findMany({ where: { projectId }, select: { id: true } })).map(row => row.id));
    const current = await readBenchmarkBoqLinks(tx as unknown as Prisma.TransactionClient, projectId);
    const next = Object.fromEntries(Object.entries(current).filter(([rowId]) => existingIds.has(rowId)));
    for (const link of links) { if (link.boqItemId) next[String(link.rowId)] = link.boqItemId; else delete next[String(link.rowId)]; }
    await tx.auditLog.create({ data: {
      userId: actor.id, userRole: actor.role, moduleName: 'PROJECT_MANAGEMENT', transactionId: projectId, actionType: BENCHMARK_BOQ_LINKS_ACTION,
      oldValue: JSON.stringify({ links: current }), newValue: JSON.stringify({ links: next }),
    } });
    let materialsUpdated = 0;
    for (const link of links) {
      const updated = await tx.bOQMapping.updateMany({
        where: { procurementBenchmarkItemId: String(link.rowId), mappingType: { not: 'BENCHMARK_REVIEW' }, consolidatedBoqItem: { projectId } },
        data: { awardedBoqItemId: link.boqItemId || null },
      });
      materialsUpdated += updated.count;
    }
    return { saved: links.length, linked: Object.keys(next).length, materialsUpdated };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidatePath(`/projects/${projectId}`);
  return result;
}

export async function lockProjectBOQ(projectId: string) {
  const draftVersion = await prisma.projectBOQVersion.findFirst({ where: { projectId, status: 'DRAFT' } });
  if (draftVersion) {
    throw new Error('Review the draft BOQ and use Approve & Lock BOQ before locking this project.');
  }
  await prisma.project.update({
    where: { id: projectId },
    data: { boqLocked: true }
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/projects');
}

export async function toggleConsolidatedBOQLock(id: string, lockState: boolean) {
  await requireProjectCapability(id, lockState ? ['canApprove', 'canLock'] : ['canUnlockWithAuthorization'], 'You do not have permission to change this project material-list lock.');
  await prisma.$transaction(async tx => {
    const review = await tx.auditLog.findFirst({ where: { moduleName: 'PROJECT_MANAGEMENT', transactionId: id, actionType: 'PROCUREMENT_BENCHMARK_REVIEW_STATE' }, select: { id: true } });
    if (review) throw new Error('This project uses reviewed benchmark materials. Use its controlled review workflow; the legacy lock action cannot change its approved state.');
    await tx.project.update({ where: { id }, data: { consolidatedBOQLocked: lockState } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidatePath(`/projects/${id}`);
}

export async function lockProcurementBenchmark(projectId: string) {
  await requireProjectCapability(projectId, ['canApprove', 'canLock'], 'You do not have permission to approve or lock this project procurement benchmark.');
  await prisma.$transaction(async tx => {
    const reviewState = await tx.auditLog.findFirst({
      where: { moduleName: 'PROJECT_MANAGEMENT', transactionId: projectId, actionType: 'PROCUREMENT_BENCHMARK_REVIEW_STATE' },
      select: { id: true },
    });
    if (reviewState) throw new Error('A benchmark review is saved for this project. Use its review and approval workflow; the legacy lock action cannot change its state.');
    await tx.project.update({ where: { id: projectId }, data: { procurementBenchmarkLocked: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId }
  });

  if (!project) throw new Error('Project not found');

  // 1. Delete the physical file if it exists in description
  const match = project.description?.match(/BOQ File Uploaded: (.*)/);
  if (match && match[1]) {
    const fileName = match[1].trim();
    const filePath = path.join(process.cwd(), 'public', 'uploads', 'boq', fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // 2. Delete the entire project (Cascades to AwardedBOQItems, etc.)
  await prisma.project.delete({
    where: { id: projectId }
  });

  revalidatePath('/projects');
}

export async function getLotBreakdowns(boqItemId: string) {
  return await prisma.bOQLotBreakdown.findMany({
    where: { boqItemId },
  });
}

export async function saveLotBreakdown(data: any) {
  const breakdown = await prisma.bOQLotBreakdown.create({
    data: {
      boqItemId: data.boqItemId,
      description: data.description,
      weightPercentage: 0
    }
  });
  return { ...breakdown, ...data };
}

export async function deleteLotBreakdown(breakdownId: string) {
  await prisma.bOQLotBreakdown.delete({
    where: { id: breakdownId }
  });
  return { success: true };
}

import { convertExcelToHtml } from '@/lib/excel/excelToHtml';

export async function getExactExcelHtml(projectId: string) {
  await requireProjectTemplateView(projectId);
  const templateDoc = await prisma.document.findFirst({
    where: { projectId, category: 'AWARDED_BOQ_TEMPLATE' },
    orderBy: { createdAt: 'desc' }
  });

  if (!templateDoc) {
    throw new Error('No Awarded BOQ template found for this project.');
  }

  return await convertExcelToHtml(await readStoredUpload(templateDoc.fileUrl));
}

export async function downloadRawOriginalBOQTemplate(projectId: string) {
  await requireProjectTemplateView(projectId);
  const templateDoc = await prisma.document.findFirst({
    where: { projectId, category: 'AWARDED_BOQ_TEMPLATE' },
    orderBy: { createdAt: 'desc' }
  });

  if (!templateDoc) {
    throw new Error('No Awarded BOQ template found for this project.');
  }

  const buffer = await readStoredUpload(templateDoc.fileUrl);
  const base64String = buffer.toString('base64');
  return base64String;
}

import * as jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.ONLYOFFICE_JWT_SECRET || 'super-secret-key-for-dev';

export async function getAwardedBOQOnlyofficeConfig(projectId: string, baseUrl: string) {
  await requireProjectTemplateView(projectId);
  const templateDoc = await prisma.document.findFirst({
    where: { projectId, category: 'AWARDED_BOQ_TEMPLATE' },
    orderBy: { createdAt: 'desc' }
  });

  if (!templateDoc) {
    throw new Error('No Awarded BOQ template found for this project.');
  }

  const documentKey = `awarded-boq-${projectId}-${templateDoc.id}-${Date.now()}`;
  
  // The storage helper returns a short-lived URL for private S3 objects. Keep
  // legacy relative upload paths absolute for the OnlyOffice document server.
  const storedUrl = await getStoredUploadDownloadUrl(templateDoc.fileUrl);
  const fileUrl = storedUrl.startsWith('/') ? `${baseUrl}${storedUrl}` : storedUrl;

  const config = {
    document: {
      fileType: 'xlsx',
      key: documentKey,
      title: templateDoc.title || `Awarded_BOQ_${projectId}.xlsx`,
      url: fileUrl,
      permissions: {
        edit: false,
        download: true,
      }
    },
    documentType: 'spreadsheet',
    editorConfig: {
      mode: 'view',
      user: {
        id: 'viewer',
        name: 'Viewer'
      },
      customization: {
        forcesave: false,
        autosave: false,
      }
    }
  };

  const token = jwt.sign(config, JWT_SECRET, { expiresIn: '2h' });
  
  return {
    config: { ...config, token },
    documentServerUrl: process.env.ONLYOFFICE_DOCUMENT_SERVER_URL || 'http://localhost:8080'
  };
}

export async function downloadAwardedBOQTemplate(projectId: string) {
  await requireProjectTemplateView(projectId);
  const templateDoc = await prisma.document.findFirst({
    where: { projectId, category: 'AWARDED_BOQ_TEMPLATE' },
    orderBy: { createdAt: 'desc' }
  });

  if (!templateDoc) {
    throw new Error('No Awarded BOQ template found for this project.');
  }

  const sourceBuffer = await readStoredUpload(templateDoc.fileUrl);
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(sourceBuffer as any);

  const sheet = workbook.worksheets[0];
  
  const awardedItems = await prisma.awardedBOQItem.findMany({
    where: { projectId }
  });

  const itemMap = new Map();
  awardedItems.forEach(item => {
    const descClean = item.description.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    itemMap.set(descClean, item);
  });

  let headerRowIndex = -1;
  let descColIndex = -1;
  let qtyColIndex = -1;
  let costColIndex = -1;

  sheet.eachRow((row, rowNumber) => {
    if (headerRowIndex === -1) {
      let hasDesc = false;
      row.eachCell((cell, colNumber) => {
        const val = cell.text?.toLowerCase() || '';
        if (val.includes('desc') || val.includes('item')) {
          hasDesc = true;
          descColIndex = colNumber;
        } else if (val.includes('qty') || val.includes('quantity')) {
          qtyColIndex = colNumber;
        } else if (val.includes('unit cost') || val.includes('price')) {
          costColIndex = colNumber;
        }
      });
      if (hasDesc) {
        headerRowIndex = rowNumber;
      }
    } else {
      if (descColIndex !== -1) {
        const descCell = row.getCell(descColIndex);
        const descVal = descCell.text?.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        
        if (descVal) {
          let matchedItem = itemMap.get(descVal);
          if (!matchedItem) {
             for (const [key, item] of itemMap.entries()) {
               if (descVal.length > 10 && key.length > 10 && Math.abs(descVal.length - key.length) <= 2) {
                 if (descVal.startsWith(key.substring(0, 10)) || key.startsWith(descVal.substring(0, 10))) {
                   matchedItem = item;
                   break;
                 }
               }
             }
          }

          if (matchedItem) {
            if (qtyColIndex !== -1) {
              row.getCell(qtyColIndex).value = matchedItem.quantity;
            }
            if (costColIndex !== -1) {
              row.getCell(costColIndex).value = matchedItem.combinedUnitCost;
            }
            row.commit();
          }
        }
      }
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString('base64');
}
