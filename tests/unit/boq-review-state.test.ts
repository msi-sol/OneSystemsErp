import {
  assertBOQReviewReady,
  createBOQReviewDocument,
  getBOQSectionIdentityByItemId,
  parseBOQReviewDocument,
  type BOQFinding,
} from '@/lib/boq/review-state';

const finding = (overrides: Partial<BOQFinding> = {}): BOQFinding => ({
  id: 'finding-1', code: 'DUPLICATE_ITEM_CODE', field: 'itemCode', itemId: 'line-a', rowNumber: 4,
  message: 'Review duplicate code.', severity: 'BLOCKING', status: 'OPEN', reason: null, evidence: {}, decidedBy: null, decidedAt: null,
  ...overrides,
});

function document(findings: BOQFinding[] = []) {
  return createBOQReviewDocument({
    projectId: 'project-a', versionId: 'version-a', uploadId: 'upload-a', fileName: 'boq.xlsx', fileHash: 'hash',
    selectedSheet: 'BOQ', mapping: {}, breakdownMapping: {}, rows: [], findings,
    sectionIdentityByItemId: {
      'line-a': { id: 'extracted-section-1', name: 'Earthworks', order: 1 },
      'line-b': { id: 'extracted-section-3', name: 'Earthworks', order: 3 },
    },
  });
}

describe('BOQ review state readiness and section identity', () => {
  it('blocks readiness while a blocking finding is open and allows an evidenced set-aside', () => {
    const review = document([finding()]);
    expect(() => assertBOQReviewReady(review)).toThrow('BOQ_REVIEW_FINDINGS_OPEN');

    review.findings[0] = finding({ status: 'SET_ASIDE', reason: 'Verified against signed addendum.' });
    expect(() => assertBOQReviewReady(review)).not.toThrow();
  });

  it('requires a reason for set-aside findings and preserves repeated-name section identities', () => {
    const review = document([finding({ severity: 'ATTENTION', status: 'SET_ASIDE', reason: null })]);
    expect(() => assertBOQReviewReady(review)).toThrow('BOQ_SET_ASIDE_REASON_REQUIRED');

    review.findings[0].reason = 'Excluded by the signed scope note.';
    expect(() => assertBOQReviewReady(review)).not.toThrow();
    expect(getBOQSectionIdentityByItemId(review)['line-a']).toMatchObject({ id: 'extracted-section-1', name: 'Earthworks' });
    expect(getBOQSectionIdentityByItemId(review)['line-b']).toMatchObject({ id: 'extracted-section-3', name: 'Earthworks' });
    expect(getBOQSectionIdentityByItemId(review)['line-a'].id).not.toBe(getBOQSectionIdentityByItemId(review)['line-b'].id);
  });

  it('reads older review documents without section mapping as an empty map', () => {
    const current = document();
    const legacyJson = JSON.stringify(current, (key, value) => key === 'sectionIdentityByItemId' ? undefined : value);
    const parsed = parseBOQReviewDocument(legacyJson, 'project-a', 'version-a');
    expect(parsed).not.toBeNull();
    expect(getBOQSectionIdentityByItemId(parsed!)).toEqual({});
  });

  it('reads legacy corrected-reading conflicts without requiring the newer choice metadata', () => {
    const current = document();
    current.readingHistory.push({
      id: 'reading-old', sourceUploadId: 'upload-a', fileName: 'boq.xlsx', fileHash: 'hash', selectedSheet: 'BOQ',
      mapping: {}, breakdownMapping: {}, rows: [],
      conflicts: [{ itemId: 'line-a', field: 'quantity', currentValue: '4', correctedValue: '5' }],
      comparison: [], appliedAt: null, createdAt: '2026-11-05T00:00:00.000Z',
    });
    const parsed = parseBOQReviewDocument(JSON.stringify(current), 'project-a', 'version-a');
    expect(parsed?.readingHistory[0]?.conflicts?.[0]).toMatchObject({ itemId: 'line-a', field: 'quantity', currentValue: '4', correctedValue: '5' });
    expect(parsed?.readingHistory[0]?.conflicts?.[0]?.decision).toBeUndefined();
  });

  it('marks legacy canonical snapshots without manufacturing an original workbook read', () => {
    const legacy = createBOQReviewDocument({
      projectId: 'project-a', versionId: 'legacy-v1', uploadId: null, fileName: null, fileHash: null, selectedSheet: null,
      mapping: {}, breakdownMapping: {}, rows: [], provenance: 'LEGACY_CANONICAL_SNAPSHOT',
    });
    expect(legacy.source).toMatchObject({ provenance: 'LEGACY_CANONICAL_SNAPSHOT', firstReadAvailable: false, uploadId: null, originalRows: [], currentRows: [] });
  });

  it('does not let superseded findings block the current reading', () => {
    const review = document([finding({ invalidatedAt: new Date().toISOString(), invalidatedBy: 'user-a', invalidationReason: 'Superseded by a later reading.' })]);
    expect(() => assertBOQReviewReady(review)).not.toThrow();
  });
});
