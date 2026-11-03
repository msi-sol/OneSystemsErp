import { Prisma } from '@prisma/client';
import { prisma, transactionContext } from '@/lib/prisma';
import { BOQ_CANONICALIZATION_VERSION, generateCanonicalChecksum } from '@/lib/boq/canonical-checksum';

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
};

type DatabaseProject = { id: string; boqLocked: boolean; contractAmount: number };
type DatabaseBOQVersion = {
  id: string;
  projectId: string;
  versionNumber: number;
  status: string;
  checksum: string | null;
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
    findFirst(args: QueryArgs): Promise<DatabaseBOQLine | null>;
    findMany(args: QueryArgs): Promise<DatabaseBOQLine[]>;
    update(args: QueryArgs): Promise<DatabaseBOQLine>;
    updateMany(args: QueryArgs): Promise<{ count: number }>;
  };
  projectSchedule: {
    findMany(args: QueryArgs): Promise<DatabaseSchedule[]>;
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
  const requiredText = (field: 'versionId' | 'itemId' | 'expectedChecksum' | 'description' | 'unit') => {
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

  return {
    versionId: requiredText('versionId'),
    itemId: requiredText('itemId'),
    expectedChecksum: requiredText('expectedChecksum'),
    description: requiredText('description'),
    unit: requiredText('unit'),
    quantity: quantity.text,
    unitCost: unitCost.text,
    amount: amount.text,
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

function assertStoredDraftLinesAreValid(items: readonly DraftBOQLine[]): void {
  if (items.some((item) => typeof item.description !== 'string' || !item.description.trim() || typeof item.unit !== 'string' || !item.unit.trim())) {
    fail('BOQ_LINE_TEXT_REQUIRED', 400);
  }
  for (const item of items) {
    const values = [item.quantity, item.combinedUnitCost, item.totalCost];
    if (values.some((value) => !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)) {
      fail('BOQ_LINE_NUMERIC_VALUE_INVALID', 400);
    }
    if (new Prisma.Decimal(String(item.combinedUnitCost)).decimalPlaces() > 2 || new Prisma.Decimal(String(item.totalCost)).decimalPlaces() > 2) {
      fail('BOQ_LINE_MONEY_PRECISION_INVALID', 400);
    }
  }
}

async function loadEditableDraft(
  tx: DraftBOQTransaction,
  projectId: string,
  versionId: string,
  expectedChecksum: string,
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

  const currentChecksum = buildDraftBOQChecksum(items);
  if (
    expectedChecksum !== currentChecksum ||
    (latestVersion.checksum != null && latestVersion.checksum !== currentChecksum)
  ) {
    fail('DRAFT_CHECKSUM_CONFLICT', 409);
  }

  return { project, latestVersion, schedules, items };
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
    const draft = await loadEditableDraft(tx, projectId, patch.versionId, patch.expectedChecksum);
    const item = await tx.awardedBOQItem.findFirst({
      where: { id: patch.itemId, projectId },
    });
    if (!item) fail('BOQ_ITEM_NOT_FOUND', 404);

    const updatedItem = await tx.awardedBOQItem.update({
      where: { id: item.id },
      data: {
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

export async function approveAndLockDraftBOQ(
  projectId: string,
  actorId: string,
  input: unknown,
  client: DraftBOQDatabase = database,
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
