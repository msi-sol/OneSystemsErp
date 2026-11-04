jest.mock('@/lib/prisma', () => ({ prisma: { workbookExtractionAudit: { createMany: jest.fn() } } }));

import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { parseWorkbook } from '@/lib/excel/excel-workbook-parser';

beforeEach(() => {
  jest.resetAllMocks();
  (prisma.workbookExtractionAudit.createMany as jest.Mock).mockResolvedValue({ count: 2 });
});

function savedAudits(): Prisma.WorkbookExtractionAuditCreateManyInput[] {
  return (prisma.workbookExtractionAudit.createMany as jest.Mock).mock.calls[0][0].data;
}

test('parses a real workbook and preserves layout, styled cells, formulas and linkage in existing audit fields', async () => {
  const original = new ExcelJS.Workbook();
  const sheet = original.addWorksheet('BOQ_DATA_ENTRY');
  sheet.getColumn('B').width = 25;
  sheet.getRow(14).height = 30;
  sheet.mergeCells('B7:C7');
  sheet.getCell('B7').value = 'Project';
  sheet.getCell('B14').value = 'Concrete';
  sheet.getCell('B14').font = { bold: true };
  sheet.getCell('C14').value = 0;
  sheet.getCell('J14').value = { formula: '2*2', result: 4 };
  sheet.getCell('J14').numFmt = '#,##0.00';
  const bytes = Buffer.from(await original.xlsx.writeBuffer());
  const originalBytes = Buffer.from(bytes);

  const result = await parseWorkbook(bytes, 'upload-1', 'project-1');

  expect(bytes).toEqual(originalBytes);
  expect(result.layout.columns.B).toBe(25);
  expect(result.layout.rows['14']).toBe(30);
  expect(result.workbook.getWorksheet('BOQ_DATA_ENTRY')?.getCell('J14').value).toEqual({ formula: '2*2', result: 4 });
  const audits = savedAudits();
  expect(audits.every(audit => audit.uploadedWorkbookFileId === 'upload-1' && audit.projectId === 'project-1' && audit.status === 'SUCCESS')).toBe(true);
  expect(Object.keys(audits[0]).sort()).toEqual(['action', 'detailsJson', 'projectId', 'status', 'uploadedWorkbookFileId']);
  expect(audits[0].action).toBe('WORKBOOK_LAYOUT_SNAPSHOT');
  const layout = JSON.parse(audits[0].detailsJson!);
  expect(JSON.parse(layout.columnWidthsJson).B).toBe(25);
  expect(JSON.parse(layout.rowHeightsJson)['14']).toBe(30);
  expect(JSON.parse(layout.mergedCellsJson)).toEqual(result.layout.merges);
  expect(result.layout.merges).toHaveLength(1);
  const cells = audits.slice(1).flatMap(audit => JSON.parse(audit.detailsJson!).cells);
  expect(cells).toHaveLength(result.cellCount);
  expect(cells).toEqual(expect.arrayContaining([
    expect.objectContaining({ cellAddress: 'B14', rawValue: 'Concrete', isEditableCell: true }),
    expect.objectContaining({ cellAddress: 'C14', rawValue: '0' }),
    expect.objectContaining({ cellAddress: 'J14', rawValue: '4', formula: '2*2', isFormulaCell: true, numberFormat: '#,##0.00' }),
    expect.objectContaining({ cellAddress: 'C7', isMerged: true, mergedRange: 'B7' }),
  ]));
  expect(JSON.parse(cells.find(cell => cell.cellAddress === 'B14').styleJson).font.bold).toBe(true);
});

test('stores every bounded cell in ordered batches without requiring absent model delegates', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('BOQ_DATA_ENTRY');
  for (let row = 1; row <= 501; row++) sheet.getCell(`P${row}`).value = row;
  const result = await parseWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()), 'upload-2', 'project-2');
  const batches = savedAudits().filter(audit => audit.action === 'WORKBOOK_CELL_SNAPSHOT').map(audit => JSON.parse(audit.detailsJson!));

  expect(prisma.workbookExtractionAudit.createMany).toHaveBeenCalledTimes(1);
  expect(result.cellCount).toBe(7500);
  expect(batches).toHaveLength(15);
  expect(batches.map(batch => batch.chunkIndex)).toEqual(Array.from({ length: 15 }, (_, index) => index));
  expect(batches.every(batch => batch.cells.length === 500)).toBe(true);
  const cells = batches.flatMap(batch => batch.cells);
  expect(cells).toEqual(expect.arrayContaining([expect.objectContaining({ cellAddress: 'P500', rawValue: '500' })]));
  expect(cells.some(cell => cell.rowNumber > 500)).toBe(false);
  expect(result.workbook.getWorksheet('BOQ_DATA_ENTRY')?.getCell('P501').value).toBe(501);
});

test('rejects missing required sheets before writing audits', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Other');
  await expect(parseWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()), 'upload-1', 'project-1')).rejects.toThrow('Missing BOQ_DATA_ENTRY');
  expect(prisma.workbookExtractionAudit.createMany).not.toHaveBeenCalled();
});

test('propagates audit persistence failure instead of reporting a successful parse', async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('BOQ_DATA_ENTRY').getCell('B14').value = 'Concrete';
  (prisma.workbookExtractionAudit.createMany as jest.Mock).mockRejectedValue(new Error('Audit write failed'));
  await expect(parseWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()), 'upload-1', 'project-1')).rejects.toThrow('Audit write failed');
});
