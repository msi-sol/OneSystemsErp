import ExcelJS from 'exceljs';
import { buildDupaBlockWorkbook, heuristicPackageMatch, readDupaBlocks } from '@/lib/scheduling/dupa-split';
import { parseWorkspaceWorkbook } from '@/lib/boq/workspace-parser';

const HEADER = ['Item code', 'Description', 'Unit', 'Quantity', 'Unit rate', 'Amount'];
async function toBuffer(workbook: ExcelJS.Workbook) { return Buffer.from(await workbook.xlsx.writeBuffer()); }

describe('DUPA splitting: many DUPAs in one file', () => {
  it('reads one DUPA per sheet and skips a notes sheet without a component table', async () => {
    const workbook = new ExcelJS.Workbook();
    const components = workbook.addWorksheet('Components');
    components.addRow(['Concrete DUPA: 10 m³ example']);
    components.addRow([]);
    components.addRow(HEADER);
    components.addRow(['', 'Materials']);
    components.addRow(['M-01', 'Portland Cement Type 1, 40 kg', 'bag', 90, 220, 19800]);
    components.addRow(['', 'Labor']);
    components.addRow(['L-01', 'Foreman', 'man-day', 2, 1250, 2500]);
    const notes = workbook.addWorksheet('Source analysis');
    notes.addRow(['Category', 'Direct component cost', 'Tax in source']);
    notes.addRow(['Materials', 26525, 3183]);
    const blocks = readDupaBlocks(await toBuffer(workbook), 'dupa.xlsx');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ sheetName: 'Components', title: 'Concrete DUPA: 10 m³ example', firstRow: 1 });
  });

  it('splits DUPAs stacked in one sheet but keeps Labor/Equipment/Materials sub-tables together', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('DUPAs');
    sheet.addRow(['DUPA - Pay Item 900(1) Structural Concrete']);
    sheet.addRow(HEADER);
    sheet.addRow(['M-01', 'Cement', 'bag', 10, 220, 2200]);
    sheet.addRow([]);
    sheet.addRow(['B. Labor']);
    sheet.addRow(HEADER);
    sheet.addRow(['L-01', 'Mason', 'man-day', 2, 850, 1700]);
    sheet.addRow(['', 'Total direct cost', '', '', '', 3900]);
    sheet.addRow([]);
    sheet.addRow(['DUPA - Pay Item 1047(1) Structural Steel']);
    sheet.addRow(HEADER);
    sheet.addRow(['M-01', 'Steel plate', 'kg', 100, 75, 7500]);
    const second = workbook.addWorksheet('Painting');
    second.addRow(['Unit price analysis: Painting works']);
    second.addRow(HEADER);
    second.addRow(['M-01', 'Paint', 'gal', 4, 950, 3800]);

    const buffer = await toBuffer(workbook);
    const blocks = readDupaBlocks(buffer, 'many.xlsx');
    expect(blocks.map(block => block.title)).toEqual(['DUPA - Pay Item 900(1) Structural Concrete', 'DUPA - Pay Item 1047(1) Structural Steel', 'Unit price analysis: Painting works']);
    expect(blocks[0]).toMatchObject({ firstRow: 1, lastRow: 8 });

    // Each DUPA becomes its own workbook that the normal DUPA reader accepts, with only its own rows.
    const totals = [];
    for (const block of blocks) {
      const built = await buildDupaBlockWorkbook(block, 'many.xlsx');
      expect(built.fileName).toMatch(/^many - .+\.xlsx$/);
      const { analysis, items } = await parseWorkspaceWorkbook({ buffer: built.buffer, fileName: built.fileName, selectedSheet: 'DUPA' });
      expect(analysis.errors).toEqual([]);
      totals.push([items.length, analysis.total]);
    }
    expect(totals).toEqual([[2, '3900.00'], [1, '7500.00'], [1, '3800.00']]);
  });

  it('builds the same bytes for the same DUPA, so its hash is stable between reading and saving', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('S');
    sheet.addRow(['DUPA concrete']); sheet.addRow(HEADER); sheet.addRow(['M-01', 'Cement', 'bag', 1, 220, 220]);
    const [block] = readDupaBlocks(await toBuffer(workbook), 'a.xlsx');
    const one = await buildDupaBlockWorkbook(block, 'a.xlsx');
    const two = await buildDupaBlockWorkbook(block, 'a.xlsx');
    const hash = async (buffer: Buffer) => (await parseWorkspaceWorkbook({ buffer, fileName: one.fileName, selectedSheet: 'DUPA' })).analysis.fileHash;
    expect(await hash(one.buffer)).toBe(await hash(two.buffer));
  });
});

describe('DUPA package matching without AI', () => {
  const packages = [
    { id: 'p1', code: 'WP-01', name: 'Earthworks', boqDescriptions: ['Structure excavation', 'Embankment'] },
    { id: 'p2', code: 'WP-03', name: 'Concrete and Masonry Works', boqDescriptions: ['Structural concrete class A', 'CHB masonry'] },
  ];
  it('uses a package code named in the title', () => {
    expect(heuristicPackageMatch({ title: 'DUPA for WP-01', titleLines: [], components: [] }, 'x.xlsx', packages)).toMatchObject({ packageId: 'p1', confidence: 'high' });
  });
  it('matches by words shared with the package name and its BOQ items', () => {
    const match = heuristicPackageMatch({ title: 'Concrete DUPA: 10 m3 example', titleLines: [], components: ['Portland Cement', 'Fine aggregates'] }, 'DUPA_Concrete.xlsx', packages);
    expect(match.packageId).toBe('p2');
    expect(match.reason).toMatch(/concrete/i);
  });
  it('suggests nothing when no package fits', () => {
    expect(heuristicPackageMatch({ title: 'Landscaping', titleLines: [], components: ['Grass'] }, 'l.xlsx', packages).packageId).toBe('');
  });
});
