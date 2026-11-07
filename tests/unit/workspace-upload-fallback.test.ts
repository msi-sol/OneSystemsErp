import ExcelJS from 'exceljs';
import { parseWorkspaceWorkbook } from '@/lib/boq/workspace-parser';
import { nativeExtractDocument } from '@/lib/boq/workspace-native-document';
import { askUploadHelper } from '@/lib/boq/workspace-upload-ai';
import { WorkspaceError } from '@/lib/boq/workspace-types';

jest.mock('@/lib/boq/workspace-native-document', () => ({ nativeExtractDocument: jest.fn() }));
jest.mock('@/lib/boq/workspace-upload-ai', () => ({ askUploadHelper: jest.fn() }));
const helper = askUploadHelper as jest.Mock;
const native = nativeExtractDocument as jest.Mock;
const context = 'boq:reviewer:new';
const mapping = { headerRow: 1, itemCode: 1, description: 2, unit: 3, quantity: 4, unitCost: 5, amount: 6 };
async function workbook(custom = false) {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Scope');
  sheet.addRow(custom ? ['Bilang', 'Saklaw', 'Sukat', 'Dami', 'Presyo', 'Kabuuan'] : ['Item code', 'Description', 'Unit', 'Quantity', 'Unit cost', 'Amount']);
  sheet.addRow(['A1', 'Cement bags', 'bag', 3, 10, 30]);
  sheet.addRow(['A2', 'Steel bars', 'pc', 2, 20, 40]);
  return Buffer.from(await book.xlsx.writeBuffer());
}
const reading = { projectName: 'Local sample', contractAmount: 70, items: [
  { section: 'Materials', itemCode: 'A1', description: 'Cement bags', unit: 'bag', quantity: 3, unitCost: 10, amount: 30, sourceReference: 'Page 1 row 1' },
  { section: 'Materials', itemCode: 'A2', description: 'Steel bars', unit: 'pc', quantity: 2, unitCost: 20, amount: 40, sourceReference: 'Page 1 row 2' },
] };

describe('built-in first upload reading', () => {
  const secret = process.env.AUTH_SECRET;
  beforeAll(() => { process.env.AUTH_SECRET = 'local-test-document-signing-key'; });
  afterAll(() => { if (secret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = secret; });
  beforeEach(() => { jest.clearAllMocks(); native.mockResolvedValue(null); });

  it('does not call AI for a recognized workbook', async () => {
    const result = await parseWorkspaceWorkbook({ buffer: await workbook(), fileName: 'standard.xlsx', documentContext: context });
    expect(result.analysis.readingMethod).toBe('builtin');
    expect(result.analysis.total).toBe('70.00'); expect(helper).not.toHaveBeenCalled();
  });
  it('uses AI only to map an unfamiliar workbook and reads every actual source row itself', async () => {
    helper.mockResolvedValue({ confident: true, sheetName: 'Scope', mapping });
    const buffer = await workbook(true);
    const result = await parseWorkspaceWorkbook({ buffer, fileName: 'custom.xlsx', documentContext: context });
    expect(helper).toHaveBeenCalledTimes(1);
    expect(result.analysis.readingMethod).toBe('openai-assisted'); expect(result.analysis.errors).toEqual([]);
    expect(result.items.map(row => row.amount)).toEqual([30, 40]); expect(result.analysis.total).toBe('70.00');
    const confirmed = await parseWorkspaceWorkbook({ buffer, fileName: 'custom.xlsx', documentContext: context, selectedSheet: result.analysis.selectedSheet, mapping: result.analysis.mapping });
    expect(confirmed.items).toEqual(result.items); expect(helper).toHaveBeenCalledTimes(1);
  });
  it('preserves manual mapping and financial errors instead of asking AI to repair values', async () => {
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('BOQ');
    sheet.addRow(['Item code', 'Description', 'Unit', 'Quantity', 'Unit cost', 'Amount']);
    sheet.addRow(['A1', 'Missing amount', 'bag', 2, 10, null]);
    const buffer = Buffer.from(await book.xlsx.writeBuffer());
    const result = await parseWorkspaceWorkbook({ buffer, fileName: 'missing.xlsx', documentContext: context, mapping, selectedSheet: 'BOQ' });
    expect(result.analysis.errors.some(issue => issue.field === 'amount')).toBe(true); expect(helper).not.toHaveBeenCalled();
  });
  it('keeps manual correction available if the helper fails or declines the layout', async () => {
    helper.mockRejectedValue(new WorkspaceError('OpenAI upload helper unavailable.', 503));
    const result = await parseWorkspaceWorkbook({ buffer: await workbook(true), fileName: 'custom.xlsx', documentContext: context });
    expect(result.analysis.errors.length).toBeGreaterThan(0); expect(result.items).toEqual([]);
    expect(result.analysis.warnings).toContainEqual(expect.objectContaining({ field: 'OpenAI fallback', message: 'OpenAI upload helper unavailable.' }));
    helper.mockResolvedValue({ confident: false, sheetName: null, mapping: null });
    const declined = await parseWorkspaceWorkbook({ buffer: await workbook(true), fileName: 'custom.xlsx', documentContext: context });
    expect(declined.items).toEqual([]);
  });
  it('does not send invalid files or context-free sources to AI', async () => {
    await expect(parseWorkspaceWorkbook({ buffer: Buffer.from('not a workbook'), fileName: 'bad.xlsx', documentContext: context })).rejects.toThrow();
    await parseWorkspaceWorkbook({ buffer: await workbook(true), fileName: 'custom.xlsx' });
    expect(helper).not.toHaveBeenCalled();
  });
  it('uses the native document reading without AI and signs its reader identity', async () => {
    native.mockResolvedValue(reading);
    const options = { buffer: Buffer.from('%PDF-1.7\nlocal sample'), fileName: 'table.pdf', documentContext: context };
    const result = await parseWorkspaceWorkbook(options);
    expect(result.analysis.readingMethod).toBe('builtin'); expect(helper).not.toHaveBeenCalled();
    native.mockRejectedValue(new Error('must not read twice'));
    const reused = await parseWorkspaceWorkbook({ ...options, documentToken: result.analysis.documentToken });
    expect(reused.analysis.readingMethod).toBe('builtin'); expect(reused.analysis.total).toBe('70.00'); expect(native).toHaveBeenCalledTimes(1);
  });
  it('falls back to OpenAI for an unrecognized document, then reuses its signed complete reading', async () => {
    helper.mockResolvedValue(reading);
    const options = { buffer: Buffer.from('%PDF-1.7\nlocal sample'), fileName: 'custom.pdf', documentContext: context };
    const result = await parseWorkspaceWorkbook(options);
    expect(native).toHaveBeenCalledTimes(1); expect(helper).toHaveBeenCalledTimes(1);
    expect(result.analysis.readingMethod).toBe('openai-assisted'); expect(result.analysis.total).toBe('70.00');
    await parseWorkspaceWorkbook({ ...options, documentToken: result.analysis.documentToken });
    expect(helper).toHaveBeenCalledTimes(1);
  });
});
