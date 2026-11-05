import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { analyzeBOQWorkbook, parseWorkspaceWorkbook } from '@/lib/boq/workspace-parser';
import { buildWorkspaceBOQFindings } from '@/lib/boq/workspace-findings';

const SPREADSHEETML_NAMESPACE = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

async function workbookBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function prefixSpreadsheetMlTags(buffer: Buffer): Promise<Buffer> {
  const archive = await JSZip.loadAsync(buffer);
  for (const [path, entry] of Object.entries(archive.files)) {
    if (entry.dir || !path.startsWith('xl/') || !path.endsWith('.xml') || path.split('/').includes('_rels')) continue;
    let xml = await entry.async('string');
    if (!xml.includes(SPREADSHEETML_NAMESPACE)) continue;
    xml = xml.replace(/<(\/)?([A-Za-z_][\w.-]*)(?=[\s/>])/g, '<$1x:$2');
    xml = xml.replace(/<x:([A-Za-z_][\w.-]*)(?=[\s/>])/, `<x:$1 xmlns:x="${SPREADSHEETML_NAMESPACE}"`);
    archive.file(path, xml);
  }
  return archive.generateAsync({ type: 'nodebuffer' });
}

function addHeader(worksheet: ExcelJS.Worksheet) {
  worksheet.addRow(['Item', 'Description', 'Unit', 'Qty', 'Unit Cost', 'Amount']);
}

describe('BOQ workspace workbook parser', () => {
  it('detects a BOQ sheet and preserves the supplied amount instead of multiplying unit cost', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Cost Plan');
    worksheet.addRow(['Civil works schedule']);
    addHeader(worksheet);
    worksheet.addRow(['A-1', 'Excavation', 'm3', 2, 15, 40.11]);
    worksheet.addRow(['', 'Grand Total', '', '', '', 40.12]);

    const analysis = await analyzeBOQWorkbook({
      buffer: await workbookBuffer(workbook),
      fileName: 'demo_boq.xlsx',
    });

    expect(analysis.selectedSheet).toBe('Cost Plan');
    expect(analysis.mapping).toMatchObject({ headerRow: 2, itemCode: 1, description: 2, unit: 3, quantity: 4, unitCost: 5, amount: 6 });
    expect(analysis.itemCount).toBe(1);
    expect(analysis.preview[0]).toMatchObject({ itemCode: 'A-1', quantity: 2, unitCost: 20.055, sourceUnitCost: 15, rateDerived: true, amount: 40.11 });
    expect(analysis.total).toBe('40.11');
    expect(analysis.errors).toEqual([]);
    expect(analysis.printedTotal).toBe('40.12');
  });

  it('does not choose between multiple candidate BOQ sheets by worksheet name', async () => {
    const workbook = new ExcelJS.Workbook();
    for (const name of ['BOQ', 'Pricing']) {
      const worksheet = workbook.addWorksheet(name);
      addHeader(worksheet);
      worksheet.addRow(['1', 'Work item', 'ea', 1, 10, 10]);
    }

    const analysis = await analyzeBOQWorkbook({ buffer: await workbookBuffer(workbook), fileName: 'multi.xlsx' });

    expect(analysis.sheets.filter(sheet => sheet.candidate).map(sheet => sheet.name)).toEqual(['BOQ', 'Pricing']);
    expect(analysis.selectedSheet).toBeNull();
    expect(analysis.errors).toContainEqual(expect.objectContaining({ field: 'selectedSheet' }));
  });

  it('requires manual resolution for duplicated required header aliases', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Items');
    worksheet.addRow(['Description', 'Unit', 'Qty', 'Quantity', 'Amount']);
    worksheet.addRow(['Road works', 'm2', 1, 1, 20]);

    const analysis = await analyzeBOQWorkbook({ buffer: await workbookBuffer(workbook), fileName: 'duplicate.xlsx' });

    expect(analysis.selectedSheet).toBe('Items');
    expect(analysis.mapping?.quantity).toBeNull();
    expect(analysis.errors).toContainEqual(expect.objectContaining({ field: 'quantity', message: expect.stringContaining('Map a valid') }));
    expect(analysis.warnings).toContainEqual(expect.objectContaining({ field: 'quantity', message: expect.stringContaining('manually') }));
  });

  it('shows fill evidence for rival columns without choosing an empty duplicate or counting a footer as work', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Bill');
    worksheet.addRow(['Description', 'Unit', 'Quantity', 'Amount', 'Amount']);
    worksheet.addRow(['Excavation', 'm3', 2, null, { formula: 'C2*10', result: 20 }]);
    worksheet.addRow(['Concrete', 'm3', 3, null, 30]);
    worksheet.addRow(['Grand Total', '', null, null, 50]);
    const buffer = await workbookBuffer(workbook);
    const analysis = await analyzeBOQWorkbook({ buffer, fileName: 'rival-amounts.xlsx' });
    expect(analysis.mapping?.amount).toBeNull();
    expect(analysis.columns[3]).toMatchObject({ index: 4, populatedRows: 0, pricedPopulatedRows: 0, pricedRowCount: 2 });
    expect(analysis.columns[4]).toMatchObject({ index: 5, populatedRows: 3, pricedPopulatedRows: 2, pricedRowCount: 2 });
    const corrected = await analyzeBOQWorkbook({ buffer, fileName: 'rival-amounts.xlsx', selectedSheet: 'Bill', mapping: { headerRow: 1, itemCode: null, description: 1, unit: 2, quantity: 3, unitCost: null, amount: 5 } });
    expect(corrected.errors).toEqual([]);
    expect(corrected.itemCount).toBe(2);
    expect(corrected.total).toBe('50.00');
  });

  it('skips repeated section headers precisely while keeping numeric work rows', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOQ');
    worksheet.addRow(['Item No.', 'Particulars', 'UOM', 'Qty.', 'Unit Price', 'Total Amount']);
    worksheet.addRow(['A-1', 'Excavation', 'm3', 2, 10, 20]);
    worksheet.addRow(['Item No.', 'Particulars', 'UOM', 'Qty.', 'Unit Price', 'Total Amount']);
    worksheet.addRow(['A-2', 'Quantity surveyor mobilization', 'days', 2, 30, 60]);

    const parsed = await parseWorkspaceWorkbook({ buffer: await workbookBuffer(workbook), fileName: 'repeated-headers.xlsx' });

    expect(parsed.analysis.mapping).toMatchObject({ headerRow: 1, itemCode: 1, description: 2, unit: 3, quantity: 4, unitCost: 5, amount: 6 });
    expect(parsed.items.map(item => item.description)).toEqual(['Excavation', 'Quantity surveyor mobilization']);
    expect(parsed.items.map(item => item.amount)).toEqual([20, 60]);
    expect(parsed.analysis.errors).toEqual([]);
    expect(parsed.analysis.warnings).toContainEqual(expect.objectContaining({ row: 3, field: 'headerRow', message: expect.stringContaining('Repeated BOQ column header skipped') }));
  });

  it('supports unfamiliar headers through explicit sheet and column mapping without guessing', async () => {
    const workbook = new ExcelJS.Workbook();
    const basis = workbook.addWorksheet('Basis');
    basis.mergeCells('A20:F20');
    basis.getCell('A20').value = 'Instructions: the description, quantity and amount columns must match the tender workbook.';
    const worksheet = workbook.addWorksheet('Imported Layout');
    worksheet.addRow(['Ref', 'Scope Narrative', 'Measure', 'Count', 'Each Price', 'Total Value']);
    worksheet.addRow(['R-1', 'Foundation excavation', 'm3', 3, 12, 36]);

    const automatic = await analyzeBOQWorkbook({ buffer: await workbookBuffer(workbook), fileName: 'manual-map.xlsx' });
    expect(automatic.selectedSheet).toBeNull();
    expect(automatic.errors).toContainEqual(expect.objectContaining({ field: 'selectedSheet', message: expect.stringContaining('No worksheet') }));
    expect(automatic.sheets).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Basis', candidate: false }),
      expect.objectContaining({ name: 'Imported Layout', candidate: false }),
    ]));

    const manuallyMapped = await parseWorkspaceWorkbook({
      buffer: await workbookBuffer(workbook), fileName: 'manual-map.xlsx', selectedSheet: 'Imported Layout',
      mapping: { headerRow: 1, itemCode: 1, description: 2, unit: 3, quantity: 4, unitCost: 5, amount: 6 },
    });
    expect(manuallyMapped.analysis.errors).toEqual([]);
    expect(manuallyMapped.items).toMatchObject([{ itemCode: 'R-1', description: 'Foundation excavation', unit: 'm3', quantity: 3, amount: 36 }]);
  });

  it('normalizes prefixed SpreadsheetML tags in the analysis copy and preserves entities and source bytes', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOQ');
    addHeader(worksheet);
    worksheet.addRow(['A-1', 'Rock & soil excavation', 'm3', 2, 12, null]);
    worksheet.getCell('F2').value = { formula: 'D2*E2', result: 24 };
    const prefixedBytes = await prefixSpreadsheetMlTags(await workbookBuffer(workbook));
    const before = Buffer.from(prefixedBytes);
    const beforeHash = createHash('sha256').update(prefixedBytes).digest('hex');

    const parsed = await parseWorkspaceWorkbook({ buffer: prefixedBytes, fileName: 'prefixed.xlsx' });

    expect(parsed.analysis.fileHash).toBe(beforeHash);
    expect(prefixedBytes.equals(before)).toBe(true);
    expect(parsed.analysis.errors).toEqual([]);
    expect(parsed.items[0]).toMatchObject({ description: 'Rock & soil excavation', amount: 24 });
  });

  it('rejects malformed prefixed SpreadsheetML XML with a safe parser error', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOQ');
    addHeader(worksheet);
    worksheet.addRow(['A-1', 'Work', 'ea', 1, 10, 10]);
    const archive = await JSZip.loadAsync(await workbookBuffer(workbook));
    const workbookXml = await archive.file('xl/workbook.xml')!.async('string');
    archive.file('xl/workbook.xml', workbookXml.replace('</workbook>', '</wrong>'));
    const malformed = await prefixSpreadsheetMlTags(await archive.generateAsync({ type: 'nodebuffer' }));

    await expect(parseWorkspaceWorkbook({ buffer: malformed, fileName: 'malformed-prefixed.xlsx' }))
      .rejects.toMatchObject({ message: 'A workbook XML part is malformed.', status: 400 });
  });

  const fixtureDirectory = process.env.BOQ_LAYOUT_FIXTURE_DIR;
  (fixtureDirectory ? it : it.skip)('parses the five external BOQ layout artifacts, including the manually mapped QS file', async () => {
    const cases = [
      { name: '01_Standard_BOQ.xlsx', headerRow: 9, amount: 6, manual: false },
      { name: '02_DPWH_Style_Paged_BOQ.xlsx', headerRow: 11, amount: 6, manual: false },
      { name: '03_Contractor_Cost_Breakdown.xlsx', headerRow: 9, amount: 10, manual: false },
      { name: '04_Simplified_QS_BOQ.xlsx', sheet: 'QS Bill', headerRow: 8, amount: 5, manual: true },
      { name: '05_Multisheet_BOQ_Workbook.xlsx', sheet: 'BOQ Detail', headerRow: 9, amount: 6, manual: false },
    ];
    for (const sample of cases) {
      const buffer = await readFile(`${fixtureDirectory}/${sample.name}`);
      const hash = createHash('sha256').update(buffer).digest('hex');
      const parsed = await parseWorkspaceWorkbook({
        buffer, fileName: sample.name,
        ...(sample.manual ? { selectedSheet: sample.sheet, mapping: { headerRow: 8, itemCode: null, description: 1, quantity: 2, unit: 3, unitCost: 4, amount: 5 } } : {}),
      });
      expect(parsed.analysis.fileHash).toBe(hash);
      if (sample.sheet) expect(parsed.analysis.selectedSheet).toBe(sample.sheet);
      expect(parsed.analysis.mapping?.headerRow).toBe(sample.headerRow);
      expect(parsed.analysis.mapping?.amount).toBe(sample.amount);
      expect(parsed.items).toHaveLength(47);
      expect(new Set(parsed.items.map(item => item.sectionSourceKey)).size).toBe(9);
      expect(parsed.analysis.total).toBe('3281322.00');
      expect(parsed.analysis.errors).toEqual([]);
    }
  });

  it('blocks formulas without cached results', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOQ');
    addHeader(worksheet);
    worksheet.addRow(['1', 'Work item', 'ea', 1, 10, null]);
    worksheet.getCell('F2').value = { formula: 'D2*E2' };

    const analysis = await analyzeBOQWorkbook({ buffer: await workbookBuffer(workbook), fileName: 'formula.xlsx' });

    expect(analysis.errors).toContainEqual(expect.objectContaining({ row: 2, field: 'amount', message: expect.stringContaining('cached result') }));
    expect(analysis.itemCount).toBe(0);
  });

  it('does not misclassify a real Total Station Survey item as a footer total', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOQ');
    addHeader(worksheet);
    worksheet.addRow(['1', 'Total Station Survey', 'ea', 1, 10, 10]);

    const analysis = await analyzeBOQWorkbook({ buffer: await workbookBuffer(workbook), fileName: 'total-station.xlsx' });

    expect(analysis.itemCount).toBe(1);
    expect(analysis.preview[0].description).toBe('Total Station Survey');
    expect(analysis.errors).toEqual([]);
  });

  it('preserves repeated section headings as distinct source section occurrences', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOQ');
    addHeader(worksheet);
    worksheet.addRow(['', 'Earthworks', '', '', '', '']);
    worksheet.addRow(['A-1', 'Excavation', 'm3', 1, 10, 10]);
    worksheet.addRow(['', 'Finishes', '', '', '', '']);
    worksheet.addRow(['B-1', 'Render', 'm2', 1, 12, 12]);
    worksheet.addRow(['', 'Earthworks', '', '', '', '']);
    worksheet.addRow(['C-1', 'Backfill', 'm3', 1, 8, 8]);

    const result = await analyzeBOQWorkbook({ buffer: await workbookBuffer(workbook), fileName: 'repeated-sections.xlsx' });

    expect(result.preview.map(item => item.section)).toEqual(['Earthworks', 'Finishes', 'Earthworks']);
    expect(result.preview.map(item => item.sectionSourceKey)).toEqual(['source:heading:2', 'source:heading:4', 'source:heading:6']);
    expect(new Set(result.preview.map(item => item.sectionSourceKey)).size).toBe(3);
    expect(result.sections.map(section => [section.key, section.name, section.itemCount, section.total])).toEqual([
      ['source:heading:2', 'Earthworks', 1, '10.00'],
      ['source:heading:4', 'Finishes', 1, '12.00'],
      ['source:heading:6', 'Earthworks', 1, '8.00'],
    ]);
  });

  it('filters and paginates the review preview while keeping full-sheet totals intact', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOQ');
    addHeader(worksheet);
    worksheet.addRow(['', 'Earthworks', '', '', '', '']);
    worksheet.addRow(['A-1', 'First section item', 'ea', 1, 10, 10]);
    worksheet.addRow(['', 'Earthworks', '', '', '', '']);
    for (let index = 1; index <= 26; index += 1) {
      worksheet.addRow([`B-${index}`, index === 26 ? 'Last section item' : `Work ${index}`, 'ea', 1, 1, 1]);
    }
    const buffer = await workbookBuffer(workbook);
    const defaultView = await parseWorkspaceWorkbook({ buffer, fileName: 'all-items.xlsx' });
    expect(defaultView.analysis.preview).toHaveLength(25);
    expect(defaultView.analysis.total).toBe('36.00');
    expect(defaultView.analysis.itemCount).toBe(27);

    const filteredPage = await parseWorkspaceWorkbook({
      buffer,
      fileName: 'all-items.xlsx',
      sectionKey: 'source:heading:4',
      previewOffset: 25,
    });
    expect(filteredPage.analysis.preview.map(item => item.description)).toEqual(['Last section item']);
    expect(filteredPage.analysis).toMatchObject({
      itemCount: 27,
      total: '36.00',
      selectedSectionKey: 'source:heading:4',
      previewOffset: 25,
      previewPageSize: 25,
      filteredItemCount: 26,
      filteredTotal: '26.00',
    });
    await expect(parseWorkspaceWorkbook({ buffer, fileName: 'all-items.xlsx', sectionKey: 'missing-section' }))
      .rejects.toMatchObject({ status: 400 });
    await expect(parseWorkspaceWorkbook({ buffer, fileName: 'all-items.xlsx', previewOffset: -1 }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('leaves unit cost at zero when no unit-cost column exists and reports that omission', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOQ');
    worksheet.addRow(['Description', 'Unit', 'Quantity', 'Amount']);
    worksheet.addRow(['Work item', 'ea', 3, 10]);

    const analysis = await analyzeBOQWorkbook({ buffer: await workbookBuffer(workbook), fileName: 'no-unit-cost.xlsx' });

    expect(analysis.preview[0]).toMatchObject({ unitCost: 3.3333, sourceUnitCost: null, rateDerived: true });
    expect(analysis.preview[0].amount).toBe(10);
    expect(analysis.warnings).toContainEqual(expect.objectContaining({ field: 'unitCost', message: expect.stringContaining('not provided') }));
  });

  it('rejects money precision beyond two decimal places', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOQ');
    addHeader(worksheet);
    worksheet.addRow(['1', 'Work item', 'ea', 1, 10, 10.123]);

    const analysis = await analyzeBOQWorkbook({ buffer: await workbookBuffer(workbook), fileName: 'precision.xlsx' });

    expect(analysis.errors).toContainEqual(expect.objectContaining({ row: 2, field: 'amount', message: expect.stringContaining('at most 2') }));
    expect(analysis.itemCount).toBe(0);
  });

  it('defaults only blank quantity and unit with explicit blocking findings, and rejects malformed values', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOQ');
    addHeader(worksheet);
    worksheet.addRow(['', 'Uncoded lot', '', null, 10, 10]);
    worksheet.addRow(['B-2', 'Malformed quantity', 'm3', 'many', 10, 10]);

    const parsed = await parseWorkspaceWorkbook({ buffer: await workbookBuffer(workbook), fileName: 'defaults.xlsx' });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({ itemCode: '', quantity: 1, unit: 'lot', quantityDefaulted: true, unitDefaulted: true, itemCodeSynthesized: true, sourceUnitCost: 10, rateDerived: false });
    expect(parsed.analysis.errors).toContainEqual(expect.objectContaining({ row: 3, field: 'quantity' }));
    expect(buildWorkspaceBOQFindings(parsed.items, { itemIdsBySourceRow: { 2: 'line-a' } })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'QUANTITY_DEFAULTED', severity: 'BLOCKING', itemId: 'line-a', rowNumber: 2 }),
      expect.objectContaining({ code: 'UNIT_DEFAULTED', severity: 'BLOCKING', itemId: 'line-a', rowNumber: 2 }),
    ]));
    expect(buildWorkspaceBOQFindings(parsed.items, {}).some(finding => finding.code === 'MISSING_ITEM_CODE')).toBe(false);
  });

  it('keeps the workbook amount, derives a mismatched used rate, and records the stated rate disclosure', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOQ');
    addHeader(worksheet);
    worksheet.addRow(['A-1', 'Concrete', 'm3', 2, 10, 30]);
    worksheet.addRow(['', 'Grand Total', '', '', '', 31]);

    const parsed = await parseWorkspaceWorkbook({ buffer: await workbookBuffer(workbook), fileName: 'rate-disclosure.xlsx' });
    expect(parsed.analysis.errors).toEqual([]);
    expect(parsed.analysis.printedTotal).toBe('31.00');
    expect(parsed.items[0]).toMatchObject({ amount: 30, unitCost: 15, sourceUnitCost: 10, rateDerived: true });
    const findings = buildWorkspaceBOQFindings(parsed.items, { printedTotal: parsed.analysis.printedTotal, sheetName: 'BOQ' });
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'STATED_RATE_NOT_AMOUNT_RATE', severity: 'ATTENTION' }),
      expect.objectContaining({ code: 'PRINTED_TOTAL_DIFFERS', severity: 'BLOCKING', evidence: expect.objectContaining({ printedTotal: '31.00', asReadValue: '30.00', differenceCents: '100' }) }),
    ]));
  });

  it('reads explicitly mapped BOQ cost-breakdown columns without changing the authoritative amount', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOQ');
    worksheet.addRow(['Description', 'Unit', 'Quantity', 'Unit Rate', 'Amount', 'Material Cost', 'Labor Cost', 'Direct Cost']);
    worksheet.addRow(['Concrete work', 'm3', 2, 50, 103.25, 70, 20, 90]);
    const analysis = await analyzeBOQWorkbook({
      buffer: await workbookBuffer(workbook),
      fileName: 'breakdown.xlsx',
      breakdownMapping: { materialUnitCost: 6, laborUnitCost: 7, totalDirectCost: 8 },
    });
    expect(analysis.preview[0]).toMatchObject({ amount: 103.25, materialUnitCost: 70, laborUnitCost: 20, totalDirectCost: 90 });
    expect(analysis.total).toBe('103.25');
  });

  it('rejects duplicate breakdown columns rather than assigning one value to multiple costs', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOQ');
    worksheet.addRow(['Description', 'Unit', 'Quantity', 'Amount', 'Breakdown']);
    worksheet.addRow(['Concrete work', 'm3', 2, 103.25, 70]);
    const analysis = await analyzeBOQWorkbook({
      buffer: await workbookBuffer(workbook),
      fileName: 'breakdown-duplicate.xlsx',
      breakdownMapping: { materialUnitCost: 5, laborUnitCost: 5 },
    });
    expect(analysis.errors).toContainEqual(expect.objectContaining({ field: 'laborUnitCost', message: expect.stringContaining('different columns') }));
  });
});
