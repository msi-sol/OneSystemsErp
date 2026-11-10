import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

/**
 * Finds every DUPA inside one spreadsheet so a single file can carry many DUPAs: one per worksheet, several
 * stacked in one worksheet, or both. A DUPA starts at a component table header (a "Description" column plus an
 * amount/cost column). A later header in the same worksheet starts a NEW DUPA only when the title lines above it
 * name one ("DUPA", "Unit price analysis", "Pay item", "Item no."); otherwise it is a sub-table (Labor /
 * Equipment / Materials) of the same DUPA. Each DUPA is rebuilt as its own small workbook, read by the normal
 * DUPA reader and preserved as that package's evidence.
 */

export type DupaBlock = {
  key: string;
  sheetName: string;
  /** First title line, else the worksheet name. */
  title: string;
  titleLines: string[];
  /** 1-based source rows covered (titles through the last data row). */
  firstRow: number;
  lastRow: number;
  rows: unknown[][];
};

const DESCRIPTION = /descr|particular|item\s*of\s*work|scope\s*of\s*work/i;
const AMOUNT = /amount|total|cost|price/i;
const BOUNDARY = /\bdupa\b|unit\s*price\s*analysis|pay\s*item|item\s*(no\.?|number|#)|work\s*item|description\s*of\s*work/i;
const MAX_BLOCKS = 40;

const text = (value: unknown) => value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim();
const isNumeric = (value: unknown) => typeof value === 'number' || (typeof value === 'string' && /^-?[\d,]+(\.\d+)?$/.test(value.trim()) && value.trim() !== '');
const nonEmpty = (row: unknown[] | undefined) => (row ?? []).some(cell => text(cell) !== '');

function isHeader(row: unknown[] | undefined) {
  const cells = (row ?? []).map(text).filter(Boolean);
  return cells.length >= 3 && cells.some(cell => DESCRIPTION.test(cell)) && cells.some(cell => AMOUNT.test(cell)) && !cells.some(cell => isNumeric(cell));
}

/** Text-only rows directly above a header (stopping at a row with numbers, i.e. the previous table's data). */
function titleStart(rows: unknown[][], header: number, floor: number) {
  let start = header;
  for (let index = header - 1; index > floor; index -= 1) {
    const row = rows[index];
    if (nonEmpty(row) && row.some(isNumeric)) break;
    start = index;
  }
  return start;
}

export function splitDupaRows(sheets: Array<{ name: string; rows: unknown[][] }>): DupaBlock[] {
  const blocks: DupaBlock[] = [];
  sheets.forEach((sheet, sheetIndex) => {
    const rows = sheet.rows;
    const headers = rows.map((row, index) => isHeader(row) ? index : -1).filter(index => index >= 0);
    if (!headers.length) return;
    // Start (title row) of each header, then keep only headers that open a new DUPA.
    const starts: Array<{ header: number; start: number }> = [];
    headers.forEach((header, position) => {
      const floor = position === 0 ? -1 : headers[position - 1];
      const start = position === 0 ? 0 : titleStart(rows, header, floor);
      const titles = rows.slice(start, header).map(row => row.map(text).filter(Boolean).join(' ')).filter(Boolean);
      if (position === 0 || titles.some(line => BOUNDARY.test(line))) starts.push({ header, start });
    });
    starts.forEach((entry, position) => {
      const end = position + 1 < starts.length ? starts[position + 1].start - 1 : rows.length - 1;
      const slice = rows.slice(entry.start, end + 1);
      const titleLines = rows.slice(entry.start, entry.header).map(row => row.map(text).filter(Boolean).join(' ')).filter(Boolean);
      const hasData = rows.slice(entry.header + 1, end + 1).some(row => row.some(isNumeric));
      if (!hasData) return;
      blocks.push({
        key: `${sheetIndex}:${entry.header + 1}`, sheetName: sheet.name,
        title: (titleLines.find(line => BOUNDARY.test(line)) ?? titleLines[0] ?? sheet.name).slice(0, 160),
        titleLines: titleLines.slice(0, 8).map(line => line.slice(0, 200)),
        firstRow: entry.start + 1, lastRow: end + 1, rows: slice,
      });
    });
  });
  return blocks.slice(0, MAX_BLOCKS);
}

export function isSpreadsheetName(fileName: string) {
  return /\.(xlsx|xls|csv|tsv)$/i.test(fileName);
}

/** Reads cached cell values (formula results), so totals match what Excel shows. */
export function readDupaBlocks(buffer: Buffer, fileName: string): DupaBlock[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false, cellText: false, raw: /\.(csv|tsv)$/i.test(fileName) ? false : true });
  const sheets = workbook.SheetNames.map(name => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: null, raw: true, blankrows: true }).slice(0, 5000),
  }));
  return splitDupaRows(sheets);
}

/** One DUPA as its own workbook (values only), named after its source so the evidence stays traceable. */
export async function buildDupaBlockWorkbook(block: DupaBlock, sourceFileName: string) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('DUPA');
  for (const row of block.rows) sheet.addRow(row.map(cell => (typeof cell === 'number' || typeof cell === 'string' || typeof cell === 'boolean') ? cell : (cell instanceof Date ? cell : null)));
  // Fixed metadata so the same block always produces the same bytes within a request.
  workbook.creator = 'OneSystemsErp'; workbook.created = new Date(0); workbook.modified = new Date(0);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const base = sourceFileName.replace(/\.[^.]+$/, '');
  const label = block.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const fileName = `${base} - ${label || block.sheetName} (${block.sheetName} rows ${block.firstRow}-${block.lastRow})`.slice(0, 180) + '.xlsx';
  return { buffer, fileName };
}

const STOP = new Set(['the', 'and', 'for', 'with', 'of', 'to', 'in', 'on', 'a', 'an', 'dupa', 'unit', 'price', 'analysis', 'item', 'items', 'works', 'work', 'example', 'source', 'adapted', 'xlsx', 'lot', 'per', 'no', 'pay', 'detailed', 'cost', 'total']);
const tokens = (value: string) => new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(token => token.length > 2 && !STOP.has(token) && !/^\d+$/.test(token)));

export type MatchablePackage = { id: string; code: string | null; name: string; boqDescriptions: string[] };

/**
 * Built-in matching used when the AI is unavailable (and as its cross-check): package code in the title, else the
 * package whose name and BOQ items share the most words with the DUPA title and components.
 */
export function heuristicPackageMatch(block: { title: string; titleLines: string[]; components: string[] }, fileName: string, packages: MatchablePackage[]) {
  const titleText = `${block.titleLines.join(' ')} ${block.title} ${fileName}`;
  const normalized = ` ${titleText.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const byCode = packages.find(pkg => pkg.code && normalized.includes(` ${pkg.code.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `));
  if (byCode) return { packageId: byCode.id, confidence: 'high' as const, reason: `The title names package ${byCode.code}.` };
  const title = tokens(titleText);
  const components = tokens(block.components.join(' '));
  let best: { pkg: MatchablePackage; score: number; words: string[] } | null = null;
  for (const pkg of packages) {
    const name = tokens(pkg.name);
    const boq = tokens(pkg.boqDescriptions.join(' '));
    const words = [...title].filter(token => name.has(token) || boq.has(token));
    const score = [...title].filter(token => name.has(token)).length * 3 + words.length * 2 + [...components].filter(token => boq.has(token)).length * 0.5;
    if (score > 0 && (!best || score > best.score)) best = { pkg, score, words };
  }
  if (!best || best.score < 2) return { packageId: '', confidence: 'low' as const, reason: 'No package clearly matches this DUPA. Choose one.' };
  return { packageId: best.pkg.id, confidence: best.score >= 5 ? 'medium' as const : 'low' as const,
    reason: best.words.length ? `Shares "${best.words.slice(0, 3).join('", "')}" with ${best.pkg.code ? `${best.pkg.code} ` : ''}${best.pkg.name}.` : `Its components resemble ${best.pkg.name}'s BOQ items.` };
}
