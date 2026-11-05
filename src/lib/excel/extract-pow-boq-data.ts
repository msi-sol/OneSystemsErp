import ExcelJS from 'exceljs';
import { prisma } from '@/lib/prisma';
import { readStoredUpload } from '@/lib/s3';

export async function extractPowBoqData(uploadId: string, projectId: string) {
  const upload = await prisma.uploadedWorkbookFile.findUnique({
    where: { id: uploadId }
  });

  if (!upload) throw new Error('Upload not found');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await readStoredUpload(upload.storagePath) as any);

  const sheet = workbook.getWorksheet('BOQ_DATA_ENTRY') || workbook.worksheets[0];
  if (!sheet) throw new Error('Missing worksheet');

  const sections: any[] = [];
  const items: any[] = [];
  
  let currentSectionCode: string | null = null;
  let currentSectionId: string | null = null;
  let displayOrder = 1;

  // The master template puts item rows starting from row 14
  // Let's iterate down
  for (let rowNum = 14; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    const itemNoCell = row.getCell(2).text?.trim(); // B
    const descCell = row.getCell(3).text?.trim(); // C

    if (!itemNoCell && !descCell) {
      continue; // empty row
    }

    // Check if it's a section (Roman numeral like I., II., III.)
    if (itemNoCell && /^[IVXLCDM]+\.$/i.test(itemNoCell)) {
      currentSectionCode = itemNoCell;
      const sectionName = descCell || 'Unnamed Section';
      
      const section = await prisma.bOQExtractedSection.create({
        data: {
          uploadedWorkbookFileId: uploadId,
          projectId,
          sheetName: sheet.name,
          sourceRowNumber: rowNum,
          sectionCode: currentSectionCode,
          sectionName,
          displayOrder: displayOrder++
        }
      });
      currentSectionId = section.id;
      sections.push(section);
      continue;
    }

    // Otherwise, if it has a description, it's an item
    if (descCell) {
      const unit = row.getCell(4).text?.trim(); // D
      const quantity = row.getCell(5).value as number; // E
      const matCost = row.getCell(6).value as number; // F
      const labCost = row.getCell(7).value as number; // G
      const eqCost = row.getCell(8).value as number; // H

      // Direct Cost is calculated by excel (I), but we just extract
      const totalDirect = (row.getCell(9).value as any)?.result ?? row.getCell(9).value;
      const ocm = (row.getCell(10).value as any)?.result ?? row.getCell(10).value;
      const cp = (row.getCell(11).value as any)?.result ?? row.getCell(11).value;
      const vat = (row.getCell(12).value as any)?.result ?? row.getCell(12).value;
      const totalIndirect = (row.getCell(13).value as any)?.result ?? row.getCell(13).value;
      const unitCost = (row.getCell(14).value as any)?.result ?? row.getCell(14).value;
      const amount = (row.getCell(15).value as any)?.result ?? row.getCell(15).value;
      const pct = (row.getCell(16).value as any)?.result ?? row.getCell(16).value;

      // Extract formula map
      const formulaMapJson = JSON.stringify({
        I: row.getCell(9).formula,
        J: row.getCell(10).formula,
        K: row.getCell(11).formula,
        L: row.getCell(12).formula,
        M: row.getCell(13).formula,
        N: row.getCell(14).formula,
        O: row.getCell(15).formula,
        P: row.getCell(16).formula
      });

      const item = await prisma.bOQExtractedItem.create({
        data: {
          uploadedWorkbookFileId: uploadId,
          projectId,
          sectionId: currentSectionId,
          sheetName: sheet.name,
          sourceRowNumber: rowNum,
          itemNumber: itemNoCell,
          description: descCell,
          unit,
          quantity: quantity ? Number(quantity) : undefined,
          materialUnitCost: matCost ? Number(matCost) : undefined,
          laborUnitCost: labCost ? Number(labCost) : undefined,
          equipmentUnitCost: eqCost ? Number(eqCost) : undefined,
          totalDirectCost: totalDirect ? Number(totalDirect) : undefined,
          ocm: ocm ? Number(ocm) : undefined,
          cp: cp ? Number(cp) : undefined,
          vat: vat ? Number(vat) : undefined,
          totalIndirectCost: totalIndirect ? Number(totalIndirect) : undefined,
          unitCost: unitCost ? Number(unitCost) : undefined,
          amount: amount ? Number(amount) : undefined,
          percentage: pct ? Number(pct) : undefined,
          formulaMapJson
        }
      });
      items.push(item);
    }
  }

  // Update extraction status
  await prisma.uploadedWorkbookFile.update({
    where: { id: uploadId },
    data: { extractionStatus: 'COMPLETED' }
  });

  return { sections, items };
}
