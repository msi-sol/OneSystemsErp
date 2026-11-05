import { canMutateSiteLog, effectiveWorkEntries, measuredTotals, periodsOverlap, remainingAllocation, revisionExecutedFloor, validatePeriod, weeklyTargetCheck } from '@/lib/scheduling/work-package-execution-rules';
import type { ExecutionSiteLog } from '@/lib/scheduling/work-package-execution-types';

describe('work-package execution rules', () => {
  it('bounds commitment windows and treats touching dates as overlapping', () => {
    expect(validatePeriod('2026-11-02', '2026-11-08')).toBe(true);
    expect(validatePeriod('2026-11-02', '2026-12-02')).toBe(true);
    expect(validatePeriod('2026-11-02', '2026-12-03')).toBe(false);
    expect(validatePeriod('2026-02-30', '2026-03-01')).toBe(false);
    expect(periodsOverlap({ periodStart: '2026-11-02', periodEnd: '2026-11-08' }, { periodStart: '2026-11-08', periodEnd: '2026-11-14' })).toBe(true);
  });

  it('keeps logs from a superseded schedule immutable', () => {
    expect(canMutateSiteLog('schedule-current', 'schedule-current', true)).toBe(true);
    expect(canMutateSiteLog('schedule-old', 'schedule-current', false)).toBe(false);
    expect(canMutateSiteLog('schedule-current', 'schedule-current', false)).toBe(false);
  });

  it('reserves remaining located allocation after actual and other overlapping commitments', () => {
    expect(remainingAllocation(100, 20, 30)).toBe(50);
    expect(weeklyTargetCheck({ quantity: 50, allocated: 100, measured: 20, overlappingTargets: 30, locationId: 'loc-1' })).toEqual({ ok: true, remaining: 50 });
    expect(weeklyTargetCheck({ quantity: 50.1, allocated: 100, measured: 20, overlappingTargets: 30, locationId: 'loc-1' })).toMatchObject({ ok: false, reason: 'QUANTITY_EXCEEDS_REMAINING' });
    expect(weeklyTargetCheck({ quantity: 10, allocated: 100, measured: 0, overlappingTargets: 0, locationId: null })).toMatchObject({ ok: false, reason: 'UNLOCATED_SCOPE' });
    expect(weeklyTargetCheck({ quantity: 1, allocated: null, measured: 0, overlappingTargets: 0, locationId: 'loc-1' })).toMatchObject({ ok: false, reason: 'NO_STATED_QUANTITY' });
  });

  it('sums recorded quantities by exact allocation identity', () => {
    const log: ExecutionSiteLog = {
      id: 'log', activityId: 'activity', baselineScheduleId: 'baseline', sourcePackageId: 'stable-package', logDate: '2026-11-05',
      workDescription: 'Work', weather: null, equipmentHours: null, blockedAcknowledged: false, createdAt: '2026-11-05T00:00:00.000Z', createdById: 'user',
      laborEntries: [], materialEntries: [],
      workEntries: [
        { id: 'one', allocationId: 'alloc-a', sourcePackageId: 'stable-package', boqItemId: 'boq-a', locationId: 'loc-a', quantity: '3', unit: 'm3', recordedAt: '2026-11-05T01:00:00.000Z', recordedById: 'user', correctionOfId: null, correctionReason: null },
        { id: 'two', allocationId: 'alloc-b', sourcePackageId: 'stable-package', boqItemId: 'boq-a', locationId: 'loc-b', quantity: '2', unit: 'm3', recordedAt: '2026-11-05T01:00:00.000Z', recordedById: 'user', correctionOfId: null, correctionReason: null },
      ],
    };
    expect(measuredTotals([log]).get('alloc-a')).toBe(3);
    expect(measuredTotals([log]).get('alloc-b')).toBe(2);
  });

  it('uses the latest append-only correction instead of double-counting the original measurement', () => {
    const log: ExecutionSiteLog = {
      id: 'log', activityId: 'activity', baselineScheduleId: 'baseline', sourcePackageId: 'stable-package', logDate: '2026-11-05',
      workDescription: 'Work', weather: null, equipmentHours: null, blockedAcknowledged: false, createdAt: '2026-11-05T00:00:00.000Z', createdById: 'user',
      laborEntries: [], materialEntries: [],
      workEntries: [
        { id: 'one', allocationId: 'alloc-a', sourcePackageId: 'stable-package', boqItemId: 'boq-a', locationId: 'loc-a', quantity: '8', unit: 'm3', recordedAt: '2026-11-05T01:00:00.000Z', recordedById: 'user', correctionOfId: null, correctionReason: null },
        { id: 'two', allocationId: 'alloc-a', sourcePackageId: 'stable-package', boqItemId: 'boq-a', locationId: 'loc-a', quantity: '6', unit: 'm3', recordedAt: '2026-11-05T02:00:00.000Z', recordedById: 'user', correctionOfId: 'one', correctionReason: 'Corrected field sheet' },
      ],
    };
    expect(effectiveWorkEntries(log).map(entry => entry.quantity)).toEqual(['6']);
    expect(measuredTotals([log]).get('alloc-a')).toBe(6);
  });

  it('carries executed scope by durable package/item/location identity across revision ids', () => {
    const log: ExecutionSiteLog = {
      id: 'log', activityId: 'old-activity', sourcePackageId: 'stable-pkg-1', logDate: '2026-11-05',
      workDescription: 'Work', weather: null, equipmentHours: null, blockedAcknowledged: false, createdAt: '2026-11-05T00:00:00.000Z', createdById: 'user',
      laborEntries: [], materialEntries: [],
      workEntries: [{ id: 'entry', allocationId: 'old-allocation', sourcePackageId: 'stable-pkg-1', boqItemId: 'boq-1', locationId: 'loc-1', quantity: '4', unit: 'm3', recordedAt: '2026-11-05T01:00:00.000Z', recordedById: 'user', correctionOfId: null, correctionReason: null }],
    };
    const identity = { sourcePackageId: 'stable-pkg-1', boqItemId: 'boq-1', locationId: 'loc-1' };
    expect(revisionExecutedFloor({ siteLogs: [log], oldAllocationIdentity: { 'old-allocation': identity }, nextAllocations: [{ ...identity, allocatedQuantity: 3 }] })).toEqual([{ key: 'stable-pkg-1|boq-1|loc-1', executed: 4, planned: 3 }]);
    expect(revisionExecutedFloor({ siteLogs: [log], oldAllocationIdentity: { 'old-allocation': identity }, nextAllocations: [{ ...identity, allocatedQuantity: 4 }] })).toEqual([]);
  });
});
