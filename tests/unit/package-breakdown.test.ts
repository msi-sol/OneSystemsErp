import {
  buildBreakdownResources,
  PackageBreakdownError,
  resourceFingerprint,
  type PackageBreakdownUpload,
} from '@/lib/scheduling/package-breakdown';
import type { WorkspaceItem, WorkspaceMapping } from '@/lib/boq/workspace-types';
import { readWorkPackagePlanDetails, WORK_PACKAGE_DETAILS_KIND } from '@/lib/scheduling/work-package-details-types';

function item(overrides: Partial<WorkspaceItem> = {}): WorkspaceItem {
  return {
    sourceRowNumber: 12,
    section: 'Concrete works',
    sectionSourceKey: 'source:heading:4',
    sectionOrder: 2,
    sectionStartRow: 4,
    quantityDefaulted: false,
    unitDefaulted: false,
    itemCodeSynthesized: false,
    sourceUnitCost: 12.5,
    rateDerived: false,
    itemCode: 'C-12',
    description: 'Ready-mix concrete',
    unit: 'm3',
    quantity: 2,
    unitCost: 12.5,
    amount: 25,
    ...overrides,
  };
}

describe('package breakdown resource mapping', () => {
  it('maps each workbook component to its selected package resource category without scaling quantities', () => {
    const rows = [
      item({ sourceRowNumber: 12, quantity: 2, unitCost: 12.5, sourceUnitCost: 12.5, amount: 25 }),
      item({ sourceRowNumber: 13, itemCode: 'L-13', description: 'Formwork labor', unit: 'hr', quantity: 3, unitCost: 7.25, sourceUnitCost: 7.25, amount: 21.75 }),
    ];

    expect(buildBreakdownResources(rows, { '12': 'MATERIAL', '13': 'LABOR' })).toEqual([
      { kind: 'MATERIAL', description: 'Ready-mix concrete', unit: 'm3', quantity: '2', unitCost: '12.50', amount: '25.00', sourceRowNumber: 12 },
      { kind: 'LABOR', description: 'Formwork labor', unit: 'hr', quantity: '3', unitCost: '7.25', amount: '21.75', sourceRowNumber: 13 },
    ]);
  });

  it('uses the source stated rate and rejects rows whose package quantity, rate and amount do not reconcile', () => {
    const statedRateDiffers = item({ quantity: 2, sourceUnitCost: 10, unitCost: 12.5, amount: 25 });
    expect(() => buildBreakdownResources([statedRateDiffers], { '12': 'MATERIAL' }))
      .toThrow(/quantity × unit rate must match the amount/);
    expect(() => buildBreakdownResources([item({ amount: 25.01 })], { '12': 'MATERIAL' }))
      .toThrow(PackageBreakdownError);
  });

  it('requires an explicit valid category for each row and rejects selections outside the upload', () => {
    expect(() => buildBreakdownResources([item()], {})).toThrow(/category for row 12/);
    expect(() => buildBreakdownResources([item()], { '12': 'OTHER' })).toThrow(/category for row 12/);
    expect(() => buildBreakdownResources([item()], { '12': 'MATERIAL', '99': 'LABOR' })).toThrow(/outside this breakdown/);
  });

  it('rejects rows with assumed quantity or unit until their source values are corrected', () => {
    expect(() => buildBreakdownResources([item({ quantityDefaulted: true })], { '12': 'MATERIAL' }))
      .toThrow(/explicit quantity and unit/);
    expect(() => buildBreakdownResources([item({ unitDefaulted: true })], { '12': 'MATERIAL' }))
      .toThrow(/explicit quantity and unit/);
  });

  it('allows cent reconciliation after normal rounding and fingerprints normalized duplicate components', () => {
    const rounded = item({ quantity: 3.33, sourceUnitCost: 0.01, unitCost: 0.01, amount: 0.03 });
    expect(buildBreakdownResources([rounded], { '12': 'EQUIPMENT' })[0]).toMatchObject({ amount: '0.03', unitCost: '0.01' });
    const one = { kind: 'MATERIAL', description: '  Rebar  ', unit: 'KG', quantity: '1.00', unitCost: '2.50' };
    const duplicate = { kind: 'MATERIAL', description: 'rebar', unit: 'kg', quantity: '1', unitCost: '2.5' };
    expect(resourceFingerprint(one)).toBe(resourceFingerprint(duplicate));
    expect(resourceFingerprint({ ...duplicate, kind: 'ALLOWANCE' })).not.toBe(resourceFingerprint(one));
  });

  it('preserves explicit zero-cost reference rows under the existing nonnegative resource rule', () => {
    expect(buildBreakdownResources([item({ quantity: 0, amount: 0 })], { '12': 'MATERIAL' })[0])
      .toMatchObject({ quantity: '0', amount: '0.00' });
  });

  it('rejects negative and nonfinite package quantities', () => {
    for (const quantity of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => buildBreakdownResources([item({ quantity })], { '12': 'MATERIAL' }))
        .toThrow(PackageBreakdownError);
    }
  });
});

describe('package breakdown plan metadata', () => {
  const mapping: WorkspaceMapping = { headerRow: 1, itemCode: 1, description: 2, unit: 3, quantity: 4, unitCost: 5, amount: 6 };
  const upload: PackageBreakdownUpload = {
    id: 'upload-1', activityId: 'package-1', fileName: 'package-dupa.xlsx', fileHash: 'a'.repeat(64),
    storagePath: 'project-id/hash.xlsx', sheetName: 'DUPA', mapping, rows: [item()], uploadedAt: '2026-11-05T00:00:00.000Z',
    uploadedById: 'user-1', originScheduleId: 'schedule-1', appliedAt: null, appliedById: null,
    resourceIds: [], categories: {}, reason: null,
  };

  it('retains original workbook evidence, row provenance and source rates when reading metadata', () => {
    const document = {
      kind: WORK_PACKAGE_DETAILS_KIND,
      legacyNote: 'pre-existing note',
      locations: [], constraints: [], resources: [], allocationLocations: {},
      breakdownUploads: [{ ...upload, rows: [{ ...item(), sourceUnitCost: 9.75, unitCost: 10, rateDerived: true }] }],
    };
    const storedJson = JSON.stringify(document);
    const details = readWorkPackagePlanDetails(storedJson);

    expect(details.legacyNote).toBe('pre-existing note');
    expect(details.breakdownUploads?.[0]).toMatchObject({
      id: 'upload-1', activityId: 'package-1', fileHash: 'a'.repeat(64), storagePath: 'project-id/hash.xlsx',
      originScheduleId: 'schedule-1', sheetName: 'DUPA', appliedAt: null, resourceIds: [],
    });
    expect(details.breakdownUploads?.[0].rows[0]).toMatchObject({
      sourceRowNumber: 12, sectionSourceKey: 'source:heading:4', sectionOrder: 2, sectionStartRow: 4,
      sourceUnitCost: 9.75, unitCost: 10, rateDerived: true, quantityDefaulted: false, unitDefaulted: false,
    });
    expect(storedJson).toContain('package-dupa.xlsx');
  });

  it('keeps legacy description text readable and accepts older workspace documents without breakdownUploads', () => {
    expect(readWorkPackagePlanDetails('legacy schedule description')).toMatchObject({
      kind: WORK_PACKAGE_DETAILS_KIND,
      legacyNote: 'legacy schedule description',
      locations: [], constraints: [], resources: [], allocationLocations: {},
    });
    const oldDocument = JSON.stringify({
      kind: WORK_PACKAGE_DETAILS_KIND, locations: [], constraints: [], resources: [], allocationLocations: {},
    });
    expect(readWorkPackagePlanDetails(oldDocument).breakdownUploads).toEqual([]);
  });

  it('fails closed on malformed preserved breakdown metadata', () => {
    const malformed = JSON.stringify({
      kind: WORK_PACKAGE_DETAILS_KIND, locations: [], constraints: [], resources: [], allocationLocations: {},
      breakdownUploads: [{ ...upload, fileHash: 'not-a-sha256' }],
    });
    expect(() => readWorkPackagePlanDetails(malformed)).toThrow(/Invalid package breakdown evidence/);
  });
});
