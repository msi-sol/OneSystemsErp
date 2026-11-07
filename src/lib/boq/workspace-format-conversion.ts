import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import sharp from 'sharp';
import * as XLSX from 'xlsx';
import { WorkspaceError } from './workspace-types';

export const MAX_CONVERTED_WORKSHEETS = 25;
export const MAX_CONVERTED_ROWS = 10_000;
export const MAX_CONVERTED_COLUMNS = 100;
export const MAX_CONVERTED_CELLS = 500_000;
const MAX_CONVERTED_WORKBOOK_BYTES = 64 * 1024 * 1024;
const MAX_TEXT_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 25_000_000;
const CFB_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function fail(message: string): never { throw new WorkspaceError(message, 400); }

async function writeWorkbook(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const output = Buffer.from(await workbook.xlsx.writeBuffer());
  if (output.length > MAX_CONVERTED_WORKBOOK_BYTES) fail('The converted workbook exceeds the supported expanded size.');
  return output;
}

export async function convertLegacyXls(buffer: Buffer): Promise<Buffer> {
  if (!buffer.length || !buffer.subarray(0, CFB_SIGNATURE.length).equals(CFB_SIGNATURE)) {
    return fail('The .xls file is not a valid legacy Excel workbook. Re-save it from Excel and try again.');
  }
  let source: XLSX.WorkBook;
  try {
    source = XLSX.read(buffer, {
      type: 'buffer', cellFormula: true, cellHTML: false, cellNF: true,
      cellStyles: false, cellDates: true, sheetRows: MAX_CONVERTED_ROWS + 1,
      WTF: true,
    });
  } catch {
    return fail('The .xls workbook is damaged or unsupported. Re-save it from Excel and try again.');
  }
  if (!source.SheetNames.length || source.SheetNames.length > MAX_CONVERTED_WORKSHEETS) {
    return fail(`A workbook must contain between 1 and ${MAX_CONVERTED_WORKSHEETS} worksheets.`);
  }

  const workbook = new ExcelJS.Workbook();
  let totalCells = 0;
  for (const name of source.SheetNames) {
    const sourceSheet = source.Sheets[name];
    if (!sourceSheet) continue;
    const rangeRef = sourceSheet['!fullref'] || sourceSheet['!ref'];
    if (!rangeRef) {
      workbook.addWorksheet(name.slice(0, 31) || 'Sheet');
      continue;
    }
    let range: XLSX.Range;
    try { range = XLSX.utils.decode_range(rangeRef); }
    catch { return fail('The .xls workbook contains an invalid worksheet range.'); }
    const rows = range.e.r + 1;
    const columns = range.e.c + 1;
    if (rows > MAX_CONVERTED_ROWS) return fail(`Worksheet ${name} exceeds ${MAX_CONVERTED_ROWS} rows.`);
    if (columns > MAX_CONVERTED_COLUMNS) return fail(`Worksheet ${name} exceeds ${MAX_CONVERTED_COLUMNS} columns.`);
    totalCells += rows * columns;
    if (totalCells > MAX_CONVERTED_CELLS) return fail('The workbook exceeds the supported cell count.');

    const target = workbook.addWorksheet(name.slice(0, 31) || 'Sheet');
    const errorValues = new Set(['#N/A', '#REF!', '#NAME?', '#DIV/0!', '#NULL!', '#VALUE!', '#NUM!']);
    const asError = (cell: XLSX.CellObject): ExcelJS.CellErrorValue => {
      const text = typeof cell.w === 'string' && errorValues.has(cell.w)
        ? cell.w
        : typeof cell.v === 'string' && errorValues.has(cell.v) ? cell.v : '#VALUE!';
      return { error: text as ExcelJS.CellErrorValue['error'] };
    };
    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
      for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
        const sourceCell = sourceSheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
        if (!sourceCell) continue;
        const targetCell = target.getRow(rowIndex + 1).getCell(columnIndex + 1);
        if (typeof sourceCell.z === 'string') targetCell.numFmt = sourceCell.z;

        if (typeof sourceCell.f === 'string') {
          const formulaValue: ExcelJS.CellFormulaValue = { formula: sourceCell.f };
          if (sourceCell.v !== undefined && sourceCell.v !== null) {
            formulaValue.result = sourceCell.t === 'e' ? asError(sourceCell) : sourceCell.v as ExcelJS.CellFormulaValue['result'];
          }
          targetCell.value = formulaValue;
        } else if (sourceCell.t === 'e') {
          targetCell.value = asError(sourceCell);
        } else if (sourceCell.t === 'd') {
          const date = sourceCell.v instanceof Date ? sourceCell.v : new Date(String(sourceCell.v));
          if (!Number.isFinite(date.getTime())) return fail(`Worksheet ${name} contains an invalid date value.`);
          targetCell.value = date;
        } else if (typeof sourceCell.v === 'string' || typeof sourceCell.v === 'number' || typeof sourceCell.v === 'boolean') {
          targetCell.value = sourceCell.v;
        } else if (sourceCell.v instanceof Date) {
          targetCell.value = sourceCell.v;
        }
      }
    }
  }
  return writeWorkbook(workbook);
}

function parseDelimited(buffer: Buffer, delimiter: string): string[][] {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return fail('The delimited file must use valid UTF-8 text. Re-save it as UTF-8 CSV or TSV.'); }
  if (text.includes('\0')) return fail('The delimited file contains binary data and cannot be read as text.');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let parseError: string | null = null;
  let columns = 0;
  Papa.parse<string[]>(text, {
    delimiter,
    dynamicTyping: false,
    skipEmptyLines: false,
    step: (result, parser) => {
      if (result.errors.length) {
        parseError = 'The delimited file contains invalid quoting or row structure.';
        parser.abort();
        return;
      }
      const row = result.data;
      if (row.length > MAX_CONVERTED_COLUMNS) {
        parseError = `A delimited row exceeds ${MAX_CONVERTED_COLUMNS} columns.`;
        parser.abort();
        return;
      }
      columns = Math.max(columns, row.length);
      if (rows.length >= MAX_CONVERTED_ROWS) {
        parseError = `A delimited file exceeds ${MAX_CONVERTED_ROWS} rows.`;
        parser.abort();
        return;
      }
      rows.push(row);
      if (rows.length * columns > MAX_CONVERTED_CELLS) {
        parseError = 'The delimited file exceeds the supported cell count.';
        parser.abort();
      }
    },
  });
  if (parseError) return fail(parseError);
  if (!rows.length || !columns || rows.every(row => row.every(cell => !cell.trim()))) {
    return fail('The delimited file is empty. Add a header and BOQ rows before uploading.');
  }
  return rows;
}

export async function convertDelimitedWorkspaceFile(buffer: Buffer, fileName: string): Promise<Buffer> {
  const delimiter = /\.tsv$/i.test(fileName) ? '\t' : ',';
  const rows = parseDelimited(buffer, delimiter);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  for (const row of rows) sheet.addRow(row);
  return writeWorkbook(workbook);
}

export function readWorkspaceTextDocument(buffer: Buffer): string {
  if (!buffer.length || buffer.length > MAX_TEXT_DOCUMENT_BYTES) {
    return fail('A text BOQ must be 2 MiB or smaller. Split long documents into smaller sections and upload the relevant source.');
  }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return fail('The text document must use valid UTF-8 encoding. Re-save it as UTF-8 text and try again.'); }
  if (!text.trim() || text.includes('\0')) return fail('The text document is empty or contains binary data.');
  return text;
}

export async function validateWorkspaceImage(buffer: Buffer, fileName: string): Promise<{ mimeType: string }> {
  const extension = /\.([^.]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  const allowed: Record<string, { format: string; mimeType: string }> = {
    png: { format: 'png', mimeType: 'image/png' },
    jpg: { format: 'jpeg', mimeType: 'image/jpeg' },
    jpeg: { format: 'jpeg', mimeType: 'image/jpeg' },
    webp: { format: 'webp', mimeType: 'image/webp' },
  };
  const expected = extension ? allowed[extension] : null;
  if (!expected) return fail('Choose a PNG, JPEG, or WEBP image.');
  let metadata: sharp.Metadata;
  try { metadata = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' }).metadata(); }
  catch { return fail('The image is damaged or cannot be decoded. Export it as PNG, JPEG, or WEBP and try again.'); }
  if (metadata.format !== expected.format || !metadata.width || !metadata.height) {
    return fail('The image content does not match its filename. Export it as PNG, JPEG, or WEBP and try again.');
  }
  if (metadata.pages && metadata.pages > 1) return fail('Animated images are not supported. Upload one still page or image at a time.');
  if (metadata.width * metadata.height > MAX_IMAGE_PIXELS) return fail('The image dimensions are too large to process safely.');
  return { mimeType: expected.mimeType };
}
