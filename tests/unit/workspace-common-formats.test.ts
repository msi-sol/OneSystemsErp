import { createHash, randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import sharp from 'sharp';
import { parseWorkspaceWorkbook } from '@/lib/boq/workspace-parser';
import { documentReadingSchema } from '@/lib/boq/workspace-document';
import { askUploadHelper } from '@/lib/boq/workspace-upload-ai';
import { WorkspaceError } from '@/lib/boq/workspace-types';
import { convertLegacyXls } from '@/lib/boq/workspace-format-conversion';

jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('xlsx', () => {
  const actual = jest.requireActual('xlsx');
  return { ...actual, read: jest.fn(actual.read) };
});
jest.mock('@/lib/boq/workspace-upload-ai', () => ({ askUploadHelper: jest.fn() }));

// The project name / contract value check (operation 'upload_project_metadata') may also call the helper when
// the file does not state them; these tests are about column mapping and values, so they count only those calls.
const readingCalls = () => (askUploadHelper as jest.Mock).mock.calls.filter(call => call[0]?.name !== 'upload_project_metadata');

const context = 'boq:format-review:new';
const reading = documentReadingSchema.parse({
  projectName: 'Format Review Project', contractAmount: 48,
  items: [{ section: 'Materials', itemCode: 'A1', description: 'Test concrete', unit: 'bag', quantity: 2, unitCost: 24, amount: 48, sourceReference: 'Page 1, row 1' }],
});
const header = ['Item Code', 'Description', 'Unit', 'Quantity', 'Unit Cost', 'Amount'];
const contentRows = [
  header,
  ['A1', 'Test concrete', 'bag', '2', '24', '48'],
];

describe('common BOQ source formats', () => {
  const previousSecret = process.env.AUTH_SECRET;
  beforeAll(() => { process.env.AUTH_SECRET = randomBytes(32).toString('hex'); });
  afterAll(() => { if (previousSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = previousSecret; });
  beforeEach(() => {
    jest.clearAllMocks();
    (askUploadHelper as jest.Mock).mockResolvedValue(reading);
  });

  it('converts actual CSV values through the built-in workbook parser and retains original hash/name', async () => {
    const source = Buffer.from('Item Code,Description,Unit,Quantity,Unit Cost,Amount\r\nA1,"Concrete, 25 MPa",m3,2,24.5,49\r\n');
    const parsed = await parseWorkspaceWorkbook({ buffer: source, fileName: 'actual.csv', documentContext: context });
    expect(parsed.analysis.fileName).toBe('actual.csv');
    expect(parsed.analysis.fileHash).toBe(createHash('sha256').update(source).digest('hex'));
    expect(parsed.analysis.total).toBe('49.00');
    expect(parsed.items[0]).toMatchObject({ itemCode: 'A1', description: 'Concrete, 25 MPa', unit: 'm3', amount: 49 });
    expect(parsed.analysis.readingMethod).toBe('builtin');
    expect(readingCalls()).toHaveLength(0);
  });

  it('converts an actual legacy XLS workbook without evaluating formulas', async () => {
    const sourceBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(sourceBook, XLSX.utils.aoa_to_sheet(contentRows), 'BOQ');
    const source = Buffer.from(XLSX.write(sourceBook, { bookType: 'xls', type: 'buffer' }));
    const parsed = await parseWorkspaceWorkbook({ buffer: source, fileName: 'legacy.xls', documentContext: context });
    expect(source.subarray(0, 8)).toEqual(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    expect(parsed.analysis.fileName).toBe('legacy.xls');
    expect(parsed.analysis.fileHash).toBe(createHash('sha256').update(source).digest('hex'));
    expect(parsed.analysis.selectedSheet).toBe('BOQ');
    expect(parsed.analysis.total).toBe('48.00');
    expect(parsed.items[0].description).toBe('Test concrete');
  });

  it('preserves legacy XLS number formats, dates, errors, and absolute cell positions', async () => {
    const sourceSheet: XLSX.WorkSheet = {
      C3: { t: 's', v: 'Item Code' },
      D3: { t: 's', v: 'Description' },
      E3: { t: 's', v: 'Unit' },
      F3: { t: 's', v: 'Quantity' },
      G3: { t: 's', v: 'Unit Cost' },
      H3: { t: 's', v: 'Amount' },
      C4: { t: 's', v: 'A1' },
      D4: { t: 's', v: 'Formatted formula value' },
      E4: { t: 's', v: 'm3' },
      F4: { t: 'n', v: 2 },
      G4: { t: 'n', v: 12.3456, z: '0.0000' },
      H4: { t: 'n', v: 24.6912, z: '#,##0.0000' },
      I4: { t: 'n', v: 3, z: '0.00' },
      J4: { t: 'e', v: 7, w: '#DIV/0!' },
      B2: { t: 'd', v: new Date('2025-02-03T00:00:00.000Z'), z: 'yyyy-mm-dd' },
      '!ref': 'B2:J4',
    };
    const sourceBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(sourceBook, sourceSheet, 'BOQ');
    const source = Buffer.from(XLSX.write(sourceBook, { bookType: 'xls', type: 'buffer', cellDates: true }));
    const converted = await convertLegacyXls(source);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(converted as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet('BOQ')!;

    expect(sheet.getCell('C3').value).toBe('Item Code');
    expect(sheet.getCell('A1').value).toBeNull();
    expect(sheet.getCell('B2').value).toBeInstanceOf(Date);
    expect(sheet.getCell('B2').numFmt).toBe('yyyy-mm-dd');
    expect(sheet.getCell('G4').value).toBe(12.3456);
    expect(sheet.getCell('G4').numFmt).toBe('0.0000');
    expect(sheet.getCell('H4').value).toBe(24.6912);
    expect(sheet.getCell('H4').numFmt).toBe('#,##0.0000');
    expect(sheet.getCell('I4').value).toBe(3);
    expect(sheet.getCell('J4').value).toEqual({ error: '#DIV/0!' });
  });

  it('preserves available cached formula values and leaves missing results missing without evaluation', async () => {
    const sourceBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(sourceBook, XLSX.utils.aoa_to_sheet([['fixture']]), 'Source');
    const source = Buffer.from(XLSX.write(sourceBook, { bookType: 'xls', type: 'buffer' }));
    const formulaSheet: XLSX.WorkSheet = {
      A1: { t: 'n', f: '2+3', v: 5, z: '0.000' },
      A2: { t: 'n', f: '1+2', z: '0.00' },
      A3: { t: 'e', f: '1/0', v: 7, w: '#DIV/0!' },
      '!ref': 'A1:A3',
    };
    (XLSX.read as jest.Mock).mockReturnValueOnce({
      SheetNames: ['Formula Results'], Sheets: { 'Formula Results': formulaSheet },
    } as XLSX.WorkBook);
    const converted = await convertLegacyXls(source);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(converted as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const output = workbook.getWorksheet('Formula Results')!;
    expect(output.getCell('A1').value).toMatchObject({ formula: '2+3', result: 5 });
    expect(output.getCell('A1').numFmt).toBe('0.000');
    expect(output.getCell('A2').value).toMatchObject({ formula: '1+2' });
    expect((output.getCell('A2').value as { result?: unknown }).result).toBeUndefined();
    expect(output.getCell('A3').value).toEqual({ formula: '1/0', result: { error: '#DIV/0!' } });
  });

  it('rejects legacy XLS worksheet ranges that exceed absolute row or column limits', async () => {
    const tooFarDown: XLSX.WorkSheet = { A10001: { t: 's', v: 'outside limit' }, '!ref': 'A10001' };
    const sourceBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(sourceBook, tooFarDown, 'Too Many Rows');
    const source = Buffer.from(XLSX.write(sourceBook, { bookType: 'xls', type: 'buffer' }));
    await expect(convertLegacyXls(source)).rejects.toThrow(/exceeds 10000 rows/i);
  });

  it('does not reinterpret an XLS date as a priced numeric amount', async () => {
    const dateRows = [
      header,
      ['A1', 'Date is not a BOQ amount', 'm3', 1, 10, new Date('2025-02-03T00:00:00.000Z')],
    ];
    const sourceBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(sourceBook, XLSX.utils.aoa_to_sheet(dateRows), 'BOQ');
    const source = Buffer.from(XLSX.write(sourceBook, { bookType: 'xls', type: 'buffer', cellDates: true }));
    const parsed = await parseWorkspaceWorkbook({ buffer: source, fileName: 'date-amount.xls', documentContext: context });
    expect(parsed.items).toHaveLength(0);
    expect(parsed.analysis.errors.some(issue => issue.field === 'amount')).toBe(true);
  });

  it('converts TSV input while preserving the original source identity', async () => {
    const source = Buffer.from('Item Code\tDescription\tUnit\tQuantity\tUnit Cost\tAmount\nA1\tTest concrete\tbag\t2\t24\t48\n');
    const parsed = await parseWorkspaceWorkbook({ buffer: source, fileName: 'actual.tsv', documentContext: context });
    expect(parsed.analysis.fileName).toBe('actual.tsv');
    expect(parsed.analysis.fileHash).toBe(createHash('sha256').update(source).digest('hex'));
    expect(parsed.analysis.total).toBe('48.00');
    expect(readingCalls()).toHaveLength(0);
  });

  it('rejects a corrupt legacy workbook instead of handing it to AI', async () => {
    await expect(parseWorkspaceWorkbook({ buffer: Buffer.from('not a workbook'), fileName: 'broken.xls', documentContext: context }))
      .rejects.toBeInstanceOf(WorkspaceError);
    expect(readingCalls()).toHaveLength(0);
  });

  it('extracts plain UTF-8 text with the helper and verifies the signed reading on confirm reread', async () => {
    const source = Buffer.from('Project: Format Review Project\nA1 Test concrete bag quantity 2 amount 48');
    const analyzed = await parseWorkspaceWorkbook({ buffer: source, fileName: 'schedule.txt', documentContext: context });
    expect(readingCalls()).toHaveLength(1);
    expect(analyzed.analysis.fileHash).toBe(createHash('sha256').update(source).digest('hex'));
    expect(analyzed.analysis.documentToken).toBeTruthy();
    expect(analyzed.analysis.documentKind).toBe('txt');

    const confirmed = await parseWorkspaceWorkbook({
      buffer: source, fileName: 'schedule.txt', documentContext: context, documentToken: analyzed.analysis.documentToken,
      mapping: analyzed.analysis.mapping, selectedSheet: analyzed.analysis.selectedSheet,
    });
    expect(confirmed.analysis.total).toBe('48.00');
    expect(readingCalls()).toHaveLength(1);
  });

  it('sends a validated actual PNG to Responses vision and reuses its signed reading', async () => {
    const source = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const analyzed = await parseWorkspaceWorkbook({ buffer: source, fileName: 'scan.png', documentContext: context });
    expect(readingCalls()).toHaveLength(1);
    const call = readingCalls()[0][0];
    expect(call.content).toContainEqual(expect.objectContaining({
      type: 'input_image', image_url: expect.stringMatching(/^data:image\/png;base64,/), detail: 'high',
    }));
    expect(analyzed.analysis.documentKind).toBe('image');
    expect(analyzed.analysis.fileHash).toBe(createHash('sha256').update(source).digest('hex'));

    const confirmed = await parseWorkspaceWorkbook({
      buffer: source, fileName: 'scan.png', documentContext: context, documentToken: analyzed.analysis.documentToken,
    });
    expect(confirmed.analysis.total).toBe('48.00');
    expect(readingCalls()).toHaveLength(1);
  });

  it('rejects an invalid image before invoking the helper', async () => {
    await expect(parseWorkspaceWorkbook({ buffer: Buffer.from('not png'), fileName: 'scan.png', documentContext: context }))
      .rejects.toThrow(/damaged or cannot be decoded/i);
    expect(readingCalls()).toHaveLength(0);
  });
});
