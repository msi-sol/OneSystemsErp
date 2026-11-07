import { deriveBoqLifecycle, deriveIntakeLifecycle, deriveWpsLifecycle, type BoqLifecycleInput, type WpsLifecycleInput } from '@/lib/planning/lifecycle';

const boq = (overrides: Partial<BoqLifecycleInput> = {}): BoqLifecycleInput => ({
  projectId: 'p1', hasVersion: true, draft: true, approved: false, reviewPrepared: true, openFindings: 0,
  contractVerified: true, totalsMatch: true, reviewCurrent: false, reviewStale: false,
  canEdit: true, canEngineerReview: true, canApprove: true, ...overrides,
});
const allChecks = (passed = true) => ['scope_checks', 'scope_present', 'weights', 'resources', 'resource_review', 'direct_cost', 'dates', 'windows', 'acyclic', 'sequence', 'locations', 'constraints']
  .map(key => ({ key, label: `Check ${key}`, passed }));
const wps = (overrides: Partial<WpsLifecycleInput> = {}): WpsLifecycleInput => ({
  projectId: 'p1', approvedBOQ: true, hasPlan: true, adopted: true, packageCount: 3, checks: allChecks(true),
  reviewCurrent: false, reviewStale: false, baselineApproved: false, hasOpenRevision: false,
  canEdit: true, canReview: true, canApprove: true, ...overrides,
});
const states = (lifecycle: { steps: { key: string; state: string }[] }) => Object.fromEntries(lifecycle.steps.map(step => [step.key, step.state]));

describe('BOQ lifecycle', () => {
  it('does not send a project without a BOQ to the new-project workspace', () => {
    const result = deriveBoqLifecycle(boq({ hasVersion: false, draft: false, reviewPrepared: false, contractVerified: false }));
    expect(result.phase).toBe(2);
    expect(result.next.title).toBe('This project has no BOQ');
    expect(result.next.cta).toBeUndefined();
    expect(states(result)).toMatchObject({ source: 'current', prepare: 'locked', approve: 'locked' });
  });

  it('tells a viewer who acts instead of offering a button', () => {
    const result = deriveBoqLifecycle(boq({ openFindings: 2, canEngineerReview: false }));
    expect(result.next.title).toBe('2 reading findings to resolve');
    expect(result.next.cta).toBeUndefined();
    expect(result.next.waitingOn).toMatch(/Project Engineer/);
  });

  it('orders findings before contract, reconciliation, review and approval', () => {
    expect(deriveBoqLifecycle(boq({ openFindings: 1, contractVerified: false })).next.title).toBe('Next: resolve 1 reading finding');
    expect(deriveBoqLifecycle(boq({ contractVerified: false, totalsMatch: false })).next.title).toBe('Next: verify the signed contract value');
    expect(deriveBoqLifecycle(boq({ totalsMatch: false })).next.cta?.href).toBe('/projects/p1/boq?view=items');
    expect(deriveBoqLifecycle(boq({ reviewStale: true })).next.detail).toMatch(/changed after the last review/);
    expect(deriveBoqLifecycle(boq({ reviewCurrent: true })).next.title).toBe('Next: approve and lock the BOQ');
  });

  it('marks every step done and points to work packages once approved', () => {
    const result = deriveBoqLifecycle(boq({ approved: true, draft: false, reviewCurrent: true }));
    expect(result.phase).toBe(3);
    expect(result.steps.every(step => step.state === 'done')).toBe(true);
    expect(result.next.cta?.href).toBe('/projects/p1/work-packages');
  });
});

describe('Work-package lifecycle', () => {
  it('keeps the path visible before the BOQ is approved', () => {
    const result = deriveWpsLifecycle(wps({ approvedBOQ: false, hasPlan: false, packageCount: 0, checks: [] }));
    expect(result.next.cta?.href).toBe('/projects/p1/boq');
    expect(result.phase).toBe(2);
    expect(result.steps.every(step => step.state === 'locked')).toBe(true);
  });

  it('does not link to the same page for in-page buttons', () => {
    expect(deriveWpsLifecycle(wps({ hasPlan: false, packageCount: 0, checks: [] })).next.cta).toBeUndefined();
    expect(deriveWpsLifecycle(wps({ packageCount: 0, checks: [] })).next.cta).toBeUndefined();
  });

  it('routes to the first failing preparation group', () => {
    const checks = allChecks(true).map(check => check.key === 'dates' || check.key === 'resources' ? { ...check, passed: false } : check);
    const result = deriveWpsLifecycle(wps({ checks }));
    expect(result.next.cta?.href).toBe('/projects/p1/work-packages?view=sequence');
    expect(result.next.detail).toMatch(/^1 schedule check still needs attention\./);
    // Steps report their own checks: locations already pass, resources do not.
    expect(states(result)).toMatchObject({ scope: 'done', schedule: 'current', locations: 'done', resources: 'locked', review: 'locked' });
  });

  it('sends missing locations to the locations step', () => {
    const checks = allChecks(true).map(check => check.key === 'locations' ? { ...check, passed: false } : check);
    expect(deriveWpsLifecycle(wps({ checks })).next.cta?.href).toBe('/projects/p1/work-packages?view=locations');
  });

  it('asks for review, then approval, then shows the approved baseline', () => {
    expect(deriveWpsLifecycle(wps()).next.title).toBe('Next: record the engineering review');
    expect(deriveWpsLifecycle(wps({ reviewCurrent: true, canApprove: false })).next.waitingOn).toMatch(/Project Manager/);
    const approved = deriveWpsLifecycle(wps({ baselineApproved: true }));
    expect(approved.complete).toBe(true);
    expect(approved.steps.every(step => step.state === 'done')).toBe(true);
  });
});

describe('Workspace intake lifecycle (new projects only)', () => {
  const intake = { fileChosen: false, analyzed: false, blockingIssues: 0, saved: false, canAnalyze: true };
  it('starts with choosing the file', () => {
    const result = deriveIntakeLifecycle(intake);
    expect(result.next.title).toBe('Next: choose the BOQ file');
    expect(result.steps.map(step => step.key)).toEqual(['file', 'analyze', 'check', 'save']);
    expect(result.steps[0].state).toBe('current');
  });
  it('reports blocking issues after analysis and links to the created project', () => {
    expect(deriveIntakeLifecycle({ ...intake, fileChosen: true, analyzed: true, blockingIssues: 2 }).next.title).toBe('Next: resolve 2 blocking issues');
    const saved = deriveIntakeLifecycle({ ...intake, saved: true, savedProjectId: 'p9' });
    expect(saved.phase).toBe(2);
    expect(saved.next.cta?.href).toBe('/projects/p9/boq');
  });
  it('tells a view-only account who uploads', () => {
    expect(deriveIntakeLifecycle({ ...intake, canAnalyze: false }).next.waitingOn).toMatch(/project editor/);
  });
});
