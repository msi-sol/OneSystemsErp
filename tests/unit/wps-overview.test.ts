import { packageAllowanceStatus, WPS_STEPS, wpsReconciliation, wpsStepStatus } from '@/lib/scheduling/wps-overview';

const check = (key: string, passed: boolean) => ({ key, label: `Check ${key}`, passed });

describe('Work-package steps', () => {
  it('covers every readiness check exactly once', () => {
    const keys = WPS_STEPS.flatMap(step => step.checks);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(['acyclic', 'constraints', 'dates', 'direct_cost', 'locations', 'resource_review', 'resources', 'scope_checks', 'scope_present', 'sequence', 'weights', 'windows'].sort());
  });

  it('marks a step done only when its own checks pass', () => {
    const status = wpsStepStatus([check('dates', false), check('locations', true), check('scope_checks', true)], 3);
    expect(status.find(step => step.key === 'sequence')).toMatchObject({ failing: 1, done: false, firstGap: 'Check dates' });
    expect(status.find(step => step.key === 'locations')).toMatchObject({ failing: 0, done: true });
    expect(status.find(step => step.key === 'packages')?.done).toBe(true);
    expect(wpsStepStatus([], 0).find(step => step.key === 'packages')?.done).toBe(false);
  });
});

describe('Package total vs BOQ total', () => {
  it('reconciles to the centavo', () => {
    expect(wpsReconciliation('1250000.00', '1250000')).toMatchObject({ reconciles: true, difference: 0 });
    expect(wpsReconciliation(1250000, '1249999.99')).toMatchObject({ reconciles: false, difference: -0.01 });
    expect(wpsReconciliation(1000, null)).toMatchObject({ reconciles: false, packageTotal: null });
  });
});

describe('Allowances and DUPA by package', () => {
  it('sums values and allowances and reads the DUPA standing', () => {
    const rows = packageAllowanceStatus({
      activities: [{ id: 'a', activityCode: 'WP-01', name: 'Earthworks' }, { id: 'b', activityCode: 'WP-02', name: 'Concrete' }],
      allocations: [{ activityId: 'a', allocatedAmount: '100000' }, { activityId: 'b', allocatedAmount: '50000' }],
      resources: [{ activityId: 'a', amount: '60000', isSystemSuggested: true }, { activityId: 'b', amount: '50000' }],
      uploads: [{ activityId: 'b', appliedAt: '2026-11-01T00:00:00Z' }],
    });
    expect(rows[0]).toMatchObject({ value: 100000, allowance: 60000, suggestedRows: 1, dupa: 'none', allowanceWithinValue: true });
    expect(rows[1]).toMatchObject({ value: 50000, allowance: 50000, dupa: 'applied', allowanceWithinValue: false });
  });
});
