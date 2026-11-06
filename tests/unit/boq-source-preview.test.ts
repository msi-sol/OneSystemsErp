import ExcelJS from 'exceljs';
import {
  previewSourceWorkbook,
  SOURCE_PREVIEW_MAX_CELL_CHARACTERS,
  SOURCE_PREVIEW_MAX_COLUMNS,
  SOURCE_PREVIEW_PAGE_SIZE,
} from '@/lib/boq/source-preview';

async function workbookBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('persisted BOQ source preview', () => {
  it('rejects malformed ZIP data as an invalid workbook', async () => {
    await expect(previewSourceWorkbook({
      buffer: Buffer.from('not a zip file'),
      fileName: 'broken.xlsx',
    })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/valid \.xlsx/i) });
  });

  it('returns stored formula result and literal without evaluating the formula', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pricing');
    sheet.addRow(['Amount']);
    sheet.addRow([{ formula: '1+1', result: 2 }]);

    const page = await previewSourceWorkbook({ buffer: await workbookBuffer(workbook), fileName: 'source.xlsx' });

    expect(page.rows[1]?.cells[0]).toMatchObject({ value: 2, formula: '=1+1' });
  });

  it('paginates physical rows, retaining annotations, subtotals, blank rows, and merged-cell context', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('BOQ');
    sheet.addRow(['Original bill', 'Merged heading']);
    sheet.mergeCells('A1:B1');
    sheet.addRow(['Item', 'Description', 'Amount']);
    sheet.addRow(['1', 'Priced work', 25]);
    sheet.addRow(['', 'Annotation: work by client', 'By Client']);
    sheet.addRow([]);
    sheet.addRow(['', 'SUBTOTAL', 25]);
    for (let row = 7; row <= 29; row += 1) sheet.addRow([String(row - 5), `Source row ${row}`, row]);
    sheet.addRow(['', 'TOTAL PROJECT COST', 48]);

    const first = await previewSourceWorkbook({ buffer: await workbookBuffer(workbook), fileName: 'source.xlsx' });
    const last = await previewSourceWorkbook({ buffer: await workbookBuffer(workbook), fileName: 'source.xlsx', offset: 25 });

    expect(first.rows).toHaveLength(SOURCE_PREVIEW_PAGE_SIZE);
    expect(first.rows[0]?.rowNumber).toBe(1);
    expect(first.rows[3]?.cells[1]?.value).toBe('Annotation: work by client');
    expect(first.rows[5]?.cells[1]?.value).toBe('SUBTOTAL');
    expect(first.rows[0]?.cells[1]).toMatchObject({ value: null, mergedInto: 'A1' });
    expect(first.mergedRanges).toContain('A1:B1');
    expect(first.hasMore).toBe(true);
    expect(first.nextOffset).toBe(25);
    expect(last.rows).toHaveLength(5);
    expect(last.rows.map((row) => row.rowNumber)).toEqual([26, 27, 28, 29, 30]);
    expect(last.rows[4]?.cells[1]?.value).toBe('TOTAL PROJECT COST');
    expect(last.hasMore).toBe(false);
    expect(last.nextOffset).toBeNull();
  });

  it('caps each page at 40 columns and each cell at 1,000 characters', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Wide');
    sheet.getCell(1, 1).value = 'Description';
    sheet.getCell(1, SOURCE_PREVIEW_MAX_COLUMNS + 5).value = 'Beyond preview';
    sheet.getCell(2, 1).value = 'x'.repeat(SOURCE_PREVIEW_MAX_CELL_CHARACTERS + 500);

    const page = await previewSourceWorkbook({ buffer: await workbookBuffer(workbook), fileName: 'wide.xlsx' });

    expect(page.columns).toHaveLength(SOURCE_PREVIEW_MAX_COLUMNS);
    expect(page.rows[0]?.cells).toHaveLength(SOURCE_PREVIEW_MAX_COLUMNS);
    expect(page.columnsTruncated).toBe(true);
    expect(page.sheets[0]).toMatchObject({ columnCount: SOURCE_PREVIEW_MAX_COLUMNS + 5, columnsTruncated: true });
    expect(page.rows[1]?.cells[0]?.value).toHaveLength(SOURCE_PREVIEW_MAX_CELL_CHARACTERS);
    expect(page.rows[1]?.cells[0]?.truncated).toBe(true);
  });

  it('requires an exact source sheet and a valid in-range row offset', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('BOQ').addRow(['Item']);
    const buffer = await workbookBuffer(workbook);

    await expect(previewSourceWorkbook({ buffer, fileName: 'source.xlsx', sheetName: 'Other' }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/sheet was not found/i) });
    await expect(previewSourceWorkbook({ buffer, fileName: 'source.xlsx', offset: -1 }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/offset/i) });
    await expect(previewSourceWorkbook({ buffer, fileName: 'source.xlsx', offset: 2 }))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/past the end/i) });
  });

  it('states the unsupported PDF and DOCX preview path explicitly', async () => {
    for (const fileName of ['source.pdf', 'source.docx']) {
      await expect(previewSourceWorkbook({ buffer: Buffer.from(''), fileName }))
        .rejects.toMatchObject({ status: 415, message: expect.stringMatching(/download the original/i) });
    }
  });
});
