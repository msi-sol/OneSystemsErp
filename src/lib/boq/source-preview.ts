import ExcelJS from 'exceljs';
import {
  inspectWorkspaceArchive,
  MAX_WORKSPACE_FILE_BYTES,
} from '@/lib/boq/workspace-parser';
import { WorkspaceError } from '@/lib/boq/workspace-types';

export const SOURCE_PREVIEW_PAGE_SIZE = 25;
export const SOURCE_PREVIEW_MAX_COLUMNS = 40;
export const SOURCE_PREVIEW_MAX_CELL_CHARACTERS = 1000;

const MAX_WORKSHEETS = 25;
const MAX_ROWS_PER_SHEET = 10_000;
const MAX_COLUMNS_PER_SHEET = 100;
const MAX_WORKBOOK_CELLS = 500_000;
const HEADER_SCAN_ROWS = 30;

export type SourcePreviewColumn = {
  index: number;
  letter: string;
  label: string;
  headerRow: number | null;
};

export type SourcePreviewSheet = {
  name: string;
  state: string;
  rowCount: number;
  columnCount: number;
  columns: SourcePreviewColumn[];
  columnsTruncated: boolean;
};

export type SourcePreviewCell = {
  column: number;
  value: string | number | boolean | null;
  formula?: string;
  mergedInto?: string;
  truncated?: boolean;
};

export type SourcePreviewRow = {
  rowNumber: number;
  cells: SourcePreviewCell[];
};

export type SourcePreviewPage = {
  fileName: string;
  selectedSheet: string;
  offset: number;
  pageSize: number;
  totalRows: number;
  totalColumns: number;
  columnsTruncated: boolean;
  sheets: SourcePreviewSheet[];
  columns: SourcePreviewColumn[];
  rows: SourcePreviewRow[];
  mergedRanges: string[];
  hasMore: boolean;
  nextOffset: number | null;
};

function fail(message: string, status = 400): never {
  throw new WorkspaceError(message, status);
}

function columnLetter(column: number): string {
  let value = column;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function clip(value: string, remaining: number): { value: string; truncated: boolean } {
  if (value.length <= remaining) return { value, truncated: false };
  if (remaining <= 0) return { value: '', truncated: true };
  return { value: `${value.slice(0, Math.max(0, remaining - 1))}…`, truncated: true };
}

function sourceText(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value !== 'object') return String(value);

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.richText)) {
    return record.richText.map((part) => {
      if (!part || typeof part !== 'object') return '';
      const text = (part as Record<string, unknown>).text;
      return typeof text === 'string' ? text : '';
    }).join('');
  }
  if (typeof record.text === 'string') return record.text;
  if (typeof record.error === 'string') return record.error;
  return null;
}

function formulaLiteral(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.formula === 'string') return `=${record.formula}`;
  if (typeof record.sharedFormula === 'string') return `=${record.sharedFormula}`;
  return null;
}

function cellPreview(cell: ExcelJS.Cell, column: number): SourcePreviewCell {
  if (cell.isMerged && cell.master.address !== cell.address) {
    return { column, value: null, mergedInto: cell.master.address };
  }

  const raw = cell.value as unknown;
  const formula = formulaLiteral(raw);
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
  const storedValue = formula && record ? sourceText(record.result) : sourceText(raw);
  const rawText = storedValue === null ? '' : String(storedValue);
  const boundedValue = clip(rawText, SOURCE_PREVIEW_MAX_CELL_CHARACTERS);
  let remaining = SOURCE_PREVIEW_MAX_CELL_CHARACTERS - boundedValue.value.length;
  const boundedFormula = formula === null ? null : clip(formula, remaining);
  if (boundedFormula) remaining -= boundedFormula.value.length;
  const wasTruncated = boundedValue.truncated || Boolean(boundedFormula?.truncated);
  const value: string | number | boolean | null = storedValue === null
    ? null
    : typeof storedValue === 'string'
      ? boundedValue.value
      : storedValue;

  return {
    column,
    value,
    ...(boundedFormula ? { formula: boundedFormula.value } : {}),
    ...(wasTruncated ? { truncated: true } : {}),
  };
}

function columnLabel(worksheet: ExcelJS.Worksheet, column: number): Pick<SourcePreviewColumn, 'label' | 'headerRow'> {
  const lastRow = Math.min(HEADER_SCAN_ROWS, worksheet.rowCount);
  for (let row = 1; row <= lastRow; row += 1) {
    const cell = worksheet.getCell(row, column);
    if (cell.isMerged && cell.master.address !== cell.address) continue;
    const value = sourceText(cell.value);
    if (typeof value === 'string' && value.trim()) {
      const bounded = clip(value.trim(), SOURCE_PREVIEW_MAX_CELL_CHARACTERS);
      return { label: bounded.value, headerRow: row };
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return { label: String(value), headerRow: row };
    }
  }
  return { label: `Column ${columnLetter(column)}`, headerRow: null };
}

function columnsFor(worksheet: ExcelJS.Worksheet): SourcePreviewColumn[] {
  const count = Math.min(worksheet.columnCount, SOURCE_PREVIEW_MAX_COLUMNS);
  return Array.from({ length: count }, (_, index) => {
    const column = index + 1;
    return { index: column, letter: columnLetter(column), ...columnLabel(worksheet, column) };
  });
}

function parseCellAddress(address: string): { row: number; column: number } | null {
  const match = /^([A-Z]+)(\d+)$/i.exec(address);
  if (!match) return null;
  let column = 0;
  for (const character of match[1]!.toUpperCase()) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }
  return { row: Number(match[2]), column };
}

function visibleMergeRanges(worksheet: ExcelJS.Worksheet, offset: number, count: number): string[] {
  const startRow = offset + 1;
  const endRow = offset + count;
  const merges = worksheet.model.merges ?? [];
  return merges.filter((range) => {
    const [start, end] = range.split(':');
    if (!start || !end) return false;
    const from = parseCellAddress(start);
    const to = parseCellAddress(end);
    return Boolean(from && to && from.row <= endRow && to.row >= startRow && from.column <= SOURCE_PREVIEW_MAX_COLUMNS);
  }).slice(0, 500);
}

function sheetSummary(worksheet: ExcelJS.Worksheet): SourcePreviewSheet {
  return {
    name: worksheet.name,
    state: worksheet.state,
    rowCount: worksheet.rowCount,
    columnCount: worksheet.columnCount,
    columns: columnsFor(worksheet),
    columnsTruncated: worksheet.columnCount > SOURCE_PREVIEW_MAX_COLUMNS,
  };
}

/** Reads stored workbook cells as evidence; formula text and cached results are never recalculated. */
export async function previewSourceWorkbook({
  buffer,
  fileName,
  sheetName,
  offset = 0,
}: {
  buffer: Buffer;
  fileName: string;
  sheetName?: string | null;
  offset?: number;
}): Promise<SourcePreviewPage> {
  if (!/\.xlsx$/i.test(fileName)) {
    fail('Source preview supports .xlsx workbooks only. Download the original PDF or DOCX to view it.', 415);
  }
  if (!buffer.length) fail('The original workbook is empty.');
  if (buffer.length > MAX_WORKSPACE_FILE_BYTES) fail('The workbook must be 10 MiB or smaller.', 413);
  if (!Number.isSafeInteger(offset) || offset < 0) fail('The source row offset must be a non-negative whole number.');

  await inspectWorkspaceArchive(buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    fail('The original workbook could not be read as a standard .xlsx file.');
  }

  if (workbook.worksheets.length < 1 || workbook.worksheets.length > MAX_WORKSHEETS) {
    fail(`A workbook must contain between 1 and ${MAX_WORKSHEETS} worksheets.`);
  }
  let totalCells = 0;
  for (const worksheet of workbook.worksheets) {
    if (worksheet.rowCount > MAX_ROWS_PER_SHEET) fail(`Worksheet ${worksheet.name} exceeds ${MAX_ROWS_PER_SHEET} rows.`);
    if (worksheet.columnCount > MAX_COLUMNS_PER_SHEET) fail(`Worksheet ${worksheet.name} exceeds ${MAX_COLUMNS_PER_SHEET} columns.`);
    totalCells += worksheet.rowCount * worksheet.columnCount;
    if (totalCells > MAX_WORKBOOK_CELLS) fail('The workbook exceeds the supported cell count.');
  }

  const selected = sheetName === undefined || sheetName === null
    ? workbook.worksheets[0]
    : workbook.getWorksheet(sheetName);
  if (!selected) fail('The requested source sheet was not found.');
  if (offset > selected.rowCount) fail('The source row offset is past the end of this sheet.');

  const columns = columnsFor(selected);
  const count = Math.min(SOURCE_PREVIEW_PAGE_SIZE, selected.rowCount - offset);
  const rows: SourcePreviewRow[] = Array.from({ length: count }, (_, index) => {
    const rowNumber = offset + index + 1;
    const row = selected.getRow(rowNumber);
    return {
      rowNumber,
      cells: columns.map((column) => cellPreview(row.getCell(column.index), column.index)),
    };
  });
  const nextOffset = offset + rows.length;
  const hasMore = nextOffset < selected.rowCount;

  return {
    fileName,
    selectedSheet: selected.name,
    offset,
    pageSize: SOURCE_PREVIEW_PAGE_SIZE,
    totalRows: selected.rowCount,
    totalColumns: selected.columnCount,
    columnsTruncated: selected.columnCount > SOURCE_PREVIEW_MAX_COLUMNS,
    sheets: workbook.worksheets.map(sheetSummary),
    columns,
    rows,
    mergedRanges: visibleMergeRanges(selected, offset, rows.length),
    hasMore,
    nextOffset: hasMore ? nextOffset : null,
  };
}
