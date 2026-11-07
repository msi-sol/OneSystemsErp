import ExcelJS from 'exceljs';

jest.mock('pdf-parse', () => { throw new ReferenceError('DOMMatrix is not defined'); });

import { analyzeBOQWorkbook } from '@/lib/boq/workspace-parser';
import { nativeExtractDocument } from '@/lib/boq/workspace-native-document';

describe('upload isolation from unavailable PDF native libraries', () => {
  it('still analyzes Excel when importing PDF.js would fail in the deployed runtime', async () => {
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('BOQ');
    sheet.addRow(['Item code', 'Description', 'Unit', 'Quantity', 'Unit cost', 'Amount']);
    sheet.addRow(['A-1', 'Cement', 'bag', 3, 10, 30]);
    const analysis = await analyzeBOQWorkbook({ buffer: Buffer.from(await book.xlsx.writeBuffer()), fileName: 'actual.xlsx' });
    expect(analysis).toMatchObject({ itemCount: 1, total: '30.00', errors: [] });
  });
  it('lets a bounded PDF use the configured helper if the native dependency cannot load', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(nativeExtractDocument(Buffer.from('%PDF-1.4\n'), 'pdf')).resolves.toBeNull();
      expect(warning).toHaveBeenCalledWith('Built-in PDF reader is unavailable; using the upload helper.');
    } finally { warning.mockRestore(); }
  });
  it('continues rejecting invalid PDF signatures before the helper fallback', async () => {
    await expect(nativeExtractDocument(Buffer.from('<html>Not a PDF</html>'), 'pdf')).rejects.toThrow('not a valid PDF');
  });
});
