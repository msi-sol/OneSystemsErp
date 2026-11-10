import ExcelJS from 'exceljs';
import { analyzeBOQWorkbook } from '@/lib/boq/workspace-parser';
import { buildWorkspaceBOQFindings } from '@/lib/boq/workspace-findings';

// Layouts seen in real awarded BOQs (Bukidnon/Talakag program of works, accomplishment reports, blank templates).
async function buffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('BOQ workspace: real template layouts', () => {
  it('reads letter-spaced headers and keeps every section when headings carry zero or uncalculated formulas', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('BOQ_DATA_ENTRY');
    sheet.addRow(['PROJECT:', 'DESIGN AND BUILD OF TALAKAG GOVERNMENT CENTER']);
    sheet.addRow(['ITEM #', 'D E S C R I P T I O N', 'UNIT', 'QUANTITY', 'UNIT COST', 'AMOUNT']);
    sheet.addRow(['I.', 'GENERAL REQUIREMENTS']);
    sheet.addRow(['1', 'Mobilization', 'lot', 1, 100, 100]);
    // Later headings: zeros, and a rate formula with no saved result.
    sheet.addRow(['II.', 'EARTHWORKS', null, null, { formula: 'IFERROR(F5/D5,"")' }, 0]);
    sheet.addRow(['1', 'Excavation', 'cu.m', 10, 5, 50]);
    sheet.addRow(['III.', 'CONCRETE WORKS', null, null, 0, 0]);
    sheet.addRow(['1', 'Concrete', 'cu.m', 2, 1000, 2000]);
    sheet.addRow([null, 'GRAND TOTAL', null, null, null, 2150]);
    sheet.addRow([null, 'Prepared by:', null, null, null, null]);
    sheet.addRow([null, null, null, null, null, 999]);

    const analysis = await analyzeBOQWorkbook({ buffer: await buffer(workbook), fileName: 'pow.xlsx' });
    expect(analysis.errors).toEqual([]);
    expect(analysis.itemCount).toBe(3);
    expect(analysis.total).toBe('2150.00');
    expect(analysis.sections.map(section => section.name)).toEqual(['I. GENERAL REQUIREMENTS', 'II. EARTHWORKS', 'III. CONCRETE WORKS']);
    expect(analysis.extractedProjectName).toBe('DESIGN AND BUILD OF TALAKAG GOVERNMENT CENTER');
    expect(analysis.projectNameSource).toBe('document');
    expect(analysis.warnings.some(warning => /after the grand total/.test(warning.message))).toBe(true);
  });

  it('uses the project name written on the most sheets and the bid amount cell over stale bid-form words', async () => {
    const workbook = new ExcelJS.Workbook();
    const pow = workbook.addWorksheet('POW');
    pow.addRow(['PROJECT:', 'DESIGN AND BUILD OF TALAKAG GOVERNMENT CENTER']);
    pow.addRow(['ITEM #', 'DESCRIPTION', 'UNIT', 'QUANTITY', 'UNIT COST', 'AMOUNT']);
    pow.addRow(['1', 'Mobilization', 'lot', 1, 300000, 300000]);
    pow.addRow(['2', 'Concrete', 'cu.m', 100, 2000, 200000]);
    const bid = workbook.addWorksheet('BID FORM');
    bid.addRow(['The total price of our Bid, excluding any discounts offered below, is:']);
    bid.addRow(['ONE HUNDRED NINETY THREE THOUSAND PESOS (P 193,000.00)', 500000, 'ABC']);
    for (const name of ['SUM', 'CASH FLOW', 'I']) workbook.addWorksheet(name).addRow(['Project Title:', 'Construction of Talakag Government Center (Design and Build Scheme)']);

    const analysis = await analyzeBOQWorkbook({ buffer: await buffer(workbook), fileName: 'talakag.xlsx', selectedSheet: 'POW' });
    expect(analysis.total).toBe('500000.00');
    expect(analysis.extractedProjectName).toBe('Construction of Talakag Government Center (Design and Build Scheme)');
    expect(analysis.metadataChecks?.some(check => check.field === 'projectName' && check.message.includes('DESIGN AND BUILD OF TALAKAG'))).toBe(true);
    expect(analysis.extractedContractAmount).toBe('500000.00');
    expect(analysis.metadataChecks?.some(check => check.field === 'contractAmount')).toBe(false);
  });

  it('keeps a bid-form amount that differs from the BOQ total when nothing beside it matches the total', async () => {
    const workbook = new ExcelJS.Workbook();
    const pow = workbook.addWorksheet('POW');
    pow.addRow(['ITEM #', 'DESCRIPTION', 'UNIT', 'QUANTITY', 'UNIT COST', 'AMOUNT']);
    pow.addRow(['1', 'Mobilization', 'lot', 1, 500000, 500000]);
    workbook.addWorksheet('BID FORM').addRow(['The total price of our Bid is ONE HUNDRED NINETY THREE THOUSAND PESOS (P 193,000.00)', 193548]);

    const analysis = await analyzeBOQWorkbook({ buffer: await buffer(workbook), fileName: 'bid.xlsx', selectedSheet: 'POW' });
    expect(analysis.extractedContractAmount).toBe('193000.00');
  });

  it('reads headings shifted into the item-code column', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('POW');
    sheet.addRow([null, 'ITEM #', 'DESCRIPTION', 'UNIT', 'QUANTITY', 'AMOUNT']);
    sheet.addRow([null, 'I.', 'GENERAL REQUIREMENTS']);
    sheet.addRow([null, '1', 'Mobilization', 'lot', 1, 100]);
    sheet.addRow(['II.', 'CONCRETE WORKS']);
    sheet.addRow([null, '1', 'Concrete', 'cu.m', 2, 2000]);
    const analysis = await analyzeBOQWorkbook({ buffer: await buffer(workbook), fileName: 'shifted.xlsx' });
    expect(analysis.errors).toEqual([]);
    expect(analysis.sections.map(section => section.name)).toEqual(['I. GENERAL REQUIREMENTS', 'II. CONCRETE WORKS']);
  });

  it('uses the main-table column when a look-alike header sits in a side table or progress block', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Accomplishment');
    sheet.addRow(['Item No.', 'Description', 'Unit/s', 'Qty', 'Unit Cost', 'Total Cost', 'Weighted %', 'Qty', 'Unit/s', 'Previous']);
    sheet.addRow(['1', 'Mobilization', 'lot', 1, 100, 100, 0.5, 1, 'lot', 0]);
    sheet.addRow(['2', 'Fittings', 'pcs', 10, 10, 100, 0.5, 10, 'pcs', 0]);
    const analysis = await analyzeBOQWorkbook({ buffer: await buffer(workbook), fileName: 'accomplishment.xlsx' });
    expect(analysis.mapping).toMatchObject({ unit: 3, quantity: 4, amount: 6 });
    expect(analysis.itemCount).toBe(2);
    expect(analysis.total).toBe('200.00');
  });

  it('prefers "UNIT COST (Direct/Indirect)" over a "DIRECT UNIT COST" group heading', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('BOQ');
    sheet.addRow(['ITEM #', 'DESCRIPTION', 'UNIT', 'QUANTITY', 'DIRECT UNIT COST', 'UNIT COST (Direct/Indirect)', 'AMOUNT']);
    sheet.addRow(['1', 'Mobilization', 'lot', 2, 80, 100, 200]);
    const analysis = await analyzeBOQWorkbook({ buffer: await buffer(workbook), fileName: 'rates.xlsx' });
    expect(analysis.mapping?.unitCost).toBe(6);
  });

  it('reads the bid price written below its sentence and never uses the ABC', async () => {
    const workbook = new ExcelJS.Workbook();
    const bid = workbook.addWorksheet('BID FORM');
    bid.addRow(['Approved Budget for the Contract (ABC):', 'P 193,548,000.00']);
    bid.addRow(['The total price of our Bid, excluding any discounts offered below, is:']);
    bid.addRow(['ONE HUNDRED NINETY THREE MILLION … PESOS (P 193,467,295.60)']);
    const boq = workbook.addWorksheet('POW');
    boq.addRow(['PROJECT', ':', 'Construction of Talakag Government Center']);
    boq.addRow(['ITEM #', 'DESCRIPTION', 'UNIT', 'QUANTITY', 'AMOUNT']);
    boq.addRow(['1', 'Mobilization', 'lot', 1, 100]);
    const analysis = await analyzeBOQWorkbook({ buffer: await buffer(workbook), fileName: 'bid.xlsx', selectedSheet: 'POW' });
    expect(analysis.extractedContractAmount).toBe('193467295.60');
    expect(analysis.contractAmountEvidence).toContain('BID FORM');
    expect(analysis.extractedProjectName).toBe('Construction of Talakag Government Center');
    expect(analysis.metadataChecks?.some(check => check.field === 'contractAmount' && check.message.includes('BOQ items total'))).toBe(true);
  });

  it('rejects template placeholders and says when the name comes from the file name', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('BOQ');
    sheet.addRow(['PROJECT:', 'PROJECT NAME']);
    sheet.addRow(['ITEM #', 'DESCRIPTION', 'UNIT', 'QUANTITY', 'AMOUNT']);
    sheet.addRow(['1', 'Mobilization', 'lot', 1, 100]);
    const analysis = await analyzeBOQWorkbook({ buffer: await buffer(workbook), fileName: 'Clinic-BOQ.xlsx' });
    expect(analysis.extractedProjectName).toBeNull();
    expect(analysis.projectNameSource).toBe('file-name');
  });

  it('reports an unfilled template in one message instead of an error per row', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('BOQ_DATA_ENTRY');
    sheet.addRow(['ITEM #', 'DESCRIPTION', 'UNIT', 'QUANTITY', 'UNIT COST', 'AMOUNT']);
    for (let index = 1; index <= 5; index += 1) sheet.addRow([String(index), `Line ${index}`, 'lot', null, { formula: `IFERROR(F${index + 1}/D${index + 1},"")` }, { formula: `D${index + 1}*100` }]);
    const analysis = await analyzeBOQWorkbook({ buffer: await buffer(workbook), fileName: 'template.xlsx' });
    expect(analysis.errors).toHaveLength(1);
    expect(analysis.errors[0].message).toMatch(/empty BOQ template/);
  });

  it('skips a supporting sheet too wide to read instead of rejecting the workbook', async () => {
    const workbook = new ExcelJS.Workbook();
    const boq = workbook.addWorksheet('BOQ');
    boq.addRow(['ITEM #', 'DESCRIPTION', 'UNIT', 'QUANTITY', 'AMOUNT']);
    boq.addRow(['1', 'Mobilization', 'lot', 1, 100]);
    const backup = workbook.addWorksheet('BACK-UP');
    backup.addRow(Array.from({ length: 120 }, (_, index) => index + 1));
    const analysis = await analyzeBOQWorkbook({ buffer: await buffer(workbook), fileName: 'wide.xlsx' });
    expect(analysis.itemCount).toBe(1);
    expect(analysis.warnings.some(warning => /BACK-UP was skipped/.test(warning.message))).toBe(true);
  });

  it('treats a printed-total difference within line rounding as attention, not blocking', () => {
    const items = Array.from({ length: 10 }, (_, index) => ({ sourceRowNumber: index + 2, amount: '10.00', quantity: '1', unitCost: '10.00', unit: 'lot', description: `Line ${index}` }));
    const findings = buildWorkspaceBOQFindings(items as never, { printedTotal: '100.03' });
    const total = findings.find(finding => finding.code === 'PRINTED_TOTAL_DIFFERS');
    expect(total?.severity).toBe('ATTENTION');
    expect(total?.message).toMatch(/rounding/);
    const real = buildWorkspaceBOQFindings(items as never, { printedTotal: '150.00' }).find(finding => finding.code === 'PRINTED_TOTAL_DIFFERS');
    expect(real?.severity).toBe('BLOCKING');
  });
});
