import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma, transactionContext } from '@/lib/prisma';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { BOQ_CANONICALIZATION_VERSION } from '@/lib/boq/canonical-checksum';
import { buildDraftBOQChecksum } from '@/lib/boq/draft-workflow';
import { parseBOQReviewDocument, reviewDocumentJson, type BOQSourceRow, type BOQReviewDocument, type BOQFinding } from '@/lib/boq/review-state';
import { removeWorkspaceOriginal, storeWorkspaceOriginal } from '@/lib/boq/workspace-service';
import { parseWorkspaceWorkbook } from '@/lib/boq/workspace-parser';
import { buildWorkspaceBOQFindings } from '@/lib/boq/workspace-findings';
import type { WorkspaceItem } from '@/lib/boq/workspace-types';

export class BOQSourceVersionError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
function fail(message: string, status: number): never { throw new BOQSourceVersionError(message, status); }
type Actor = { id: string; role: string; name?: string | null };

function sourceRows(items: Awaited<ReturnType<typeof parseWorkspaceWorkbook>>['items']): BOQSourceRow[] {
  return items.map(item => ({
    sourceRowNumber: item.sourceRowNumber, section: item.section, sectionSourceKey: item.sectionSourceKey,
    sectionOrder: item.sectionOrder, sectionStartRow: item.sectionStartRow, itemCode: item.itemCode, description: item.description,
    unit: item.unit, quantity: String(item.quantity), unitCost: String(item.unitCost), amount: String(item.amount),
    sourceUnitCost: item.sourceUnitCost == null ? null : String(item.sourceUnitCost), rateDerived: item.rateDerived,
    quantityDefaulted: item.quantityDefaulted, unitDefaulted: item.unitDefaulted, itemCodeSynthesized: item.itemCodeSynthesized,
    breakdown: Object.fromEntries(['materialUnitCost','laborUnitCost','equipmentUnitCost','totalDirectCost','ocm','cp','vat','totalIndirectCost','percentage'].map(key => [key, item[key as keyof typeof item] == null ? null : String(item[key as keyof typeof item])])),
  }));
}

type PreviousItem = { id: string; itemCode: string; itemCodeSynthesized?: boolean; sourceAvailable?: boolean; description: string; unit: string; quantity: number; combinedUnitCost: number; totalCost: number };
const comparable = (value: string) => value.trim().normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();
const stableCode = (value: string, synthesized?: boolean) => synthesized ? '' : value.trim();
function unique<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  const groups = new Map<string, T[]>();
  for (const row of rows) { const value = key(row); if (value) groups.set(value, [...(groups.get(value) ?? []), row]); }
  return new Map([...groups].filter(([, group]) => group.length === 1).map(([key, group]) => [key, group[0]]));
}
function sameValues(old: PreviousItem, row: BOQSourceRow) {
  return old.description.trim() === row.description.trim() && old.unit.trim() === row.unit.trim()
    && new Prisma.Decimal(String(old.quantity)).equals(row.quantity)
    && new Prisma.Decimal(String(old.combinedUnitCost)).equals(row.unitCost)
    && new Prisma.Decimal(String(old.totalCost)).equals(row.amount);
}
export function compareCorrectedSourceRows(oldRows: PreviousItem[], rows: BOQSourceRow[]) {
  const usedOld = new Set<string>();
  const usedNew = new Set<number>();
  const result: BOQReviewDocument['correctedSources'][number]['assessment'] = [];
  const pair = (old: PreviousItem, row: BOQSourceRow, kind: typeof result[number]['kind']) => {
    usedOld.add(old.id); usedNew.add(row.sourceRowNumber);
    result.push({ oldItemId: old.id, oldRow: oldRows.indexOf(old) + 1, newRow: row.sourceRowNumber, oldItemCode: old.itemCode, newItemCode: row.itemCode, kind });
  };
  const oldByCode = unique(oldRows.filter(row => row.sourceAvailable !== false), row => stableCode(row.itemCode, row.itemCodeSynthesized));
  const newByCode = unique(rows, row => stableCode(row.itemCode, row.itemCodeSynthesized));
  for (const [code, old] of oldByCode) {
    const row = newByCode.get(code); if (!row) continue;
    pair(old, row, comparable(old.description) !== comparable(row.description) ? 'POSSIBLE_MATCH' : sameValues(old, row) ? 'MATCHED' : 'CHANGED');
  }
  const oldByDescription = unique(oldRows.filter(row => row.sourceAvailable !== false && !usedOld.has(row.id)), row => comparable(row.description));
  const newByDescription = unique(rows.filter(row => !usedNew.has(row.sourceRowNumber)), row => comparable(row.description));
  for (const [description, old] of oldByDescription) {
    const row = newByDescription.get(description); if (!row) continue;
    const oldCode = stableCode(old.itemCode, old.itemCodeSynthesized), newCode = stableCode(row.itemCode, row.itemCodeSynthesized);
    const bothCodesDiffer = oldCode && newCode && oldCode !== newCode;
    const someValueEqual = old.unit.trim() === row.unit.trim() && (new Prisma.Decimal(old.quantity).equals(row.quantity) || new Prisma.Decimal(old.combinedUnitCost).equals(row.unitCost) || new Prisma.Decimal(old.totalCost).equals(row.amount));
    if (sameValues(old, row) || (!bothCodesDiffer && someValueEqual)) pair(old, row, 'POSSIBLE_MATCH');
  }
  for (const row of rows) if (!usedNew.has(row.sourceRowNumber)) result.push({ oldItemId: null, oldRow: null, newRow: row.sourceRowNumber, oldItemCode: null, newItemCode: row.itemCode || null, kind: 'ADDED' });
  for (const [index, old] of oldRows.entries()) if (!usedOld.has(old.id)) result.push({ oldItemId: old.id, oldRow: index + 1, newRow: null, oldItemCode: old.itemCode, newItemCode: null, kind: 'REMOVED' });
  return result;
}

const valueFields = ['itemCode', 'description', 'unit', 'quantity', 'unitCost', 'amount'] as const;
function itemFields(item: PreviousItem): Record<string, string> {
  return { itemCode: item.itemCode, description: item.description, unit: item.unit, quantity: String(item.quantity), unitCost: String(item.combinedUnitCost), amount: String(item.totalCost) };
}
function fieldEquals(field: string, left: unknown, right: unknown): boolean {
  if (left == null || right == null) return left === right;
  if (['quantity', 'unitCost', 'amount'].includes(field)) {
    try { return new Prisma.Decimal(String(left)).equals(String(right)); } catch { return false; }
  }
  return String(left).trim() === String(right).trim();
}
/** Match against immutable source evidence, not the human-corrected Structured BOQ. */
export function originalItemRows(items: PreviousItem[], document: BOQReviewDocument): PreviousItem[] {
  return items.map(item => {
    const first = document.revisions.find(revision => revision.itemId === item.id && revision.action === 'LINE_UPDATED');
    const code = String(first?.before.itemCode ?? item.itemCode);
    const byId = document.source.originalRows.find(row => row.itemId === item.id);
    const candidates = document.source.originalRows.filter(row => (row.itemCode || `ROW-${row.sourceRowNumber}`) === code);
    const source = byId ?? (candidates.length === 1 ? candidates[0] : undefined);
    return source ? { ...item, ...source, sourceAvailable: true, quantity: Number(source.quantity), combinedUnitCost: Number(source.unitCost), totalCost: Number(source.amount) } : { ...item, sourceAvailable: false };
  });
}
export function correctedSourceCarryPlan(item: PreviousItem, row: BOQSourceRow, document: BOQReviewDocument) {
  const old = originalItemRows([item], document)[0];
  if (old.sourceAvailable === false) return { applyFields: {}, conflicts: [], decisions: [], available: false };
  const original = itemFields(old), current = itemFields(item);
  const applyFields: Record<string, string> = {};
  const conflicts: string[] = [];
  for (const field of valueFields) {
    const revised = document.revisions.some(revision => revision.itemId === item.id && revision.action === 'LINE_UPDATED' && !fieldEquals(field, revision.before[field], revision.after?.[field]));
    if (!revised || fieldEquals(field, original[field], current[field])) continue;
    if (fieldEquals(field, original[field], row[field])) applyFields[field] = current[field];
    else conflicts.push(field);
  }
  const unchanged = valueFields.every(field => fieldEquals(field, original[field], row[field]));
  const decisions = unchanged ? document.findings.filter(finding => finding.itemId === item.id && ['CONFIRMED', 'CORRECTED', 'SET_ASIDE'].includes(finding.status)
    && (finding.code !== 'QUANTITY_DEFAULTED' || row.quantityDefaulted)
    && (finding.code !== 'UNIT_DEFAULTED' || row.unitDefaulted)) : [];
  return { applyFields, conflicts, decisions, available: Object.keys(applyFields).length > 0 || decisions.length > 0 };
}

export function preserveUnresolvedSourceFindings(findings: BOQFinding[], previous: BOQFinding[], previousToAdopted: Map<string, string>, priorVersionId: string): BOQFinding[] {
  const next = [...findings];
  for (const finding of previous.filter(finding => finding.status === 'OPEN')) {
    const itemId = finding.itemId ? previousToAdopted.get(finding.itemId) : null;
    if (finding.itemId && !itemId) continue;
    if (next.some(candidate => candidate.itemId === itemId && candidate.code === finding.code && candidate.field === finding.field)) continue;
    // These conditions are recomputed from the corrected workbook. When the
    // condition cleared, the prior version remains its immutable record.
    if (['QUANTITY_DEFAULTED', 'UNIT_DEFAULTED', 'PRINTED_TOTAL_DIFFERS', 'AMOUNT_ARITHMETIC', 'STATED_RATE_NOT_AMOUNT_RATE'].includes(finding.code)) continue;
    next.push({ ...finding, id: randomUUID(), itemId: itemId ?? null, evidence: { ...finding.evidence, priorFindingId: finding.id, priorVersionId } });
  }
  return next;
}

export async function stageCorrectedBOQSource(input: {
  actor: Actor; projectId: string; versionId: string; expectedRowVersion: number; buffer: Buffer; fileName: string;
  selectedSheet: string; mapping: NonNullable<Awaited<ReturnType<typeof parseWorkspaceWorkbook>>['analysis']['mapping']>;
  breakdownMapping?: Awaited<ReturnType<typeof parseWorkspaceWorkbook>>['analysis']['breakdownMapping'];
  expectedFileHash: string;
}) {
  const capacity = await planningCapacity(input.actor, input.projectId);
  if (!capacity.canEdit) fail('Your project capacity cannot edit this BOQ.', 403);
  if (!input.fileName.toLocaleLowerCase().endsWith('.xlsx') || input.buffer.length > 10 * 1024 * 1024) fail('Choose an .xlsx workbook up to 10 MiB.', 400);
  const parsed = await parseWorkspaceWorkbook({ buffer: input.buffer, fileName: input.fileName, selectedSheet: input.selectedSheet, mapping: input.mapping, breakdownMapping: input.breakdownMapping });
  if (parsed.analysis.fileHash !== input.expectedFileHash) fail('The workbook changed after analysis. Analyze it again before staging.', 409);
  if (parsed.analysis.errors.length || parsed.items.length === 0) fail('Resolve workbook errors before assessing the corrected source.', 400);
  const rows = sourceRows(parsed.items);
  const uploadId = randomUUID();
  const sourceVersionId = randomUUID();
  let storagePath: string | null = null;
  try {
    return await prisma.$transaction(async tx => {
      const project = await tx.project.findUnique({ where: { id: input.projectId }, select: { id: true, status: true, boqLocked: true } });
      const current = await tx.projectBOQVersion.findFirst({ where: { projectId: input.projectId }, orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }] });
      const state = await tx.bOQReviewState.findFirst({ where: { projectId: input.projectId, versionId: input.versionId } });
      if (!project || project.status === 'ARCHIVED' || project.boqLocked) fail('Approved or archived BOQs cannot be replaced by this draft-source workflow.', 409);
      if (!current || current.id !== input.versionId || current.status !== 'DRAFT') fail('The current editable BOQ version changed.', 409);
      if (!state || state.rowVersion !== input.expectedRowVersion) fail('The BOQ review changed. Refresh before uploading a corrected source.', 409);
      const document = parseBOQReviewDocument(state.dataJson, input.projectId, input.versionId);
      if (!document) fail('The BOQ review record is invalid.', 409);
      const oldItems = await tx.awardedBOQItem.findMany({ where: { projectId: input.projectId }, orderBy: [{ itemCode: 'asc' }, { id: 'asc' }] });
      if (document.correctedSources.some(source => !['ADOPTED', 'REJECTED'].includes(source.status))) fail('Assess the pending corrected source before uploading another.', 409);
      const assessment = compareCorrectedSourceRows(originalItemRows(oldItems, document), rows);
      const decisions: Record<string, { decision: 'SAME_ITEM' | 'NEW_ITEM' | 'SET_ASIDE'; reason: string }> = {};
      const carryForward: Record<string, 'CARRIED' | 'REVIEW_AGAIN' | 'SET_ASIDE'> = {};
      for (const row of assessment) {
        const key = `${row.oldRow ?? 'new'}:${row.newRow ?? 'removed'}`;
        if (row.kind === 'MATCHED' || row.kind === 'CHANGED') decisions[key] = { decision: 'SAME_ITEM', reason: 'Unique stable item code and matching description.' };
        if (row.newRow !== null) carryForward[String(row.newRow)] = 'REVIEW_AGAIN';
        else if (row.kind === 'REMOVED' && row.oldRow !== null) carryForward[`old:${row.oldRow}`] = 'SET_ASIDE';
      }
      storagePath = await storeWorkspaceOriginal(uploadId, input.projectId, parsed.analysis.fileHash, input.buffer);
      const originalUrl = `/api/boq-workspace/uploads/${uploadId}/original`;
      const metadataJson = JSON.stringify({ source: 'BOQ_CORRECTED_SOURCE', status: 'ASSESSMENT_REQUIRED', fileHash: parsed.analysis.fileHash, sheetName: parsed.analysis.selectedSheet, mapping: parsed.analysis.mapping, breakdownMapping: parsed.analysis.breakdownMapping });
      await tx.uploadedWorkbookFile.create({ data: { id: uploadId, projectId: input.projectId, templateCode: 'BOQ_WORKSPACE', templateName: 'BOQ Corrected Source', documentType: 'BOQ', originalFilename: input.fileName, fileHash: parsed.analysis.fileHash, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileSize: input.buffer.length, storagePath, preservedOriginalUrl: originalUrl, uploadedBy: input.actor.id, validationStatus: 'SUCCESS', extractionStatus: 'SUCCESS', commitStatus: 'PENDING', recognizedTemplate: 'BOQ_WORKSPACE', metadataJson } });
      const sectionIds = new Map<string, { id: string; name: string; order: number }>();
      for (const sectionKey of [...new Set(rows.map(row => row.sectionSourceKey ?? `legacy:${row.section}`))]) {
        const first = rows.find(row => (row.sectionSourceKey ?? `legacy:${row.section}`) === sectionKey);
        if (!first) continue;
        const section = await tx.bOQExtractedSection.create({ data: { uploadedWorkbookFileId: uploadId, projectId: input.projectId, sheetName: parsed.analysis.selectedSheet, sectionName: first.section, sourceRowNumber: first.sectionStartRow ?? first.sourceRowNumber, displayOrder: first.sectionOrder ?? sectionIds.size + 1 }, select: { id: true } });
        sectionIds.set(sectionKey, { id: section.id, name: first.section, order: first.sectionOrder ?? sectionIds.size + 1 });
      }
      await tx.bOQExtractedItem.createMany({ data: parsed.items.map(item => ({ uploadedWorkbookFileId: uploadId, projectId: input.projectId, sectionId: sectionIds.get(item.sectionSourceKey)!.id, sheetName: parsed.analysis.selectedSheet, sourceRowNumber: item.sourceRowNumber, itemNumber: item.itemCode || null, description: item.description, unit: item.unit, quantity: item.quantity, unitCost: item.unitCost, amount: item.amount, materialUnitCost: item.materialUnitCost ?? null, laborUnitCost: item.laborUnitCost ?? null, equipmentUnitCost: item.equipmentUnitCost ?? null, totalDirectCost: item.totalDirectCost ?? null, ocm: item.ocm ?? null, cp: item.cp ?? null, vat: item.vat ?? null, totalIndirectCost: item.totalIndirectCost ?? null, percentage: item.percentage ?? null, validationStatus: 'SUCCESS', validationErrorsJson: '[]' })) });
      const sectionIdentityBySourceRow = Object.fromEntries(rows.map(row => [String(row.sourceRowNumber), sectionIds.get(row.sectionSourceKey ?? `legacy:${row.section}`)!]));
      const ready = assessment.every(row => decisions[`${row.oldRow ?? 'new'}:${row.newRow ?? 'removed'}`]);
      document.correctedSources.push({ versionId: sourceVersionId, uploadId, fileName: input.fileName, fileHash: parsed.analysis.fileHash, selectedSheet: input.selectedSheet, mapping: input.mapping, breakdownMapping: input.breakdownMapping ?? {}, rows, sectionIdentityBySourceRow, assessment, identityDecisions: decisions, carryForward, carryAcceptance: {}, basisChecksum: current.checksum ?? buildDraftBOQChecksum(oldItems), status: ready ? 'READY_TO_ADOPT' : 'ASSESSMENT_REQUIRED', createdAt: new Date().toISOString(), adoptedAt: null });
      const staged = document.correctedSources[document.correctedSources.length - 1];
      staged.sourceFindings = buildWorkspaceBOQFindings(parsed.items, { printedTotal: parsed.analysis.printedTotal ?? null, sheetName: parsed.analysis.selectedSheet });
      staged.carryPlans = Object.fromEntries(assessment.flatMap(entry => {
        const item = oldItems.find(item => item.id === entry.oldItemId);
        const row = rows.find(row => row.sourceRowNumber === entry.newRow);
        return item && row ? [[`${entry.oldRow}:${entry.newRow}`, correctedSourceCarryPlan(item, row, document)]] : [];
      }));
      document.history.push({ action: 'CORRECTED_SOURCE_STAGED', actorId: input.actor.id, reason: null, at: new Date().toISOString(), before: { versionId: current.id }, after: { sourceVersionId, uploadId, assessment } });
      const saved = await tx.bOQReviewState.updateMany({ where: { id: state.id, projectId: input.projectId, versionId: input.versionId, rowVersion: state.rowVersion }, data: { dataJson: reviewDocumentJson(document), rowVersion: { increment: 1 } } });
      if (saved.count !== 1) fail('The BOQ review changed. Refresh before continuing.', 409);
      await tx.workbookExtractionAudit.create({ data: { uploadedWorkbookFileId: uploadId, projectId: input.projectId, action: 'BOQ_CORRECTED_SOURCE_STAGED', status: 'SUCCESS', message: `Staged corrected workbook source with ${assessment.length} assessed rows.`, detailsJson: JSON.stringify({ sourceVersionId, assessment }), performedBy: input.actor.id, performedByRole: input.actor.role } });
      await tx.auditLog.create({ data: { userId: input.actor.id, userRole: input.actor.role, moduleName: 'PROJECT_BOQ', transactionId: current.id, actionType: 'PROJECT_BOQ_CORRECTED_SOURCE_STAGED', oldValue: JSON.stringify({ rowVersion: state.rowVersion }), newValue: JSON.stringify({ sourceVersionId, uploadId, assessment }) } });
      return { success: true, rowVersion: state.rowVersion + 1, sourceVersionId, uploadId, status: staged.status, assessment };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120000 });
  } catch (error) {
    if (storagePath) await removeWorkspaceOriginal(storagePath);
    if (error instanceof BOQSourceVersionError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') fail('The BOQ changed concurrently. Refresh and retry.', 409);
    throw error;
  }
}

/** Carrying a prior decision is an explicit act, separate from row identity. */
export async function acceptCorrectedBOQCarryForward(input: { actor: Actor; projectId: string; versionId: string; expectedRowVersion: number; sourceVersionId: string; identityKey: string; reason: string; reject?: boolean }) {
  const capacity = await planningCapacity(input.actor, input.projectId);
  if (!capacity.canEdit) fail('Your project capacity cannot edit this BOQ.', 403);
  if (input.reason.trim().length < 5 || input.reason.trim().length > 300) fail('Enter a reason of 5 to 300 characters.', 400);
  return transactionContext.run({ sourceProvenance: 'GATE9_WORKFLOW_ENGINE' }, () => prisma.$transaction(async tx => {
    const project = await tx.project.findUnique({ where: { id: input.projectId } });
    const current = await tx.projectBOQVersion.findFirst({ where: { projectId: input.projectId }, orderBy: { versionNumber: 'desc' } });
    const state = await tx.bOQReviewState.findFirst({ where: { projectId: input.projectId, versionId: input.versionId } });
    if (!project || project.status === 'ARCHIVED' || project.boqLocked || !current || current.id !== input.versionId || current.status !== 'DRAFT' || !state || state.rowVersion !== input.expectedRowVersion) fail('The BOQ changed. Refresh before assessing this source.', 409);
    const document = parseBOQReviewDocument(state.dataJson, input.projectId, input.versionId);
    const source = document?.correctedSources.find(source => source.versionId === input.sourceVersionId);
    if (!document || !source || ['ADOPTED', 'REJECTED'].includes(source.status)) fail('This source is no longer awaiting assessment.', 409);
    if (input.reject) source.status = 'REJECTED';
    else {
      const entry = source.assessment.find(entry => `${entry.oldRow ?? 'new'}:${entry.newRow ?? 'removed'}` === input.identityKey);
      const rows = await tx.awardedBOQItem.findMany({ where: { projectId: input.projectId } });
      if (!source.basisChecksum || source.basisChecksum !== buildDraftBOQChecksum(rows)) fail('The current BOQ changed after assessment. Reject this assessment and stage it again.', 409);
      const item = rows.find(item => item.id === entry?.oldItemId);
      const row = source.rows.find(row => row.sourceRowNumber === entry?.newRow);
      if (!entry || !item || !row || source.identityDecisions[input.identityKey]?.decision !== 'SAME_ITEM') fail('Confirm that these rows are the same item first.', 409);
      const plan = correctedSourceCarryPlan(item, row, document);
      if (!plan.available || plan.conflicts.length) fail('The corrected source changed a previously corrected field. Review this row afresh.', 409);
      source.carryPlans ??= {};
      source.carryPlans[input.identityKey] = plan;
      source.carryAcceptance ??= {};
      source.carryAcceptance[input.identityKey] = { accepted: true, reason: input.reason.trim(), at: new Date().toISOString(), actorId: input.actor.id };
      source.carryForward[String(row.sourceRowNumber)] = 'CARRIED';
    }
    document.history.push({ action: input.reject ? 'CORRECTED_SOURCE_REJECTED' : 'SOURCE_CARRY_FORWARD_ACCEPTED', actorId: input.actor.id, reason: input.reason.trim(), at: new Date().toISOString(), before: null, after: { sourceVersionId: source.versionId, identityKey: input.identityKey } });
    const saved = await tx.bOQReviewState.updateMany({ where: { id: state.id, rowVersion: state.rowVersion }, data: { dataJson: reviewDocumentJson(document), rowVersion: { increment: 1 } } });
    if (saved.count !== 1) fail('The BOQ review changed. Refresh before continuing.', 409);
    await tx.auditLog.create({ data: { userId: input.actor.id, userRole: input.actor.role, moduleName: 'PROJECT_BOQ', transactionId: current.id, actionType: input.reject ? 'PROJECT_BOQ_SOURCE_REJECTED' : 'PROJECT_BOQ_CARRY_FORWARD_ACCEPTED', newValue: JSON.stringify({ sourceVersionId: source.versionId, identityKey: input.identityKey, reason: input.reason.trim() }) } });
    return { success: true, rowVersion: state.rowVersion + 1 };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}

export async function decideCorrectedBOQIdentity(input: { actor: Actor; projectId: string; versionId: string; expectedRowVersion: number; sourceVersionId: string; identityKey: string; decision: 'SAME_ITEM' | 'NEW_ITEM' | 'SET_ASIDE'; reason: string }) {
  const capacity = await planningCapacity(input.actor, input.projectId);
  if (!capacity.canEdit) fail('Your project capacity cannot edit this BOQ.', 403);
  if (!input.identityKey || input.identityKey.length > 80 || input.reason.trim().length < 5 || input.reason.length > 300) fail('Enter a valid row identity decision and reason.', 400);
  return transactionContext.run({ sourceProvenance: 'GATE9_WORKFLOW_ENGINE' }, () => prisma.$transaction(async tx => {
    const state = await tx.bOQReviewState.findFirst({ where: { projectId: input.projectId, versionId: input.versionId } });
    const current = await tx.projectBOQVersion.findFirst({ where: { projectId: input.projectId }, orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }] });
    const project = await tx.project.findUnique({ where: { id: input.projectId }, select: { status: true, boqLocked: true } });
    if (!state || state.rowVersion !== input.expectedRowVersion || !current || current.id !== input.versionId || current.status !== 'DRAFT' || !project || project.status === 'ARCHIVED' || project.boqLocked) fail('The BOQ source changed. Refresh before deciding row identity.', 409);
    const document = parseBOQReviewDocument(state.dataJson, input.projectId, input.versionId);
    if (!document) fail('The BOQ review record is invalid.', 409);
    const source = document.correctedSources.find(candidate => candidate.versionId === input.sourceVersionId);
    if (!source || source.status === 'ADOPTED' || source.status === 'REJECTED') fail('The corrected source is no longer awaiting assessment.', 409);
    const entry = source.assessment.find(row => `${row.oldRow ?? 'new'}:${row.newRow ?? 'removed'}` === input.identityKey);
    if (!entry) fail('The compared row was not found.', 404);
    if (input.decision === 'SAME_ITEM' && (entry.oldRow === null || entry.newRow === null)) fail('Only two compared rows can be identified as the same item.', 400);
    source.identityDecisions[input.identityKey] = { decision: input.decision, reason: input.reason.trim() };
    if (entry.newRow !== null) source.carryForward[String(entry.newRow)] = input.decision === 'SET_ASIDE' ? 'SET_ASIDE' : 'REVIEW_AGAIN';
    if (source.carryAcceptance) delete source.carryAcceptance[input.identityKey];
    if (entry.oldRow !== null && entry.newRow === null) source.carryForward[`old:${entry.oldRow}`] = input.decision === 'SET_ASIDE' ? 'SET_ASIDE' : 'REVIEW_AGAIN';
    const allDecided = source.assessment.every(row => Boolean(source.identityDecisions[`${row.oldRow ?? 'new'}:${row.newRow ?? 'removed'}`]));
    source.status = allDecided ? 'READY_TO_ADOPT' : 'ASSESSMENT_REQUIRED';
    const old = { decision: undefined };
    const saved = await tx.bOQReviewState.updateMany({ where: { id: state.id, projectId: input.projectId, versionId: input.versionId, rowVersion: state.rowVersion }, data: { dataJson: reviewDocumentJson(document), rowVersion: { increment: 1 } } });
    if (saved.count !== 1) fail('The BOQ review changed. Refresh before continuing.', 409);
    await tx.auditLog.create({ data: { userId: input.actor.id, userRole: input.actor.role, moduleName: 'PROJECT_BOQ', transactionId: input.versionId, actionType: 'PROJECT_BOQ_SOURCE_IDENTITY_DECIDED', oldValue: JSON.stringify(old), newValue: JSON.stringify({ sourceVersionId: source.versionId, identityKey: input.identityKey, decision: input.decision, reason: input.reason }) } });
    return { success: true, rowVersion: state.rowVersion + 1, status: source.status };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }));
}

export async function adoptCorrectedBOQSource(input: { actor: Actor; projectId: string; versionId: string; expectedRowVersion: number; sourceVersionId: string }) {
  const capacity = await planningCapacity(input.actor, input.projectId);
  if (!capacity.canEdit) fail('Your project capacity cannot adopt this BOQ source.', 403);
  return transactionContext.run({ sourceProvenance: 'GATE9_WORKFLOW_ENGINE' }, () => prisma.$transaction(async tx => {
    const project = await tx.project.findUnique({ where: { id: input.projectId } });
    const current = await tx.projectBOQVersion.findFirst({ where: { projectId: input.projectId }, orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }] });
    const state = await tx.bOQReviewState.findFirst({ where: { projectId: input.projectId, versionId: input.versionId } });
    if (!project || project.status === 'ARCHIVED' || project.boqLocked || !current || current.id !== input.versionId || current.status !== 'DRAFT') fail('Approved or archived BOQ versions cannot adopt a corrected source.', 409);
    if (!state || state.rowVersion !== input.expectedRowVersion) fail('The BOQ source changed. Refresh before adoption.', 409);
    const document = parseBOQReviewDocument(state.dataJson, input.projectId, input.versionId);
    if (!document) fail('The BOQ review record is invalid.', 409);
    const source = document.correctedSources.find(candidate => candidate.versionId === input.sourceVersionId);
    if (!source || source.status !== 'READY_TO_ADOPT') fail('Complete every row identity decision before adopting this source.', 409);
    const oldItems = await tx.awardedBOQItem.findMany({ where: { projectId: input.projectId }, orderBy: [{ itemCode: 'asc' }, { id: 'asc' }] });
    if (!source.basisChecksum || source.basisChecksum !== buildDraftBOQChecksum(oldItems)) fail('The current BOQ changed after assessment. Reject this assessment and stage it again.', 409);
    const byOldId = new Map(oldItems.map(item => [item.id, item]));
    const rowsByNumber = new Map(source.rows.map(row => [row.sourceRowNumber, row]));
    const adoptedItemIdByRow = new Map<number, string>();
    const carriedFieldsByRow = new Map<number, Record<string, string>>();
    const previousToAdopted = new Map<string, string>();
    const carryDecisions: BOQFinding[] = [];
    const carriedRevisions: BOQReviewDocument['revisions'] = [];
    const retainedIds = new Set<string>();
    const sectionIdentityByItemId: Record<string, { id: string; name: string; order: number }> = {};
    const createdItems = [];
    for (const assessment of source.assessment) {
      const key = `${assessment.oldRow ?? 'new'}:${assessment.newRow ?? 'removed'}`;
      const decision = source.identityDecisions[key]?.decision;
      if (!decision) fail('A corrected-source row is missing its identity decision.', 409);
      if (decision === 'SET_ASIDE' || assessment.newRow === null) continue;
      const row = rowsByNumber.get(assessment.newRow);
      if (!row) fail('An assessed workbook row is missing.', 409);
      const old = assessment.oldItemId ? byOldId.get(assessment.oldItemId) ?? null : null;
      const acceptance = source.carryAcceptance?.[key];
      const plan = old ? correctedSourceCarryPlan(old, row, document) : null;
      if (acceptance?.accepted && (!plan?.available || plan.conflicts.length || decision !== 'SAME_ITEM' || JSON.stringify(plan) !== JSON.stringify(source.carryPlans?.[key]))) fail('A carried decision changed after acceptance. Review the source assessment again.', 409);
      const values = { ...row, ...(acceptance?.accepted ? plan?.applyFields : {}) };
      const data = { itemCode: values.itemCode || `ROW-${row.sourceRowNumber}`, category: row.section, description: values.description, unit: values.unit, quantity: Number(values.quantity), combinedUnitCost: Number(values.unitCost), totalCost: Number(values.amount), directCost: Number(row.breakdown.totalDirectCost ?? values.amount), indirectCost: Number(row.breakdown.totalIndirectCost ?? '0'), remainingQuantity: Number(values.quantity), balanceAmount: Number(values.amount), revisedContractQuantity: Number(values.quantity), revisedContractUnitPrice: Number(values.unitCost), revisedContractAmount: Number(values.amount), status: 'DRAFT' };
      let adoptedItemId: string;
      if (decision === 'SAME_ITEM' && old) {
        retainedIds.add(old.id);
        const updated = await tx.awardedBOQItem.update({ where: { id: old.id }, data });
        adoptedItemId = updated.id;
      } else {
        const created = await tx.awardedBOQItem.create({ data: { projectId: input.projectId, ...data } });
        retainedIds.add(created.id);
        createdItems.push(created);
        adoptedItemId = created.id;
      }
      adoptedItemIdByRow.set(row.sourceRowNumber, adoptedItemId);
      if (old && decision === 'SAME_ITEM') previousToAdopted.set(old.id, adoptedItemId);
      if (acceptance?.accepted && plan) {
        carriedFieldsByRow.set(row.sourceRowNumber, plan.applyFields);
        carryDecisions.push(...plan.decisions.map(finding => ({ ...finding, id: randomUUID(), itemId: adoptedItemId, rowNumber: row.sourceRowNumber, evidence: { ...finding.evidence, carriedFromFindingId: finding.id, carriedFromVersionId: current.id }, decidedBy: input.actor.id, decidedAt: new Date().toISOString(), reason: acceptance.reason })));
        if (Object.keys(plan.applyFields).length) carriedRevisions.push({ id: randomUUID(), itemId: adoptedItemId, actorId: input.actor.id, reason: acceptance.reason, before: { ...row }, after: { ...values }, action: 'LINE_UPDATED', createdAt: new Date().toISOString() });
      }
      const sectionIdentity = source.sectionIdentityBySourceRow?.[String(row.sourceRowNumber)];
      if (sectionIdentity) sectionIdentityByItemId[adoptedItemId] = sectionIdentity;
      else sectionIdentityByItemId[adoptedItemId] = { id: `source:${source.versionId}:${row.sectionSourceKey ?? row.section}`, name: row.section, order: row.sectionOrder ?? 1 };
    }
    const removedIds = oldItems.filter(item => !retainedIds.has(item.id)).map(item => item.id);
    if (removedIds.length) {
      const references = await tx.scheduleBOQAllocation.count({ where: { awardedBoqItemId: { in: removedIds } } });
      if (references > 0) fail('A corrected BOQ cannot remove items already used by work-package allocations.', 409);
      await tx.awardedBOQItem.deleteMany({ where: { id: { in: removedIds }, projectId: input.projectId } });
    }
    const adoptedItems = await tx.awardedBOQItem.findMany({ where: { projectId: input.projectId }, orderBy: [{ itemCode: 'asc' }, { id: 'asc' }] });
    if (!adoptedItems.length) fail('The corrected source has no adoptable BOQ lines.', 400);
    const checksum = buildDraftBOQChecksum(adoptedItems);
    const total = adoptedItems.reduce((sum, item) => sum.plus(String(item.totalCost)), new Prisma.Decimal(0));
    const version = await tx.projectBOQVersion.create({ data: { id: source.versionId, projectId: input.projectId, sourceUploadedWorkbookFileId: source.uploadId, versionNumber: current.versionNumber + 1, versionLabel: `Corrected BOQ source v${current.versionNumber + 1}`, status: 'DRAFT', committedBy: input.actor.id, committedAt: new Date(), totalDirectCost: adoptedItems.reduce((sum, item) => sum + item.directCost, 0), totalIndirectCost: adoptedItems.reduce((sum, item) => sum + item.indirectCost, 0), totalAmount: total.toNumber(), checksum, checksumAlgorithm: 'SHA-256', checksumVersion: BOQ_CANONICALIZATION_VERSION, sourceProvenance: 'BOQ_CORRECTED_SOURCE', remarks: 'A corrected workbook source was adopted after row identity assessment.' } });
    await tx.projectBOQVersion.update({ where: { id: current.id }, data: { status: 'SUPERSEDED_FOR_REVIEW' } });
    source.status = 'ADOPTED'; source.adoptedAt = new Date().toISOString();
    document.history.push({ action: 'CORRECTED_SOURCE_ADOPTED', actorId: input.actor.id, reason: null, at: new Date().toISOString(), before: { versionId: current.id, checksum: current.checksum }, after: { versionId: version.id, checksum, total: total.toFixed(2), retainedIds: [...retainedIds], removedIds } });
    const oldSaved = await tx.bOQReviewState.updateMany({ where: { id: state.id, projectId: input.projectId, versionId: input.versionId, rowVersion: state.rowVersion }, data: { dataJson: reviewDocumentJson(document), rowVersion: { increment: 1 } } });
    if (oldSaved.count !== 1) fail('The BOQ review changed. Refresh before continuing.', 409);
    const canonicalReading: WorkspaceItem[] = source.rows.flatMap(row => {
      const item = adoptedItems.find(item => item.id === adoptedItemIdByRow.get(row.sourceRowNumber));
      if (!item) return [];
      const carried = carriedFieldsByRow.get(row.sourceRowNumber);
      return [{ sourceRowNumber: row.sourceRowNumber, section: row.section, sectionSourceKey: row.sectionSourceKey ?? 'source:default', sectionOrder: row.sectionOrder ?? 1, sectionStartRow: row.sectionStartRow ?? null,
        itemCode: item.itemCode, description: item.description, unit: item.unit, quantity: item.quantity, unitCost: item.combinedUnitCost, amount: item.totalCost,
        quantityDefaulted: Boolean(row.quantityDefaulted) && carried?.quantity === undefined, unitDefaulted: Boolean(row.unitDefaulted) && carried?.unit === undefined,
        itemCodeSynthesized: Boolean(row.itemCodeSynthesized), rateDerived: Boolean(row.rateDerived), sourceUnitCost: row.sourceUnitCost == null ? null : Number(row.sourceUnitCost) }];
    });
    const newFindings: BOQFinding[] = buildWorkspaceBOQFindings(canonicalReading, { itemIdsBySourceRow: Object.fromEntries(adoptedItemIdByRow), sheetName: source.selectedSheet });
    for (const entry of source.assessment) {
      const disposition = source.identityDecisions[`${entry.oldRow ?? 'new'}:${entry.newRow ?? 'removed'}`];
      if (entry.newRow === null || disposition?.decision !== 'SET_ASIDE') continue;
      newFindings.push({ id: randomUUID(), code: 'SOURCE_ROW_SET_ASIDE', field: 'source row', itemId: null, rowNumber: entry.newRow,
        message: 'This preserved corrected-source row was intentionally excluded from the Structured BOQ.', severity: 'ATTENTION', status: 'SET_ASIDE', reason: disposition.reason,
        evidence: { sourceVersionId: source.versionId, sourceRowNumber: entry.newRow }, decidedBy: input.actor.id, decidedAt: new Date().toISOString() });
    }
    // Printed totals compare immutable workbook facts, never a human-corrected total.
    newFindings.push(...(source.sourceFindings ?? []).filter(finding => finding.code === 'PRINTED_TOTAL_DIFFERS').map(finding => ({ ...finding, id: randomUUID() })));
    for (const finding of carryDecisions) {
      const existing = newFindings.find(candidate => candidate.itemId === finding.itemId && candidate.code === finding.code && candidate.field === finding.field);
      if (existing) Object.assign(existing, finding, { id: existing.id }); else newFindings.push(finding);
    }
    // Identity never disposes a review obligation. Preserve unresolved prior
    // findings, including version-level questions, with their lineage.
    const retainedFindings = preserveUnresolvedSourceFindings(newFindings, document.findings, previousToAdopted, current.id);
    const nextDocument = {
      ...document,
      versionId: version.id,
      sectionIdentityByItemId,
      source: { uploadId: source.uploadId, fileName: source.fileName, fileHash: source.fileHash, selectedSheet: source.selectedSheet, mapping: source.mapping, breakdownMapping: source.breakdownMapping, originalRows: source.rows.map(row => ({ ...row, itemId: adoptedItemIdByRow.get(row.sourceRowNumber) ?? null })) },
      findings: retainedFindings,
      revisions: carriedRevisions,
      readingHistory: [],
      contract: { verified: false, verifiedBy: null, verifiedAt: null, verificationReason: null },
      setAsideAcknowledgement: null,
      finalApproval: null,
    };
    await tx.bOQReviewState.create({ data: { projectId: input.projectId, versionId: version.id, dataJson: reviewDocumentJson(nextDocument) } });
    await tx.uploadedWorkbookFile.update({ where: { id: source.uploadId }, data: { commitStatus: 'PENDING', metadataJson: JSON.stringify({ source: 'BOQ_CORRECTED_SOURCE', status: 'DRAFT', versionId: version.id, fileHash: source.fileHash, sheetName: source.selectedSheet, mapping: source.mapping, breakdownMapping: source.breakdownMapping }) } });
    await tx.auditLog.create({ data: { userId: input.actor.id, userRole: input.actor.role, moduleName: 'PROJECT_BOQ', transactionId: version.id, actionType: 'PROJECT_BOQ_CORRECTED_SOURCE_ADOPTED', oldValue: JSON.stringify({ previousVersionId: current.id }), newValue: JSON.stringify({ versionId: version.id, checksum, total: total.toFixed(2), removedIds, createdItemIds: createdItems.map(item => item.id) }) } });
    return { success: true, versionId: version.id, checksum, total: total.toFixed(2), removedCount: removedIds.length, addedCount: createdItems.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120000 }));
}
