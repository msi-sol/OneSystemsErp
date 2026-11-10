import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma, transactionContext } from '@/lib/prisma';
import { BOQ_CANONICALIZATION_VERSION, generateCanonicalChecksum } from '@/lib/boq/canonical-checksum';
import { manualBOQSectionIdentity } from '@/lib/boq/review-state';

export const DRAFT_BOQ_EDITABLE_SCHEDULE_STATUSES = [
  'AI_GENERATED_DRAFT',
  'INVALID_GENERATED_DRAFT',
  'TECHNICAL_REVISIONS_REQUIRED',
] as const;

export class DraftBOQWorkflowError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = 'DraftBOQWorkflowError';
  }
}

export type DraftBOQLine = {
  id: string;
  itemCode: string;
  category?: string | null;
  description: string;
  unit: string;
  quantity: number;
  combinedUnitCost: number;
  totalCost: number;
};

export type DraftBOQLinePatch = {
  versionId: string;
  itemId: string;
  expectedChecksum: string;
  description: string;
  unit: string;
  quantity: string;
  unitCost: string;
  amount: string;
  itemCode: string;
  editReason: string;
  section?: string;
  expectedReviewRowVersion?: number;
};

type DatabaseProject = { id: string; boqLocked: boolean; contractAmount: number };
type DatabaseBOQVersion = {
  id: string;
  projectId: string;
  versionNumber: number;
  status: string;
  checksum: string | null;
  sourceProvenance?: string | null;
  [key: string]: unknown;
};
type DatabaseBOQLine = DraftBOQLine & {
  projectId: string;
  revisedContractQuantity?: number;
  revisedContractUnitPrice?: number;
  revisedContractAmount?: number;
  status?: string;
};
type DatabaseSchedule = { id: string; workflowStatus: string; rowVersion: number };
type QueryArgs = Record<string, unknown>;

export type DraftBOQTransaction = {
  project: {
    findUnique(args: QueryArgs): Promise<DatabaseProject | null>;
    update(args: QueryArgs): Promise<DatabaseProject>;
  };
  projectBOQVersion: {
    findFirst(args: QueryArgs): Promise<DatabaseBOQVersion | null>;
    update(args: QueryArgs): Promise<DatabaseBOQVersion>;
  };
  awardedBOQItem: {
    create(args: QueryArgs): Promise<DatabaseBOQLine>;
    delete(args: QueryArgs): Promise<DatabaseBOQLine>;
    findFirst(args: QueryArgs): Promise<DatabaseBOQLine | null>;
    findMany(args: QueryArgs): Promise<DatabaseBOQLine[]>;
    update(args: QueryArgs): Promise<DatabaseBOQLine>;
    updateMany(args: QueryArgs): Promise<{ count: number }>;
  };
  projectSchedule: {
    findMany(args: QueryArgs): Promise<DatabaseSchedule[]>;
    updateMany(args: QueryArgs): Promise<{ count: number }>;
  };
  bOQReviewState?: {
    findFirst(args: QueryArgs): Promise<{ id: string; projectId: string; versionId: string; rowVersion: number; dataJson: string } | null>;
    updateMany(args: QueryArgs): Promise<{ count: number }>;
  };
  auditLog: { create(args: QueryArgs): Promise<unknown> };
};

export type DraftBOQDatabase = {
  $transaction<T>(
    callback: (tx: DraftBOQTransaction) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel; maxWait?: number; timeout?: number },
  ): Promise<T>;
};

const database = prisma as unknown as DraftBOQDatabase;

function fail(code: string, status: number): never {
  throw new DraftBOQWorkflowError(code, status);
}

export function assertDraftBOQPermission(allowed: boolean): void {
  if (!allowed) fail('FORBIDDEN', 403);
}

function parseDecimalInput(value: unknown, field: 'quantity' | 'unitCost' | 'amount'): { text: string; value: number } {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    fail(`INVALID_${field.toUpperCase()}`, 400);
  }
  const pattern = field === 'quantity' ? /^\d+(?:\.\d+)?$/ : /^\d+(?:\.\d{1,2})?$/;
  if (!pattern.test(value)) fail(`INVALID_${field.toUpperCase()}`, 400);
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number < 0 ||
    number > Number.MAX_SAFE_INTEGER ||
    !new Prisma.Decimal(value).equals(new Prisma.Decimal(String(number)))
  ) {
    fail(`INVALID_${field.toUpperCase()}`, 400);
  }
  return { text: value, value: number };
}

export function parseDraftBOQLinePatch(input: unknown): DraftBOQLinePatch & {
  quantityNumber: number;
  unitCostNumber: number;
  amountNumber: number;
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_REQUEST', 400);
  const body = input as Record<string, unknown>;
  const requiredText = (field: 'versionId' | 'itemId' | 'expectedChecksum' | 'description' | 'unit' | 'itemCode') => {
    const value = body[field];
    const maxLength = field === 'description' ? 10000 : 191;
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
      fail(`INVALID_${field.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`, 400);
    }
    return value.trim();
  };
  const quantity = parseDecimalInput(body.quantity, 'quantity');
  const unitCost = parseDecimalInput(body.unitCost, 'unitCost');
  const amount = parseDecimalInput(body.amount, 'amount');
  const itemCode = requiredText('itemCode');
  let section: string | undefined;
  if (body.section !== undefined) {
    if (typeof body.section !== 'string' || !body.section.trim() || body.section.trim().length > 191) fail('INVALID_SECTION', 400);
    section = body.section.trim();
  }
  const editReason = typeof body.editReason === 'string' ? body.editReason.trim() : '';
  if (editReason.length < 5 || editReason.length > 300) fail('INVALID_EDIT_REASON', 400);
  const expectedReviewRowVersion = body.expectedReviewRowVersion;
  if (expectedReviewRowVersion !== undefined && (!Number.isSafeInteger(expectedReviewRowVersion) || Number(expectedReviewRowVersion) < 0)) fail('INVALID_REVIEW_ROW_VERSION', 400);

  return {
    versionId: requiredText('versionId'),
    itemId: requiredText('itemId'),
    expectedChecksum: requiredText('expectedChecksum'),
    description: requiredText('description'),
    unit: requiredText('unit'),
    quantity: quantity.text,
    unitCost: unitCost.text,
    amount: amount.text,
    itemCode,
    editReason,
    section,
    expectedReviewRowVersion: expectedReviewRowVersion === undefined ? undefined : Number(expectedReviewRowVersion),
    quantityNumber: quantity.value,
    unitCostNumber: unitCost.value,
    amountNumber: amount.value,
  };
}

export function buildDraftBOQCanonicalLines(items: readonly DraftBOQLine[]) {
  const stableItems = [...items].sort((left, right) =>
    left.itemCode.localeCompare(right.itemCode) || left.id.localeCompare(right.id));

  return stableItems.map((item, index) => {
    const stableRow = String(index + 1).padStart(8, '0');
    return {
      seq: stableRow,
      sourceRow: stableRow,
      itemRef: item.itemCode,
      section: item.category ?? '',
      subsection: '',
      description: item.description,
      unit: item.unit,
      qty: String(item.quantity),
      unitCost: String(item.combinedUnitCost),
      amount: String(item.totalCost),
      isLot: false,
      breakdownRequired: false,
    };
  });
}

export function buildDraftBOQChecksum(items: readonly DraftBOQLine[]): string {
  return generateCanonicalChecksum(buildDraftBOQCanonicalLines(items));
}

export const buildDraftBoqChecksum = buildDraftBOQChecksum;

function calculateBOQTotal(items: readonly DraftBOQLine[]): Prisma.Decimal {
  return items.reduce((sum, item) => sum.add(String(item.totalCost)), new Prisma.Decimal(0));
}

function fixedMoney(amount: Prisma.Decimal | string | number): string {
  return new Prisma.Decimal(amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
}

function draftLineChangedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const fields = ['itemCode', 'section', 'description', 'unit', 'quantity', 'unitCost', 'amount'] as const;
  const numericFields = new Set<string>(['quantity', 'unitCost', 'amount']);
  return fields.filter((field) => {
    const left = String(before[field] ?? '');
    const right = String(after[field] ?? '');
    if (numericFields.has(field)) {
      try { return !new Prisma.Decimal(left).equals(right); } catch { return left !== right; }
    }
    return left !== right;
  });
}

function amountArithmeticReconciles(quantityValue: unknown, unitCostValue: unknown, amountValue: unknown): boolean {
  try {
    const quantity = new Prisma.Decimal(String(quantityValue));
    const unitCost = new Prisma.Decimal(String(unitCostValue));
    const amount = new Prisma.Decimal(String(amountValue));
    if (!quantity.isFinite() || !unitCost.isFinite() || !amount.isFinite()) return false;
    const tolerance = quantity.abs().mul('0.00005').plus(unitCost.abs().mul('0.00005')).plus('0.01');
    return quantity.mul(unitCost).minus(amount).abs().lte(tolerance);
  } catch {
    return false;
  }
}

const DERIVED_UNIT_RATE_DECIMALS = 4;

function assertStoredDraftLinesAreValid(items: readonly DraftBOQLine[]): void {
  if (items.some((item) => typeof item.description !== 'string' || !item.description.trim() || typeof item.unit !== 'string' || !item.unit.trim())) {
    fail('BOQ_LINE_TEXT_REQUIRED', 400);
  }
  for (const item of items) {
    const values = [item.quantity, item.combinedUnitCost, item.totalCost];
    if (values.some((value) => !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)) {
      fail('BOQ_LINE_NUMERIC_VALUE_INVALID', 400);
    }
    // Amounts are money (cents). Unit rates may carry four decimals: when a file's stated rate does not
    // reproduce its amount, the reader keeps the amount and derives the rate to four places.
    if (new Prisma.Decimal(String(item.combinedUnitCost)).decimalPlaces() > DERIVED_UNIT_RATE_DECIMALS || new Prisma.Decimal(String(item.totalCost)).decimalPlaces() > 2) {
      fail('BOQ_LINE_MONEY_PRECISION_INVALID', 400);
    }
  }
}

async function loadEditableDraft(
  tx: DraftBOQTransaction,
  projectId: string,
  versionId: string,
  expectedChecksum: string,
  expectedReviewRowVersion?: number,
) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { id: true, boqLocked: true, contractAmount: true },
  });
  if (!project) fail('PROJECT_NOT_FOUND', 404);
  if (project.boqLocked) fail('BOQ_ALREADY_LOCKED', 409);

  const latestVersion = await tx.projectBOQVersion.findFirst({
    where: { projectId },
    orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }],
  });
  if (!latestVersion || latestVersion.id !== versionId || latestVersion.status !== 'DRAFT') {
    fail('DRAFT_VERSION_CONFLICT', 409);
  }
  const schedules = await tx.projectSchedule.findMany({
    where: { projectId },
    select: { id: true, workflowStatus: true, rowVersion: true },
  });
  if (schedules.some((schedule) => !(DRAFT_BOQ_EDITABLE_SCHEDULE_STATUSES as readonly string[]).includes(schedule.workflowStatus))) {
    fail('BOQ_HAS_REVIEWED_OR_IMMUTABLE_SCHEDULE', 409);
  }

  const items = await tx.awardedBOQItem.findMany({
    where: { projectId },
    orderBy: [{ itemCode: 'asc' }, { id: 'asc' }],
  });
  const reviewState = await tx.bOQReviewState?.findFirst({ where: { projectId, versionId } }) ?? null;
  if (reviewState && expectedReviewRowVersion !== undefined && reviewState.rowVersion !== expectedReviewRowVersion) {
    fail('BOQ_REVIEW_STATE_CONFLICT', 409);
  }

  const currentChecksum = buildDraftBOQChecksum(items);
  if (
    expectedChecksum !== currentChecksum ||
    (latestVersion.checksum != null && latestVersion.checksum !== currentChecksum)
  ) {
    fail('DRAFT_CHECKSUM_CONFLICT', 409);
  }

  return { project, latestVersion, schedules, items, reviewState };
}

async function persistLineRevision(
  tx: DraftBOQTransaction,
  draft: Awaited<ReturnType<typeof loadEditableDraft>>,
  input: { actorId: string; itemId: string; reason: string; before: Record<string, unknown>; after: Record<string, unknown> | null; action: 'LINE_UPDATED' | 'LINE_ADDED' | 'LINE_REMOVED'; changedFields?: string[] },
) {
  if (!draft.reviewState || !tx.bOQReviewState) return;
  let document: Record<string, unknown>;
  try { document = JSON.parse(draft.reviewState.dataJson) as Record<string, unknown>; }
  catch { fail('BOQ_REVIEW_STATE_INVALID', 409); }
  const revisions = Array.isArray(document.revisions) ? document.revisions : [];
  const recordedAt = new Date().toISOString();
  revisions.push({ id: randomUUID(), itemId: input.itemId, actorId: input.actorId, reason: input.reason, before: input.before, after: input.after, action: input.action, changedFields: input.changedFields, createdAt: recordedAt });
  document.revisions = revisions;
  const sectionMap = document.sectionIdentityByItemId && typeof document.sectionIdentityByItemId === 'object'
    ? document.sectionIdentityByItemId as Record<string, { id: string; name: string; order: number }>
    : {};
  if (input.action === 'LINE_REMOVED') delete sectionMap[input.itemId];
  else if (typeof input.after?.section === 'string' && input.after.section.trim()) {
    const current = sectionMap[input.itemId];
    if (!current || current.name !== input.after.section) {
      const maxOrder = Math.max(0, ...Object.values(sectionMap).map(identity => Number(identity?.order) || 0));
      const proposed = manualBOQSectionIdentity(input.after.section, maxOrder + 1);
      const existing = Object.values(sectionMap).find(identity => identity?.id === proposed.id);
      sectionMap[input.itemId] = existing ? { ...proposed, order: existing.order } : proposed;
    }
  }
  document.sectionIdentityByItemId = sectionMap;
  if (input.action === 'LINE_UPDATED' && typeof input.after?.itemCode === 'string') {
    const findings = Array.isArray(document.findings) ? document.findings as Array<Record<string, unknown>> : [];
    for (const finding of findings) {
      if (finding.itemId === input.itemId && finding.code === 'MISSING_ITEM_CODE' && finding.status === 'OPEN' && !finding.invalidatedAt) {
        finding.status = 'CORRECTED';
        finding.reason = input.reason;
        finding.decidedBy = input.actorId;
        finding.decidedAt = recordedAt;
      }
    }
    document.findings = findings;
  }
  if (input.action === 'LINE_UPDATED' && input.after && input.changedFields?.length) {
    const findings = Array.isArray(document.findings) ? document.findings as Array<Record<string, unknown>> : [];
    const changed = new Set(input.changedFields);
    for (const finding of findings) {
      if (finding.itemId !== input.itemId || finding.status !== 'OPEN' || finding.invalidatedAt) continue;
      const field = finding.field;
      let resolved = false;
      if (finding.code === 'QUANTITY_DEFAULTED' && field === 'quantity' && changed.has('quantity')) {
        const quantity = new Prisma.Decimal(String(input.after.quantity));
        resolved = quantity.isFinite() && quantity.gte(0);
      } else if (finding.code === 'UNIT_DEFAULTED' && field === 'unit' && changed.has('unit')) {
        resolved = typeof input.after.unit === 'string' && input.after.unit.trim().length > 0;
      } else if (finding.code === 'AMOUNT_ARITHMETIC' && (changed.has('quantity') || changed.has('unitCost') || changed.has('amount'))) {
        resolved = amountArithmeticReconciles(input.after.quantity, input.after.unitCost, input.after.amount);
      }
      if (!resolved) continue;
      finding.status = 'CORRECTED';
      finding.reason = input.reason;
      finding.decidedBy = input.actorId;
      finding.decidedAt = recordedAt;
    }
    document.findings = findings;
  }
  const stateHistory = Array.isArray(document.history) ? document.history : [];
  stateHistory.push({ action: input.action, actorId: input.actorId, reason: input.reason, at: new Date().toISOString(), before: input.before, after: input.after });
  document.history = stateHistory;
  const updated = await tx.bOQReviewState.updateMany({
    where: { id: draft.reviewState.id, projectId: draft.reviewState.projectId, versionId: draft.reviewState.versionId, rowVersion: draft.reviewState.rowVersion },
    data: { dataJson: JSON.stringify(document), rowVersion: { increment: 1 } },
  });
  if (updated.count !== 1) fail('BOQ_REVIEW_STATE_CONFLICT', 409);
}

function runInWorkflowContext<T>(client: DraftBOQDatabase, callback: (tx: DraftBOQTransaction) => Promise<T>) {
  return transactionContext.run({ sourceProvenance: 'GATE9_WORKFLOW_ENGINE' }, async () => {
    try {
      return await client.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 15000,
        timeout: 30000,
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2034') {
        fail('DRAFT_CONCURRENCY_CONFLICT', 409);
      }
      throw error;
    }
  });
}

export async function updateDraftBOQLine(
  projectId: string,
  actorId: string,
  input: unknown,
  client: DraftBOQDatabase = database,
) {
  if (!projectId || !actorId) fail('INVALID_REQUEST', 400);
  const patch = parseDraftBOQLinePatch(input);

  return runInWorkflowContext(client, async (tx) => {
    const draft = await loadEditableDraft(tx, projectId, patch.versionId, patch.expectedChecksum, patch.expectedReviewRowVersion);
    const item = await tx.awardedBOQItem.findFirst({
      where: { id: patch.itemId, projectId },
    });
    if (!item) fail('BOQ_ITEM_NOT_FOUND', 404);

    const updatedItem = await tx.awardedBOQItem.update({
      where: { id: item.id },
      data: {
        itemCode: patch.itemCode,
        ...(patch.section ? { category: patch.section } : {}),
        description: patch.description,
        unit: patch.unit,
        quantity: patch.quantityNumber,
        combinedUnitCost: patch.unitCostNumber,
        totalCost: patch.amountNumber,
        revisedContractQuantity: patch.quantityNumber,
        revisedContractUnitPrice: patch.unitCostNumber,
        revisedContractAmount: patch.amountNumber,
      },
    });

    const nextItems = draft.items.map((line) => line.id === updatedItem.id ? updatedItem : line);
    const checksum = buildDraftBOQChecksum(nextItems);
    const boqTotal = fixedMoney(calculateBOQTotal(nextItems));
    await tx.projectBOQVersion.update({
      where: { id: draft.latestVersion.id },
      data: {
        checksum,
        checksumAlgorithm: 'SHA-256',
        checksumVersion: BOQ_CANONICALIZATION_VERSION,
        totalAmount: Number(boqTotal),
      },
    });

    await persistLineRevision(tx, draft, {
      actorId,
      itemId: item.id,
      reason: patch.editReason,
      action: 'LINE_UPDATED',
      changedFields: draftLineChangedFields(
        { itemCode: item.itemCode, section: item.category ?? 'General', description: item.description, unit: item.unit, quantity: String(item.quantity), unitCost: String(item.combinedUnitCost), amount: String(item.totalCost) },
        { itemCode: updatedItem.itemCode, section: updatedItem.category ?? 'General', description: updatedItem.description, unit: updatedItem.unit, quantity: String(updatedItem.quantity), unitCost: String(updatedItem.combinedUnitCost), amount: String(updatedItem.totalCost) },
      ),
      before: { itemCode: item.itemCode, section: item.category ?? 'General', description: item.description, unit: item.unit, quantity: String(item.quantity), unitCost: String(item.combinedUnitCost), amount: String(item.totalCost) },
      after: { itemCode: updatedItem.itemCode, section: updatedItem.category ?? 'General', description: updatedItem.description, unit: updatedItem.unit, quantity: String(updatedItem.quantity), unitCost: String(updatedItem.combinedUnitCost), amount: String(updatedItem.totalCost) },
    });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        actionType: 'PROJECT_BOQ_DRAFT_LINE_UPDATED',
        moduleName: 'PROJECT_BOQ',
        transactionId: item.id,
        createdAt: new Date(),
        oldValue: JSON.stringify({
          versionId: draft.latestVersion.id,
          checksum: patch.expectedChecksum,
          line: {
            id: item.id,
            itemCode: item.itemCode,
            description: item.description,
            unit: item.unit,
            quantity: String(item.quantity),
            unitCost: String(item.combinedUnitCost),
            amount: String(item.totalCost),
          },
        }),
        newValue: JSON.stringify({
          versionId: draft.latestVersion.id,
          checksum,
          boqTotal,
          line: {
            id: updatedItem.id,
            itemCode: updatedItem.itemCode,
            description: updatedItem.description,
            unit: updatedItem.unit,
            quantity: String(updatedItem.quantity),
            unitCost: String(updatedItem.combinedUnitCost),
            amount: String(updatedItem.totalCost),
          },
        }),
      },
    });

    return { success: true, checksum, boqTotal };
  });
}

export async function addDraftBOQLine(projectId: string, actorId: string, input: unknown, client: DraftBOQDatabase = database) {
  if (!projectId || !actorId || !input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_REQUEST', 400);
  const body = input as Record<string, unknown>;
  const parsed = parseDraftBOQLinePatch({ ...body, itemId: 'new-line' });
  const sectionValue = body.section ?? body.category;
  const section = typeof sectionValue === 'string' && sectionValue.trim() ? sectionValue.trim().slice(0, 191) : 'General';
  return runInWorkflowContext(client, async tx => {
    const draft = await loadEditableDraft(tx, projectId, parsed.versionId, parsed.expectedChecksum, parsed.expectedReviewRowVersion);
    const created = await tx.awardedBOQItem.create({
      data: {
        projectId,
        itemCode: parsed.itemCode,
        category: section,
        description: parsed.description,
        unit: parsed.unit,
        quantity: parsed.quantityNumber,
        combinedUnitCost: parsed.unitCostNumber,
        totalCost: parsed.amountNumber,
        directCost: parsed.amountNumber,
        indirectCost: 0,
        remainingQuantity: parsed.quantityNumber,
        balanceAmount: parsed.amountNumber,
        revisedContractQuantity: parsed.quantityNumber,
        revisedContractUnitPrice: parsed.unitCostNumber,
        revisedContractAmount: parsed.amountNumber,
        status: 'DRAFT',
      },
    });
    const nextItems = [...draft.items, created];
    const checksum = buildDraftBOQChecksum(nextItems);
    const boqTotal = fixedMoney(calculateBOQTotal(nextItems));
    await tx.projectBOQVersion.update({ where: { id: draft.latestVersion.id }, data: { checksum, checksumAlgorithm: 'SHA-256', checksumVersion: BOQ_CANONICALIZATION_VERSION, totalAmount: Number(boqTotal) } });
    await persistLineRevision(tx, draft, { actorId, itemId: created.id, reason: parsed.editReason, action: 'LINE_ADDED', before: {}, after: { itemCode: created.itemCode, section, description: created.description, unit: created.unit, quantity: String(created.quantity), unitCost: String(created.combinedUnitCost), amount: String(created.totalCost) } });
    await tx.auditLog.create({ data: { userId: actorId, actionType: 'PROJECT_BOQ_DRAFT_LINE_ADDED', moduleName: 'PROJECT_BOQ', transactionId: created.id, createdAt: new Date(), oldValue: JSON.stringify({ versionId: draft.latestVersion.id, checksum: parsed.expectedChecksum }), newValue: JSON.stringify({ versionId: draft.latestVersion.id, checksum, lineId: created.id, reason: parsed.editReason, section }) } });
    return { success: true, itemId: created.id, checksum, boqTotal };
  });
}

export async function removeDraftBOQLine(projectId: string, actorId: string, input: unknown, client: DraftBOQDatabase = database) {
  if (!projectId || !actorId || !input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_REQUEST', 400);
  const body = input as Record<string, unknown>;
  const versionId = typeof body.versionId === 'string' ? body.versionId.trim() : '';
  const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : '';
  const expectedChecksum = typeof body.expectedChecksum === 'string' ? body.expectedChecksum.trim() : '';
  const reason = typeof body.editReason === 'string' ? body.editReason.trim() : '';
  const expectedReviewRowVersion = body.expectedReviewRowVersion;
  if (!versionId || !itemId || !expectedChecksum || reason.length < 5 || reason.length > 300 || (expectedReviewRowVersion !== undefined && (!Number.isSafeInteger(expectedReviewRowVersion) || Number(expectedReviewRowVersion) < 0))) fail('INVALID_REQUEST', 400);
  return runInWorkflowContext(client, async tx => {
    const draft = await loadEditableDraft(tx, projectId, versionId, expectedChecksum, expectedReviewRowVersion === undefined ? undefined : Number(expectedReviewRowVersion));
    const item = draft.items.find(line => line.id === itemId);
    if (!item) fail('BOQ_ITEM_NOT_FOUND', 404);
    if (draft.items.length < 2) fail('BOQ_MUST_KEEP_ONE_LINE', 400);
    await tx.awardedBOQItem.delete({ where: { id: itemId } });
    const nextItems = draft.items.filter(line => line.id !== itemId);
    const checksum = buildDraftBOQChecksum(nextItems);
    const boqTotal = fixedMoney(calculateBOQTotal(nextItems));
    await tx.projectBOQVersion.update({ where: { id: draft.latestVersion.id }, data: { checksum, checksumAlgorithm: 'SHA-256', checksumVersion: BOQ_CANONICALIZATION_VERSION, totalAmount: Number(boqTotal) } });
    await persistLineRevision(tx, draft, { actorId, itemId, reason, action: 'LINE_REMOVED', before: { itemCode: item.itemCode, section: item.category ?? 'General', description: item.description, unit: item.unit, quantity: String(item.quantity), unitCost: String(item.combinedUnitCost), amount: String(item.totalCost) }, after: null });
    await tx.auditLog.create({ data: { userId: actorId, actionType: 'PROJECT_BOQ_DRAFT_LINE_REMOVED', moduleName: 'PROJECT_BOQ', transactionId: item.id, createdAt: new Date(), oldValue: JSON.stringify({ versionId, checksum: expectedChecksum, line: item, reason }), newValue: JSON.stringify({ versionId, checksum, boqTotal }) } });
    return { success: true, checksum, boqTotal };
  });
}

export async function approveAndLockDraftBOQ(
  projectId: string,
  actorId: string,
  input: unknown,
  client: DraftBOQDatabase = database,
  moduleReviewApproval = false,
) {
  if (!projectId || !actorId || !input || typeof input !== 'object' || Array.isArray(input)) {
    fail('INVALID_REQUEST', 400);
  }
  const body = input as Record<string, unknown>;
  if (typeof body.versionId !== 'string' || !body.versionId.trim() || typeof body.expectedChecksum !== 'string' || !body.expectedChecksum.trim()) {
    fail('INVALID_REQUEST', 400);
  }
  const versionId = body.versionId.trim();
  const expectedChecksum = body.expectedChecksum.trim();

  return runInWorkflowContext(client, async (tx) => {
    const draft = await loadEditableDraft(tx, projectId, versionId, expectedChecksum);
    if (!moduleReviewApproval && (draft.reviewState || ['BOQ_WORKSPACE', 'BOQ_CORRECTED_SOURCE', 'BOQ_TEMPLATE_CENTER'].includes(String(draft.latestVersion.sourceProvenance ?? '')))) {
      fail('BOQ_MODULE_REVIEW_REQUIRED', 409);
    }
    if (draft.items.length === 0) fail('BOQ_HAS_NO_LINES', 400);

    assertStoredDraftLinesAreValid(draft.items);
    const contractAmount = new Prisma.Decimal(String(draft.project.contractAmount));
    if (
      !Number.isFinite(draft.project.contractAmount) ||
      draft.project.contractAmount <= 0 ||
      draft.project.contractAmount > Number.MAX_SAFE_INTEGER
    ) {
      fail('PROJECT_CONTRACT_AMOUNT_INVALID', 400);
    }
    const preciseBOQTotal = calculateBOQTotal(draft.items);
    if (preciseBOQTotal.comparedTo(contractAmount) !== 0) {
      fail('BOQ_TOTAL_DOES_NOT_MATCH_CONTRACT', 400);
    }
    const boqTotal = fixedMoney(preciseBOQTotal);

    const now = new Date();
    const approvedVersion = await tx.projectBOQVersion.update({
      where: { id: draft.latestVersion.id },
      data: {
        status: 'APPROVED',
        checksum: expectedChecksum,
        checksumAlgorithm: 'SHA-256',
        checksumVersion: BOQ_CANONICALIZATION_VERSION,
        approvedBy: actorId,
        approvedAt: now,
        lockedById: actorId,
        lockedAt: now,
        totalAmount: Number(boqTotal),
      },
    });

    await tx.awardedBOQItem.updateMany({
      where: { projectId },
      data: { status: 'APPROVED' },
    });
    await tx.project.update({
      where: { id: projectId },
      data: { boqLocked: true },
    });

    for (const schedule of draft.schedules) {
      const pinned = await tx.projectSchedule.updateMany({
        where: {
          id: schedule.id,
          projectId,
          workflowStatus: { in: [...DRAFT_BOQ_EDITABLE_SCHEDULE_STATUSES] },
          rowVersion: schedule.rowVersion,
        },
        data: {
          lockedBOQVersionId: approvedVersion.id,
          lockedBOQChecksum: expectedChecksum,
          rowVersion: { increment: 1 },
        },
      });
      if (pinned.count !== 1) fail('SCHEDULE_VERSION_CONFLICT', 409);
    }

    await tx.auditLog.create({
      data: {
        userId: actorId,
        actionType: 'PROJECT_BOQ_DRAFT_APPROVED_AND_LOCKED',
        moduleName: 'PROJECT_BOQ',
        transactionId: approvedVersion.id,
        createdAt: now,
        newValue: JSON.stringify({
          projectId,
          versionId: approvedVersion.id,
          status: approvedVersion.status,
          checksum: expectedChecksum,
          boqTotal,
          approvedBy: actorId,
          lockedById: actorId,
          pinnedScheduleIds: draft.schedules.map((schedule) => schedule.id),
        }),
      },
    });

    return { success: true, checksum: expectedChecksum, boqTotal };
  });
}
