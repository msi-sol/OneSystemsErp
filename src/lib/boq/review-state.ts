import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type BOQFindingDecision = 'CONFIRMED' | 'CORRECTED' | 'SET_ASIDE' | 'DEFERRED';
export type BOQFinding = {
  id: string;
  code: string;
  field: string;
  itemId: string | null;
  rowNumber: number | null;
  message: string;
  severity: 'BLOCKING' | 'ATTENTION';
  status: 'OPEN' | BOQFindingDecision;
  invalidatedAt?: string | null;
  invalidatedBy?: string | null;
  invalidationReason?: string | null;
  reason: string | null;
  evidence: Record<string, unknown>;
  decidedBy: string | null;
  decidedAt: string | null;
};

export type BOQSourceRow = {
  sourceRowNumber: number;
  section: string;
  sectionSourceKey?: string;
  sectionOrder?: number;
  sectionStartRow?: number | null;
  itemId?: string | null;
  sourceUnitCost?: string | null;
  rateDerived?: boolean;
  quantityDefaulted?: boolean;
  unitDefaulted?: boolean;
  itemCodeSynthesized?: boolean;
  itemCode: string;
  description: string;
  unit: string;
  quantity: string;
  unitCost: string;
  amount: string;
  breakdown: Record<string, string | null>;
};

export type BOQReviewDocument = {
  schemaVersion: 1;
  projectId: string;
  versionId: string;
  source: {
    uploadId: string | null;
    fileName: string | null;
    fileHash: string | null;
    selectedSheet: string | null;
    provenance?: 'WORKBOOK' | 'LEGACY_CANONICAL_SNAPSHOT';
    firstReadAvailable?: boolean;
    currentRows?: BOQSourceRow[];
    currentReadingId?: string | null;
    firstReadAt?: string;
    firstMapping?: Record<string, number | null>;
    firstBreakdownMapping?: Record<string, number | null>;
    mapping: Record<string, number | null>;
    breakdownMapping: Record<string, number | null>;
    originalRows: BOQSourceRow[];
  };
  /** Canonical BOQ item id -> unique source section occurrence. The name is a display label; id is the grouping identity. */
  sectionIdentityByItemId: Record<string, { id: string; name: string; order: number }>;
  findings: BOQFinding[];
  revisions: Array<{
    id: string;
    itemId: string;
    actorId: string;
    reason: string;
    before: Record<string, unknown>;
    after: Record<string, unknown> | null;
    action: 'LINE_UPDATED' | 'LINE_ADDED' | 'LINE_REMOVED' | 'READING_APPLIED';
    createdAt: string;
    changedFields?: string[];
  }>;
  readingHistory: Array<{
    id: string;
    sourceUploadId: string | null;
    fileName: string;
    fileHash: string;
    selectedSheet: string;
    mapping: Record<string, number | null>;
    breakdownMapping: Record<string, number | null>;
    rows: BOQSourceRow[];
    conflicts?: Array<{
      itemId: string;
      field: string;
      currentValue: string;
      correctedValue: string | null;
      /** Optional on older saved readings; records the reviewer choice for this field conflict. */
      decision?: 'KEEP_CURRENT' | 'USE_READING';
      decisionReason?: string;
      decidedBy?: string;
      decidedAt?: string;
    }>;
    reason?: string;
    comparison: Array<{ itemId: string | null; oldRow: number | null; newRow: number | null; kind: 'MATCHED' | 'CHANGED' | 'ADDED' | 'REMOVED' }>;
    appliedAt: string | null;
    createdAt: string;
  }>;
  correctedSources: Array<{
    versionId: string;
    uploadId: string;
    fileName: string;
    fileHash: string;
    selectedSheet: string;
    mapping: Record<string, number | null>;
    breakdownMapping: Record<string, number | null>;
    rows: BOQSourceRow[];
    sectionIdentityBySourceRow?: Record<string, { id: string; name: string; order: number }>;
    assessment: Array<{ oldRow: number | null; newRow: number | null; oldItemCode: string | null; newItemCode: string | null; kind: 'MATCHED' | 'CHANGED' | 'ADDED' | 'REMOVED' | 'POSSIBLE_MATCH'; oldItemId?: string | null }>;
    identityDecisions: Record<string, { decision: 'SAME_ITEM' | 'NEW_ITEM' | 'SET_ASIDE'; reason: string }>;
    carryForward: Record<string, 'CARRIED' | 'REVIEW_AGAIN' | 'SET_ASIDE'>;
    carryAcceptance?: Record<string, { accepted: boolean; reason: string; at: string; actorId: string }>;
    basisChecksum?: string;
    sourceFindings?: BOQFinding[];
    carryPlans?: Record<string, { applyFields: Record<string, string>; conflicts: string[]; decisions: BOQFinding[]; available: boolean }>;
    status: 'ASSESSMENT_REQUIRED' | 'READY_TO_ADOPT' | 'ADOPTED' | 'REJECTED';
    createdAt: string;
    adoptedAt: string | null;
  }>;
  contract: { verified: boolean; verifiedBy: string | null; verifiedAt: string | null; verificationReason: string | null };
  setAsideAcknowledgement?: { actorId: string; reason: string; at: string } | null;
  finalApproval?: { actorId: string; at: string; checksum: string; note?: string } | null;
  history: Array<{ action: string; actorId: string; reason: string | null; at: string; before: unknown; after: unknown }>;
};

export function createBOQReviewDocument(input: {
  projectId: string;
  versionId: string;
  uploadId: string | null;
  fileName: string | null;
  fileHash: string | null;
  selectedSheet: string | null;
  mapping: Record<string, number | null>;
  breakdownMapping: Record<string, number | null>;
  rows: BOQSourceRow[];
  sectionIdentityByItemId?: Record<string, { id: string; name: string; order: number }>;
  findings?: BOQFinding[];
  provenance?: 'WORKBOOK' | 'LEGACY_CANONICAL_SNAPSHOT';
}): BOQReviewDocument {
  return {
    schemaVersion: 1,
    projectId: input.projectId,
    versionId: input.versionId,
    source: {
      uploadId: input.uploadId,
      fileName: input.fileName,
      fileHash: input.fileHash,
      selectedSheet: input.selectedSheet,
      provenance: input.provenance ?? 'WORKBOOK',
      firstReadAvailable: input.provenance !== 'LEGACY_CANONICAL_SNAPSHOT',
      currentRows: input.rows.map(row => ({ ...row, breakdown: { ...row.breakdown } })),
      currentReadingId: null,
      firstReadAt: new Date().toISOString(),
      firstMapping: input.mapping,
      firstBreakdownMapping: input.breakdownMapping,
      mapping: input.mapping,
      breakdownMapping: input.breakdownMapping,
      originalRows: input.rows.map(row => ({ ...row, breakdown: { ...row.breakdown } })),
    },
    sectionIdentityByItemId: input.sectionIdentityByItemId ?? {},
    findings: input.findings ?? [],
    revisions: [],
    readingHistory: [],
    correctedSources: [],
    contract: { verified: false, verifiedBy: null, verifiedAt: null, verificationReason: null },
    history: [],
  };
}

export function parseBOQReviewDocument(raw: string | null | undefined, projectId: string, versionId: string): BOQReviewDocument | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<BOQReviewDocument>;
    if (value.schemaVersion !== 1 || value.projectId !== projectId || value.versionId !== versionId || !value.source || !Array.isArray(value.source.originalRows)) return null;
    const sectionIdentityByItemId: BOQReviewDocument['sectionIdentityByItemId'] = {};
    if (value.sectionIdentityByItemId && typeof value.sectionIdentityByItemId === 'object' && !Array.isArray(value.sectionIdentityByItemId)) {
      for (const [itemId, identity] of Object.entries(value.sectionIdentityByItemId)) {
        if (!identity || typeof identity !== 'object') continue;
        const section = identity as { id?: unknown; name?: unknown; order?: unknown };
        if (typeof section.id === 'string' && section.id && typeof section.name === 'string' && section.name.trim()
          && typeof section.order === 'number' && Number.isFinite(section.order)) {
          sectionIdentityByItemId[itemId] = { id: section.id, name: section.name, order: section.order };
        }
      }
    }
    return {
      ...value,
      findings: Array.isArray(value.findings) ? value.findings : [],
      sectionIdentityByItemId,
      revisions: Array.isArray(value.revisions) ? value.revisions : [],
      readingHistory: Array.isArray(value.readingHistory) ? value.readingHistory : [],
      correctedSources: Array.isArray(value.correctedSources) ? value.correctedSources : [],
      source: { ...value.source, currentRows: Array.isArray(value.source.currentRows) ? value.source.currentRows : value.source.originalRows,
        firstMapping: value.source.firstMapping ?? value.source.mapping, firstBreakdownMapping: value.source.firstBreakdownMapping ?? value.source.breakdownMapping,
        provenance: value.source.provenance ?? 'WORKBOOK', firstReadAvailable: value.source.firstReadAvailable ?? true, currentReadingId: value.source.currentReadingId ?? null,
        firstReadAt: value.source.firstReadAt ?? '' },
      contract: value.contract ?? { verified: false, verifiedBy: null, verifiedAt: null, verificationReason: null },
      setAsideAcknowledgement: value.setAsideAcknowledgement ?? null,
      finalApproval: value.finalApproval ?? null,
      history: Array.isArray(value.history) ? value.history : [],
    } as BOQReviewDocument;
  } catch {
    return null;
  }
}

export function getBOQSectionIdentityByItemId(document: BOQReviewDocument): BOQReviewDocument['sectionIdentityByItemId'] {
  return document.sectionIdentityByItemId ?? {};
}

export function manualBOQSectionIdentity(name: string, order: number): { id: string; name: string; order: number } {
  const normalized = name.trim().normalize('NFKC').toLocaleLowerCase();
  return { id: `manual:${encodeURIComponent(normalized)}`, name: name.trim(), order };
}

export async function getBOQReviewDocument(projectId: string, versionId: string): Promise<{ document: BOQReviewDocument; rowVersion: number } | null> {
  const row = await prisma.bOQReviewState.findFirst({ where: { projectId, versionId } });
  if (!row) return null;
  const document = parseBOQReviewDocument(row.dataJson, projectId, versionId);
  return document ? { document, rowVersion: row.rowVersion } : null;
}

export function assertBOQReviewReady(document: BOQReviewDocument): void {
  const currentFindings = document.findings.filter(finding => !finding.invalidatedAt);
  const blocking = currentFindings.filter(finding => finding.status === 'OPEN');
  const undecidedSetAside = currentFindings.filter(finding => finding.status === 'SET_ASIDE' && !finding.reason?.trim());
  if (blocking.length) throw new Error('BOQ_REVIEW_FINDINGS_OPEN');
  if (undecidedSetAside.length) throw new Error('BOQ_SET_ASIDE_REASON_REQUIRED');
}

export function reviewDocumentJson(document: BOQReviewDocument): string {
  return JSON.stringify(document);
}

export function jsonNumber(value: number | string | Prisma.Decimal): string {
  return new Prisma.Decimal(String(value)).toString();
}
