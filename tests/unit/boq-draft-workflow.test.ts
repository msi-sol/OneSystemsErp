import {
  approveAndLockDraftBOQ,
  assertDraftBOQPermission,
  buildDraftBOQChecksum,
  DraftBOQWorkflowError,
  updateDraftBOQLine,
  type DraftBOQDatabase,
  type DraftBOQTransaction,
  type DraftBOQLine,
} from '@/lib/boq/draft-workflow';
import { hasApprovedLockedBOQPin } from '@/lib/scheduling/scheduleWorkflow';

const PROJECT_ID = 'project-a';
const ACTOR_ID = 'user-director';
const VERSION_ID = 'version-a';

type TestLine = DraftBOQLine & {
  projectId: string;
  revisedContractQuantity: number;
  revisedContractUnitPrice: number;
  revisedContractAmount: number;
  status: string;
};
type TestSchedule = {
  id: string;
  projectId: string;
  workflowStatus: string;
  rowVersion: number;
  lockedBOQVersionId?: string;
  lockedBOQChecksum?: string;
};
type TestVersion = {
  id: string;
  projectId: string;
  versionNumber: number;
  status: string;
  checksum: string | null;
  totalAmount: number;
  approvedBy?: string;
  approvedAt?: Date;
  lockedById?: string;
  lockedAt?: Date;
  checksumAlgorithm?: string;
  checksumVersion?: string;
};

function recordOf(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function makeLine(overrides: Partial<TestLine> = {}): TestLine {
  return {
    id: 'line-a',
    projectId: PROJECT_ID,
    itemCode: 'BOQ-001',
    category: 'Earthworks',
    description: 'Excavate work area',
    unit: 'm3',
    quantity: 10,
    combinedUnitCost: 2,
    totalCost: 20,
    revisedContractQuantity: 0,
    revisedContractUnitPrice: 0,
    revisedContractAmount: 0,
    status: 'PENDING',
    ...overrides,
  };
}

function makeHarness(options: {
  items?: TestLine[];
  contractAmount?: number;
  boqLocked?: boolean;
  scheduleStatus?: string;
} = {}) {
  const state: {
    project: { id: string; contractAmount: number; boqLocked: boolean };
    items: TestLine[];
    schedules: TestSchedule[];
    audits: Array<Record<string, unknown>>;
    version: TestVersion;
  } = {
    project: { id: PROJECT_ID, contractAmount: options.contractAmount ?? 20, boqLocked: options.boqLocked ?? false },
    items: options.items ?? [makeLine()],
    schedules: options.scheduleStatus
      ? [{ id: 'schedule-a', projectId: PROJECT_ID, workflowStatus: options.scheduleStatus, rowVersion: 4 }]
      : [{ id: 'schedule-a', projectId: PROJECT_ID, workflowStatus: 'AI_GENERATED_DRAFT', rowVersion: 4 }],
    audits: [] as Array<Record<string, unknown>>,
    version: null as unknown as TestVersion,
  };
  state.version = {
    id: VERSION_ID,
    projectId: PROJECT_ID,
    versionNumber: 1,
    status: 'DRAFT',
    checksum: buildDraftBOQChecksum(state.items),
    totalAmount: 20,
  };

  const tx: DraftBOQTransaction = {
    project: {
      findUnique: async () => ({ ...state.project }),
      update: async (args) => Object.assign(state.project, recordOf(args.data)),
    },
    projectBOQVersion: {
      findFirst: async () => ({ ...state.version }),
      update: async (args) => Object.assign(state.version, recordOf(args.data)),
    },
    awardedBOQItem: {
      findFirst: async (args) => {
        const where = recordOf(args.where);
        return state.items.find((item) => item.id === where.id && item.projectId === where.projectId) ?? null;
      },
      findMany: async () => state.items.map((item) => ({ ...item })),
      update: async (args) => {
        const where = recordOf(args.where);
        const data = recordOf(args.data);
        const item = state.items.find((candidate) => candidate.id === where.id);
        if (!item) throw new Error('missing item in test fixture');
        Object.assign(item, data as Partial<TestLine>);
        return { ...item };
      },
      updateMany: async (args) => {
        const where = recordOf(args.where);
        const data = recordOf(args.data) as Partial<TestLine>;
        const selected = state.items.filter((item) => item.projectId === where.projectId);
        selected.forEach((item) => Object.assign(item, data));
        return { count: selected.length };
      },
    },
    projectSchedule: {
      findMany: async () => state.schedules.map((schedule) => ({ ...schedule })),
      updateMany: async (args) => {
        const where = recordOf(args.where);
        const data = recordOf(args.data);
        const schedule = state.schedules.find((candidate) => candidate.id === where.id && candidate.projectId === where.projectId);
        const statusFilter = recordOf(where.workflowStatus);
        const statuses = statusFilter.in as string[];
        if (!schedule || !statuses.includes(schedule.workflowStatus) || schedule.rowVersion !== where.rowVersion) {
          return { count: 0 };
        }
        schedule.lockedBOQVersionId = String(data.lockedBOQVersionId);
        schedule.lockedBOQChecksum = String(data.lockedBOQChecksum);
        schedule.rowVersion += (recordOf(data.rowVersion).increment as number);
        return { count: 1 };
      },
    },
    auditLog: { create: async (args) => { state.audits.push(recordOf(args.data)); } },
  };

  const client: DraftBOQDatabase = {
    $transaction: async <T>(callback: (transaction: DraftBOQTransaction) => Promise<T>) => callback(tx),
  };
  return { state, client };
}

function patchFor(harness: ReturnType<typeof makeHarness>, overrides: Record<string, unknown> = {}) {
  return {
    versionId: VERSION_ID,
    itemId: 'line-a',
    expectedChecksum: harness.state.version.checksum ?? buildDraftBOQChecksum(harness.state.items),
    description: 'Excavate work area',
    unit: 'm3',
    quantity: '10',
    unitCost: '2.00',
    amount: '20.00',
    ...overrides,
  };
}

describe('draft awarded BOQ workflow', () => {
  it('requires a matching approved BOQ pin for draft review and preserves a pinned approved BL-001 baseline', () => {
    const approvedPin = {
      id: 'approved-boq-v1',
      status: 'APPROVED',
      checksum: 'approved-checksum',
    };
    expect(hasApprovedLockedBOQPin(true, {
      lockedBOQVersionId: approvedPin.id,
      lockedBOQChecksum: approvedPin.checksum,
    }, approvedPin)).toBe(true);
    expect(hasApprovedLockedBOQPin(false, {
      lockedBOQVersionId: null,
      lockedBOQChecksum: null,
    }, null)).toBe(false);
    expect(hasApprovedLockedBOQPin(true, {
      lockedBOQVersionId: approvedPin.id,
      lockedBOQChecksum: 'stale-checksum',
    }, approvedPin)).toBe(false);
  });

  it('rejects callers without the corresponding project permission', () => {
    try {
      assertDraftBOQPermission(false);
      throw new Error('expected permission check to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(DraftBOQWorkflowError);
      expect(error).toMatchObject({ code: 'FORBIDDEN', status: 403 });
    }
  });

  it('rejects a stale draft checksum before changing a line', async () => {
    const harness = makeHarness();
    await expect(updateDraftBOQLine(PROJECT_ID, ACTOR_ID, patchFor(harness, { expectedChecksum: 'stale' }), harness.client))
      .rejects.toMatchObject({ code: 'DRAFT_CHECKSUM_CONFLICT', status: 409 });
    expect(harness.state.items[0].description).toBe('Excavate work area');
  });

  it('maps serializable transaction conflicts to a typed conflict response', async () => {
    const harness = makeHarness();
    const serializationConflict: DraftBOQDatabase = {
      $transaction: async <T>(): Promise<T> => {
        throw Object.assign(new Error('serialization conflict'), { code: 'P2034' });
      },
    };
    await expect(updateDraftBOQLine(PROJECT_ID, ACTOR_ID, patchFor(harness), serializationConflict))
      .rejects.toMatchObject({ code: 'DRAFT_CONCURRENCY_CONFLICT', status: 409 });
  });

  it('derives the initial concurrency checksum when a new DRAFT version has no stored checksum', async () => {
    const harness = makeHarness();
    harness.state.version.checksum = null;
    const initialChecksum = buildDraftBOQChecksum(harness.state.items);
    const result = await updateDraftBOQLine(PROJECT_ID, ACTOR_ID, patchFor(harness, {
      expectedChecksum: initialChecksum,
      description: 'Updated excavation description',
    }), harness.client);
    expect(harness.state.items[0].description).toBe('Updated excavation description');
    expect(result.checksum).toBe(harness.state.version.checksum);
  });

  it('does not update an item from another project', async () => {
    const harness = makeHarness({ items: [makeLine({ projectId: 'project-b' })] });
    harness.state.version.checksum = buildDraftBOQChecksum(harness.state.items);
    await expect(updateDraftBOQLine(PROJECT_ID, ACTOR_ID, patchFor(harness), harness.client))
      .rejects.toMatchObject({ code: 'BOQ_ITEM_NOT_FOUND', status: 404 });
  });

  it('rejects negative quantities and money precision beyond cents', async () => {
    const harness = makeHarness();
    await expect(updateDraftBOQLine(PROJECT_ID, ACTOR_ID, patchFor(harness, { quantity: '-1' }), harness.client))
      .rejects.toMatchObject({ code: 'INVALID_QUANTITY', status: 400 });
    await expect(updateDraftBOQLine(PROJECT_ID, ACTOR_ID, patchFor(harness, { amount: '20.001' }), harness.client))
      .rejects.toMatchObject({ code: 'INVALID_AMOUNT', status: 400 });
  });

  it('rejects Float inputs that exceed safe integer or decimal round-trip precision', async () => {
    const harness = makeHarness();
    await expect(updateDraftBOQLine(PROJECT_ID, ACTOR_ID, patchFor(harness, { quantity: '9007199254740992' }), harness.client))
      .rejects.toMatchObject({ code: 'INVALID_QUANTITY', status: 400 });
    await expect(updateDraftBOQLine(PROJECT_ID, ACTOR_ID, patchFor(harness, { quantity: '9007199254740991.1' }), harness.client))
      .rejects.toMatchObject({ code: 'INVALID_QUANTITY', status: 400 });
  });

  it('rejects units exceeding the database varchar length', async () => {
    const harness = makeHarness();
    await expect(updateDraftBOQLine(PROJECT_ID, ACTOR_ID, patchFor(harness, { unit: 'm'.repeat(192) }), harness.client))
      .rejects.toMatchObject({ code: 'INVALID_UNIT', status: 400 });
  });

  it('blocks BOQ editing once a schedule has entered review', async () => {
    const harness = makeHarness({ scheduleStatus: 'READY_FOR_REVIEW' });
    await expect(updateDraftBOQLine(PROJECT_ID, ACTOR_ID, patchFor(harness), harness.client))
      .rejects.toMatchObject({ code: 'BOQ_HAS_REVIEWED_OR_IMMUTABLE_SCHEDULE', status: 409 });
  });

  it('preserves an authoritative amount and does not recompute it from quantity and unit cost', async () => {
    const harness = makeHarness();
    const result = await updateDraftBOQLine(PROJECT_ID, ACTOR_ID, patchFor(harness, {
      quantity: '0.123456789',
      unitCost: '0.99',
      amount: '12.34',
    }), harness.client);

    expect(harness.state.items[0]).toMatchObject({
      quantity: 0.123456789,
      combinedUnitCost: 0.99,
      totalCost: 12.34,
      revisedContractQuantity: 0.123456789,
      revisedContractUnitPrice: 0.99,
      revisedContractAmount: 12.34,
    });
    expect(result.boqTotal).toBe('12.34');
    expect(result.checksum).toBe(harness.state.version.checksum);
    expect(harness.state.project.contractAmount).toBe(20);
  });

  it('does not round a non-cent contract mismatch into an approval', async () => {
    const harness = makeHarness({ contractAmount: 20.001 });
    await expect(approveAndLockDraftBOQ(PROJECT_ID, ACTOR_ID, {
      versionId: VERSION_ID,
      expectedChecksum: harness.state.version.checksum,
    }, harness.client)).rejects.toMatchObject({ code: 'BOQ_TOTAL_DOES_NOT_MATCH_CONTRACT', status: 400 });
    expect(harness.state.version.status).toBe('DRAFT');
    expect(harness.state.project.boqLocked).toBe(false);
  });

  it('requires a positive finite contract amount before approval', async () => {
    const harness = makeHarness({ contractAmount: 0 });
    await expect(approveAndLockDraftBOQ(PROJECT_ID, ACTOR_ID, {
      versionId: VERSION_ID,
      expectedChecksum: harness.state.version.checksum,
    }, harness.client)).rejects.toMatchObject({ code: 'PROJECT_CONTRACT_AMOUNT_INVALID', status: 400 });
  });

  it('refuses approval when a persisted draft line is incomplete or has invalid numeric fields', async () => {
    const incomplete = makeHarness({ items: [makeLine({ description: '   ' })] });
    await expect(approveAndLockDraftBOQ(PROJECT_ID, ACTOR_ID, {
      versionId: VERSION_ID,
      expectedChecksum: incomplete.state.version.checksum,
    }, incomplete.client)).rejects.toMatchObject({ code: 'BOQ_LINE_TEXT_REQUIRED', status: 400 });

    const invalidNumber = makeHarness({ items: [makeLine({ quantity: -1 })] });
    await expect(approveAndLockDraftBOQ(PROJECT_ID, ACTOR_ID, {
      versionId: VERSION_ID,
      expectedChecksum: invalidNumber.state.version.checksum,
    }, invalidNumber.client)).rejects.toMatchObject({ code: 'BOQ_LINE_NUMERIC_VALUE_INVALID', status: 400 });
  });

  it('approves the exact contract total, locks the BOQ, and pins only editable schedules', async () => {
    const harness = makeHarness();
    const checksum = harness.state.version.checksum;
    const result = await approveAndLockDraftBOQ(PROJECT_ID, ACTOR_ID, {
      versionId: VERSION_ID,
      expectedChecksum: checksum,
    }, harness.client);

    expect(result).toEqual({ success: true, checksum, boqTotal: '20.00' });
    expect(harness.state.version).toMatchObject({
      status: 'APPROVED',
      approvedBy: ACTOR_ID,
      lockedById: ACTOR_ID,
      checksum,
    });
    expect(harness.state.project.boqLocked).toBe(true);
    expect(harness.state.items[0].status).toBe('APPROVED');
    expect(harness.state.schedules[0]).toMatchObject({
      lockedBOQVersionId: VERSION_ID,
      lockedBOQChecksum: checksum,
      rowVersion: 5,
    });
    expect(harness.state.audits).toHaveLength(1);
  });

  it('rejects an already locked project without modifying its draft version', async () => {
    const harness = makeHarness({ boqLocked: true });
    await expect(approveAndLockDraftBOQ(PROJECT_ID, ACTOR_ID, {
      versionId: VERSION_ID,
      expectedChecksum: harness.state.version.checksum,
    }, harness.client)).rejects.toMatchObject({ code: 'BOQ_ALREADY_LOCKED', status: 409 });
    expect(harness.state.version.status).toBe('DRAFT');
  });
});
