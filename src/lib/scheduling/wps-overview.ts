/**
 * How the Work Packages module is split into steps, and the plain facts each
 * step shows. Pure: the page, the next-step card and the tests share it.
 */

export type WpsStepKey = 'packages' | 'scope' | 'sequence' | 'locations' | 'resources' | 'review';

export const WPS_STEPS: { key: WpsStepKey; view: string; label: string; checks: string[] }[] = [
  { key: 'packages', view: 'schedule', label: 'Packages', checks: [] },
  { key: 'scope', view: 'scope', label: 'Scope', checks: ['scope_checks', 'scope_present'] },
  { key: 'sequence', view: 'sequence', label: 'Dates & sequence', checks: ['dates', 'windows', 'weights', 'acyclic', 'sequence'] },
  { key: 'locations', view: 'locations', label: 'Locations & constraints', checks: ['locations', 'constraints'] },
  { key: 'resources', view: 'resources', label: 'Resources & DUPA', checks: ['resources', 'resource_review', 'direct_cost'] },
  { key: 'review', view: 'review', label: 'Review & approve', checks: [] },
];

/** Older links still work: each legacy view opens the step that now holds it. */
export const WPS_VIEW_ALIASES: Record<string, string> = { constraints: 'locations' };

export const WPS_SITE_VIEWS: { view: string; label: string }[] = [
  { view: 'look-ahead', label: 'Look-ahead' },
  { view: 'weekly', label: 'Weekly commitments' },
  { view: 'site-logs', label: 'Daily site logs' },
  { view: 'operational-constraints', label: 'Site constraints' },
];

export type WpsCheck = { key: string; label: string; passed: boolean };

export function wpsStepStatus(checks: WpsCheck[], packageCount: number) {
  return WPS_STEPS.map(step => {
    const failing = checks.filter(check => step.checks.includes(check.key) && !check.passed);
    const done = step.key === 'packages' ? packageCount > 0 : step.key === 'review' ? false : packageCount > 0 && failing.length === 0;
    return { ...step, failing: failing.length, firstGap: failing[0]?.label ?? null, done };
  });
}

const cents = (value: string | number | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

/** Package values must add up to the approved BOQ total. */
export function wpsReconciliation(boqTotal: string | number, packageTotal: string | number | null) {
  if (packageTotal === null) return { boqTotal: cents(boqTotal) / 100, packageTotal: null, difference: null, reconciles: false };
  const difference = cents(packageTotal) - cents(boqTotal);
  return { boqTotal: cents(boqTotal) / 100, packageTotal: cents(packageTotal) / 100, difference: difference / 100, reconciles: difference === 0 };
}

export type DupaStanding = 'none' | 'evidence' | 'applied';

/** Per package: its BOQ value, its allowances, and whether a DUPA backs them. */
export function packageAllowanceStatus(input: {
  activities: { id: string; activityCode: string | null; name: string }[];
  allocations: { activityId: string; allocatedAmount: string | null }[];
  resources: { activityId: string | null; amount: string; isSystemSuggested?: boolean }[];
  uploads: { activityId: string; appliedAt: string | null }[];
}) {
  return input.activities.map(activity => {
    const value = input.allocations.filter(row => row.activityId === activity.id).reduce((sum, row) => sum + cents(row.allocatedAmount), 0);
    const own = input.resources.filter(row => row.activityId === activity.id);
    const allowance = own.reduce((sum, row) => sum + cents(row.amount), 0);
    const uploads = input.uploads.filter(row => row.activityId === activity.id);
    const dupa: DupaStanding = uploads.some(row => row.appliedAt) ? 'applied' : uploads.length ? 'evidence' : 'none';
    return {
      id: activity.id, code: activity.activityCode, name: activity.name,
      value: value / 100, allowance: allowance / 100, suggestedRows: own.filter(row => row.isSystemSuggested).length,
      dupa, allowanceWithinValue: allowance < value || value === 0,
    };
  });
}
