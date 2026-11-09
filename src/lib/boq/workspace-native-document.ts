import { SaxesParser } from 'saxes';
import { inspectWorkspaceArchive } from './workspace-parser';
import { WorkspaceError } from './workspace-types';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_LENGTH = 400_000;
const MAX_ROWS = 500;
const MAX_PDF_PAGES = 500;
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export type NativeDocumentItem = {
  section: string | null;
  itemCode: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  unitCost: number | null;
  amount: number | null;
  sourceReference: string | null;
};

export type NativeDocumentReading = {
  projectName: string | null;
  contractAmount: number | null;
  items: NativeDocumentItem[];
};

type Row = string[];
type ParsedTable = { rows: Row[]; reference: string };
type HeaderMap = { section: number | null; itemCode: number | null; description: number; unit: number | null; quantity: number | null; unitCost: number | null; amount: number };

function fail(message: string, status = 400): never {
  throw new WorkspaceError(message, status);
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizedHeader(value: string): string {
  return cleanText(value).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findColumn(headers: string[], terms: string[]): number | null {
  const normalized = headers.map(normalizedHeader);
  const matches = normalized.flatMap((header, index) => terms.includes(header) ? [index] : []);
  return matches.length === 1 ? matches[0] : null;
}

function mapHeaders(row: Row): HeaderMap | null {
  const headers = row.map(normalizedHeader);
  const description = findColumn(headers, ['description', 'item description', 'particulars', 'scope of work', 'work item', 'material description']);
  const amount = findColumn(headers, ['amount', 'line amount', 'line total', 'total amount', 'extended cost', 'total cost', 'total price', 'extension']);
  if (description === null || amount === null || description === amount) return null;
  const section = findColumn(headers, ['section', 'work section', 'category']);
  const itemCode = findColumn(headers, ['item code', 'item no', 'item number', 'item ref', 'reference', 'code']);
  const unit = findColumn(headers, ['unit', 'uom', 'unit of measure']);
  const quantity = findColumn(headers, ['quantity', 'qty']);
  const unitCost = findColumn(headers, ['unit cost', 'unit price', 'unit rate', 'rate', 'price per unit']);
  return { section, itemCode, description, unit, quantity, unitCost, amount };
}

function parseNumber(value: string | undefined): number | null {
  const text = cleanText(value || '');
  if (!text || /^[-–—]$/.test(text)) return null;
  const negative = /^\(.*\)$/.test(text);
  const cleaned = text.replace(/[₱$€£¥]/g, '').replace(/\b(?:php|usd|eur)\b/gi, '').replace(/[(),\s]/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const number = Number(cleaned) * (negative ? -1 : 1);
  return Number.isFinite(number) && number >= 0 && number <= Number.MAX_SAFE_INTEGER ? number : null;
}

function metadata(text: string): Pick<NativeDocumentReading, 'projectName' | 'contractAmount'> {
  const projectMatch = text.match(/(?:project name|name of project|contract name)\s*[:\-]\s*([^\r\n]{1,191})/i);
  const amountMatch = text.match(/(?:signed contract value|contract amount|contract value|total contract price|grand total)\s*[:\-]?\s*(?:PHP|₱)?\s*([\d,]+(?:\.\d{1,2})?)/i);
  return {
    projectName: projectMatch ? cleanText(projectMatch[1]).slice(0, 191) || null : null,
    contractAmount: amountMatch ? parseNumber(amountMatch[1]) : null,
  };
}

function isTotalLabel(value: string): boolean {
  const text = normalizedHeader(value);
  // "Sub-total Concrete Works" style labels are totals too, not items.
  return /^(?:sub\s*total|grand\s*total)(?:\s|$)/.test(text)
    || /^(?:total amount|total price|contract sum|carried forward|brought forward)$/.test(text);
}

function looksLikeUnmappedPricedRow(row: Row): boolean {
  if (row.length <= 2) return false;
  const values = row.map(cleanText).filter(Boolean);
  if (values.length < 2 || !values.some(value => parseNumber(value) === null)) return false;
  const last = parseNumber(row[row.length - 1]);
  const penultimate = parseNumber(row[row.length - 2]);
  return last !== null || (penultimate !== null && values.filter(value => parseNumber(value) !== null).length >= 2);
}

function isUnmappedPricedTable(table: ParsedTable): boolean {
  if (table.rows.some(row => mapHeaders(row) !== null)) return false;
  return table.rows.some(looksLikeUnmappedPricedRow);
}

function parseTables(tables: ParsedTable[], text: string): NativeDocumentReading | null {
  // Do not return a partial native reading when another table looks priced but
  // its columns cannot be mapped. Small metadata tables remain permitted.
  if (tables.some(isUnmappedPricedTable)) return null;
  const result: NativeDocumentReading = { ...metadata(text), items: [] };
  let activeSection: string | null = null;
  let recognizedTableCount = 0;

  for (const table of tables) {
    const headerIndex = table.rows.findIndex(row => mapHeaders(row) !== null);
    if (headerIndex < 0) continue;
    const map = mapHeaders(table.rows[headerIndex])!;
    recognizedTableCount += 1;

    for (let index = headerIndex + 1; index < table.rows.length; index += 1) {
      const row = table.rows[index].map(cleanText);
      if (!row.some(Boolean)) continue;

      const description = row[map.description] || '';
      const nonemptyCells = row.filter(Boolean);
      const repeatedHeader = mapHeaders(row);
      if (repeatedHeader) {
        if (JSON.stringify(repeatedHeader) !== JSON.stringify(map)) return null;
        continue;
      }
      const otherMapped = [map.itemCode, map.unit, map.quantity, map.unitCost, map.amount]
        .filter((column): column is number => column !== null)
        .some(column => Boolean(row[column]));
      const amount = parseNumber(row[map.amount]);
      if (!description && amount !== null) return null;
      if (!description && nonemptyCells.length === 1) {
        activeSection = nonemptyCells[0];
        continue;
      }
      if (!description && map.section !== null && row[map.section]) {
        activeSection = row[map.section];
        continue;
      }
      // One-cell rows inside Word tables are often section labels spanning columns.
      if (description && !otherMapped) {
        if (isTotalLabel(description)) continue;
        activeSection = description;
        continue;
      }
      if (!description || isTotalLabel(description)) continue;

      if (amount === null) return null;
      const sectionValue = map.section === null ? null : row[map.section] || null;
      if (sectionValue) activeSection = sectionValue;
      result.items.push({
        section: sectionValue || activeSection,
        itemCode: map.itemCode === null ? null : row[map.itemCode] || null,
        description,
        unit: map.unit === null ? null : row[map.unit] || null,
        quantity: map.quantity === null ? null : parseNumber(row[map.quantity]),
        unitCost: map.unitCost === null ? null : parseNumber(row[map.unitCost]),
        amount,
        sourceReference: `${table.reference}, row ${index + 1}`.slice(0, 200),
      });
      if (result.items.length > MAX_ROWS) fail('The document contains more than 500 priced rows. Split it into smaller BOQ documents.', 422);
    }
  }

  if (!recognizedTableCount || !result.items.length) return null;
  return result;
}

async function readWordTables(buffer: Buffer): Promise<{ tables: ParsedTable[]; text: string }> {
  const archive = await inspectWorkspaceArchive(buffer, 'docx');
  const document = archive.file('word/document.xml');
  if (!document) fail('The Word document has no readable document body.');
  const xml = await document.async('string');
  const tables: ParsedTable[] = [];
  const paragraphs: string[] = [];
  let currentTable: Row[] | null = null;
  let currentRow: string[] | null = null;
  let inCell = false;
  let inText = false;
  let inParagraph = false;
  let cellText = '';
  let paragraphText = '';
  let invalid = false;
  const parser = new SaxesParser({ xmlns: true });
  parser.on('doctype', () => { invalid = true; });
  parser.on('error', () => { invalid = true; });
  parser.on('opentag', tag => {
    if (tag.uri !== WORD_NS) return;
    if (tag.local === 'tbl') {
      if (currentTable) invalid = true;
      else currentTable = [];
    } else if (tag.local === 'tr' && currentTable) currentRow = [];
    else if (tag.local === 'tc' && currentRow) { inCell = true; cellText = ''; }
    else if (tag.local === 'p' && !currentTable) { inParagraph = true; paragraphText = ''; }
    else if (tag.local === 't') inText = true;
    else if (tag.local === 'tab') { if (inCell) cellText += '\t'; else if (inParagraph) paragraphText += '\t'; }
    else if (tag.local === 'br') { if (inCell) cellText += ' '; else if (inParagraph) paragraphText += ' '; }
  });
  parser.on('text', value => { if (inText) { if (inCell) cellText += value; else if (inParagraph) paragraphText += value; } });
  parser.on('closetag', tag => {
    if (tag.uri !== WORD_NS) return;
    if (tag.local === 't') inText = false;
    else if (tag.local === 'tc' && currentRow) { currentRow.push(cleanText(cellText)); inCell = false; }
    else if (tag.local === 'tr' && currentTable && currentRow) { currentTable.push(currentRow); currentRow = null; }
    else if (tag.local === 'tbl' && currentTable) {
      tables.push({ rows: currentTable, reference: `Table ${tables.length + 1}` });
      currentTable = null;
    } else if (tag.local === 'p' && inParagraph) {
      const value = cleanText(paragraphText);
      if (value) paragraphs.push(value);
      inParagraph = false;
    }
  });
  try { parser.write(xml).close(); } catch { invalid = true; }
  if (invalid) fail('The Word document is malformed or uses unsupported nested table content.');
  const text = paragraphs.join('\n');
  const tableTextLength = tables.reduce((sum, table) => sum + table.rows.flat().join(' ').length, 0);
  if (text.length + tableTextLength > MAX_TEXT_LENGTH) fail('The Word document contains too much text. Select the intended BOQ document.', 413);
  return { tables, text };
}

async function readPdfTables(buffer: Buffer): Promise<{ tables: ParsedTable[]; text: string }> {
  if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) fail('The selected file is not a valid PDF.');
  // PDF.js loads native graphics at module evaluation. Keep it isolated so a
  // missing PDF runtime cannot crash Excel/Word intake before the route runs.
  let PDFParse: typeof import('pdf-parse')['PDFParse'];
  try {
    ({ PDFParse } = await import('pdf-parse'));
  } catch {
    console.warn('Built-in PDF reader is unavailable; using the upload helper.');
    return { tables: [], text: '' };
  }
  const parser = new PDFParse({ data: buffer, stopAtErrors: true, isEvalSupported: false });
  try {
    const info = await parser.getInfo();
    if (info.total > MAX_PDF_PAGES) fail('The PDF contains more than 500 pages. Split it into smaller BOQ documents.', 413);
    const textResult = await parser.getText();
    if (textResult.text.length > MAX_TEXT_LENGTH) fail('The PDF contains too much text. Select the intended BOQ document.', 413);
    let tables: ParsedTable[] = [];
    try {
      const tableResult = await parser.getTable();
      tables = tableResult.mergedTables.map((rows, index) => ({ rows, reference: `PDF table ${index + 1}` }));
    } catch {
      // Table geometry detection can fail for safe but unsupported layouts;
      // text extraction already succeeded, so let the caller use AI fallback.
    }
    return { tables, text: textResult.text };
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
    fail('The PDF is malformed or could not be read safely.');
  } finally {
    await parser.destroy();
  }
}

/** Native-first document extraction. Returns null when no complete priced table is confidently recognized. */
export async function nativeExtractDocument(buffer: Buffer, kind: 'pdf' | 'docx'): Promise<NativeDocumentReading | null> {
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) fail('The document must be between 1 byte and 10 MiB.', 413);
  const extracted = kind === 'docx' ? await readWordTables(buffer) : await readPdfTables(buffer);
  const tableText = extracted.tables.flatMap(table => table.rows.flat()).join('\n');
  return parseTables(extracted.tables, `${extracted.text}\n${tableText}`);
}
