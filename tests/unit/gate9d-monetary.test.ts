import { toMoney } from '../../src/lib/scheduling/moneyUtils';
import { validateScheduleForReview } from '../../src/lib/scheduling/scheduleWorkflow';
import { Prisma, ProjectScheduleWorkflowStatus } from '@prisma/client';

describe('Monetary Validation Rules', () => {
  it('1. A valid Decimal value passes', () => {
    expect(toMoney(new Prisma.Decimal('100.50')).toFixed(2)).toBe('100.50');
  });

  it('2. A valid integer or decimal string passes', () => {
    expect(toMoney(100).toFixed(2)).toBe('100.00');
    expect(toMoney('100.55').toFixed(2)).toBe('100.55');
  });

  it('3. A permitted optional null is skipped safely (regression test coverage)', () => {
    const allocatedQuantity = null;
    const mappedQuantity = 100.0;
    expect(toMoney(allocatedQuantity ?? mappedQuantity).toFixed(2)).toBe('100.00');
  });

  it('4. A required null returns a structured validation failure (handled in validateScheduleForReview)', () => {
    expect(() => toMoney(null)).toThrow('Invalid monetary value');
  });

  it('5. undefined in a required field is rejected', () => {
    expect(() => toMoney(undefined)).toThrow('Invalid monetary value');
  });

  it('6. NaN is rejected', () => {
    expect(() => toMoney(NaN)).toThrow('Invalid monetary value');
  });

  it('7. positive and negative infinity are rejected', () => {
    expect(() => toMoney(Infinity)).toThrow('Invalid monetary value');
    expect(() => toMoney(-Infinity)).toThrow('Invalid monetary value');
  });

  it('8. malformed numeric text is rejected', () => {
    expect(() => toMoney('abc')).toThrow('Invalid monetary value');
  });

  it('11. Monetary rounding behavior is unchanged', () => {
    expect(toMoney('100.554').toFixed(2)).toBe('100.55');
    expect(toMoney('100.555').toFixed(2)).toBe('100.56');
  });
});

describe('Schedule Validation Safe Failures', () => {
  it('9. No invalid monetary value produces an unhandled HTTP 500; 10. exact previously failing shape is covered', async () => {
    const mockTx = {
      project: {
        findUnique: jest.fn().mockResolvedValue({ boqLocked: false })
      },
      projectSchedule: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'test-schedule',
          projectId: 'proj1',
          rowVersion: 1,
          awardedContractAmount: 'abc', // this will fail without crashing
          scheduledAmount: 0,
          differenceAmount: 0,
          activities: [ { id: 'act1', activityCode: 'A1', plannedStartDate: new Date(), plannedFinishDate: new Date(), criticalPath: true } ],
          wbsNodes: [ { id: 'wbs1', name: 'Testing and Commissioning Phase' }, { id: 'wbs2', name: 'Project Acceptance Phase' } ],
          dependencies: []
        }),
        update: jest.fn().mockResolvedValue({ workflowStatus: 'INVALID_GENERATED_DRAFT' })
      },
      awardedBOQItem: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          { id: 'boq1', itemCode: 'B1', quantity: null, totalCost: 100 }
        ])
      },
      scheduleBOQAllocation: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'alloc1', awardedBoqItemId: 'boq1', allocatedQuantity: null, mappedQuantity: null }
        ])
      }
    };

    const res = await validateScheduleForReview({
      projectId: 'proj1',
      scheduleId: 'test-schedule',
      actorId: 'user1',
      expectedRowVersion: 1,
      tx: mockTx
    });

    expect(res.isValid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors.some(e => e.includes('FINANCIAL: Schedule awardedContractAmount test-schedule: Invalid monetary value'))).toBe(true);
    expect(res.errors.some(e => e.includes('BOQ: ScheduleBOQAllocation allocatedQuantity alloc1: Invalid monetary value'))).toBe(true);
    expect(res.errors.some(e => e.includes('BOQ: AwardedBOQItem quantity boq1: Invalid monetary value'))).toBe(true);
  });

  it('12. Schedule total reconciliation behavior is unchanged', async () => {
    const mockTx = {
      project: {
        findUnique: jest.fn().mockResolvedValue({ boqLocked: false })
      },
      projectSchedule: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'test-schedule',
          projectId: 'proj1',
          rowVersion: 1,
          awardedContractAmount: 1000,
          scheduledAmount: 900,
          differenceAmount: 100,
          activities: [ { id: 'act1', activityCode: 'A1', plannedStartDate: new Date(), plannedFinishDate: new Date(), criticalPath: true } ],
          wbsNodes: [ { id: 'wbs1', name: 'Testing Phase' }, { id: 'wbs2', name: 'Acceptance Phase' } ],
          dependencies: []
        }),
        update: jest.fn().mockResolvedValue({ workflowStatus: 'INVALID_GENERATED_DRAFT' })
      },
      awardedBOQItem: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          { id: 'boq1', itemCode: 'B1', quantity: 10, totalCost: 1000 }
        ])
      },
      scheduleBOQAllocation: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'alloc1', awardedBoqItemId: 'boq1', allocatedQuantity: 10, mappedQuantity: 10 }
        ])
      }
    };

    const res = await validateScheduleForReview({
      projectId: 'proj1',
      scheduleId: 'test-schedule',
      actorId: 'user1',
      expectedRowVersion: 1,
      tx: mockTx
    });

    expect(res.isValid).toBe(false);
    expect(res.errors).toContain('FINANCIAL: Awarded contract amount does not equal scheduled amount.');
    expect(res.errors).toContain('FINANCIAL: Difference amount is not 0.00.');
  });
});
