import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma, transactionContext } from '@/lib/prisma';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { buildDraftBOQChecksum, DRAFT_BOQ_EDITABLE_SCHEDULE_STATUSES } from './draft-workflow';
import { parseBOQReviewDocument, reviewDocumentJson, type BOQFinding, type BOQReviewDocument, type BOQSourceRow } from './review-state';
import { readWorkspaceOriginal } from './workspace-service';
import { normalizeWorkspaceBreakdownMapping, normalizeWorkspaceMapping, parseWorkspaceWorkbook } from './workspace-parser';
import type { WorkspaceItem } from './workspace-types';
import { buildWorkspaceBOQFindings } from './workspace-findings';

type Actor = { id: string; role: string; name?: string | null };
type Line = { id: string; itemCode: string; category: string | null; description: string; unit: string; quantity: number; combinedUnitCost: number; totalCost: number };
type FieldName = 'itemCode' | 'section' | 'description' | 'unit' | 'quantity' | 'unitCost' | 'amount';
const FIELD_NAMES: readonly FieldName[] = ['itemCode', 'section', 'description', 'unit', 'quantity', 'unitCost', 'amount'];

export class BOQReadingWorkflowError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
function fail(message: string, status: number): never { throw new BOQReadingWorkflowError(message, status); }

function previewHash(result: Awaited<ReturnType<typeof loadReading>>): string {
  return createHash('sha256').update(JSON.stringify({
    versionId: result.version.id, checksum: result.version.checksum, rowVersion: result.state.rowVersion,
    fileHash: result.upload.fileHash, sheetName: result.selectedSheet, mapping: result.mapping,
    breakdownMapping: result.breakdownMapping, rows: result.preview, missing: result.missing.map(row => row.sourceRowNumber),
  })).digest('hex');
}

function decimalEqual(left: string | number, right: string | number): boolean {
  try { return new Prisma.Decimal(String(left)).equals(String(right)); } catch { return false; }
}
function fieldValue(line: Line, field: FieldName): string {
  switch (field) {
    case 'itemCode': return line.itemCode;
    case 'section': return line.category || 'General';
    case 'description': return line.description;
    case 'unit': return line.unit;
    case 'quantity': return String(line.quantity);
    case 'unitCost': return String(line.combinedUnitCost);
    case 'amount': return String(line.totalCost);
  }
}
function readValue(item: WorkspaceItem, field: FieldName): string | null {
  switch (field) {
    case 'itemCode': return item.itemCode || `ROW-${item.sourceRowNumber}`;
    case 'section': return item.section;
    case 'description': return item.description;
    case 'unit': return item.unitDefaulted ? null : item.unit;
    case 'quantity': return item.quantityDefaulted ? null : String(item.quantity);
    case 'unitCost': return String(item.unitCost);
    case 'amount': return String(item.amount);
  }
}
function valuesEqual(field: FieldName, left: string, right: string): boolean {
  return field === 'quantity' || field === 'unitCost' || field === 'amount' ? decimalEqual(left, right) : left === right;
}
function fieldRecord(line: Line) {
  return { itemCode: line.itemCode, section: line.category || 'General', description: line.description, unit: line.unit,
    quantity: String(line.quantity), unitCost: String(line.combinedUnitCost), amount: String(line.totalCost) };
}
function sourceRow(item: WorkspaceItem, itemId: string | null): BOQSourceRow {
  return {
    sourceRowNumber: item.sourceRowNumber, section: item.section, sectionSourceKey: item.sectionSourceKey,
    sectionOrder: item.sectionOrder, sectionStartRow: item.sectionStartRow, itemId, itemCode: item.itemCode,
    description: item.description, unit: item.unit, quantity: String(item.quantity), unitCost: String(item.unitCost),
    sourceUnitCost: item.sourceUnitCost === null ? null : String(item.sourceUnitCost), rateDerived: item.rateDerived,
    quantityDefaulted: item.quantityDefaulted, unitDefaulted: item.unitDefaulted, itemCodeSynthesized: item.itemCodeSynthesized,
    amount: String(item.amount), breakdown: Object.fromEntries(['materialUnitCost','laborUnitCost','equipmentUnitCost','totalDirectCost','ocm','cp','vat','totalIndirectCost','percentage'].map(key => [key, item[key as keyof typeof item] == null ? null : String(item[key as keyof typeof item])])),
  };
}
function changedFields(before: Record<string, string>, after: Record<string, string>): string[] {
  return FIELD_NAMES.filter(field => before[field] !== after[field]);
}
export function buildBOQSourceItemIdByRow(document: BOQReviewDocument): Map<number, string> {
  const rows = new Map<number, string>();
  const usedItemIds = new Set<string>();
  // Keep the first-read row identity as a fallback. A re-read can temporarily
  // stop recognizing a row as an item; a later corrected mapping must still be
  // reconnect that row to the existing canonical line. Reading history fills
  // identity for older documents whose current rows predate identity capture.
  const candidates = [
    ...document.source.originalRows,
    ...document.readingHistory.flatMap(reading => reading.rows),
    ...(document.source.currentRows ?? document.source.originalRows),
  ];
  for (const row of candidates) {
    if (!row.itemId || rows.has(row.sourceRowNumber) || usedItemIds.has(row.itemId)) continue;
    rows.set(row.sourceRowNumber, row.itemId);
    usedItemIds.add(row.itemId);
  }
  return rows;
}

async function loadReading(input: { actor: Actor; projectId: string; versionId: string; expectedChecksum: string; expectedRowVersion: number; selectedSheet?: string; mapping?: unknown; breakdownMapping?: unknown }) {
  const capacity = await planningCapacity(input.actor, input.projectId);
  if (!capacity.canEdit) fail('Your project capacity cannot change this BOQ reading.', 403);
  if (!input.versionId || !input.expectedChecksum || !Number.isSafeInteger(input.expectedRowVersion) || input.expectedRowVersion < 0) fail('Invalid BOQ reading request.', 400);
  const [project, version, state] = await Promise.all([
    prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true, status: true, boqLocked: true } }),
    prisma.projectBOQVersion.findFirst({ where: { projectId: input.projectId }, orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }] }),
    prisma.bOQReviewState.findFirst({ where: { projectId: input.projectId, versionId: input.versionId } }),
  ]);
  if (!project || project.status === 'ARCHIVED' || project.boqLocked || !version || version.id !== input.versionId || version.status !== 'DRAFT') fail('Only the current unlocked BOQ draft can be re-read.', 409);
  if (!state || state.rowVersion !== input.expectedRowVersion) fail('The BOQ review changed. Refresh before previewing the corrected reading.', 409);
  const document = parseBOQReviewDocument(state.dataJson, input.projectId, input.versionId);
  if (!document || !document.source.firstReadAvailable || !document.source.uploadId || !document.source.fileHash) fail('This BOQ has no preserved original workbook to re-read.', 409);
  const upload = await prisma.uploadedWorkbookFile.findFirst({ where: { id: document.source.uploadId, projectId: input.projectId }, select: { id: true, storagePath: true, originalFilename: true, fileHash: true, metadataJson: true } });
  if (!upload || !upload.storagePath || upload.fileHash !== document.source.fileHash) fail('The preserved original workbook is unavailable or does not match its recorded hash.', 409);
  const buffer = await readWorkspaceOriginal(upload.storagePath);
  const mapping = input.mapping === undefined
    ? normalizeWorkspaceMapping(document.source.mapping)
    : normalizeWorkspaceMapping(input.mapping);
  const breakdownMapping = input.breakdownMapping === undefined
    ? normalizeWorkspaceBreakdownMapping(document.source.breakdownMapping)
    : normalizeWorkspaceBreakdownMapping(input.breakdownMapping);
  if (!mapping) fail('Choose a valid corrected column mapping.', 400);
  const selectedSheet = input.selectedSheet ?? document.source.selectedSheet;
  if (!selectedSheet) fail('Choose a workbook sheet.', 400);
  let documentExtraction: unknown;
  let trustedReadingMethod: 'builtin' | 'openai-assisted' | undefined;
  if (/\.(pdf|docx)$/i.test(upload.originalFilename)) {
    try { const metadata = JSON.parse(upload.metadataJson || '{}'); documentExtraction = metadata.documentExtraction; trustedReadingMethod = metadata.readingMethod === 'builtin' ? 'builtin' : 'openai-assisted'; } catch { /* explicit failure below */ }
    if (!documentExtraction) fail('The preserved document reading is unavailable. Use reasoned BOQ line corrections or upload a corrected source.', 409);
    if (JSON.stringify(mapping) !== JSON.stringify(normalizeWorkspaceMapping(document.source.mapping))) fail('Document columns are fixed. Correct the BOQ lines, or upload a corrected source document.', 409);
  }
  const parsed = await parseWorkspaceWorkbook({ buffer, fileName: upload.originalFilename, selectedSheet, mapping, breakdownMapping: breakdownMapping ?? {}, trustedDocumentExtraction: documentExtraction, trustedReadingMethod });
  if (parsed.analysis.fileHash !== upload.fileHash) fail('The preserved original workbook failed its hash check.', 409);
  if (parsed.analysis.errors.length || parsed.items.length === 0) fail('Correct the mapping errors before applying this reading.', 400);
  const lines = await prisma.awardedBOQItem.findMany({ where: { projectId: input.projectId }, orderBy: [{ itemCode: 'asc' }, { id: 'asc' }] }) as Line[];
  if (buildDraftBOQChecksum(lines) !== input.expectedChecksum || version.checksum !== input.expectedChecksum) fail('The BOQ lines changed. Refresh before previewing this reading.', 409);
  const currentSourceRows = document.source.currentRows ?? document.source.originalRows;
  const itemIdBySourceRow = buildBOQSourceItemIdByRow(document);
  const lineById = new Map(lines.map(line => [line.id, line]));
  const matched = parsed.items.map(item => ({ item, itemId: itemIdBySourceRow.get(item.sourceRowNumber) ?? null }));
  const preview = matched.map(({ item, itemId }) => {
    const line = itemId ? lineById.get(itemId) : undefined;
    if (!line) return { sourceRowNumber: item.sourceRowNumber, itemId: null, kind: 'ADDED' as const, changes: [], conflicts: [] };
    const changes = FIELD_NAMES.flatMap(field => {
      const correctedValue = readValue(item, field);
      const currentValue = fieldValue(line, field);
      if (correctedValue === null || valuesEqual(field, currentValue, correctedValue)) return [];
      return [{ field, currentValue, correctedValue }];
    });
    const revisedAfterLatestRead = new Set<string>();
    for (const revision of document.revisions) {
      if (revision.itemId !== line.id || revision.action !== 'LINE_UPDATED') continue;
      if (Array.isArray(revision.changedFields)) revision.changedFields.forEach(field => revisedAfterLatestRead.add(field));
      else if (revision.before && revision.after) {
        for (const field of FIELD_NAMES) if (String(revision.before[field] ?? '') !== String(revision.after[field] ?? '')) revisedAfterLatestRead.add(field);
      }
    }
    const conflicts = changes.filter(change => revisedAfterLatestRead.has(change.field));
    return { sourceRowNumber: item.sourceRowNumber, itemId: line.id, kind: changes.length ? 'CHANGED' as const : 'MATCHED' as const, changes, conflicts };
  });
  const missing = currentSourceRows.filter(row => row.itemId && !matched.some(entry => entry.itemId === row.itemId));
  return { project, version, state, document, upload, lines, parsed, mapping, breakdownMapping: breakdownMapping ?? {}, selectedSheet, preview, missing };
}

export async function previewCorrectedBOQReading(input: Parameters<typeof loadReading>[0]) {
  const result = await loadReading(input);
  return {
    success: true,
    analysis: result.parsed.analysis,
    preview: result.preview,
    missingRows: result.missing.map(row => ({ itemId: row.itemId, sourceRowNumber: row.sourceRowNumber, itemCode: row.itemCode, description: row.description })),
    expectedPreviewHash: previewHash(result),
    canApply: true,
    newlyReadableRows: result.preview.filter(row => row.kind === 'ADDED').map(row => row.sourceRowNumber),
  };
}

export async function applyCorrectedBOQReading(input: Parameters<typeof loadReading>[0] & {
  reason: string;
  expectedPreviewHash: string;
  conflictDecisions: Record<string, { decision: 'KEEP_CURRENT' | 'USE_READING'; reason: string }>;
}) {
  if (input.reason.trim().length < 5 || input.reason.length > 300) fail('Enter a reason of 5 to 300 characters for applying this reading.', 400);
  const preview = await loadReading(input);
  if (!input.expectedPreviewHash || input.expectedPreviewHash !== previewHash(preview)) fail('This corrected reading preview is stale. Preview it again before applying.', 409);
  const conflicts = preview.preview.flatMap(row => row.conflicts.map(conflict => ({ itemId: row.itemId!, field: conflict.field })));
  for (const conflict of conflicts) {
    const decision = input.conflictDecisions?.[`${conflict.itemId}:${conflict.field}`];
    if (!decision || !['KEEP_CURRENT', 'USE_READING'].includes(decision.decision) || typeof decision.reason !== 'string' || decision.reason.trim().length < 5 || decision.reason.length > 300) {
      fail('Resolve every human-correction conflict with an explicit decision and reason.', 409);
    }
  }
  const capacity = await planningCapacity(input.actor, input.projectId);
  if (!capacity.canEdit) fail('Your project capacity cannot change this BOQ reading.', 403);
  return transactionContext.run({ sourceProvenance: 'GATE9_WORKFLOW_ENGINE' }, () => prisma.$transaction(async tx => {
    const [project, version, state] = await Promise.all([
      tx.project.findUnique({ where: { id: input.projectId }, select: { id: true, status: true, boqLocked: true } }),
      tx.projectBOQVersion.findFirst({ where: { projectId: input.projectId }, orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }] }),
      tx.bOQReviewState.findFirst({ where: { projectId: input.projectId, versionId: input.versionId } }),
    ]);
    if (!project || project.status === 'ARCHIVED' || project.boqLocked || !version || version.id !== input.versionId || version.status !== 'DRAFT') fail('Only the current unlocked BOQ draft can apply a corrected reading.', 409);
    if (!state || state.rowVersion !== input.expectedRowVersion) fail('The BOQ review changed. Refresh before applying this reading.', 409);
    const currentLines = await tx.awardedBOQItem.findMany({ where: { projectId: input.projectId }, orderBy: [{ itemCode: 'asc' }, { id: 'asc' }] }) as Line[];
    if (buildDraftBOQChecksum(currentLines) !== input.expectedChecksum || version.checksum !== input.expectedChecksum) fail('The BOQ lines changed. Preview this reading again.', 409);
    const schedules = await tx.projectSchedule.findMany({ where: { projectId: input.projectId }, select: { workflowStatus: true } });
    if (schedules.some(schedule => !DRAFT_BOQ_EDITABLE_SCHEDULE_STATUSES.includes(schedule.workflowStatus as typeof DRAFT_BOQ_EDITABLE_SCHEDULE_STATUSES[number]))) fail('A reviewed or immutable schedule prevents this BOQ reading change.', 409);
    const document = parseBOQReviewDocument(state.dataJson, input.projectId, input.versionId);
    if (!document) fail('The BOQ review record is invalid.', 409);
    if (preview.upload.fileHash !== document.source.fileHash || preview.parsed.analysis.errors.length) fail('The corrected reading no longer matches its preview. Preview it again.', 409);
    const upload = preview.upload;
    const parsed = preview.parsed;

    const currentSourceRows = document.source.currentRows ?? document.source.originalRows;
    const itemIdBySourceRow = buildBOQSourceItemIdByRow(document);
    const sourceRows = parsed.items.map(item => sourceRow(item, itemIdBySourceRow.get(item.sourceRowNumber) ?? null));
    const currentLineById = new Map(currentLines.map(line => [line.id, line]));
    const updates = new Map<string, { line: Line; data: Record<string, unknown>; before: Record<string, string>; after: Record<string, string>; changed: string[] }>();
    const newFindings: BOQFinding[] = [];
    const appliedAt = new Date().toISOString();
    const readingId = randomUUID();
    for (const item of parsed.items) {
      const itemId = itemIdBySourceRow.get(item.sourceRowNumber);
      const line = itemId ? currentLineById.get(itemId) : undefined;
      if (!line) continue;
      const existing = fieldRecord(line);
      const requested: Record<FieldName, string | null> = {
        itemCode: readValue(item, 'itemCode'), section: readValue(item, 'section'), description: readValue(item, 'description'),
        unit: readValue(item, 'unit'), quantity: readValue(item, 'quantity'), unitCost: readValue(item, 'unitCost'), amount: readValue(item, 'amount'),
      };
      const next = { ...existing };
      const holdsCommercialValues = preview.preview.find(row => row.itemId === line.id)?.conflicts.some(conflict => ['quantity', 'unitCost', 'amount'].includes(conflict.field)) ?? false;
      for (const field of FIELD_NAMES) {
        if (holdsCommercialValues && ['quantity', 'unitCost', 'amount'].includes(field)
          && !(preview.preview.find(row => row.itemId === line.id)?.conflicts.some(conflict => conflict.field === field))) continue;
        const correctedValue = requested[field];
        if (correctedValue === null || valuesEqual(field, existing[field], correctedValue)) continue;
        const conflictKey = `${line.id}:${field}`;
        const conflict = preview.preview.find(row => row.itemId === line.id)?.conflicts.some(candidate => candidate.field === field) ?? false;
        const decision = conflict ? input.conflictDecisions[conflictKey] : undefined;
        if (conflict && decision?.decision === 'KEEP_CURRENT') {
          newFindings.push({ id: `reading-conflict-${readingId}-${line.id}-${field}`, code: 'CORRECTED_READING_CONFLICT', field, itemId: line.id, rowNumber: item.sourceRowNumber,
            message: `The corrected reading gives ${correctedValue}, but the reviewer retained ${existing[field]} as a prior correction.`, severity: 'BLOCKING', status: 'CONFIRMED', reason: decision.reason.trim(), evidence: { currentValue: existing[field], correctedValue }, decidedBy: input.actor.id, decidedAt: appliedAt });
          continue;
        }
        next[field] = correctedValue;
      }
      const changed = changedFields(existing, next);
      const data: Record<string, unknown> = {};
      if (changed.includes('itemCode')) data.itemCode = next.itemCode;
      if (changed.includes('section')) data.category = next.section;
      if (changed.includes('description')) data.description = next.description;
      if (changed.includes('unit')) data.unit = next.unit;
      if (changed.includes('quantity')) { data.quantity = Number(next.quantity); data.revisedContractQuantity = Number(next.quantity); }
      if (changed.includes('unitCost')) { data.combinedUnitCost = Number(next.unitCost); data.revisedContractUnitPrice = Number(next.unitCost); }
      if (changed.includes('amount')) { data.totalCost = Number(next.amount); data.revisedContractAmount = Number(next.amount); }
      if (changed.length) updates.set(line.id, { line, data, before: existing, after: next, changed });
      if (changed.includes('section')) document.sectionIdentityByItemId[line.id] = { id: `reading:${upload.id}:${item.sectionSourceKey}`, name: item.section, order: item.sectionOrder };
    }
    for (const row of preview.missing) if (row.itemId) newFindings.push({ id: `reading-missing-${readingId}-${row.itemId}`, code: 'CORRECTED_READING_MISSING', field: 'source scope', itemId: row.itemId, rowNumber: row.sourceRowNumber,
      message: 'The corrected reading no longer identifies this saved BOQ line as an item. Confirm it remains in scope or correct/remove it.', severity: 'BLOCKING', status: 'OPEN', reason: null,
      evidence: { sourceRowNumber: row.sourceRowNumber, itemCode: row.itemCode, description: row.description, readingId }, decidedBy: null, decidedAt: null });
    for (const row of preview.preview.filter(entry => entry.kind === 'ADDED')) {
      const item = parsed.items.find(candidate => candidate.sourceRowNumber === row.sourceRowNumber);
      if (!item) continue;
      newFindings.push({ id: `reading-new-source-row-${readingId}-${row.sourceRowNumber}`, code: 'UNMAPPED_SOURCE_ROW', field: 'source row', itemId: null, rowNumber: row.sourceRowNumber,
        message: 'The corrected reading identifies a new BOQ-like source row. It was not added to the BOQ; review the row and add it deliberately if it belongs in scope.', severity: 'ATTENTION', status: 'OPEN', reason: null,
        evidence: { sourceRowNumber: row.sourceRowNumber, itemCode: item.itemCode || `ROW-${item.sourceRowNumber}`, description: item.description, quantity: String(item.quantity), amount: String(item.amount), readingId }, decidedBy: null, decidedAt: null });
    }
    const itemIdsBySourceRow = Object.fromEntries(sourceRows.flatMap(row => row.itemId ? [[row.sourceRowNumber, row.itemId] as const] : []));
    const regenerated = buildWorkspaceBOQFindings(parsed.items, { printedTotal: parsed.analysis.printedTotal, itemIdsBySourceRow, sheetName: preview.selectedSheet });
    regenerated.forEach(finding => { finding.id = `reading-${readingId}-${finding.id}`; });
    const findings = [...regenerated, ...newFindings];
    const oldFindings = document.findings;
    oldFindings.forEach(finding => {
      if (!finding.invalidatedAt) {
        finding.invalidatedAt = appliedAt;
        finding.invalidatedBy = input.actor.id;
        finding.invalidationReason = `Superseded by corrected reading ${readingId}. Original finding and decision are preserved.`;
      }
    });
    document.findings.push(...findings);
    for (const { line, data, before, after, changed } of updates.values()) {
      await tx.awardedBOQItem.update({ where: { id: line.id }, data });
      document.revisions.push({ id: randomUUID(), itemId: line.id, actorId: input.actor.id, reason: input.reason.trim(), before, after, action: 'READING_APPLIED', changedFields: changed, createdAt: appliedAt });
    }
    const updatedLines = currentLines.map(line => {
      const update = updates.get(line.id);
      if (!update) return line;
      return { ...line, ...update.data } as Line;
    });
    const checksum = buildDraftBOQChecksum(updatedLines);
    const total = updatedLines.reduce((sum, line) => sum.plus(String(line.totalCost)), new Prisma.Decimal(0));
    await tx.projectBOQVersion.update({ where: { id: version.id }, data: { checksum, totalAmount: total.toNumber() } });
    const comparison = preview.preview.map(row => ({ itemId: row.itemId, oldRow: row.itemId ? currentSourceRows.find(old => old.itemId === row.itemId)?.sourceRowNumber ?? null : null, newRow: row.sourceRowNumber, kind: row.kind }));
    const conflictList = preview.preview.flatMap(row => row.conflicts.map(conflict => {
      const decision = input.conflictDecisions[`${row.itemId!}:${conflict.field}`];
      return {
        itemId: row.itemId!,
        field: conflict.field,
        currentValue: conflict.currentValue,
        correctedValue: conflict.correctedValue,
        decision: decision.decision,
        decisionReason: decision.reason.trim(),
        decidedBy: input.actor.id,
        decidedAt: appliedAt,
      };
    }));
    document.readingHistory.push({ id: readingId, sourceUploadId: upload.id, fileName: upload.originalFilename, fileHash: upload.fileHash, selectedSheet: preview.selectedSheet, mapping: preview.mapping, breakdownMapping: preview.breakdownMapping,
      rows: sourceRows, conflicts: conflictList, reason: input.reason.trim(), comparison, appliedAt, createdAt: appliedAt });
    document.source.mapping = preview.mapping;
    document.source.breakdownMapping = preview.breakdownMapping;
    document.source.selectedSheet = preview.selectedSheet;
    document.source.currentRows = sourceRows;
    document.source.currentReadingId = readingId;
    if (updates.size) document.contract = { verified: false, verifiedBy: null, verifiedAt: null, verificationReason: null };
    document.history.push({ action: 'READING_APPLIED', actorId: input.actor.id, reason: input.reason.trim(), at: appliedAt, before: { checksum: input.expectedChecksum, mapping: document.source.firstMapping }, after: { checksum, mapping: preview.mapping, readingId, updatedLineCount: updates.size, conflicts: conflictList } });
    const saved = await tx.bOQReviewState.updateMany({ where: { id: state.id, projectId: input.projectId, versionId: input.versionId, rowVersion: state.rowVersion }, data: { dataJson: reviewDocumentJson(document), rowVersion: { increment: 1 } } });
    if (saved.count !== 1) fail('The BOQ review changed. Preview this reading again.', 409);
    await tx.auditLog.create({ data: { userId: input.actor.id, userRole: input.actor.role, moduleName: 'PROJECT_BOQ', transactionId: version.id, actionType: 'PROJECT_BOQ_READING_APPLIED', oldValue: JSON.stringify({ checksum: input.expectedChecksum, rowVersion: state.rowVersion }), newValue: JSON.stringify({ checksum, rowVersion: state.rowVersion + 1, readingId, reason: input.reason.trim(), updatedLineIds: [...updates.keys()], conflicts: conflictList }) } });
    return { success: true, rowVersion: state.rowVersion + 1, checksum, readingId, updatedLineCount: updates.size, findingCount: findings.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120000 }));
}
