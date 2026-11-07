import JSZip from 'jszip';
import { PDFParse } from 'pdf-parse';
import { nativeExtractDocument } from '@/lib/boq/workspace-native-document';

jest.mock('pdf-parse', () => ({ PDFParse: jest.fn() }));

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const cell = (text: string) => `<w:tc>${paragraph(text)}</w:tc>`;
const row = (cells: string[]) => `<w:tr>${cells.map(cell).join('')}</w:tr>`;

async function docx(documentXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file('word/document.xml', documentXml);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

const tableXml = (rows: string[]) => `<w:tbl>${rows.join('')}</w:tbl>`;
const header = ['Item No.', 'Description', 'Unit', 'Qty', 'Unit Rate', 'Amount'];

describe('native document reading', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads DOCX table values and explicit document metadata without calculating or merging rows', async () => {
    const source = await docx(`<w:document xmlns:w="${W}"><w:body>${paragraph('Project Name: Riverside Clinic')}${paragraph('Contract Amount: PHP 1,234.00')}${tableXml([
      row(header), row(['A-1', 'Concrete mix 20 MPa', 'm3', '2.5', '100.00', '250.00']), row(['A-2', 'Concrete mix 20 MPa', 'bag', '8', '', '80.00']),
    ])}</w:body></w:document>`);

    await expect(nativeExtractDocument(source, 'docx')).resolves.toEqual({
      projectName: 'Riverside Clinic', contractAmount: 1234,
      items: [
        { section: null, itemCode: 'A-1', description: 'Concrete mix 20 MPa', unit: 'm3', quantity: 2.5, unitCost: 100, amount: 250, sourceReference: 'Table 1, row 2' },
        { section: null, itemCode: 'A-2', description: 'Concrete mix 20 MPa', unit: 'bag', quantity: 8, unitCost: null, amount: 80, sourceReference: 'Table 1, row 3' },
      ],
    });
  });

  it('carries a section heading row into later native table items', async () => {
    const source = await docx(`<w:document xmlns:w="${W}"><w:body>${tableXml([
      row(header), row(['', 'Concrete Works', '', '', '', '']), row(['C-1', 'Ready-mix concrete', 'm3', '1', '500', '500']),
    ])}</w:body></w:document>`);

    const reading = await nativeExtractDocument(source, 'docx');
    expect(reading?.items[0]).toMatchObject({ section: 'Concrete Works', description: 'Ready-mix concrete', amount: 500 });
  });

  it('returns null for DOCX without an identifiable description and amount table', async () => {
    const source = await docx(`<w:document xmlns:w="${W}"><w:body>${tableXml([row(['Name', 'Notes']), row(['Concrete', 'Good'])])}</w:body></w:document>`);
    await expect(nativeExtractDocument(source, 'docx')).resolves.toBeNull();
  });

  it('returns null instead of dropping an unrecognized priced table after a recognized one', async () => {
    const source = await docx(`<w:document xmlns:w="${W}"><w:body>${tableXml([
      row(header), row(['A-1', 'Concrete', 'm3', '1', '100', '100']),
    ])}${tableXml([
      row(['SKU', 'Material type', 'Measure', 'Value']), row(['B-2', 'Steel bar 12 mm', 'kg', '250']),
    ])}</w:body></w:document>`);

    await expect(nativeExtractDocument(source, 'docx')).resolves.toBeNull();
  });

  it('returns null when a known priced table has an amount-bearing row with no description', async () => {
    const source = await docx(`<w:document xmlns:w="${W}"><w:body>${tableXml([
      row(header), row(['A-1', 'Concrete', 'm3', '1', '100', '100']), row(['A-2', '', 'bag', '1', '50', '50']),
    ])}</w:body></w:document>`);

    await expect(nativeExtractDocument(source, 'docx')).resolves.toBeNull();
  });

  it('skips coherent repeated headers without treating them as rows', async () => {
    const source = await docx(`<w:document xmlns:w="${W}"><w:body>${tableXml([
      row(header), row(['A-1', 'Concrete', 'm3', '1', '100', '100']), row(header), row(['A-2', 'Rebar', 'kg', '2', '20', '40']),
    ])}</w:body></w:document>`);

    const reading = await nativeExtractDocument(source, 'docx');
    expect(reading?.items.map(item => item.description)).toEqual(['Concrete', 'Rebar']);
  });

  it('rejects malformed DOCX XML and oversized files', async () => {
    const malformed = await docx(`<w:document xmlns:w="${W}"><w:body><w:tbl></w:body></w:document>`);
    await expect(nativeExtractDocument(malformed, 'docx')).rejects.toThrow(/malformed/i);
    await expect(nativeExtractDocument(Buffer.alloc(10 * 1024 * 1024 + 1), 'docx')).rejects.toThrow(/10 MiB/i);
  });

  it('reads PDF table values from the native parser and leaves unreadable layouts for fallback', async () => {
    const mock = PDFParse as unknown as jest.Mock;
    mock.mockImplementation(() => ({
      getInfo: async () => ({ total: 1 }),
      getTable: async () => ({ mergedTables: [[header, ['P-1', 'PVC pipe 25 mm', 'm', '4', '10.25', '41.00']]] }),
      getText: async () => ({ text: 'Project Name: Water Line\nContract Amount: ₱41.00' }),
      destroy: jest.fn(),
    }));
    const source = Buffer.from('%PDF-1.7\nfixture');

    await expect(nativeExtractDocument(source, 'pdf')).resolves.toEqual({
      projectName: 'Water Line', contractAmount: 41,
      items: [{ section: null, itemCode: 'P-1', description: 'PVC pipe 25 mm', unit: 'm', quantity: 4, unitCost: 10.25, amount: 41, sourceReference: 'PDF table 1, row 2' }],
    });

    mock.mockImplementation(() => ({
      getInfo: async () => ({ total: 1 }),
      getTable: async () => ({ mergedTables: [] }),
      getText: async () => ({ text: 'Scanned page' }),
      destroy: jest.fn(),
    }));
    await expect(nativeExtractDocument(source, 'pdf')).resolves.toBeNull();

    mock.mockImplementation(() => ({
      getInfo: async () => ({ total: 1 }),
      getTable: async () => { throw new Error('Table geometry unsupported'); },
      getText: async () => ({ text: 'Readable content without a supported table layout' }),
      destroy: jest.fn(),
    }));
    await expect(nativeExtractDocument(source, 'pdf')).resolves.toBeNull();
  });

  it('does not truncate native table output beyond 500 priced rows', async () => {
    const dataRows = Array.from({ length: 501 }, (_, index) => row([`A-${index}`, `Material ${index}`, 'kg', '1', '1', '1']));
    const source = await docx(`<w:document xmlns:w="${W}"><w:body>${tableXml([row(header), ...dataRows])}</w:body></w:document>`);
    await expect(nativeExtractDocument(source, 'docx')).rejects.toThrow(/more than 500/i);
  });
});
