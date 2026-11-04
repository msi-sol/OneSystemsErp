import ExcelJS from 'exceljs';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { extractLayout } from './excel-layout-snapshot';
import { extractStyles } from './excel-style-extractor';

interface CellSnapshot {
  uploadedWorkbookFileId: string;
  sheetName: string;
  cellAddress: string;
  rowNumber: number;
  columnLetter: string;
  rawValue: string;
  displayValue: string;
  formula: string;
  dataType: string;
  numberFormat: string | null;
  styleJson: string;
  isMerged: boolean;
  mergedRange: string | null;
  isFormulaCell: boolean;
  isEditableCell: boolean;
}

export async function parseWorkbook(
  buffer: Buffer,
  uploadedWorkbookFileId: string,
  projectId: string
) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(buffer).buffer);

  const sheet = workbook.getWorksheet('BOQ_DATA_ENTRY');
  if (!sheet) {
    throw new Error('Critical: Missing BOQ_DATA_ENTRY worksheet.');
  }

  // 1. Extract Layout
  const layout = extractLayout(sheet);

  // 2. Extract Cell Snapshots
  const cellSnapshots: CellSnapshot[] = [];
  
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      // Preserve the existing snapshot bounds: columns B:P and rows 1:500.
      if (colNumber >= 2 && colNumber <= 16 && rowNumber <= 500) {
        
        let rawValue = cell.value?.toString() || '';
        const displayValue = cell.text || '';
        let formula = cell.formula || '';
        let isFormula = !!cell.formula;

        if (typeof cell.value === 'object' && cell.value !== null) {
          if ('formula' in cell.value) {
            formula = cell.value.formula || '';
            isFormula = true;
          }
          if ('sharedFormula' in cell.value) {
            formula = cell.value.sharedFormula || '';
            isFormula = true;
          }
          if ('result' in cell.value) {
            rawValue = cell.value.result?.toString() || '';
          }
        }

        const styleData = extractStyles(cell);

        cellSnapshots.push({
          uploadedWorkbookFileId,
          sheetName: 'BOQ_DATA_ENTRY',
          cellAddress: cell.address,
          rowNumber,
          columnLetter: sheet.getColumn(colNumber).letter,
          rawValue: rawValue.substring(0, 1000), // Limit size just in case
          displayValue: displayValue.substring(0, 1000),
          formula: formula.substring(0, 1000),
          dataType: typeof cell.value,
          numberFormat: cell.numFmt || null,
          styleJson: JSON.stringify(styleData),
          isMerged: cell.isMerged,
          mergedRange: cell.master ? cell.master.address : null,
          isFormulaCell: isFormula,
          isEditableCell: isEditable(cell.address, rowNumber, colNumber)
        });
      }
    });
  });

  // Persist snapshots in the existing audit model; there are no snapshot tables.
  // Keep cell batches bounded and write the layout and all batches atomically.
  const auditEntries: Prisma.WorkbookExtractionAuditCreateManyInput[] = [{
    uploadedWorkbookFileId,
    projectId,
    action: 'WORKBOOK_LAYOUT_SNAPSHOT',
    status: 'SUCCESS',
    detailsJson: JSON.stringify({
      schemaVersion: 1,
      sheetName: sheet.name,
      columnWidthsJson: JSON.stringify(layout.columns),
      rowHeightsJson: JSON.stringify(layout.rows),
      mergedCellsJson: JSON.stringify(layout.merges),
      cellCount: cellSnapshots.length,
    }),
  }];
  const chunkSize = 500;
  for (let i = 0; i < cellSnapshots.length; i += chunkSize) {
    const chunk = cellSnapshots.slice(i, i + chunkSize);
    auditEntries.push({
      uploadedWorkbookFileId,
      projectId,
      action: 'WORKBOOK_CELL_SNAPSHOT',
      status: 'SUCCESS',
      detailsJson: JSON.stringify({ schemaVersion: 1, sheetName: sheet.name, chunkIndex: i / chunkSize, cells: chunk }),
    });
  }
  await prisma.workbookExtractionAudit.createMany({ data: auditEntries });

  return { layout, cellCount: cellSnapshots.length, workbook };
}

function isEditable(address: string, row: number, col: number): boolean {
  // B:H for item rows (14-161)
  if (row >= 14 && row <= 161 && col >= 2 && col <= 8) return true;
  // Specific percentage headers
  if (['J13', 'K13', 'L13'].includes(address)) return true;
  // Project info
  if (['C7', 'C8', 'C9'].includes(address)) return true;
  return false;
}
