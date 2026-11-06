import { randomBytes, createHash } from 'node:crypto';
import JSZip from 'jszip';
import { parseWorkspaceWorkbook } from '@/lib/boq/workspace-parser';
import { documentReadingSchema, signDocumentReading, verifyDocumentReading, readWordDocument } from '@/lib/boq/workspace-document';

jest.mock('@google/genai', () => ({ GoogleGenAI: jest.fn() }));
const context = 'boq:reviewer:project-a';
const original = Buffer.from('%PDF-1.7\nexisting test source');
const hash = createHash('sha256').update(original).digest('hex');
const reading = documentReadingSchema.parse({ projectName: 'Existing test project', contractAmount: 100,
  items: [
    { section: 'Section A', itemCode: 'A1', description: 'Existing test line A', unit: 'm', quantity: 2, unitCost: 20, amount: 40, sourceReference: 'Page 1, row 1' },
    { section: 'Section B', itemCode: 'B1', description: 'Existing test line B', unit: 'm', quantity: 3, unitCost: 20, amount: 60, sourceReference: 'Page 2, row 1' },
  ] });

describe('reviewable document extraction', () => {
  const priorSecret = process.env.AUTH_SECRET;
  beforeAll(() => { process.env.AUTH_SECRET = randomBytes(32).toString('hex'); });
  afterAll(() => { if (priorSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = priorSecret; });

  it('binds the complete extraction to its unchanged source, actor and project', () => {
    const token = signDocumentReading(reading, hash, context, 1000);
    expect(verifyDocumentReading(token, hash, context, 2000)).toEqual(reading);
    expect(() => verifyDocumentReading(token, hash, 'boq:other:project-a', 2000)).toThrow(/different file or project/);
    expect(() => verifyDocumentReading(token, 'different-hash', context, 2000)).toThrow(/different file or project/);
    expect(() => verifyDocumentReading(token, hash, context, 4_000_000)).toThrow(/expired/);
    const [body, signature] = token.split('.');
    expect(() => verifyDocumentReading(`${body}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`, hash, context, 2000)).toThrow(/changed/);
  });

  it('reuses the reviewed reading without a second AI call and keeps complete section totals', async () => {
    const parsed = await parseWorkspaceWorkbook({ buffer: original, fileName: 'proposal.pdf', documentContext: context,
      documentToken: signDocumentReading(reading, hash, context) });
    expect(parsed.analysis.fileHash).toBe(hash);
    expect(parsed.analysis.total).toBe('100.00');
    expect(parsed.analysis.sections.map(section => section.itemCount)).toEqual([1, 1]);
    expect(parsed.items.map(item => item.amount)).toEqual([40, 60]);
    expect(parsed.analysis.extractedProjectName).toBe(reading.projectName);
    expect(parsed.analysis.documentExtraction).toEqual(reading);
    const page = await parseWorkspaceWorkbook({ buffer: original, fileName: 'proposal.pdf', documentContext: context,
      documentToken: parsed.analysis.documentToken, sectionKey: parsed.analysis.sections[1].key });
    expect(page.analysis.filteredItemCount).toBe(1);
    expect(page.analysis.itemCount).toBe(2);
    expect(page.analysis.total).toBe('100.00');
  });

  it('never fills an absent stated amount from quantity and rate', async () => {
    const incomplete = { ...reading, items: [{ ...reading.items[0], amount: null }] };
    const parsed = await parseWorkspaceWorkbook({ buffer: original, fileName: 'proposal.pdf', documentContext: context,
      documentToken: signDocumentReading(incomplete, hash, context) });
    expect(parsed.analysis.errors.some(error => error.field === 'amount')).toBe(true);
  });

  it('rejects oversized review payloads before issuing an unusable token', () => {
    const large = { ...reading, items: Array.from({ length: 500 }, () => ({ ...reading.items[0], description: 'x'.repeat(8000) })) };
    expect(() => signDocumentReading(large, hash, context)).toThrow(/too large/);
  });

  it('rejects unsupported formats and cross-package DUPA readings', async () => {
    await expect(parseWorkspaceWorkbook({ buffer: original, fileName: 'source.doc' })).rejects.toThrow(/xlsx/);
    await expect(parseWorkspaceWorkbook({ buffer: original, fileName: 'source.pdf', documentContext: 'dupa:user:project:plan:other-package',
      documentToken: signDocumentReading(reading, hash, 'dupa:user:project:plan:package') })).rejects.toThrow(/different file or project/);
  });

  it('reads bounded Word table text and rejects missing/unsafe XML', async () => {
    const word = new JSZip();
    word.file('[Content_Types].xml', '<Types/>');
    word.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Existing test BOQ &amp; scope</w:t></w:r></w:p></w:body></w:document>');
    expect(await readWordDocument(await word.generateAsync({ type: 'nodebuffer' }))).toContain('Existing test BOQ & scope');
    word.file('word/document.xml', '<!DOCTYPE x><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Text</w:t></w:r></w:p></w:document>');
    await expect(readWordDocument(await word.generateAsync({ type: 'nodebuffer' }))).rejects.toThrow(/malformed/);
    await expect(readWordDocument(Buffer.from('not a ZIP'))).rejects.toThrow(/valid/);
  });
});
