import { NextResponse } from 'next/server';
import { getSessionActor } from '@/lib/scheduling/authUtils';
import { prisma } from '@/lib/prisma';
import { analyzeBenchmark, saveBenchmarkSource, getBenchmarkReview, changeBenchmark, suggestBenchmarkMatches } from '@/lib/boq/benchmark-review';
import { readWorkspaceOriginal, workspaceDocumentMime } from '@/lib/boq/workspace-service';
import { normalizeWorkspaceMapping, MAX_WORKSPACE_FILE_BYTES } from '@/lib/boq/workspace-parser';
import { WorkspaceError, type NonPricedSourceRow } from '@/lib/boq/workspace-types';
type Context = { params: Promise<{ id: string }> };
function errorResponse(error: unknown) {
  if (error instanceof WorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message.startsWith('UNAUTHORIZED:')) return NextResponse.json({ error: 'Sign in before reviewing a procurement benchmark.' }, { status: 401 });
  return NextResponse.json({ error: 'The benchmark could not be saved. Refresh and retry; no partial changes were applied.' }, { status: 500 });
}
export async function GET(request: Request, { params }: Context) {
  try {
    const actor = await getSessionActor(), { id } = await params;
    const result = await getBenchmarkReview(actor, id);
    const original = new URL(request.url).searchParams.get('original');
    if (original) {
      if (!/^[a-f\d-]{36}$/i.test(original)) throw new WorkspaceError('Original document not found.', 404);
      let review = result.review;
      if (review?.id !== original) {
        const historical = await prisma.auditLog.findFirst({ where: { moduleName: 'PROJECT_MANAGEMENT', transactionId: id, actionType: 'PROCUREMENT_BENCHMARK_REVIEW_STATE', newValue: { contains: `"id":"${original}"` } }, orderBy: { createdAt: 'desc' } });
        review = historical ? JSON.parse(historical.newValue || '{}') : null;
      }
      if (!review || review.id !== original || review.projectId !== id) throw new WorkspaceError('Original document not found in this project.', 404);
      const bytes = await readWorkspaceOriginal(review.source.storagePath);
      return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': workspaceDocumentMime(review.source.fileName),
        'Content-Disposition': `attachment; filename="benchmark-source"; filename*=UTF-8''${encodeURIComponent(review.source.fileName)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await getSessionActor(), { id } = await params;
    if ((request.headers.get('content-type') || '').includes('application/json')) {
      if (Number(request.headers.get('content-length')) > 2 * 1024 * 1024) throw new WorkspaceError('The benchmark review request is too large.', 400);
      const body = await request.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new WorkspaceError('Invalid benchmark action.', 400);
      return NextResponse.json(body.action === 'suggest-matches' ? await suggestBenchmarkMatches(actor, id, body.expectedRevision) : await changeBenchmark(actor, id, body));
    }
    if (Number(request.headers.get('content-length')) > MAX_WORKSPACE_FILE_BYTES + 2 * 1024 * 1024) throw new WorkspaceError('The document request is too large.', 400);
    const form = await request.formData(), file = form.get('file');
    if (!file || typeof file === 'string' || !/\.(xlsx|xls|csv|tsv|pdf|docx|txt|png|jpe?g|webp)$/i.test(file.name) || file.size <= 0 || file.size > MAX_WORKSPACE_FILE_BYTES) throw new WorkspaceError('Choose a supported Excel, delimited text, PDF, Word, text or PNG/JPEG/WEBP source, up to 10 MiB.', 400);
    const text = (key: string) => { const value = form.get(key); if (value !== null && typeof value !== 'string') throw new WorkspaceError(`Invalid ${key}.`, 400); return typeof value === 'string' ? value : ''; };
    let mapping = null;
    if (text('mapping')) { try { mapping = normalizeWorkspaceMapping(JSON.parse(text('mapping'))); } catch { throw new WorkspaceError('Choose valid benchmark column mappings.', 400); } }
    let nonPricedRows: NonPricedSourceRow[] = [];
    if (text('nonPricedRows')) { try { nonPricedRows = JSON.parse(text('nonPricedRows')); } catch { throw new WorkspaceError('Invalid non-priced row decisions.', 400); } }
    const input = { buffer: Buffer.from(await file.arrayBuffer()), fileName: file.name, selectedSheet: text('sheetName') || undefined, mapping, documentToken: text('documentToken') || null, nonPricedRows };
    if (text('action') === 'analyze') return NextResponse.json(await analyzeBenchmark(actor, id, input));
    if (text('action') !== 'save' || !mapping || !input.selectedSheet) throw new WorkspaceError('Analyze the benchmark and choose its sheet and columns first.', 400);
    return NextResponse.json(await saveBenchmarkSource(actor, id, { ...input, mapping, selectedSheet: input.selectedSheet, fileHash: text('fileHash'), expectedRevision: text('expectedRevision') }));
  } catch (error) { return errorResponse(error); }
}
