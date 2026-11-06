import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { SaxesParser } from 'saxes';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { WorkspaceError, type NonPricedSourceRow, type WorkspaceAnalysis, type WorkspaceBreakdownMapping, type WorkspaceIssue, type WorkspaceItem, type WorkspaceMapping } from './workspace-types';
import { parseWorkspaceDocument } from './workspace-document';

export const MAX_WORKSPACE_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 1200;
const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_SHEETS = 25;
const MAX_ROWS_PER_SHEET = 10000;
const MAX_COLUMNS_PER_SHEET = 100;
const MAX_WORKBOOK_CELLS = 500000;
const MAX_REPORTED_ISSUES = 2000;
const PREVIEW_SIZE = 25;
const SPREADSHEETML_NAMESPACE = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

type MappingField = Exclude<keyof WorkspaceMapping, 'headerRow'>;
type BreakdownField = keyof WorkspaceBreakdownMapping;
type CellRead = { value: unknown; formulaError?: string };

const headerTerms: Record<MappingField, string[]> = {
  itemCode: ['item code', 'item no', 'item number', 'item ref', 'reference', 'code', 'item'],
  description: ['description', 'item description', 'work description', 'particulars', 'scope of work', 'work item'],
  unit: ['unit', 'units', 'unit/s', 'uom', 'unit of measure', 'unit measure'],
  quantity: ['quantity', 'qty'],
  unitCost: ['unit cost', 'unit price', 'unit rate', 'rate', 'cost per unit'],
  amount: ['amount', 'total amount', 'line total', 'total cost', 'extended cost', 'contract amount'],
};
const breakdownHeaderTerms: Record<BreakdownField, string[]> = {
  materialUnitCost: ['material unit cost', 'material cost'],
  laborUnitCost: ['labor unit cost', 'labour unit cost', 'labor cost', 'labour cost'],
  equipmentUnitCost: ['equipment unit cost', 'equipment cost'],
  totalDirectCost: ['direct cost', 'total direct cost'],
  ocm: ['ocm', 'overhead cost markup'],
  cp: ['cp', 'contractor profit'],
  vat: ['vat', 'value added tax'],
  totalIndirectCost: ['indirect cost', 'total indirect cost'],
  percentage: ['percentage', 'percent'],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return '';
}

/** Read labelled document metadata only; never infer a signed value from an item rate. */
function readProjectMetadata(workbook: ExcelJS.Workbook) {
  let projectName: string | null = null, contractAmount: string | null = null;
  for (const sheet of workbook.worksheets.slice(0, 5)) {
    for (let row = 1; row <= Math.min(60, sheet.rowCount); row += 1) {
      const cells = Array.from({ length: Math.min(15, sheet.columnCount) }, (_, index) => cellText(readCell(sheet.getRow(row).getCell(index + 1), row, 'metadata', []).value));
      for (let column = 0; column < cells.length; column += 1) {
        const text = cells[column], inline = text.match(/^(?:project name|name of project|contract name)\s*:\s*(.+)$/i);
        if (!projectName && inline) projectName = inline[1].trim().slice(0, 191);
        const label = normalizeHeader(text.replace(/:$/, ''));
        const next = cells.slice(column + 1).find(value => value.trim());
        const bareProjectMetadata = label === 'project' && row <= 3 && cells.filter(Boolean).length === 2
          && next && !Object.values(headerTerms).flat().map(normalizeHeader).includes(normalizeHeader(next));
        if (!projectName && (['project name', 'name of project', 'contract name'].includes(label) || bareProjectMetadata) && next) projectName = next.slice(0, 191);
        const contract = /^(?:signed contract value|contract amount|contract value|total contract price)\s*:\s*(.+)$/i.exec(text);
        const candidate = contract?.[1] ?? (['signed contract value', 'contract amount', 'contract value', 'total contract price'].includes(label) ? next : null);
        if (!contractAmount && candidate) {
          const cleaned = candidate.replace(/(?:PHP|₱|,|\s)/gi, '');
          if (/^\d+(?:\.\d{1,2})?$/.test(cleaned)) {
            const value = new Prisma.Decimal(cleaned);
            if (value.isFinite() && value.gt(0) && value.lte(Number.MAX_SAFE_INTEGER)) contractAmount = value.toFixed(2);
          }
        }
      }
    }
  }
  return { projectName, contractAmount };
}

function readCell(cell: ExcelJS.Cell, row: number, field: string, issues: WorkspaceIssue[]): CellRead {
  const value = cell.value;
  if (value && typeof value === 'object') {
    const record = value as unknown as Record<string, unknown>;
    if ('error' in record) return { value: null, formulaError: String(record.error || 'Excel error') };
    if ('formula' in record || 'sharedFormula' in record) {
      if (!('result' in record) || record.result === undefined || record.result === null) {
        issues.push({ row, field, message: 'Formula has no cached result. Recalculate and save the workbook in Excel.' });
        return { value: null, formulaError: 'missing cached formula result' };
      }
      if (typeof record.result === 'object' && record.result !== null && 'error' in (record.result as unknown as Record<string, unknown>)) {
        return { value: null, formulaError: String((record.result as unknown as Record<string, unknown>).error || 'Excel error') };
      }
      return { value: record.result };
    }
    if ('richText' in record && Array.isArray(record.richText)) {
      return { value: record.richText.map(part => String((part as { text?: unknown }).text ?? '')).join('') };
    }
    if ('text' in record && typeof record.text === 'string') return { value: record.text };
  }
  return { value };
}

function issue(list: WorkspaceIssue[], entry: WorkspaceIssue): void {
  if (list.length < MAX_REPORTED_ISSUES) list.push(entry);
  else if (list.length === MAX_REPORTED_ISSUES) {
    list.push({ row: 'additional', field: 'additionalIssues', message: 'Additional issues were omitted from this response. Correct the listed rows and analyze again.' });
  }
}

function emptyMapping(headerRow = 1): WorkspaceMapping {
  return { headerRow, itemCode: null, description: null, unit: null, quantity: null, unitCost: null, amount: null };
}

type HeaderDetection = { mapping: WorkspaceMapping; recognized: Set<MappingField>; ambiguous: Set<MappingField> };

function mappingForHeaders(headers: string[], headerRow: number): HeaderDetection {
  const mapping = emptyMapping(headerRow);
  const recognized = new Set<MappingField>();
  const ambiguous = new Set<MappingField>();
  for (const field of Object.keys(headerTerms) as MappingField[]) {
    const terms = headerTerms[field].map(normalizeHeader);
    const normalizedHeaders = headers.map(normalizeHeader);
    const exact = normalizedHeaders.flatMap((header, index) => terms.includes(header) ? [index] : []);
    const matches = exact.length ? exact : normalizedHeaders.flatMap((header, index) =>
      terms.some(term => term.length > 4 && header.includes(term)) ? [index] : []);
    if (matches.length) recognized.add(field);
    if (matches.length > 1) ambiguous.add(field);
    if (matches.length === 1) mapping[field] = matches[0] + 1;
  }
  return { mapping, recognized, ambiguous };
}

function breakdownMappingForHeaders(headers: string[]): WorkspaceBreakdownMapping {
  const result: WorkspaceBreakdownMapping = {};
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const field of Object.keys(breakdownHeaderTerms) as BreakdownField[]) {
    const terms = breakdownHeaderTerms[field].map(normalizeHeader);
    const matches = normalizedHeaders.flatMap((header, index) => terms.includes(header) ? [index + 1] : []);
    result[field] = matches.length === 1 ? matches[0] : null;
  }
  return result;
}

function findHeader(worksheet: ExcelJS.Worksheet): HeaderDetection {
  let best = mappingForHeaders([], 1);
  let bestScore = 0;
  const lastRow = Math.min(30, worksheet.rowCount || 1);
  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    // ExcelJS repeats a merged cell's value at every covered column. Only
    // its master is a header; the covered cells do not introduce ambiguity.
    const headers = Array.from({ length: worksheet.columnCount }, (_, index) => {
      const cell = row.getCell(index + 1);
      return cell.isMerged && cell.master.address !== cell.address ? '' : cellText(cell.value);
    });
    const detection = mappingForHeaders(headers, rowNumber);
    const score = detection.recognized.size;
    if (score > bestScore) {
      best = detection;
      bestScore = score;
    }
  }
  return best;
}

function validateZip(buffer: Buffer): void {
  if (buffer.byteLength < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new WorkspaceError('The selected file is not a valid .xlsx workbook.', 400);
  }
}

export async function inspectWorkspaceArchive(buffer: Buffer, kind: 'xlsx' | 'docx' = 'xlsx'): Promise<JSZip> {
  validateZip(buffer);
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(buffer, { checkCRC32: false, createFolders: false });
  } catch {
    throw new WorkspaceError('The .xlsx archive is damaged or invalid.', 400);
  }
  const entries = Object.values(archive.files).filter(entry => !entry.dir);
  if (entries.length > MAX_ZIP_ENTRIES) throw new WorkspaceError('The workbook contains too many archive entries.', 400);
  const names = new Set(entries.map(entry => entry.name));
  if (!names.has('[Content_Types].xml') || !names.has(kind === 'docx' ? 'word/document.xml' : 'xl/workbook.xml')) {
    throw new WorkspaceError('The selected file is not a valid Excel workbook.', 400);
  }
  let uncompressedTotal = 0;
  const worksheetEntryCount = entries.filter(entry => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name)).length;
  if (worksheetEntryCount > MAX_SHEETS) throw new WorkspaceError(`A workbook can contain at most ${MAX_SHEETS} worksheets.`, 400);
  for (const entry of entries) {
    const uncompressedSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
    if (typeof uncompressedSize !== 'number' || !Number.isSafeInteger(uncompressedSize) || uncompressedSize < 0) {
      throw new WorkspaceError('The workbook archive has invalid size metadata.', 400);
    }
    if (uncompressedSize > MAX_ZIP_ENTRY_BYTES) throw new WorkspaceError('A workbook archive entry is too large to process safely.', 400);
    uncompressedTotal += uncompressedSize;
    if (uncompressedTotal > MAX_UNCOMPRESSED_BYTES) throw new WorkspaceError('The workbook expands beyond the supported uncompressed size.', 400);
  }
  return archive;
}

type XmlElement = { name: string; uri?: string; isSelfClosing: boolean };

/**
 * Rewrites only SpreadsheetML element prefixes in a parsed analysis copy.
 * Saxes supplies namespace-aware element events; a token walk then edits only
 * the element-name spans, preserving attributes, relationship IDs, entities,
 * whitespace, formulas, comments, and all non-SpreadsheetML namespaces.
 */
function normalizeSpreadsheetMlPrefixes(xml: string): string {
  const opens: XmlElement[] = [];
  const closes: XmlElement[] = [];
  const errors: Error[] = [];
  let hasDoctype = false;
  const parser = new SaxesParser({ xmlns: true, fileName: 'workbook XML' });
  parser.on('opentag', tag => opens.push({ name: tag.name, uri: tag.uri, isSelfClosing: tag.isSelfClosing }));
  parser.on('closetag', tag => {
    if (!tag.isSelfClosing) closes.push({ name: tag.name, uri: tag.uri, isSelfClosing: false });
  });
  parser.on('doctype', () => { hasDoctype = true; });
  parser.on('error', error => errors.push(error));
  try {
    parser.write(xml).close();
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error('XML parsing failed.'));
  }
  if (hasDoctype) throw new WorkspaceError('Workbook XML with a DOCTYPE declaration is not supported.', 400);
  if (errors.length) throw new WorkspaceError('A workbook XML part is malformed.', 400);

  const replacements: Array<{ start: number; end: number; value: string }> = [];
  let openIndex = 0;
  let closeIndex = 0;
  let cursor = 0;
  const failStructure = (): never => { throw new WorkspaceError('A workbook XML part could not be safely normalized.', 400); };
  const findTerminator = (start: number, terminator: string): number => {
    const end = xml.indexOf(terminator, start);
    return end < 0 ? failStructure() : end + terminator.length;
  };

  while (cursor < xml.length) {
    const tagStart = xml.indexOf('<', cursor);
    if (tagStart < 0) break;
    if (xml.startsWith('<!--', tagStart)) {
      cursor = findTerminator(tagStart + 4, '-->');
      continue;
    }
    if (xml.startsWith('<![CDATA[', tagStart)) {
      cursor = findTerminator(tagStart + 9, ']]>');
      continue;
    }
    if (xml.startsWith('<?', tagStart)) {
      cursor = findTerminator(tagStart + 2, '?>');
      continue;
    }
    if (xml.startsWith('<!', tagStart)) {
      let quote = '';
      let bracketDepth = 0;
      let end = tagStart + 2;
      for (; end < xml.length; end += 1) {
        const char = xml[end];
        if (quote) {
          if (char === quote) quote = '';
        } else if (char === '"' || char === "'") quote = char;
        else if (char === '[') bracketDepth += 1;
        else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
        else if (char === '>' && bracketDepth === 0) break;
      }
      if (end >= xml.length) return failStructure();
      cursor = end + 1;
      continue;
    }

    const closing = xml[tagStart + 1] === '/';
    const nameStart = tagStart + (closing ? 2 : 1);
    let nameEnd = nameStart;
    while (nameEnd < xml.length && !/[\s/>]/.test(xml[nameEnd])) nameEnd += 1;
    if (nameEnd === nameStart) return failStructure();
    let quote = '';
    let tagEnd = nameEnd;
    for (; tagEnd < xml.length; tagEnd += 1) {
      const char = xml[tagEnd];
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (tagEnd >= xml.length) return failStructure();
    const name = xml.slice(nameStart, nameEnd);
    const isSelfClosing = !closing && /\/\s*$/.test(xml.slice(nameEnd, tagEnd));
    const node = closing ? closes[closeIndex++] : opens[openIndex++];
    if (!node || node.name !== name || (!closing && node.isSelfClosing !== isSelfClosing)) return failStructure();
    if (node.uri === SPREADSHEETML_NAMESPACE && name.includes(':')) {
      replacements.push({ start: nameStart, end: nameEnd, value: name.slice(name.indexOf(':') + 1) });
    }
    cursor = tagEnd + 1;
  }
  if (openIndex !== opens.length || closeIndex !== closes.length) return failStructure();
  for (const replacement of replacements.reverse()) {
    xml = xml.slice(0, replacement.start) + replacement.value + xml.slice(replacement.end);
  }
  return xml;
}

async function analysisCopy(buffer: Buffer, archive: JSZip): Promise<Buffer> {
  let changed = false;
  for (const [path, entry] of Object.entries(archive.files)) {
    if (entry.dir || !path.startsWith('xl/') || !path.endsWith('.xml') || path.split('/').includes('_rels')) continue;
    const xml = await entry.async('string');
    const normalized = normalizeSpreadsheetMlPrefixes(xml);
    if (normalized !== xml) {
      archive.file(path, normalized);
      changed = true;
    }
  }
  return changed ? archive.generateAsync({ type: 'nodebuffer' }) : buffer;
}

function parseNumber(value: unknown, field: string, row: number, errors: WorkspaceIssue[], money: boolean, maxDecimalPlaces = money ? 2 : undefined): Prisma.Decimal | null {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    issue(errors, { row, field, message: `${field} is required.` });
    return null;
  }
  let raw: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
      issue(errors, { row, field, message: `${field} must be a finite safe number.` });
      return null;
    }
    raw = String(value);
  } else if (typeof value === 'string') {
    raw = value.trim().replace(/^[₱$]\s*/, '').replace(/\s*[₱$]$/, '');
    if (raw.includes(',')) {
      if (!/^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(raw)) {
        issue(errors, { row, field, message: `${field} is not a valid number.` });
        return null;
      }
      raw = raw.replace(/,/g, '');
    }
  } else {
    issue(errors, { row, field, message: `${field} must be a number.` });
    return null;
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) {
    issue(errors, { row, field, message: `${field} is not a valid number.` });
    return null;
  }
  let decimal: Prisma.Decimal;
  try {
    decimal = new Prisma.Decimal(raw);
  } catch {
    issue(errors, { row, field, message: `${field} is not a valid number.` });
    return null;
  }
  if (!decimal.isFinite() || decimal.isNegative() || decimal.gt(Number.MAX_SAFE_INTEGER)) {
    issue(errors, { row, field, message: `${field} must be a finite, nonnegative safe number.` });
    return null;
  }
  const numericValue = decimal.toNumber();
  if (!Number.isFinite(numericValue) || !decimal.equals(new Prisma.Decimal(String(numericValue)))) {
    issue(errors, { row, field, message: `${field} cannot be represented without numeric rounding.` });
    return null;
  }
  if (maxDecimalPlaces !== undefined && decimal.decimalPlaces() > maxDecimalPlaces) {
    issue(errors, { row, field, message: `${field} can have at most ${maxDecimalPlaces} decimal places.` });
    return null;
  }
  return decimal;
}

function readMappedCell(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  column: number | null,
  field: string,
  errors: WorkspaceIssue[],
  warnings?: WorkspaceIssue[],
): unknown {
  if (column === null) return null;
  const temporary: WorkspaceIssue[] = [];
  const read = readCell(worksheet.getRow(rowNumber).getCell(column), rowNumber, field, temporary);
  for (const entry of temporary) issue(errors, entry);
  if (read.formulaError) {
    if (read.formulaError !== 'missing cached formula result') {
      issue(errors, { row: rowNumber, field, message: `Formula result is invalid (${read.formulaError}).` });
    }
    return null;
  }
  // Approved intake rule: use the explicitly displayed fixed precision while
  // retaining original workbook bytes and disclosing each changed value.
  if (!['itemCode', 'description', 'unit'].includes(field) && typeof read.value === 'number' && Number.isFinite(read.value) && warnings) {
    const format = (worksheet.getRow(rowNumber).getCell(column).numFmt || '').split(';')[0]
      .replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    if (format && !/[ymdhs%e]/i.test(format)) {
      const fixed = format.match(/0(?:[0#,?]*)\.([0]+)/);
      const places = fixed ? fixed[1].length : /0/.test(format) && !format.includes('.') ? 0 : null;
      if (places !== null && places <= 10) {
        const original = new Prisma.Decimal(String(read.value));
        const displayed = original.toDecimalPlaces(places, Prisma.Decimal.ROUND_HALF_UP);
        if (!original.equals(displayed)) {
          issue(warnings, { row: rowNumber, field, message: `Excel displayed precision (${places} decimal places) used: ${original.toString()} → ${displayed.toFixed(places)}. Original workbook retained.` });
          return displayed.toNumber();
        }
      }
    }
  }
  return read.value;
}

function isNonemptyRow(worksheet: ExcelJS.Worksheet, rowNumber: number): boolean {
  const row = worksheet.getRow(rowNumber);
  for (let column = 1; column <= worksheet.columnCount; column += 1) {
    const value = row.getCell(column).value;
    if (value !== null && value !== undefined && value !== '') return true;
  }
  return false;
}

function isTotalLabel(...values: unknown[]): string | null {
  for (const value of values) {
    const text = cellText(value).toLowerCase().replace(/\s+/g, ' ').trim();
    if (/^(?:grand total|sub\s*total|subtotal)(?:\b|:|$)/.test(text)
      || /^total(?:$|:)/.test(text)
      || /^total (?:project cost|contract amount|boq amount|amount|cost|price|direct cost|indirect cost|estimated cost|tender amount)(?:\b|:|$)/.test(text)) return text;
  }
  return null;
}

function isSectionHeading(description: string, values: unknown[]): boolean {
  return Boolean(description) && values.every(value => value === null || value === undefined || cellText(value) === '');
}

function isRepeatedHeaderRow(worksheet: ExcelJS.Worksheet, rowNumber: number, mapping: WorkspaceMapping): boolean {
  const required: readonly MappingField[] = ['description', 'unit', 'quantity', 'amount'];
  const matchesAlias = (field: MappingField, column: number | null): boolean => {
    if (column === null) return false;
    const value = normalizeHeader(cellText(worksheet.getRow(rowNumber).getCell(column).value));
    if (!value) return false;
    const aliases = headerTerms[field].map(normalizeHeader);
    return aliases.some(alias => value === alias || (alias.length >= 5 && value.includes(alias)));
  };

  // Require the full mapped core to read like headers. A description such as
  // "Quantity survey" on a normal numeric row must never be enough to skip it.
  if (!required.every(field => matchesAlias(field, mapping[field]))) return false;
  if (mapping.itemCode !== null && !matchesAlias('itemCode', mapping.itemCode)) return false;
  if (mapping.unitCost !== null && !matchesAlias('unitCost', mapping.unitCost)) return false;
  return true;
}

function validateMapping(mapping: WorkspaceMapping, columnCount: number, rowCount: number, errors: WorkspaceIssue[]): void {
  if (!Number.isSafeInteger(mapping.headerRow) || mapping.headerRow < 1 || mapping.headerRow > Math.max(rowCount, 1)) {
    issue(errors, { row: 'header', field: 'headerRow', message: 'Choose a valid header row.' });
  }
  for (const field of ['description', 'unit', 'quantity', 'amount'] as const) {
    const column = mapping[field];
    if (column === null || !Number.isSafeInteger(column) || column < 1 || column > columnCount) {
      issue(errors, { row: 'header', field, message: `Map a valid ${field} column.` });
    }
  }
  const assigned = (Object.keys(mapping) as Array<keyof WorkspaceMapping>)
    .filter((field): field is MappingField => field !== 'headerRow')
    .map(field => [field, mapping[field]] as const)
    .filter((entry): entry is readonly [MappingField, number] => entry[1] !== null);
  const seen = new Map<number, MappingField>();
  for (const [field, column] of assigned) {
    if (!Number.isSafeInteger(column) || column < 1 || column > columnCount) {
      issue(errors, { row: 'header', field, message: `Choose a valid ${field} column.` });
    }
    const prior = seen.get(column);
    if (prior) issue(errors, { row: 'header', field, message: `${field} and ${prior} must use different columns.` });
    else seen.set(column, field);
  }
}

function suggestProjectName(fileName: string): string {
  const base = fileName.replace(/\.xlsx$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base.slice(0, 150) || 'New BOQ Project';
}

export function normalizeWorkspaceMapping(value: unknown): WorkspaceMapping | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new WorkspaceError('Column mapping must be a JSON object.', 400);
  const record = value as Record<string, unknown>;
  const allowed = new Set(['headerRow', 'itemCode', 'description', 'unit', 'quantity', 'unitCost', 'amount']);
  if (Object.keys(record).some(key => !allowed.has(key))) throw new WorkspaceError('Column mapping contains an unknown field.', 400);
  if (typeof record.headerRow !== 'number' || !Number.isSafeInteger(record.headerRow)) throw new WorkspaceError('Column mapping needs a valid header row.', 400);
  const fields: Array<Exclude<keyof WorkspaceMapping, 'headerRow'>> = ['itemCode', 'description', 'unit', 'quantity', 'unitCost', 'amount'];
  const mapping = emptyMapping(record.headerRow);
  for (const field of fields) {
    const column = record[field];
    if (column !== null && column !== undefined && (typeof column !== 'number' || !Number.isSafeInteger(column))) {
      throw new WorkspaceError(`Column mapping for ${field} must be a column number or null.`, 400);
    }
    mapping[field] = column === undefined ? null : column as number | null;
  }
  return mapping;
}

export function normalizeWorkspaceBreakdownMapping(value: unknown): WorkspaceBreakdownMapping | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new WorkspaceError('Cost-breakdown mapping must be a JSON object.', 400);
  const record = value as Record<string, unknown>;
  const fields = Object.keys(breakdownHeaderTerms) as BreakdownField[];
  if (Object.keys(record).some(key => !fields.includes(key as BreakdownField))) throw new WorkspaceError('Cost-breakdown mapping contains an unknown field.', 400);
  const mapping: WorkspaceBreakdownMapping = {};
  for (const field of fields) {
    const column = record[field];
    if (column !== null && column !== undefined && (typeof column !== 'number' || !Number.isSafeInteger(column))) {
      throw new WorkspaceError(`Cost-breakdown mapping for ${field} must be a column number or null.`, 400);
    }
    mapping[field] = column === undefined ? null : column as number | null;
  }
  return mapping;
}

function validateBreakdownMapping(mapping: WorkspaceBreakdownMapping, columnCount: number, issues: WorkspaceIssue[]): void {
  const seen = new Set<number>();
  for (const [field, column] of Object.entries(mapping) as Array<[BreakdownField, number | null]>) {
    if (column === null) continue;
    if (!Number.isSafeInteger(column) || column < 1 || column > columnCount) {
      issue(issues, { row: 'header', field, message: `Choose a valid ${field} column.` });
    } else if (seen.has(column)) {
      issue(issues, { row: 'header', field, message: 'Cost-breakdown fields must use different columns.' });
    } else seen.add(column);
  }
}

export async function parseWorkspaceWorkbook(options: {
  nonPricedRows?: NonPricedSourceRow[];
  buffer: Buffer;
  fileName: string;
  selectedSheet?: string | null;
  mapping?: WorkspaceMapping | null;
  breakdownMapping?: WorkspaceBreakdownMapping | null;
  previewOffset?: number;
  sectionKey?: string | null;
  documentToken?: string | null;
  documentContext?: string;
  trustedDocumentExtraction?: unknown;
}): Promise<{ analysis: WorkspaceAnalysis; items: WorkspaceItem[] }> {
  const { buffer, fileName } = options;
  if (options.nonPricedRows !== undefined && (!Array.isArray(options.nonPricedRows) || options.nonPricedRows.length > 100 || options.nonPricedRows.some(row => !row || !Number.isSafeInteger(row.rowNumber) || row.rowNumber < 1 || typeof row.reason !== 'string' || row.reason.trim().length < 5 || row.reason.length > 300) || new Set(options.nonPricedRows.map(row => row.rowNumber)).size !== options.nonPricedRows.length)) {
    throw new WorkspaceError('Each non-priced source row needs a unique row number and a reason of 5–300 characters.', 400);
  }
  if (/\.(pdf|docx)$/i.test(fileName)) return parseWorkspaceDocument(options, parseWorkspaceWorkbook);
  if (!/\.xlsx$/i.test(fileName)) throw new WorkspaceError('Only .xlsx workbooks are supported.', 400);
  if (!buffer.byteLength) throw new WorkspaceError('The workbook is empty.', 400);
  if (buffer.byteLength > MAX_WORKSPACE_FILE_BYTES) throw new WorkspaceError('The workbook must be 10 MiB or smaller.', 400);
  const archive = await inspectWorkspaceArchive(buffer);
  const analysisBuffer = await analysisCopy(buffer, archive);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(analysisBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new WorkspaceError('The workbook could not be read. Save it as a standard .xlsx file and try again.', 400);
  }
  if (workbook.worksheets.length < 1 || workbook.worksheets.length > MAX_SHEETS) {
    throw new WorkspaceError(`A workbook must contain between 1 and ${MAX_SHEETS} worksheets.`, 400);
  }

  let totalCells = 0;
  for (const worksheet of workbook.worksheets) {
    if (worksheet.rowCount > MAX_ROWS_PER_SHEET) throw new WorkspaceError(`Worksheet ${worksheet.name} exceeds ${MAX_ROWS_PER_SHEET} rows.`, 400);
    if (worksheet.columnCount > MAX_COLUMNS_PER_SHEET) throw new WorkspaceError(`Worksheet ${worksheet.name} exceeds ${MAX_COLUMNS_PER_SHEET} columns.`, 400);
    totalCells += worksheet.rowCount * worksheet.columnCount;
    if (totalCells > MAX_WORKBOOK_CELLS) throw new WorkspaceError('The workbook exceeds the supported cell count.', 400);
  }

  const detected = workbook.worksheets.map(worksheet => {
    const detection = findHeader(worksheet);
    const descriptionColumn = detection.mapping.description;
    const candidate = descriptionColumn !== null && [detection.mapping.quantity, detection.mapping.amount]
      .some(column => column !== null && column !== descriptionColumn);
    return { worksheet, detection, candidate };
  });
  const sheetSummaries = detected.map(({ worksheet, candidate }) => ({ name: worksheet.name, rowCount: worksheet.rowCount, candidate }));
  const candidateSheets = detected.filter(sheet => sheet.candidate);
  const selected = options.selectedSheet
    ? detected.find(sheet => sheet.worksheet.name === options.selectedSheet)
    : candidateSheets.length === 1 ? candidateSheets[0] : undefined;
  if (options.selectedSheet && !selected) throw new WorkspaceError('The selected worksheet was not found.', 400);
  const selectedSheet = selected?.worksheet.name ?? null;
  const parseErrors: WorkspaceIssue[] = [];
  const warnings: WorkspaceIssue[] = [];

  if (!selected) {
    if (candidateSheets.length > 1) {
      issue(parseErrors, { row: 'sheet', field: 'selectedSheet', message: 'Choose which candidate BOQ worksheet to analyze.' });
    } else {
      issue(parseErrors, { row: 'sheet', field: 'selectedSheet', message: 'No worksheet with recognizable BOQ columns was found. Select a worksheet and map its columns.' });
    }
  }

  const worksheet = selected?.worksheet;
  const mapping = options.mapping ?? selected?.detection.mapping ?? null;
  if (worksheet && options.nonPricedRows?.some(row => !mapping || row.rowNumber <= mapping.headerRow || row.rowNumber > worksheet.rowCount)) throw new WorkspaceError('A non-priced source decision must refer to a body row in the selected sheet.', 400);
  if (worksheet && mapping) validateMapping(mapping, worksheet.columnCount, worksheet.rowCount, parseErrors);
  const safeHeaderRow = mapping && Number.isSafeInteger(mapping.headerRow) && mapping.headerRow >= 1 && mapping.headerRow <= (worksheet?.rowCount || 1)
    ? mapping.headerRow
    : 1;
  const populated = new Map<number, number>();
  const pricedPopulated = new Map<number, number>();
  let pricedRowCount = 0;
  if (worksheet && mapping) {
    const hasValue = (value: unknown) => value !== null && value !== undefined && (typeof value !== 'string' || value.trim() !== '');
    const positiveNumber = (value: unknown) => {
      const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim().replace(/^[₱$]\s*/, '').replaceAll(',', '') : '';
      return text !== '' && Number.isFinite(Number(text)) && Number(text) > 0;
    };
    for (let rowNumber = safeHeaderRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const values = Array.from({ length: worksheet.columnCount }, (_, index) => readCell(worksheet.getRow(rowNumber).getCell(index + 1), rowNumber, 'columnEvidence', []).value);
      const description = mapping.description ? cellText(values[mapping.description - 1]) : '';
      const footer = isTotalLabel(description, mapping.itemCode ? values[mapping.itemCode - 1] : null)
        && (!mapping.itemCode || !cellText(values[mapping.itemCode - 1]))
        && (!mapping.unit || !cellText(values[mapping.unit - 1]))
        && (!mapping.quantity || !hasValue(values[mapping.quantity - 1]));
      const priced = Boolean(!footer && description && ((mapping.quantity && positiveNumber(values[mapping.quantity - 1])) || (mapping.amount && positiveNumber(values[mapping.amount - 1]))));
      if (priced) pricedRowCount += 1;
      values.forEach((value, index) => {
        if (!hasValue(value)) return;
        populated.set(index + 1, (populated.get(index + 1) || 0) + 1);
        if (priced) pricedPopulated.set(index + 1, (pricedPopulated.get(index + 1) || 0) + 1);
      });
    }
  }
  const columns = worksheet && mapping
    ? Array.from({ length: worksheet.columnCount }, (_, index) => ({
      index: index + 1,
      label: cellText(worksheet.getRow(safeHeaderRow).getCell(index + 1).value) || `Column ${index + 1}`,
      populatedRows: populated.get(index + 1) || 0,
      pricedPopulatedRows: pricedPopulated.get(index + 1) || 0,
      pricedRowCount,
    }))
    : [];
  if (worksheet && selected && !options.mapping) {
    for (const field of selected.detection.ambiguous) {
      issue(warnings, { row: selected.detection.mapping.headerRow, field, message: `Multiple headers resemble ${field}. Choose the correct column manually.` });
    }
  }
  const detectedBreakdownMapping = worksheet
    ? breakdownMappingForHeaders(Array.from({ length: worksheet.columnCount }, (_, index) => cellText(worksheet.getRow(safeHeaderRow).getCell(index + 1).value)))
    : {};
  const breakdownMapping = options.breakdownMapping ?? detectedBreakdownMapping;
  if (worksheet && options.breakdownMapping) validateBreakdownMapping(breakdownMapping, worksheet.columnCount, parseErrors);
  if (worksheet && mapping && mapping.unitCost === null) {
    issue(warnings, { row: 'header', field: 'unitCost', message: 'No unit-cost column is mapped. Unit cost is not provided; the workbook amount remains authoritative.' });
  }

  const items: WorkspaceItem[] = [];
  let activeSection = 'General';
  let activeSectionSourceKey = 'source:default';
  let activeSectionStartRow: number | null = null;
  let activeSectionOrder = 1;
  const footerTotals: Array<{ row: number; label: string; amount: Prisma.Decimal }> = [];
  for (const [field, column] of Object.entries(breakdownMapping)) {
    if (column === null) {
      const aliases = breakdownHeaderTerms[field as BreakdownField].map(normalizeHeader);
      const duplicates = columns.filter(entry => aliases.includes(normalizeHeader(entry.label)));
      if (duplicates.length > 1) issue(warnings, { row: safeHeaderRow, field, message: `Multiple headers match ${field}; the breakdown value was left unmapped.` });
    }
  }
  if (worksheet && mapping && parseErrors.length === 0) {
    for (let rowNumber = mapping.headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      if (!isNonemptyRow(worksheet, rowNumber)) continue;
      if (isRepeatedHeaderRow(worksheet, rowNumber, mapping)) {
        issue(warnings, { row: rowNumber, field: 'headerRow', message: 'Repeated BOQ column header skipped between printed sections.' });
        continue;
      }
      const rowErrors: WorkspaceIssue[] = [];
      const itemCodeValue = readMappedCell(worksheet, rowNumber, mapping.itemCode, 'itemCode', rowErrors, warnings);
      const descriptionValue = readMappedCell(worksheet, rowNumber, mapping.description, 'description', rowErrors, warnings);
      const unitValue = readMappedCell(worksheet, rowNumber, mapping.unit, 'unit', rowErrors, warnings);
      const quantityValue = readMappedCell(worksheet, rowNumber, mapping.quantity, 'quantity', rowErrors, warnings);
      const unitCostValue = readMappedCell(worksheet, rowNumber, mapping.unitCost, 'unitCost', rowErrors, warnings);
      const amountValue = readMappedCell(worksheet, rowNumber, mapping.amount, 'amount', rowErrors, warnings);
      const description = cellText(descriptionValue);
      const itemCode = cellText(itemCodeValue);
      const blank = (value: unknown) => value === null || value === undefined || cellText(value) === '';
      const nonPricedDecision = options.nonPricedRows?.find(row => row.rowNumber === rowNumber);
      if (nonPricedDecision) {
        if (!description || ![unitValue, unitCostValue, amountValue].every(blank)) {
          issue(parseErrors, {row:rowNumber,field:'amount',message:'A priced or malformed source row cannot be excluded as non-priced scope.'});
          continue;
        }
        if (!blank(quantityValue) && !parseNumber(quantityValue, 'quantity', rowNumber, rowErrors, false)) {
          for (const entry of rowErrors) issue(parseErrors, entry);
          continue;
        }
        issue(warnings, {row:rowNumber,field:'description',message:`User-confirmed non-priced scope: ${description}. Quantity ${cellText(quantityValue) || 'not stated'}. Reason: ${nonPricedDecision.reason.trim()}. Original retained; no price inferred.`});
        continue;
      }
      if ([descriptionValue, unitValue, quantityValue].every(value => /^\(\d+\)$/.test(cellText(value)))) {
        issue(warnings, { row: rowNumber, field: 'headerRow', message: 'Printed column-number/formula annotation row retained in the source, excluded from priced BOQ items.' });
        continue;
      }
      if (/^(?:by\s+client|included|excluded|n\/?a|existing\.\s*tap only)$/i.test(cellText(amountValue)) && blank(unitCostValue)) {
        issue(warnings, { row: rowNumber, field: 'description', message: `Non-priced scope annotation retained in source: ${description || itemCode} · ${cellText(amountValue)} · quantity ${cellText(quantityValue) || 'not stated'} ${cellText(unitValue)}. No price or allowance inferred.` });
        continue;
      }
      const amountCell = mapping.amount === null ? null : worksheet.getRow(rowNumber).getCell(mapping.amount);
      const amountFormula = amountCell?.formula;
      if ([descriptionValue, itemCodeValue, unitValue, quantityValue, unitCostValue].every(blank)
          && typeof amountFormula === 'string' && /^SUM\s*\(/i.test(amountFormula)) {
        const localErrors: WorkspaceIssue[] = [];
        const subtotal = parseNumber(amountValue, 'amount', rowNumber, localErrors, true);
        if (subtotal) {
          footerTotals.push({ row: rowNumber, label: 'subtotal', amount: subtotal });
          issue(warnings, { row: rowNumber, field: 'amount', message: `Unlabelled SUM subtotal ${subtotal.toFixed(2)} retained as source evidence, excluded from item totals to prevent double counting.` });
          continue;
        }
      }
      if (rowErrors.length > 0) {
        for (const entry of rowErrors) issue(parseErrors, entry);
        continue;
      }
      const totalLabel = isTotalLabel(descriptionValue, itemCodeValue);
      const mergedTotalLabel = Boolean(totalLabel) && [itemCodeValue, descriptionValue, unitValue, quantityValue, unitCostValue]
        .every(value => blank(value) || isTotalLabel(value) === totalLabel);
      const footerLabel = totalLabel
        && ((!itemCode && blank(unitValue) && blank(quantityValue)) || mergedTotalLabel)
        ? isTotalLabel(descriptionValue, itemCodeValue)
        : null;
      if (footerLabel) {
        if (amountValue === null || amountValue === undefined || cellText(amountValue) === '') {
          issue(warnings, { row: rowNumber, field: 'amount', message: 'Footer total row has no numeric amount to compare.' });
        } else {
          const localErrors: WorkspaceIssue[] = [];
          const amount = parseNumber(amountValue, 'amount', rowNumber, localErrors, true);
          if (amount) {
            footerTotals.push({ row: rowNumber, label: footerLabel, amount });
          }
          else issue(warnings, { row: rowNumber, field: 'amount', message: 'Footer total could not be compared with the parsed item sum.' });
        }
        continue;
      }

      if (isSectionHeading(description, [unitValue, quantityValue, unitCostValue, amountValue])) {
        const sectionLabel = itemCode ? `${itemCode} ${description}`.trim() : description;
        activeSection = sectionLabel;
        activeSectionSourceKey = `source:heading:${rowNumber}`;
        activeSectionStartRow = rowNumber;
        activeSectionOrder += 1;
        issue(warnings, { row: rowNumber, field: 'description', message: `Section heading ${sectionLabel} retained as the category for following BOQ items.` });
        continue;
      }
      if (!description && [itemCodeValue, unitValue, quantityValue, unitCostValue, amountValue].every(value => value === null || value === undefined || cellText(value) === '')) {
        issue(parseErrors, { row: rowNumber, field: 'mapping', message: 'This nonempty row has no values in the mapped BOQ columns.' });
        continue;
      }

      if (!description) issue(rowErrors, { row: rowNumber, field: 'description', message: 'Item description is required.' });
      const unitText = cellText(unitValue).trim();
      const unitDefaulted = !unitText;
      const quantityDefaulted = quantityValue === null || quantityValue === undefined || cellText(quantityValue) === '';
      const quantity = quantityDefaulted ? new Prisma.Decimal(1) : parseNumber(quantityValue, 'quantity', rowNumber, rowErrors, false);
      const amount = parseNumber(amountValue, 'amount', rowNumber, rowErrors, true);
      let unitCost: Prisma.Decimal | null = null;
      if (mapping.unitCost !== null && unitCostValue !== null && unitCostValue !== undefined && cellText(unitCostValue) !== '') {
        unitCost = parseNumber(unitCostValue, 'unitCost', rowNumber, rowErrors, false, 4);
      } else if (mapping.unitCost !== null) {
        issue(warnings, { row: rowNumber, field: 'unitCost', message: 'Unit cost is blank and will be stored as 0; the BOQ amount remains authoritative.' });
      }
      const breakdownValues: Partial<Record<BreakdownField, Prisma.Decimal | null>> = {};
      for (const [field, column] of Object.entries(breakdownMapping) as Array<[BreakdownField, number | null]>) {
        if (column === null) continue;
        const rawValue = readMappedCell(worksheet, rowNumber, column, field, rowErrors, warnings);
        if (rawValue === null || rawValue === undefined || cellText(rawValue) === '') continue;
        breakdownValues[field] = parseNumber(rawValue, field, rowNumber, rowErrors, field !== 'percentage');
      }

      if (rowErrors.length > 0) {
        for (const entry of rowErrors) issue(parseErrors, entry);
        continue;
      }
      if (!quantity || !amount) continue;
      const sourceUnitCostValue = unitCost?.toNumber() ?? null;
      const quantityNumber = quantity.toNumber();
      const amountNumber = amount.toNumber();
      if (sourceUnitCostValue !== null && (!Number.isFinite(sourceUnitCostValue) || sourceUnitCostValue > Number.MAX_SAFE_INTEGER)) {
        issue(parseErrors, { row: rowNumber, field: 'unitCost', message: 'Unit cost is outside the supported numeric range.' });
        continue;
      }
      if ((quantityNumber === 0 && (sourceUnitCostValue === null || amountNumber !== 0)) || (quantityNumber > 0 && !Number.isFinite(quantityNumber))) {
        issue(parseErrors, { row: rowNumber, field: 'quantity', message: 'A zero quantity needs a stated rate and a zero amount; positive amounts need positive quantities.' });
        continue;
      }
      const tolerance = sourceUnitCostValue === null ? 0 : Math.abs(quantityNumber) * 0.00005 + Math.abs(sourceUnitCostValue) * 0.00005 + 0.01;
      const statedRateReconciles = sourceUnitCostValue !== null && Math.abs(quantityNumber * sourceUnitCostValue - amountNumber) <= tolerance + Number.EPSILON;
      const rateDerived = !statedRateReconciles;
      const normalizedUnitCost = rateDerived && quantityNumber > 0
        ? new Prisma.Decimal(String(amountNumber)).div(String(quantityNumber)).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
        : unitCost ?? new Prisma.Decimal(0);
      const unitCostValueNumber = normalizedUnitCost.toNumber();
      if (!Number.isFinite(unitCostValueNumber) || unitCostValueNumber > Number.MAX_SAFE_INTEGER) {
        issue(parseErrors, { row: rowNumber, field: 'unitCost', message: 'Unit cost is outside the supported numeric range.' });
        continue;
      }
      items.push({
        sourceRowNumber: rowNumber,
        section: activeSection,
        sectionSourceKey: activeSectionSourceKey,
        sectionOrder: activeSectionOrder,
        sectionStartRow: activeSectionStartRow,
        quantityDefaulted,
        unitDefaulted,
        itemCodeSynthesized: !itemCode.trim(),
        sourceUnitCost: sourceUnitCostValue,
        rateDerived,
        itemCode,
        description,
        unit: unitDefaulted ? 'lot' : unitText,
        quantity: quantity.toNumber(),
        unitCost: unitCostValueNumber,
        amount: amount.toNumber(),
        ...Object.fromEntries(Object.entries(breakdownValues).map(([field, value]) => [field, value?.toNumber() ?? null])),
      });
    }
  }

  const total = items.reduce((sum, item) => sum.plus(String(item.amount)), new Prisma.Decimal(0));
  if (total.gt(Number.MAX_SAFE_INTEGER)) issue(parseErrors, { row: 'total', field: 'amount', message: 'The sum of BOQ amounts exceeds the supported safe numeric range.' });
  const normalizedTotalLabel = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*:\s*$/, '');
  const finalTotalLabels = new Set(['grand total', 'total project cost', 'total cost of project', 'project total', 'total contract amount']);
  const finalTotalFamily = footerTotals.filter(entry => finalTotalLabels.has(normalizedTotalLabel(entry.label)));
  const exactTotals = footerTotals.filter(entry => normalizedTotalLabel(entry.label) === 'total');
  let lastNonemptyRow = 0;
  if (worksheet) for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) if (isNonemptyRow(worksheet, rowNumber)) lastNonemptyRow = rowNumber;
  const finalExactTotal = exactTotals.length === 1 && exactTotals[0].row === lastNonemptyRow ? exactTotals : [];
  const printedTotalEntry = finalTotalFamily.length === 1 ? finalTotalFamily[0] : finalTotalFamily.length === 0 ? finalExactTotal[0] : undefined;
  const printedTotal = printedTotalEntry?.amount ?? null;
  if (printedTotalEntry && !printedTotalEntry.amount.minus(total).abs().lte('0.01')) {
    issue(warnings, { row: printedTotalEntry.row, field: 'printedTotal', message: `Printed workbook total ${printedTotalEntry.amount.toFixed(2)} differs from the as-read BOQ total ${total.toFixed(2)}; review this discrepancy.` });
  }

  const sectionsByKey = new Map<string, { key: string; name: string; order: number; startRow: number | null; items: WorkspaceItem[] }>();
  for (const item of items) {
    const current = sectionsByKey.get(item.sectionSourceKey);
    if (current) current.items.push(item);
    else sectionsByKey.set(item.sectionSourceKey, {
      key: item.sectionSourceKey,
      name: item.section || 'Unsectioned',
      order: item.sectionOrder,
      startRow: item.sectionStartRow,
      items: [item],
    });
  }
  const sections = [...sectionsByKey.values()].sort((left, right) => left.order - right.order || (left.startRow ?? 0) - (right.startRow ?? 0));
  const sectionSummaries = sections.map(section => ({
    key: section.key,
    name: section.name,
    order: section.order,
    startRow: section.startRow,
    itemCount: section.items.length,
    total: section.items.reduce((sum, item) => sum.plus(String(item.amount)), new Prisma.Decimal(0)).toFixed(2),
  }));
  const previewOffset = options.previewOffset ?? 0;
  if (!Number.isSafeInteger(previewOffset) || previewOffset < 0) throw new WorkspaceError('Preview offset must be a nonnegative whole number.', 400);
  const selectedSectionKey = options.sectionKey ?? null;
  const section = selectedSectionKey === null ? null : sections.find(candidate => candidate.key === selectedSectionKey);
  if (selectedSectionKey !== null && !section) throw new WorkspaceError('The selected BOQ section is no longer available. Choose a section and try again.', 400);
  const filteredItems = section?.items ?? items;
  const filteredTotal = filteredItems.reduce((sum, item) => sum.plus(String(item.amount)), new Prisma.Decimal(0));

  const metadata = readProjectMetadata(workbook);
  const analysis: WorkspaceAnalysis = {
    extractedProjectName: metadata.projectName,
    extractedContractAmount: metadata.contractAmount,
    fileName,
    fileHash: createHash('sha256').update(buffer).digest('hex'),
    sheets: sheetSummaries,
    selectedSheet,
    mapping,
    breakdownMapping,
    columns,
    sections: sectionSummaries,
    preview: filteredItems.slice(previewOffset, previewOffset + PREVIEW_SIZE),
    itemCount: items.length,
    total: total.toFixed(2),
    selectedSectionKey,
    previewOffset,
    previewPageSize: PREVIEW_SIZE,
    filteredItemCount: filteredItems.length,
    filteredTotal: filteredTotal.toFixed(2),
    printedTotal: printedTotal?.toFixed(2) ?? null,
    errors: parseErrors,
    warnings,
    suggestedProjectName: metadata.projectName || suggestProjectName(fileName),
  };
  return { analysis, items };
}

export async function analyzeBOQWorkbook(options: {
  buffer: Buffer;
  fileName: string;
  selectedSheet?: string | null;
  mapping?: WorkspaceMapping | null;
  breakdownMapping?: WorkspaceBreakdownMapping | null;
  previewOffset?: number;
  sectionKey?: string | null;
  documentToken?: string | null;
  documentContext?: string;
}): Promise<WorkspaceAnalysis> {
  return (await parseWorkspaceWorkbook(options)).analysis;
}
